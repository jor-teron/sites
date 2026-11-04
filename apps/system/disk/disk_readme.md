# Disk (apps/system/disk/)

System app (R54) that manages the Hub's storage. Browsing files stays in Files (`apps/system/files/`).

- **Drives:** Local, added folders, Google Drive and WebDAV drives, each with its status, and an "Open in Files" link (`../files/#drive=<id>`).
- **WebDAV drives (H133):** "+ Add WebDAV drive" form (Name, URL, User, Password, Show), "Test connection", Edit and Remove (shared dialog confirm). Each row shows the URL · user and a status (Checking… / Connected / Error: …), checked once per load and after each change. Saved in the same list as before (`shared/fs/webdav_accounts.js`, localStorage `hub-webdav-accounts`), so Files, Viewer and phone see the drives. Deep links: `#add-webdav`, `#edit=webdav:<n>` (Files and Settings use them). SFTP stays in Settings › Network drives for now.
- **Folders:** Add folder (Chrome / Edge on a computer), Allow access, Remove from list (files stay; shared dialog confirm).
- **Google Drive:** Connect / Set up / Renew through the shared panel (`shared/google/gdrive_connect.js`), Sign out.
- **Space:** `navigator.storage.estimate()` used vs quota with a bar; persisted status and "Keep my data" (`navigator.storage.persist()`).
- **Size per drive:** "Calculate" walks Local or a folder with access and adds up file sizes. Google Drive is skipped.
- **Clean-up:** clear the thumbnail cache (`shared/fs/thumbs_store.js`, IndexedDB `sites-thumbs`); "Empty Local storage" deletes everything in Local after a danger confirm.
- **Sync:** drive changes go through `FsDrives` (BroadcastChannel `sites-fs`), so Files and the Hub drives pane redraw.

Files: `index.html`, `disk.js`, `disk.css`, `disk_icon.png`. Uses `shared/fs/webdav_fs.js` + `webdav_accounts.js` (H133) besides `fs_drives.js`.
