# Minesweeper · MINE-1

Original no-build minefield game. Open `minesweeper.html` (or `index.html`).
Classic scripts also work from `file://`; storage may be unavailable there.

- Easy 9×9/10; Medium 16×16/40; Hard 30×16/99.
- Custom: 5–40 columns, 5–30 rows, 1 to cells−9 mines; values clamp on Start.
- First reveal excludes its entire neighbourhood. Later guesses can be necessary.
- Tap/click reveals; right-click or 400 ms hold flags; optional ? marks default off.
- Clicking a revealed number chords when its adjacent flag count matches.
- Flag-mode tap button, keyboard arrows / Enter / Space / F, touch-drag panning.
- Fit uses 20–36 px cells, with scroll for large boards; Large/XL select 32/40 px.
- Original synthesised sounds respect shared sfx and volume, plus local mute.
- Auto theme follows `sites-hub.theme` light/dark then the device preference.
- Timer counts visible play time and pauses for How to play. Hidden/offline time
  is not added when resuming. A closed page may lose its last second on a crash.

## Files and storage

`core/rules.js`: DOM-free rules and validated restore. `core/game.js`: wiring,
clock and persistence. `ui/`: input, rendering, theme/settings, audio, CSS.
`assets/draw_icon.py`: original mine-on-grid PNG generator (Pillow).

Progress keys: `minesweeper.save` (version 1 live game and elapsed milliseconds),
`minesweeper.best` (best time by preset; custom records keyed by dimensions and
mine count), `minesweeper.options` (mute and ? marks). Corrupt saves are discarded;
blocked storage falls back to an in-memory game. Completed games restart after
reload; records remain. Shared Games Settings can clear these keys.

## Tests

Run from repository root:

```
node apps/games/minesweeper/tests/rules.test.cjs
npm install --prefix .test-tools puppeteer-core
python3 -m http.server 8823 --bind 127.0.0.1
# In another shell:
node apps/games/minesweeper/tests/browser.test.cjs
```

Browser tests use system `/usr/bin/google-chrome`; override with `CHROME_PATH`.
`MINE_PUPPETEER` can point to another Puppeteer Core installation. The core suite
checks 4,210 seeded first openings including every cell of all three presets and
a dense custom board. Browser tests cover desktop and 390×844 / 844×390 phones,
real touch gestures, chording, victory/defeat, records, save/resume, theme changes,
settings return, mute, keyboard, paused help timer and denied storage.

Catalog wiring is in Games CSV, generated `hub_catalog.js`, `hub_appindex.js`
and the shared settings progress-prefix list. Hub menus read the category CSV;
no edit to the archived `hub_apps.js` list is needed. New-tab is blank/0 so the
Hub opens the game Windowed. No shared infrastructure or build version changed.
