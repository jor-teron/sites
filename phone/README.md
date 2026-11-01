# Phone launcher (`phone/`), release PH6

A phone-style home screen for the Hub. Jor runs it as the **Android home screen inside a WebView**
(PH3 will be the tiny APK). It works fully by gesture and behaves like a phone launcher.
Open `phone/` (or `/phone.html`; `phone/index.html` only redirects to it) on the Hub's site.
H79: the page is `/phone.html` at the site root, next to `hub.html`; its own files stay in `phone/`.

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
| Drawer | pull down at the top of the list or on the header, or Back | close |
| Quick panel | swipe up, tap below it, or Back | close |
| Open app | swipe right from the left edge, or Back | home (the app stays alive) |

Desktop testing: mouse drags do the same; wheel down = drawer, wheel up = panel, ← / → = pages,
↑ or `/` = drawer (+ search), ↓ = panel, Esc = back (when the launcher, not the app, has focus).

## Pieces

- **Home:** big clock + date on page 1, pinned apps in a 4-column grid (6 on wide screens), pages with dots,
  a dock of up to 5 apps. Page 1 holds 16 apps, later pages 24; pinning fills the first page with room.
- **Drawer:** search box (name first, then category / description), category tabs from the Hub catalog
  (`HUB_CAT_CSV` order; PH4: no All tab), icons in alphabetical order.
- **Quick panel:** 8 tiles: Theme (Dark → Light → Hub), Full screen, Intercom, Telephone, Location
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
  standalone path as usual. The launcher runs no PeerJS peer of its own.
- **H79 Hub mesh:** `/phone.html` loads the Hub link stack (`shared/link/link_core.js`, `link_devices.js`,
  `hub_mesh.js`, `hub/link/hub_meshlink.js`), so `window.HubMeshLink` exists and this device joins the public
  **00000** lobby at startup (H73 rule, switch `sites-hub.meshPublic`). Intercom / Telephone / Screen Share /
  Shared Clipboard read `parent.HubMeshLink` (isPrivate / privateCode → else 00000). With HubMeshLink the hello
  reply sends only the private mesh code (none on 00000 = no reply); the saved Connect Code is used only without it.
- **H80 Hub settings:** the phone reads the Hub's own keys, no copies. `sites-hub.theme` (light / dark, set by Hub
  Settings > Look, incl. Auto) and `sites-hub.accent` (`--acc`) apply at load (head script) and live (`storage`
  event + `{type:'hub-prefs'}` from a Settings frame). Phone theme default is now `system`, shown as **Hub** (follow
  the Hub, then the device); Light / Dark stay as a phone-only override. Saves without `th80` (pre-H80, always
  'dark') move to Hub once. Mesh on/off stays `sites-hub.meshPublic` (H79). Quick panel tile **Hub Settings**
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
| `/phone.html` (site root, H79) | page, layers, script order. `<title>Phone PH1</title>` (phone_app.js sets the live title, `Phone PH6`), no `?v=` labels |
| `index.html` | redirect only, to `../phone.html` (keeps ?query and #hash) |
| `phone.css` | Stopwatch palette, dark default; animations on transform / opacity only |
| `phone_save.js` | the one save module (`PhoneSave`) |
| `phone_apps.js` | catalog reader (`PhoneApps`), read only |
| `phone_notify.js` | Hub notices + the one toast queue (`HubNotify`, `hubToast`, `phoneToast`), H81 / PH2 |
| `phone_gesture.js` | pointer gestures: axis lock, swipe / flick, tap, long-press (`PhoneGesture`) |
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

- The drawer has no **All** tab; tabs are only the catalog categories (Favorite stays a normal tab).
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
