# Historian

Historian is a Firefox extension that periodically sends your browsing history to a remote database for long term storage. Currently [QuestDB](https://questdb.io/) is the only database supported.

### Installation

1. Install Historian
2. Create the required database tables by running the SQL in `ddl.sql` in your QuestDB instance.
3. Go the addon preferences:
   1. Set the database host to be the import URL of your QuestDB instance. This is usually just the URL of your QuestDB instance with `/imp` added to the end.
   2. Choose a machine ID. Historian associates each history entry with the machine ID which is helpful if you run multiple instances of Historian.
   3. Choose a profile ID. Historian associates each history entry with the profile ID which is helpful if you run multiple instances of Historian.
4. Historian will only send history entries created after it is installed. Historian will also wait until a history entry is 30 mins old before sending it (technical limitation). Therefore you should not expect entries to show up in the database right away.

### How does Historian work if I use Firefox sync?

If you have Firefox sync enabled you must only install Historian on a single device. Historian will archive both the history on device it is installed on as well as the history on all synced devices. **Multiple installations of Historian will result in duplicate data being sent to the database, therefore it is highly discouraged!** Note that Historian will report all history entries as coming from the machine Historian is installed on. This is because Historian cannot determine which history entries were produced by which synced device.

