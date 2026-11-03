Team 1 (Hub Bot Team 1): started Mon 26 Oct 2026. Docs: README_technical_team1.txt

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
