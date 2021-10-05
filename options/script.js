const localStorage = browser.storage.local;

function optIdToStorageId(id) {
    return 'option_' + id;
}

const optElements = Array.from(document.getElementsByClassName('user-opt'));
const mappedOpts = optElements.map(it => ({element: it, id: optIdToStorageId(it.id)}));

document.getElementById('save_btn').onclick = async () => {
    const toSet = {};
    for(const {element, id} of mappedOpts) {
        if(element.value.length > 0)
            toSet[id] = element.value;
    }
    await localStorage.set(toSet);
    alert('Options saved!');
};

async function initValues() {
    const result = await localStorage.get(mappedOpts.map(it => it.id));
    for(const {element, id} of mappedOpts) {
        const eVal = result[id];
        if(eVal != null) element.value = eVal;
    }
}

initValues();
