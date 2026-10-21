# Hub

## 1. What it is
The start page of the site (`hub.html`). A header menu lists every app by category; apps open inside the hub in a full-size frame (or in a new tab). The home screen shows quick-access tiles on an animated wallpaper. A phone can be paired as a controller (gamepad, keyboard, trackpad) and can send files to the hub.

## 2. Files
- Technical guide: [Hub and virtual desktop internals](README_technical.txt) (`hub/docs/README_technical.txt`)
- Current build tag and shell cache name: see `hub/build.txt` (this readme carries no current numbers).
- Folders (R31): `core/` (hub.js, role, config, apps list, prefs, loader, main css), `wm/` (window manager, taskbar, snap, workspaces), `menu/` (flyout, tiles, settings row, right-click menus), `link/` (phone link, chat, gamebar, pointer, receive, phonekey), `controller/` (Gamepad page + Hub side), `osk/`, `viewer/` (viewer, PDF, file cards), `drives/` (Drives pane, wallpapers, tray meter), `update/` (worker, update note, offline page), `docs/`. `version.txt` stays in `hub/`. The names below are the files in those folders.
- `../hub.html`: page shell (header, menu, controller popover, frame, home screen); loads the core with `?v=`
- `hub_loader.js` (R16a): loads the rest after the page `load` event + idle, in batches: drives (Google sign-in, Drive, `hub_drives.js`, `hub_phonekey.js`) at first idle; then after ~1.5 s snap (`wm_snap.js`), keyboard (`osk/`), Viewer overlay. Early use (⌨ tray stub, Ctrl+Alt+K, Ctrl+Alt+arrows, `HubViewer.open`, OSK left open) loads that batch at once; files that fail are retried on the next use and a small "Couldn't load …" note shows (R28). Keep its `V` in step with `?v=`.
- `hub_main.css`: page shell, wallpaper, top bar, tiles, collapsible menu
- `hub_controller.css`: pairing / QR popover, game bar, trackpad pointer
- `hub_apps.js`: the LEGACY list (`window.HUB_APPS_CSV`, CSV text; R30): since R33a only the menu's categories + hidden system rows (old app rows archived in a comment); apps come from `apps/<category>/<category>-apps.csv`
- `hub_tiles.js`: home screen tiles (`window.HUB_TILES`)
- `hub.js`: menu, opening apps, hash links, last app, focus, menu keys
- `hub-gamebar.js`: app bar in the header centre (name / stats / buttons sent by the app)
- `hub-controller.js`: phone controller: PeerJS host, pairing popover + QR, button → key forwarding, rumble
- `hub_controller_config.js`: settings for trackpad pointer, phone → hub files, file cards (`window.HUB_CTRL_CONFIG`)
- `hub_pointer.js`: trackpad arrow drawn over the page, synthetic clicks / wheel
- `hub_receive.js`: receives files from the controller's Files tab
- `hub_notify.js`: received-file cards (bottom right by default)
- `hub_viewer.js`: received-file overlay (images + PDFs, queue with ← →)
- `hub_viewer_pdf.js`: pdf.js glue (all pages stacked and scrollable)
- `../shared/vendor/pdfjs/`: Mozilla pdf.js 3.11 (local copy)
- `hub_notification.css`: received-file cards + receive overlay
- `hub_sw.js`: service worker (R16b): precached shell + shared modules + Start icons + app CSVs; shell served cache-first and refreshed in the background (new copy on the next load); CSVs / `version.txt` network-first; app pages kept the first time they open (`hub-rt-1`); images shown from cache and refreshed in the background (R25); Google, OAuth, Drive and PeerJS are never cached. Loaded by the root `../sw.js` stub. Release: bump `V` + `CACHE` there and `?v=` in `sw.js`.
- `hub_update.js` + `hub_update.css` (R16c): daily refresh at 09:00 browser time (or the next open after a missed 09:00; `sites-hub.lastRefresh`): the worker re-fetches the shell and replaces changed files, cache kept; changed → quiet reload when no window is open, else the note. Settings → About: "Last refreshed" + "Clear cache now". A new worker waits; "Update ready · Reload" note (no forced reload); Settings → About "Check for update": a waiting new worker takes over (skip-waiting → reload, caches kept; R24), else the shell caches are cleared and the Hub reloads.
- `hub_offline.html`: "You're offline" page shown by the service worker
- `../manifest.webmanifest`, `../shared/image/hub_icon_192.png`, `hub_icon_512.png`: PWA manifest and icons
- Shared: `../vendor/qrcode.js`, `../style/no-scrollbar.css`, `../script/txt-view.html` (viewer for `.txt` entries)

## 3. Behaviour rules
- **App list (`hub_apps.js`):** columns by header name: `CATEGORY, NAME, ENTRY_URL, ICON_URL, NEW_TAB, HIDDEN, ORDER`. ENTRY_URL is a folder (opens its `index.html`), a file, or a `.txt` (shown in the text viewer). Empty ICON_URL = `folder/folder_icon.png` (or `dir/name_icon.png`). NEW_TAB 1 = new browser tab. HIDDEN 1 = not in the menu (still usable by tiles). Categories appear in the order of their first row; apps sort by ORDER. No backticks, no `${`, no commas inside a cell. A broken file shows "hub_apps.js failed to load or has an error".
- **Menu:** "Home screen" item, then collapsible categories; only one category is open at a time.
- **Home tiles (`hub_tiles.js`):** 4 tiles: QR of this hub's link ("Open on another device"), GamePad (new tab), TV (new tab), QR Scanner. 2×2 grid, one row of 4 on short landscape screens.
- **Wallpaper:** Night blue gradient, slowly moving (24 s, pure CSS); still with reduced motion.
- **Hash links + last app:** an app opened in the frame sets `hub.html#<id>` (id = folder or file name) and is remembered in localStorage. On load the hash wins, else the last app opens; an unknown hash shows home. Back / Forward switch apps. "Home screen" clears both. New-tab apps are never remembered.
- **Focus:** the app frame gets keyboard focus after loading, after picking an app and when the menu closes, so keys reach the app without clicking first. Scrollbars inside same-origin apps are hidden.
- **App bar (`hub-gamebar.js`):** an app may post `hub-app` (name, stats, buttons; optional ribbon `tabs` / `activeTab` / `title`, R44) and `hub-stat` / `hub-tab` / `hub-title`; header buttons send back `hub-action`. Cleared when another app opens. Apps that never answer are unaffected.
- **Phone controller:** the gamepad button in the header opens the pairing popover (QR + code, link, status, New code, Disconnect). The phone opens `controller/controller.html#code=<code>`. Peer id = `jtsites-` + 6-character code (no 0 / O / 1 / I). The code is kept across reloads, so a phone can reconnect without opening the popover; if the old id is still held by the server it retries with backoff (never silently changes the code); network loss reconnects (2–30 s). A dot on the button shows when connected.
- **Button → key (into the app frame):** D-pad = arrows, A = Space, B = `x`, X = `z`, Y = `c`, L = `q`, R = `e`, Start = Enter, Select = Esc, Home = message only. Every button also posts `{type:'hub-dpad', b, s}`. Keys are synthetic: apps see keydown / keyup, but only shortcuts the app handles itself work.
- **Keyboard modes:** keys from the controller's keyboards are sent into the frame and typed into the focused input / textarea / editable area by the hub (incl. Backspace, Delete, Enter, ← →); also posted as `hub-key`.
- **Menu by controller:** while the menu is open, arrows / Enter / Space / Esc drive the menu instead of the app (→ opens a category, ← / Esc closes).
- **Rumble:** an app may post `{type:'hub-rumble', ms}` or `{pattern:[…]}`; it is passed to the phone's vibration.
- **Trackpad:** the hub draws its own arrow (a page can't move the real mouse) and sends synthetic pointer / mouse / wheel events to the element under it, inside same-origin frames too. Fades after 4 s idle.
- **Phone → hub files:** the controller's Files tab opens a second link; each finished file downloads at once under its own name (up to 2 GB, no resume) and shows a card with a preview; ✕ dismisses early; cards stay for 10 seconds by default (`notify.durationMs`). Cards sit bottom-right (above the receive overlay); `notify.position` can be `bottom-right`, `top-right` or `top-center`.
- **Receive overlay:** a finished image or PDF auto-opens over a near-clear white backdrop (`rgba(255,255,255,0.1)`, content ~95% of the screen) with the filename and ✕ at the top (files are already auto-saved). Cards stay visible on top. Esc, the controller's B button (`x`) or a backdrop click closes it. With 2+ received images/PDFs, ← → mid-viewport (and the hub D-pad) move the queue; ↑ ↓ / wheel / touch scroll a multi-page PDF (pdf.js). Other file types do not auto-open; tapping their card still opens a new tab.

- **Install as an app (PWA):** Chrome on Android offers "Install app" / "Add to Home screen" (name "Jor Teron Hub", short name "Hub", night-blue icon, standalone window, opens `hub.html`). The manifest uses relative paths, so it works under `/sites/` on GitHub Pages. `hub.html` registers `sw.js` (only over http/https, not file://). The service worker serves the Hub shell from its cache and refreshes it in the background (a push shows on the next load); app pages are network-first and kept for offline use; a page that was never visited offline shows `hub/update/hub_offline.html`. Cross-origin requests (PeerJS, CDNs) are not touched.
- **Why `sw.js` is at the root:** a service worker only controls pages in its own folder and below. `sw.js` must sit next to `hub.html` (one line: `importScripts('hub/update/hub_sw.js')`); the real code stays in `hub/`. Change the shell list or bump `CACHE` in `hub_sw.js` (current name: see `hub/build.txt`); old caches are deleted on activate.

## 4. Keyboard
- Menu open: ↑ ↓ move, → / Enter / Space open a category or app, ← / Esc close
- A key pressed while the hub itself has focus moves focus into the app (that first key is not forwarded)
- Everything else goes to the app in the frame

## 5. Saved data (localStorage)
- `sites-hub.lastApp`: id of the last app opened in the frame
- `jtsites-hub-ctrl-code`: current controller pairing code

## 6. Errors
- "hub_apps.js failed to load or has an error": menu and home screen, when the app list is broken or missing
- Controller popover status: "Waiting for controller…", "Controller connected", "Disconnected", "Code still in use (previous session) — retrying n/10…", "Code XXXXXX is still in use — press \"New code\"", "Network problem — retrying…", "PeerJS missing", "Error: <type>"; "QR lib missing" when `qrcode.js` didn't load
- File cards show the failure text when a transfer fails or is refused (over 2 GB)
- A missing menu icon just shows no image (many apps have no `_icon.png` yet)

## 7. Screen sizes
- App bar in the header gets more compact under 560 px and 400 px wide (version, then labels hidden).
- Home tiles: 2×2; one row of 4 in landscape under 500 px tall.
- Apps fill the whole area under the header.

## 8. Safe settings
- `apps/<category>/<category>-apps.csv`: add / move apps (source of truth); `hub_apps.js` only holds the categories and hidden system rows
- `hub_tiles.js`: tile list (`qr` / `app`)
- `hub_controller_config.js`: `pointer` (speed, acceleration, size, hideAfterMs, scrollSpeed, colours), `receive` (autoSave, maxBytes, ackEveryBytes), `notify` (position, durationMs, maxStack, previewSize, showPreviews, revokeAfterMs)
- **Cache-buster:** after changing any hub file, bump every `?v=` in `../hub.html` (current tag: see `hub/build.txt`) and the other places in README_technical section 13, or browsers keep the old copy.
- Don't change `PEER_PREFIX` / the button map in `hub-controller.js` without updating the controller too.

## 9. Browser checklist
1. Open `hub.html`: wallpaper moves, 4 tiles show.
2. Open Home menu: one category opens at a time; pick an app: it loads, the hash changes.
3. Reload: the same app opens. "Home screen": back to tiles, hash cleared.
4. Keyboard: arrows work in a game straight after picking it.
5. Pair a phone (QR in the popover): the dot turns on; D-pad moves the game.
6. Reload the hub: the phone reconnects with the same code.
7. Trackpad tab: the arrow moves and clicks; Files tab: a photo / PDF downloads, a card shows bottom-right for 10 s, and the overlay opens; ← → switch files, B / Esc closes.

## 10. Known limits
- Synthetic keys can't trigger browser actions (file pickers, fullscreen, typing into fields without the hub's help).
- The controller needs internet (public PeerJS server).
- Cross-origin apps get no keys, pointer or app bar.
- Some apps have no menu icon yet (a letter tile shows).
- Root `tree.txt` is an old file listing, not used by the hub (the old root `hub-apps.csv` is gone).
- Old hidden row "FileDrop" → `apps/lab/file-drop/` points at a folder that no longer exists.

## 11. Change log
- 2026-09-29 20:07 IST: hub icon option (commit d63c325).
- 2026-10-02 19:01 IST: folder rearrange (commit 8cb4c69).
- 2026-10-03 19:55 IST: re-categorised, folders renamed (commit fab92c7).
- 2026-10-03 23:07 IST: 2×2 home tiles, animated Night blue wallpaper (commit ab58986).
- 2026-10-04 04:49 IST: collapsible category menu (commit f6a0fd3).
- 2026-10-04 23:16 IST: controller tabs (Gamepad / Keyboard & Mouse / Send Files), trackpad pointer, phone → hub files with cards (commit 5809f29).
- 2026-10-04 23:24 IST: Notepad and Notely moved to Office (commit 3a32f4e).
- 2026-10-05 00:55 IST: file cards moved to bottom-right (position option); image viewer for received images.
- 2026-10-05 07:16 IST: installable PWA: manifest, icons, root `sw.js` → `hub/update/hub_sw.js`, offline page.

- 2026-10-05 17:34 IST: receive overlay (images + PDF scroll), queue arrows, 10 min toast.

- 2026-10-05 18:00 IST: receive overlay polish (no Download, mid-side arrows, 95% content, 10 s toast).

- 2026-10-05 18:29 IST: hub CSS split into main / controller / notification; overlay backdrop 10% white.

- 2026-10-20 IST: R16a minimal start: `hub_loader.js` defers Drive/Google, snap, keyboard and Viewer (cache v46, ?v=20261020c).
- 2026-10-20 IST: R16b cache-first shell (stale-while-revalidate), offline first visit, "Update ready" note (cache v47, ?v=20261020d).
- 2026-10-20 IST: R16c daily 09:00 refresh (replaces 23:00 check), cached Start list (`sites-hub.startList`, rebuilt when a CSV / hub_apps.js changes), Clear cache now (cache v48, ?v=20261020e).
- 2026-10-20 IST: R18 Lab app icons: 12 new icons (MyLLM, Local AI Chat, AI Story, LLM Calculator, Bookmark Manager, Wiki Extractor, Media Explorer, IPTV player, Channel Cleaner, Three.js Viewer v2, AoE RTS, Aeroplane).
- 2026-10-20 IST: R23+R24 update apply fixes: the 09:00 quiet reload waits for an installing worker (never reloads onto the old one); "Check for update" lets a waiting worker take over and keeps the caches (cache v49, ?v=20261020f).
- 2026-10-20 IST: R25+R26 images refreshed in the background by the worker (edited icons / wallpapers show); "New code" asks with the Hub dialog (UiDialog) (cache v50, ?v=20261020g).
- 2026-10-20 IST: R27+R28+R29 loader: the ⌨ stub stays until the keyboard is really in; failed files are retried and show a small "Couldn't load …" note; each key is handled once (Ctrl+Alt+K, workspace keys) (cache v51, ?v=20261020h).
- 2026-10-20 IST: R30 `hub_apps.js` marked LEGACY; the category CSVs are the source of truth (cache v52, ?v=20261020i).
- 2026-10-20 IST: R31 `hub/` restructured into feature folders: `core/`, `wm/`, `menu/`, `link/`, `controller/`, `osk/`, `viewer/`, `drives/`, `update/`, `docs/` (cache v53, ?v=20261020j).
- 2026-10-20 IST: R32 `hub/build.txt` (current build + cache, one place); readme cleanup (no current numbers in the body) and this change log.
- Parked / planned: R21 Auto mode flips Desktop / Phone at the 1024 px edge (needs some slack) and R22 window sizes shrink for good after a small viewport — parked, low priority. R33 planned: swap `hub_apps.js` for the category CSVs.
- 2026-10-20 IST: R33a `hub_apps.js` keeps only the categories ("<Category> Page" rows) + hidden system rows (Desktop, Settings, About, Contact, Feedback, Transcribe); the 60 app rows moved to a commented archive block in the same file. Apps come from the category CSVs (`hub_flyout.js` `window.HubStartList`, registered by `hub.js` for hash links, last app, session restore, `__hubOpenApp`); every CSV app now has its #hash link (e.g. #myllm) (cache v54, ?v=20261020k).
- 2026-10-20 IST: R33b faster first-visit app lookup: the CSV lists start loading the moment `hub_flyout.js` is in and the hash / last app / saved windows open as soon as the CSVs that hold them are registered (in order), not after all 7; 4 s cap kept (cache v55, ?v=20261020l).
- 2026-10-21 IST: R21+R22 steady resize: Auto mode enters Desktop at 1024 px and leaves it only below 960 px (no flipping near the edge); windows keep their chosen size and grow back after the browser was made smaller (cache v56, ?v=20261020m).
- 2026-10-21 IST: R35 edge snapping works again: opening a window or pressing its title bar loads the deferred snap batch at once, so an early drag gets the half / max preview, the snap and the magnet (cache v57, ?v=20261020n).

## 12. Related apps
- Controller (phone side): `../controller/controller_readme.md`
- File Drop: two-way file transfer between any devices (same frame format as phone → hub files)

## SharedLink (release 2, v 20261011b)
- `hub-controller.js` now uses `shared/link` (window.SharedLink) for the peer: same `jtsites-` prefix and saved code, so paired Gamepads keep working; new codes are 4 digits. Gamepad keys / HubCtrlLink / 'hub-ctrl-link' unchanged.
- `hub_link.js`: file routing by `meta.app` to the open app (iframe contract in `shared/link/README.md`), else viewer + toast + "Open in…"; auto-download on by default (`hub-auto-download`, toggle in the gamepad popover); Received list (IndexedDB `hub-received`); device list under the Gamepad QR tile and in the popover; this device's name.
- PeerJS loads from the pinned CDN (shared/link/link_core.js), not shared/vendor.
- App frames get a `<style id="hub-noscrollbar">` that hides scrollbars without blocking scroll.
- D-pad one-liner for apps: arrows/Space/Enter/Escape arrive as real key events; `window.addEventListener('message', e => e.data.type === 'hub-dpad' && …)` for raw buttons.

## Release 4 (2026-10-11)
- 🐻 chat bubble before the Gamepad icon (`hub_chat.js`, `hub_chat.css`): unread badge, drop-down with last 20 messages + Send, "Full chat" opens Pooh Chat; one quiet toast. `window.__hubOpenApp(match)`. Cache `hub-shell-v5`, `?v=20261011d`.

## One Connect QR (2026-10-12a)

- The home tile **Connect QR** (was "Gamepad QR") encodes `hub.html?join=CODE` — the same 4-digit Hub code.
- A phone opening `hub.html?join=CODE` (or any touch device with a saved `shared-link-join-code`) runs the Hub as a
  **joiner** (`hub/core/hub_role.js` → `hub/link/hub_remote.js`): no own code or QR, bar shows a green dot + `Hub 1234`
  (tap to scan another code). Desktop without `?join` stays the host.
- On the phone, the 🎮 button / Gamepad tile opens the controller **inside the app frame** (same tab); it borrows the
  Hub's link (`shared/link/link_core.js`), so it never disconnects. While it is open the bar adds ⛶ Full screen and
  ⚙ Gamepad settings.
- Menu → **Disconnect · use this device as Hub** is the manual Disconnect (forgets the code, reloads as host).
- The desktop's connected light is green while any device is joined.
- 2026-10-12 (v=20261012h, hub-shell-v13): Menu headers Lab and Games open their tiles pages (`apps/lab/`, `apps/games/` + `games-apps.csv`) instead of expanding; the bar label shows the category name on its tiles page or the app name for an app opened from it (`sites-hub.fromCat`, survives refresh). D-Pad Controller tile opens in a new tab on desktop, in the frame on a joined phone.
- 2026-10-12 (v=20261012j, hub-shell-v15): every menu category except Desktop and About opens a tiles page (Favorite, Games, Media, Office, Connectivity, Tools, Lab). New ones use `shared/tiles/` (tiles.js + tiles.css) with a thin `index.html` and `<cat>-apps.csv` per folder (`apps/favorite/` holds only the Favorite page). The bar label shows the category on its tiles page and the app name for an app opened from it (`sites-hub.fromCat`), regardless of the app's folder.
- 2026-10-21 IST: R41 taskbar: workspace buttons 1 / 2 are monitor-shaped (wider than tall), the ⌨ OSK button sits right after them instead of in the tray, and the version label (v0.299) is no longer shown in the Desktop tray or Phone top bar (`version.txt` kept) (cache v58, ?v=20261020o).
- 2026-10-21 IST: R43: the workspace switcher (1 | 2) and the keyboard button moved to the right side of the Desktop taskbar, just before the tray icons; Show desktop stays on the left (cache v60, ?v=20261021b).
- 2026-10-21 IST: R44: ribbon tabs in the title bar (hub-gamebar.js, same v:1 bridge as Tic Tac Toe): an app may send `tabs` [{id, label, menu?}], `activeTab` and `title` (file name) in `hub-app`, then `hub-tab` / `hub-title`; a tab click sends `hub-action` `tab:<id>` (a menu tab such as File sends `tab:file`, the app draws its own menu). Tabs and the file name (cut with …) are sized from --wm-title-h (24 / 28 / 34), selected tab highlighted; works in the Desktop window title bar and the Phone header. Apps without tabs unchanged. tree.txt: Draftly CSS now under apps/office/draftly/ui/, module list updated (cache v61, ?v=20261021c).
- 2026-10-21 IST: R44b: Phone mode: the ribbon tabs in the header (#gamebar) no longer sit under the category button (#cat-btn), so a real tap on File reaches the tab. The header's left and right parts keep their size, the bar takes its own space in between, a tab strip too wide for a small phone scrolls sideways, and the category button is a little tighter (≤440 px) while tabs show (cache v62, ?v=20261021d).
- 2026-10-21 IST: R45: AoE RTS moved from Lab (apps/lab/aoe-rts/) to Games (apps/games/aoe-rts/, PR #56): hub_appindex.js regenerated with hub_appindex_gen.py (75 apps; also picks up Neon Fist and Camera), hub_apps.js archive row moved to Games with the old Lab row kept as a comment (cache v63, ?v=20261021e).
- 2026-10-21 IST: R46: Lab Bookmark Manager replaced by MyBookmark (apps/lab/mybookmark/, PR #59): hub_appindex.js regenerated with hub_appindex_gen.py (mybookmark in Lab, bookmark-manager gone); hub_apps.js archive adds MyBookmark and keeps a marked legacy Bookmark Manager row (cache v64, ?v=20261021f).
- 2026-10-21 IST: R33c + R38: a first-visit `#app` link, last app or saved session opens without waiting for the category CSVs, using the generated app index `hub/core/hub_appindex.js` (regenerate with `hub/core/hub_appindex_gen.py` after a CSV change; a stale index falls back safely). An open Settings window now reloads to current values when it is opened again or clicked into after a setting was changed elsewhere (cache v59, ?v=20261021a).
