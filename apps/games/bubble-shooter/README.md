# Bubble Shooter · BUB-1

An original offline canvas game. Open `index.html` or `bubble-shooter.html`; no build step or network assets.

- **20 authored levels**, followed by Endless (unlocked after level 20). Endless adds a pair of rows every ten shots or whenever the board is cleared.
- Six colours each have their own inner symbol. Mouse click or touch drag/release aims and fires; arrows aim, Space fires, X swaps, P/Esc pauses.
- Hex-offset geometry uses six reciprocal neighbours. Swept ray/circle collision is calculated before a shot animates, independent of drawing FPS. The dotted guide shows one reflection; shots can reflect again.
- A group of three or more pops. Floating clusters drop. Pop points = `10 × group size × combo` (combo capped at five); drops = 25 each. Clearing adds up to 500 efficiency points.
- The ceiling descends after 4–6 consecutive non-popping shots (shown in the HUD). Any bubble touching the pink bottom line ends the round.
- Clears earn one star, two if shots ≤ half the initial bubble count, three if shots ≤ one third + 1. Best stars for each level are retained.
- `bubble-shooter.save` stores the last **settled** shot. Reloading during a flight restores the state before that shot. `bubble-shooter.progress` stores unlocks/stars; `bubble-shooter.best` is the highest round score. Storage-denied/private mode remains playable without persistence.
- Auto theme follows `sites-hub.theme` then system preference. Shared settings include FPS, volume/SFX, low graphics/reduced motion, hints, vibration and optional focus-loss pause. Hidden tabs always pause. No music or difficulty setting is used.
- Graphics and sounds are drawn/synthesized in code. The PNG icon is made with PIL; the matching original SVG source lives in `assets/`.

## Files

`core/rules.js` is pure and Node-compatible. `core/levels.js` holds all twenty layouts. `core/game.js` handles input, modal cards, animation and persistence. `ui/` owns drawing, layout, settings and sound.

## Tests

```sh
node --test apps/games/bubble-shooter/tests/rules.test.cjs
# From the repository root, in a separate terminal:
python3 -m http.server 8831 --bind 127.0.0.1
# Install puppeteer-core outside the repository, or use an existing installation:
PUPPETEER_PATH=/path/to/node_modules/puppeteer-core node apps/games/bubble-shooter/tests/browser.cjs
```

The browser suite uses headless Chrome (`CHROME_BIN` overrides `/usr/bin/google-chrome`) on port **8831**. It plays level one through real pointer input, triggers a ceiling-drop loss, checks exact save/resume, themes, shared settings, keyboard and touch input, and 390×844 / 844×390 phone layouts. Screenshots are written to `/tmp/bub-*.png`, not the repository. Real phone hardware remains untested.
