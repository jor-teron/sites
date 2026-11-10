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

Tennis Ball Blitz shows the fuller pattern: `apps/games/tennis-throw/ui/settings.js` (bridge with fallback).
Classic-script games (no modules, work from `file://`) use a global bridge file instead, e.g.
`tetris/ui/settings.js` (`TETRIS_SETTINGS`), loaded after the game config and before the logic.

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
| Tetris (`tetris`) | done (GS2) | fpsLimit (draw throttle; gravity on real time, catches up missed steps), difficulty (fall-speed multiplier in `tetris/core/config.js`), theme (`light` = inverted B/W, auto/dark = classic black), autoPause, showHints (controls help), showFps, vibration (lines / game over), gear (top-right). No sound; controls/3D options unused |
| Tic-tac-toe (`tic-tac-toe`) | done (GS2) | difficulty (vs CPU Easy win/block chances in config; Hard stays perfect play), theme (light/dark colours), vibration (win/loss; hub rumble or phone), gear (button row). No loop/timer or sound: fpsLimit, showFps, autoPause, sound unused |
| 2048 (`2048`) | done (GS2) | vibration (big tile / 2048 / game over; hub rumble or phone), gear (button row). Turn-based CSS animations, no sound: fpsLimit, showFps, autoPause, sound unused; difficulty/hints not meaningful; always dark |
| Swell Foop (`swell-foop`) | done (GS2) | fpsLimit (fall animation + animated-theme idle redraw; fall timed in ms), showFps, vibration (big group / game over), gear (button row). No sound; turn-based so autoPause unused; difficulty/hints not meaningful; page stays dark (block look = game's own Theme picker) |
| Ant Farm (`ant-farm`) | done (AF2) | fpsLimit (frame cap; colony runs on real time), showFps (in the stats bar), autoPause (pauses when the tab is hidden), lowGraphics (no pheromone trails or clouds), gear (in the top bar). Sandbox with no sound: difficulty, theme, vibration, controls options unused |
| Connect 4 (`connect-4`) | done (C4-1) | theme (light/dark; auto = Hub theme), sfx + masterVolume (WebAudio beeps), difficulty (default CPU level), fpsLimit (drop animation, max 30), vibration, gear (button row). showFps, autoPause, controls unused |
| Game of Life (`game-of-life`) | done (LIFE-1) | theme (light/dark; auto = Hub theme), fpsLimit (render cap, max 30; generations on real time), autoPause, gear (button row). No sound; difficulty, vibration, controls unused |
| Go (`go`) | done (GO-1) | theme (light/dark; auto = Hub theme), sfx + masterVolume (WebAudio clicks), difficulty (default CPU level), vibration (capture / game end), gear (button row). Draws on change only, no loop: fpsLimit, showFps, autoPause, controls unused |
| Blockade (`blockade`) | done (BLKD-1) | theme (light/dark; auto = Hub theme), sfx + masterVolume (WebAudio beeps), difficulty (default CPU level), vibration (win / loss), gear (button row). Draws on change only, no loop: fpsLimit, showFps, autoPause, controls unused |
| Battleship (`battleship`) | done (SHIP-1) | theme (light/dark; auto = Hub theme), sfx + masterVolume (WebAudio sounds), difficulty (default CPU level), vibration (hit / sunk / win / loss), gear (button row). Draws on change only, no loop: fpsLimit, showFps, autoPause, controls unused |
| Ludo (`ludo`) | done (LUDO-1a, LUDO-1b, LUDO-1c) | theme (light/dark; auto = Hub theme), difficulty (first computer level a seat gets in New game: easy/normal/hard → Easy/Medium/Hard), sfx + masterVolume (WebAudio roll / move / capture / home / win), vibration (capture, home, a player finishes), lowGraphics (no token slide or die tumble; also off for reduced motion), gear (button row). Short animations only (30 fps cap, no loop otherwise): fpsLimit, showFps, autoPause, controls unused |
| Orbito (`orbito`) | done (ORB-1) | theme (light/dark; auto = Hub theme), difficulty (first computer level: easy/normal/hard → Easy/Medium/Hard), sfx + masterVolume (WebAudio place / push / board turning / win / lose / draw), vibration (placing, game end), lowGraphics (no board-turning or push animation; also off for reduced motion), gear (button row). Short animations only (30 fps cap, no loop otherwise): fpsLimit, showFps, autoPause, controls unused |
| Star Pinball (`pinball`) | done (PIN-1c) | theme (light/dark; auto = Hub theme), fpsLimit (drawing rate; the physics always runs in fixed 1/1440 s sub-steps), lowGraphics (fewer stars, no glow, 1x pixels), autoPause (also pause on window blur; a hidden tab always pauses), sfx + masterVolume (WebAudio sounds for flippers, bumpers, slings, targets, spinner, ramp, hole, missions, ranks, drain, ball save, nudge, tilt, game over; volume 0 = silent), vibration (bumper, mission done, tilt, drain), screenShake (camera shake on big hits), gear (title bar). Effects (flashes, shake, mission light show) are off for lowGraphics or the device's reduced-motion setting. High score in `pinball.best`; the game in progress (score, ball, rank, mission, multiplier, bonus, lanes, drop targets) in `pinball.save`. Unused: music, difficulty, controls |
| Minesweeper (`minesweeper`) | done (MINE-1) | theme (Auto = Hub light/dark then system), sfx + masterVolume (original WebAudio), gear (`?from=minesweeper`). Local mute and ? marks: `minesweeper.options`; board/timer: `minesweeper.save`; best times per difficulty/custom size: `minesweeper.best`. Turn-based: fpsLimit, showFps, autoPause, difficulty, vibration and controls unused. Timer always pauses when hidden or help is open |
| Unblock (`unblock`) | done (UNB-2) | theme (light/dark; auto = Hub theme), vibration (win), gear (`?from=unblock`). No sound; turn-based so fpsLimit, showFps, autoPause, difficulty, controls unused |
| Snake & Ladder (`snake-ladder`) | SNL-2a/b/c | theme (Auto follows Hub then device), lowGraphics (reduced motion also respected), sfx + masterVolume, difficulty (default CPU pace/coaching; fair dice at every level), gear. Save: `snake-ladder.save` (settled turns only). No loop: FPS/controls/3D/music unused |
| Bubble Shooter (`bubble-shooter`) | done (BUB-1) | Auto theme follows Hub Light/Dark; fpsLimit; lowGraphics / reduced motion (particles); sfx + masterVolume; autoPause (hidden tab always pauses); showHints (guide); vibration; gear. Saves: `bubble-shooter.save`, `.best`, `.progress`. Unused: music, difficulty, screenShake, joystick and 3D options |
| Arrow Escape (`arrow-escape`) | done (ARW-1a/1b) | theme (Auto = Hub Light/Dark then system), sfx + masterVolume (synthesized slide / bump / key / win), vibration (win), screenShake (bumps), lowGraphics (no confetti), autoPause (tab hidden), showHints (coach text), gear. Progress: `arrow-escape.save.v1`; board themes: `arrow-escape.board-theme`. Turn based: fpsLimit, music, difficulty and controls unused |
| Star Colony (`star-colony`) | done (SC-1c) | theme (Auto follows Hub Light/Dark), fpsLimit (draw only; fixed 0.25 s simulation), lowGraphics and reduced motion (less weather and lighting), autoPause (blur; hidden tabs always pause), sfx + masterVolume (synthesized alerts and build sounds), gear. Save `star-colony.save` and local mute `star-colony.muted`. No music; difficulty, showFps, vibration and joystick options unused |
| Jigsaw (`jigsaw`) | done (JIG-1a) | theme (Auto follows Hub Light/Dark then system), fpsLimit (drag redraw cap), autoPause (pause card when hidden), showHints (footer), gear. No sounds or rotation. Save/groups in `jigsaw.save`; best times per picture/size in `jigsaw.best`; last local photo in `jigsaw.photo`. Other settings unused |
| Garden Guard (`garden-guard`) | done (GG-1a) | Auto (System) theme follows Hub Light/Dark then device; fpsLimit caps drawing only (combat fixed at 60Hz); lowGraphics lowers DPR and removes grass details; autoPause on blur (hidden tabs always pause); gear. Full run and unlocks in `garden-guard.save`. No sound; difficulty and other controls unused |
| Sweet Swap (`sweet-swap`) | done (SWAP-1a) | theme (Auto follows Hub then device), showHints (idle move glow), lowGraphics / reduced motion (instant moves), gear (`?from=sweet-swap`). Saves `sweet-swap.save` and per-level bests `sweet-swap.best`. Hiding the page pauses input. No sound or timed loop: FPS, autoPause, difficulty, sound and controls options unused |
| Breakout (`breakout`) | done (BRK-1) | theme (Auto = Hub then system), fpsLimit (draw only; fixed 60 Hz physics with adaptive sub-steps), lowGraphics / reduced motion (particles off), showHints, sfx + masterVolume, autoPause (blur optional; hidden tab always pauses), gear (`?from=breakout`). Local mute uses shared sfx. `breakout.best` and `breakout.save` are cleared by Clear all game progress. No music; difficulty, vibration, screenShake, joystick and 3D options unused |
| All other games | pending | |

## Per-game visual settings

| Storage key | Values | Default |
|---|---|---|
| `snake.visualTheme` | `auto`, `nokia`, `arcade`, `gameboy`, `neon`, `garden`, `desert`, `jungle`, `ocean`, `flat`, `paper` | `auto` (Hub light → Minimal Flat; dark → Classic Nokia). The in-game Theme dialog saves the choice; live Hub changes only affect Auto. |
| `space-invader.visualTheme` | `auto`, `classic`, `retro`, `gameboy`, `amber`, `neon`, `space`, `flat`, `cyber`, `paper`, `ocean` | `auto` (Hub light → Minimal Flat; dark → Classic Arcade). The in-game Theme dialog saves the choice; live Hub changes only affect Auto. |
