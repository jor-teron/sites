# Games settings (GS1)

One shared settings page + tiny library for **every game** in `apps/games/`.
Players set theme, FPS limit, sound, controls and difficulty once; each game reads them.

- `games-settings.js` — classic script (no build, works from `file://`), sets `window.GameSettings`.
- `games-settings.html` / `.css` — the settings page (phone-first, Hub colours). Open with
  `games-settings.html?from=<game-folder>` to get a "‹ Back to game" link to `../../<game-folder>/index.html`.
- Games menu: the **Game Settings** tile (`games-apps.csv`, section *Settings*) opens the page without `?from=`;
  its Back link then returns to the Games tiles page (`../../games.html`). This page is the games-wide control panel.
- Storage: **one** localStorage key, `games.settings` (JSON). Missing/invalid fields fall back to defaults.

## Settings

| Key | Type | Values / range | Default |
|---|---|---|---|
| theme | enum | `auto` (game default), `light`, `dark` — optional per game, see below | `auto` |
| fpsLimit | enum (number) | 30, 45, 60 | 30 |
| lowGraphics | bool | | false |
| screenShake | bool | | true |
| masterVolume | number | 0 – 1 | 0.8 |
| music | bool | | true |
| sfx | bool | | true |
| vibration | bool | | true |
| controlsSide | enum | `right`, `left` (joystick side) | `right` |
| joystickSize | number | 0.6 – 1.6 (scale) | 1.0 |
| buttonOpacity | number | 0.2 – 1 | 0.8 |
| sensitivity | number | 0.3 – 2 (multiplier) | 1.0 |
| showHints | bool | | true |
| difficulty | enum | `easy`, `normal`, `hard` | `normal` |
| autoPause | bool | pause on `visibilitychange` | true |
| showFps | bool | | false |
| renderDistance | enum (number) | 3, 4, 5 (chunks of 16 blocks; 3D games) | 5 |
| pixelRatio | enum | `auto` (game default), 1, 1.5, 2 | `auto` |
| autoJump | bool | touch: hop up 1-block steps | true |
| holdRepeat | bool | touch: holding an action button repeats it | true |

Numbers are clamped to their range; enums accept strings like `"60"`.

**Theme is optional.** Most games (~90%) keep their own look and ignore `theme`. Only plain board / menu-style
games follow it (Tic-Tac-Toe, Tetris). The settings page says so under the Theme row.

## API (`window.GameSettings`)

| Call | Does |
|---|---|
| `get(key)` | current value |
| `set(key, value)` | validate + save; returns stored value, `undefined` if rejected |
| `all()` | copy of all settings |
| `onChange(cb)` | `cb(changed, all)` on change in this tab **and other tabs** (storage event); returns unsubscribe |
| `reset()` | back to defaults (removes the key) |
| `fps()` / `frameMs()` | `fpsLimit` and `1000 / fpsLimit` |
| `mountGear(elOrPos, gameName)` | adds a ⚙ link to the page with `?from=gameName`. `elOrPos` = element, or `'top-right'`, `'bottom-left'`, … (fixed) |
| `pageUrl(gameName)` | URL of the settings page |
| `importAll(obj)` | apply an object (valid fields only), returns count |
| `progressKeys()` / `clearGameProgress()` | list / delete game save keys (see below) |
| `SCHEMA`, `KEY`, `defaults()` | for tools and tests |

## Linking a game (example)

```html
<script src="../common/settings/games-settings.js"></script>  <!-- before your game scripts -->
<script>
  const GS = window.GameSettings;                          // may be undefined: game must still work
  const S = GS ? GS.get.bind(GS) : k => ({ fpsLimit: 30, difficulty: 'normal', showHints: true })[k];
  let step = 1 / (S('fpsLimit') || 30);                    // fixed timestep; keep physics per second
  const diff = CONFIG.difficulty[S('difficulty')] || CONFIG.difficulty.normal;
  if (GS) GS.onChange(ch => { if ('fpsLimit' in ch) step = 1 / GS.fps(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S('autoPause')) pause(); });
  if (GS) GS.mountGear('top-right', 'my-game');            // ⚙ opens settings, Back returns here
</script>
```

Tennis Ball Blitz shows the fuller pattern: `apps/games/tennis-throw/modules/settings.js` (bridge with fallback).
Classic-script games (no modules, work from `file://`) use a global bridge file instead, e.g.
`tetris/tetris_settings.js` (`TETRIS_SETTINGS`), loaded after the game config and before the logic.

## Rules

1. **The game must work without this script** (blocked, offline, old copy): fall back to defaults.
2. Read settings at startup **and** on `onChange` (the page may be open in another tab).
3. Only write `games.settings` via `GameSettings.set` from the settings page or an in-game option; **never write other games' keys**.
4. Settings a game cannot use are simply ignored (say so in the game's header comment, e.g. "no sound").
5. Keep physics per second, so `fpsLimit` only changes step rate, not game speed.
6. Put per-game numbers (e.g. what "hard" means) in the game's own config, not here.
7. Keep your own save keys prefixed with your folder name + `.` / `-` / `_` (e.g. `snake.best`), so "Clear all game progress" finds them.

## Clear all game progress — how keys are identified

Conservative: a key is deleted only if it **starts with a game folder name followed by `.`, `-` or `_`**
(list in `GAME_PREFIXES` in `games-settings.js`), or is one of the short aliases already in use
(`td_`, `nf3d.`, `slingbirds.`, `hero-viewer-`, exact `td_best`). `games.settings` itself is never cleared,
nor are Hub/Learn/other keys. The page lists the keys and asks to confirm first.
**New game folder?** Add it to `GAME_PREFIXES`.

## Adding a new setting

1. Add it to `SCHEMA` in `games-settings.js` (`type` bool/num/enum, `def`, `min/max` or `values`).
2. Add a row to `FIELDS` in `games-settings.html` (group, key, label, `toggle`/`range`/`select`).
3. Add it to the table above. Old stored JSON keeps working (missing key = default).

## Rollout status

| Game | Status | Notes |
|---|---|---|
| Tennis Ball Blitz (`tennis-throw`) | done (TB4/GS1, TB9) | fpsLimit, difficulty (round goal, round time, bird speed), vibration, showHints, showFps (real-time), autoPause, theme (dark sky), sfx + masterVolume (WebAudio blips), lowGraphics (fewer particles), gear |
| LandCraft (`landcraft`) | done (LC3) | fpsLimit (render throttle), renderDistance (+ fog), pixelRatio (`auto` = up to 2, or 1 with lowGraphics), sensitivity, showFps, autoJump + holdRepeat (touch only), gear. No sound; theme, difficulty, autoPause, vibration, joystick/button options unused |
| Tetris (`tetris`) | done (GS2) | fpsLimit (draw throttle; gravity on real time, catches up missed steps), difficulty (fall-speed multiplier in `tetris_config.js`), theme (`light` = inverted B/W, auto/dark = classic black), autoPause, showHints (controls help), showFps, vibration (lines / game over), gear (top-right). No sound; controls/3D options unused |
| Tic-tac-toe (`tic-tac-toe`) | done (GS2) | difficulty (vs CPU Easy win/block chances in config; Hard stays perfect play), theme (light/dark colours), vibration (win/loss; hub rumble or phone), gear (button row). No loop/timer or sound: fpsLimit, showFps, autoPause, sound unused |
| 2048 (`2048`) | done (GS2) | vibration (big tile / 2048 / game over; hub rumble or phone), gear (button row). Turn-based CSS animations, no sound: fpsLimit, showFps, autoPause, sound unused; difficulty/hints not meaningful; always dark |
| Swell Foop (`swell-foop`) | done (GS2) | fpsLimit (fall animation + animated-theme idle redraw; fall timed in ms), showFps, vibration (big group / game over), gear (button row). No sound; turn-based so autoPause unused; difficulty/hints not meaningful; page stays dark (block look = game's own Theme picker) |
| Ant Farm (`ant-farm`) | done (AF2) | fpsLimit (frame cap; colony runs on real time), showFps (in the stats bar), autoPause (pauses when the tab is hidden), lowGraphics (no pheromone trails or clouds), gear (in the top bar). Sandbox with no sound: difficulty, theme, vibration, controls options unused |
| All other games | pending | |
