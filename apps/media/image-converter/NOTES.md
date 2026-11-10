# Image Converter — notes

## CI1

- New Media app at `apps/media/image-converter/` (Photo section, after
  GIF Maker). Storage key `image-converter-v1` `{theme, format, resize, …}`.
  Auto follows Hub `sites-hub.theme` / `sites-hub.themeAuto` live.
- Add photos with the file picker, a folder picker, or drag and drop.
  Output: JPG, PNG, WebP, and AVIF only when `canvas.toBlob` really
  produces `image/avif`.
- Resize by longest side, by percent, or to an exact size. Aspect ratio
  is kept by default. Optional "don't enlarge".
- Quality slider, or a target size such as under 100 KB (binary search
  on quality). Location and camera data are stripped by the canvas
  re-encode. Orientation is honoured (`from-image` or EXIF fallback).
- The list shows size before and after, plus the total saved. Download
  one file or all as a store-only zip. Rename pattern `{name}_{n}`.
- One photo at a time. Bitmaps, canvases and object URLs are released
  after each file. In-app dialogs only. No CDN.
- Tests: `node --check` on every JS file, `node tests/ci1.test.cjs`.
  No Puppeteer, Playwright or jsdom.

### Limits

- iPhone HEIC photos are not opened (that needs a heavy library).
- AVIF depends on the browser actually encoding it.
- A target size cannot always be met (a large PNG or a tiny budget).
  The row then shows "still over target".
- The Media page tile comes from `apps/media/media-apps.csv`. The Hub
  menu catalog needs a Main Builder catalog regen.


## CI2

- One-tap presets: WhatsApp (JPG, longest 1600), Instagram (JPG, 1080,
  1:1 crop), Email (JPG, 1280, under 200 KB), Indian passport photo
  (413×531, 7:9 crop, under 40 KB, white background) and signature
  (300×80, under 30 KB). Users can save and delete their own presets
  in `image-converter-v1.customPresets`.
- Crop to 1:1, 4:5, 16:9 or passport (7:9), with a draggable box on the
  selected photo. Other photos get a centred crop of the same ratio.
  Rotate 90° left/right and flip H/V on the selected photo.
- Text or logo watermark, with position, opacity, size and colour.
- Background colour fills transparent pixels when the output is JPG
  (default white). Also used for AVIF.
- New files: `ic_presets.js`, `ic_edit.js`, `tests/ci2.test.cjs`.
  RELEASE / title / `?v=` = CI2.
- Tests: `node --check`, `node tests/ci1.test.cjs`, `node tests/ci2.test.cjs`.
  No Puppeteer, Playwright or jsdom.
