# Snake — SNK-T1

Open `index.html` or `snake.html`. The **Theme** button opens an accessible,
keyboard/touch-friendly settings dialog with ten animated previews and Auto.

- Auto follows the existing `HubTheme` storage/message/focus contract: Hub light
  selects Minimal Flat; Hub dark selects Classic Nokia. Explicit choices survive
  Hub changes and reloads. Storage failures leave the game playable.
- `ui/themes.js` owns palette, fonts, cached board art, snake (with eyes), food,
  walls and letterbox scenery. All art is procedural; no image downloads,
  libraries or animation-time random calls.
- `ui/theme-settings.js` owns `snake.visualTheme` (see the shared settings
  README). The dialog freezes/resumes the current game without resetting it.
- Gameplay, grid, timing, scoring and collisions are unchanged across themes.
- Reduced motion freezes food pulse and ocean bubbles. Shared games FPS or
  difficulty options are deliberately not newly applied. No shared simulation
  files or build bump.

## Regression test

Requires Node, Chrome, and an externally installed `puppeteer-core`; no npm install
is needed inside this repository. From the repository root, serve this tree:

```sh
python3 -m http.server 8824 --bind 127.0.0.1
# In another terminal (adjust the dependency/output paths):
PUPPETEER_MODULE=/path/to/node_modules/puppeteer-core \
SNK_SCREENSHOTS=/tmp/snk-themes \
node apps/games/snake/tests/themes.test.cjs
```

`CHROME_BIN` optionally overrides `/usr/bin/google-chrome`. The test captures every
skin at 390×844 and 1440×900 (DPR 2), checks console/network errors, midgame
switching with state retention, persistence, live Auto, storage-denied fallback,
reduced motion, modal pause/resume, draw costs and real rAF frame pacing. It also
compares 900 deterministic simulation frames per theme to the pre-SNK-T1 source at
`b1796837`, including positions, food, score and direction. A JSON report and
22 screenshots (20 game views + two settings views) go in the output directory.
Headless phone-sized measurements are not a substitute for real-device testing.
