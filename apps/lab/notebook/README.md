# Notebook (Lab)

A paper sketch notebook: 50 fixed pages, draw with finger, mouse or pen. Saved in the browser. No undo.

Works in the Hub and responds to its D-pad (the Hub bar / menu); drawing itself needs touch, mouse or pen.

## Behaviour rules
- Page 1 = front cover: soft woven cloth, stitched spine, elastic band, a stitched star and an empty name label (write your name on it with the pen). Pages 2–3 = a ruled index table (Topic | Page No.) to fill in by hand, pages 4–44 = ruled drawing pages (blank top margin, red left margin), pages 45–48 = Notes, page 49 = a normal ruled page with Settings, About, How to and Tips written on the lines (one small "save this page as PNG" link; you can still draw there and use ☰), page 50 = back cover: cloth, spine and an embossed logo.
- Floating ☰ button (top middle). Pulls fire on **release**, only past **1/3 of the screen** (smaller side); the jelly glows when armed. Shorter pulls just play with the jelly.
  - tap → nothing
  - hold still ~0.5 s → small quick menu under the button: Download this page (PNG), Go to settings page. Tap outside to close.
  - swipe right / left → next / previous page
  - pull **up** → pages grid (tap a thumbnail to open it; tap the background or title to close)
  - pull **down** → crumple: +1 wrinkle level (1–10: 1 very light, 10 very dirty), jelly jiggles. Drawings stay. Permanent: no undo.
- The ☰ button is a glossy blue jelly. Its home never moves, but while you drag it follows your finger all the way, stretching soft and long, joined to a gooey blob at home by a bridge that thins with distance and a stretching shadow; on release it squashes and bounces softly back over several wobbles; a crumple makes the whole jelly jiggle. Press = small squish.
- Every finished stroke and every page change is saved at once.
- Palm rejection: very large touches (width > 50) are ignored.
- No PDF export and no Reset any more (removed). PNG of the current page: hold ☰ → quick menu.

## Files
- `index.html` — redirect to `notebook.html`
- `notebook.html` — markup only, loads the scripts below in order
- `notebook.css` — all styles
- `nb_store.js` — shared state + LocalStorage load/save
- `nb_canvas.js` — resize, ruled background, redraw, special-page overlay
- `nb_pages.js` — go to page, crumple, page toast, pages grid
- `nb_cover.js` — cloth covers (woven pattern, spine, band, name label, embossed logo) + index table
- `nb_wrinkle.js` — crumple levels + SVG wrinkle overlay (feTurbulence + lighting, seeded per page) and its export image
- `nb_draw.js` — pointer drawing
- `nb_export.js` — PNG / PDF download
- `nb_settings.js` — settings panel open/close
- `nb_float.js` — floating button gestures
- `nb_popup.js` — hold quick menu
- `nb_jelly.js` — jelly look: SVG blob, goo filter tail, spring bounce, jiggle
- `notebook.js` — event wiring + start-up (loaded last)
- `notebook_icon.png` — Lab / Hub icon

## Keys
- No keyboard shortcuts of its own. Use the floating button.

## Saved data
- `localStorage['paperNotebook_crumple']` — array of 50 numbers, crumple level per page (0–10; older 0–6 values load as they are).
- `localStorage['paperNotebook_v2']` — array of 50 pages, each an array of strokes `{ color, width, points:[{x,y}] }`. Points are in canvas pixels of the screen size at drawing time.

## Errors
- Storage full → alert "Could not save (storage limit). Try crumpling some pages."
- Broken / wrong-size saved data → notebook starts empty (warning in the console).

## Manual browser testing (no Node)
1. Open `apps/lab/notebook/` → lands on `notebook.html`, cover shows.
2. Swipe the ☰ right → page 2 (Index); keep going to page 4 → ruled lines.
3. Draw a few strokes, reload → strokes still there.
4. Tap ☰ → nothing. Pull ☰ up past 1/3 → grid with thumbnails; tap one → opens.
5. Pull ☰ down past 1/3 → jelly jiggles, light wrinkles; again → more; reload → still there. Export PNG/PDF → wrinkles included.
6. Hold ☰ → quick menu → Download PNG (current page); page 49 → text on the lines, ☰ visible, swipe back works.

## Known limits
- If the jelly cannot draw (old browser, script error), a plain blue round ☰ button is shown instead; gestures still work.
- Script/CSS tags carry ?v=… cache-busting; bump it when files change.
- No undo; crumples are permanent. No reset. Wrinkles can never be removed.
- Grid thumbnails do not show wrinkles.
- Wrinkles are drawn at the current screen size; they look a bit different after rotating.
- The storage-full message still says "Try crumpling some pages", but crumpling no longer frees space.
- Strokes are not rescaled when the screen size or orientation changes.
- One colour / pen only.
- LocalStorage is ~5 MB; very dense notebooks can fill it.
