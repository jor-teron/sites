# Hub Photo Studio (HPS4)

The Hub's bigger photo editor (Media → Photo). Release **HPS1** had exactly Photo Editor v2's
feature set (PE5) under its own name, settings and About. Release **HPS2** adds **layers** (image,
text and shape layers with opacity and blend modes), the **.hps project file** and **.ora export**.
Release **HPS3** adds **selections** (rectangle, ellipse, lasso, magic wand) that limit Adjust / Looks,
and **layer masks** (mask brush, mask from selection). Planned next: retouch, pro adjustments.

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
| `ps_project.js` | HPS2: `.hps` save / open and `.ora` export (`PE.project`); HPS3: masks in / out, Adjust area in the .ora |
| `ps_select.js` | HPS3: pixel store `PE.pix`, selections `PE.select`, marching ants, the `PE.view.adjustMask` hook, selection bar |
| `ps_mask.js` | HPS3: layer masks `PE.masks`: drawing hooks, mask brush, mask bar, .hps mask entries |
| `ps_retouch.js` | HPS4: retouch `PE.retouch`: healing, clone, red-eye, blur, smudge, RGBA patches, retouch bar, .hps retouch entries |

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

HPS3 added one more, backward compatible:
- `pe_view.js` + `pe_io.js`: `PE.view.adjustMask(ctx, outW, outH, offY)`, default `null`. When set and it
  returns true, it has drawn an alpha mask for the output (or for the 512-row strip starting at `offY`);
  Adjust / Looks / Sharpen are then kept only where the mask is opaque (preview: destination-in over the
  plain copy; save: per-strip blend with the untouched pixels). Old lines are kept as comments.
- `ps_layers.js` (Studio's own) gained `L.drawBg`, `L.bgMasked`, `L.engineDraw`, `L.mapping`, `L.toLocal`,
  `L.boxH` so `ps_mask.js` can wrap drawing.

Photo Editor v2 never replaces `drawPhoto` and never sets `adjustMask`, so it draws exactly as before (PE5 test 46/46).
Studio loads `pe_view.js` / `pe_io.js` and every other engine file straight from the
Photo Editor v2 copy.

## Retouch (HPS4)
One toolbar button (Retouch) opens a floating bar: Healing, Clone, Red-eye, Blur, Smudge, with Size,
Hardness (not Red-eye) and Strength, plus Set source / Aligned (Clone and Healing) and Remove retouch
(in-app confirm). Opening it closes Layers, Select and the Mask brush, and the other way round.
- **Clone stamp (S):** Alt+click (or Set source, then tap) picks the source. Aligned keeps the same offset
  between strokes; off, every stroke starts again from the source point.
- **Healing brush (J):** clone, then the copied colour is shifted to the average colour around the brush,
  so texture comes from the source and tone from the surroundings.
- **Red-eye (Shift+J):** click an eye (a box the brush size) or drag a box; only strongly red pixels get
  their red pulled down to the green/blue level.
- **Blur (U) and Smudge (Shift+U):** soft box blur under the brush; smudge drags colour along the stroke.
- Paints on the selected image layer or the Background (text and shape layers: a message). An active
  selection limits painting; a mask still hides what it hides. One stroke = one undo step.
- Storage: a patch per target (RGBA over the original photo / the layer's picture, transparent where
  untouched, at most `C.studio.retouch.maxPixels` = 4 MP), kept in `PE.pix` as 256 px tiles shared
  between undo steps. It is laid over the source picture before Adjust / Looks, masks and opacity, through
  the `L.drawBg`, `L.bgMasked` and `L.drawLayer` hooks, so preview, Save, Print, Send and .ora all show it.

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

## Selections (HPS3)
- Tools on the toolbar (Select, Wand) and the floating bar at the top: Rectangle / Ellipse (`M`, press
  again to switch), Lasso (`Shift+L`), Magic wand (`W`: Tolerance 0–128, Contiguous on / off, sample the
  whole Image or only the selected Layer). New / Add / Subtract chips, or hold `Shift` (add) / `Alt`
  (subtract) while you drag or tap. A tap without dragging deselects. All, None, Invert; `Ctrl+A`,
  `Esc` / `Ctrl+D`, `Ctrl+I`. `Done` / `Esc` closes the tool.
- A selection is an alpha mask over the original photo (max about 4 MP, `config.studio.select`), so it
  follows crop / rotate / flip / resize and is drawn bigger for the full-size save. Marching ants show it.
- **Adjust / Looks inside the selection**: the selection that is active when you change a slider or a look
  is remembered with that step (`edits.adjSel`); Adjust then applies only there, in the preview and in
  Save / Print / Send / .ora. Change Adjust with no selection to make it global again. Undo restores both.
- **Delete** with a selection hides that area of the selected layer (or the background) through its mask.
- Every selection change is one undo step. The selection itself is not saved in the .hps.

## Layer masks (HPS3)
- Mask brush (`B`): paint **Hide** / **Show** on the selected layer (the background when none), Size
  (`[` / `]`), Hardness; one stroke = one undo step. The bar also has Mask on / off, From selection
  (shows only the selection), Delete mask (asks first).
- A mask covers the layer's own box (max about 4 MP, `config.studio.mask`), so it moves, scales and
  rotates with the layer. Masks apply in the preview, Save / Print / Send and the .ora export.

## The .hps project file (version 1)
A `.hps` is a plain ZIP (open it with any unzip tool):

| Entry | What |
|---|---|
| `project.json` | the project (below), deflated |
| `images/background.<ext>` | the original photo file, byte for byte (stored) |
| `images/<src>.<ext>` | the original file of each image layer, byte for byte (stored) |
| `layers/<id>.png` | raster pixels for painted layers (reserved: none in HPS2 / HPS3) |
| `masks/<id>.png`, `masks/background.png` | HPS3: layer / background masks (alpha = visible). The layer gets `"mask": {"src": "masks/<id>.png", "on": true, "w": …, "h": …}`, `background` gets `"mask": {"src", "on"}` |
| `retouch/<id>.png`, `retouch/background.png` | HPS4: RGBA retouch patch (transparent = untouched). Image layers get `"retouch": {"src": "retouch/<id>.png"}`, `background` gets the same. Older files have none; HPS3 ignores them |
| `masks/adjust.png` | HPS3: the area Adjust / Looks apply to; `edits.adjSel: "masks/adjust.png"` (missing = whole image) |
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
- HPS3 masks are additive: the version stays 1; HPS2 ignores the `mask` / `adjSel` fields (and then shows
  layers unmasked), HPS3 opens every HPS2 file unchanged.
- Open checks `format` and `version` (newer versions get a friendly "made by a newer Photo Studio"
  message), skips unknown layer types, and repairs missing values. Undo history is not saved.

- HPS4 retouch is additive too: version stays 1, every older file opens unchanged.

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
HPS3: M marquee (rectangle / ellipse), Shift+L lasso, W magic wand, B mask brush ([ ] size), Shift / Alt add /
subtract, Ctrl+A select all, Esc / Ctrl+D deselect, Ctrl+I invert, Delete with a selection hides it.

HPS4: J healing, Shift+J red-eye, S clone stamp (Alt+click = source), U blur, Shift+U smudge (same key
again closes; [ ] size; Esc closes when nothing is selected).

## Light on old laptops
Same engine as Photo Editor v2: the preview is a screen-sized copy (≤ 2.5 MP), sliders only rebuild
that copy, the full photo is rendered once at save in 512-row strips.
HPS2 keeps layers light: at most **10 layers** (background included) and **about 12 MP** for the
photo, Resize and each image layer (an image layer is also never decoded bigger than the canvas);
friendly in-app messages explain both caps. Decoded layer bitmaps are kept, text metrics cached, and
the preview is rebuilt only when something changes (once per frame while dragging); with no layers
the engine draws exactly as before. On a 4 GB Celeron keep enlargements to about 4000–5000 px.

## Limits (HPS4)
- A retouch patch is at most 4 MP: on a 12 MP photo retouched spots are a little softer than the rest.
- Healing is a simple colour match (average under the brush), not Photoshop-style content-aware blending.
- Clone / Healing copy from the picture as it was when the stroke started (no feedback within a stroke)
  and only within the same layer. The source point is forgotten when another photo opens.
- Retouch works on image layers and the Background, not text or shape layers. Retouching under a mask
  is hidden by the mask. After Resize the patch is scaled along (the next stroke re-samples it once).
- Big brushes (Blur / Smudge over ~200 px) can lag on old laptops; each stroke frame redraws the whole
  photo. Touch / pen pressure is not used.

## Limits (HPS3)
- Selections and masks are kept at most about 4 MP each, so on a 12 MP photo their edges are about 1.7×
  softer than the photo's pixels. Selections are not saved in the .hps; the undo history keeps up to 60 steps
  (old mask / selection buffers are freed as soon as no step uses them).
- No feather / grow / shrink, no selection move, no Fill; the wand samples the original (unadjusted) pixels.
- Adjust is still one setting for the whole image, limited to one area (not per layer).
- Line shapes: the round caps just past the ends are cut off when the layer has a mask.
- Syntax-checked only so far (no browser test yet).

## Limits (HPS2)
- 10 layers, ~12 MP. (HPS2:) No masks, selections, brushes or layer groups yet; no per-layer Adjust
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
