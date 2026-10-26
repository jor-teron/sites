# TV

## 1. What it is
A live TV (IPTV) player for a TV box, phone or PC. It plays free HLS streams from M3U playlists, shows a channel grid over the video, and is driven by a remote (arrows, Enter, number keys) or by touch / mouse. **Main entry:** `tv/` → `index.html` redirects to **`tv.html`** (the v1 player; named `tv-v1.html` until TV3, which is now a redirect stub). The v2 / v3 players, the v3 sub-pages, `tv-old/` and other orphaned files are retired and live in **`legacy/`** (reference only, not maintained, links may be broken; see `legacy/README.md`).

## 2. Files
**Main player (v1)**
- `index.html`: redirects to `tv.html` (script keeps `?query` / `#hash`; meta refresh without JS)
- `tv-v1.html`: redirect stub to `tv.html` (keeps `?query` / `#hash`) for old bookmarks
- `tv.html` / `tv.css`: the current player page and styles (no-scrollbar rules included)
- `core/`: the player scripts, plain `<script>` files (no build, no ES modules, so file:// works) loaded in this order. Each is one IIFE that adds to the only global, `window.TV`:
  - `tv_config.js` → `TV.config`, `TV.env`, `TV.state`: playlists, category tiles, logos, timings, storage keys ("EDIT THESE"); environment (`framed` = inside an iframe, `secure` = https page); shared state (`items`, `currentIndex`, `currentCategory`)
  - `tv_playlist.js` → `TV.playlist`: M3U parser, fetch loader, `load(category, options)` with the stale-load guard and Home fallback; http-only marking (`isHttpOnly`, `isPlayable`)
  - `tv_player.js` → `TV.player`: `play(channel)` with hls.js or native HLS; the `<video>` element
  - `tv_ui.js` → `TV.ui`: channel grid, highlight, number display, grid show / auto-hide, `columns()` (columns actually rendered), `toast(msg)`
  - `tv_input.js` → `TV.input`: keys, grid-aware arrow math (`move`), number zap, click / tap shows the grid
  - `tv_pip.js` → `TV.pip`: auto picture-in-picture
  - `tv_import.js` → `TV['import']` (TV7): Import panel (file / drop / URL), saves the imported playlist in IndexedDB, registers the `import` list with `TV.playlist.registerSource` and the `import` action in `TV.actions`, `#import` deep link
  - `tv_app.js` → `TV.app`: activate a tile, Hub link (`linkHref`), saved channel (+ old-key migration), start-up. Loaded last
- `vendor/hls/`: hls.js 1.5.20 (+ LICENSE.md); `image/no_signal.svg`: the poster
- `tv_icon.png`: hub icon

**Older players (moved to `legacy/` in TV4; paths below are relative to `legacy/`)**
- `tv-v2.html` / `tv-v2.css` / `tv-v2.js`: v2. Channel list + Android app tiles (YouTube, Play Store, Settings) and `channels/home.m3u`
- `tv-v3.html` / `tv-v3.css`: v3. Built from the `js/` modules with `js/config.js` tiles and `channels/home.m3u`
- `tv-v3-more.html`: v3 with `js/config-more.js` tiles and `channels/home-more.m3u`
- `kids.html`, `india.html`, `world.html`, `kids-mini.html`: v3 pages for one playlist each (Home tile + channels): iptv-org kids, India, the whole iptv-org index, and the local `channels/kids.m3u`
- `photo.html`, `video.html`: "Coming soon..." placeholders
- `tv-v3.js`: an older all-in-one v3 script (category nav tiles, `lastCat`); **not loaded by any page**

**`legacy/js/` modules (used by the v3 pages only)**
- `config.js`: `SPECIAL_TILES` loaded by `tv-v3.html`: Home (→ `tv-v3.html`), Phone, Camera, Photos, YouTube, Kids (All), India, World, Play Store, Settings. Also loaded (unused) by the kids / India / World / kids-mini pages
- `config-more.js`: `SPECIAL_TILES` loaded by `tv-v3-more.html`: YouTube, YouTube Kids, Kids (→ `kids-mini.html`), MX Player, More… (→ `tv-v3-more.html`, i.e. itself). The two configs look swapped: the main page has a "Home" tile to itself and the More page a "More…" tile to itself
- `playlist.js`: M3U parser + `loadPlaylist(url)`; holds the global `channels`
- `player.js`: `playChannel(i)`: app tiles open their intent / URL, page tiles navigate, streams play with hls.js (`.m3u8`) or plain `<video>`
- `overlay.js`: show / hide the channel overlay (hides after 2.5 s)
- `input.js`: arrows, Enter, number keys, activity (click / touch / mouse move shows the overlay)
- `autoplay.js`: plays the first real stream on load

**`channels/`**
- `home.csv`, `home-more.csv`, `kids.csv`: the wanted channels, one `tvg-id` per row (+ optional group)
- `home.m3u`, `home-more.m3u`, `kids.m3u`: playlists generated from the CSVs
- `local.m3u`: an extra local list (not used by any page)
- `split-m3u.sh`: Bash script. Downloads the iptv-org master lists (India, kids, full index, in that order) and writes `<csv>.m3u` for each CSV in CSV row order (first match per `tvg-id` wins, quality tags like "(720p)" are stripped from names). Run `./split-m3u.sh` inside `channels/` when streams go stale.

**`garbage/`**: retired `.m3u.js` copies + `m3u-to-js.py` (TV8, see `garbage/README.md`)

**`legacy/tv-old/` (legacy)**
- `index.html`, `more.html`, `more-tv.html` + CSS: the original "Android TV homepage" launcher (app icons / links, clock). Kept for reference only; not linked from the hub.

**Icons:** every category / app tile now uses `../shared/image/placeholder.png`, because the old `image/` folder was removed (commit 7d7ac04).

## 3. Behaviour rules (v1, the main player)
- **Start:** resumes the last channel (category + name / URL / position from localStorage); otherwise opens the Home playlist (`channels/home.m3u`) and plays its first channel.
- **Grid:** channel tiles (number, logo, name, group) over the video, 3–4 columns. Home starts with tiles: **Hub** (link to `../`), **Kids**, **More**, then its channels. More starts with **India**, **Import**, then **Home**, then its channels (TV6: India moved off Home; TV7: Import). Kids and India start with a **Home** tile; the Import grid starts with **Home**, **More**, **Import…**. On file:// the Hub tile opens `../index.html` (not a folder listing). Inside an iframe (the Hub) the Hub tile is hidden, because the hub bridge has no "go home" message and navigating the frame would open a hub inside the hub. The grid hides 5 s after the last action; any key or click shows it again.
- **Categories:** Home = `channels/home.m3u`, Kids = `channels/kids.m3u`, More = `channels/home-more.m3u`, India = iptv-org India list (online, opened from the More grid). Switching loads the list in place (no page change). Every list is fetched (TV8: the old `.m3u.js` file:// copies are in `garbage/`), so lists need a web page (GitHub Pages, the Hub or a local server), not file://.
- **Import (TV7):** the **Import** tile (in More) opens a small panel: *Show channels* (when a list is saved), *Open file (.m3u / .m3u8)*, a URL box with *Load URL*, *Clear saved list*, *Close*. A `.m3u` / `.m3u8` file can also be dropped anywhere on the page. The playlist is parsed by the normal TV parser and shown as the **Import** grid (Home / More / Import… tiles + channels, group shown on each tile); the first channel plays. The raw text + name / URL is saved in IndexedDB, so a reload restores the list and the saved channel resumes. A new file or URL **replaces** the saved list; **Import…** reopens the panel to replace or clear. Clear deletes it (and an Import saved channel) and goes back to More. A URL that is itself one HLS stream (`#EXT-X-STREAM-INF` / `#EXT-X-TARGETDURATION`) becomes a single channel. URL import needs CORS on the other server (from file:// too); `http://` URLs are refused on https pages. Files over 20 MB and non-playlists are refused with a toast. If IndexedDB is blocked the list works for this visit only.
- **Deep link:** `tv.html#import` opens the Import panel (over the saved Import grid if there is one, else over the normal start list); changing the hash to `#import` later opens it too.
- **Playing:** hls.js when the browser supports it, else native HLS (Safari / iOS). Video is fitted (contain) and centred. When a stream fails, the "no signal" poster shows with a short toast (see Errors).
- **http-only channels:** on an https page, `http://` streams are blocked by the browser (mixed content), so their tiles are dimmed with a small red **HTTP** badge, auto-play / resume skip them, and choosing one shows a toast instead of playing. On http:// and file:// pages they play normally.
- **Number zap:** type a channel number; it shows big on screen and jumps after 1.5 s. Digits don't open the grid.
- **Picture-in-picture:** when the page is hidden (Home button, other app, tab switch) the video goes PiP if the browser allows; it comes back when you return.
- **Older players (v2 / v3):** similar grid / overlay, but with Android app-intent tiles (YouTube, Play Store, Settings, Phone, Camera, MX Player…) that only work on Android, and no saved channel. v3 sub-pages each load one playlist and have a Home tile back to `tv-v3.html`.

## 4. Keyboard
**v1**
- ← / →: previous / next tile (wraps at the ends)
- ↑ / ↓: one row up / down, using the number of columns actually on screen (3 or 4). Down from the row above a short last row goes to the last tile; Down on the last row wraps to the top of the same column; Up on the top row wraps to the same column in the last row (or the row above it if that column is empty)
- Enter or Space: play the tile / open the category or link
- 0–9: channel number (jumps after 1.5 s)
- Any other key or a click: show the grid
- Import panel (TV7): ↓ / ↑ (and → / ← outside the URL box) move between the panel controls, Enter / Space press the focused button, Enter in the URL box loads it, Escape / Back (Backspace outside the URL box) closes the panel. Keys don't reach the grid while it is open. Touch: tap the buttons; tapping outside the box closes it.

**v2:** same keys. **v3:** arrows move, **Enter** plays (Space does nothing), 0–9 number zap.

Works in the Hub (also as a tile that opens in a new tab) and responds to the hub's D-pad: arrows move, A (Space) or Start (Enter) plays; number keys need the controller's keyboard.

## 5. Saved data (localStorage)
- `tv-last-v1`: `{category, index, name, url}` of the last channel played in v1. Until TV3 the key was `tv-v1-last`; on start its value is copied to `tv-last-v1` (if that is empty) and the old key is removed
- IndexedDB `tv-import-v1` (TV7), store `playlist`, key `current`: `{name, url, text, count, savedAt}` of the imported playlist (one list). A saved channel in it is stored in `tv-last-v1` with category `import`
- `lastCat`: only written by the unused `tv-v3.js`
- v2 / v3 pages save nothing

## 6. Errors
- v1 (TV5) shows a toast for about 3 s (bottom centre, text only, does not block keys), and logs to the console:
  - playlist failed: "Could not load <Name>" (local lists) or "<Name> needs internet" (India); the old list stays
  - empty playlist: "No channels in <Name>"; on https with only http:// streams: "<Name>: only http:// channels, they need an http:// or file:// page"
  - stream error / CORS: "Channel unavailable" (the poster stays)
  - http:// channel chosen on https: "<name>: http:// stream, needs an http:// or file:// page"
  - no HLS support: "This browser cannot play these streams"
  - Import (TV7): "<file> is not an .m3u playlist", "<file> is too large", "Could not read <file>", "No channels in <name>", "<name> is one video stream, not a channel list" (a stream file), "Enter a playlist URL", "Not a valid URL", "Enter an http:// or https:// URL", "http:// URLs are blocked on https pages", "Could not load URL (HTTP <code>)", "Could not load URL (blocked by CORS or offline)", "Imported for this visit only (could not save)", "Import cleared", and on start with a saved Import channel but no saved list "Nothing imported yet" (then Home). A failed import keeps the saved list
- v2: "Failed to load local.m3u" overlay (wrong file name; it really loads `channels/home.m3u`).
- v3 sub-pages: a failed playlist just gives a list with only the Home tile (error in the console).

## 7. Screen sizes
- v1: full-screen video (contain, centred) with the grid on top; 3–4 columns in practice (about 100 px tiles), scrolls vertically. Works on TV, phone (portrait / landscape) and PC.
- v2 / v3: full-screen video with a channel list overlay; made for a 16:9 TV.

## 8. Safe settings
- `core/tv_config.js`: `PLAYLISTS` (category → M3U path / URL), `DEFAULT_CATEGORY`, `CATEGORY_TILES` (Hub link + categories; name / href / logo; `screen` = the list that shows the tile, `'home'` if missing, e.g. India has `screen: 'more'`), `HOME_CATEGORY_LOGO`, `NUMBER_DELAY` (1500 ms), `HIDE_DELAY` (5000 ms), `AUTOPLAY_DELAY` (200 ms), `TOAST_DELAY` (3000 ms), `STORAGE_KEY` / `OLD_STORAGE_KEY`, `IMPORT_DB` (`tv-import-v1`), `IMPORT_MAX_BYTES` (20 MB). Action tiles: `type: 'action'` + `action` (a key of `TV.actions`, e.g. `'import'`)
- `channels/*.csv`: add / remove / reorder channels by `tvg-id`, then run `split-m3u.sh`
- `split-m3u.sh` top block: `MASTER_M3U_URLS`, `CSV_FILES`, `RES_TAGS`
- v3: `js/config.js`, `js/config-more.js` (`SPECIAL_TILES`)

## 9. Browser checklist
1. Open `tv/` (or an old `tv-v1.html` link): redirects to `tv.html`, the grid shows, the first Home channel plays.
2. Arrow down a few tiles, press Enter: that channel plays; the grid hides after 5 s.
3. Type `5`: a big "5" shows, channel 5 plays after 1.5 s, the grid stays closed.
4. Home shows Hub, Kids, More (no India). Open Kids, More; in More open India (the first tile): each list loads; the Home tile goes back.
5. Reload: the same channel resumes.
6. Hub tile: opens the hub (file://: `../index.html`); inside the Hub frame there is no Hub tile.
9. Open India (from More) offline: a "India needs internet" toast shows for ~3 s and the More list stays.
10. Up / Down move by a whole row at any window width.
7. Switch tab / press Home on Android: the video goes picture-in-picture.
8. In the hub with a paired phone: D-pad moves, A / Start plays.
11. More → Import: the panel opens with focus on Open file; pick an `.m3u`: the Import grid (Home, More, Import…, channels) shows and plays. Reload: the list and channel come back.
12. Drop an `.m3u` file on the page: it replaces the list. Import… → Clear saved list: "Import cleared", More shows.
13. Open `tv.html#import`: the panel opens. Over http(s), paste a playlist URL (with CORS) and press Enter; a bad URL shows a toast.

## 10. Known limits
- Needs the internet for streams: every stream is online (hls.js 1.5.20 is vendored in `vendor/hls/` since TV1). Free streams often go offline; refresh the playlists with `split-m3u.sh`.
- From file:// the channel lists don't load (TV8 dropped the `.m3u.js` copies; TV needs the internet anyway). Streams without CORS headers (e.g. 9XM) fail on file:// and http(s) alike. Chrome keeps one localStorage for all file:// pages, so the saved channel is shared with other file:// apps.
- The v1 "no signal" poster is the local `image/no_signal.svg` (TV1; the old `../image/tv_no_signal.jpeg` was removed).
- Inside the Hub frame there is no way back to the Hub from TV (the tile is hidden; the hub bridge has no navigate message). Use the Hub's own controls.
- On an https host most iptv-org streams that are `http://` cannot play (mixed content); they are marked, not fixed. Use an http:// or file:// page for them.
- The grid CSS fits 3 or 4 columns, never 5 (the gaps don't let 5 × 20% fit). The arrow math handles any count.
- `photo.html` / `video.html` link `tv.css`, which doesn't exist in `tv/` (it is in `tv-old/`); both say "Videos".
- v2 / v3 list channel names with `innerHTML`, so a name in an online playlist could inject HTML (v1 uses safe text).
- v3: the "first tap only shows the overlay" rule doesn't stop keys; the same key press also moves / plays.
- v3 / v2 app tiles use Android intents (`intent://`, `vnd.youtube://`) and do nothing on PC / iPhone.
- `js/config.js` and `js/config-more.js` look swapped: `tv-v3.html` gets a Home tile to itself and `tv-v3-more.html` a More… tile to itself (see Files).
- `tv-v3.js` and `channels/local.m3u` are unused.
- Import (TV7): one saved list only (a new one replaces it); URL import needs CORS on that server; relative stream paths inside a URL playlist are not resolved; no search / filter, no group headings; Chrome shares IndexedDB across all file:// pages, like localStorage.
- `tv-old/` links are stale: `../style/no-scrollbar.css` and `../script/time.js` moved to `shared/`, and `upi.html` doesn't exist.

## 11. Change log
- 2026-08-01 – 2026-08-20 IST: v2 and v3 players, v3 pages and CSS (uploads and edits, e.g. 9236488 2026-08-01 08:11, 4c77a88 2026-08-15 17:55, d625cb6 2026-08-20 12:44).
- 2026-09-21 16:11 IST: TV Player v1 (commits 0ccf2d8, 096c79b, 3aaa2ac): categories + resume.
- 2026-09-21 17:13–20:19 IST: v1 tweaks, list hidden on load, CSV files for regenerating playlists, centred 3–5 column grid (acd5117, 38effc4, 44ade0f, 2188a72).
- 2026-09-21 22:18 IST: `split-m3u.sh` and CSVs updated (7ce214a).
- 2026-09-22 10:42 IST: auto picture-in-picture (a7f23d1); 15:13 IST: grid stays closed during number entry (c1e1e51).
- 2026-09-23 20:10 IST: Hub link tile on v1 Home (c0f072f); 21:19 IST: video poster (33388af); 21:27 IST: stream-error overlay hidden (c75574b); 23:15 IST: channel lists regenerated by the script (b0f5f39).
- 2026-09-24 18:31 IST: icon, folder rearranged (6b8c20d).
- 2026-09-27 21:25 IST: remaining v1 text overlays removed; the poster covers idle states (4dc927a).
- 2026-09-29 09:06 IST: repository restructure (6d7ba68).
- 2026-10-05 00:35 IST: tile icons switched to `shared/image/placeholder.png` after `image/` was removed (7d7ac04).
- 2026-10-23 IST: TV4: retired v2 / v3 pages, `js/`, `tv-old/`, `photo.html` / `video.html` moved to `legacy/` (paths not fixed).
- 2026-10-23 IST: TV1: hls.js 1.5.20 vendored in `vendor/hls/` (with LICENSE.md, no CDN); local `image/no_signal.svg` poster; category switches only after its playlist loads (stale loads ignored, failure keeps the old list, falls back to Home if nothing loaded); empty playlists and auto-start never open link / category tiles; M3U name = text after the first comma outside quotes, else `tvg-name`.
- 2026-10-23 IST: TV2: works from file://: `channels/m3u-to-js.py` (run by `split-m3u.sh`) writes `home.m3u.js`, `kids.m3u.js`, `home-more.m3u.js`; `tv-v1.js` loads them with a script tag on file:// or when fetch fails; http(s) still uses fetch.
- 2026-10-23 IST: TV3: `tv-v1.js` split into `core/tv_*.js` modules under one global `window.TV` (same behaviour); page renamed `tv.html` / `tv.css` (inline no-scrollbar style moved into `tv.css`); `tv-v1.html` is now a redirect stub; storage key `tv-v1-last` → `tv-last-v1` (migrated on start).
- 2026-10-23 IST: TV5: grid-aware Up / Down (by rendered columns, wrap by column); on-screen error toast (playlist failure, empty playlist, stream error, http-only); Hub tile hidden when framed, `../index.html` on file://; http:// channels dimmed with an HTTP badge and skipped on https pages (`TOAST_DELAY`, `TV.env`).
- 2026-10-23 IST: TV6: India tile moved off the Home grid; it is now the first tile in More (before the Home tile). Home = Hub, Kids, More + channels. `CATEGORY_TILES` entries take `screen`. India behaviour (online-only, toast, fallback) and saved-channel resume unchanged.
- 2026-10-23 IST: TV7: **Import** tile in More (after India) opens an Import panel: open an `.m3u` / `.m3u8` file, drop one on the page, or load a URL (fetch; toasts on CORS / HTTP errors). Parsed by the TV parser, shown as the Import grid (Home / More / Import… + channels), saved in IndexedDB `tv-import-v1` (restored on reload, replace / clear), saved-channel resume works; `tv.html#import` opens the panel. New `core/tv_import.js`; `TV.playlist.registerSource`, action tiles (`TV.actions`). Not taken from `apps/lab/iptv-player`: bare URL lines without `#EXTINF`, native video controls, now-playing label, channel count, G / Escape grid focus, initial-letter icons (it has no search or groups either).
- 2026-10-26 IST: TV8: dropped the `.m3u.js` file:// copies and `m3u-to-js.py` (moved to `garbage/` with a note); `tv_playlist.js` just fetches; `split-m3u.sh` no longer writes them.

## 12. Related apps
- Hub: `../hub/docs/hub_readme.md` (TV is in Favorite and Media, and a home tile that opens it in a new tab)
- Controller: `../hub/controller/` (phone D-pad / keyboard for the TV)
