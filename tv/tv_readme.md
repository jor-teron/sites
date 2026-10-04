# TV

## 1. What it is
A live TV (IPTV) player for a TV box, phone or PC. It plays free HLS streams from M3U playlists, shows a channel grid over the video, and is driven by a remote (arrows, Enter, number keys) or by touch / mouse. **Main entry:** `tv/` → `index.html` redirects to **`tv-v1.html`** (TV Player v1). The v2 / v3 players, the v3 sub-pages and `tv-old/` are older versions kept for reference.

## 2. Files
**Main player (v1)**
- `index.html`: redirects to `tv-v1.html` (meta refresh + script)
- `tv-v1.html` / `tv-v1.css` / `tv-v1.js`: the current player. Playlists, category tiles and timings are at the top of `tv-v1.js` ("EDIT THESE")
- `tv_icon.png`: hub icon

**Older players**
- `tv-v2.html` / `tv-v2.css` / `tv-v2.js`: v2. Channel list + Android app tiles (YouTube, Play Store, Settings) and `channels/home.m3u`
- `tv-v3.html` / `tv-v3.css`: v3. Built from the `js/` modules with `js/config.js` tiles and `channels/home.m3u`
- `tv-v3-more.html`: v3 with `js/config-more.js` tiles and `channels/home-more.m3u`
- `kids.html`, `india.html`, `world.html`, `kids-mini.html`: v3 pages for one playlist each (Home tile + channels): iptv-org kids, India, the whole iptv-org index, and the local `channels/kids.m3u`
- `photo.html`, `video.html`: "Coming soon..." placeholders
- `tv-v3.js`: an older all-in-one v3 script (category nav tiles, `lastCat`); **not loaded by any page**

**`js/` modules (used by the v3 pages only)**
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

**`tv-old/` (legacy)**
- `index.html`, `more.html`, `more-tv.html` + CSS: the original "Android TV homepage" launcher (app icons / links, clock). Kept for reference only; not linked from the hub.

**Icons:** every category / app tile now uses `../shared/image/placeholder.png`, because the old `image/` folder was removed (commit 7d7ac04).

## 3. Behaviour rules (v1, the main player)
- **Start:** resumes the last channel (category + name / URL / position from localStorage); otherwise opens the Home playlist (`channels/home.m3u`) and plays its first channel.
- **Grid:** channel tiles (number, logo, name, group) over the video, 3–5 columns. Home starts with tiles: **Hub** (link to `../`), **Kids**, **More**, **India**. Other categories start with a **Home** tile. The grid hides 5 s after the last action; any key or click shows it again.
- **Categories:** Home = `channels/home.m3u`, Kids = `channels/kids.m3u`, More = `channels/home-more.m3u`, India = iptv-org India list (online). Switching loads the list in place (no page change).
- **Playing:** hls.js when the browser supports it, else native HLS (Safari / iOS). Video is fitted (contain) and centred. When a stream fails, only the "no signal" poster shows (errors go to the console).
- **Number zap:** type a channel number; it shows big on screen and jumps after 1.5 s. Digits don't open the grid.
- **Picture-in-picture:** when the page is hidden (Home button, other app, tab switch) the video goes PiP if the browser allows; it comes back when you return.
- **Older players (v2 / v3):** similar grid / overlay, but with Android app-intent tiles (YouTube, Play Store, Settings, Phone, Camera, MX Player…) that only work on Android, and no saved channel. v3 sub-pages each load one playlist and have a Home tile back to `tv-v3.html`.

## 4. Keyboard
**v1**
- ← ↑ / → ↓: previous / next tile (wraps)
- Enter or Space: play the tile / open the category or link
- 0–9: channel number (jumps after 1.5 s)
- Any other key or a click: show the grid

**v2:** same keys. **v3:** arrows move, **Enter** plays (Space does nothing), 0–9 number zap.

Works in the Hub (also as a tile that opens in a new tab) and responds to the hub's D-pad: arrows move, A (Space) or Start (Enter) plays; number keys need the controller's keyboard.

## 5. Saved data (localStorage)
- `tv-v1-last`: `{category, index, name, url}` of the last channel played in v1
- `lastCat`: only written by the unused `tv-v3.js`
- v2 / v3 pages save nothing

## 6. Errors
- v1 shows no messages: a failed stream leaves the poster; a failed playlist or "HLS not supported" only goes to the console.
- v2: "Failed to load local.m3u" overlay (wrong file name; it really loads `channels/home.m3u`).
- v3 sub-pages: a failed playlist just gives a list with only the Home tile (error in the console).

## 7. Screen sizes
- v1: full-screen video (contain, centred) with the grid on top; 3–5 columns (about 100 px tiles), scrolls vertically. Works on TV, phone (portrait / landscape) and PC.
- v2 / v3: full-screen video with a channel list overlay; made for a 16:9 TV.

## 8. Safe settings
- `tv-v1.js` top block: `PLAYLISTS` (category → M3U path / URL), `DEFAULT_CATEGORY`, `CATEGORY_TILES` (Hub link + categories; name / href / logo), `HOME_CATEGORY_LOGO`, `NUMBER_DELAY` (1500 ms), `HIDE_DELAY` (5000 ms), `STORAGE_KEY`
- `channels/*.csv`: add / remove / reorder channels by `tvg-id`, then run `split-m3u.sh`
- `split-m3u.sh` top block: `MASTER_M3U_URLS`, `CSV_FILES`, `RES_TAGS`
- v3: `js/config.js`, `js/config-more.js` (`SPECIAL_TILES`)

## 9. Browser checklist
1. Open `tv/`: redirects to `tv-v1.html`, the grid shows, the first Home channel plays.
2. Arrow down a few tiles, press Enter: that channel plays; the grid hides after 5 s.
3. Type `5`: a big "5" shows, channel 5 plays after 1.5 s, the grid stays closed.
4. Open Kids, More, India: each list loads; the Home tile goes back.
5. Reload: the same channel resumes.
6. Hub tile: opens the hub.
7. Switch tab / press Home on Android: the video goes picture-in-picture.
8. In the hub with a paired phone: D-pad moves, A / Start plays.

## 10. Known limits
- Needs the internet: hls.js comes from the jsDelivr CDN and every stream is online. Free streams often go offline; refresh the playlists with `split-m3u.sh`.
- v1 shows no error text; a dead channel just shows the poster.
- **The v1 "no signal" poster is broken:** `tv-v1.html` still points at `../image/tv_no_signal.jpeg`, and `image/` was removed (only `shared/image/placeholder.png` exists).
- v1's **Hub** tile goes to `../` (the hub). Inside the hub frame this opens a hub inside the hub.
- `photo.html` / `video.html` link `tv.css`, which doesn't exist in `tv/` (it is in `tv-old/`); both say "Videos".
- v2 / v3 list channel names with `innerHTML`, so a name in an online playlist could inject HTML (v1 uses safe text).
- v3: the "first tap only shows the overlay" rule doesn't stop keys; the same key press also moves / plays.
- v3 / v2 app tiles use Android intents (`intent://`, `vnd.youtube://`) and do nothing on PC / iPhone.
- `js/config.js` and `js/config-more.js` look swapped: `tv-v3.html` gets a Home tile to itself and `tv-v3-more.html` a More… tile to itself (see Files).
- `tv-v3.js` and `channels/local.m3u` are unused.
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

## 12. Related apps
- Hub: `../hub/hub_readme.md` (TV is in Favorite and Media, and a home tile that opens it in a new tab)
- Controller: `../hub/controller/` (phone D-pad / keyboard for the TV)
