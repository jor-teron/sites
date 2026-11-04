Team 1 (Hub Bot Team 1): started Mon 26 Oct 2026. Docs: README_technical_team1.txt

================================================================================
Desktop address: desktop/desktop.html (H129a, 2026-11-04 IST, build 20261104g)
================================================================================
Step a of 3 of H129 (desktop shell into desktop/). New layout of the Hub split:
  hub/        the shared core (hub/core/hub_core.js and every hub/* file: NOT moved in H129a)
  desktop/    the desktop screen on top of the core: desktop/desktop.html = the desktop Hub page
              (the page that was hub.html). H129b / H129c move the desktop-only files (wm/, menus,
              panels, Game Bar, hub-controller.js) here.
    desktop/wm/    (H129b, was hub/wm/) wm.css, wm_mode.js (Desktop / Phone), wm_windows.js (HubWM:
                   windows + title bars), wm_taskbar.js, wm_snap.js (hub_loader.js 'snap' batch),
                   wm_workspaces.js
    desktop/menu/  (H129b, was hub/menu/) hub_ctx.js (HubCtx; carries the build stamp V moved by
                   hub_bump.py), hub_ctx_menus.js, hub_flyout.js / .css, hub_settings.js, hub_tiles.js
    (before H129c) Still in hub/ until H129c: hub/link/hub_panels.*, hub/link/hub-gamebar.js, hub/controller/hub-controller.js.
    desktop/panels/     (H129c, was hub/link/) hub_panels.js / .css (H27 side panels: 🎮 Devices popover,
                        🐻 Pooh Chat), hub_chat.js / .css (chat bubble + group chat relay)
    desktop/notify/     (H129c, was hub/viewer/) hub_notify.js (HubNotify, hubToast, received-file cards),
                        hub_notification.css, hub_notifcenter.js / .css (H66 🔔 Notification Centre)
    desktop/gamebar/    (H129c, was hub/link/) hub-gamebar.js (app bar / Game Bar, H49 hubTitleBar contract)
    desktop/controller/ (H129c, was hub/controller/) hub-controller.js (🎮 Gamepad host: QR pairing popover,
                        private Hub number peer, key forwarding), hub_textedit.js, hub_controller.css,
                        hub_controller_config.js (HUB_CTRL_CONFIG)
    desktop/link/       (H129c, was hub/link/) hub_remote.js (phone remote Hub), hub_pointer.js (trackpad
                        pointer), hub_receive.js (phone → hub files)
  Final split after H129c (what stays in hub/, the shared core + engines every screen may use):
    hub/core/       hub_core.js and its 19 scripts, hub.js, hub_apps / appindex / catalog / config, hub_loader.js,
                    hub_dialog_bridge.js + hub_attention.js + hub_dnd.js (phone.html loads them too), hub_eye,
                    hub_break, hub_saver, the CSS themes (hub_main, hub_glass, hub_xp, hub_break)
    hub/link/       the core mesh part (hub_link, hub_sync, hub_meshlog, hub_meshlink, hub_line, hub_trust,
                    hub_linkstate) + hub_phonekey.js (hub_loader.js 'drives' batch)
    hub/controller/ the phone Gamepad page itself (controller.html / index.html, controller_*.js, ctrl_*.js,
                    kb_*.js (osk batch uses kb_common.js), dpad.html, vendor/jsQR.js, icons): it is an app page
                    the phone opens, not desktop shell, and hub.js / hub_tiles.js / hub_panels.js link to it
    hub/drives/, hub/osk/, hub/viewer/ (hub_viewer*.js), hub/update/, hub/relay/, hub/tools/, hub/docs/
    shared/link/link_scan.js stays in shared/ (phone/phone_connect.js and 4 apps load it).
    Desktop-only files still in hub/ (candidates for later, not moved in H129c to keep it small):
    hub/drives/hub_traymeter.js (taskbar busy meter), hub/core/hub_eye.js, hub/core/hub_break.js / .css.
  phone/      the phone screen (phone.html + phone/, Hub Apps Builder 2; untouched by H129a)
Addresses since H129d (all keep ?query and #hash):
  index.html (root)   = mode entry: saved sites-hub.mode → desktop/desktop.html or phone.html; else the
                        Desktop / Phone | Touch cards; ?os=desktop|phone, ?choose (details: H129d below)
  hub.html            removed; with the service worker a navigation to it gets index.html (fallback)
(before H129d)
Addresses (all keep ?query and #hash, meta refresh in <noscript> + location.replace):
  hub.html            → desktop/desktop.html   (tiny redirect; bookmarks, the installed app's start_url,
                                                Connect QR hub.html?join=CODE, hub.html#app links)
  index.html (root)   → desktop/desktop.html   (before H129a → hub.html)
  desktop/            = desktop/index.html → desktop.html (folder index redirect)
  The old full hub.html is kept at hub/docs/hub_html_before_H129a.txt (it has its own comments, so it
  could not be commented out inside the stub).
How desktop.html still finds every file: <base href="../"> right after <meta charset>. All its script /
link tags keep the same root-relative paths as hub.html, and so does everything the Hub builds at run
time (app catalog entries apps/..., iframe src, hub_loader.js batches, CSV fetches, wallpapers, the
sw.js registration, manifest.webmanifest): they resolve from the site root exactly as before, and the
service worker cache keys are unchanged. Run-time code that resolved a path against location.href now
uses document.baseURI (identical on a page with no <base>, e.g. phone.html): hub.js (replaceFrame,
newTab open, hash re-point, frame → app rel path, hub-open-url message), hub_link.js (receiver url),
hub-controller.js (Connect QR = <root>hub.html?join=CODE, controller.html), hub_panels.js,
hub_notifcenter.js (BASE), hub_core.js (same-folder base check), hub_ctx.js, hub_ctx_menus.js,
wm_windows.js, shared/fs/webdav_fs.js (MOVE Destination). location.pathname + '?join=' / hash pushState
stay as they were (absolute paths, so they keep the page at desktop/desktop.html).
Rule for new Hub code: resolve root-relative paths with new URL(p, document.baseURI), never location.href;
never write a bare href="#x" link in desktop.html (with <base> it would point at the site root).
Build stamp: hub.html keeps a comment "hub/core/hub.js?v=<tag>" because update checks (hub_update.js
latest(), Settings › About standaloneCheck(), and old clients) fetch hub.html and read that tag;
hub_bump.py moves it with the rest (now 8 places: + desktop/desktop.html every ?v=).
Service worker: the root sw.js (scope = the whole site) controls desktop/. SHELL has hub.html (stub),
desktop/desktop.html and desktop/index.html; a navigation to desktop/ is served the desktop/index.html copy.
manifest start_url stays hub.html (changing it would change the installed app's identity).
H129b (build 20261104h / hub-shell-v140): the window parts and menus moved with git mv (list above).
Only their tags in desktop.html (old ones kept as comments, marked "before H129b"), the hub_sw.js SHELL
list, hub_loader.js (snap batch) and hub_bump.py changed; no code inside them builds a path from its own
location (all paths are root-relative through document.baseURI), so nothing else moved. Forwarders: the
12 old paths (hub/wm/*, hub/menu/*) are tiny stubs kept for ONE release, for old cached pages and
anything that loads an old path directly. JS stub: resolves ../../desktop/<dir>/<file> from its own src,
returns if that file is already a <script> on the page, else document.write()s it while the page is
parsing (same order / timing as the old tag) or appends it (async = false) later. CSS stub: @import of
the new file. desktop.html never requests them (tested: no hub/wm or hub/menu request, each moved file
loaded once). Remove both folders hub/wm/ and hub/menu/ in a later release (they are not in SHELL).
H129c (build 20261104i / hub-shell-v141): panels, notifications, Game Bar, controller host and the
desktop link files moved with git mv (16 files, list above), in their own commit so history follows.
Changed: their tags in desktop.html (old ones kept as comments, "before H129c"), the hub_sw.js SHELL list
(old lines kept as comments) and hub_notifcenter.js (source-app regexes + the stack walk's "skip
hub_notify / stop at a Hub file" checks now also match desktop/ paths; old hub/ paths still match).
hub_loader.js batches and hub_bump.py were not affected (none of the moved files is lazy-loaded or
carries a build stamp). No moved file builds a path from its own location (all through document.baseURI).
Forwarders: the 16 old paths (hub/link/hub_panels.*, hub_chat.*, hub-gamebar.js, hub_remote.js,
hub_pointer.js, hub_receive.js; hub/viewer/hub_notify.js, hub_notification.css, hub_notifcenter.*;
hub/controller/hub-controller.js, hub_textedit.js, hub_controller.css, hub_controller_config.js) are the
same one-release stubs as H129b's; not in SHELL. Remove them with hub/wm/ and hub/menu/ in a later release.
H129d (build 20261104j / hub-shell-v142, 2026-11-04 IST): mode entry, hub.html removed.
  Root index.html = the mode entry. Order: ?choose clears localStorage sites-hub.mode and shows the cards;
  ?os=desktop|phone saves that mode and goes there; else a saved valid mode goes there at once (no cards);
  else two cards "Desktop" / "Phone | Touch" (Hub theme: sites-hub.theme / accent, centred, side by side,
  stacked under 520 px). A device guess (shorter SCREEN side < 600 px, or pointer:coarse without
  hover:hover) only highlights a card ("Suggested", focused); it never picks. A click saves and goes.
  Targets live in ONE constant in index.html: MODE_TARGET = { desktop: 'desktop/desktop.html',
  phone: 'phone.html' }. ?os / ?choose are removed; every other ?query and the #hash pass through
  (index.html?join=CODE#2048 → desktop/desktop.html?join=CODE#2048). Redirects use location.replace.
  desktop/desktop.html saves sites-hub.mode = 'desktop' when opened directly (top window only, and not
  with ?join=, so a phone that scans the Connect QR keeps its own choice).
  desktop/mode/hub_osmode.js: window.HubOsMode { KEY, NAME, get(), switchTo(mode), choose(), url(q) }.
  switchTo('phone') asks UiDialog.confirm('Switch to Phone | Touch mode?', 'Open windows will close.',
  'Switch') and then saves the mode and opens index.html?os=phone (so the phone path stays only in
  index.html); choose() confirms and opens index.html?choose. Entry points: Settings › Desktop › Screen
  mode ("Switch to Phone | Touch ›", shown only inside the desktop page, and "Choose mode… ›") and the
  desktop right-click menu ("Switch to Phone | Touch…"). The Start menu holds only categories, so no item
  there. Phone mode inside the desktop (Screen mode) is unchanged.
  hub.html removed. Its dependencies and what replaced them:
    update check (hub_update.js latest())     → fetches desktop/desktop.html (no-store), same ?v= stamp
    Settings › About standaloneCheck()        → fetches desktop/desktop.html
    hub-controller.js Connect QR (connectUrl) → desktop/desktop.html?join=CODE
    hub_appindex_gen.py goto                  → desktop/desktop.html
    manifest start_url                        → index.html; "id": "/sites/hub.html" keeps the installed
                                                 PWA's identity (id resolves against start_url's origin)
    hub_sw.js SHELL 'hub.html'                → removed (+ index.html, desktop/mode/hub_osmode.js)
    sw fallback: a navigation to <scope>hub.html (old bookmarks, old QR codes, old home-screen icons) is
      answered with the cached index.html (stale-while-revalidate, key ROOT_KEY), so ?join and #hash still
      pass through the mode entry. Without a service worker /hub.html is a 404.
    hub_bump.py: 7 places now (desktop/desktop.html ?v=, sw.js, hub_sw V + CACHE, hub_ctx V,
      hub_loader V, build.txt); the hub.html place is commented out.
    Settings help texts (sec_howto, sec_keys) no longer name hub.html.
  Old clients (v141 and older) still fetch hub.html in their in-page update check; it fails quietly, and
  the browser's own sw.js update on the next navigation installs v142 anyway.
  Old hub.html page: hub/docs/hub_html_before_H129a.txt.

================================================================================
Hub core entry: hub/core/hub_core.js (H127, 2026-11-04 IST, build 20261104f)
================================================================================
Step 1 of 3 of the Hub split: core (no screen of its own) / desktop shell (hub.html) / phone shell
(phone.html, PH14 next). The core files themselves did not change; hub_core.js only loads them, in the
same order hub.html used before H127.

What is in it (3 parts, loaded in this order; files in each part in this order)
  boot  hub/core/hub_role.js         window.__hubRemote (+ html.hub-remote)
        hub/core/hub_daynight.js     window.HubDayNight
        hub/core/hub_autotheme.js    window.HubAutoTheme
        hub/core/hub_prefs.js        window.HubPrefs (theme, accent, Look settings, applied at once)
  link  hub/core/hub_keys.js         window.HubKeys
        hub/core/hub_profile.js      window.HubProfile (settings storage in the connected folder)
        shared/link/link_core.js     window.SharedLink
        shared/link/link_devices.js  window.SharedLinkDevices (device id, name, the 5-digit Hub number)
        shared/link/link_files.js    window.SharedLinkFiles
        shared/link/link_ui.js       window.SharedLinkUI (widgets; the shell decides where to mount them)
        shared/link/link_chat.js     window.SharedChat
  mesh  hub/link/hub_link.js         window.__hubLink (link files / messages → app frames)
        hub/link/hub_sync.js         window.HubSync (settings sync, Send profile)
        shared/link/hub_mesh.js      window.HubMesh
        hub/link/hub_meshlog.js      window.HubMeshLog
        hub/link/hub_meshlink.js     window.HubMeshLink (always on the public 00000 lobby, private when linked)
        hub/link/hub_line.js         window.HubLine
        hub/link/hub_trust.js        window.HubTrust
        hub/link/hub_linkstate.js    (Devices popover row; does nothing without #ctrl-popover)
  + window.HubCore (the only new global): { version, base, parts, ready, loaded(part), load(part | 'all') }
    HubCore.ready resolves ['boot','link','mesh'] once all three parts ran.
Every global is exactly the same as before H127 (checked in Chrome: same window property list as main,
only HubCore added), so the 24 app files that use parent.Hub* / window.top.Hub* keep working.

NOT in the core (desktop shell, stays in hub.html): hub/wm (windows, taskbar, workspaces), menus, tiles,
hub.js, Settings drawer, dialog.js + hub_dialog_bridge.js, hub_notify / hub_notifcenter / hub_dnd /
hub_attention, hub_pointer / hub_receive, hub_textedit + hub-controller.js (Gamepad host and the #ctrl-*
popover; it is also what HOSTS the private Hub number peer, SharedLink.host), link_scan.js, hub_remote.js,
hub_chat.js, hub_panels.js (15 lookups into hub.html's layout), hub-gamebar.js, hub_update, hub_loader.
hub_link.js and hub_linkstate.js were made null-safe: without #app-frame / #ctrl-popover / #ctrl-btn they
just skip the desktop bits.

How a shell uses it
  - All at once (phone.html for PH14, any bare page):   <script src="hub/core/hub_core.js"></script>
    While the page is parsing it document.write()s the 19 files as normal parser-blocking <script> tags
    right after itself, so the very next <script> already sees every core global (same as separate tags).
    Paths come from hub_core.js's own URL, so a page in any folder can load it.
  - Split (hub.html): <script src="hub/core/hub_core.js" data-parts="boot"></script> where hub_daynight /
    hub_autotheme / hub_prefs were, then <script>HubCore.load('link');</script> where link_core.js was and
    <script>HubCore.load('mesh');</script> right after hub-controller.js. Why 3 places: the desktop's own
    scripts sit between the parts (theme must paint before the wm / menus; the link part needs nothing of
    the desktop but hub-controller.js needs SharedLink; the mesh part must come after hub-controller.js).
    Result: the same script order as before H127 except hub_role.js now runs just before hub_daynight.js
    (after qrcode / config / catalog / wallpapers, none of which reads __hubRemote or ?join) and hub_keys.js
    + hub_profile.js run just before link_core.js (after hub_pointer / hub_receive, which use neither).
  - Late (after the page finished parsing): HubCore.load('all') adds the scripts one after the other
    (async = false) and returns a promise; it never document.write()s then (that would wipe the page).
    data-parts="none" loads nothing on its own (for a page that calls HubCore.load itself).
  - A part is never loaded twice.

PH14 (phone.html, Hub Apps Builder 2) can now replace its picked-out core tags (hub_config/appindex stay
theirs; link_core, link_devices, hub_mesh, hub_meshlink, hub_line, hub_trust) with one
<script src="hub/core/hub_core.js"></script> and build the Connect sheet on SharedLinkDevices.code(),
SharedLinkUI, HubMesh and HubMeshLink. Limits for the phone: the core does not host the private Hub
number peer (that is hub-controller.js, desktop shell); on a bare page the core joins the public 00000
mesh and keeps its number for Hub Line. Step 2 (desktop shell) / step 3 (phone shell) come later.
In the SW shell list (hub/update/hub_sw.js) since H127.

================================================================================
Week wrap-up, 3-4 Nov 2026 (Team 2)
================================================================================
Written 2026-11-04 IST with H135 (build 20261104r / hub-shell-v150). Added at the end; nothing above was changed.

Hub (Hub Main Builder 2), merged:
  - H121 #390
  - H123 #391
  - H124 #393
  - H125 #394
  - H122 #395
  - H127 #396
  - H129a #397
  - H129b #399
  - H129c #400
  - H129d #401
  - H129d tidy #402
  - H129e #404
  - H132a+b #407
  - H132c #408
  - H126 #409
  - H133 #410
  - H135 (this PR)
  - Earlier on 3 Nov: H65 #386, H104 #388

Apps (Hub Apps Builder 2), merged:
  - HPS5.4+HPS6 #373
  - MD3 #374
  - SS1 #376
  - LL2 #379
  - SL3 #384
  - SL4 #389
  - PH14 #398
  - PH15 #403
  - PH16 #405
  - PH19 #406
  - AG21 #411
  - AS1 #412
  - AS2 #413
  - AS3 #414

Games (Hub Games Builder 2), merged:
  - G-FIX1 #371
  - GO-1+BLKD-1 #372
  - SHIP-1 #375
  - LUDO-1a #377
  - LUDO-1b #378
  - LUDO-1c #380
  - ORB-1 #383
  - PIN-1a #385
  - PIN-1b #387
  - PIN-1c #392
  - Team 1 also shipped: LRN-WK1, NIX-G1-G3, C4-1, LIFE-1

Open PRs:
  - none

Parked / Team 3:
  - Hub:
    - H108 Files phone layout (Team 3)
    - H134a/b API Keys app + HubAPI (Team 3)
    - H128 Viewer formats
    - WebDAV over Funnel / tunnel
    - standalone / default apps idea
  - Apps:
    - PH17 Native Bridge (APK half: Team 1)
    - PH18
    - VNC2 / VNC3
    - AG22
    - PH2, PH3
    - NU1
    - BS3b
    - Second Screen Keyboard
  - Games:
    - 7 more games to reach 50
    - LandCraft
    - AoE balance / Ages / fog
    - shared-settings batch
    - Learn theme
    - LRN3a
    - 26 MB GLB in the git history
    - Hero Builder
    - renames (Battleship -> Sea Battle, Orbito name)

Next week (waiting for Jor):
  - Hub:
    - H130 core move
    - H131 forwarder clean-up
    - H119a/b/c SFTP relay (+ SFTP into Disk)
    - Dezgo key row
  - Apps:
    - small fixes
    - IV1 / IV2
    - LL3
    - phone.html -> phone/index.html
  - Games:
    - next new game
  - Test private-code phone join on a real device
