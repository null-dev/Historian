const localStorage = browser.storage.local; // All access to localStorage should be done through event queue

// Save history to localStorage
const STORAGE_HIST_ID_PREFIX = 'hist_';
function histIdToStorageId(id) {
    return STORAGE_HIST_ID_PREFIX + id;
}

async function onVisited(historyItem) {
    let histItem = {
        lastVisitTime: historyItem.lastVisitTime,
        title: historyItem.title,
        typedCount: historyItem.typedCount,
        visitCount: historyItem.visitCount,
        url: historyItem.url
    };
    let histId = histIdToStorageId(historyItem.id);
    queueEvent(async () => {
        let curValue = (await localStorage.get(histId))[histId];
        if(curValue == null) {
            curValue = {
                title: histItem.title,
                url: histItem.url,
                visits: []
            };
        } else if(histItem.title.length > 0) {
            curValue.title = histItem.title;
        }
        curValue.visits.push({
            time: histItem.lastVisitTime,
            typedCount: histItem.typedCount,
            visitCount: histItem.visitCount
        });
        await localStorage.set({
            [histId]: curValue
        });
    });
}

async function onTitleChanged(historyItem) {
    let histId = histIdToStorageId(historyItem.id);
    const newTitle = historyItem.title;
    queueEvent(async () => {
        let curValue = (await localStorage.get(histId))[histId];
        if(curValue != null) {
            curValue.title = newTitle;
            await localStorage.set({
                [histId]: curValue
            });
        }
    });
}

// Event loop to sync local storage
let opQueue = [];
let processingEventLoop = false;
async function bumpEventLoop() {
    if(processingEventLoop) return;
    const nextOp = opQueue.pop();
    if(nextOp == null) {
        return;
    }
    processingEventLoop = true;
    try {
        await nextOp();
    } catch(e) {
        console.error('Error processing event:', e);
    }
    processingEventLoop = false;
    await bumpEventLoop();
}

async function queueEvent(op) {
    const result = new Promise((fulfill, reject) => {
        opQueue.push(async () => {
            try {
                fulfill(await op());
            } catch(e) {
                reject(e);
            }
        });
    });
    bumpEventLoop();
    return await result;
}

// Batch move history from localStorage
const ALARM_FLUSH_VISITS = 'flush_visits';
function handleAlarm(alarmInfo) {
    if(alarmInfo.name === ALARM_FLUSH_VISITS) {
        flushVisits();
    }
}

const CSV_QUOTE_ESCAPE_REGEX = /"/g;
function toCSV(values) {
    // Setup fields
    let fieldSet = new Set();
    for(const v of values)
        for(const key of Object.keys(v))
            fieldSet.add(key);

    fieldSet = Array.from(fieldSet);

    let csv = "";
    for(let i = 0; i < fieldSet.length; i++) {
        const field = fieldSet[i];
        csv += field;
        if(i < fieldSet.length - 1)
            csv += ',';
    }
    csv += "\n";
    for(const v of values) {
        for(let i = 0; i < fieldSet.length; i++) {
            const field = fieldSet[i];
            const fieldValue = v[field];
            if(fieldValue != null) {
                csv += `"${fieldValue.toString().replace(CSV_QUOTE_ESCAPE_REGEX, '""')}"`;
            }
            if(i < fieldSet.length - 1)
                csv += ',';
        }
        csv += "\n";
    }
    return csv;
}

async function flushVisits() {
    await queueEvent(async () => {
        const result = await localStorage.get();
        const {
            option_db_host: dbHost,
            option_machine_id: machineId,
            option_profile_id: profileId
        } = result;
        const entries = Object.entries(result).filter(([key]) => key.startsWith(STORAGE_HIST_ID_PREFIX));

        let skippedCnt = 0;
        let rows = [];
        let toRemove = [];
        let toUpdate = {};
        for(const [key, value] of entries) {
            let skipped = [];
            for(let i = 0; i < value.visits.length; i++) {
                const visit = value.visits[i];
                // Only flush entries older than 30mins
                if(visit.time < Date.now() - 30 * 60 * 1000) {
                    const obj = {
                        host_id: machineId,
                        profile_id: profileId,
                        visit_time: visit.time * 1000,
                        browser_id: key.substring(STORAGE_HIST_ID_PREFIX.length),
                        title: value.title,
                        url: value.url,
                        browser_typed_count: visit.typedCount,
                        browser_visited_count: visit.visitCount
                    };
                    rows.push(obj);
                } else {
                    skipped.push(visit);
                    skippedCnt++;
                }
            }

            if(skipped.length > 0) {
                // Some visits skipped, update entry in buffer to only include skipped visits
                toUpdate[key] = {
                    ...value,
                    visits: skipped
                };
            } else {
                // All visits processed, clear entire entry from buffer
                toRemove.push(key);
            }
        }

        // Stop if nothing to send to remote DB
        if(rows.length === 0) {
            console.debug(`Nothing to import (${skippedCnt} skipped), aborting!`);
            return;
        }

        const csv = toCSV(rows);
        const csvBlob = new Blob([csv], {type:"text/csv"});
        const form = new FormData();
        form.append("data", csvBlob, "data.csv");

        try {
            const resp = await fetch(dbHost + '?atomicity=0&durable=false&fmt=json&forceHeader=true&name=historian&overwrite=false&skipLev=true', {
                method: 'POST',
                body: form
            });
            const respBody = await resp.json();
            if(respBody.rowsImported !== rows.length) {
                throw new Error(`Imported rows (${respBody.rowsImported}) does not match sent rows: ${rows.length}!`);
            }
        } catch(e) {
            console.error("Import failed, rolling back changes!", e);
            return;
        }

        // Commit changes
        await localStorage.remove(toRemove);
        await localStorage.set(toUpdate);

        console.debug(`Successfully imported ${rows.length} history entries into remote DB (${skippedCnt} skipped)!`);
    });
}

browser.history.onVisited.addListener(onVisited);
browser.history.onTitleChanged.addListener(onTitleChanged);
browser.alarms.onAlarm.addListener(handleAlarm);

// Flush every 30 mins
browser.alarms.create(ALARM_FLUSH_VISITS, {
    delayInMinutes: 1,
    periodInMinutes: 30
});
