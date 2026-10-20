SITES HUB - TECHNICAL GUIDE: HUB AND VIRTUAL DESKTOP
====================================================

For a developer picking up the Hub (hub.html) and its virtual desktop.
Written from the code as of R17, build bumped in R25+R26 (2026-10-20, build ?v=20261020g,
cache hub-shell-v50). Plain HTML / CSS / JS, no build step, no framework.
Every file starts with a header comment: read it first, it is the spec.
Short user notes live in hub/hub_readme.md; this file is the deep dive.


CONTENTS
--------
  1.  Overview: Desktop mode and Phone mode
  2.  Folder map and ownership
  3.  Startup and hub_loader (core, deferred, on demand)
  4.  Window manager, snap, magnet and workspaces
  5.  Start menu, category CSVs, hub_apps.js, cached Start list
  6.  Taskbar, tray and on-screen keyboard (OSK)
  7.  Files, drives, file types, Open with and the Viewer
  8.  Google sign-in (device flow, phone as a key, popup)
  9.  Phone link (SharedLink, Gamepad, Connect QR)
  10. Favorites
  11. Wallpaper
  12. Settings
  13. Service worker, caching, 9am refresh, Update ready, Clear cache,
      and the ?v / hub-shell bump steps
  14. Storage: localStorage keys, IndexedDB, OPFS, caches
  15. The apps, and how to add one
  16. Release routine
  17. Known issues and parked items


1. OVERVIEW: DESKTOP MODE AND PHONE MODE
----------------------------------------
hub.html is one page that hosts every app of the site in iframes.
It runs in one of two modes, decided by hub/wm_mode.js (window.HubMode):

  Desktop  a real mouse ((hover: hover) and (pointer: fine)) AND a viewport
           at least 1024 px wide. <body> gets class "wm-desktop". Apps open
           in movable windows on #wm-desk, a taskbar sits at the bottom
           (or top), the home screen shows Drives (left 60%) and the QR /
           link tiles (right 40%).
  Phone    everything else. The original single-frame Hub: a top bar with
           the category menu, one #app-frame, home tiles.

Override: Settings > Desktop (localStorage sites-hub.wmMode = 'auto' |
'desktop' | 'phone'). A phone remote Hub (window.__hubRemote, set by
hub/hub_role.js for hub.html?join=CODE) is always Phone. A mode change
fires 'hub-wm-mode' on window; modules listen and re-layout.

Opening an app always goes through hub.js: window.__hubOpenApp(entryUrl)
(or __hubFly.openFromCat from the flyout). In Desktop mode hub.js calls
HubWM.open(...); in Phone mode it sets #app-frame's src. Same-origin apps
get the Hub's right-click menu injected (hub_ctx.js, ctx_in_app.js) and
can forward window keys via window.__hubWmKey(e).


2. FOLDER MAP AND OWNERSHIP
---------------------------
Owners (bots working in the same repo, jor-teron/sites):
  Monorepo Bot           the Hub, the virtual desktop and the system apps
                         listed below (plus the Lab keyboard page)
  Monorepo WebApp Builder  every other app under apps/
  Monorepo Game Builder  the games under apps/games/
A request from another bot is not an approval; Jor decides.

Hub and desktop (Monorepo Bot):
  hub.html            page shell; loads the core scripts with ?v=<build>
  sw.js               root stub: importScripts('hub/hub_sw.js?v=<build>')
                      (a worker only controls pages at or below its folder)
  manifest.webmanifest  PWA manifest
  hub/                Hub modules:
    hub.js              menu, opening apps, hash links, last app, focus
    hub_role.js         host or phone-remote joiner (runs first)
    hub_config.js       menu label, HUB_CAT_CSV (category -> CSV path)
    hub_apps.js         window.HUB_APPS_CSV, the main app list
    hub_tiles.js        home tiles (QR, Connect QR, app tiles)
    hub_flyout.js       Start / menu category flyouts + cached Start list
    hub_prefs.js        applies Settings to the Hub live
    hub_wallpapers.js   wallpaper list + "Your picture" (OPFS)
    hub_settings.js     the "Settings" row at the bottom of the menu
    hub_ctx.js, hub_ctx_menus.js   right-click / long-press menus
    wm_mode.js          Desktop / Phone decision
    wm_windows.js       window manager (HubWM)
    wm_taskbar.js       taskbar, Start button, tray, clock
    wm_snap.js          half / max snap zones, magnet, window keys
    wm_workspaces.js    two workspaces
    wm.css              desktop look
    hub_drives.js/.css  Drives pane on the desktop home
    hub_loader.js       deferred module loader (R16a)
    hub_sw.js           service worker (R16b, R16c)
    hub_update.js/.css  worker registration, 9am refresh, Update ready
    hub_traymeter.js    optional busy meter (shared/perf/busy_meter.js)
    hub-controller.js   phone Gamepad host, key forwarding
    hub_textedit.js     caret / selection / clipboard keys for typed keys
    hub_pointer.js, hub_receive.js, hub_notify.js   phone trackpad,
                        phone -> Hub files, received-file cards
    hub_viewer.js, hub_viewer_pdf.js   received-file overlay (images,
                        PDF via shared/vendor/pdfjs/, video, audio)
    hub_link.js, hub_linkstate.js, hub_remote.js, hub_chat.js,
    hub-gamebar.js, hub_phonekey.js   phone link glue (section 9)
    controller/         phone Gamepad page + kb_common.js (shared keys)
    osk/                on-screen keyboard (section 6)
    version.txt         line 1 'v0.299', line 2 release date (Jor decides)
    hub_offline.html    shown by the worker when offline and not cached
  shared/fs/          fs_drives.js, fs_ops.js, fs_ref.js, filetypes.js,
                      thumbs_store.js
  shared/google/      google_config.js, google_auth.js, gdrive_fs.js,
                      google_gis.js, phonekey.js, gdrive_connect.js,
                      google.css
  shared/ctxmenu/     ctxmenu.js/.css, ctx_in_app.js
  shared/dialog/      dialog.js/.css (UiDialog: confirm, choose, info...)
  shared/tiles/       tiles.js/.css: category tiles pages + TilesCsv
  shared/wallpaper/   wallpapers.js + the wallpaper JPGs
  shared/favorites/   favorites.js (HubFavorites)
  apps/settings/      Settings app (sections: Wallpaper, Desktop,
                      Windows, Sizes, Look, How-to, About)
  apps/tools/files/   Files app
  apps/tools/sysmon/  System Monitor (tasks, CPU, memory, network,
                      storage, battery)
  apps/tools/phonekey/  phone page for "Phone as a key"
  apps/tools/viewer/  image / video Viewer app
Shared but used by everyone: shared/link/ (SharedLink), shared/vendor/.


3. STARTUP AND HUB_LOADER (CORE, DEFERRED, ON DEMAND)
-----------------------------------------------------
hub.html loads the CORE with plain <script> tags (order matters):
hub_role, qrcode, hub_config, wallpapers + hub_wallpapers, hub_prefs,
wm_mode, ctxmenu + ctx_in_app + hub_ctx, wm_windows, wm_taskbar,
wm_workspaces, busy_meter + hub_traymeter, hub_apps, hub_tiles, hub.js,
tiles, favorites, hub_flyout, hub_ctx_menus, hub_settings, dialog,
hub_controller_config, hub_notify, hub_pointer, hub_receive, the
shared/link scripts, hub_textedit, hub-controller, hub_link,
hub_linkstate, link_scan, hub_remote, hub_chat, hub-gamebar,
hub_update, and last hub_loader.js.
Workspaces, favorites and the link stay core because they are visible
at once (switcher, "My favorites", the home QR tile).

hub/hub_loader.js (window.HubLoader) loads the rest AFTER the page
'load' event, in batches (scripts in order, a missing file never stops
the rest):
  drives   google.css, hub_drives.css, google_config, google_auth,
           gdrive_fs, google_gis, phonekey, gdrive_connect, fs_drives,
           hub_drives, hub_phonekey             first idle moment
  snap     wm_snap.js                           ~1.5 s, then idle
  osk      osk.css, controller/kb_common, osk_layout, osk_board,
           osk_drag, osk.js                     next idle
  viewer   hub_viewer_pdf, hub_viewer           next idle
Idle = requestIdleCallback (setTimeout fallback).
On demand (the batch loads at once, then the action runs):
  - the tray "keyboard" button: a stub button (data-stub) is placed in
    the tray; clicking it loads osk, removes the stub, shows the OSK
  - Ctrl+Alt+K (osk) and Ctrl+Alt+arrows (snap): caught by the loader
    (document keydown + the __hubWmKey chain), replayed after loading
  - HubViewer.open / pushAndShow: a stub HubViewer loads the viewer
    batch, then calls the real one (hub_viewer.js replaces the stub)
  - OSK left open last time (sites-hub.osk = '1'): osk loads at once
API: HubLoader.load(name) -> Promise, HubLoader.loaded(name).
Keep the loader's V constant equal to the ?v= in hub.html.


4. WINDOW MANAGER, SNAP, MAGNET AND WORKSPACES
----------------------------------------------
hub/wm_windows.js (window.HubWM), Desktop mode only.
  - Window = title bar (icon, name, minimise / maximise / close) + its
    own iframe. Drag the bar to move, edges / corners to resize,
    double-click to maximise. Minimised windows keep running.
  - Instances: key = ENTRY_URL. Opening again focuses; newInstance
    (Shift+click, middle-click, "New window") adds "Notely 2" etc.
  - Session: saved in localStorage sites-hub.wmSession (position, size,
    max / min / snap, workspace, z-order) and restored on load.
  - Focus on hover: optional (sites-hub.hoverFocus).
  - API: open({key, name, icon, url, app, newInstance}), focus, minimise,
    restore, toggleMax, close, closeAll, minimiseAll, list(), active,
    setSnap(w, 'l'|'r'|''), setMax, ws, setWs(n), moveToWs, wsCount,
    dragHook. Events 'hub-wm-change', 'hub-wm-focus', 'hub-wm-ws'.
  - window.__hubAppFrame() = the focused window's iframe;
    __hubAppFrames() = all; __hubTasks for System Monitor.
  - Keys inside same-origin apps reach window.__hubWmKey(e). Each module
    (wm_snap, wm_workspaces, osk, hub_loader) wraps the previous handler.

hub/wm_snap.js (deferred batch "snap"):
  - Half / max zones: drag with the pointer in the left / right edge zone
    (SIDE px, whole height) = half; top strip between them = maximise.
    Preview #wm-snap-pv. Switch: Settings > Windows "Snap windows to
    screen edges" (sites-hub.snapEdges '0' = off, html.hub-snap-off).
    THIS IS CURRENTLY BROKEN AND SWITCHED OFF (see section 17).
  - Magnet (R13/R14): window edges within the magnet distance stick to
    desk edges and other visible windows' edges. Distance = Settings >
    Windows "Magnet strength" sites-hub.snapMagnetPx 10-100, default 20.
    "Magnetic edges" switch sites-hub.snapMagnet ('0' = off). Alt or Shift
    held = no magnet. window.HubMagnet {on, lines, stick, px} is shared
    with the floating OSK.
  - Keys: Ctrl+Alt+Left/Right (or Super+Left/Right) = half,
    Ctrl+Alt+Up = maximise, Ctrl+Alt+Down = restore.
  - The desk ends above the taskbar and the docked OSK.

hub/wm_workspaces.js: two workspaces. Switcher "1" "2" after Show
Desktop; Ctrl+Alt+PageUp / PageDown (also Super+Ctrl+Left/Right);
"Move to workspace 1 / 2" in window menus. sites-hub.workspaces = '1'
means one workspace (switcher hidden, all windows on 1).


5. START MENU, CATEGORY CSVS, HUB_APPS.JS, CACHED START LIST
------------------------------------------------------------
Main menu (top-left button in Phone mode, Start in Desktop mode) is
built by hub.js from window.HUB_APPS_CSV in hub/hub_apps.js. It is a JS
file (not a .csv) so it also works over file://. Columns by header name:
CATEGORY, NAME, ENTRY_URL, ICON_URL, NEW_TAB, HIDDEN, ORDER. Rules: no
backtick and no "${" in the text, no commas in a cell, one app per line.
Missing icon = <folder>/<folder>_icon.png.

Category pages + flyouts: each category has its own CSV, mapped in
hub/hub_config.js (HUB_CAT_CSV):
  Favorite      apps/favorite/favorite-apps.csv
  Games         apps/games/games-apps.csv
  Media         apps/media/media-apps.csv
  Office        apps/office/office-apps.csv
  Connectivity  apps/connectivity/connectivity-apps.csv
  Tools         apps/tools/tools-apps.csv
  Lab           apps/lab/lab-apps.csv
CSV columns: name, path (relative to that folder), icon, newtab,
section (optional group heading). Lines starting with # are comments.
Parsed by window.TilesCsv (shared/tiles/tiles.js), which also draws the
tiles pages (apps/<cat>/index.html).

Flyout (hub/hub_flyout.js, mouse only): hovering a category row ~100 ms
opens a column with that category's apps; Favorite adds "My favorites".
Cached Start list (R16c): built lists are kept in localStorage
sites-hub.startList = {apps: hash of HUB_APPS_CSV, cats: {cat: {h: hash
of the CSV text, list}}}. A cached list shows at once; the CSV is read
again in the background (once per page load) and the list is rebuilt
(and an open flyout redrawn, event 'hub-startlist') only when the hash
changed. A changed hub_apps.js drops the whole cache. All categories are
warmed ~2 s after load when idle.
Keep hub_apps.js and the category CSVs in step by hand.


6. TASKBAR, TRAY AND ON-SCREEN KEYBOARD (OSK)
---------------------------------------------
hub/wm_taskbar.js (#wm-taskbar):
  - Start (opens the menu above the bar; hover-to-open, switch
    sites-hub.startHover), Show Desktop (minimise all / bring back),
    workspace switcher, one button per window of this workspace
    (click = focus / minimise; right-click = New window, Move to
    workspace, Minimise, Close; middle-click = new window).
  - Tray (.wm-tray): the top bar's right side (chat bubble, Devices
    button, version) is MOVED here in Desktop mode and back in Phone
    mode. OSK button, optional busy meter, clock (12 h).
  - Taskbar at top or bottom: sites-hub.taskPos; height sites-hub.taskH.

OSK (hub/osk/), a panel on the Hub page, not a window:
  osk_layout.js  OSK_LAYOUT rows (shared with apps/lab/keyboard/)
  osk_board.js   OSK_BOARD: draws keys with CTRL_KB.kit from
                 hub/controller/kb_common.js (the phone Gamepad's
                 keyboard code): press = keydown, release = keyup, hold
                 = repeat, Shift / Ctrl / Alt one-shot or held, Caps.
  osk_drag.js    docked at the bottom (slide left / right) or undocked
                 floating; snaps / magnets like windows; never saved,
                 every open starts docked at bottom centre.
  osk.js         panel (60% wide, click-through sides), tray button,
                 Ctrl+Alt+K, hide key, window.HubOSK {show, hide,
                 toggle, shown}. Shown state: sites-hub.osk.
Typing path: each key becomes {t:'key', key, code, s:1|0, shift, ctrl,
alt, repeat} and goes to window.__hubController.key(msg) (forwardKey in
hub/hub-controller.js), the same path as a phone keyboard: key events
into the focused app frame, text typed into inputs; caret, selection,
Tab, undo and clipboard keys are done by hub/hub_textedit.js. Focus goes
back to the active window (window.__hubFocusFrame). While docked the
work area shrinks so windows stay above it.


7. FILES, DRIVES, FILE TYPES, OPEN WITH AND THE VIEWER
------------------------------------------------------
shared/fs/fs_drives.js (window.FsDrives), used by the desktop Drives
pane (hub/hub_drives.js) and Files. Drive kinds, all a
FileSystemDirectoryHandle (or a look-alike) so shared/fs/fs_ops.js works
on all of them:
  local   "Local": OPFS (navigator.storage.getDirectory()); asks the
          browser to persist storage on first use.
  folder  a real folder from showDirectoryPicker (Chrome / Edge
          desktop). Handle kept in IndexedDB 'sites-fs' / 'drives';
          after a reload it needs one click on "Allow access".
          Removing only forgets it.
  gdrive  Google Drive, only when shared/google is loaded; the handle is
          the "hub" folder in My Drive (GDriveFs.hubRoot()). States:
          setup | connect | renew | ok.
Changes broadcast on BroadcastChannel 'sites-fs'.

Files app (apps/tools/files/): files_core, files_view, files_drives,
files_actions, files_viewer, files_thumbs, files_menu, files.js. Opens
on #drive=<id>&path=<A/B>. Thumbnails: shared/fs/thumbs_store.js,
IndexedDB 'sites-thumbs' / 'thumbs', 50 MB cap (Settings > Windows
thumbnail options, sites-hub.filesThumbs; click behaviour
sites-hub.filesClick).

shared/fs/filetypes.js (window.FileTypes): kind by extension then MIME:
image, video, text (txt, md, json, csv, log, js, css, html, py, m3u,
srt and more), or ''. Apps: viewer (images + videos), notely (text),
textview (Files' own text view), photo-editor / paint (open app only).
Double-click = default app; right-click "Open with >" lists the rest.

Hand-off to other apps:
  - Viewer: shared/fs/fs_ref.js puts the file in the URL hash
    (#drive=local&path=A%2FB&file=cat.png); FsRef.openIn(appUrl, ref)
    opens or re-points the app's window; FsRef.resolve(ref) gets handles.
  - Notely: Files puts {name, text, t} in sessionStorage
    'notely-handoff' (max 2 MB) and opens apps/office/notely/; Notely
    takes it once if under 2 minutes old (nl_handoff.js). This file
    (README_technical.txt) opens this way.
Viewer app (apps/tools/viewer/): viewer_core, viewer_image,
viewer_video, viewer.js. Steps through the folder's images / videos;
keys: arrows, Home/End, J/K/L, +/-, 0, 1, R, F.
Not to confuse with hub/hub_viewer.js: the overlay for files received
from a phone.


8. GOOGLE SIGN-IN (DEVICE FLOW, PHONE AS A KEY, POPUP)
------------------------------------------------------
shared/google/google_auth.js (window.GoogleAuth), no Google library:
  - QR / device flow ("TVs and Limited Input devices"): POST
    oauth2.googleapis.com/device/code, show the code, poll /token, keep
    access + refresh token. Hidden now (GOOGLE_CONFIG.qrEnabled off,
    because its client secret cannot be pushed to GitHub).
  - setToken(resp, method) for tokens got another way: 'phone' or
    'popup'. These have no refresh token: after ~1 h expired() is true
    and the tile offers "Renew from phone".
  - Stored in localStorage sites-hub.google = {refresh, access, exp,
    email, name, scope, method}. Shared between windows by
    BroadcastChannel 'sites-google' + the storage event. RISK: any
    same-origin script can read it; sign out on a shared computer.
Phone as a key (default method):
  1. The Drive tile / Files makes a room (shared/google/phonekey.js):
     16 random characters, single use, 10 min, kept in
     sites-hub.phonekeyRooms. QR -> apps/tools/phonekey/?hub=<code>&k=<room>.
  2. The phone page joins the Hub's SharedLink, signs in with Google
     Identity Services (google_gis.js) and sends {type:'phonekey', k,
     access_token, expires_in, email, scope}. The token is never in a URL.
  3. hub/hub_phonekey.js checks the room, calls GoogleAuth.setToken and
     answers phonekey-ok with a "next" room (3 h) for "Send again".
"Sign in on this computer": Google's popup here (google_gis.js).
UI: shared/google/gdrive_connect.js (GDriveConnect.mount). Drive access:
shared/google/gdrive_fs.js (directory-handle look-alike).
Config and setup steps: google_config.js and Settings > How-to.


9. PHONE LINK (SHAREDLINK, GAMEPAD, CONNECT QR)
-----------------------------------------------
shared/link/link_core.js (window.SharedLink): one PeerJS layer (PeerJS
pinned from a CDN in PEERJS_URL). The desktop Hub hosts with a 4-digit
code kept in localStorage 'jtsites-hub-ctrl-code'; phones join it.
  - hub/hub-controller.js: Gamepad host, QR pairing popover, forwards
    D-pad / keys into the app frame, rumble back to the phone.
  - hub/hub_link.js: routes received files (to a registered app, else
    the overlay + toast), keeps the last 30 in IndexedDB 'hub-received';
    'hub-auto-download' (default on).
  - Connect QR tile = hub.html?join=CODE. hub/hub_role.js makes such a
    Hub a joiner (window.__hubRemote, code saved as
    'shared-link-join-code'); hub/hub_remote.js joins.
  - hub_chat.js (chat bubble), hub_linkstate.js, hub-gamebar.js (app
    bar from the app in the frame), hub_pointer.js (trackpad),
    hub_receive.js (phone -> Hub files).
The worker never caches PeerJS or its signalling (cross-origin).


10. FAVORITES
-------------
shared/favorites/favorites.js (window.HubFavorites): "Add to Favorites"
on category tiles, Start rows and flyout apps. localStorage
sites-hub.favorites = [{name, path, icon, newTab}] (paths from the site
root). Shown under "My favorites" in the Favorite flyout and on the
Favorite tiles page, after apps/favorite/favorite-apps.csv. Event
'hub-favorites'; category pages reach it via window.parent.HubFavorites.


11. WALLPAPER
-------------
hub/hub_wallpapers.js: list of ids (gradients, 'night' default, slide /
light flags), every picture in shared/wallpaper/wallpapers.js as
'pic:<file>', a custom colour '#rrggbb', and 'mine' = "Your picture",
a file in the Local drive (OPFS) folder Wallpapers/. Choice in
sites-hub.wallpaper; hub/hub_prefs.js paints #empty.


12. SETTINGS
------------
apps/settings/: settings.js (section list + pane, open section in the
hash, e.g. #about), settings_store.js (reads / writes 'sites-hub.<key>'
and calls parent.HubPrefs.apply() + posts {type:'hub-prefs'}), and one
file per section: sec_wallpaper, sec_desktop, sec_windows, sec_sizes,
sec_look, sec_howto, sec_about. hub/hub_prefs.js re-applies on the
'storage' event and on that message, so changes are live.
About: version (hub/version.txt), "Check for update"
(HubUpdate.check({manual:true})), "Last refreshed" and "Clear cache now"
(confirm with UiDialog, then HubUpdate.clearCache()).
Opened from the "Settings" row at the bottom of the menu
(hub/hub_settings.js) or Start right-click.


13. SERVICE WORKER, CACHING, 9AM REFRESH, UPDATE READY, CLEAR CACHE
-------------------------------------------------------------------
sw.js (root) -> hub/hub_sw.js. Caches:
  hub-shell-vNN  precached shell (SHELL list: Hub files, shared modules,
                 OSK, Start icons, category CSVs, version.txt, icons,
                 offline page). New name per release.
  hub-rt-1       runtime: app pages and images opened at least once.
  hub-meta       which shell files changed since the page loaded them.
Fetch rules (same-origin GET only):
  - cross-origin (Google APIs / OAuth / Drive, PeerJS, CDNs): untouched
  - cache:'no-store' / 'reload' requests and Range requests: untouched
  - shell files with no ?v or ?v = this worker's V: cache first,
    refreshed in the background (stale-while-revalidate)
  - shell files with a newer ?v: network first
  - *.csv and hub/version.txt: network first, cache when offline
  - apps/ and other html / css / js: network first, kept in hub-rt-1
  - images: cached copy at once, refreshed in the background (R25)
  - fonts: cache first
  - offline navigation not cached: hub/hub_offline.html
Updates (hub/hub_update.js, window.HubUpdate):
  - A new worker WAITS (only the first install activates at once). A
    small "Update ready - Reload - x" note appears (#hub-upd-note,
    hub_update.css). Reload posts {type:'skip-waiting'}; the page
    reloads when the new worker takes control. Never a forced reload.
  - Daily refresh at 09:00 browser local time, or on the next open after
    a missed 09:00 (sites-hub.lastRefresh, ms). It runs reg.update() and
    asks the worker {type:'refresh'}: every SHELL file is fetched again
    and only changed ones are replaced (the cache is never wiped). If
    anything changed: no window / app open -> quiet reload, else the
    note. Timer checks at most every hour (sleeping computers catch up).
  - Settings > About "Check for update": compares the live hub.html
    build tag, clears hub-shell-* and reloads (manual, so allowed).
  - clearCache(): deletes hub-shell-*, hub-rt-* caches, the cached Start
    list and lastRefresh, unregisters the worker, reloads.
Bump steps for every Hub release (pick the next build tag, e.g.
20261020f, and cache number):
  1. hub.html: every ?v= (sed the old tag to the new one).
  2. sw.js: importScripts('hub/hub_sw.js?v=<new>').
  3. hub/hub_sw.js: V = '<new>' and CACHE = 'hub-shell-v<NN+1>'; add
     any new shell file to SHELL.
  4. hub/hub_ctx.js: const V = '<new>'.
  5. hub/hub_loader.js: const V = '<new>'.
  6. hub/version.txt only when Jor says so.


14. STORAGE: LOCALSTORAGE KEYS, INDEXEDDB, OPFS, CACHES
-------------------------------------------------------
localStorage, prefix sites-hub.:
  Key                 Written by / used by        Value
  wmMode              Settings > Desktop          auto | desktop | phone
  wmSession           wm_windows.js               JSON window session
  lastApp             hub.js                      last app (Phone mode)
  fromCat             hub.js                      category of open app
  fromLab             hub.js (old, removed)       -
  startHover          Settings > Desktop          '0' = no hover-open
  startList           hub_flyout.js (R16c)        cached Start lists
  favorites           favorites.js                JSON list
  wallpaper           Settings > Wallpaper        id / pic: / mine / #hex
  taskH, titleH       Settings > Sizes            px
  taskPos             Settings > Sizes, taskbar   bottom | top
  accent, theme,      Settings > Look             #hex, dark | light,
    motion                                        on | reduced | off
  hoverFocus          Settings > Windows          '1' = on
  snapEdges           Settings > Windows          '0' = off
  snapMagnet          Settings > Windows          '0' = off
  snapMagnetPx        Settings > Windows          10..100 (default 20)
  workspaces          Settings > Windows          '1' = one workspace
  trayMeter           Settings > Desktop          '1' = busy meter
  filesClick          Settings > Windows          single | double
  filesThumbs         Settings > Windows          '0' = icons only
  osk                 osk.js                      '1' = keyboard shown
  google              google_auth.js              token record (JSON)
  phonekeyRooms       phonekey.js                 pairing rooms
  lastRefresh         hub_update.js (R16c)        ms of last refresh
sessionStorage: sites-hub.updTried (update-check loop guard),
  notely-handoff (Files -> Notely).
Other localStorage keys: jtsites-hub-ctrl-code (Hub link code),
  shared-link-join-code (phone remote), hub-auto-download.
IndexedDB:
  sites-fs / drives       added folder handles (fs_drives.js)
  sites-thumbs / thumbs   Files thumbnails, 50 MB cap (thumbs_store.js)
  hub-received            last 30 received files (hub_link.js)
OPFS (navigator.storage.getDirectory()): the "Local" drive; its folder
  Wallpapers/ holds "Your picture".
Cache Storage: hub-shell-vNN, hub-rt-1, hub-meta (section 13).
BroadcastChannels: sites-fs, sites-google, sites-thumbs.


15. THE APPS, AND HOW TO ADD ONE
--------------------------------
Every app is a self-contained folder under apps/<category>/<app>/ with
its own index.html and <app>_icon.png; it runs inside a Hub window or
frame, and can use the Hub's helpers when same-origin (window.parent:
__hubOpenApp, HubFavorites, SharedLink, hub-gamebar messages).
To add an app: (1) make the folder with index.html and an icon;
(2) add a row to apps/<category>/<category>-apps.csv (name, path, icon,
newtab, section); (3) add the matching row to hub/hub_apps.js
(CATEGORY, NAME, ENTRY_URL, ...). No cache bump is needed for app files
(apps/ is network first). Changing hub_apps.js resets the cached Start
list automatically. Category CSVs are checked on every load.


16. RELEASE ROUTINE
-------------------
Releases are small and named R-numbers (R16a, R16b ...). Wording from
Jor: "no coding" = discussion only; "lets do / build / lets fix" =
commit locally only; "push" = push; "code n push" = both. "wait" =
pause. Each release ends with a short report including minutes spent.
Git (other bots share the local repo, keep commits isolated):
  git stash push -u -m aside -- \
    apps/games/ar-game/vendor/three/build/three.module.min.js \
    nei-dict tv/local.m3u
  git pull --rebase --autostash origin main
  git stash pop
  git add <explicit paths only>
  git commit -m "Hub Rxx: ..."
  git log origin/main..HEAD        (only your commits may go)
  git push "https://x-access-token:$(gh auth token)@github.com/\
jor-teron/sites.git" HEAD:main     (no force; one retry)
  gh api repos/jor-teron/sites/commits/main --jq '.sha[0:7]'
Never commit: the stashed leftovers above, the deleted
apps/lab/hero-builder/node_modules files, other bots' untracked files
(e.g. files_dialog.js, files_preview.js, lab.js, lab.css) or other
bots' READMEs, or any secret. Bump the cache (section 13) when Hub
files change.


17. KNOWN ISSUES AND PARKED ITEMS
---------------------------------
  - Edge snapping (half / max zones) is broken and switched off in
    Settings; the magnet and the snap keys work. Parked.
  - 12 Lab apps are in the CSV but missing from hub_apps.js, so not in
    the Start menu: MyLLM, Local AI Chat, AI Story, LLM Calculator,
    Bookmark Manager, Wiki Extractor, Google Drive Test, Media Explorer,
    IPTV player, Channel Cleaner, Three.js Viewer v2, Aeroplane.
  - The "Google Drive" label is squeezed in the Files sidebar.
  - Wallpaper thumbnails in Settings load the full images.
  - An open Settings window does not refresh when values change
    elsewhere.
  - Mail shares the Hub's Google sign-in record.
  - OSK: resize, vibrate, a Phone mode and pop-up on text fields.
  - Favorites: reorder, put on the desktop.
  - Terminal app, menu D-pad navigation, folder download and drop,
    version number format, optional JS bundle.
  - Not yet tested: touch on a real phone (Lava), a real Google Drive
    sign-in end to end.
  - The leaked TV client secret must be deleted in Google Cloud (Jor).
