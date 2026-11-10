# Garden Guard · GG-1a

Original 5-lane / 9-tile garden defence. Open `index.html` or `garden-guard.html`.
No build step, libraries, remote assets, sound or full-screen request. Classic scripts
also support `file://`. Auto (System) is the shared settings default: Hub Light/Dark
wins over the device preference. The Hub catalog entry opens windowed.

## Play

Start with 50 sun. Select a seed then tap a free tile. Collect sun discs (25 each).
The seed cost is printed on each button; its amber refill bar and hover title show
the cooldown. Mouse hover or keyboard arrows give a green/red placement preview.
The original seed names **Bark Guard** and **Berry Burst** provide the high-HP
blocker and short-fuse 3×3 blast roles. Sun Flower, Pea Shooter and Frost Shooter
supply sun, ranged damage and slow. Invaders are Drifter, Ridgecap and Ironhelm:
plain creatures with cloth caps / iron helmets rather than licensed characters.

P / Escape pauses; 1–5 select seeds; arrows on the focused lawn pick a tile;
Enter plants; C collects all sun. Each lane has one single-use sweeping mower.
Clear all three waves to unlock the next of five gardens. A second breach in an
already-cleared lane loses. Retry resets the run but keeps unlocks.

The game auto-pauses on a hidden tab, and optionally on window blur via shared
settings. A versioned `garden-guard.save` includes every entity, projectile, sun,
cooldown, random-generator state, mower and wave cursor plus level unlocks.
It saves on planting / collecting / pausing / leaving and every 3 simulation seconds.
Reloads always wait for an explicit Resume. Malformed saves reset safely; blocked
storage keeps play available in memory. Shared Clear all game progress removes
this save. No other game's keys are written.

## Modules / extension points

- `core/data.js`: plant / invader stats and identifiers. GG-1b can extend the tables.
- `core/levels.js`: five deterministic schedules; events carry seconds / row / type / wave.
- `core/engine.js`: pure 60 Hz simulation and validated JSON snapshots; browser + Node.
- `core/storage.js`: versioned local persistence.
- `ui/settings.js`: optional shared bridge with fallback, live Hub / system theme.
- `ui/render.js`: original shape drawing, DPR-aware fitting and hit coordinates.
- `ui/app.js`: input, state cards, focus trap, save lifecycle and render-throttled loop.
- `ui/style.css`: viewport / safe-area layout. Portrait uses a play-small lawn and
  rotate hint. At the tested phone sizes all tile and control targets are >=40px;
  sun targets are >=40px regardless of canvas scale.
- `assets/garden-guard_icon.svg`: editable icon source; 128px PNG rendered with PIL.

Combat stays fixed at 1/60 s, independent of the shared drawing FPS setting.
Catch-up is capped at 0.15 s per animation frame so an interrupted frame cannot
skip combat collisions. Low graphics removes grass details and lowers DPR.
GG-1c can add sound / effects without changing the pure simulation.

## Tests

From the repository root:

```sh
node --test apps/games/garden-guard/tests/engine.test.cjs
python3 -m http.server 8826 --bind 127.0.0.1
# In another shell; puppeteer-core can be installed in an external scratch folder:
GG_PUPPETEER=/workspace/gg-test/node_modules/puppeteer-core \
  node apps/games/garden-guard/tests/browser.cjs
```

The browser script uses `/usr/bin/google-chrome` (`CHROME` may override it).
Screenshots are local test artifacts under `/workspace/gg-test`, not shipped files.
`?test=1` disables RAF and exposes deterministic advancement of the same engine;
production has no test hook. `tests/strategy.js` only collects sun and makes legal
paid placements; it never edits combat stats or simulation state.

Verified: 19 Node cases including combat, cooldowns, sun, mower, scripted waves,
corrupt saves, deterministic continuation, all five level wins with legal placement,
and a no-plants loss. 23 Chrome checks cover pointer/touch, full save/resume and
unlock persistence, pause/help, hidden-tab handling, theme, settings fallback,
production RAF autosave, file-URL play, no console errors, and 844×390 / 390×844 viewports at DPR 2.
No real-phone testing yet. Sounds and richer animations are deferred to GG-1c.
