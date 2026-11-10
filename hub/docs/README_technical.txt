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

================================================================================
H136 — saved number registration (2026-11-07 IST)
================================================================================
H135 is already the Games-menu release (20261104r / hub-shell-v150). This fix is H136.
Build 20261107a / hub-shell-v152.

What changed
  - shared/link/link_core.js host path. Peer id stays prefix + the saved code (Hub: jtsites- + the
    5-digit shared-link-device-code). unavailable-id does not emit 'taken' and does not stop.
    The old 10 delays still pace the retries; after the last one the same delay repeats.
  - A page that has opened the id writes localStorage shared-link-host-lease
    {v, id: device id, tab, code, at} and refreshes it every 5s while that peer exists.
    Not a sites-hub.* key, so profile sync does not copy it. pause / stop / destroy remove it
    when the tab id matches. Another page whose device id is SharedLinkDevices.isMe, with the
    same code and a lease younger than 3 minutes (HOST_LEASE_MS), waits and does not construct
    another peer. A second host() while waiting is a no-op. When the lease is cleared or older
    than 3 minutes, that page tries again.
  - One 'busy' event per situation: kind 'same-device' or 'unknown'. unknown is only after the
    old budget is passed, while retries continue. Neither kind names another owner.
  - Number-only retries keep the Gamepad alias peer (startAlias no-ops while that peer is alive).
    Waiting for another window does not register the alias here; the holding desktop window has it.
  - desktop/controller/hub-controller.js, phone/phone_connect.js, and Settings sec_devices.js
    show that copy. Change number still only happens if the user saves one in Settings.
  - Mesh peer ids (jtsites-<room>-mesh-<deviceId>, lobby -mesh-0, public 00000) are unchanged.

Limits
  - unavailable-id still does not identify the holder. A different browser that saved the same
    number looks like 'unknown', and this Hub keeps trying the same number.
  - The 3-minute lease is this page's heartbeat, not a measured broker timeout. A crashed page
    that does not run pause() leaves the lease until it ages out; then the other page retries.
  - A hidden tab whose timers stop for longer than 3 minutes looks idle, and the other page
    starts paced broker retries.
  - Offline checks: node shared/link/link_host_busy.test.js (mocked Peer, fake clock). No live broker.

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

================================================================================
WEEK WRAP-UP: Wed 2026-11-05 to Tue 2026-11-10 - Team 2 (handover to Team 3
for the next 3 days)
================================================================================
Written by Hub Main Builder 2, with notes from Hub Apps Builder 2 and Hub
Games Builder 2. GitHub main at end of day: a98cc41f.
Added at the end; nothing above was changed.


--- HUB MAIN BUILDER 2 (hub/, desktop/, apps/system)

Mon 9: local branch cleanup on Jor's OK. Deleted 62 local branches in the
  shared clone (including chess and games/desert-road-refactor). Hub Apps
  Builder 2 then removed its 27 worktrees and branches, also on Jor's OK.
  GitHub already had only main. Worktrees left: /workspace/sites (detached),
  /workspace/sites_h46 (main), /workspace/sites_h48d (detached, not ours).
  Apps says /workspace/sites_apps is its working folder - never delete it.
Tue 10: picked up Team 1's week notes (end of README_technical_team1.txt,
  PR #460, main 2de0a92). Already shipped by Team 1/3: H104 XP, H119 SFTP,
  H108a/b Files phone layout (#416), H134a-g HubAPI. Team 1 used H138-H144,
  so the next Hub id is H145.

Releases:
  - RL1 b1796837 (PR #461, branch commit b9cce6b). One shared modular Node
    relay (stdlib only) in hub/relay/ (hub-relay.js, relay_config.js,
    relay_core.js, relay_security.js, relay_ws.js, mod_mcp.js, mod_tcp.js,
    mod_fetch.js, install.sh, install.ps1, start-relay.sh/.ps1,
    config.example.json, tcp_allowlist.example.txt, tests/). Listens on
    127.0.0.1:8787. MCP at /ws and /mcp/<PIN> (same protocol as the Web MCP
    relay). TCP bridge at /tcp, /websockify, and / with ?token=HOST:PORT
    (allowlist; empty = deny). POST /fetch proxy (allowlist, no redirects,
    bounded). GET /health. Modules can be switched on or off; optional
    HTTPS/WSS; a token is required for a non-loopback bind; exact
    Origin/Host checks and limits. Installers:
    curl -fsSL https://raw.githubusercontent.com/jor-teron/sites/main/hub/relay/install.sh | bash
    irm https://raw.githubusercontent.com/jor-teron/sites/main/hub/relay/install.ps1 | iex
    New files only; no app, sftp_relay.py, sw.js or catalog changes; no
    build bump. 326/326 tests (25 new). README section +166, hub_readme
    section 11 change log.

Fixes:
  - none.

Work for other teams:
  - Relayed Jor's cleanup OK to Apps.
  - FYIs to Apps and Games about the Team 1 pickup and RL1.

Diagnoses:
  - none new.

Ideas / future (not built):
  - RL1 follow-ups: a Windows run test, a real SSH/VNC/browser test, fetch
    streaming/SSE, large transfers, and externally reachable HTTPS hosting.
  - Apps switching Web MCP and Remote over to RL1 (needs Jor's OK; Apps
    area).
  - Hub-side shared PeerJS relay settings helper (use our relay first, with
    0.peerjs.com as the fallback; depends on the APK Maker 1 relay contract).
  - A named Dezgo API-key row.
  - An About Hub link in the phone quick panel (this is an Apps file).

Open, not approved (discussed):
  - H130 (move the remaining parts into the Hub core).
  - H131 (clean up the old redirect files left by the moves into desktop/).
  - Fingerprint "Add phone" fix (waits for the error code from Jor's phone;
    H143.1 added the codes).
  - A limit on wrong PIN tries.
  - H139b, more of the shared embedding feature beyond H139a.
  - H98, a "Pair a device" card.
  - An Allow or passcode check before a Connect link joins
    (shared/link/link_core.js attachLink has no gate).
  - Catalog and appindex regen for the 10 new apps (Video Editor, Read Aloud,
    3D Builder, Password Manager, Numerology, Sun Position, Video Player,
    Image Converter, Invoice Maker, Expense Tracker) plus PDF Tools, and
    whether the new games/Learn apps need a hub_sw.js offline list and a
    build bump (needs Jor's OK). Games later regenerated hub_catalog.js in
    #520 (c1958785) for 10 CSV rows that were missing after the Apps merges.
  - A real-device test of the private-code phone join.
  - Open question: About Hub links, new tab vs same tab.

Parked:
  - H128, more Viewer formats (PNG issue).
  - WebDAV over Tailscale Funnel (Android, no terminal).
  - The standalone apps idea.
  - The desktop Start-up manager.
  - H99, default 000000 plus a masked passcode.
  - H90, persistence of the block across reloads.
  - OS5 Hub launcher link.
  - Old /workspace worktrees bisect-wt and h138b, only if Jor asks.

Moved:
  - H108 and H134 were given to Team 3 on 4 Nov (both later found shipped
    or already covered).
  - The MCP server project went to MCP Bot (Team 1, 10 Nov).

For Team 3:
  - Release wording: a plain id means give the plan and wait; "lets do",
    "do HNN" or "code" means commit locally only; "push" means push AND
    merge; "code n push" or "do n push" means both; "no coding", "just
    discussion" or "am just asking" means talk only. Only Jor's own words
    approve work.
  - Never fully remove old code or text. Comment it out with a
    "(before HNN)" marker.
  - Bump only for Hub updates: python3 hub/tools/hub_bump.py --release HNN
    --note "..." then --check, and add a change-log entry at the end of
    section 11 of hub/docs/hub_readme.md.
  - Week notes are APPENDED at the end of files, never overwritten.
  - Stage files by name only. Never use git add -A (the shared clone has
    about 205 pre-existing tracked vendor/node_modules deletions; never
    stage them).
  - No rebasing. Merge origin/main instead. PRs use merge commits.
  - Commit as jor-teron <1854500+jor-teron@users.noreply.github.com>.
  - Next Hub id is H145.
  - hub_appindex_gen.py: never pass --help (it runs the full headless mode).


--- HUB APPS BUILDER 2

5-10 Nov. All of the releases below were merged on Tue 10 Nov between
20:40 and 22:13 IST. Its own docs are in README_technical_team2.txt,
sections 1.53 to 1.94 (next free section is 1.95). main was f5b3da89
after its pushes.

Releases:
  - VD1 93abe126  Video Editor, cut and trim clips and export WebM
                  (apps/media/video-editor) (PR #478).
  - VD2 b5407b7a  Video Editor, join and arrange clips (PR #479).
  - VD3 55b29420  Video Editor, filters, rotate, crop, speed, volume and
                  text (PR #480).
  - RA1 14bc07c8  Read Aloud, text-to-speech for pasted text and Markdown
                  (apps/tools/read-aloud) (PR #481).
  - RA2 bd9f24a2  Read Aloud, reads PDFs and web pages, plus a sleep timer
                  (PR #482).
  - TD1 f7a6a2ae  3D Builder, basic WYSIWYG with a local three.js r170 copy
                  (apps/media/3d-builder) (PR #483).
  - TD2 d73c3dd0  3D Builder, second feature release (PR #484).
  - TD3 6f708971  3D Builder, export and import (PR #485).
  - PW1 823c7c21  Password Manager, encrypted on-device vault
                  (apps/tools/password-manager) (PR #486).
  - PW2 b65d4ca1  Password Manager, CSV import/export, password health
                  check and merge (PR #487).
  - SH8 c66d41b5  Spreadsheet, sheet tabs, cross-sheet refs, freeze, hide
                  rows/cols; grid stays 26x100 (PR #488).
  - SH9 cf8eda50  Spreadsheet, formulas (PR #489).
  - SH10 dbbe8d20 Spreadsheet, data tools (PR #490).
  - SH11 15b7752f Spreadsheet, formatting (PR #491).
  - SH12 2fceab98 Spreadsheet, charts (PR #492).
  - SL5 fae5f590  Slides, text styling and free text boxes (PR #493).
  - SL6 90f971cd  Slides, shapes, tables and arrange (PR #494).
  - SL7 c1886750  Slides, presenter tools (PR #495).
  - SL8 540a6ee1  Slides, themes and masters (PR #496).
  - SL9 6e2283fc  Slides, PPTX export/import and PNG export (PR #497).
  - BS5 d886dbfb  Base, undo plus field types, rules and auto-number
                  (PR #498).
  - BS6 560a04c5  Base, links between tables (PR #499).
  - BS7 db76bf6f  Base, reports, summaries and charts (PR #500).
  - BS8 29ce76e8  Base, views and filters (PR #501).
  - BS9 73bdaa5e  Base, attached files and backup (PR #502).
  - NU1 5450e46d  Numerology with a minimal UI (apps/tools/numerology)
                  (PR #503).
  - PV2 68a589ac  PDF Viewer, OCR (PR #504).
  - P2 6d6646d5   PDF Tools, merge and split (PR #505).
  - P3 d098e087   PDF Tools, images to PDF and PDF to images (PR #506).
  - P4 fe804702   PDF Tools, stamp and tidy (PR #507).
  - P5 a664264f   PDF Tools, fill and sign (PR #508).
  - SP1 d8e80fac  Sun Position, location, compass dial, sunrise/sunset and
                  twilight using the NOAA formula offline
                  (apps/tools/sun-position) (PR #509).
  - SP2 634fe73c  Sun Position, second feature release (PR #510).
  - SP3 82214121  Sun Position, third feature release (PR #511).
  - VPL1 01636592 Video Player, minimal player with an auto-hiding bar,
                  folder list, resume and SRT/VTT subtitles
                  (apps/media/video-player) (PR #512).
  - VPL2 1d8f93ef Video Player, extras in a menu (PR #513).
  - VPL3 da4bd762 Video Player, more extras in the menu (PR #514).
  - CI1 6a78b06e  Image Converter, JPG/PNG/WebP (and AVIF where supported),
                  resize, quality or target size, strips location data,
                  zip download (apps/media/image-converter) (PR #515).
  - CI2 a96cbc2d  Image Converter, second feature release (PR #516).
  - CI3 e410ee6b  Image Converter, third feature release (PR #517).
  - INV1 0e4d0eae Invoice Maker (apps/office/invoice-maker; row added to
                  office-apps.csv) (PR #518).
  - EXT1 f5b3da89 Expense Tracker (apps/office/expense-tracker) (PR #519).
  All of these passed node --check and the pure-helper node tests. Per
  Jor's rule, there were no browser tests.

Fixes:
  - none as separate releases. While pushing, clashing doc section numbers
    were renumbered and both sides of the CSV rows were kept.

Work for other teams:
  - Catalog rows pending for the 10 new apps plus PDF Tools (Hub Main).
    Games later added 10 missing catalog rows in #520; see Hub and Games.
  - Push order agreed with Games.

Diagnoses (reviews, nothing built):
  - Office: Draftly and Notely autosave fail silently. Notepad can lose
    text. Paper Scan, Print and Notely still use browser alert/confirm.
    Auto theme in Draftly and Base ignores the Hub. Heavy libraries load
    eagerly, and vendor files are duplicated.
  - Agent (main at AG40): a duplicate btnPick id breaks the Pick folder
    button in Settings. Also found: the photo history budget, the
    chat-search memory cache, stream parse errors, long-chat redraw cost
    on a 4 GB machine, a Stop/Send race, and missing in-app delete
    confirms.

Ideas / future (not built):
  - 15 Office app ideas, of which Invoice Maker and Expense Tracker are
    now built.

Open, not approved (discussed):
  - HO2, Office fixes. It touches apps/office/shared, so it needs an
    explicit go.
  - DF23, NL3 and OC1, Office follow-ups from the review.
  - AG41, AG42 and AG43, Agent fixes, about 2 h, 3 h and 2.5 h.
  - DF19 to DF22 and MM7.
  - IV1 and IV2, Image Viewer.
  - LL3, PH2 (Jor says it needs more thought), and WB1 to WB4 (a remote
    browser).

Parked:
  - PW3, Password Manager sync over the Hub link, TOTP codes, and
    PIN/fingerprint unlock.
  - MCP3, Team 1's v86 Linux mode for Web MCP.
  - NVIDIA NIM and the Agent saved-provider list (left for Team 1).
  - The API Keys system app (left for Team 3).
  - PH3.

Moved:
  - VNC2 and VNC3 went to Team 3 on 4 Nov.

For Team 3:
  - Never delete /workspace/sites_apps; it is the Apps working folder.
    Cleanup means deleting stale branches only.
  - The wt-* worktrees are now fully merged and have been removed.
  - Release ids already taken: IC, IX, VP1 and PT2. Free ids include HO2,
    DF23, NL3, OC1, PS1, PN1 and NP1.
  - The Video Editor name isn't decided. Avoid 'VirtualDub', which is a
    trademark.
  - Docs go only in README_technical_team2.txt. Don't touch other hub/
    files, root shared/, apps/system, index.html or the catalog files.
    Don't touch apps/office/shared unless the plan says so. Never use
    git add -A. No build bumps. In-app dialogs only. Keep apps light for
    a 4 GB Celeron. No Puppeteer or Playwright unless Jor asks. Only
    Jor's own words in a bot's own chat count as approval.


--- HUB GAMES BUILDER 2 (apps/games/, apps/learn/)

Nothing from 4-9 Nov. All of the work below is from Tue 10 Nov, all merge
commits, no rebase, no build bump. Final main after its pushes: a98cc41f.

Releases:
  - Minesweeper 8f95eb71 (PR #462).
  - Breakout 4b10c011 (PR #463).
  - Sweet Swap 1a 1fa4948c, match-3 (PR #464).
  - Garden Guard 1a 3ccd8e9d, tower defence (PR #465).
  - Jigsaw 1a c4793bfe (PR #466).
  - Star Colony SC-1a..1c 4024ef53 (PR #467).
  - Driving School DS-1a..1c 5dba437c (Learn) (PR #468).
  - Arrow Escape 9cb4a292 (PR #469).
  - Bubble Shooter 0d1784f5 (PR #470).
  - Hindi Letters f03afb7c (Learn) (PR #471).
  - SUDO-P1 78711965, printable Sudoku (PR #472).
  - SI-T1 fc0b0a3b, Space Invaders themes (PR #473).
  - SNL-2a..2c 1c6db5fd, Snake & Ladder (PR #474).
  - History Timeline 8d49ba9b (Learn) (PR #475).
  - Camping Checklist 891d7470 (Learn) (PR #476).
  - SNK-T1 06825842, Snake themes (PR #477).
  - Battleship SHIP-2a..2c 82941ed8 (Hard AI ~46 shots avg) (PR #520).
  - Ant Farm AF-4a..4d 051682a0 (adds core/life.js) (PR #521).
  - Nutrition Plate NP-1a..1c a98cc41f (Learn Health, sex-specific
    targets, 16 tests) (PR #522).

Fixes:
  - #520 regenerated hub_catalog.js (c1958785), adding 10 rows that were
    in the CSVs but missing after the Apps merges.
  - Merge conflicts in the settings README, games-settings.js, the CSVs,
    hub_appindex.js and hub_catalog.js were resolved keeping both sides.
  - GAME_PREFIXES is now one registry.

Work for other teams:
  - Push order with Apps: #462-477 Games, #478-519 Apps, #520-522 Games.
  - Hub Main: the new games/Learn apps may need a Hub menu entry, a
    hub_sw.js offline list and a build bump (Main to decide; none done).

Diagnoses:
  - Usage ran out at about 20:36 IST and stopped six executors mid-build
    (that is why SHIP, AF and Flag Master were first unfinished).
  - hub_appindex_gen.py --catalog-only only rewrites hub_catalog.js;
    hub_appindex.js entries need a hand or union merge.

Ideas / future (not built):
  - Flag Master FM-1a..1c (Learn flags, about 1600 lines, about 2 h).
  - Aeroplane code review and improvements.
  - More Browser FPS maps.

Open, not approved (discussed):
  - Aeroplane review (apps/games/aeroplane, plus the Lab copy at
    apps/lab/aeroplane) and Browser FPS maps - Jor will do later.

Parked:
  - Flag Master (parked by Jor tonight; no code).
  - Earlier parked items from Team 1's notes: Unblock 3D look, LandCraft
    LC1/LC2, AoE balance/Ages/ARQ1f fog, Turbo Lap and Desert Road shared
    settings, Learn theme LRN3a, NIX-G4/Island Alpha, Hero Builder
    keep/move/remove, Technology Learn topic, and a Connect 4 / Game of
    Life hub bridge.

Moved:
  - none.

For Team 3:
  - Code and commit locally; push only on Jor's "push". PRs with merge
    commits only, no rebase, no build bump for games.
  - Commit as J T <jor.teron@gmail.com>.
  - New worktree: git -C /workspace/sites_games worktree add
    /workspace/sites_<x> -b <branch> origin/main.
  - Don't touch /workspace/sites, sites_h46 or sites_h48d. Leave
    /workspace/sites_games as it is (untracked files and the learn/cr3
    branch).
  - Catalog wiring: a 6-column CSV row, description with no commas and
    under 90 characters, plus hub_appindex.js, games-settings.js and the
    settings README.
  - Content rules: Human Body has no private parts; Code School has no
    tutorials; Clock Reading is one page; Auto theme is the default; apps
    open Windowed; no trademarked names; AoE only in apps/games/aoe-rts.
  - Earlier handover note: /workspace/team3_games_handover.md.


--- HANDOVER TO TEAM 3 (next 3 days)

Team 3 handles the repo for the next 3 days. Team 2 resumes after that.
Nothing below is approved to build until Jor says so in that bot's own
chat.

Where to start:
  - Read this wrap-up, and Team 1's WEEK NOTES at the end of
    README_technical_team1.txt, before starting any release.
  - Do not begin unapproved work. A plain release id still means give the
    plan and wait.
  - If Jor picks a first task, Hub's natural next ids are H130 and H131;
    Apps has HO2 (needs an explicit go) and AG41-AG43; Games has no open
    build waiting (Aeroplane and Browser FPS maps are for Jor later;
    Flag Master is parked).

Top waiting items:
  - Hub: H130 (move into the core) and H131 (forwarder cleanup);
    fingerprint "Add phone" (needs the error code from Jor's phone);
    the PIN retry limit; H139b; H98 pairing; the Connect-link
    Allow/passcode gate; catalog/appindex and whether new games/Learn
    apps need a hub_sw.js offline list plus a build bump (needs Jor's
    OK); RL1 follow-ups (Windows and real SSH/VNC/browser tests, fetch
    streaming, large transfers, reachable HTTPS) and, if Jor okays it,
    Apps switching Web MCP and Remote over to the new relay.
  - Apps: HO2 Office fixes (touches apps/office/shared); AG41, AG42 and
    AG43; DF23, NL3, OC1, DF19-DF22 and MM7; IV1 and IV2; LL3, PH2 and
    WB1-WB4.
  - Games: Aeroplane review and more Browser FPS maps (Jor will do
    later). Parked: Flag Master, plus the earlier Team 1 list (Unblock
    3D look, LandCraft, AoE, shared settings, Learn theme, and the
    rest in the Games block above).

Folders never to delete or touch:
  - Never delete /workspace/sites_apps (Apps working folder). Cleanup
    there means stale branches only.
  - Don't touch /workspace/sites, /workspace/sites_h46 or
    /workspace/sites_h48d.
  - Leave /workspace/sites_games as it is (untracked files and the
    learn/cr3 branch).
  - The shared clone still has about 205 pre-existing tracked
    vendor/node_modules deletions. Never stage them.

Release wording (only Jor's own words in a bot's own chat count):
  - A plain release id means give the plan and wait.
  - "lets do", "do HNN" or "code" means build and commit locally only.
  - "push" means push AND merge.
  - "code n push" or "do n push" means build, push and merge.
  - "no coding", "just discussion" or "am just asking" means talk only.

Next free ids:
  - Hub: H145.
  - Apps docs: next free section in README_technical_team2.txt is 1.95.
  - Apps release ids already taken: IC, IX, VP1 and PT2. Free ids
    include HO2, DF23, NL3, OC1, PS1, PN1 and NP1.

Team 2 resumes after 3 days.
