# Phone launcher (`phone/`), release PH16

<!-- legacy header: "release PH10" (PH10 … PH13); "release PH14" (PH14, PH15) -->

A phone-style home screen for the Hub. Jor runs it as the **Android home screen inside a WebView**
(PH3 will be the tiny APK). It works fully by gesture and behaves like a phone launcher.
Open `phone/` (or `/phone.html`; `phone/index.html` only redirects to it) on the Hub's site.
H79: the page is `/phone.html` at the site root, next to the root `index.html` mode picker (PH15: `hub.html` was removed in H129d; the desktop is `desktop/desktop.html`); its own files stay in `phone/`.

## Gestures

| Where | Gesture | Does |
|---|---|---|
| Home | swipe left / right (75 px, or a quick flick) | next / previous home page (dots show where you are) |
| Home or dock | swipe up | app drawer |
| Home | swipe down | quick panel |
| Any app icon | tap | open the app full screen inside the launcher |
| Any app icon | long-press (≈0.5 s) | menu: Open · Pin to home / Remove from home · Add to dock / Remove from dock · App info |
| Drawer | swipe left / right | next / previous category tab |
| Drawer | drag up / down | scroll the list (with a fling) |
| Drawer | pull down on the search bar or the category bar, or in the list when it rests at its bottom, or Back | close (PH9) |
| Quick panel | swipe up, tap below it, or Back | close |
| Open app | swipe right from the left edge, or Back | home (the app stays alive) |

Desktop testing: mouse drags do the same; wheel down = drawer, wheel up = panel, ← / → = pages,
↑ or `/` = drawer (+ search), ↓ = panel, Esc = back (when the launcher, not the app, has focus).

## Pieces

- **Home:** big clock + date on page 1, pinned apps in a 4-column grid (6 on wide screens), pages with dots,
  a dock of up to 5 apps. Page 1 holds 16 apps, later pages 24; pinning fills the first page with room.
- **Drawer:** search box (name first, then category / description), category tabs from the Hub catalog
  (`HUB_CAT_CSV` order; PH4: no All tab), icons in alphabetical order.
- **Quick panel:** 8 tiles (PH16: Intercom, Telephone, Location removed; Theme is Dark ↔ Light): Theme (Dark → Light → Hub), Full screen, Intercom, Telephone, Location
  (placeholder dialog until Live Location LL1 exists), Settings, Hub Settings (H80), Do Not Disturb (H82);
  Notices list (Hub notices, kept across reloads since PH2).
- **Settings** (sheet): Theme, 24 h / 12 h clock, Apps kept open (1 or 2), Test wallpaper, Reset home layout, About.
- **Apps** open in an iframe that fills the screen. At most 2 app frames stay alive (setting), the oldest is
  dropped. Back works through `history` (each layer pushes a state; `popstate` closes it), so the
  Android WebView's `goBack()` closes the app / drawer / panel. At home there is nothing to go back to,
  so the APK should hide the Page there. PH6: the launcher calls `window.hubBack()` instead (see PH6 below).
- **Hub handshake:** an app frame that posts `{sharedLink:'ready'}` (same origin + one of our frames only) gets
  `{sharedLink:'hello', code, prefix:'jtsites-', devices:[]}` when this device has a Connect Code saved
  (`shared-link-join-code`, else the Hub's own `jtsites-hub-ctrl-code`). No code = no reply, and apps use their
  standalone path as usual. ~~The launcher runs no PeerJS peer of its own.~~ (before PH14) PH14: the phone can now
  join or host a Connect Code itself (Connect sheet, below); a joined phone sets `window.__hubRemote`, so app frames
  borrow its link (link_core.js borrowed link) instead of opening their own.
- **H79 Hub mesh:** `/phone.html` loads the Hub link stack (H79 … PH13: separate tags `shared/link/link_core.js`, `link_devices.js`,
  `hub_mesh.js`, `hub/link/hub_meshlink.js`; PH14: the one `hub/core/hub_core.js`), so `window.HubMeshLink` exists and this device joins the public
  **00000** lobby at startup (H73 rule, switch `sites-hub.meshPublic`). Intercom / Telephone / Screen Share /
  Shared Clipboard read `parent.HubMeshLink` (isPrivate / privateCode → else 00000). With HubMeshLink the hello
  reply sends only the private mesh code (none on 00000 = no reply); the saved Connect Code is used only without it.
- **H80 Hub settings:** the phone reads the Hub's own keys, no copies. `sites-hub.theme` (light / dark, set by Hub
  Settings > Look, incl. Auto) and `sites-hub.accent` (`--acc`) apply at load (head script) and live (`storage`
  event + `{type:'hub-prefs'}` from a Settings frame). **PH16: the phone no longer follows `sites-hub.theme`; only Light / Dark, the accent still follows the Hub.** ~~Phone theme default is now `system`, shown as **Hub** (follow
  the Hub, then the device); Light / Dark stay as a phone-only override. Saves without `th80` (pre-H80, always
  'dark') move to Hub once.~~ (H80 … PH15) Mesh on/off stays `sites-hub.meshPublic` (H79). Quick panel tile **Hub Settings**
  opens `apps/system/settings/index.html` in a phone app frame (not added to Recent).
- **H81 Hub dialogs and notices:** `/phone.html` loads the Hub's dialog bridge (`shared/dialog/*`,
  `hub/core/hub_dialog_bridge.js`), so app dialogs (UiDialog) draw over the whole phone screen like on the Hub.
  `phone/phone_notify.js` gives apps `window.top.HubNotify.notice(...)` / `hubToast`: each notice shows a short
  toast and is listed in the quick panel's **Notices** (tap = the app's action, ✕ = dismiss). Kept across reloads (PH2).

## Transparent background

`html` and `body` are always `background: transparent`, so the Android wallpaper shows through the WebView
(the APK must also set the WebView background to transparent). `#wall` is only a **test wallpaper**:

- Setting *Test wallpaper*: Auto (default) · None · a colour.
- **Auto** = transparent inside an Android WebView (user agent has `; wv)`, or `?webview=1`), a dark gradient in
  a normal browser.
- `?bg=` beats the setting: `?bg=none` (transparent), `?bg=1e3a8a` / `?bg=%231e3a8a` / `?bg=abc`, `?bg=auto`.

## Files

| File | What |
|---|---|
| `/phone.html` (site root, H79) | page, layers, script order. `<title>Phone PH14</title>` (legacy `Phone PH1` comment; phone_app.js sets the live title). PH14: `?v=PH14` on `phone.css`, `phone_app.js`, `phone_connect.js` (before PH14: no `?v=` labels) |
| `index.html` | redirect only, to `../phone.html` (keeps ?query and #hash) |
| `phone.css` | Stopwatch palette, dark default; animations on transform / opacity only |
| `phone_save.js` | the one save module (`PhoneSave`) |
| `phone_apps.js` | catalog reader (`PhoneApps`), read only |
| `phone_notify.js` | Hub notices + the one toast queue (`HubNotify`, `hubToast`, `phoneToast`), H81 / PH2 |
| `phone_gesture.js` | pointer gestures: axis lock, swipe / flick, tap, long-press (`PhoneGesture`) |
| `phone_connect.js` | PH14: Connect sheet + `#net-dot` status dot, host / join / Disconnect / reconnect (`PhoneConnect`) |
| `vendor/jsQR.js` | PH14: copy of jsQR (+ LICENSE) for Scan QR when `BarcodeDetector` is missing, loaded only on first scan |
| `phone_app.js` | the UI (`PhoneLauncher` debug handle: `state()`, `stack()`, `page()`, `cat()`, `frames()`, `open(id)`, `back()`; PH6: global `window.hubBack()`) |

App list: `../hub/core/hub_appindex.js` (`HUB_APP_INDEX`, generated by `hub_appindex_gen.py`) and the category
order from `../hub/core/hub_config.js`. Both are only read; the launcher is not in any apps CSV.

## Storage

`localStorage['phone-launcher-v1']` = `{ v:1, pages:[[id…]…], dock:[id…≤5], recent:[id…≤8],
settings:{ theme:'dark'|'light'|'system', wall:'auto'|'none'|'#rrggbb', clock24, keepAlive:1|2, th80, ph5 } }`.
Repaired on load (bad types → defaults, duplicates and unknown ids dropped). Storage blocked → memory only.
Defaults (PH5): dock Message, Telephone, Camera; page 1 TV. Theme `system` (shown as Hub) follows `sites-hub.theme`,
then the device. Flags: `th80` = saved from H80 on (older 'dark' saves move to system once); `ph5` = saved from
PH5 on (older saves get the PH5 home and dock once). PH6: page 1 keeps at most 16 apps; extra apps move to the next page.

## Limits (PH1)

- Only tested in headless Chrome with emulated touch; not yet inside a real Android WebView.
- Full screen needs the WebView to support it (`onShowCustomView`); otherwise the tile shows a note.
- Apps that navigate inside their frame add history entries, so Back steps back inside the app first.
- Esc inside an app goes to the app, not the launcher (use the edge swipe or Back).
- No drag-to-reorder of icons yet; no wallpaper picker (the phone's wallpaper is used).
- Offline only works when the Hub's service worker was installed on that origin (visit the Hub once); PH3 bundles it.

## H82 — Do Not Disturb and call pop-up

- Quick panel tile **Do Not Disturb** toggles the Hub-wide `window.HubDnd` (`sites-hub.dnd`), the same switch as the Hub's 🔔 and Settings › Do Not Disturb.
- `/phone.html` loads `hub/core/hub_attention.js`: an app frame posting `{sharedLink:'attention', app, kind:'call', title, urgent, fav?}` gets an Answer / Decline card over the phone; replies go back as `{sharedLink:'attention-reply', app, kind:'call', action}`. Answer shows that app's frame. `kind:'call-end'` closes it. See hub/docs/README_technical_team3.txt (H82).

## PH2 — Notices kept, one toast queue (2026-11-01 IST)

- Notices survive a reload: saved in `localStorage` `sites-phone.notices` (newest first, last 50, this device only, never synced); ✕ and taps update it. Tap actions only work in the session that made them. File transfers still running at a reload come back as one "⚠️ Interrupted" notice each (pending names in `sites-phone.noticeFiles`). `HubNotify.clear()` empties the list.
- Phone toasts and notice toasts now share one queue (`window.phoneToast(msg, ms)` in phone_notify.js), so neither cuts the other off; same look.
- Comments updated for H83: the public lobby is 00000 (5 digits).

## PH4 — Drawer without All (2026-11-01 IST)

- The drawer has no **All** tab; tabs are only the catalog categories (PH7: Favorite is now hidden, see PH7).
- It opens on the last-used category (`localStorage` `sites-phone.cat`, this device only); missing or gone → the first catalog category.
- Swipes move between real categories only. Search still looks across every app.

## PH5 — Home cleanup (2026-11-01 IST)

- New defaults: home page 1 holds only **TV**; the dock is **Message, Telephone, Camera**. Message stays hidden until the app is in the catalog, then appears by itself (dock ids are no longer dropped from the save).
- One-time move: saves without `settings.ph5` get the new home and dock once; theme, wallpaper, clock and keep-alive settings and recent apps are kept. Fresh installs and Reset get the new defaults.
- The clock sits higher on page 1 (top gap 1.5vh, was 5vh; still below the safe area).
- The dock is light glass in both themes: `rgba(255,255,255,.18)` (was `--glass`, black in dark theme).

## PH6 — Android Back, reload, new-tab apps (2026-11-02 IST)

- **`window.hubBack()`** for Keypad Launcher v0.48 (`webView.evaluateJavascript("window.hubBack ? window.hubBack() : false")`).
  Synchronous; the result string is `'true'` (handled) or `'false'` (bare home: nothing open).
  - Dialog open → dismissed, `true`. Drawer / panel / sheet on top → closed, `true`.
  - App on top → the phone posts `{type:'hub-back'}` into that app's frame (same origin; `'*'` on `file:`) and returns `true`.
    If the frame replies `{type:'hub-back', handled:true}` within 150 ms, the app stays open (it handled its own Back);
    otherwise the app closes. A second press while waiting closes the app at once.
  - Bare home → `false` (also on page 2+); the launcher then hides the Page.
  - Launcher contract: hide the Page on `'false'`; call `goBack()` only when `hubBack` is undefined (old pages);
    holding Back always closes the Page.
- **Back after reload:** a reload with layers open left stale `{ph:n}` history entries, so Back seemed dead. On load the
  phone now steps back to its base entry, and a `popstate` onto an entry deeper than the open layers is skipped.
- **New-tab apps:** catalog apps with the newTab flag open with `window.open(url, '_blank')` (no frame); toast if blocked.
- **Page 1 cap:** older saves with more than 16 apps on page 1 move the extra to the next page(s).
- Null-safe toasts for pin / unpin / dock when an app left the catalog; Intercom / Telephone missing dialogs use proper names.
- Full screen tile state also reads `webkitFullscreenElement`. Release name `PH6` (title + About).

## PH7 — Bottom-up home and drawer (2026-11-02 IST)

- **Home:** pinned apps fill from the bottom. The first app sits bottom-left, the bottom row fills left to right, then the row above. The grid sits just above the dots and dock; page 1's clock stays at the top. Rows are 4 wide (6 at 700px and wider, matching `.grid` in phone.css) and are re-chunked when that changes on resize.
- **Drawer:** search and category tabs are a bottom bar (CSS `order`, phone.html unchanged). The app list fills bottom-up the same way (first app alphabetically at bottom-left) and opens scrolled to its bottom; scroll up for more.
- **Drawer gestures:** pull down closes when the list is at its bottom resting position or the drag starts on the bottom bar; otherwise it scrolls (fling kept). Left/right still changes category.
- **Favorite hidden (phone only):** no Favorite tab; its apps (e.g. TV) are listed under the first tab. Search still finds them. A saved last-used Favorite falls back to the first tab. `hub_config.js` and the catalog are unchanged.
- Release name `PH7`.

## PH8 — Sections inside drawer categories (2026-11-02 IST)
- **Source:** each category's `apps/<cat>/<cat>-apps.csv` (`window.HUB_CAT_CSV`), `section` column. `phone_apps.js` `loadSections()` reads `window.SITES_CSV[cat]` when present, else fetches the CSV (`cache: 'no-cache'`). Parsing mirrors `shared/tiles/tiles.js` (`TilesCsv.parse/groups`, used by the Hub flyout): `#` comments skipped, columns by header (old 5-column rows work), cells trimmed, paths relative to the CSV folder, first appearance sets section order, empty section = **Other**, shown last. Rows map to apps by resolved path (trailing `/` and `index.html` ignored).
- **API:** `PhoneApps.sections(cat)` → `[{name, apps}]` (CSV order inside a section); `PhoneApps.onSections(fn)` re-renders the drawer once loaded.
- **Drawer:** a heading above each section's grid. Bottom-up like PH7: the first section sits at the bottom next to the bar, later sections stack above; inside a section the first app is bottom-left. Favorite apps (e.g. TV) are a **Favorite** section at the very bottom of the first tab. Search stays one flat list.
- **Fallback:** a CSV that fails to load (offline, 404) leaves that tab flat, no headings, no errors. `hub/update/hub_sw.js` already caches every `apps/*/*-apps.csv` (network first), so sections also show offline once cached.
- Release name `PH8`.

## PH9 — Search on top, dock-style category bar (2026-11-02 IST)
- **Layout:** search bar back at the top of the drawer; category bar stays at the bottom. Done in CSS only: `#drawer-head` is `display:contents`, so `#search` (order 0), `#list-vp` (1) and `#tabs` (2) are laid out by `#drawer`. phone.html unchanged.
- **Category bar:** same look as the home dock (rounded 26px glass panel, light blur). Each category is a larger button, emoji over a short label: Games 🎮, Media 🎬, Office 📄, Connectivity 📡, Tools 🛠️, Lab 🧪, Learn 📚, System ⚙️, anything else 📁. Selected = accent (`--acc`). The bar scrolls sideways when it doesn't fit; the selected tab is scrolled into view. `role=tab`, `aria-selected`, `aria-label` and keyboard activation kept; taps go through the gesture code; left/right swipe still changes category.
- **Closing:** pull down on the search bar or the category bar, or in the list when it rests at its bottom. The list stays bottom-up and opens scrolled to its bottom.
- Release name `PH9`.

## PH10 — Hidden apps (2026-11-02 IST)
- **`phone/hidden-apps.csv`** (new) hides apps from the phone for everyone; the Hub catalog and desktop are unchanged. Format:
  ```
  # lines starting with # are comments
  category, id, note
  Games,    sudoku,     icon missing
  ```
  Columns are read by the header row, cells trimmed. Only `id` (the catalog id shown in App info) is used to match; `category` is for reading, and a mismatch only logs a `console.warn`. `note` is for you (no commas). Ships with no active rows. A missing / failing CSV hides nothing and logs no errors. API: `PhoneApps.csvHidden()` → `[{id, category, note}]`, `PhoneApps.onHidden(fn)`.
- **On this phone:** long-press → **Hide app** adds the id to `settings.hidden`. Phone settings → **Hidden apps** lists every hidden app (icon, name, category, source `CSV` or `This phone`) with **Unhide**: a local one is removed from `settings.hidden`; a CSV one is added to `settings.unhidden` (shown again on this phone only; delete the CSV line to unhide for everyone).
- **Rule:** hidden = (CSV ∪ `settings.hidden`) − `settings.unhidden`. Hidden apps are left out of the drawer, sections, search, home pages and dock. Their ids stay saved in pages / dock / recent (`clean()` doesn't drop them), so Unhide puts them back where they were. Both lists ≤200 ids, repaired on load (`phone_save.js`).
- Offline: `phone/hidden-apps.csv` must be added to the `hub/update/hub_sw.js` SHELL list.
- Release name `PH10`.

## PH11 — Drawer scrolls up, Hub cache, faster drawer (2026-11-02 IST)
- **Scroll rule:** the list stays bottom-up and opens at its bottom. A pull down inside the list now scrolls up to the apps above (with fling). It closes the drawer only when the list is already at its very top, when the list doesn't overflow, or when the pull starts on the search bar or the category bar.
- **Cache:** `phone.html` now turns on Hub's existing service worker (`sw.js` at the site root, `updateViaCache: 'none'`), registered from `phone_app.js` when the page isn't controlled yet. Phone shares Hub's cached icons. No reload-on-update logic here (that stays Hub's).
- **CSV local copy:** the last good text of each category CSV and `phone/hidden-apps.csv` is kept in localStorage (`phone-csv-v1:<url>`, skipped if >60 KB or over quota). Sections / hidden apps draw from it at once, then a fresh copy is fetched quietly and re-delivered only if the text changed (`onSections` / `onHidden` fns run again).
- **Icon warm-up:** after the drawer renders, its lazy icons that aren't loaded yet are switched to eager, so the apps above are ready when you scroll up.
- Release name `PH11`.

## PH12 — Night blue default wallpaper
- **Default:** Hub's Night gradient (`#0B1033 → #26307A → #5562C4`, from `hub_wallpapers.js` / `hub_main.css`) is the phone wallpaper, also inside the Android WebView. It slides slowly like Hub's (`#wall.night`, 24 s), static under `prefers-reduced-motion`.
- **Setting:** the row is now "Wallpaper": Night blue, See-through (needs a transparent APK WebView), and 5 plain colours. Saved `'auto'` becomes `'night'` on load. `?bg=night` (or `auto`) works.
- Release name `PH12`.

## PH13 — Reload (get latest)
- **Phone settings → "Reload (get latest)"** (row "Phone PH13", above About): asks Hub's service worker to re-fetch every SHELL file (`{type:'refresh'}`, same as `hub_update.js`; also `registration.update()`), waits for `sw-refreshed` (max 8 s), clears the PH11 CSV copies (`PhoneApps.clearCopies()`, keys `phone-csv-v1:*`), then reloads the page. No service worker: just clears and reloads.
- Home pages, dock, hidden apps and settings (`phone-launcher-v1`) are untouched. Cached images in `hub-rt-1` are left alone (the SW re-checks them within a day). No `window.hubRefresh` (APK hook cancelled).
- Release name `PH13`.

## PH14 — Connect on the phone (2026-11-04 IST)
- **Hub core:** `/phone.html` loads `hub/core/hub_core.js` (H127: parts boot + link + mesh, parser-blocking, so every
  global is there for the next tag) right after the dialog / notice scripts (`hub_attention.js`), instead of the old
  separate `link_core` / `link_devices` / `hub_mesh` / `hub_meshlink` / `hub_line` / `hub_trust` tags (kept as legacy
  comments). Nothing loads twice. No desktop-shell file is loaded (no `hub/controller/*`, `hub_remote.js`,
  `hub_panels.js`, Game Bar): they move to `desktop/` later. The desktop host / join rules are re-implemented in
  `phone/phone_connect.js`, which waits for `HubCore.ready`.
- **Status dot** `#net-dot` (top right, outside `#home`, hidden while an app or the drawer is open): grey = offline /
  not linked, blue = public 00000 mesh (`HubMesh.linked()`), green = private (`HubMeshLink.isPrivate()`), plus the
  number of other devices (mesh peers; private: the Connect devices). Tap = Connect sheet. Repaints on SharedLink /
  HubMesh events and every 3 s.
- **Quick panel tile 🔗 Connect** (lit when private) → the **Connect sheet** (replaces the panel; drag the grab bar or
  the head down, tap the shade, or Back = close):
  - this phone's 5-digit number, big (`SharedLinkDevices.code()`, key `shared-link-device-code`), Copy; device name;
  - join box (numeric, 5 digits) + **Join** (Enter works). 00000 = back to public; this phone's own number is refused;
  - **📷 Scan QR** (only when the camera API exists): `shared/link/link_scan.js` + `phone/vendor/jsQR.js` (only when
    `BarcodeDetector` is missing), both loaded on first use;
  - **🔒 Host private**: hosts this phone's number, shows a QR (`shared/vendor/qrcode.js`, lazy) of `desktop/desktop.html?join=CODE` (PH14 first used `hub.html?join=`)
    with Share / Copy link (`JOIN_PAGE` in phone_connect.js, the one line to change when the desktop page moves);
  - ↻ Reconnect (joined, not connected), the **Devices** list and a red **Disconnect** behind the launcher's in-app
    confirm (Cancel / Disconnect). No browser dialogs.
- **Keys** (same as the desktop): join = `SharedLink.join({prefix:'jtsites-', code, meta:{pad:1}})` like
  `hub_remote.js`, saved in `shared-link-join-code`, rejoined after a reload (any pointer type; also `?join=CODE`
  through `hub_role.js`). Host = `SharedLink.host({prefix:'jtsites-', code: device number})` (H92 rule, no Gamepad pad
  alias), kept across reloads by the phone-only key `sites-phone.host` = '1'. `jtsites-hub-ctrl-code` is not written.
  Disconnect: joined → `SharedLink.stop()` (forgets the code); hosting → `stop(true)` + drop `sites-phone.host`.
- **Reconnect:** `visibilitychange` → visible and `online` re-join a dropped join (or re-host a dead host peer) with a
  fresh backoff; like `hub_remote.js` H25 a joined phone stops retrying after 5 min without the Hub
  (`SharedLink.pause()`, code kept) until the next wake / tap. `pagehide` = quiet `pause()`.
- **Limits:** tested headless only (box Chrome blocks WebRTC; no real two-device link). A phone and `desktop/desktop.html` open in
  the same browser both host the same number → 'taken' (toast). `pad:1` (like hub_remote.js) means a desktop Hub may
  treat the phone as its Gamepad controller. `phone_connect.js` and `vendor/jsQR.js` are not in the service worker's
  SHELL list yet (cached at runtime after the first online load).
- Release name `PH14` (`RELEASE`, `PhoneConnect.VERSION`).

## PH15 — Phone mode (2026-11-04 IST)
- **Remember mode:** opening `/phone.html` saves `localStorage['sites-hub.mode'] = 'phone'` (try/catch), so the root
  `index.html` mode picker (H129d) opens the phone next time.
- **Quick panel tiles:** 🖥️ **Switch to Desktop** → in-app confirm (Cancel / Switch); Switch saves
  `sites-hub.mode = 'desktop'` and goes to `index.html?os=desktop` (→ `desktop/desktop.html`). 🔀 **Choose mode…** →
  `index.html?choose` (shows the picker again).
- **hub.html gone:** comments and docs now name `desktop/desktop.html` / `index.html`. The only functional use,
  `JOIN_PAGE` in `phone_connect.js`, already pointed at `desktop/desktop.html` (PH14 update); `?join=CODE` still works.
- `phone.html` stays at the site root (`MODE_TARGET.phone = 'phone.html'`).
- Release name `PH15` (`RELEASE`, `PhoneConnect.VERSION`, `<title>`, `?v=PH15` on phone_app / phone_connect / phone_apps).

## PH16 — Shade trims, Light / Dark only, wider lower dock with Messages (2026-11-04 IST)

Jor: "In phone notification, remove Intercom, Telephone, Location; Phone will now only use Light/Dark theme, remove Hub;
Homescreen Dock can be bit lower, and wider; put Message app in Dock too."

- **Quick panel (pull-down shade):** the Intercom, Telephone and Location tiles are gone (8 tiles now: Theme, Full screen,
  Settings, Hub Settings, Do Not Disturb, Connect, Switch to Desktop, Choose mode…). The apps stay in the drawer.
  The Notices list is unchanged.
- **Theme:** Light / Dark only. Settings shows Light · Dark; the Theme tile toggles Dark ↔ Light. The H80 "Hub"
  (`system`) option is removed. Migration (`phone_save.js` repair + `phone.html` head script): a saved `system`, a
  missing theme or a pre-H80 save resolves once to what it showed (`sites-hub.theme` light / dark, else the device
  `prefers-color-scheme`) and is saved as `light` / `dark` with `settings.ph16`. The phone no longer listens to
  `sites-hub.theme` (storage event, `hub-prefs` message) or the device scheme; `sites-hub.accent` still applies live.
- **Dock:** lower (`#dock-wrap` bottom padding 12 → 6 px, safe-area still applied by `#home`) and wider (side padding
  10 → 8 px, max-width 560 → 640 px, gap 6 → 4 px); icons spread evenly across the dock (columns = number of icons,
  was at least 4). Gestures unchanged.
- **Messages in the dock:** the PH5 default `message` never matched the catalog id `messages`, so it was hidden.
  Default dock is now Messages, Telephone, Camera. Existing saves (no `ph16`) get `message` renamed to `messages`,
  or `messages` added first if missing and the dock has room (max 5), once.
- Release PH16: `RELEASE`, `PhoneConnect.VERSION`, `<title>`, `?v=PH16` on phone.css, phone_save.js, phone_app.js,
  phone_connect.js.
