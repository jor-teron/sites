/*
 * Mesh Viewer (apps/system/mesh-viewer/mv.js), H69 — read-only view of the Hub mesh.
 * Reads the Hub page around us (window.parent, same origin; the same way System Monitor reads
 * window.__hubTasks): HubMesh.me() / roster() / stats() / LIMITS (shared/link/hub_mesh.js), the log
 * HubMeshLog (hub/link/hub_meshlog.js), HubMeshLink.isPrivate() (hub/link/hub_meshlink.js).
 * Live: HubMesh 'status' / 'roster' / 'peers' / 'lobby' events + HubMeshLog.on() + a 2 s timer (pauses
 * while the page is hidden). Every name / id from another device is clipped and set with textContent only.
 * Actions: Retry join now (HubMeshLog.retry() → HubMesh.retry(), like Settings › Devices Retry),
 * Settings › Devices (the Hub's __hubOpenApp), Copy log, Clear (the log only).
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n || 40);
  function hub() { try { const p = window.parent; return p !== window && p.document && p.HubMesh ? p : null; } catch (_) { return null; } }
  const pad = (n) => String(n).padStart(2, '0');
  /** local time (the device clock, IST on Jor's devices) HH:MM:SS */
  function hms(t) { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function stamp(t) { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + hms(t); }
  function zone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Calcutta' || Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Kolkata' ? 'IST' : 'local time'; } catch (_) { return 'local time'; } }
  function dur(ms) {
    if (!(ms >= 0)) return '\u2014';
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? h + ' h ' + m + ' min' : m ? m + ' min ' + (s % 60) + ' s' : (s % 60) + ' s';
  }
  function ago(t) { return t ? dur(Date.now() - t) + ' ago' : '\u2014'; }
  function kv(box, rows) {
    box.replaceChildren(...rows.filter(Boolean).flatMap((r) => { const dd = el('dd', r[2] || '', r[1]); if (r[3]) dd.id = r[3]; return [el('dt', '', r[0]), dd]; }));
  }

  /* the link state text, as Settings › Devices (sec_devices.js linkState) */
  function linkState(me) {
    const js = me.joinState || '';
    if (me.lobby || js === 'lobby') return { k: 'lobby', t: 'Lobby (this device)', c: 'ok' };
    if (js === 'linking') return { k: 'linking', t: 'Linking\u2026 ' + Math.max(0, Math.round((Date.now() - (me.joinSince || Date.now())) / 1000)) + ' s', c: 'warn' };
    if (js === 'linked') return { k: 'linked', t: 'Linked', c: 'ok' };
    if (js === 'retrying') return { k: 'retrying', t: me.retryAt ? 'Retrying in ' + Math.max(1, Math.ceil((me.retryAt - Date.now()) / 1000)) + ' s' : 'Retrying\u2026', c: 'warn' };
    if (js === 'refused' || me.state === 'refused') return { k: 'refused', t: 'Refused (' + clip(me.refused || 'refused', 20) + ')', c: 'bad' };
    if (js === 'gaveup' || me.gaveUp) return { k: 'gaveup', t: 'Not linked: tap Retry', c: 'bad' };
    return { k: me.state, t: { starting: 'Starting\u2026', joining: 'Joining\u2026', claiming: 'Linking\u2026', takeover: 'Taking over the lobby\u2026', retry: 'Reconnecting\u2026', duplicate: 'Open in another tab?', error: 'Error' }[me.state] || clip(me.state, 20), c: me.state === 'error' ? 'bad' : 'warn' };
  }

  let H = null, M = null, offLog = null, logShown = 0, logSig = '';
  // const EVS = ['status', 'roster', 'peers', 'lobby'];   (before H51)
  const EVS = ['status', 'roster', 'peers', 'lobby', 'trust', 'approval'];   // H51
  /* H51: trust labels (HubMesh.trustOf) */
  const TRUST_T = { self: 'This device', trusted: 'Trusted', new: 'New (signed, not trusted yet)', unsigned: 'Unsigned (old Hub or no key)', mismatch: 'KEY MISMATCH: refused' };
  function trustOf(id) { try { return M.trustOf ? M.trustOf(id) : ''; } catch (_) { return ''; } }
  let pend = 0;
  const soon = () => { clearTimeout(pend); pend = setTimeout(draw, 30); };

  function drawMe() {
    const me = M.me(), lg = H.HubMeshLog;
    const dot = $('mv-state').querySelector('.dot');
    const retry = $('mv-retry');
    if (!me) {
      dot.className = 'dot'; $('mv-state-t').textContent = 'Mesh off';
      $('mv-state').dataset.state = 'stopped';
      kv($('mv-me'), [['Device name', clip(H.SharedLinkDevices ? H.SharedLinkDevices.name() : '', 40)],
        ['Hub device id', clip(H.SharedLinkDevices ? H.SharedLinkDevices.id() : '', 40), 'mono', 'mv-id'],
        ['Mesh', 'Off: it starts with a Connect Code link, or Join public mesh in Settings \u203A Devices'],
        ['Hub uptime', dur(Date.now() - (lg ? lg.bootAt : Date.now()))]]);
      retry.disabled = true;
      return null;
    }
    const ls = linkState(me);
    dot.className = 'dot ' + ls.c; $('mv-state-t').textContent = ls.t; $('mv-state').dataset.state = ls.k;
    const priv = H.HubMeshLink && H.HubMeshLink.isPrivate ? H.HubMeshLink.isPrivate() : !me.public;
    const since = lg ? lg.linkSince() : 0;
    kv($('mv-me'), [
      ['Device name', clip(me.name, 40), '', 'mv-name'],
      ['Hub device id', clip(me.deviceId, 40), 'mono', 'mv-id'],
      ['Mesh code', clip(me.code, 12) + (me.public ? ' (public)' : priv ? ' (private)' : ' (private, not paired yet)'), '', 'mv-code'],
      ['State', clip(me.state, 20) + (me.joinState ? ' \u00B7 ' + clip(me.joinState, 20) : ''), 'mono', 'mv-raw-state'],
      ['Role', me.lobby ? 'Host (lobby)' : 'Joiner' + (me.relay ? ' (relayed through the lobby)' : ''), '', 'mv-role'],
      ['Lobby', me.lobby ? 'This device' : clip(M.lobbyId(), 40) || '\u2014', 'mono'],
      ['Lobby term', String(me.term | 0)],
      ['Mode', me.mode === 'desktop' ? 'Desktop' : me.mode === 'phone' ? 'Phone' : '\u2014'],
      ['Linked for', since ? dur(Date.now() - since) : 'Not linked', '', 'mv-uptime'],
      ['Hub uptime', dur(Date.now() - (lg ? lg.bootAt : Date.now()))]
    ]);
    retry.disabled = !!(me.lobby || me.refused);
    retry.title = me.lobby ? 'This device is the lobby: nothing to join' : me.refused ? 'Refused by the lobby: change the code to try again' : 'Start a fresh join run now';
    return me;
  }

  function drawStats(me) {
    const s = me ? M.stats() || {} : null, Lm = M.LIMITS || {};
    if (!s) { kv($('mv-stats'), [['Join', 'Mesh off']]); return; }
    kv($('mv-stats'), [
      ['Join state', clip(s.joinState || '\u2014', 20), 'mono', 'mv-joinstate'],
      ['Join failures (this run)', String(s.joinFails | 0), '', 'mv-joinfails'],
      ['Last join took', s.lastJoinMs ? (s.lastJoinMs < 1000 ? s.lastJoinMs + ' ms' : (s.lastJoinMs / 1000).toFixed(1) + ' s') : '\u2014', '', 'mv-lastjoin'],
      ['Gave up (times)', String(s.joinGaveUp | 0), '', 'mv-gaveup'],
      ['Retry timer', me.retryAt ? 'in ' + Math.max(0, Math.ceil((me.retryAt - Date.now()) / 1000)) + ' s' : 'Not waiting', '', 'mv-retrytimer'],
      ['Join wait / retry / give up', [Lm.JOIN_WAIT_MS, Lm.RETRY_MS, Lm.GIVEUP_MS].map((v) => v ? (v / 1000) + ' s' : '?').join(' / ')],
      ['Direct links open', String((s.direct || []).length)],
      ['Messages sent / received', (s.sent | 0) + ' / ' + (s.recv | 0)],
      ['Dropped (size, rate, shape, public)', [s.dropSize, s.dropRate, s.dropShape, s.dropPublic].map((v) => v | 0).join(', ')],
      ['Dropped (bad signature, key mismatch, untrusted)', [s.dropSig, s.dropKey, s.dropTrust].map((v) => v | 0).join(', '), '', 'mv-dropsec'],   // H51
      ['Device key', me.keyState === 'on' ? 'On (messages signed)' : me.keyState === 'off' ? 'Off (no WebCrypto here: messages unsigned)' : 'Loading\u2026', '', 'mv-key']   // H51
    ]);
  }

  function drawDevs(me) {
    const box = $('mv-devs');
    if (!me) { box.replaceChildren(el('p', 'empty', 'Mesh off.')); $('mv-count').textContent = ''; return; }
    const ros = M.roster(), direct = new Set(((M.stats() || {}).direct) || []);
    const on = ros.filter((r) => r.online).length;
    $('mv-count').textContent = '(' + on + ' online, ' + ros.length + ' listed)';
    if (!ros.length) { box.replaceChildren(el('p', 'empty', 'No devices yet.')); return; }
    box.replaceChildren(...ros.slice(0, 40).map((r) => {
      const self = r.deviceId === me.deviceId;
      const d = el('div', 'dev' + (self ? ' self' : '') + (r.online ? '' : ' off'));
      d.dataset.id = clip(r.deviceId, 40); d.dataset.online = r.online ? '1' : '0';
      const dot = el('span', 'dot ' + (r.online ? 'ok' : ''));
      const nm = el('div', 'dev-name');
      nm.append(el('b', '', clip(r.name || 'Device', 40) + (self ? ' (this device)' : '')), el('span', 'dev-sub mono', clip(r.deviceId, 40)));
      const tags = el('div', 'dev-tags');
      // [..., 'Trust: not checked (H51)'].filter(Boolean)...   (before H51)
      [r.lobby ? 'Lobby' : '', r.relay ? 'Relayed' : '', r.mode === 'desktop' ? 'Desktop' : r.mode === 'phone' ? 'Phone' : '', '#' + (r.joinOrder | 0)].filter(Boolean).forEach((t) => tags.appendChild(el('span', 'tag' + (t === 'Lobby' ? ' lobby' : ''), t)));
      const ts = trustOf(r.deviceId);   // H51
      if (ts) { const tg = el('span', 'tag trust trust-' + ts, 'Trust: ' + (TRUST_T[ts] || ts)); tg.dataset.trust = ts; tags.appendChild(tg); if (ts === 'mismatch') tg.style.cssText = 'background:#dc2626;color:#fff'; else if (ts === 'trusted') tg.style.cssText = 'background:#16a34a;color:#fff'; }
      nm.appendChild(tags);
      const q = el('div', 'dev-q');
      let link;
      if (self) link = 'This device';
      else if (!r.online) link = 'Last seen ' + ago(r.lastSeen);
      else if (direct.has(r.deviceId)) link = 'Direct link';
      else if (r.lobby && !me.lobby) link = 'Lobby link';
      else link = r.relay || me.relay ? 'Through the lobby' : 'Via the lobby';
      q.append(el('span', 'st ' + (r.online ? 'on' : 'off'), r.online ? 'Online' : 'Offline'), el('span', 'muted', link));
      if (r.online && !self && r.lastSeen) q.appendChild(el('span', 'muted small', ' \u00B7 seen ' + ago(r.lastSeen)));
      if (!self && M.forget && (ts === 'trusted' || ts === 'mismatch')) {   // H51: Forget = off the trust list (asked again next join)
        const fb = el('button', 'btn small mv-forget', 'Forget'); fb.type = 'button';
        fb.title = 'Remove from this device\u2019s trust list';
        fb.addEventListener('click', () => { M.forget(r.deviceId); soon(); });
        q.appendChild(fb);
      }
      d.append(dot, nm, q);
      return d;
    }));
  }

  function drawLog() {
    const lg = H.HubMeshLog, box = $('mv-log');
    if (!lg) { box.replaceChildren(el('li', 'empty', 'The Hub has no mesh log (update the Hub).')); return; }
    const list = lg.list();
    const sig = list.length + ':' + (list.length ? list[0].t + '/' + list[list.length - 1].t + list[list.length - 1].msg : '');
    if (sig === logSig) return;
    logSig = sig;
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    box.replaceChildren(...list.map((e) => {
      const li = el('li', 'ev'); li.dataset.k = e.k;
      li.append(el('span', 'tm', hms(e.t)), el('span', 'k k-' + clip(e.k, 12), clip(e.k, 12)), el('span', 'm', clip(e.msg, 200)));
      return li;
    }));
    if (!list.length) box.replaceChildren(el('li', 'empty', 'No events yet.'));
    $('mv-log-count').textContent = '(' + list.length + ')';
    if (near || logShown === 0) box.scrollTop = box.scrollHeight;
    logShown = list.length;
  }

  function draw() {
    if (document.hidden) return;
    H = hub(); M = H && H.HubMesh;
    if (!M) return;
    let me = null;
    try { me = drawMe(); drawStats(me); drawDevs(me); } catch (e) { console.warn('mesh viewer', e); }
    drawLog();
  }

  function note(t) { $('mv-retry-note').textContent = t; }
  function logText() {
    const lg = H && H.HubMeshLog; if (!lg) return '';
    const me = M && M.me();
    const head = 'Hub mesh log \u00B7 ' + stamp(Date.now()) + ' ' + zone() + (me ? ' \u00B7 ' + clip(me.name, 40) + ' ' + clip(me.deviceId, 40) + ' \u00B7 code ' + clip(me.code, 12) + ' \u00B7 ' + clip(me.state, 20) : ' \u00B7 mesh off');
    return [head].concat(lg.list().map((e) => stamp(e.t) + '  ' + clip(e.k, 12).toUpperCase().padEnd(8) + ' ' + clip(e.msg, 200))).join('\n') + '\n';
  }
  async function copy(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (_) { /* fall back */ }
    const ta = el('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove(); return ok;
  }

  function start() {
    H = hub(); M = H && H.HubMesh;
    if (!M) {
      $('mv-state-t').textContent = 'Open Mesh Viewer from the Hub';
      $('mv-me').replaceChildren(); $('mv-retry').disabled = true; $('mv-settings').disabled = true; $('mv-copy').disabled = true; $('mv-clear').disabled = true;
      $('mv-log').replaceChildren(el('li', 'empty', 'The mesh lives in the Hub page: open this app from the Hub\u2019s Start menu or Search.'));
      return;
    }
    $('mv-log-note').textContent = 'Last ' + ((H.HubMeshLog && H.HubMeshLog.MAX) || 200) + ' events since the Hub started (not saved). Times in ' + zone() + '.';
    $('mv-retry').addEventListener('click', () => {
      const r = H.HubMeshLog ? H.HubMeshLog.retry() : { ok: M.retry(), was: '' };
      note(r.was === 'linked' ? 'Already linked: nothing to retry.' : r.was === 'linking' ? 'A join is already waiting for the lobby.' : r.ok ? 'Retry started.' : 'Nothing to retry right now (' + clip(M.state(), 20) + ').');
      soon();
    });
    $('mv-settings').addEventListener('click', () => { if (H.__hubOpenApp) H.__hubOpenApp('apps/system/settings/', { hash: 'devices/connected' }); });
    $('mv-clear').addEventListener('click', () => { if (H.HubMeshLog) H.HubMeshLog.clear(); logSig = ''; logShown = 0; drawLog(); });
    $('mv-copy').addEventListener('click', async () => {
      const b = $('mv-copy'), ok = await copy(logText());
      b.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => { b.textContent = 'Copy log'; }, 1500);
    });
    EVS.forEach((ev) => M.on(ev, soon));
    if (H.HubMeshLog) offLog = H.HubMeshLog.on(soon);
    const tick = setInterval(draw, 2000);
    window.addEventListener('pagehide', () => { EVS.forEach((ev) => { try { M.off(ev, soon); } catch (_) { /* Hub gone */ } }); if (offLog) offLog(); offLog = null; clearInterval(tick); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) draw(); });
    draw();
  }
  start();
})();
