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


## VD2

- Several clips on one track. Add more with Add or by dropping files. Each
  block is sized by its kept duration and shows the name plus a small
  thumbnail grabbed on load. Drag a block to reorder, or use the move
  buttons. Split at the playhead (S). Delete clip removes it from the track.
  Each clip keeps its own VD1 cut/keep list; In/Out marks apply to the
  selected clip.
- Preview plays the whole sequence, skipping removed parts. A global time
  display and seek bar cover the joined result.
- Fade between clips: Off, 0.5 s or 1 s, fade through black, drawn at export
  (inside the kept ends, so the sequence length does not change). A fade
  longer than a clip is capped at half that clip's kept duration.
- Export draws each frame to a canvas (`drawImage` + `canvas.captureStream`)
  and mixes audio through one AudioContext and MediaStreamDestination
  (`createMediaElementSource` once per clip element). Still real time, with
  a progress dialog and Cancel. Download is `<first-clip-name>_edited.webm`
  (or `.mp4`).
- Undo / Redo cover add, delete, split, reorder, cut/keep and fade changes.
- Projects: IndexedDB `videoeditor` (stores `files` and `projects`). The
  Projects dialog lists, opens, renames and deletes (with an in-app confirm).
  The current project autosaves. Storage used is shown; a warning appears
  when space is low or a quota error happens.
- RELEASE/title/?v= VD2. Tests: `node --check`, `node tests/vd1.test.cjs`,
  `node tests/vd2.test.cjs` (pure helpers). No Puppeteer, Playwright or jsdom.

### VD2 limits

- Fades are drawn on export, not in the live preview.
- Thumbnails are one frame grabbed at load; some codecs may leave the thumb blank.
- Project files live in this browser's IndexedDB only. Clearing site data
  removes them. Autosave cannot complete if the device is out of space.
- Export still runs in real time and still depends on the browser's recorder
  (Chrome or Edge work more often than Safari). Canvas size is capped at a
  1280 px long side to stay light on a 4 GB Celeron.
