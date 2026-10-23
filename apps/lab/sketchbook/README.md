# Sketchbook (Lab)

A paper sketchbook: 50 fixed pages, draw with finger, mouse or pen. Saved in the browser. No undo.

Works in the Hub and responds to its D-pad (the Hub bar / menu); drawing itself needs touch, mouse or pen.

## Behaviour rules
- Page 1 = front cover: soft woven cloth, stitched spine, elastic band, a stitched star and an empty name label (write your name on it with the pen). Pages 2–3 = a ruled index table (Topic | Page No.) to fill in by hand, pages 4–44 = ruled drawing pages (first rule at 56 px, red left margin; index, notes and page 49 use the same rules), pages 45–48 = notes pages (small NOTES heading + Date line, then ruled lines), page 49 = a normal ruled page with Settings, About, How to and Tips written on the lines (small "page PNG" and "notebook PDF" links; you can still draw there and use ☰), page 50 = back cover: cloth, spine and an embossed logo.
- Floating ☰ button (bottom middle by default, above the phone's safe area; page 49 can move it to the top). Pulls fire on **release**, only past **1/3 of the screen** (smaller side); the jelly glows when armed. Shorter pulls just play with the jelly.
  - **tap** → small quick menu next to the button (opens upward at the bottom): pen colour dots (black default, blue, red; the chosen one is ringed and saved), Download this page (PNG), Go to settings page. Tap outside to close.
  - **hold still 1 s** (small jitter is fine) → crumple: exactly +1 wrinkle level (1–5), the jelly jiggles lightly while you hold and shakes when it lands. Hold again for the next level. After that release does nothing else. Drawings stay. Permanent: no undo.
  - drag **left** → next page, drag **right** → previous (book style). While you drag, the page curls: the corner lifts and bends (bottom-right for next, bottom-left for previous) and the real target page shows underneath; release past 1/3 completes the flip, shorter springs back. No curl before page 1 or after page 50.
  - pull **up** → pages grid (tap a thumbnail to open it; tap the background or title to close). Pull **down** → nothing.
- Big handwritten page number "n/50" tucked into the top-right corner of every page (not a stroke; included in PNG/PDF).
  - pull **up** → pages grid (tap a thumbnail to open it; tap the background or title to close)
  - pull **down** → crumple: +1 wrinkle level (1–5: 1 already clearly crumpled, 5 very dirty), jelly jiggles. Drawings stay. Permanent: no undo.
- The ☰ button is a glossy blue jelly. Its home never moves, but while you drag it follows your finger all the way, stretching soft and long, joined to a gooey blob at home by a bridge that thins with distance and a stretching shadow; on release it squashes and bounces softly back over several wobbles; a crumple makes the whole jelly jiggle. Press = small squish.
- Every finished stroke and every page change is saved at once.
- Palm rejection: very large touches (width > 50) are ignored.
- Page 49 settings: **Button: bottom / top** and **Swap gestures: off / on** (flips left↔right and up↔down: pull down = grid, pull up = nothing). Saved, applied at once and after reload; the How-to list on page 49 always shows the current mapping.
- No Reset (removed). PNG of the current page: tap ☰ → quick menu or the page-49 link; whole sketchbook PDF: page-49 link.

## Files
- `index.html` — redirect to `sketchbook.html`
- `sketchbook.html` — markup only, loads the scripts below in order
- `sketchbook.css` — all styles
- `sk_store.js` — shared state + LocalStorage load/save
- `sk_canvas.js` — resize, ruled background, redraw, special-page overlay
- `sk_pages.js` — go to page, crumple, page toast, pages grid
- `sk_cover.js` — cloth covers (woven pattern, spine, band, name label, embossed logo) + index table
- `sk_wrinkle.js` — crumple levels + SVG wrinkle overlay (feTurbulence + lighting, seeded per page) and its export image
- `sk_draw.js` — pointer drawing
- `sk_export.js` — PNG / PDF download (with wrinkles)
- `vendor/jspdf.umd.min.js` — jsPDF 2.5.1, stored locally
- `sk_settings.js` — settings panel open/close
- `sk_float.js` — floating button gestures
- `sk_curl.js` — page-curl animation (canvas copy + clip-path fold)
- `sk_popup.js` — hold quick menu
- `sk_jelly.js` — jelly look: SVG blob, goo filter tail, spring bounce, jiggle
- `sketchbook.js` — event wiring + start-up (loaded last)
- `sketchbook_icon.png` — Lab / Hub icon

## Keys
- No keyboard shortcuts of its own. Use the floating button.

## Saved data
- `localStorage['sketchbook_btnPos']` — `bottom` (default) or `top`.
- `localStorage['sketchbook_swap']` — `1` = swapped gestures, `0` = normal.
- `localStorage['sketchbook_pen']` — pen colour: black / blue / red.
- `localStorage['sketchbook_crumple']` — array of 50 numbers, crumple level per page (0–5; older higher values clamp to 5).
- `localStorage['sketchbook_v2']` — array of 50 pages, each an array of strokes `{ color, width, points:[{x,y}] }`. Points are in canvas pixels of the screen size at drawing time.

## Errors
- jsPDF missing → alert "PDF library loading... try again in a moment."
- Storage full → alert "Could not save (storage limit). Try crumpling some pages."
- Broken / wrong-size saved data → sketchbook starts empty (warning in the console).

## Manual browser testing (no Node)
1. Open `apps/lab/sketchbook/` → lands on `sketchbook.html`, cover shows.
2. Swipe the ☰ right → page 2 (Index); keep going to page 4 → ruled lines.
3. Draw a few strokes, reload → strokes still there.
4. Drag ☰ left halfway → page curls, next page visible under it; let go short → springs back. Pull ☰ up past 1/3 → grid with thumbnails; tap one → opens.
5. Hold ☰ still 1 s → one wrinkle level + shake; keep holding → nothing more; release and hold again → next level. Reload → still there. Export PNG / PDF → wrinkles included.
6. Tap ☰ → quick menu → Download PNG (current page); page 49 → text on the lines, ☰ visible, swipe back works.

## Known limits
- Page-number font depends on the device (handwriting font if installed, else cursive).
- PDF export redraws all 50 pages on screen while it runs; can be slow on old phones.
- If the jelly cannot draw (old browser, script error), a plain blue round ☰ button is shown instead; gestures still work.
- Script/CSS tags carry ?v=… cache-busting; bump it when files change.
- No undo; crumples are permanent. No reset. Wrinkles can never be removed.
- Grid thumbnails do not show wrinkles.
- Wrinkles are drawn at the current screen size; they look a bit different after rotating.
- The storage-full message still says "Try crumpling some pages", but crumpling no longer frees space.
- Strokes are not rescaled when the screen size or orientation changes.
- One colour / pen only.
- LocalStorage is ~5 MB; very dense sketchbooks can fill it.

## Rename note
Formerly "Notebook" (`apps/lab/notebook/`, keys `paperNotebook_*`). `apps/lab/notebook/index.html` is a redirect stub to this folder. On first start `sk_store.js` copies any old `paperNotebook_*` localStorage values to `sketchbook_*` and removes the old keys.
