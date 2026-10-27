# GIF Maker (Media → Photo) — release GM1

Turns a short video into an animated GIF, fully on-device. Static files, no build step, works from file://.

## Use
1. Open or drop a video. 2. Trim with the two handles or Start/End boxes (max 15 s; longer ranges are clamped with a warning).
3. Pick width (240/360/480, default 360, aspect kept), FPS (5/10/15, default 10), colours (64/128/256), loop (Forever/Once).
4. Make GIF → progress bar + Cancel → preview with size → Save GIF (`<videoname>-HHMMSS.gif`).

Screens: Make, Settings (theme System/Light/Dark + About). Dark by default. Dots, 75 px wrap-around swipes (left = next),
swipes never start on sliders, inputs, buttons or the video. ←/→ keys also switch.

## Files
- `gifmaker.html/.css` — UI (controls column on the right at ≥700 px, below the video on phones).
- `gifmaker_app.js` — screens, swipes, settings, theme, trim, make pipeline, dialogs/toast, HubNotify for encodes > 5 s.
- `gifmaker_video.js` — `GMVideo.grab()`: seeks a hidden `<video>` per frame and draws to a canvas.
- `gifmaker_encode.js` — `GMEncode.open()`: Web Worker (`gifmaker_worker.js`) or main-thread fallback (Chrome blocks workers on file://).
- `gifmaker_core.js` — shared gifenc wrapper (quantize rgb565 → applyPalette → writeFrame), used by both paths.
- `gifmaker_save.js` — `GMSave.save(blob, name)`, the single save function (download; Hub Drive later).
- `vendor/gifenc.js` — gifenc 1.0.3 (MIT), see `vendor/README.md`.

## Storage
`gifmaker-settings-v1`: `{ theme, width, fps, colors, loop }`. Reads `sites-hub.theme` for System.

## Notes
- One palette per frame (no global palette, no dithering). Size estimate is a rough heuristic.
- Frame grabbing relies on `seeked`; a 4 s per-seek timeout guards browsers that skip it. Safari/iOS seeking can be slow.

## Planned
GM2 photos → GIF (reorder, per-frame delay). GM3 caption, crop, reverse/boomerang.
