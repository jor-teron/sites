/* Live Location LL2 — glue: sharing ON by default on a private code (share:false remembered when turned off; a denied
   permission shows on the toggle and is not retried this session); device list = bottom sheet from 👥; private mesh code, share toggle, peer messages.
   Code order: #code=/?hub= in URL, the Hub's HubMeshLink private code, last code ('live-location-settings-v1'), else the code box.
   Public 00000 is refused (location is private). Messages over LLPeer.send: {k:'pos', lat, lon, acc, at, name, dev} and {k:'off', dev}.
   New devices get our latest position via LLPeer.provide (lobby) and on every roster change we re-send.
   LL2 history: every pos we see (ours too) goes to LLHist (IndexedDB, throttled 15 m / 60 s, keep 1 / 7 / 30 days).
   Member key = m.dev (SharedLinkDevices.id) or 'n:'+name for LL1 senders. Offline members stay on the map greyed (LLMap).
   History server (server/ll_server.js): announces {k:'srv', v} (lobby provide + on roster change). We then send
   {k:'hreq', since: cursor (server clock, per code), from: keep-window start, dev} to it; it answers
   {k:'hist', pts:[[k,lat,lon,acc,at]], names:{k:name}, done, now} in parts; now = our next cursor. When done we upload our
   own points newer than the last upload (per code) as {k:'hput', dev, name, pts:[[lat,lon,acc,at]]} — the gap while it was
   down; duplicates are ignored server-side.
   legacy (LL1.1): pos had no dev; 'off' removed the marker; no history, no menu. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var PUB = '00000', code = '', started = false, lastFix = null, ME = LLStore.dev(), denied = false;
  var peers = {}, srv = '', srvV = '', baseStatus = 'Starting…', syncing = false, PART = 300;
  function ok(c) { c = String(c || ''); return /^\d{5}$/.test(c) && c !== PUB ? c : ''; }
  function urlCode() { var m = (location.hash + '&' + location.search).match(/(?:code|hub|join)=(\d{5})/); return m ? m[1] : ''; }
  function meshCode() {
    try { var h = window.parent !== window && window.parent.HubMeshLink; if (h && h.isPrivate && h.isPrivate()) return ok(h.privateCode()); } catch (_) { /* */ }
    return '';
  }
  // legacy (LL1.1): function status(t) { $('status').textContent = t; }
  function status(t) { if (t != null) baseStatus = t; $('status').textContent = baseStatus + (srv ? ' · History server online' : ''); $('status').title = $('status').textContent; $('status').classList.toggle('srv', !!srv); $('srv-chip').hidden = !srv; }
  function go(c) {
    c = ok(c); if (!c) { status('Private code needed'); $('code-box').hidden = false; LLMap.resize(); return; }
    if (started && c === code) return;
    if (started) LLPeer.stop();
    started = true; code = c; LLStore.setCode(c); $('code-box').hidden = true; $('btn-code').textContent = c; LLMap.resize();
    LLPeer.start(c).catch(function () { status('PeerJS could not load (offline?)'); });
    if (LLStore.share() && !denied && !LLGeo.on()) setShare(true);   // LL1.1: auto-share
  }
  function pos() { return lastFix ? { k: 'pos', lat: lastFix.lat, lon: lastFix.lon, acc: lastFix.acc, at: lastFix.at, name: LLStore.name(), dev: ME } : null; }
  function keyOf(m, from) { var k = m && typeof m.dev === 'string' && m.dev ? m.dev.slice(0, 64) : (m && m.name ? 'n:' + String(m.name).slice(0, 40) : peers[from] || ''); return k; }
  /* one place for every position we see: map + history (+ live trail refresh) */
  function seen(k, m, mine) {
    LLMap.put(k, m, mine);
    LLHist.add(k, m.name, m).then(function (stored) { if (stored && LLMap.selected() === k) loadTrail(); });
  }
  function onFix(f) { lastFix = f; seen(ME, pos(), true); LLPeer.send(pos()); }
  function setShare(on) {
    $('share').classList.toggle('on', on); $('share').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('share').classList.remove('denied');
    $('share-lbl').textContent = on ? 'Sharing' : 'Share';
    $('geo-note').hidden = true;
    if (on) {
      LLGeo.start(onFix,
        function (msg, perm) {
          if (perm) { denied = true; LLGeo.stop(); $('share').classList.remove('on'); $('share').classList.add('denied'); $('share').setAttribute('aria-pressed', 'false'); $('share-lbl').textContent = 'No access'; msg = 'Location is blocked. Allow it in the browser’s site settings, then tap Share.'; }
          $('geo-note').textContent = msg; $('geo-note').hidden = false;
        });
    } else {
      // legacy (LL1.1): LLGeo.stop(); lastFix = null; LLMap.drop(ME); LLPeer.send({ k: 'off' });
      LLGeo.stop(); lastFix = null; LLMap.offline(ME); LLPeer.send({ k: 'off', dev: ME });
    }
  }
  /* ---- history server ---- */
  function srvOn(from, m) {
    var fresh = srv !== from; srv = from; srvV = String(m.v || ''); status();
    if (fresh) sync();
  }
  function srvOff() { if (!srv) return; srv = ''; syncing = false; status(); }
  function sync() {
    if (!srv || syncing) return;
    syncing = true;
    var c = LLStore.hsync(code);
    LLPeer.sendTo(srv, { k: 'hreq', since: c, from: Date.now() - LLStore.keep() * LLHist.DAY, dev: ME, name: LLStore.name() });
    setTimeout(function () { syncing = false; }, 30000);   // a lost reply never blocks the next sync
  }
  function onHist(m, from) {
    if (from !== srv || !Array.isArray(m.pts)) return;
    var names = m.names && typeof m.names === 'object' ? m.names : {}, list = [];
    m.pts.forEach(function (a) { if (Array.isArray(a) && a.length >= 5) list.push({ k: String(a[0]), n: names[a[0]], lat: a[1], lon: a[2], acc: a[3], at: a[4] }); });
    LLHist.merge(list).then(function (n) {
      if (!m.done) return;
      syncing = false; if (+m.now) LLStore.setHsync(code, +m.now);
      showKnown(); if (LLMap.selected()) loadTrail();
      upload();
      if (window.LLApp) LLApp.lastSync = { got: n, at: Date.now() };
    });
  }
  function upload() {
    var c = code, after = LLStore.hup(c);
    LLHist.range(ME, after + 1).then(function (pts) {
      if (!pts.length || !srv) return;
      LLStore.setHup(c, pts[pts.length - 1].at);
      for (var i = 0; i < pts.length; i += PART) {
        LLPeer.sendTo(srv, { k: 'hput', dev: ME, name: LLStore.name(), pts: pts.slice(i, i + PART).map(function (p) { return [p.lat, p.lon, p.acc, p.at]; }) });
      }
    });
  }
  /* last-known spots from history: greyed markers for everyone not live */
  function showKnown() { return LLHist.who().then(function (list) { list.forEach(function (w) { LLMap.known(w.k, w, w.k === ME); }); LLMap.fit(); }); }
  /* ---- trail ---- */
  function rangeFrom(r) {
    var now = Date.now();
    if (r === 'today') { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
    return now - (r === '7d' ? 7 : 1) * LLHist.DAY;
  }
  function loadTrail(fit) {
    var k = LLMap.selected(); if (!k) { LLMap.setTrail([]); return Promise.resolve(0); }
    var r = LLStore.range();
    return LLHist.range(k, rangeFrom(r)).then(function (pts) {
      if (LLMap.selected() !== k) return 0;
      LLMap.setTrail(pts, fit);
      $('trail-n').textContent = pts.length ? pts.length + ' points' : 'No history in this range';
      return pts.length;
    });
  }
  function trailBar(k) {
    var d = LLMap.devices()[k];
    $('trail-bar').hidden = !k;
    if (!k) return;
    $('trail-who').textContent = d ? d.name + (d.mine ? ' (you)' : '') : '';
    Array.prototype.forEach.call(document.querySelectorAll('#trail-bar [data-r]'), function (b) { b.classList.toggle('on', b.getAttribute('data-r') === LLStore.range()); });
    loadTrail(true);
  }
  LLMap.onSelect(trailBar);
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#trail-bar [data-r]');
    if (b) { LLStore.setRange(b.getAttribute('data-r')); trailBar(LLMap.selected()); }
  });
  $('trail-x').addEventListener('click', function () { LLMap.select(''); });
  /* ---- menu: keep days + clear history ---- */
  function menu(open) {
    var m = $('menu'); m.hidden = open === undefined ? !m.hidden : !open;
    $('btn-menu').setAttribute('aria-expanded', m.hidden ? 'false' : 'true');
    if (!m.hidden) {
      Array.prototype.forEach.call(m.querySelectorAll('[data-keep]'), function (b) { b.classList.toggle('on', +b.getAttribute('data-keep') === LLStore.keep()); });
      LLHist.count().then(function (n) { $('menu-count').textContent = n + ' saved point' + (n === 1 ? '' : 's') + ' on this device'; });
    }
  }
  $('btn-menu').addEventListener('click', function (e) { e.stopPropagation(); menu(); });
  document.addEventListener('click', function (e) { if (!$('menu').hidden && !e.target.closest('#menu') && !e.target.closest('#btn-menu')) menu(false); });
  $('menu').addEventListener('click', function (e) {
    var b = e.target.closest('[data-keep]');
    if (b) { LLStore.setKeep(+b.getAttribute('data-keep')); LLHist.prune().then(function () { menu(true); showKnown(); if (LLMap.selected()) loadTrail(); }); return; }
    if (e.target.closest('#m-clear')) { menu(false); confirmClear(); }
  });
  function confirmClear() {
    var d = $('dlg'); d.hidden = false; $('dlg-no').focus();
  }
  function closeDlg() { $('dlg').hidden = true; }
  $('dlg-no').addEventListener('click', closeDlg);
  $('dlg').addEventListener('click', function (e) { if (e.target === $('dlg')) closeDlg(); });
  $('dlg-yes').addEventListener('click', function () {
    closeDlg();
    LLHist.clear().then(function () {
      var devs = LLMap.devices();
      Object.keys(devs).forEach(function (k) { if (LLMap.isOff(devs[k])) LLMap.drop(k); });   // last spots came from the history we just cleared
      LLMap.setTrail([]); if (LLMap.selected()) loadTrail();
      toast('History cleared on this device');
    });
  });
  addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (!$('dlg').hidden) closeDlg(); else if (!$('menu').hidden) menu(false); else if (LLMap.selected()) LLMap.select(''); }
  });
  var toastT = 0;
  function toast(t) { var el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 2500); }
  /* ---- peer ---- */
  LLPeer.on('status', status);
  LLPeer.on('signal', function (m, from) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'pos') { var k = keyOf(m, from); if (!k || k === ME) return; peers[from] = k; seen(k, m, false); }
    // legacy (LL1.1): else if (m.k === 'off') LLMap.drop(from);
    else if (m.k === 'off') { var k2 = keyOf(m, from); if (k2) LLMap.offline(k2); }
    else if (m.k === 'srv') srvOn(from, m);
    else if (m.k === 'hist') onHist(m, from);
  });
  LLPeer.on('roster', function (list) {
    var ids = {}; (list || []).forEach(function (d) { ids[d.id] = 1; });
    Object.keys(peers).forEach(function (pid) { if (!ids[pid]) { LLMap.offline(peers[pid]); delete peers[pid]; } });
    if (srv && !ids[srv]) srvOff();
    var p = pos(); if (p) LLPeer.send(p);
  });
  LLPeer.on('online', function (on) { if (!on) srvOff(); });
  LLPeer.provide(function () { return pos() || { k: 'none' }; });
  $('share').addEventListener('click', function () {
    if (!code) { $('code-box').hidden = false; $('code-in').focus(); return; }
    var on = !LLGeo.on(); denied = false; LLStore.setShare(on); setShare(on);
  });
  $('btn-list').addEventListener('click', function () { var s = $('sheet'); s.hidden = !s.hidden; this.setAttribute('aria-expanded', s.hidden ? 'false' : 'true'); LLMap.resize(); });
  $('btn-code').addEventListener('click', function () { $('code-box').hidden = !$('code-box').hidden; $('code-in').focus(); LLMap.resize(); });
  $('code-go').addEventListener('click', function () { go($('code-in').value.trim()); });
  addEventListener('pagehide', function () { if (LLGeo.on()) { LLPeer.send({ k: 'off', dev: ME }); LLGeo.stop(); } });
  $('me-name').textContent = LLStore.name();
  LLMap.init($('map'));
  LLHist.prune().then(showKnown);
  setInterval(function () { LLHist.prune(); }, 3600000);   // hourly retention
  setTimeout(function () { var c = urlCode() || meshCode() || LLStore.code(); if (ok(c)) go(c); else go(''); }, inHubDelay());
  function inHubDelay() { return window.parent !== window ? 400 : 0; }
  /* test hooks */
  window.LLApp = { VERSION: LLStore.VERSION, me: function () { return ME; }, fix: onFix, loadTrail: loadTrail, showKnown: showKnown, sync: sync,
    srv: function () { return srv; }, confirmClear: confirmClear, rangeFrom: rangeFrom, lastSync: null };
})();
