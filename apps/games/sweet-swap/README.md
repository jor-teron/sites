# Sweet Swap — SWAP-1a

Original match-3 core: six gradient silhouettes, 8×8 board, tap/swipe/mouse/keyboard swaps,
25 moves, ten generated score targets, cascades, three stars, hints and free dead-board reshuffles.
No specials, map, sound or heavy effects yet (reserved for 1b/1c). No external artwork or runtime dependencies.

- `core/matches.js`: pure board rules, match groups with row/column/L/T/cross shape and runs.
- `core/progress.js`: generated goals, star thresholds and validated versioned localStorage.
- `core/game.js`: input locks, atomic turn resolution, HUD and end/pause/help cards.
- `ui/`: shared theme/settings bridge, DPR-independent DOM rendering, pointer/keyboard input and layout.
- `assets/make-icon.py`: reproduce the 128px PNG with Pillow.

Save keys: `sweet-swap.save` and `sweet-swap.best`. A reload halfway through an animation restores
before that turn; only settled playable boards are saved. Unavailable storage falls back to memory.
Ten levels can be selected directly; Next after level 10 wraps to level 1. Stars are awarded at
100% / 140% / 180% of the target. Reaching the target does not consume the remaining moves.

## Tests

From the repository root:

```sh
node --test apps/games/sweet-swap/tests/rules.test.cjs
python3 -m http.server 8825 --bind 127.0.0.1
# In another shell with puppeteer-core installed outside this repository:
NODE_PATH=/path/to/node_modules node apps/games/sweet-swap/tests/browser.cjs
```

Chrome defaults to `/usr/bin/google-chrome` (override with `CHROME`). Optional `SWAP_SHOTS` is an
existing directory outside the repository for viewport captures. Tests need no server or app changes.
Phone checks are headless simulations, not a real-device verification.
