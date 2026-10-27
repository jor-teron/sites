# Gallery (Media → Photo) — release GA2

Browse photos and videos from a folder or files on this device. Static, no build step, works from file:// (folder memory needs http/https).

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

## Videos (GA2)
- Loaded alongside photos: mp4, m4v, webm, mov, mkv, ogv, 3gp, avi (or any `video/*` MIME). Playback depends on the browser's codecs
  (mkv/HEVC/avi often won't play outside Chromium/Safari; the thumbnail falls back to a 🎬 icon).
- Grid: lazy frame at ~1 s via a hidden `<video>` + canvas, ▶ mark and duration badge. Filter All / Photos / Videos (bar toggle and Settings).
- Viewer: bottom control bar (seek, ⟲10 / 10⟳, play, speed 0.5–2×, mute, loop, CC, picture-in-picture, fullscreen). Tap = play/pause,
  double-tap left/right half = −/+10 s. Swipe on the picture still moves between items; the control bar is outside the swipe area.
- Keys: Space, ←/→ seek ±10 s while playing (otherwise previous/next), Shift+←/→ or PgUp/PgDn previous/next, F fullscreen, M mute, Esc.
- Subtitles: a same-name `.srt`/`.vtt` in the opened folder/files loads automatically; CC picks one. SRT is converted to a VTT blob.
- Resume: `gallery-resume-v1` = `{ "name|size": seconds }` (max 200), saved every 3 s and on pause/leave; cleared within 5 s of the end.
- Info shows duration and resolution; Download/Share work for videos too. Leaving a video pauses it and saves the position.

## Files
- `gallery.html/.css`, `gallery_app.js` (screens, swipes, settings, open/drop, remembered folder)
- `gallery_grid.js` (`GAGrid`: list, sort, month groups, lazy thumbs) · `gallery_viewer.js` (`GAViewer`)
- `gallery_store.js` (`GAStore`: settings + IndexedDB `gallery-v1`/`kv`/`folder` handle) · `gallery_save.js` (`GASave.save(blob, name)`)

## Storage
- `gallery-settings-v1`: `{ theme, cols:'s'|'m'|'l', sort:'date-desc'|'date-asc'|'name', group:'1'|'0', kind:'all'|'photo'|'video', speed, loop:'1'|'0' }`
- `gallery-resume-v1`: video resume positions (see above)
- IndexedDB `gallery-v1` → last folder handle (File System Access browsers only). On load, if permission is still granted the folder
  reopens; otherwise a **↻ folder** button asks again (needs a click). Nothing else (no photos/thumbnails) is stored.

## Notes
- "Date" = file lastModified, not EXIF capture date. HEIC shows only where the browser decodes it (Safari).
- Thumbnails are decoded once per session; very large folders (thousands) are fine to browse but initial listing reads every file entry.
