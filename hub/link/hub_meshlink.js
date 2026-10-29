/*
 * Hub — mesh glue (hub/link/hub_meshlink.js, H50). Loaded after hub_sync.js. Starts the Hub mesh
 * (shared/link/hub_mesh.js, window.HubMesh) whenever this Hub has a Connect Code session:
 *   - host (the PC Hub: SharedLink.role 'host', code registered) → HubMesh.start(code, { preferLobby })
 *     preferLobby = this Hub is in Desktop mode, so by default the PC holds the mesh lobby;
 *   - joined (a phone Hub that joined with the code: role 'join', connected) → HubMesh.start(code).
 *   SharedLink stopped (manual Disconnect, role '' / status idle) → HubMesh.stop(); code changed (New code,
 *   Join another Hub) → start() with the new code (start() stops the old mesh first).
 * Checked on SharedLink status / open / close and every 3 s (cheap: start() with the same code is a no-op).
 * Nothing existing moves onto the mesh in H50: the controller / Gamepad, H29 profile sync, Pooh Chat and
 * file transfer keep using SharedLink exactly as before. Settings › Devices › Connected devices shows
 * HubMesh.roster() (sec_devices.js). App frames get no access yet (H50b adds the postMessage bridge).
 * Turn off for a test / a problem: localStorage 'hub-mesh-off' = '1'.
 *
 * H55: public mesh '0000' (HubMesh.PUBLIC_CODE). This Hub is on 0000 whenever it is NOT in a private mesh and
 *   Settings › Devices › Join public mesh (localStorage 'sites-hub.meshPublic', '0' = off, default on, H29
 *   Shared group) is on. Private mesh =
 *     - joined: role 'join' with a code (not 0000) and connected (as H50), or a joined phone that lost the PC
 *       (keeps its private mesh, as H50);
 *     - host: role 'host', live, and the code is PAIRED: a device has linked to this code at least once
 *       (localStorage 'hub-mesh-paired' = code, set while SharedLink.connected). Every Hub hosts a code from its
 *       first start (hub-controller.js), so "hosting a code" alone would keep every Hub off 0000; a host whose
 *       code nobody has used yet is on 0000 and can send that code as an invite. New code (another code) or a
 *       host Disconnect (SharedLink stopped, not live) clears the pairing → back to 0000.
 *   Joining a private code leaves 0000 (start() with the private code stops the public mesh first); Disconnect
 *   (host stop / a joined phone's Disconnect → reload as a host) rejoins 0000; the switch off leaves 0000.
 *   Public PeerJS server as before. On 0000 HubMesh itself refuses every channel except presence + invites.
 *   Invites: HubMesh.on('invite') → a Hub notice card 'NAME invites you: join code 1234' (tap = join) and the
 *   list window.HubMeshLink.invites() (Settings › Devices shows Accept / Dismiss). Accept = the same path as
 *   🎮 Devices › Join (location ?join=CODE, hub_role.js → hub_remote.js). window.HubMeshLink:
 *   { publicOn(), setPublic(on), isPrivate(), privateCode(), invite(deviceId), invites(), accept(i), dismiss(i) }.
 * H55b: a mesh that gave up joining (5 minutes of failed joins) gets one fresh run when a Connect link opens or
 *   closes (HubMesh.retry()); HubMesh itself also retries on tab visible / back online.
 */
(function () {
  'use strict';
  if (!window.SharedLink || !window.HubMesh) return;
  const off = () => { try { return localStorage.getItem('hub-mesh-off') === '1'; } catch (_) { return false; } };
  const desktop = () => !window.__hubRemote && !!(window.HubMode && window.HubMode.mode === 'desktop');
  /* H55: public mesh */
  const PUB = HubMesh.PUBLIC_CODE || '0000';
  const PUB_KEY = 'sites-hub.meshPublic', PAIR_KEY = 'hub-mesh-paired';
  const get = (k) => { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } };
  const put = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (_) { /* blocked */ } };
  const publicOn = () => get(PUB_KEY) !== '0';
  /** the private mesh code this Hub is in, or '' */
  function privateCode() {
    const L = window.SharedLink;
    const code = String(L.code || '');
    if (!code || code === PUB) return '';
    if (L.role === 'join') return code;   // joined (connected, or lost the PC: keeps its mesh as in H50)
    if (L.role === 'host' && L.live) {
      if (L.connected && get(PAIR_KEY) !== code) put(PAIR_KEY, code);   // a device linked: private from now on
      return get(PAIR_KEY) === code ? code : '';
    }
    return '';
  }
  /** this host's own code (for invites), when it has one */
  function ownCode() { const L = window.SharedLink; const c = String(L.code || ''); return L.role === 'host' && L.live && /^\d{4}$/.test(c) && c !== PUB ? c : ''; }
  // function check() {   (H50)
  //   const L = window.SharedLink;
  //   const code = String(L.code || '');
  //   const active = !off() && L.live && code && (L.role === 'host' || (L.role === 'join' && L.connected));
  //   if (!active) {
  //     if (HubMesh.state() !== 'stopped' && (off() || !L.role || !code || (L.role === 'host' && !L.live))) HubMesh.stop();
  //     return;
  //   }
  //   const m = HubMesh.me();
  //   if (m && m.code === code) return;
  //   HubMesh.start(code, { preferLobby: L.role === 'host' && desktop() }).catch((e) => console.warn('HubMesh start', e && e.message));
  // }
  function check() {   // H55
    const L = window.SharedLink;
    if (L.role === 'host' && !L.live && get(PAIR_KEY)) put(PAIR_KEY, '');   // host Disconnect: unpaired
    if (off()) { if (HubMesh.state() !== 'stopped') HubMesh.stop(); return; }
    const code = String(L.code || '');
    const priv = privateCode();
    const m = HubMesh.me();
    if (priv) {
      // H50 rule kept: a joined phone starts its mesh only once connected
      if (L.role === 'join' && !L.connected && !(m && m.code === priv)) { if (m && m.public) HubMesh.stop(); return; }
      if (m && m.code === priv) return;
      HubMesh.start(priv, { preferLobby: L.role === 'host' && desktop() }).catch((e) => console.warn('HubMesh start', e && e.message));
      return;
    }
    if (L.role === 'join' && code && code !== PUB) return;   // joining (not linked yet): wait, no public detour
    if (!publicOn()) { if (HubMesh.state() !== 'stopped') HubMesh.stop(); return; }
    if (m && m.code === PUB) return;
    HubMesh.start(PUB, { preferLobby: false }).catch((e) => console.warn('HubMesh start', e && e.message));
  }
  ['status', 'open', 'close'].forEach((ev) => SharedLink.on(ev, () => setTimeout(check, 0)));
  // H55b: a Connect link opening (a device joined) or closing (Disconnect) restarts a mesh run that gave up, once
  ['open', 'close'].forEach((ev) => SharedLink.on(ev, () => setTimeout(() => { const m = HubMesh.me(); if (m && m.gaveUp) HubMesh.retry(); }, 50)));
  setInterval(check, 3000);
  setTimeout(check, 500);
  // this device renamed / switched Desktop ↔ Phone: the roster follows
  ['hub-wm-mode', 'hub-device-name'].forEach((ev) => window.addEventListener(ev, () => setTimeout(() => HubMesh.refresh(), 0)));
  // window.addEventListener('storage', (e) => { if (e.key === 'shared-link-device-name') HubMesh.refresh(); });   (H50)
  window.addEventListener('storage', (e) => {
    if (e.key === 'shared-link-device-name') HubMesh.refresh();
    if (e.key === PUB_KEY || e.key === null) setTimeout(check, 0);   // H55: switch changed in another tab
  });
  window.addEventListener('hub-prefs', () => setTimeout(check, 0));   // H55: Settings frame changed the switch
  window.__hubMeshCheck = check;

  /* ---------- H55: invites ---------- */
  let invites = [];   // [{from, name, code, at}] newest first, max 5, only while on 0000
  const changed = () => { try { window.dispatchEvent(new CustomEvent('hub-mesh-invites')); } catch (_) { /* old browser */ } };
  function accept(i) {
    const v = invites[i | 0];
    if (!v) return false;
    invites = [];
    changed();
    try { sessionStorage.setItem('hub-join-try', v.code); } catch (_) { /* private mode */ }
    location.replace(location.pathname + '?join=' + v.code);   // same as 🎮 Devices › Join (hub_panels.js)
    return true;
  }
  function dismiss(i) { invites.splice(i | 0, 1); changed(); }
  HubMesh.on('invite', (inv) => {
    if (!HubMesh.isPublic() || privateCode() || inv.code === String(SharedLink.code || '')) return;
    invites = [inv].concat(invites.filter((x) => x.from !== inv.from)).slice(0, 5);
    changed();
    const N = window.HubNotify;
    if (N && N.notice) N.notice({ icon: '\uD83D\uDCE8', title: inv.name + ' invites you', text: 'Join code ' + inv.code + '? Tap to join.', onClick: () => { const k = invites.indexOf(inv); if (k >= 0) accept(k); } });
  });
  HubMesh.on('status', (st) => { if (st === 'stopped' && invites.length) { invites = []; changed(); } });
  window.HubMeshLink = {
    PUBLIC_CODE: PUB,
    publicOn,
    setPublic(on) { put(PUB_KEY, on ? '' : '0'); check(); },
    isPrivate: () => !!privateCode(),
    privateCode,
    ownCode,
    invite(to) { const c = ownCode(); if (!c) return { ok: false, reason: 'no-code' }; if (!HubMesh.isPublic()) return { ok: false, reason: 'not-public' }; return HubMesh.invite(to, c); },
    invites: () => invites.slice(),
    accept,
    dismiss,
  };
})();
