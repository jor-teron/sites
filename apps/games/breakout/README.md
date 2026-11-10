# Breakout — BRK-1

Original geometry-only brick game; classic scripts and no runtime dependencies.
Open `index.html` / `breakout.html`, directly or inside the Hub's default window.

- `core/config.js`: dimensions, speed limits and power durations.
- `core/levels.js`: ten handmade layouts; randomized boards from level 11 onward.
- `core/physics.js`: testable model; fixed 60 Hz steps with adaptive collision sub-steps
  travelling at most 0.45 ball radii. Multiple-hit and permanent bricks, paddle-angle
  rebounds, speed ramp, five catchable powers and up to eight simultaneous balls.
- `core/storage.js`: validated versioned `breakout.save` and `breakout.best` keys.
- `core/game.js`: input, independent render throttle, pause/help/over cards and saves.
- `ui/`: original canvas drawing, shared-theme/settings bridge and synthesized sounds.
- `assets/make-icon.py`: reproducible Pillow source for the 128 px icon.

Mouse movement, touch dragging, arrows or A/D move the paddle. Launch button / Space
starts a ball. P / Escape pauses. Laser power fires automatically. Powers last 16
seconds; multi-ball and life are instant. New levels / life loss reset timed powers.
Only losing the final ball costs a life. A hidden tab always pauses; blur follows
shared `autoPause`. Reload opens a saved game paused rather than losing a ball.

Auto is the shared theme default and follows `sites-hub.theme` before the device.
Settings and save storage can be unavailable without preventing a new game.
The shared FPS setting changes drawing only, not the 60 Hz simulation. No build bump.
Catalog and app index are wired; legacy `hub/core/hub_apps.js` is owned by the Hub bot
and deliberately untouched. No shared or service-worker changes.

## Tests

From repository root:

```sh
node apps/games/breakout/tests/physics.cjs
python3 -m http.server 8824 --bind 127.0.0.1
# In another terminal (requires puppeteer-core and Chrome):
PUPPETEER_PATH=/path/to/puppeteer-core CHROME_PATH=/usr/bin/google-chrome \
  node apps/games/breakout/tests/browser.cjs
```

Browser tests use the installed `puppeteer-core` package or `PUPPETEER_PATH`.
They cover real collision-based board clearance, powers, controls, pause, saves,
themes, 390×844 / 844×390 touch viewports, DPR scaling and console errors. Test-only
controller access is enabled by `?test=1`; normal play does not publish this hook.
Physics tests also clear all ten boards and simulate 30 minutes of seeded autoplay.
Headless checks are not a substitute for testing on a physical phone.
