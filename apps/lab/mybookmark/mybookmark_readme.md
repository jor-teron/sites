# MyBookmark

A bookmark viewer first and a manager second. It replaces Bookmark Manager (`apps/lab/bookmark-manager/` now redirects here). Plain JavaScript; nothing leaves the device.

## 1. Files
- `index.html`: redirects to `mybookmark.html`.
- `mybookmark.html` / `mybookmark.css`: the page. Light and dark come from `html.dark`.
- `mybookmark_config.js`: storage names, the old app's key, limits and defaults.
- `mybookmark_store.js`: IndexedDB (database `mybookmark`, stores `nodes` and `meta`). This is the only storage file, so it can be swapped later (e.g. for Hub Drive).
- `mybookmark_netscape.js`: reads and writes Netscape bookmark HTML.
- `mybookmark_dialog.js`: in-app dialogs. The app uses no window.prompt, confirm or alert.
- `mybookmark_data.js`: the tree in memory, every change, import, export and migration.
- `mybookmark_view.js`: draws the folder tree, breadcrumb, cards and list, favicons and search highlight.
- `mybookmark_logic.js`: start-up, theme, keys, import and export, and the manager.
- `mybookmark_icon.png`: hub icon.

## 2. Viewer
- **Folder tree** (left): folders open and close, and each shows how many bookmarks it holds, including subfolders. On a phone (≤ 720 px) the tree is a drawer opened with ☰.
- **Right pane**: a breadcrumb, then subfolders followed by bookmarks, shown as cards or a list (▦ / ☰).
- **Search** (`/`): matches the title, the address or any folder on the path, across all bookmarks, and highlights the match. Esc clears it.
- **Site filter** and **sort** (name, date added with newest first, or site).
- **Opening**: a click opens the bookmark in a new tab with `rel="noopener noreferrer"`.
- **Keys**: the arrow keys move between items, Enter opens a folder, and Backspace goes up one folder.
- **Favicon**: the icon embedded by the import (`ICON` data URI) if there is one, else the site's own `/favicon.ico`, else a coloured letter tile. No third-party favicon service is used.

## 3. Import / export
- **Import**: use Import or drop a `.html` file anywhere on the page. Chrome, Edge, Firefox and Safari exports all work.
  - Nested folders, `ADD_DATE` and `ICON` data URIs are kept.
  - You choose where it goes: into a new folder "Imported YYYY-MM-DD", or merged into All bookmarks, where folders with the same name are joined.
  - You choose what happens to bookmarks you already have: skip them, or import them marked "duplicate". Addresses count as the same when they differ only by `#hash`, a trailing `/` or host letter case.
- **Export**: writes nested Netscape HTML, either all bookmarks or the open folder. The file imports back into MyBookmark and into browsers.
- **Old data**: on first open, data from Bookmark Manager (localStorage `bookmarkManagerData`) is copied once into the folder "From Bookmark Manager". Empty folders are skipped and the old data is not deleted.

## 4. Manager (Edit)
- **+ Bookmark** and **+ Folder**. **Edit** and **Rename** buttons appear on each item.
- **Rename folder** and **Delete folder** act on the open folder.
- **Selecting**: click, Shift+click or Ctrl+click; Space and Select all also work.
- **Moving**: **Move to…** or drag onto a folder in the tree or a folder card. A folder can't be moved into itself.
- **Delete** asks for confirmation (red button, Cancel focused). Deleting a folder also deletes everything inside it.

## 5. Theme
- `localStorage['sites-hub.theme']` (`dark` / `light`) is the setting the Hub uses. If it isn't set, the system setting is used.
- Changes apply live through the `storage` event.

## 6. Limits
- One device only (IndexedDB); there is no sync yet.
- A search shows at most 2000 results at once.
- Favicons need the site to be online. Sites without `/favicon.ico` get a letter tile.
- Import reads `.html` exports only. Separators and Firefox tags and keywords are ignored.
- There is no undo for deletes.
