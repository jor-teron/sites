# Screen Recorder (SC1)

Media app. Records the screen, a window or a tab with `getDisplayMedia` + `MediaRecorder`.

- Files: `screenrec.html`, `screenrec.css`, `screenrec_app.js` (UI, swipes, settings, timer), `screenrec_capture.js` (`SCCapture` — capture, mic, WebAudio mix, mime pick), `screenrec_save.js` (`SCSave.save(blob, name)` — the only save path).
- Audio: mic and/or system/tab audio; when both, mixed via `AudioContext` → `MediaStreamDestination`.
- Flow: 3-2-1 countdown → Pause/Resume/Stop (timer + live size) → preview → Save/Discard. Ending sharing from the browser bar stops too.
- Output: `screen-YYYYMMDD-HHMMSS.mp4` when MediaRecorder supports MP4, else `.webm`.
- Settings key `screenrec-settings-v1`: `quality` 720/1080/native, `fps` 15/30/60, `theme` system/light/dark (system follows `sites-hub.theme`), `mic`, `sys`.
- Saved notice via `window.top.HubNotify.notice` if present, else a toast.
- Phones: no `getDisplayMedia` → friendly "computers only" message.
- Release: SC1 (assets `?v=SC1`).
