# Video Editor — notes

## VD1

- New Media app at `apps/media/video-editor/` (Video section, after Screen Recorder).
  Name is "Video Editor" until Jor picks one. Storage key `video-editor-v1`
  `{theme: auto|light|dark}`. Auto follows Hub `sites-hub.theme` /
  `sites-hub.themeAuto` live (storage, hub-prefs, matchMedia, focus).
- Open a video with the file picker or drag and drop. Preview: play/pause,
  frame step (~1/30 s), current time, seek from the timeline playhead.
- Timeline shows the source duration, In/Out dual handles (48 px touch
  target), and hatched marks on removed ranges. Play skips the cuts.
- Cut selection removes the In–Out range from the edit list. Keep selection
  keeps only the overlap of that range with what is still left. Undo / Redo
  (buttons, Ctrl+Z / Ctrl+Y). Keys: Space, Left, Right, I, O, Delete.
- Export plays the kept parts through `captureStream` + `MediaRecorder`
  (WebM vp9/vp8 + opus, or MP4 when the browser supports it), with audio,
  in real time. In-app progress dialog with Cancel. Download
  `<original-name>_edited.webm` (or `.mp4`). No CDN libraries, no ffmpeg.wasm.
- In-app dialogs only. Full-viewport layout (VT2 approach): column on
  phones, side panel from 900 px landscape, compact under 420 px height.
- Tests: `node --check` on every JS file, `node tests/vd1.test.cjs` (pure
  helpers only). No Puppeteer, Playwright or jsdom.

### Limits

- Export runs in real time (a 2-minute result takes about 2 minutes).
- Frame-accurate cuts are not guaranteed: the recorder captures whatever
  the browser paints. Some codecs or browsers (Safari in particular) cannot
  capture the stream; Chrome or Edge work more often.
- Frame step is 1/30 s. The file's real frame rate is not read from metadata.
- The Media page tile comes from `apps/media/media-apps.csv`. The Hub menu
  catalog needs a Team 1 / Main Builder `hub_appindex_gen.py --catalog-only`
  run before the new app shows in the Hub flyout.
