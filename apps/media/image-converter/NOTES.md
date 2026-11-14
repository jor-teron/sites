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


## CI3

- Photo info viewer: a pure-JS EXIF parse (`ic_exif.js`) shows camera,
  date and GPS, with a privacy warning when a location is present.
  When saving as JPG you can keep the date, the camera, and/or GPS.
  A minimal EXIF block is written back. Maker notes, lens data, ICC
  and thumbnails are not copied. GPS is off by default.
- Icon set: from the selected photo, an ICO containing PNG entries
  (`ic_ico.js`) plus a zip of 16, 32, 48, 64, 128 and 256 px PNGs.
- SVG is drawn as a bitmap. A GIF uses its first frame. Copy a photo
  as a data URL (Base64), with a fallback textarea if the clipboard
  is blocked.
- iPhone HEIC is not supported; a standing in-app note says so.
- New files: `ic_ico.js`, `tests/ci3.test.cjs`. RELEASE / title /
  `?v=` = CI3.
- Tests: `node --check`, `node tests/ci1.test.cjs`, `ci2`, `ci3`.
  No Puppeteer, Playwright or jsdom.

### CI3 limits

- Selective EXIF keep only works for JPEG output, and only for date,
  camera make/model and GPS. Adding EXIF after a target-size search
  can make the file a few hundred bytes over the target.
- Icon ICO files use PNG entries (Windows Vista and later).
- Clipboard write needs a secure context; otherwise the data URL is
  shown in a dialog to copy by hand.

## Legacy
IC3: icon redrawn plain without tile; old icon kept as *_icon_before_IC3.png
