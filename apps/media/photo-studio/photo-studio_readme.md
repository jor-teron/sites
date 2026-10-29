# Hub Photo Studio (HPS1)

The Hub's bigger photo editor (Media → Photo). Release **HPS1** has exactly Photo Editor v2's
feature set (PE5) under its own name, settings and About; it is the base for the heavy features
planned next (layers, selections and masks, retouch, pro adjustments, project files).

Open `photo-studio.html` (or the folder; `index.html` redirects). Works from `file://` too.

## What it does (HPS1)
- Open a photo: picker, drag and drop, or paste. Photos over the device limit (16.7 MP touch /
  50 MP desktop) are reduced once on open.
- Crop (Free, Original, 1:1, 4:3, 16:9), rotate left / right, flip H / V.
- Resize both ways (`E`): pixels or percent, aspect lock, presets; enlarging up to 4× or 8000 px.
- Adjust (`A`): Brightness, Contrast, Saturation, Warmth, Sharpen (0–100); looks Original, B&W,
  Sepia, Vivid; Reset.
- Non-destructive: every edit is a setting on top of the original; pixels are only rendered when
  you save, print or send. Undo / redo (60 steps).
- Save JPEG / PNG at full size, Print 🖨, Send 📤 over the Hub link.
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
| `ps_config.js` | loaded right after `pe_config.js`: overrides `app`, `appId: 'photo-studio'`, `release: 'HPS1'`, applies the saved format / quality, `config.studio`, and the `PE.studio` registration stub |
| `ps_app.js` | Studio layer, loaded last: `PE.ui.notify` (in-app message box), Settings sheet, theme → photo background, Studio keys, `PE.studio` feature slot |

Photo Editor v2 stores nothing in localStorage of its own, and Studio writes only
`photo-studio-*` keys (plus the shared `shared-link-*` keys written by `shared/link` for Send),
so the two never clash.

Two small backward-compatible hooks were added to `../photo-editor-v2/pe_send.js`:
`PE.config.appId` (Hub link "ready" id, default `'photo-editor-v2'`) and `PE.ui.notify` (used
instead of `alert()` when present). Photo Editor v2 sets neither, so it behaves exactly as before.
Studio loads that file as `pe_send.js?v=HPS1` so browsers fetch the hooked copy; every other
engine file keeps Photo Editor v2's `?v=PE5`.

## Adding heavy features (HPS2+)
One file per feature (e.g. `ps_layers.js`), loaded before or after `ps_app.js`:

```js
PE.studio.feature({ id: 'layers', init(PE) { /* runs once the engine has booted */ } });
PE.studio.addTool({ id: 'layers', title: 'Layers (L)', key: 'l', svg: '<path d="…"/>', onTap(PE) { … } });
```

Tools appear in the toolbar slot `#ps-tools` (before Save), are disabled with no photo
(unless `needsPhoto: false`), and their key works when the engine did not use it. Features that
change the preview or the saved pixels (layers, masks, retouch) will need a render / save hook in
the engine (`pe_view.js` `renderNow` / `pe_io.js` `save`); that hook is added backward compatible in
the release that first needs it, or the module is copied into Studio if the change is too big.

## Keys
Ctrl+O open, Ctrl+S save, Ctrl+Z / Ctrl+Y undo / redo, C crop (Enter applies), R / Shift+R rotate,
H / V flip, A adjust, E resize, + / - / 0 zoom, `,` settings, Esc cancel / close.

## Light on old laptops
Same engine as Photo Editor v2: the preview is a screen-sized copy (≤ 2.5 MP), sliders only rebuild
that copy, the full photo is rendered once at save in 512-row strips. Studio adds ~10 KB of script.
On a 4 GB Celeron keep enlargements to about 4000–5000 px.

## Limits (HPS1)
- Same limits as Photo Editor v2 PE5 (sharpen preview looks a bit stronger than the saved photo at
  fit; enlarging is interpolation only; very large saves may fail on 4 GB machines).
- Single-screen editor, so no screen dots / swipes; Settings is a sheet.
- The Send device chooser is Photo Editor v2's (dark-styled) chooser in both themes.
- Not yet tried on a real phone or laptop.
