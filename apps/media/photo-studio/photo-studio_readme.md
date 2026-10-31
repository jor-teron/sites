# Hub Photo Studio (HPS2)

The Hub's bigger photo editor (Media → Photo). Release **HPS1** had exactly Photo Editor v2's
feature set (PE5) under its own name, settings and About. Release **HPS2** adds **layers** (image,
text and shape layers with opacity and blend modes), the **.hps project file** and **.ora export**.
Planned next: selections and masks, retouch, pro adjustments.

Open `photo-studio.html` (or the folder; `index.html` redirects). Works from `file://` too.

## What it does
- Open a photo: picker, drag and drop, or paste. Photos over **about 12 MP** (HPS2, every device)
  are reduced once on open, with a message; the original file is not changed. Open also takes a
  `.hps` project.
- Crop (Free, Original, 1:1, 4:3, 16:9), rotate left / right, flip H / V.
- Resize both ways (`E`): pixels or percent, aspect lock, presets; enlarging up to 4× or 8000 px.
- Adjust (`A`): Brightness, Contrast, Saturation, Warmth, Sharpen (0–100); looks Original, B&W,
  Sepia, Vivid; Reset.
- Non-destructive: every edit is a setting on top of the original; pixels are only rendered when
  you save, print or send. Undo / redo (60 steps).
- Save JPEG / PNG at full size, Print 🖨, Send 📤 over the Hub link. Save project (.hps),
  Export layers (.ora), Open project (.hps) in the same Save menu (HPS2).
- Layers (`L`, HPS2), see below.
- Settings (`,` or the gear): Theme System / Light / Dark (System follows `sites-hub.theme`),
  Ctrl+S format Auto / JPEG / PNG, JPEG quality Smaller 80 / High 92 / Best 98. Keyboard list, About.

## How the reuse works
Photo Studio does **not** copy Photo Editor v2's engine. `photo-studio.html` loads these files in
place from `../photo-editor-v2/`, so a fix there fixes both apps:

| Loaded from `../photo-editor-v2/` | Job |
|---|---|
| `photo-editor-v2.css` | layout, toolbar, dock, dialogs (Studio adds `photo-studio.css` on top) |
| `pe_config.js` | shared tunables (limits, preview, crop, adjust, resize, keys) |
| `pe_state.js`, `pe_transform.js`, `pe_adjust.js`, `pe_view.js`, `pe_crop.js` | edits, history, geometry, colour + sharpen, preview, crop |
| `pe_io.js`, `pe_resize.js`, `pe_input.js`, `pe_print.js`, `pe_send.js`, `pe_ui.js` | open / save, resize, gestures + keys, print, send, toolbar + boot |
| `vendor/jsQR.js` | QR scan for Send |

Studio's own files:

| File | Job |
|---|---|
| `photo-studio.html` | page shell (same element ids the engine expects) + gear button, Settings / About sheet, message box, `#ps-tools` slot |
| `photo-studio.css` | logo, Settings / About sheet, message box, light theme |
| `ps_save.js` | **the one save module** (`PSSave`): `photo-studio-settings-v1` `{theme, format, quality}`, `photo-studio-state-v1` `{adj}` (last Adjust chip). Sets the theme class before first paint |
| `ps_config.js` | loaded right after `pe_config.js`: overrides `app`, `appId: 'photo-studio'`, `release: 'HPS2'`, the 12 MP limits, applies the saved format / quality, `config.studio` (incl. `layers` caps), and the `PE.studio` registration stub |
| `ps_app.js` | Studio layer, loaded last: `PE.ui.notify` (in-app message box), `PE.studio.ask` (in-app confirm / prompt, HPS2), Settings sheet, theme → photo background, Studio keys, `PE.studio` feature slot |
| `ps_zip.js` | HPS2: tiny ZIP writer / reader (`PSZip.write / read / crc32`), store + deflate (`CompressionStream('deflate-raw')`, falls back to store), CRC-checked reads |
| `ps_layers.js` | HPS2: the Layers feature (`PE.layers`): model, drawing, on-canvas handles, panel, text dialog |
| `ps_project.js` | HPS2: `.hps` save / open and `.ora` export (`PE.project`) |

Photo Editor v2 stores nothing in localStorage of its own, and Studio writes only
`photo-studio-*` keys (plus the shared `shared-link-*` keys written by `shared/link` for Send),
so the two never clash.

HPS1 added two small backward-compatible hooks to `../photo-editor-v2/pe_send.js`:
`PE.config.appId` (Hub link "ready" id, default `'photo-editor-v2'`) and `PE.ui.notify` (used
instead of `alert()` when present). Photo Editor v2 sets neither, so it behaves exactly as before.
Studio loads `pe_send.js` (plain link, no version tag).

HPS2 added two more, both backward compatible:
- `pe_view.js`: `PE.view.drawPhoto(ctx, P, crop, m, w, h, a, b)` (default = the old
  `T.drawOriented(...)` call; `buildBase` now draws through it) and `PE.view.rebuild()` (rebuild
  the preview copy).
- `pe_io.js`: Save step 1 draws through `PE.view.drawPhoto` (same arguments as before).

Photo Editor v2 never replaces `drawPhoto`, so it draws exactly as before (PE5 test 46/46).
Studio loads `pe_view.js` / `pe_io.js` and every other engine file straight from the
Photo Editor v2 copy.

## Layers (HPS2)
Open the Layers panel with `L` or the layers button (a strip under the photo in portrait, a column
in landscape; it shares the space with Crop and Adjust, so opening one closes the other).
- The photo is the **Background** layer: always at the bottom, can be hidden or made see-through,
  renamed; not moved or deleted.
- **+ Image** (any image file; also drop or paste an image while the panel is open), **+ Text**
  (dialog: text, font Sans / Serif / Mono / Impact / Casual, size in photo pixels, colour, bold,
  align left / centre / right; double-tap the text, or Edit text…, to change it), **shapes**
  rectangle, ellipse, line (fill colour + on/off, stroke colour, width).
- On the photo: tap a layer to select it, drag to move, a corner handle to scale, the round handle
  to rotate (snaps to 0 / 90 / 180°; Shift = 15° steps). Mouse and touch. Tap empty space to
  deselect; drag empty space pans as before.
- Per layer: eye (visibility), Opacity, Blend (Normal, Multiply, Screen, Overlay, Darken, Lighten,
  Colour dodge, Colour burn, Hard light, Soft light, Difference, Exclusion, Hue, Saturation,
  Colour, Luminosity — the canvas `globalCompositeOperation` modes), Rename, Duplicate, Delete (in-app
  confirm; `Delete` key too), reorder with ▲ ▼ or by dragging the ⋮⋮ grip.
- Everything goes through undo / redo (adding, moving, scaling, rotating, opacity, blend, text,
  colours, order, visibility, names, deleting).

**How the existing tools apply with layers.** Layers are stored in the background photo's own
pixel space (the working copy, before crop / rotate / resize), inside the same edit settings as
everything else:
- **Crop, rotate, flip, resize** work on the whole canvas: the layers stay glued to the same spot of
  the photo and turn, flip and scale with it. Layer parts outside the crop are cut off (and come back
  if the crop is widened again).
- **Adjust and Looks** (brightness … sharpen, B&W, sepia, vivid) apply to the **flattened** image at
  the end: background + layers are composited first, then the colour and sharpen pass runs, both in
  the preview and in Save / Print / Send.

## The .hps project file (version 1)
A `.hps` is a plain ZIP (open it with any unzip tool):

| Entry | What |
|---|---|
| `project.json` | the project (below), deflated |
| `images/background.<ext>` | the original photo file, byte for byte (stored) |
| `images/<src>.<ext>` | the original file of each image layer, byte for byte (stored) |
| `layers/<id>.png` | raster pixels for painted layers (reserved: none in HPS2) |
| `preview.png` | flattened preview, longest side ≤ 256 px |

`project.json`:
```json
{
 "format": "hps", "version": 1, "app": "Hub Photo Studio", "release": "HPS2",
 "name": "beach", "created": "2026-10-29T10:00:00.000Z",
 "canvas": { "w": 4000, "h": 3000, "origW": 4000, "origH": 3000 },
 "output": { "w": 3000, "h": 3000 },
 "edits": { "m": [1,0,0,1], "crop": {"x":500,"y":0,"w":3000,"h":3000}, "adj": {"b":0,"c":0,"s":0,"w":0,"sh":0}, "preset": "none", "k": [1,1] },
 "background": { "name": "Background", "visible": true, "opacity": 1, "src": "images/background.jpg", "type": "image/jpeg", "fileName": "beach.jpg" },
 "images": { "i1": { "path": "images/i1.png", "name": "logo.png", "type": "image/png", "w": 800, "h": 400 } },
 "layers": [
  { "id": "L1", "type": "image", "name": "logo", "visible": true, "opacity": 1, "blend": "source-over", "x": 2000, "y": 600, "w": 800, "h": 400, "scale": 0.5, "rot": 0, "src": "i1" },
  { "id": "L2", "type": "text", "name": "Hello", "visible": true, "opacity": 0.9, "blend": "screen", "x": 2000, "y": 2600, "w": 900, "h": 375, "scale": 1, "rot": 0,
    "text": "Hello", "font": "system-ui, sans-serif", "size": 300, "color": "#ffffff", "bold": true, "align": "center" },
  { "id": "L3", "type": "shape", "shape": "rect", "name": "Rectangle", "visible": true, "opacity": 1, "blend": "multiply", "x": 1000, "y": 1500, "w": 600, "h": 400, "scale": 1, "rot": 0.785,
    "fill": "#3b6fd8", "fillOn": true, "stroke": "#ffffff", "strokeOn": true, "sw": 8 }
 ]
}
```
- `canvas` = the working copy size in pixels (the background photo after the open-time cap);
  `origW / origH` = the file's own size. All layer numbers are in `canvas` pixels.
- `edits`: `m` = 2×2 orientation matrix (rotate / flip), `crop` in canvas pixels, `adj` Adjust values
  (`b` brightness, `c` contrast, `s` saturation, `w` warmth −100..100, `sh` sharpen 0..100), `preset`
  (`none`, `bw`, `sepia`, `vivid`), `k` resize factors along the photo's x / y relative to the crop.
- `layers` bottom → top. Every layer: `x, y` = centre, `w, h` = own size (before `scale`), `rot` in
  radians clockwise, `opacity` 0..1, `blend` = a canvas `globalCompositeOperation` name. A line is a
  shape with `h: 0` drawn along its width. Text `w / h` are recomputed from the font on open.
- `images/` files are never re-encoded; image layers are decoded at their stored `w / h`.
- Open checks `format` and `version` (newer versions get a friendly "made by a newer Photo Studio"
  message), skips unknown layer types, and repairs missing values. Undo history is not saved.

## The .ora export (OpenRaster, for GIMP / Krita / MyPaint)
ZIP with, in this order: `mimetype` (first entry, stored, `image/openraster`), `stack.xml`
(`<image w h>` + one `<layer>` per layer, top first, with `opacity`, `visibility` and
`composite-op` = `svg:src-over`, `svg:multiply`, …), `data/layer<N>.png` + `data/background.png`
(one full-size PNG per layer at `x=0 y=0`), `Thumbnails/thumbnail.png` (≤ 256 px) and
`mergedimage.png` (exactly what Save PNG gives). Each layer PNG already has crop, rotate and resize
applied; Adjust / Looks are applied to each layer on its own, so after GIMP / Krita re-composites
them the result can differ slightly from `mergedimage.png` when Adjust is used with blend modes or
opacity. `.ora` is export only; keep the `.hps` to edit again in Photo Studio.

## Adding heavy features (HPS3+)
One file per feature (e.g. `ps_layers.js`), loaded before or after `ps_app.js`:

```js
PE.studio.feature({ id: 'layers', init(PE) { /* runs once the engine has booted */ } });
PE.studio.addTool({ id: 'layers', title: 'Layers (L)', key: 'l', svg: '<path d="…"/>', onTap(PE) { … } });
```

Tools appear in the toolbar slot `#ps-tools` (before Save), are disabled with no photo
(unless `needsPhoto: false`), and their key works when the engine did not use it. Features that
change the preview or the saved pixels can wrap `PE.view.drawPhoto` (as `ps_layers.js` does) or
add another backward-compatible hook in the release that first needs it.

## Keys
Ctrl+O open, Ctrl+S save, Ctrl+Z / Ctrl+Y undo / redo, C crop (Enter applies), R / Shift+R rotate,
H / V flip, A adjust, E resize, L layers, Delete delete the selected layer (asks first),
+ / - / 0 zoom, `,` settings, Esc deselect / close. In the text dialog Ctrl+Enter adds.

## Light on old laptops
Same engine as Photo Editor v2: the preview is a screen-sized copy (≤ 2.5 MP), sliders only rebuild
that copy, the full photo is rendered once at save in 512-row strips.
HPS2 keeps layers light: at most **10 layers** (background included) and **about 12 MP** for the
photo, Resize and each image layer (an image layer is also never decoded bigger than the canvas);
friendly in-app messages explain both caps. Decoded layer bitmaps are kept, text metrics cached, and
the preview is rebuilt only when something changes (once per frame while dragging); with no layers
the engine draws exactly as before. On a 4 GB Celeron keep enlargements to about 4000–5000 px.

## Limits (HPS2)
- 10 layers, ~12 MP. No masks, selections, brushes or layer groups yet; no per-layer Adjust
  (Adjust is for the whole flattened image). Layers outside the crop are clipped.
- Text uses the device's fonts (Sans / Serif / Mono / Impact / Casual map to common system fonts),
  so a .hps opened on another device can look slightly different.
- `.ora` layers carry Adjust baked in per layer (see above); `.ora` cannot be opened back.
- The undo history is not stored in the .hps.
- Not yet tried on a real phone or laptop (headless Chrome only).

## Limits (HPS1, still true)
- Same limits as Photo Editor v2 PE5 (sharpen preview looks a bit stronger than the saved photo at
  fit; enlarging is interpolation only; very large saves may fail on 4 GB machines).
- Single-screen editor, so no screen dots / swipes; Settings is a sheet.
- The Send device chooser is Photo Editor v2's (dark-styled) chooser in both themes.
- Not yet tried on a real phone or laptop.
