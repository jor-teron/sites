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
