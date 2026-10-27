# GIF Maker (Media → Photo) — release GM2

Turns a short video into an animated GIF, fully on-device. Static files, no build step, works from file://.

## Use
Source switch on the Make screen: **Video** (GM1) or **Photos** (GM2).

### Video
1. Open or drop a video. 2. Trim with the two handles or Start/End boxes (max 15 s; longer ranges are clamped with a warning).
3. Pick width (240/360/480, default 360, aspect kept), FPS (5/10/15, default 10), colours (64/128/256), loop (Forever/Once).
4. Make GIF → progress bar + Cancel → preview with size → Save GIF (`<videoname>-HHMMSS.gif`).

### Photos (GM2)
Open/drop several images (JPG, PNG, WebP, GIF = first frame); **+ Add** appends more. Thumbnail strip: tap to select,
drag to reorder (mouse: drag at once; touch: long-press 400 ms then drag), ◀ ▶ move the selected frame, × deletes.
Delay per frame (ms, 20–10000) for the selected frame; Default ms (500) applies to new frames, **Apply to all** sets every frame.
Output size = chosen width × first image's aspect. Fit: Black / White (contain on that colour) or Cover (crop).
Saves as `photos-HHMMSS.gif`.

Screens: Make, Settings (theme System/Light/Dark + About). Dark by default. Dots, 75 px wrap-around swipes (left = next),
swipes never start on sliders, inputs, buttons or the video. ←/→ keys also switch.

## Files
- `gifmaker.html/.css` — UI (controls column on the right at ≥700 px, below the video on phones).
- `gifmaker_app.js` — screens, swipes, settings, theme, trim, make pipeline, dialogs/toast, HubNotify for encodes > 5 s.
- `gifmaker_photos.js` — `GMPhotos`: frame list, strip UI and reordering, delays, fit rendering to ImageData.
- `gifmaker_video.js` — `GMVideo.grab()`: seeks a hidden `<video>` per frame and draws to a canvas.
- `gifmaker_encode.js` — `GMEncode.open()`: Web Worker (`gifmaker_worker.js`) or main-thread fallback (Chrome blocks workers on file://).
- `gifmaker_core.js` — shared gifenc wrapper (quantize rgb565 → applyPalette → writeFrame, optional per-frame delay), used by both paths.
- `gifmaker_save.js` — `GMSave.save(blob, name)`, the single save function (download; Hub Drive later).
- `vendor/gifenc.js` — gifenc 1.0.3 (MIT), see `vendor/README.md`.

## Storage
`gifmaker-settings-v1`: `{ theme, width, fps, colors, loop, src:'video'|'photos', delay:500, fit:'black'|'white'|'cover' }`. Reads `sites-hub.theme` for System.

## Notes
- One palette per frame (no global palette, no dithering). Size estimate is a rough heuristic.
- Frame grabbing relies on `seeked`; a 4 s per-seek timeout guards browsers that skip it. Safari/iOS seeking can be slow.

## Planned
GM3 caption, crop, reverse/boomerang.
