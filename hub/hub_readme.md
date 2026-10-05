# Hub

## 1. What it is
The start page of the site (`hub.html`). A header menu lists every app by category; apps open inside the hub in a full-size frame (or in a new tab). The home screen shows quick-access tiles on an animated wallpaper. A phone can be paired as a controller (gamepad, keyboard, trackpad) and can send files to the hub.

## 2. Files
- `../hub.html`: page shell (header, menu, controller popover, frame, home screen); loads everything with `?v=`
- `hub.css`: layout, menu, tiles, wallpaper
- `hub_apps.js`: the app list (`window.HUB_APPS_CSV`, CSV text)
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
- `hub_ctrl.css`: controller popover, pointer, file cards, image viewer
- `hub_sw.js`: service worker (shell precache, network-first, offline page); loaded by the root `../sw.js` stub
- `hub_offline.html`: "You're offline" page shown by the service worker
- `../manifest.webmanifest`, `../shared/image/hub_icon_192.png`, `hub_icon_512.png`: PWA manifest and icons
- Shared: `../vendor/peerjs.min.js`, `../vendor/qrcode.js`, `../style/no-scrollbar.css`, `../script/txt-view.html` (viewer for `.txt` entries)

## 3. Behaviour rules
- **App list (`hub_apps.js`):** columns by header name: `CATEGORY, NAME, ENTRY_URL, ICON_URL, NEW_TAB, HIDDEN, ORDER`. ENTRY_URL is a folder (opens its `index.html`), a file, or a `.txt` (shown in the text viewer). Empty ICON_URL = `folder/folder_icon.png` (or `dir/name_icon.png`). NEW_TAB 1 = new browser tab. HIDDEN 1 = not in the menu (still usable by tiles). Categories appear in the order of their first row; apps sort by ORDER. No backticks, no `${`, no commas inside a cell. A broken file shows "hub_apps.js failed to load or has an error".
- **Menu:** "Home screen" item, then collapsible categories; only one category is open at a time.
- **Home tiles (`hub_tiles.js`):** 4 tiles: QR of this hub's link ("Open on another device"), GamePad (new tab), TV (new tab), QR Scanner. 2×2 grid, one row of 4 on short landscape screens.
- **Wallpaper:** Night blue gradient, slowly moving (24 s, pure CSS); still with reduced motion.
- **Hash links + last app:** an app opened in the frame sets `hub.html#<id>` (id = folder or file name) and is remembered in localStorage. On load the hash wins, else the last app opens; an unknown hash shows home. Back / Forward switch apps. "Home screen" clears both. New-tab apps are never remembered.
- **Focus:** the app frame gets keyboard focus after loading, after picking an app and when the menu closes, so keys reach the app without clicking first. Scrollbars inside same-origin apps are hidden.
- **App bar (`hub-gamebar.js`):** an app may post `hub-app` (name, stats, buttons) and `hub-stat`; header buttons send back `hub-action`. Cleared when another app opens. Apps that never answer are unaffected.
- **Phone controller:** the gamepad button in the header opens the pairing popover (QR + code, link, status, New code, Disconnect). The phone opens `controller/controller.html#code=<code>`. Peer id = `jtsites-` + 6-character code (no 0 / O / 1 / I). The code is kept across reloads, so a phone can reconnect without opening the popover; if the old id is still held by the server it retries with backoff (never silently changes the code); network loss reconnects (2–30 s). A dot on the button shows when connected.
- **Button → key (into the app frame):** D-pad = arrows, A = Space, B = `x`, X = `z`, Y = `c`, L = `q`, R = `e`, Start = Enter, Select = Esc, Home = message only. Every button also posts `{type:'hub-dpad', b, s}`. Keys are synthetic: apps see keydown / keyup, but only shortcuts the app handles itself work.
- **Keyboard modes:** keys from the controller's keyboards are sent into the frame and typed into the focused input / textarea / editable area by the hub (incl. Backspace, Delete, Enter, ← →); also posted as `hub-key`.
- **Menu by controller:** while the menu is open, arrows / Enter / Space / Esc drive the menu instead of the app (→ opens a category, ← / Esc closes).
- **Rumble:** an app may post `{type:'hub-rumble', ms}` or `{pattern:[…]}`; it is passed to the phone's vibration.
- **Trackpad:** the hub draws its own arrow (a page can't move the real mouse) and sends synthetic pointer / mouse / wheel events to the element under it, inside same-origin frames too. Fades after 4 s idle.
- **Phone → hub files:** the controller's Files tab opens a second link; each finished file downloads at once under its own name (up to 2 GB, no resume) and shows a card with a preview; ✕ dismisses early; cards stay for 10 seconds by default (`notify.durationMs`). Cards sit bottom-right (above the receive overlay); `notify.position` can be `bottom-right`, `top-right` or `top-center`.
- **Receive overlay:** a finished image or PDF auto-opens over a white 80% backdrop (content ~80% of the screen) with the filename and ✕ at the top (files are already auto-saved). Cards stay visible on top. Esc, the controller's B button (`x`) or a backdrop click closes it. With 2+ received images/PDFs, ← → mid-viewport (and the hub D-pad) move the queue; ↑ ↓ / wheel / touch scroll a multi-page PDF (pdf.js). Other file types do not auto-open; tapping their card still opens a new tab.

- **Install as an app (PWA):** Chrome on Android offers "Install app" / "Add to Home screen" (name "Jor Teron Hub", short name "Hub", night-blue icon, standalone window, opens `hub.html`). The manifest uses relative paths, so it works under `/sites/` on GitHub Pages. `hub.html` registers `sw.js` (only over http/https, not file://). The service worker is always network-first, so new pushes show at once; the cache (hub shell + visited pages) is only used offline, and a page that was never visited shows `hub/hub_offline.html`. Cross-origin requests (PeerJS, CDNs) are not touched.
- **Why `sw.js` is at the root:** a service worker only controls pages in its own folder and below. `sw.js` must sit next to `hub.html` (one line: `importScripts('hub/hub_sw.js')`); the real code stays in `hub/`. Change the shell list or bump `CACHE` (`hub-shell-v1`) in `hub_sw.js`; old caches are deleted on activate.

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
- `hub_apps.js`: add / move / hide apps, ORDER numbers
- `hub_tiles.js`: tile list (`qr` / `app`)
- `hub_controller_config.js`: `pointer` (speed, acceleration, size, hideAfterMs, scrollSpeed, colours), `receive` (autoSave, maxBytes, ackEveryBytes), `notify` (position, durationMs, maxStack, previewSize, showPreviews, revokeAfterMs)
- **Cache-buster:** after changing any hub file, bump every `?v=` in `../hub.html` (currently `20261005d`), or browsers keep the old copy.
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
- Many apps have no menu icon yet (404s are expected).
- Root `hub-apps.csv` and `tree.txt` are old copies, not used by the hub.
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
- 2026-10-05 07:16 IST: installable PWA: manifest, icons, root `sw.js` → `hub/hub_sw.js`, offline page.

- 2026-10-05 17:34 IST: receive overlay (images + PDF scroll), queue arrows, 10 min toast.

- 2026-10-05 18:00 IST: receive overlay polish (no Download, mid-side arrows, 95% content, 10 s toast).

## 12. Related apps
- Controller (phone side): `../controller/controller_readme.md`
- File Drop: two-way file transfer between any devices (same frame format as phone → hub files)
