# Arrow Escape — ARW-1a

Original, offline-friendly arrow-removal puzzle. Open `arrow-escape.html` from the Hub.
Auto (System) theme follows Hub Light/Dark first, then the operating system. Shared
settings gear returns with `?from=arrow-escape`. The catalog opens windowed.

## Play
Tap a straight arrow to send it towards its head. It exits only when its forward
ray is clear. Blocked arrows advance to the obstacle, bump back, and cost one of
three lives. Undo restores moves and lives. Hints highlight a safe arrow, cost a
star, and have a five-second cooldown. Three stars means no bumps or hints; one
penalty earns two stars and two or more earn one. Levels unlock sequentially.

The 500 seeded levels increase from 5×5 to 12×12, with increasing target density
and more interlocking dependencies. Each arrow has a 1–3 cell body and a head.
The generator reverse-places clear arrows. The reverse insertion order is a
solution: newer arrows may block older ones, never the other way around. A
complete monotonic greedy solver independently verifies each generated board.
Removing a safe arrow cannot obstruct any other arrow, so no backtracking is needed.

SVG stays crisp at every DPR. Every occupied cell is a tap target at least 40 px.
Large boards scroll instead of shrinking targets below 40 px. Desktop, portrait
phone and short landscape layouts keep the controls in view. Use Tab + Enter or
Space for keyboard play. Reduced-motion settings skip slide animations.

Progress, stars and the current board with undo history are stored only on this
device (`arrow-escape.save.v1`). Denied or full storage falls back to the session.
No network, tracking or image assets are needed by the game.

## Tests
From the repository root:

```sh
node --test apps/games/arrow-escape/tests/core.test.mjs
python3 -m http.server 8830 --bind 127.0.0.1
# Install puppeteer-core into a separate scratch directory, not this repository.
ARW_PUPPETEER=/workspace/arw-test-deps/node_modules/puppeteer-core \
  node apps/games/arrow-escape/tests/browser.mjs
```

Chrome: `/usr/bin/google-chrome`; HTTP test port: **8830**. Unit tests verify all
500 solutions, deterministic boards, collisions, lives, undo and persisted resume.
Browser checks solve levels 1/245/500, reload mid-board, exercise hints and bumps,
check 390×844 and 844×390 at DPR 3, settings theme and console errors.

Tile source: `assets/icon-source.py` (Pillow), original 128×128 grid and arrows.
Real-phone hardware testing remains outstanding.
