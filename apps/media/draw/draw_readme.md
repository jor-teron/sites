# Draw

## 1. What it is
A simple drawing app for finger, stylus or mouse: pen, eraser, fill and shapes on a white page. It saves itself in the browser and exports PNG.

## 2. Files
- `draw.html` / `draw.css`: canvas, toolbar, popovers, layout
- `draw_config.js`: colours, sizes, tools, zoom, undo steps, autosave, keys, text
- `draw_logic.js`: drawing, fill, zoom / pan, undo / redo, autosave, keys, paste, hub bar
- `draw_icon.png`: hub icon
- `index.html`: opens `draw.html`

## 3. Behaviour rules
- **Drawing size:** fixed when the app first opens (the free screen area, sharpness up to 2× and at most 3000 px on the long side). Rotating or resizing later only refits the view; the drawing is never cropped or resized.
- **Tools:** Pen, Eraser, Fill, Shape. Tapping Shape again cycles Line → Rectangle → Circle.
- **Colour:** 10 colours in the colour popover. **Size:** 4 brush sizes (2, 6, 14, 30).
- **Fill:** fills touching pixels of nearly the same colour (tolerance 32 per channel). It fills on release, and only if the finger moved less than 10 px.
- **Two fingers:** pinch to zoom and pan. A second finger during a stroke cancels the stroke (no stray line).
- **Zoom:** 0.5× to 8×. Mouse wheel zooms; Ctrl+wheel (trackpad pinch) zooms smoothly. Middle-button drag or Space+drag pans. The "100%" button (or `0`) resets.
- **Undo / redo:** last 40 steps; kept only while the page is open.
- **More (⋯):** Clear (asks first; can be undone), Save PNG, Open image.
- **Open image / paste image:** the picture is fitted inside the drawing and centred, as one undo step.
- **Save PNG:** white background plus drawing, named `drawing-YYYYMMDD-HHMM.png`.
- **Autosave:** 0.8 s after each change and when the tab is hidden or closed. Tool, colour and size are remembered too.
- **In the hub:** the hub bar shows the tool, plus Undo, Redo, Save PNG and Clear buttons.

## 4. Keyboard
- `P` pen, `E` eraser, `F` fill, `S` shape (again = next shape)
- `[` / `]` smaller / bigger brush
- `0` reset zoom
- Hold Space and drag: pan
- Ctrl/Cmd+Z undo; Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redo; Ctrl/Cmd+S save PNG
- Ctrl/Cmd+V pastes an image
- Esc closes popovers and the Clear question

Works inside the hub and responds to its phone D-pad, but those key presses are synthetic: only the shortcuts above work (e.g. R = `e` picks the Eraser, Select = Esc closes popovers). Pasting from the phone doesn't work.

## 5. Saved data
localStorage keys `draw-autosave` (the drawing as PNG, or JPEG if too big) and `draw-autosave-meta` (size, background, tool, colour, size). To reset, delete both or clear site data; a new drawing then gets the current screen size.

## 6. Errors
- "Autosave: storage full": even the JPEG copy didn't fit. The drawing on screen is fine; save a PNG.
- Other messages: "Saved", "Image added", "Image pasted".
- A file that isn't an image is ignored.

## 7. Screen sizes
- **Portrait:** toolbar along the bottom.
- **Landscape:** slim toolbar column on the right, popovers to its left; smaller icons on very short screens (360 px tall or less).

## 8. Safe settings (`draw_config.js`)
- `colors`, `sizes`, `startSize`, `startTool`
- `fillTolerance`
- `doc.background`, `doc.density`, `doc.maxSide` (only for new drawings)
- `zoom.min`, `zoom.max`, `zoom.wheelStep`
- `historyLimit`
- `autosave.delayMs`
- `tapMovePx`
- `keys`, `text`

## 9. Browser checklist
1. Draw a line, Undo, Redo: it comes back.
2. Fill inside a closed shape: only the inside fills.
3. Pinch (or wheel) to zoom, "100%" resets.
4. Reload: the drawing and the tool are still there.
5. ⋯ → Save PNG: a PNG with a white background downloads.
6. Rotate the phone: the drawing refits, nothing is cut off.

## 10. Known limits
- One layer; no layer list.
- The drawing size never changes after the first launch (until saved data is cleared).
- Undo history is lost on reload.
- Big drawings may not fit in browser storage (see Errors).
- Old version after an update: hard-refresh.

## 11. Change log
- 2026-10-04 01:22 IST: new app (commit 71d93dc).

## 12. Related apps
- Paint: the older drawing app.
- Photo Editor v2: for editing photos.
