SITES HUB - TECHNICAL GUIDE: HUB AND VIRTUAL DESKTOP
====================================================

NEW 2026-10-22: full Hub + Apps + Games handover snapshot in hub/docs/README_technical_20261023.txt

For a developer picking up the Hub (hub.html) and its virtual desktop.
Written from the code as of R17 (updated through R43, 2026-10-21).
Current build tag and shell cache: see hub/build.txt (one place).
Plain HTML / CSS / JS, no build step, no framework.
Every file starts with a header comment: read it first, it is the spec.
Short user notes live in hub/docs/hub_readme.md; this file is the deep dive.


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
It runs in one of two modes, decided by hub/wm/wm_mode.js (window.HubMode):

  Desktop  a real mouse ((hover: hover) and (pointer: fine)) AND a viewport
           at least 1024 px wide (R21: once in Desktop it stays down to
           960 px). <body> gets class "wm-desktop". Apps open
           in movable windows on #wm-desk, a taskbar sits at the bottom
           (or top), the home screen shows Files (left 60%, R54b; connected drives only, R56: plus greyed
           folders that need "Allow access") and the QR /
           link tiles (right 40%).
  Phone    everything else. The original single-frame Hub: a top bar with
           the category menu, one #app-frame, home tiles.

Override: Settings > Desktop (localStorage sites-hub.wmMode = 'auto' |
'desktop' | 'phone'). A phone remote Hub (window.__hubRemote, set by
hub/core/hub_role.js for hub.html?join=CODE) is always Phone. A mode change
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
  sw.js               root stub: importScripts('hub/update/hub_sw.js?v=<build>')
                      (a worker only controls pages at or below its folder)
  manifest.webmanifest  PWA manifest
  hub/                Hub modules, by feature folder (R31):
    core/               hub.js (menu, opening apps, hash links, last app,
                        focus), hub_role.js (host or phone-remote joiner,
                        runs first), hub_config.js (menu label, HUB_CAT_CSV),
                        hub_apps.js (window.HUB_APPS_CSV, LEGACY list, see
                        section 5), hub_prefs.js (applies Settings live),
                        hub_loader.js (deferred loader, R16a), hub_main.css
    wm/                 wm_mode.js (Desktop / Phone), wm_windows.js (HubWM),
                        wm_taskbar.js (taskbar, Start, tray, clock),
                        wm_snap.js (snap zones, magnet, window keys),
                        wm_workspaces.js (two workspaces), wm.css
    menu/               hub_flyout.js/.css (Start flyouts + cached Start
                        list), hub_tiles.js (home tiles), hub_settings.js
                        (the "Settings" menu row), hub_ctx.js +
                        hub_ctx_menus.js (right-click / long-press menus)
    link/               hub_link.js, hub_linkstate.js, hub_remote.js,
                        hub_chat.js/.css, hub-gamebar.js, hub_phonekey.js
                        (phone link glue, section 9), hub_pointer.js
                        (phone trackpad), hub_receive.js (phone -> Hub files)
    controller/         phone Gamepad page + kb_common.js (shared keys),
                        and the Hub side: hub-controller.js (Gamepad host,
                        key forwarding), hub_controller_config.js,
                        hub_controller.css, hub_textedit.js (caret /
                        selection / clipboard keys for typed keys)
    osk/                on-screen keyboard (section 6)
    viewer/             hub_viewer.js, hub_viewer_pdf.js (received-file
                        overlay: images, PDF via shared/vendor/pdfjs/,
                        video, audio), hub_notify.js + hub_notification.css
                        (received-file cards)
    drives/             hub_drives.js/.css (Files pane on the desktop home, R54b),
                        hub_wallpapers.js (wallpaper list + "Your picture"),
                        hub_traymeter.js (optional busy meter)
    update/             hub_sw.js (service worker, R16b, R16c),
                        hub_update.js/.css (registration, 9am refresh,
                        Update ready), hub_offline.html (offline page)
    docs/               README_technical.txt (this file), hub_readme.md
    version.txt         line 1 'v0.299', line 2 release date (Jor decides);
                        stays at hub/version.txt (read by Settings too)
    build.txt           current build tag + shell cache name (R32; docs
                        only, nothing reads it; updated on every bump)
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
  apps/system/settings/ Settings app (sections: Wallpaper, Desktop,
                      Windows, Sizes, Look, How-to, About)
  apps/system/files/   Files app
  apps/system/disk/    Disk app (R54: drives, space, sizes, clean-up;
                      browsing stays in Files)
                      R54b: Files and the desktop Files pane only
                      browse connected drives; managing is in Disk
  apps/system/sysmon/  System Monitor (tasks, CPU, memory, network,
                      storage, battery)
  apps/system/terminal/ Terminal (T1 + T2 + T3): green-on-black command
                      line; help, clear, echo, date, history, apps, open,
                      build, theme + file commands on the /drive/... tree:
                      read (pwd, cd, ls, cat, head, tail, wc, tree, stat,
                      drives, allow) and, T3, change (mkdir, touch, cp,
                      mv, rm, rmdir, edit, find, grep, > and >>). Keys
                      hub-terminal.* in localStorage. See its README.md
  apps/system/apphub/  App Hub (AH1): Favourites row (favorite-apps.csv
                      order) + category tiles with counts; #cat=<name>
                      category pages (AH3: breadcrumb App Hub > Category
                      instead of a Back button); opens apps in the Hub.
                      Not an app store. See its README.md
  apps/tools/phonekey/  phone page for "Phone as a key"
  apps/system/viewer/  image / video Viewer app
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

hub/core/hub_loader.js (window.HubLoader) loads the rest AFTER the page
'load' event, in batches (scripts in order, a missing file never stops
the rest):
  drives   google.css, hub_drives.css, google_config, google_auth,
           gdrive_fs, google_gis, phonekey, gdrive_connect, fs_drives,
           hub_drives, hub_phonekey             first idle moment
  snap     wm_snap.js                           ~1.5 s, then idle
  osk      osk.css, controller/kb_common, osk_layout, osk_board,
           osk_drag, osk.js                     next idle
  viewer   hub_viewer_pdf, hub_viewer           next idle
  saver    hub/core/hub_saver.js (R49)          next idle
Idle = requestIdleCallback (setTimeout fallback).
On demand (the batch loads at once, then the action runs):
  - the taskbar "keyboard" button: a stub button (data-stub) is placed
    just before the tray, after the workspace switcher (R43; R41 had it on the left); clicking it loads osk and shows the OSK; the stub is
    removed only once osk is in and window.HubOSK exists (R27)
  - Ctrl+Alt+K (osk) and Ctrl+Alt+arrows (snap): caught by the loader
    (document keydown + the __hubWmKey chain), replayed after loading
  - HubViewer.open / pushAndShow: a stub HubViewer loads the viewer
    batch, then calls the real one (hub_viewer.js replaces the stub)
  - OSK left open last time (sites-hub.osk = '1'): osk loads at once
API: HubLoader.load(name) -> Promise, HubLoader.loaded(name),
HubLoader.need(name) (on demand, shows the note), HubLoader.failed(name).
R28: files that fail are recorded per batch; the batch is not marked
done and the next on-demand use retries them. An on-demand action on a
batch with failures shows a small note (#hub-load-note, hub_update.css):
"Couldn't load <feature>. Check your connection and reload." Drives has
no on-demand entry, so its failures only show in HubLoader.failed.
Keep the loader's V constant equal to the ?v= in hub.html.

R49 clock screen saver (hub/core/hub_saver.js, saver batch above, CSS
inline in the file). Full-screen #hub-saver overlay (z-index 2147483600,
above windows, taskbar and the Phone top bar) with one SVG analog clock.
R49c minimalist face: the circle only (stroke 7, no ticks, no numbers),
hour hand 8, minute hand 3.5 (theme colour), second hand 1.5 in red
#e53935 (both themes), round caps. Centre at 25% of the viewport height, size min(40vh, 70vw);
drifts up to 6 px every minute (burn-in). Theme: html.hub-light (theme
= light) -> --bg background + --text clock, else near-black + white.
  Idle time: localStorage sites-hub.saverIdle = whole minutes; 0 = off,
  else clamped to 1..240; missing / invalid = 5 (on) (R49b; R49 had only
  0/10/15/30, default off). The 'storage' event applies a change live;
  Settings > Desktop writes it from a number input (0..240, '0 = Off').
  Activity that resets the timer: mousemove / mousedown / keydown /
  touchstart / wheel on the Hub and on same-origin app documents,
  window blur (focus into an app iframe), any hub-* bridge message
  from the Hub's own origin (R57; on file:// from the Hub page or one
  of its own iframes, since every file page has the origin 'null').
  Not started (timer delayed) while document.hidden, a fullscreen
  element exists, or a <video> plays in the Hub or a same-origin app.
  Checked every 5 s.
  Dismiss: any mouse move, press, touch, wheel or key; the event is
  captured on window and stopped, and the click / mouseup that follows
  within 600 ms is swallowed too, so nothing reaches the app or desktop.
  API window.HubSaver: start(), stop(), set(min) (same rules as the key,
  writes the normalised value), active() -> bool, minutes() -> current
  idle minutes (0 = off), secMode(m?) -> get / set the second hand.
  (_angles, _draws, _busy are test helpers.)
  Second hand (R49c): localStorage sites-hub.saverSec = smooth (default,
  also when missing / invalid) | quartz | off, live via 'storage'.
    smooth  requestAnimationFrame sweep
    quartz  jumps once a second, setTimeout aligned to the second; no rAF
    off     no second hand; hour / minute redrawn every 10 s (aligned)
  One scheduler: a mode change cancels the previous rAF / timer; nothing
  runs while the saver is hidden or document.hidden.


4. WINDOW MANAGER, SNAP, MAGNET AND WORKSPACES
----------------------------------------------
hub/wm/wm_windows.js (window.HubWM), Desktop mode only.
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
    On the Hub page each module has its own document keydown listener
    for its own keys only; the chain is just for keys from apps, so a key
    is handled once (R29; the loader also replays a key at most once).

hub/wm/wm_snap.js (deferred batch "snap"):
  - Half / max zones: drag with the pointer in the left / right edge zone
    (SIDE px, whole height) = half; top strip between them = maximise.
    Preview #wm-snap-pv. Switch: Settings > Windows "Snap windows to
    screen edges" (sites-hub.snapEdges '0' = off, html.hub-snap-off).
    R35: works again. wm_windows.js asks HubLoader for this batch on the
    first window open and on a title-bar press, so a drag before the
    ~1.5 s idle load still snaps (it used to find HubWM.dragHook null).
  - Magnet (R13/R14): window edges within the magnet distance stick to
    desk edges and other visible windows' edges. Distance = Settings >
    Windows "Magnet strength" sites-hub.snapMagnetPx 10-100, default 20.
    "Magnetic edges" switch sites-hub.snapMagnet ('0' = off). Alt or Shift
    held = no magnet. window.HubMagnet {on, lines, stick, px} is shared
    with the floating OSK.
  - Keys: Ctrl+Alt+Left/Right (or Super+Left/Right) = half,
    Ctrl+Alt+Up = maximise, Ctrl+Alt+Down = restore.
  - The desk ends above the taskbar and the docked OSK.

hub/wm/wm_workspaces.js: two workspaces. Switcher "1" "2" after Show
Desktop; Ctrl+Alt+PageUp / PageDown (also Super+Ctrl+Left/Right);
"Move to workspace 1 / 2" in window menus. sites-hub.workspaces = '1'
means one workspace (switcher hidden, all windows on 1).
R51 open maximised: every NEW window (any app, Settings too) opens
maximised unless sites-hub.openMax = '0' ('1' / missing = on). The
key is read on every open, so a change (Settings > Desktop "Open
windows maximised", or the storage event from another tab) applies to
the next window. The normal cascade rect is still set first, so
Restore / double-click / un-snap goes back to w.pref (R22) or that
default size and place. Session-restored windows keep their saved
state (max / snap / min / rect). Snap, workspaces, Phone mode unchanged.


5. START MENU, CATEGORY CSVS, HUB_APPS.JS, CACHED START LIST
------------------------------------------------------------
Main menu (top-left button in Phone mode, Start in Desktop mode) is
built by hub.js from window.HUB_APPS_CSV in hub/core/hub_apps.js. It is a JS
file (not a .csv) so it also works over file://. Columns by header name:
CATEGORY, NAME, ENTRY_URL, ICON_URL, NEW_TAB, HIDDEN, ORDER. Rules: no
backtick and no "${" in the text, no commas in a cell, one app per line.
Missing icon = <folder>/<folder>_icon.png.

Category pages + flyouts: each category has its own CSV, mapped in
hub/core/hub_config.js (HUB_CAT_CSV):
  Favorite      apps/favorite/favorite-apps.csv
  Games         apps/games/games-apps.csv
  Media         apps/media/media-apps.csv
  Office        apps/office/office-apps.csv
  Connectivity  apps/connectivity/connectivity-apps.csv
  Tools         apps/tools/tools-apps.csv
  Lab           apps/lab/lab-apps.csv
  System        apps/system/system-apps.csv   (R53: Settings, About)
CSV columns: name, path (relative to that folder), icon, newtab,
section (optional group heading). Lines starting with # are comments.
Parsed by window.TilesCsv (shared/tiles/tiles.js), which also draws the
tiles pages (apps/<cat>/index.html).

Flyout (hub/menu/hub_flyout.js, mouse only): hovering a category row ~100 ms
opens a column with that category's apps; Favorite adds "My favorites".
Cached Start list (R16c): built lists are kept in localStorage
sites-hub.startList = {apps: hash of HUB_APPS_CSV, cats: {cat: {h: hash
of the CSV text, list}}}. A cached list shows at once; the CSV is read
again in the background (once per page load) and the list is rebuilt
(and an open flyout redrawn, event 'hub-startlist') only when the hash
changed. A changed hub_apps.js drops the whole cache. All categories are
warmed ~2 s after load when idle.
hub_apps.js is LEGACY (R30) and, since R33a, keeps ONLY the category
list + order (the "<Category> Page" rows; every visible category has
one, so the menu / Start lists only the categories and a click opens the
category page) and the hidden system rows that are in no category CSV
(Desktop/vDesktop, Settings, About, Contact, Feedback, Transcribe). The
old app rows sit in a commented archive block at the end of the file
(not parsed). Every app comes from its category CSV: hub_flyout.js
exposes window.HubStartList {cached(cat), load(cat)} (the cached Start
lists) and hub.js registers those apps in HUB_CAT_CSV order (so hash ids
like #snake stay the same) for hash links, last app, session restore,
__hubOpenApp and app names / icons / NEW_TAB. hub.js starts (hash / last
app / session) as soon as hub_flyout.js is in (event hub-startlist-ready,
DOMContentLoaded fallback): at once when every list is cached, else
(R33b) all 7 CSVs load in parallel, are registered in order as each one
(and those before it) arrives, and start runs as soon as the hash / last
app / saved windows are known; 4 s cap. __hubOpenApp('<path>/') before
that waits for the lists; a part-of-path match needs them loaded.
New apps: add them to the category CSV only.
R33c app index: hub/core/hub_appindex.js (loaded right after hub_config.js,
precached) = window.HUB_APP_INDEX { id: [category, entry, name, icon,
newTab] }. On a first visit the hash / last app / saved windows found there
open at once (no CSV wait); those apps are not registered early, so ids
stay as in HUB_CAT_CSV order. Keeping it in sync: it is GENERATED from the
real ids by `python3 hub/core/hub_appindex_gen.py` (Playwright); run it
after any category-CSV change (the bot that edits a CSV, or the Hub bot at
its next release). Stale is safe: an id / entry not in the index = the
R33b wait; an id that now means another app is re-opened right once the
CSVs are in; the console then logs "hub_appindex.js is out of date".


6. TASKBAR, TRAY AND ON-SCREEN KEYBOARD (OSK)
---------------------------------------------
hub/wm/wm_taskbar.js (#wm-taskbar):
  - Start (opens the menu above the bar; hover-to-open, switch
    sites-hub.startHover), Show Desktop (minimise all / bring back),
    one button per window of this workspace
    (click = focus / minimise; right-click = New window, Move to
    workspace, Minimise, Close; middle-click = new window), then on the
    right (R43) the workspace switcher (R41: monitor-shaped ~16:10
    buttons; hidden when workspaces = 1) and the OSK button, both just
    before the tray. Order: Start | Show Desktop | windows ... | 1 | 2 |
    keyboard | tray | clock.
  - Tray (.wm-tray): the top bar's right side (chat bubble, Devices
    button) is MOVED here in Desktop mode and back in Phone mode.
    Optional busy meter, clock (12 h). R41: the version label (#hub-ver)
    is no longer shown anywhere in the Hub (hub.html comment); version.txt
    and HubUpdate.version() still work.
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
hub/controller/hub-controller.js), the same path as a phone keyboard: key events
into the focused app frame, text typed into inputs; caret, selection,
Tab, undo and clipboard keys are done by hub/controller/hub_textedit.js. Focus goes
back to the active window (window.__hubFocusFrame). While docked the
work area shrinks so windows stay above it.


7. FILES, DRIVES, FILE TYPES, OPEN WITH AND THE VIEWER
------------------------------------------------------
shared/fs/fs_drives.js (window.FsDrives), used by the desktop Drives
pane (hub/drives/hub_drives.js) and Files. Drive kinds, all a
FileSystemDirectoryHandle (or a look-alike) so shared/fs/fs_ops.js works
on all of them:
  local   "Local": OPFS (navigator.storage.getDirectory()); asks the
          browser to persist storage on first use.
  folder  a real folder from showDirectoryPicker (Chrome / Edge
          desktop). Handle kept in IndexedDB 'sites-fs' / 'drives';
          after a reload it needs one click on "Allow access".
          R56: such a folder shows greyed (desktop Files pane tile
          "Click to allow access", Files sidebar "Allow access" button),
          not hidden.
          Removing only forgets it.
  gdrive  Google Drive, only when shared/google is loaded; the handle is
          the "hub" folder in My Drive (GDriveFs.hubRoot()). States:
          setup | connect | renew | ok.
Changes broadcast on BroadcastChannel 'sites-fs'.

The drive tree (the intended structure, one unix-style view of all drives;
the Terminal app, apps/system/terminal/, is the first thing to show it):
  /                    root
  /drive/              holds all drives
  /drive/local/        the Local drive (OPFS); "~" (home) = /drive/local
  /drive/gdrive/       Google Drive, only when FsDrives.list() returns it
  /drive/<folder>/     each real folder added with "Add folder"
Mount names come from the drive name in FsDrives.list(), made unix-safe
(spaces and odd characters -> "_") and unique (-2, -3 on a clash); "local"
and "gdrive" are reserved. The name <-> drive id mapping is kept in
localStorage 'hub-terminal.mounts' so a folder keeps its name.
The Terminal's view of it: T2 reads (pwd, cd, ls, cat, head, tail, wc, tree,
stat, drives, allow, open <path>); T3 also changes (mkdir, touch, cp, mv, rm,
rmdir, edit, find, grep, > and >>; terminal_wr.js + terminal_edit.js). It uses
shared FsDrives + FsOps (copy, move, remove, mkdir, writeFile; cp/mv between
drives is FsOps copy, then remove for mv) and changes nothing in shared/fs.
All paths resolve inside a mount handle; /, /drive and a drive root cannot be
removed or moved. Real host folders have no trash. A real folder after a
browser restart (or a write the browser refuses) shows "Permission needed:
run `allow <mount>`"; allow asks from the Enter key (readwrite).
Other apps (Files, Drives pane) still address drives by id (#drive=<id>),
not by this path.

Files app (apps/system/files/): files_core, files_view, files_drives,
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
Viewer app (apps/system/viewer/): viewer_core, viewer_image,
viewer_video, viewer.js. Steps through the folder's images / videos;
keys: arrows, Home/End, J/K/L, +/-, 0, 1, R, F.
Not to confuse with hub/viewer/hub_viewer.js: the overlay for files received
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
  3. hub/link/hub_phonekey.js checks the room, calls GoogleAuth.setToken and
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
  - hub/controller/hub-controller.js: Gamepad host, QR pairing popover, forwards
    D-pad / keys into the app frame, rumble back to the phone.
  - hub/link/hub_link.js: routes received files (to a registered app, else
    the overlay + toast), keeps the last 30 in IndexedDB 'hub-received';
    'hub-auto-download' (default on). R57: it answers only the Hub's own
    frames (frameOf) whose message origin is the Hub's origin (file://:
    'null'), and posts to location.origin ('*' only on file://, where
    'null' cannot be a target), so a frame on another site never gets
    'hello' (the link code) or received files.
  - Connect QR tile = hub.html?join=CODE. hub/core/hub_role.js makes such a
    Hub a joiner (window.__hubRemote, code saved as
    'shared-link-join-code'); hub/link/hub_remote.js joins.
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
hub/drives/hub_wallpapers.js: list of ids (gradients, 'night' default, slide /
light flags), every picture in shared/wallpaper/wallpapers.js as
'pic:<file>', a custom colour '#rrggbb', and 'mine' = "Your picture",
a file in the Local drive (OPFS) folder Wallpapers/. Choice in
sites-hub.wallpaper; hub/core/hub_prefs.js paints #empty.
R36 thumbnails: shared/wallpaper/thumbs/<base>.webp (320 px wide, WebP
q70), one per picture in wallpapers.js, written by
hub/core/hub_wallthumbs_gen.py (Python + Pillow; rerunnable, skips a
thumb newer than its picture, --force redoes all, reports thumbs of
pictures no longer listed). Rerun it after adding / changing a picture
and commit the thumbs. hub_wallpapers.js gives each picture entry
small = that thumb URL (thumb = the old full / _small copy, picture =
the full image). Previews (Settings > Wallpaper grid) use small, lazy,
with the full image as onerror fallback; applying a wallpaper (the Hub
background and the Settings big preview) always uses the full picture.


12. SETTINGS
------------
apps/system/settings/: settings.js (section list + pane, open section in the
hash, e.g. #about), settings_store.js (reads / writes 'sites-hub.<key>'
and calls parent.HubPrefs.apply() + posts {type:'hub-prefs'}), and one
file per section: sec_wallpaper, sec_desktop, sec_windows, sec_sizes,
sec_look, sec_howto, sec_about. hub/core/hub_prefs.js re-applies on the
'storage' event and on that message, so changes are live.
About: version (hub/version.txt), "Check for update"
(HubUpdate.check({manual:true})), "Last refreshed" and "Clear cache now"
(confirm with UiDialog, then HubUpdate.clearCache()).
Opened from the "Settings" row at the bottom of the menu
(hub/menu/hub_settings.js) or Start right-click.


13. SERVICE WORKER, CACHING, 9AM REFRESH, UPDATE READY, CLEAR CACHE
-------------------------------------------------------------------
sw.js (root) -> hub/update/hub_sw.js. Caches:
  hub-shell-vNN  precached shell (SHELL list: Hub files, shared modules,
                 OSK, Start icons, category CSVs, version.txt, icons,
                 offline page). New name per release.
  hub-rt-1       runtime: app pages and images opened at least once.
  hub-meta       which shell files changed since the page loaded them, and
                 (R58) which shell files the install could not fetch;
                 kept across releases (activate never deletes it).
Fetch rules (same-origin GET only):
  - cross-origin (Google APIs / OAuth / Drive, PeerJS, CDNs): untouched
  - cache:'no-store' / 'reload' requests and Range requests: untouched
  - shell files with no ?v or ?v = this worker's V: cache first,
    refreshed in the background (stale-while-revalidate)
  - shell files with a newer ?v: network first
  - *.csv and hub/version.txt: network first, cache when offline
  - apps/ and other html / css / js: network first, kept in hub-rt-1
  - images: cached copy at once; a new image is fetched and stored on
    its first request; R58: a cached one is re-checked in the background
    at most once per worker lifetime, and only when over a day old
  - fonts: cache first
  - offline navigation not cached: hub/update/hub_offline.html
Updates (hub/update/hub_update.js, window.HubUpdate):
  - A new worker WAITS (only the first install activates at once).
    R50: the old bottom-centre "Update ready - Reload - x" toast
    (#hub-upd-note, kept commented out in hub_update.js) is replaced by
    #upd-btn (hub.html, in .header-right): a small download icon with a
    blue dot, title / aria-label "Update ready", hidden until a new build
    waits (HubUpdate.showNote() shows it; same callers as the toast).
    Desktop mode: in the taskbar tray just before the clock (icon sized
    from --wm-task-h). Phone mode: a 24 px icon at the right of the top
    bar. Click / tap opens Settings on About (__hubOpenApp('apps/system/settings/',
    {hash:'about'}); Settings follows #about), where the existing Update
    button applies it (skip-waiting -> reload on takeover). No toast, no
    overlay, never a forced reload; after the reload the new build is
    active (nothing waiting), so the icon stays hidden.
  - Daily refresh at 09:00 browser local time, or on the next open after
    a missed 09:00 (sites-hub.lastRefresh, ms). It runs reg.update() and
    asks the worker {type:'refresh'}: every SHELL file is fetched again
    and only changed ones are replaced (the cache is never wiped). If
    anything changed: no window / app open -> quiet reload (R23: a
    worker still installing is awaited, then skip-waiting), else the
    note. Timer checks at most every hour (sleeping computers catch up).
    R56: "app open" in Phone mode = window.__hubCurrentEntry() (hub.js),
    not the frame's src attribute (always empty: the frame is navigated
    with location.replace).
  - Settings > About "Check for update": compares the live hub.html
    build tag; R24: a waiting new worker takes over (skip-waiting ->
    reload, caches kept), else clears hub-shell-* and reloads.
  - clearCache(): deletes hub-shell-*, hub-rt-* caches, the cached Start
    list and lastRefresh, unregisters the worker, reloads.
Bump for every Hub release: one script, hub/tools/hub_bump.py (python3, no
dependencies; H3). It edits the 7 places listed below and nothing else:
  python3 hub/tools/hub_bump.py --check
      all 7 places agree with hub/build.txt? Prints each value; exit 1 if not.
  python3 hub/tools/hub_bump.py --release H4 --dry-run
      shows every change (a diff per file), writes nothing.
  python3 hub/tools/hub_bump.py --release H4
      next tag and cache: same IST date as the current tag -> next letter
      (20261023d -> 20261023e, z -> za); a new IST date -> YYYYMMDDa; cache
      hub-shell-v<NN+1>; build.txt line 3 = the release, line 4 = today (IST).
  --tag 20261024a / --cache hub-shell-v90   override the computed values.
  --note 'text'    comment after the CACHE line (default: the release name).
  --version v0.300 also writes hub/version.txt (version + today); only when
                   Jor says so.
  --force          bump even if the places disagree beforehand (by default
                   the script refuses) or --tag is not newer than the current.
After the bump it re-checks the 7 places. Still by hand: new shell files in
SHELL (hub_sw.js), the hub_readme.md change-log entry, the commit.
Release names are area-prefixed: H = Hub shell, SW = service worker, AH = App
Hub, FS = file:// (R59 is FS1); fixes H3-F1, bugs H3-B1.
The 7 places (what the script edits):
  1. hub.html: every ?v=<tag> (also the one in the cache-busting comment).
  2. sw.js: importScripts('hub/update/hub_sw.js?v=<new>').
  3. hub/update/hub_sw.js: V = '<new>' and CACHE = 'hub-shell-v<NN+1>' (+ a
     comment). A new shell file still goes into SHELL by hand.
  4. hub/menu/hub_ctx.js: const V = '<new>'.
  5. hub/core/hub_loader.js: const V = '<new>'.
  6. hub/build.txt: line 1 build tag, line 2 cache name, line 3 release,
     line 4 date (IST).
  7. hub/version.txt only when Jor says so (--version).
The readmes (this file, hub_readme.md) carry no current numbers; only
change-log entries keep the numbers of their own release (history).


14. STORAGE: LOCALSTORAGE KEYS, INDEXEDDB, OPFS, CACHES
-------------------------------------------------------
localStorage, prefix sites-hub.:
  Key                 Written by / used by        Value
  wmMode              Settings > Desktop          auto | desktop | phone
  wmSession           wm_windows.js               JSON window session
  openMax             Settings > Desktop, R51     '1' / missing = on, '0' = off
                      wm_windows.js (new windows maximised)
  saverIdle           Settings > Desktop, R49b    0 (off) | 1..240 min, unset 5
                      hub_saver.js (screen saver)
  saverSec            Settings > Desktop, R49c    smooth (default) | quartz | off
  lastApp             hub.js                      last app (Phone mode)
  fromCat             hub.js                      category of open app
  fromLab             hub.js (old, removed)       -
  startHover          Settings > Desktop          '0' = no hover-open
  homeBtn             Settings > Desktop, AH1-F1  '' = Home screen (default) | apphub
                      hub.js __hubHome (Phone mode Home button only;
                      H6-B1: Desktop Show desktop no longer uses it)
                      AH2: category rows in the Start / Home menu open apps/system/apphub/#cat=<Category> (hub.js openCat);
                      CAT_PAGES (apps/<cat>/<cat>.html) stays for old deep links only.
                      H5-B2: Settings is fetched fresh, the shell may be the previous build: sec_desktop.js
                      notes it when parent.__hubHome is missing. H5-B1: .menu button.app active/hover text = var(--text).
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
  shared-link-join-code (phone remote), hub-auto-download,
  hub-terminal.history (Terminal, T1: JSON list, last 200 commands; not a
  sites-hub. key so typing never re-applies the Hub prefs),
  hub-terminal.cwd (Terminal, T2: last folder, e.g. /drive/local/A),
  hub-terminal.mounts (Terminal, T2: JSON {drive id: mount name}).
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
newtab, section) -- the category CSV is the only list (R58 doc fix: do
NOT add a hub/core/hub_apps.js row; since R33a that file keeps only the
category rows and the hidden Settings row); (3) regenerate the app index
and catalog (hub/core/hub_appindex_gen.py -> hub_appindex.js and
hub_catalog.js) so a first-visit #hash link opens at once. No cache bump
is needed for app files (apps/ is network first). Category CSVs are
checked on every load.


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
  - R43 (done): the workspace switcher and the OSK button moved to the
    right of the taskbar, just before the tray (Start | Show Desktop |
    windows ... | 1 | 2 | keyboard | tray | clock).
  - R41 (done): workspace buttons are monitor-shaped (~16:10), the OSK
    button sits right after them (Show Desktop | 1 | 2 | keyboard), and the
    placebo version label is gone from the Desktop tray and Phone top bar.
    Settings > About (apps/system/settings/sec_about.js) still shows it: another
    bot's folder, not changed.
  - R35 (done): edge snapping (half / max zones, preview, magnet) works
    again. Cause: wm_snap.js is the deferred "snap" batch, so a drag before
    it loaded had no HubWM.dragHook (no preview, snap or magnet). Now the
    first window open / a title-bar press loads it at once. Only a file that
    has not arrived yet (very slow link) still misses that one drag. If it
    looks off, check Settings > Windows "Snap windows to screen edges" is on
    (it was switched off while broken; sites-hub.snapEdges '0').
  - The 12 Lab apps once missing from hub_apps.js (MyLLM ... Aeroplane)
    are fine since R33a: every CSV app gets its #hash link at start.
  - R21 (done): Auto mode enters Desktop at >= 1024 px but leaves it only
    below 960 px (wm_mode.js HYST = 64), so no flipping near 1024.
  - R22 (done): each window keeps its chosen size / place in w.pref;
    a screen resize clamps only the drawn w.rect, so windows grow back
    when room returns; the session saves w.pref (wm_windows.js).
  - R33a + R33b (done): apps come from the category CSVs; hub_apps.js
    keeps the categories + hidden system rows (section 5). On a first
    visit a hash link waits only for the CSVs up to its own category
    (one round trip; a slow later CSV no longer holds it up).
  - R33c (done): hub_appindex.js lets a first-visit hash / last app /
    session open without any CSV wait (section 5).
  - R38 (done): an open Settings shows the prefs from when it loaded.
    hub_settings.js remembers the prefs (on Settings load and on its own
    {type:'hub-prefs'} messages, same-origin only since R57); when Settings is opened again
    (loadApp) or clicked into and they differ (changed by the Hub, e.g.
    taskbar Top, Desktop/Phone), its frame is reloaded on the same
    #section. Live redraw while Settings stays focused needs the
    Settings app (apps/system/settings, R53 Hub bot; was Apps bot).
  - The "Google Drive" label is squeezed in the Files sidebar.
  - Wallpaper thumbnails in Settings load the full images.
  - Mail shares the Hub's Google sign-in record.
  - OSK: resize, vibrate, a Phone mode and pop-up on text fields.
  - Favorites: reorder, put on the desktop.
  - Terminal app, menu D-pad navigation, folder download and drop,
    version number format, optional JS bundle.
  - Not yet tested: touch on a real phone (Lava), a real Google Drive
    sign-in end to end.
  - The leaked TV client secret must be deleted in Google Cloud (Jor).
  - R56 (done): Phone-mode idle check uses __hubCurrentEntry (the 09:00
    refresh no longer reloads over an open app); old apps/lab/ links of
    Aeroplane / Island demo / AoE RTS open their apps/games/ copies.
  - R57 (done): hub_link, hub_settings and hub_saver accept messages
    from the Hub's own origin only; html-include errors use textContent.
  - R58 (done): hub_sw.js install logs + records missed shell files in
    'hub-meta' (retried by the 09:00 refresh and by Check for update);
    activate keeps 'hub-meta'; a cached image is re-checked at most once
    per worker and only when over a day old; no version.txt fetch on
    file://; an automatic update check never clears caches or reloads;
    hub_loader retries walk the whole batch in order; manifest icons have
    separate "any" / "maskable" entries; hub-gamebar posts to
    location.origin; dead CAT_PAGES Desktop / About rows removed; old
    #contact / #feedback open Settings > About, #transcribe / #vdesktop
    show home.
  - R59 (done): file:// load is clean in the Hub. hub.html adds the
    <link rel=manifest> from a tiny head script on http(s) only (no CORS
    error on file://; PWA install unchanged); hub.js trackFrame reads the
    frame's location fields inside its try (no SecurityError at every
    frame load); HubUpdate.check returns {state:'file'} on file:// and
    Settings > About says "Updates not available when opened as a file"
    (no hub.html / version.txt / build.txt fetch there; Current release
    shows a dash); settings_store posts hub-prefs with '*' on file://.
  - Still on file:// (not Hub): Aeroplane's planet.glb / plane.glb
    XHRs are blocked by CORS (the game falls back to simple shapes);
    Chrome's "non-JS module files deprecated" warning (crbug/1173575).
    file:// pages are all origin 'null', so the Hub cannot read an app's
    page: after #contact the hash / title stay "contact" (the frame
    itself shows Settings > About).
