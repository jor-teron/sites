# Notebook (Lab)

A paper sketch notebook: 50 fixed pages, draw with finger, mouse or pen. Saved in the browser. No undo.

Works in the Hub and responds to its D-pad (the Hub bar / menu); drawing itself needs touch, mouse or pen.

## Behaviour rules
- Page 1 = front cover: soft woven cloth, stitched spine, elastic band, a stitched star and an empty name label (write your name on it with the pen). Pages 2–3 = a ruled index table (Topic | Page No.) to fill in by hand, pages 4–44 = ruled drawing pages (blank top margin, red left margin), pages 45–48 = Notes, page 49 = Settings card (Download PNG, Download PDF, Reset, plus About, How to and Tips), page 50 = back cover: cloth, spine and an embossed logo.
- Floating ☰ button (top middle). Pulls fire on **release**, only past **1/3 of the screen** (smaller side); the jelly glows when armed. Shorter pulls just play with the jelly.
  - tap → nothing
  - hold still ~0.5 s → small quick menu under the button: Download this page (PNG), Download notebook (PDF), Go to settings page, Reset notebook… Tap outside to close.
  - swipe right / left → next / previous page
  - pull **up** → pages grid (tap a thumbnail to open it; tap the background or title to close)
  - pull **down** → crumple: +1 wrinkle level (1–10: 1 very light, 10 very dirty), jelly jiggles. Drawings stay. Permanent: no undo, Reset Notebook does not remove wrinkles.
- The ☰ button is a glossy blue jelly. Its home never moves, but while you drag it follows your finger all the way, stretching soft and long, joined to a gooey blob at home by a bridge that thins with distance and a stretching shadow; on release it squashes and bounces softly back over several wobbles; a crumple makes the whole jelly jiggle. Press = small squish.
- Every finished stroke and every page change is saved at once.
- Palm rejection: very large touches (width > 50) are ignored.
- Settings card on page 49: Download Page PNG, Download Notebook PDF, Reset Notebook (asks first), About, How to, Tips. The hold quick menu has the same downloads for the current page.

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
- `vendor/jspdf.umd.min.js` — jsPDF 2.5.1, stored locally
- `notebook_icon.png` — Lab / Hub icon

## Keys
- No keyboard shortcuts of its own. Use the floating button.

## Saved data
- `localStorage['paperNotebook_crumple']` — array of 50 numbers, crumple level per page (0–10; older 0–6 values load as they are).
- `localStorage['paperNotebook_v2']` — array of 50 pages, each an array of strokes `{ color, width, points:[{x,y}] }`. Points are in canvas pixels of the screen size at drawing time.

## Errors
- Storage full → alert "Could not save (storage limit). Try crumpling some pages."
- Broken / wrong-size saved data → notebook starts empty (warning in the console).
- jsPDF missing → alert "PDF library loading... try again in a moment."

## Manual browser testing (no Node)
1. Open `apps/lab/notebook/` → lands on `notebook.html`, cover shows.
2. Swipe the ☰ right → page 2 (Index); keep going to page 4 → ruled lines.
3. Draw a few strokes, reload → strokes still there.
4. Tap ☰ → nothing. Pull ☰ up past 1/3 → grid with thumbnails; tap one → opens.
5. Pull ☰ down past 1/3 → jelly jiggles, light wrinkles; again → more; reload → still there. Export PNG/PDF → wrinkles included.
6. Hold ☰ → quick menu → Download PNG (current page); page 49 card → Download PNG, then Download PDF (50 pages), offline too.
7. Reset Notebook → confirm → all pages empty, back to cover.

## Known limits
- The PNG button on the page-49 card saves page 49; use the hold quick menu for the page you are on.
- If the jelly cannot draw (old browser, script error), a plain blue round ☰ button is shown instead; gestures still work.
- Script/CSS tags carry ?v=… cache-busting; bump it when files change.
- No undo; crumple and reset are permanent. Wrinkles can never be removed.
- Grid thumbnails do not show wrinkles.
- Wrinkles are drawn at the current screen size; they look a bit different after rotating.
- The storage-full message still says "Try crumpling some pages", but crumpling no longer frees space.
- Strokes are not rescaled when the screen size or orientation changes.
- One colour / pen only.
- PDF export redraws all 50 pages on screen while it runs and can be slow on old phones.
- LocalStorage is ~5 MB; very dense notebooks can fill it.
