/*
 * Hub core entry (hub/core/hub_core.js, H127). Step 1 of 3 of the Hub split:
 *   core (this file, no screen of its own) / desktop shell (hub.html) / phone shell (phone.html, PH14 next).
 *
 * ONE script that loads the screen-free core of the Hub, in the same dependency order hub.html used
 * before H127. It only LOADS the existing files (they are unchanged and still set the same globals);
 * it adds one global of its own, window.HubCore.
 *
 * Parts (each part's files load in this order; the parts load in the order boot → link → mesh):
 *   boot  hub/core/hub_role.js        window.__hubRemote (phone remote Hub joins instead of hosting)
 *         hub/core/hub_daynight.js    window.HubDayNight (day / night schedule, H63)
 *         hub/core/hub_autotheme.js   window.HubAutoTheme (Auto theme, H64)
 *         hub/core/hub_prefs.js       window.HubPrefs (theme, accent and every Look setting, applied live)
 *   link  hub/core/hub_keys.js        window.HubKeys (API key store, H28)
 *         hub/core/hub_providers.js   window.HubProviders (custom AI services, H134c)
 *         hub/core/hub_api.js         window.HubAPI (shared AI requests, H134b)
 *         hub/core/hub_profile.js     window.HubProfile (settings saved to the connected folder, H30.1)
 *         shared/link/link_core.js    window.SharedLink (one PeerJS connection layer)
 *         shared/link/link_devices.js window.SharedLinkDevices (device id, name, this device's 5-digit number)
 *         shared/link/link_files.js   window.SharedLinkFiles (file transfer)
 *         shared/link/link_ui.js      window.SharedLinkUI (name + device list widgets; mount where you like)
 *         shared/link/link_chat.js    window.SharedChat (chat over the link / mesh)
 *   mesh  hub/link/hub_link.js        window.__hubLink (routes link files / messages to app frames)
 *         hub/link/hub_sync.js        window.HubSync (Send profile, H29.1)
 *         shared/link/hub_mesh.js     window.HubMesh (Hub mesh, one connection per Connect Code, H50)
 *         hub/link/hub_meshlog.js     window.HubMeshLog (mesh log for the Mesh Viewer, H69)
 *         hub/link/hub_meshlink.js    window.HubMeshLink (starts the mesh; always on the public 00000 lobby, H95)
 *         hub/link/hub_line.js        window.HubLine (calls / messages to a Hub number, H91)
 *         hub/link/hub_trust.js       window.HubTrust (passcode pairing, H97)
 *         hub/link/hub_linkstate.js   Devices popover state row (does nothing on a page without #ctrl-popover)
 *
 * NOT in the core (shell UI, stays in hub.html): windows / taskbar / workspaces (hub/wm), menus, tiles, hub.js,
 * Settings drawer, dialogs + notifications (shell-drawn), the Gamepad controller host hub/controller/hub-controller.js
 * (#ctrl-* popover + key forwarding into app frames; it hosts the private Hub number peer), hub_remote.js,
 * hub_chat.js, link_scan.js, hub_panels.js (tied to hub.html's layout) and the Game Bar.
 *   (H129b / H129c: those shell files now live in desktop/: desktop/wm, desktop/menu, desktop/panels (hub_panels, hub_chat),
 *   desktop/notify, desktop/gamebar, desktop/controller (hub-controller.js), desktop/link (hub_remote); link_scan.js stays
 *   in shared/link/ (the phone and apps load it).)
 *
 * How a shell uses it
 *   - Everything at once (phone.html for PH14, a bare page):
 *       <script src="hub/core/hub_core.js"></script>
 *     loads boot, link and mesh right there, in order, as normal parser-blocking scripts (document.write while the
 *     page is still parsing), so the next <script> tag already sees every global, exactly like separate tags.
 *   - Split (hub.html): the desktop shell has its own scripts BETWEEN the core parts (theme must paint first; the
 *     link part must come after the notifications / dialogs and before hub-controller.js; the mesh part after
 *     hub-controller.js). So hub.html loads this file once with data-parts="boot" and starts the other two parts
 *     with an inline <script>HubCore.load('link')</script> / HubCore.load('mesh') at the old places. The result is
 *     byte-for-byte the same script order and timing as the separate tags before H127.
 *   - Late (after the page finished parsing, document.write would wipe it): HubCore.load(part) falls back to a
 *     sequential loader (one <script> after the other, async = false) and returns a promise.
 *   window.HubCore = { version, base, parts, ready, loaded(part), load(part|'all') → Promise }
 *     ready resolves (['boot', 'link', 'mesh']) once all three parts have run (in hub.html: right after the mesh
 *     part, before link_scan.js); HubCore.loaded('mesh') tells whether one part is in.
 * Paths are resolved from this script's own URL (…/hub/core/hub_core.js → the site root), so any page at any depth
 * can load it. A part is never loaded twice (load() of a loaded part just resolves).
 */
(function () {
  'use strict';
  if (window.HubCore) return;

  const PARTS = {
    boot: ['hub/core/hub_role.js', 'hub/core/hub_daynight.js', 'hub/core/hub_autotheme.js', 'hub/core/hub_prefs.js'],
    // link: ['hub/core/hub_keys.js', 'hub/core/hub_api.js', 'hub/core/hub_profile.js',   (before H134c)
    link: ['hub/core/hub_credentials.js', 'hub/core/hub_keys.js', 'hub/core/hub_providers.js', 'hub/core/hub_api.js', 'hub/core/hub_profile.js',   // H134c: + hub_providers.js
      'shared/link/link_core.js', 'shared/link/link_devices.js', 'shared/link/link_files.js', 'shared/link/link_ui.js', 'shared/link/link_chat.js'],
    mesh: ['hub/link/hub_link.js', 'hub/link/hub_sync.js', 'shared/link/hub_mesh.js', 'hub/link/hub_meshlog.js',
      'hub/link/hub_meshlink.js', 'hub/link/hub_line.js', 'hub/link/hub_trust.js', 'hub/link/hub_linkstate.js'],
  };
  const ORDER = ['boot', 'link', 'mesh'];

  const me = document.currentScript;
  let base = '';
  try { base = new URL('../../', me && me.src ? me.src : location.href).href; } catch (_) { base = ''; }
  // same-folder relative paths for the site root page (hub.html / phone.html): keeps the URLs (and the SW cache keys) as before
  // (before H129a) try { if (base === new URL('./', location.href).href) base = ''; } catch (_) { /* keep absolute */ }   H129a: document.baseURI = the site root under desktop/ (<base href="../">); = location.href on hub.html / phone.html
  try { if (base === new URL('./', document.baseURI).href) base = ''; } catch (_) { /* keep absolute */ }

  const state = {};   // part → 'loading' | 'done'
  const waits = {};   // part → [resolve]
  let readyRes = null;
  const ready = new Promise((r) => { readyRes = r; });

  function done(part) {
    state[part] = 'done';
    (waits[part] || []).splice(0).forEach((f) => f(part));
    if (ORDER.every((p) => state[p] === 'done')) readyRes(ORDER.slice());   // ready = the whole core is in
  }
  function wait(part) { return state[part] === 'done' ? Promise.resolve(part) : new Promise((r) => (waits[part] = waits[part] || []).push(r)); }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  /* While the page parses: write the part's tags right after the current script → same as hand-written tags. */
  function writePart(part) {
    let h = '';
    PARTS[part].forEach((f) => { h += '<script src="' + esc(base + f) + '"><\/script>'; });
    h += '<script>window.HubCore._done(' + JSON.stringify(part) + ')<\/script>';
    document.write(h);
  }
  /* After parsing: one script after the other (keeps the order; each runs before the next starts). */
  function chainPart(part) {
    return PARTS[part].reduce((p, f) => p.then(() => new Promise((res) => {
      const s = document.createElement('script');
      s.src = base + f;
      s.async = false;
      s.onload = () => res();
      s.onerror = () => { console.warn('HubCore: could not load', f); res(); };
      (document.head || document.documentElement).appendChild(s);
    })), Promise.resolve()).then(() => done(part));
  }

  function load(which) {
    const list = which === 'all' || !which ? ORDER.slice() : [].concat(which);
    list.forEach((p) => { if (!PARTS[p]) throw new Error('HubCore: no part ' + p); });
    const parsing = document.readyState === 'loading';
    let chain = Promise.resolve();
    list.forEach((p) => {
      if (state[p]) { chain = chain.then(() => wait(p)); return; }
      state[p] = 'loading';
      if (parsing) writePart(p);
      else chain = chain.then(() => chainPart(p));
    });
    return chain.then(() => Promise.all(list.map(wait))).then(() => list);
  }

  window.HubCore = {
    version: 'H127',
    base: base,
    parts: PARTS,
    ready: ready,
    loaded: (p) => state[p] === 'done',
    load: load,
    _done: done,
  };

  // data-parts="boot" (hub.html) | "boot link" | "none"; no attribute = all parts (phone.html, a bare page)
  const attr = me && me.getAttribute('data-parts');
  const first = attr == null ? ORDER.slice() : attr.trim() === 'none' ? [] : attr.trim().split(/[\s,]+/);
  if (first.length) load(first);
})();
