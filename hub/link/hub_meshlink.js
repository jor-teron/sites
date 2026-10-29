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
 */
(function () {
  'use strict';
  if (!window.SharedLink || !window.HubMesh) return;
  const off = () => { try { return localStorage.getItem('hub-mesh-off') === '1'; } catch (_) { return false; } };
  const desktop = () => !window.__hubRemote && !!(window.HubMode && window.HubMode.mode === 'desktop');
  function check() {
    const L = window.SharedLink;
    const code = String(L.code || '');
    const active = !off() && L.live && code && (L.role === 'host' || (L.role === 'join' && L.connected));
    if (!active) {
      // a joined phone that lost the PC keeps its mesh (the other devices may still be there); stop only when
      // the link is really off (Disconnect / no role / no peer)
      if (HubMesh.state() !== 'stopped' && (off() || !L.role || !code || (L.role === 'host' && !L.live))) HubMesh.stop();
      return;
    }
    const m = HubMesh.me();
    if (m && m.code === code) return;
    HubMesh.start(code, { preferLobby: L.role === 'host' && desktop() }).catch((e) => console.warn('HubMesh start', e && e.message));
  }
  ['status', 'open', 'close'].forEach((ev) => SharedLink.on(ev, () => setTimeout(check, 0)));
  setInterval(check, 3000);
  setTimeout(check, 500);
  // this device renamed / switched Desktop ↔ Phone: the roster follows
  ['hub-wm-mode', 'hub-device-name'].forEach((ev) => window.addEventListener(ev, () => setTimeout(() => HubMesh.refresh(), 0)));
  window.addEventListener('storage', (e) => { if (e.key === 'shared-link-device-name') HubMesh.refresh(); });
  window.__hubMeshCheck = check;
})();
