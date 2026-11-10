# Arrow Escape — ARW-1a + ARW-1b

Original, offline-friendly arrow-removal puzzle. Open `arrow-escape.html` from the Hub.
Auto (System) theme follows Hub Light/Dark first, then the operating system. Shared
settings gear returns with `?from=arrow-escape`. The catalog opens windowed.

## Play
Tap an arrow to send it towards its head. It exits only when its forward
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
No network or tracking is needed by the game; its only image is the Hub tile.

## ARW-1b: curves, keys and daily

From level 50, L and zigzag bodies uncoil along their own path: the tail follows
its preceding segment while the head advances along its fixed exit ray. Entering
a still-occupied own segment is forbidden; entering a vacating tail is safe.
From level 125, clear a **K-number** key to release the matching **L-number** lock.
Locked taps never cost lives or moves. Keys and locks carry matching numbers,
not just colours. Undoing a key restores its lock. Locks always reference a
later reverse-placed key, so they cannot introduce dependency cycles.

The Daily uses a date seed with a **midnight IST** boundary, a streak and best
stars. Replaying a date cannot increase the streak. Missing a date breaks it.
Campaign and daily sessions are saved separately when switching between them;
reload resumes the active session. An old daily automatically rolls over.

Pause (Ⅱ or Escape) opens Resume, How to play, Daily, sound mute, and the same
five theme names as Unblock: Classic, Wood, Car & Bus, Floor Tiles and Stone.
Textures and the little vehicles are original SVG/CSS. Shared `sfx` and volume
control synthesized sounds. Shared lowGraphics disables confetti; screenShake,
vibration, autoPause and showHints are respected. Reduced motion skips slides,
shakes and celebration. Settings Auto remains the default.

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
500 solutions plus 30 daily date seeds, deterministic and disjoint boards, independent
geometric collision checks, snake movement, locks, lives, undo, streaks and persisted resume.
Browser checks solve levels 1/245/500, reload mid-board, exercise hints and bumps,
solve today’s daily twice (idempotent streak), test locks and undo, all five themes,
pause/help/mute, real slide animation, level locking and campaign/daily switching,
then check 390×844 and 844×390 at DPR 3, settings theme and console errors.

Tile source: `assets/icon-source.py` (Pillow), original 128×128 grid and arrows.
Verified: **13/13 Node test groups** (all 500 levels + 30 daily seeds),
**74 Chrome assertions**, no console errors. ARW-1a separately passed its five
Node groups and 38 browser assertions before the ARW-1b commit.
Real-phone hardware testing remains outstanding.

## Verified difficulty (100-level groups)

| Levels | Mean arrows | Occupied cells | Mean removal dependency layers |
| --- | ---: | ---: | ---: |
| 1–100 | 4.4 | 46.1% | 2.8 |
| 101–200 | 8.0 | 53.2% | 4.3 |
| 201–300 | 13.3 | 59.6% | 5.7 |
| 301–400 | 21.6 | 66.5% | 7.2 |
| 401–500 | 30.8 | 71.6% | 8.4 |

Each individual seed varies; the progression rises across all three measures.
No build bump, service-worker changes or Hub legacy-list edits are included.
