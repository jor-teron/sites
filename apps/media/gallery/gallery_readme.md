# Gallery (Media → Photo) — release GA1

Browse photos from a folder or files on this device. Static, no build step, works from file:// (folder memory needs http/https).

## Use
- **Open folder**: `showDirectoryPicker` where supported (Chromium desktop/Android), reads subfolders up to 4 deep;
  otherwise `<input webkitdirectory multiple>` (Firefox, Safari, iOS). **Files** opens single/multiple images. Drag-and-drop files
  (or a folder, Chromium) onto the Gallery screen.
- Grid: lazy thumbnails (IntersectionObserver, `createImageBitmap(file, {resizeWidth:256})`, Image+canvas fallback), sizes Small/Medium/Large,
  sort Newest/Oldest (file lastModified)/Name, group by month (date sorts only).
- Viewer: full screen; swipe 75 px or ‹ › / ←/→ between photos; pinch, double-tap (double-click), wheel or +/- to zoom (1–8×), drag to pan when zoomed;
  Esc closes. Info: name, n/N, size, dimensions, date. Download (via `GASave.save`) and Share (`navigator.share` with files, when available).
- Screens: Gallery, Settings (theme System/Light/Dark following `sites-hub.theme`, thumbnail size, sort, group, forget folder, About).
  Dark default, dots, 75 px wrap-around swipes (left = next), never while the viewer is open.

## Files
- `gallery.html/.css`, `gallery_app.js` (screens, swipes, settings, open/drop, remembered folder)
- `gallery_grid.js` (`GAGrid`: list, sort, month groups, lazy thumbs) · `gallery_viewer.js` (`GAViewer`)
- `gallery_store.js` (`GAStore`: settings + IndexedDB `gallery-v1`/`kv`/`folder` handle) · `gallery_save.js` (`GASave.save(blob, name)`)

## Storage
- `gallery-settings-v1`: `{ theme, cols:'s'|'m'|'l', sort:'date-desc'|'date-asc'|'name', group:'1'|'0' }`
- IndexedDB `gallery-v1` → last folder handle (File System Access browsers only). On load, if permission is still granted the folder
  reopens; otherwise a **↻ folder** button asks again (needs a click). Nothing else (no photos/thumbnails) is stored.

## Notes
- "Date" = file lastModified, not EXIF capture date. HEIC shows only where the browser decodes it (Safari).
- Thumbnails are decoded once per session; very large folders (thousands) are fine to browse but initial listing reads every file entry.
