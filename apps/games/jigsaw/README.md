# Jigsaw — JIG-1a

An original local jigsaw game. No external images, libraries or network services.
Open `index.html` or `jigsaw.html` (classic scripts also work from `file://`).

## Playing

Choose one of six procedural pictures or a local photo, choose 12 / 24 / 48 /
100 / 150 / 200 / 300 pieces, then **New puzzle**. Counts are exact; grid factors
follow the picture's aspect ratio. Drag with a mouse or finger. Pieces snap to
correct neighbours or their board position. Joined groups move together; placed
pieces stay locked. Edges only filters loose groups, not already placed pieces.
Ghost preview shows the picture faintly beneath the board.

The timer starts on the first drag. Pause stops it; hidden-tab time is not counted.
Progress resumes automatically. Starting another puzzle replaces the previous save.
No rotation, zoom or sound in this release.

## Files and extension seams

- `core/model.js`: seeded complementary Bezier edges, grid choice, group movement,
  snapping and validated restore. Pure rules exported for Node tests.
- `assets/pictures.js`: six deterministic original illustrations on canvas.
- `ui/render.js`: cached DPR piece bitmaps + Path2D picking; world-to-screen view
  transform is isolated here for later zoom/pan. Idle frames do not redraw.
- `ui/settings.js`: optional shared settings; Auto follows Hub Light/Dark, then
  the system. Explicit Light/Dark takes precedence. No changes to shared Hub code.
- `core/game.js`: pointer capture/cancel, responsive containment, clock, local
  persistence, photo processing and completion UI. Sound can attach to the
  successful join/completion paths later.

## Local data / privacy

`jigsaw.save` stores the seeded layout, positions, groups, elapsed play time and
filters. `jigsaw.best` stores times by picture identity and count. `jigsaw.photo`
stores the most recent photo after local downsampling (maximum 1200 px and JPEG).
Very wide/tall photos are centre-cropped to at most 4:1 (or 1:4).
No photo is uploaded. Photos over the 700 KB encoded-storage limit, or photos
that cannot be saved, remain tab-only. Invalid saves fall back to a new puzzle.
All three keys are included in shared Games Settings' Clear all game progress.

## Tests

`node --test apps/games/jigsaw/tests/model.test.cjs`

Serve the repository with `python3 -m http.server 8827 --bind 127.0.0.1`, then run
`PUPPETEER_PATH=/path/to/puppeteer-core node apps/games/jigsaw/tests/browser.cjs`.
The browser suite uses isolated headless Chrome. `?test=1` enables a test-only
movement/drop hook; solving still runs the normal snapping and completion path.
Optional `JIG_SHOTS=/existing/directory` saves phone screenshots outside the repo.
