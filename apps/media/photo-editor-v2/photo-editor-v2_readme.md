# Photo Editor v2

## 1. What it is
A phone-first photo editor: rotate, flip, crop, and adjust brightness, contrast, saturation and warmth, with a few looks (B&W, Sepia, Vivid). Edits never change the original pixels until you save, and the saved photo is full size. Works offline.

## 2. Files
- `photo-editor-v2.html` / `photo-editor-v2.css`: toolbar, panels, save menu, layout
- `pe_config.js`: all settings (size limits, zoom, crop ratios, sliders, presets, save, keys)
- `pe_state.js`: the open photo, edit settings, undo / redo
- `pe_transform.js`: rotate and flip (90° steps, lossless), shared geometry
- `pe_view.js`: fit to screen, zoom and pan, the fast screen preview
- `pe_crop.js`: crop box and ratios
- `pe_adjust.js`: sliders, presets, Reset
- `pe_input.js`: touch / mouse gestures and keyboard
- `pe_io.js`: open (picker, drag-and-drop, paste) and save
- `pe_ui.js`: toolbar, panels, save menu, toast, zoom pill, start-up
- `photo-editor-v2_icon.png`: hub icon
- `index.html`: opens `photo-editor-v2.html`

## 3. Behaviour rules
- **Open:** "Open photo" button, the toolbar Open button, drag a photo onto the page, or paste one. The camera's own rotation (EXIF) is respected.
- **Big photos:** kept full size up to 50 MP on desktops and 16.7 MP on phones / touch devices (longest side 16384 px). Bigger ones are reduced once on open ("Large photo: working at W×H").
- **Rotate / flip:** rotate left / right and flip horizontal / vertical, in 90° steps, without quality loss.
- **Crop:** a box over the whole photo with large handles; drag corners, edges or the inside. Ratios: Free, Original, 1:1, 4:3, 16:9 (tap a ratio again for the portrait version, e.g. 3:4). Apply or Cancel. Undo and redo are paused while cropping.
- **Adjust:** pick Brightness, Contrast, Saturation or Warmth and move the one slider (−100 to +100). Tap the number to set it back to 0. Presets add their look on top of the sliders. Reset clears all sliders and the preset.
- **Undo / redo:** last 60 steps (one step per finished slider move).
- **Zoom:** pinch, double-tap / double-click (2.5×), mouse wheel, `+` / `-`; 1× (fit) to 8×. Drag to pan when zoomed. The zoom pill resets.
- **Save:** opens a menu with Save JPEG / Save PNG and the output size. Ctrl+S saves straight away: PNG for PNG photos, otherwise JPEG (quality 0.92; transparent parts turn white in JPEG). File name: original name + `-edited`. Saving an open crop applies it first.
- **Preview:** while editing, only a screen-sized copy is processed, so sliders stay fast; the full photo is processed once, on save, with the same maths.
- **Nothing is stored:** a reload starts empty.

## 4. Keyboard
- Ctrl/Cmd+Z undo; Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redo
- Ctrl/Cmd+S save; Ctrl/Cmd+O open
- `R` rotate right, Shift+`R` rotate left
- `H` / `V` flip horizontal / vertical
- `C` crop (again or Enter = apply), Esc = cancel
- `A` adjust panel
- `0` reset zoom; `+` / `-` zoom
- Ctrl/Cmd+V pastes a photo

Works inside the hub and responds to its phone D-pad, but those key presses are synthetic: only the shortcuts above work (Y = `c` starts / applies crop, Start = Enter applies, Select = Esc cancels). Opening the file picker from the phone doesn't work.

## 5. Saved data
None. Nothing is kept after a reload.

## 6. Errors
Toasts:
- "That is not an image"
- "Could not open that image"
- "Large photo: working at W×H"
- "Saved <name> · W×H"
- "Save failed (photo too large for this device?)"

## 7. Screen sizes
- **Portrait:** toolbar at the bottom; crop / adjust panels open next to it and the photo refits (it is never covered).
- **Landscape:** slim toolbar on the right, panels in a 236 px column (200 px on narrow screens, more compact under 360 px tall).

## 8. Safe settings (`pe_config.js`)
- `limits.maxPixelsTouch`, `limits.maxPixelsDesktop`, `limits.maxSide`
- `view.zoomMax`, `view.doubleTapZoom`, `view.previewMaxPixels`
- `crop.ratios`, `crop.minSize`
- `adjust.presets` (each may add slider values and a colour matrix)
- `save.defaultFormat` (`auto`, `jpeg` or `png`), `save.jpegQuality`, `save.jpegBackground`, `save.suffix`
- `historyLimit`
- `colors`, `keys`

## 9. Browser checklist
1. Open a phone photo: it shows the right way up.
2. Rotate right, flip, Undo twice: back to the original.
3. Crop 1:1, Apply: square.
4. Adjust → Brightness +50, then B&W: the preview changes.
5. Save JPEG: `<name>-edited.jpg` at full size (check the toast size).
6. Pinch / wheel zoom, tap the zoom pill: back to fit.

## 10. Known limits
- No drawing, text, stickers or straighten (free rotation).
- Very large photos are reduced on phones (canvas limits).
- Saving big photos can take a few seconds and may fail on low-memory phones.
- Edits are lost on reload (no autosave).
- Old version after an update: hard-refresh.

## 11. Change log
- 2026-10-04 02:14 IST: new app (commit 4d2a684).

## 12. Related apps
- Photo Editor: the older version, left unchanged.
- Draw: drawing on a blank page.
