# Games — quick guide for Team 2 / Team 3

Read this first, then `common/settings/README.md` (the full settings reference).
This file covers only the shared parts, the house rules and how we work. It does not repeat the README.

## What is shared

Everything shared lives in `common/settings/` (release GS1):

| File | What it is |
|---|---|
| `games-settings.js` | Small library, a classic script, sets `window.GameSettings`. All settings are saved in ONE localStorage key, `games.settings`. |
| `games-settings.html` + `.css` | The settings page players see (theme, FPS limit, sound, controls, difficulty, ...). `?from=<game-folder>` adds a "Back to game" link. |
| Games menu tile **Game Settings** | Opens the settings page from the Games menu (`games-apps.csv`, section *Settings*). This is the games-wide control panel; Back returns to the Games menu. |
| `README.md` | Full list of settings, the API, the 7 rules, "Clear all game progress", how to add a new setting, and the **rollout table**. |

## House rules

1. **Must open from `file://`.** Use classic `<script>` tags, no ES modules (`import` / `type="module"` fail from file://).
   Known exception: LandCraft uses ES modules; converting it (LC1) is parked.
2. **30 fps cap, real-time movement.** One `requestAnimationFrame` loop that skips frames until the next 1/fps slot.
   Speeds are per second (or per ms), so the game plays at the same speed at 30, 45 or 60 fps.
3. **Modular code with header comments.** Config (numbers, text, keys) in a config file; logic in its own files.
   Each file starts with a comment saying what it does, what it uses and which settings it ignores.
4. **Graceful fallback.** If `games-settings.js` is missing or blocked, the game still runs with its old defaults (no gear shown).
5. **Phone / touch first.** Test portrait and landscape on a small screen; touch must work without a keyboard.
6. **Theme is optional.** Most games (~90%) keep their own look and ignore the shared `theme`.
   Only plain board / menu-style games follow it (e.g. Tic-Tac-Toe, Tetris). Don't restyle an art-heavy game for it.
7. **Weak phone.** The target is a Lava Play Ultra 5G (and a weak PC): keep draw calls, particles and canvas size modest.

## How to link a game (5 steps)

1. **Load the library** before the game's own scripts:
   `<script src="../common/settings/games-settings.js"></script>`
2. **Add a per-game settings file** (a "bridge") loaded after the config and before the logic.
   It wraps `GameSettings` and falls back to fixed defaults when the library is missing.
   Examples: `tetris/ui/settings.js`, `tic-tac-toe/ui/settings.js`, `tennis-throw/ui/settings.js`.
3. **Add the gear** with `mountGear(target, '<game-folder>')`. The folder name becomes `?from=`, so Back returns to the game.
4. **Apply the settings** that fit: read them at start and again in `onChange` (the settings page may be open in another tab).
   Typical: `fpsLimit`, `difficulty`, `autoPause`, `showHints`, `showFps`, `vibration`, sound volume.
   `theme` only if the game is a plain board / menu style (rule 6).
   Per-game numbers (what "hard" means) go in the game's config, not in the library.
5. **Update the rollout table** at the end of `common/settings/README.md`: status plus which settings are used and which are not.

Tiny bridge example (classic script, works from file://):

```js
/* my-game_settings.js — shared Games Settings bridge, fallback if the library is missing */
var MYGAME_SETTINGS = (function () {
  var GS = window.GameSettings;
  var FALLBACK = { fpsLimit: 30, difficulty: "normal", autoPause: true, vibration: true };
  return {
    get: function (k) { return GS ? GS.get(k) : FALLBACK[k]; },
    frameMs: function () { return GS ? GS.frameMs() : 1000 / 30; },
    onChange: function (cb) { return GS ? GS.onChange(cb) : function () {}; },
    mountGear: function (where) { return GS ? GS.mountGear(where, "my-game") : null; }
  };
})();
```

Then in the game: `MYGAME_SETTINGS.mountGear("top-right")` (or pass a button-row element),
use `frameMs()` in the loop's frame skip, and re-apply changed values in `onChange`.

## Status

Linked (see the rollout table for details): Tennis Ball Blitz (`tennis-throw`), LandCraft (`landcraft`),
Tetris, Tic-Tac-Toe, 2048, Swell Foop, Ant Farm (`ant-farm`).

Next batches:
1. Games that already have a 30 fps loop: Turbo Lap (`turbo-lap`), Desert Road (`desert-road`), ...
2. Then games with difficulty and/or sound.

## Workflow

- Work in your **own copy** of the repo. Never edit `hub/` files.
- Commit **locally** as jor-teron with the noreply email, staging explicit paths only:
  `git -c user.name=jor-teron -c user.email=1854500+jor-teron@users.noreply.github.com commit ...`
- **Do not push.** Only Hub Main Bot (Team 1) pushes.
- Adding or changing a game tile? Edit `games-apps.csv` and commit the CSV; Main Bot regenerates the hub indexes.
- New game folder? Also add it to `GAME_PREFIXES` in `games-settings.js` (see the README) so "Clear all game progress" finds its saves.

## Known gaps

- **Tetris landscape:** on short landscape screens (phone sideways) the board is cut off; the board is only fitted in portrait.
- **LandCraft:** LC1 (file:// support, no ES modules) and LC2 are parked.
- **Inside the hub:** 2048, Swell Foop and Tic-Tac-Toe put the gear in their own button row, which the hub hides,
  so there is no gear there (Tetris's gear is fixed top-right and stays visible).
