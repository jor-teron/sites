/*
 * Hub — mesh connection log (hub/link/hub_meshlog.js, H69). Loaded right after shared/link/hub_mesh.js
 * (before hub_meshlink.js starts the mesh), so the log has the whole story from the Hub's first start.
 * Read-only: it only LISTENS to window.HubMesh (status / lobby / roster / invite events) and to the
 * SharedLink Connect link (open / close), and keeps the last MAX (200) events in memory (not saved; a
 * reload starts a new log). Used by the Mesh Viewer System app (apps/system/mesh-viewer/), which reads it
 * through window.parent (same origin, as System Monitor reads window.__hubTasks).
 * Event: { t: ms time, k: kind, msg: text }   kinds: join | open | close | error | retry | presence | link | info
 * Every name / id that came from another device is clipped here and shown with textContent only.
 * API window.HubMeshLog:
 *   list() → copy of the events (oldest first);  clear();  on(fn(ev | null)) → off()  (null = cleared)
 *   linkSince() → ms time this device linked / became the lobby (0 = not linked);  bootAt (Hub page start)
 *   retry() → HubMesh.retry() ('Retry join now', the same as Settings › Devices Retry), logged
 *   add(k, msg) (Hub code / tests)
 */
(function () {
  'use strict';
  if (window.HubMeshLog || !window.HubMesh) return;
  const M = window.HubMesh, MAX = 200;
  const log = [], fns = [];
  let linkSince = 0;
  const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n || 40);
  function add(k, msg) {
    const ev = { t: Date.now(), k: clip(k, 12), msg: clip(msg, 200) };
    log.push(ev); if (log.length > MAX) log.splice(0, log.length - MAX);
    fns.slice().forEach((f) => { try { f(ev); } catch (_) { /* a closed app frame */ } });
    return ev;
  }
  function on(fn) { fns.push(fn); return () => { const i = fns.indexOf(fn); if (i >= 0) fns.splice(i, 1); }; }
  function clear() { log.length = 0; fns.slice().forEach((f) => { try { f(null); } catch (_) { /* gone */ } }); }
  const meNow = () => { try { return M.me(); } catch (_) { return null; } };

  /* status → a log line */
  M.on('status', (st) => {
    const me = meNow() || {}, s = (() => { try { return M.stats() || {}; } catch (_) { return {}; } })();
    const code = me.code ? ' ' + clip(me.code, 12) : '';
    if (st === 'lobby' || st === 'linked') { if (!linkSince) linkSince = Date.now(); } else if (st !== 'claiming') linkSince = 0;
    switch (st) {
      case 'starting': add('info', 'Mesh starting on code' + code + (me.public ? ' (public)' : ' (private)')); break;
      case 'joining': add('join', 'Joining the lobby' + code + (s.joinFails ? ' (try ' + (s.joinFails + 1) + ')' : '')); break;
      case 'linked': add('open', 'Linked to the lobby ' + clip(M.lobbyId(), 40) + (s.lastJoinMs ? ' in ' + (s.lastJoinMs / 1000).toFixed(1) + ' s' : '')); break;
      case 'lobby': add('open', 'This device is the lobby (term ' + (me.term | 0) + ')'); break;
      case 'claiming': add('join', 'Claiming the lobby'); break;
      // case 'takeover': add('retry', 'Lobby lost: taking over'); break;   (first draft: also shown on a first start with no lobby yet)
      case 'takeover': add('retry', 'No lobby answering: taking over'); break;
      case 'retrying': add('retry', 'Join failed (' + (s.joinFails | 0) + ' so far)' + (me.retryAt ? ': retrying in ' + Math.max(1, Math.round((me.retryAt - Date.now()) / 1000)) + ' s' : ': checking the lobby')); break;
      case 'retry': add('retry', 'Reconnecting to the broker'); break;
      case 'gaveup': add('error', 'Gave up joining (Not linked: tap to retry)'); break;
      case 'refused': add('error', 'Refused by the lobby (' + clip(me.refused || 'refused', 20) + ')'); break;
      case 'duplicate': add('error', 'This device id is already in use (open in another tab?)'); break;
      case 'error': add('error', 'Mesh error'); break;
      case 'stopped': add('close', 'Mesh stopped'); break;
      default: add('info', 'State ' + clip(st, 20));
    }
  });
  /* lobby changes */
  let lastLobby = '';
  M.on('lobby', (l) => {
    const id = l && l.deviceId ? l.deviceId : '';
    if (id === lastLobby) return;
    lastLobby = id;
    if (id) add('presence', 'Lobby is ' + (l.me ? 'this device' : clip(id, 40)) + ' (term ' + ((l && l.term) | 0) + ')');
  });
  /* roster diff → device online / offline / removed */
  let seen = new Map();   // deviceId -> { name, online }
  M.on('roster', (list) => {
    const me = meNow(), mine = me ? me.deviceId : '';
    const next = new Map();
    (Array.isArray(list) ? list : []).forEach((r) => {
      if (!r || !r.deviceId || r.deviceId === mine) return;
      const id = clip(r.deviceId, 40), nm = clip(r.name || 'Device', 40), was = seen.get(id);
      next.set(id, { name: nm, online: !!r.online });
      if (!was && r.online) add('open', nm + ' (' + id + ') joined the mesh');
      else if (!was && !r.online) add('presence', nm + ' (' + id + ') listed, offline');
      else if (was && was.online && !r.online) add('close', nm + ' (' + id + ') went offline');
      else if (was && !was.online && r.online) add('open', nm + ' (' + id + ') is back online');
      else if (was && was.name !== nm) add('presence', was.name + ' is now called ' + nm);
    });
    if (list && list.length) seen.forEach((v, id) => { if (!next.has(id)) add('presence', v.name + ' (' + id + ') left the list'); });
    seen = next;
  });
  M.on('invite', (i) => { if (i) add('presence', 'Invite from ' + clip(i.name, 16) + ' to join code ' + clip(i.code, 4)); });
  /* the Connect Code link (SharedLink), for context */
  const L = window.SharedLink;
  if (L && L.on) {
    L.on('open', (id) => add('link', 'Connect link open (' + clip(id, 40) + ')'));
    L.on('close', (id) => add('link', 'Connect link closed (' + clip(id, 40) + ')'));
  }
  add('info', 'Hub started: log on (last ' + MAX + ' events)');

  window.HubMeshLog = {
    MAX, bootAt: Date.now(),
    list: () => log.slice(), clear, on, add,
    linkSince: () => linkSince,
    retry() {
      const was = (meNow() || {}).joinState || '';
      let r = false; try { r = M.retry(); } catch (_) { r = false; }
      add('retry', 'Retry join now (' + (was === 'linked' ? 'already linked' : was === 'linking' ? 'a join is already waiting' : r ? 'started' : 'nothing to retry: ' + clip(M.state(), 20)) + ')');
      return { ok: r, was };
    }
  };
})();
