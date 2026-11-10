# Space Invaders — SI-T1

Open `index.html` or `space-invader.html`. The **Theme** button opens an accessible,
keyboard/touch-friendly settings dialog with ten animated previews and Auto.

- Auto follows the existing `HubTheme` storage/message/focus contract: Hub light
  selects Minimal Flat; Hub dark selects Classic Arcade. Explicit choices survive
  Hub changes and reloads. Storage failures leave the game playable.
- `ui/themes.js` owns palette, fonts, cached two-frame sprites, player, bullets,
  backgrounds, bottom-edge bunker scenery, explosions and post-effects. All art
  is procedural; no image downloads, libraries or animation-time random calls.
- `ui/theme-settings.js` owns `space-invader.visualTheme` (see the shared settings
  README). The dialog freezes/resumes the current game without resetting it.
- The original game has **no collidable UFOs or shields**. The small UFO above the
  formation and bunkers below the ground line are explicitly decorative. No new
  targets, obstacles, hitboxes, scoring or difficulty changes were introduced.
- Sprites/glows/static gradients are cached in offscreen canvases; at most 96
  particles are retained. Reduced motion freezes sprite/background animation,
  disables RGB-split glitches and replaces player blinking with steady opacity.
- The 480×640 logical playfield now keeps its aspect ratio on wide screens.
  Shared games FPS/difficulty options are deliberately not newly applied, since
  this game's existing simulation is per-frame. No shared files/build bump.

## Regression test

Requires Node, Chrome, and an externally installed `puppeteer-core`; no npm install
is needed inside this repository. From the repository root, serve this tree:

```sh
python3 -m http.server 8836 --bind 127.0.0.1
# In another terminal (adjust the dependency/output paths):
PUPPETEER_MODULE=/path/to/node_modules/puppeteer-core \
SI_SCREENSHOTS=/tmp/si-themes \
node apps/games/space-invader/tests/themes.test.cjs
```

`CHROME_BIN` optionally overrides `/usr/bin/google-chrome`. The test captures every
skin at 390×844 and 1440×900 (DPR 2), checks console/network errors, midgame
switching with state retention, persistence, live Auto, storage-denied fallback,
reduced motion, modal pause/resume, draw costs and real rAF frame pacing. It also
compares 900 deterministic simulation frames per theme to the pre-SI-T1 source at
`b1796837`, including positions, bullets, score, lives and waves. A JSON report and
22 screenshots (20 game views + two settings views) go in the output directory.
Headless phone-sized measurements are not a substitute for real-device testing.
