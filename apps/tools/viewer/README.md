# Viewer (apps/tools/viewer/)

One viewer for **pictures and videos** from any Hub drive: Local (this site's private storage),
an added folder, or Google Drive. Files opens it (double click, or right-click **Open with ▸**
→ Viewer) in its own Hub window; picking another file in Files moves the open Viewer to it.

- **‹ ›**, ← →, PageUp / PageDown, a sideways swipe: previous / next picture or video in the
  same folder, sorted like Files (its remembered sort). Home / End: first / last.
- **Pictures:** wheel (around the pointer), pinch, + / − zoom; drag to pan; **Fit** (0),
  **1:1** (1), double click = Fit ↔ 1:1; **⟳** rotate (R).
- **Videos:** the browser's own player; play speed (remembered); −10 s / +10 s (J / L, or ← →
  while the video has focus); K / Space play / pause. The place in each video is remembered
  (newest 60 videos, localStorage `sites-viewer.resume`) and taken up again on open.
- **⛶** full screen (F).
- A format the browser can't show or play says so (e.g. "This browser can't play .mkv videos").
- One object URL at a time; it is released (and the video stopped) on every switch and when the
  window closes.

Link: `index.html#drive=local&path=Photos&file=cat.png` (`shared/fs/fs_ref.js`); a Hub window
session keeps it. An added folder needs "Allow access" in Files after a reload first; Google Drive
needs the sign-in from Files.

Files: `index.html`, `viewer_core.js` (open, list, prev / next), `viewer_image.js` (zoom / pan /
rotate), `viewer_video.js` (speed, skip, resume), `viewer.js` (buttons, keys, life cycle),
`viewer.css`, `viewer_icon.png`. Shared: `shared/fs/filetypes.js` (which app opens what — Open
with), `shared/fs/fs_ref.js`, `shared/fs/fs_drives.js`, `shared/fs/fs_ops.js`, `shared/google/*`.
