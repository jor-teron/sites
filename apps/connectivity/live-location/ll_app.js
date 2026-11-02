/* Live Location LL1 — glue: private mesh code, share toggle, peer messages.
   Code order: #code=/?hub= in URL, the Hub's HubMeshLink private code, last code ('live-location-settings-v1'), else the code box.
   Public 00000 is refused (location is private). Messages over LLPeer.send: {k:'pos', lat, lon, acc, at, name} and {k:'off'}.
   New devices get our latest position via LLPeer.provide (lobby) and on every roster change we re-send. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var PUB = '00000', code = '', started = false, lastFix = null, ME = 'me';
  function ok(c) { c = String(c || ''); return /^\d{5}$/.test(c) && c !== PUB ? c : ''; }
  function urlCode() { var m = (location.hash + '&' + location.search).match(/(?:code|hub|join)=(\d{5})/); return m ? m[1] : ''; }
  function meshCode() {
    try { var h = window.parent !== window && window.parent.HubMeshLink; if (h && h.isPrivate && h.isPrivate()) return ok(h.privateCode()); } catch (_) { /* */ }
    return '';
  }
  function status(t) { $('status').textContent = t; }
  function go(c) {
    c = ok(c); if (!c) { status('Private code needed'); $('code-box').hidden = false; return; }
    if (started && c === code) return;
    if (started) LLPeer.stop();
    started = true; code = c; LLStore.setCode(c); $('code-box').hidden = true; $('btn-code').textContent = c;
    LLPeer.start(c).catch(function () { status('PeerJS could not load (offline?)'); });
  }
  function pos() { return lastFix ? { k: 'pos', lat: lastFix.lat, lon: lastFix.lon, acc: lastFix.acc, at: lastFix.at, name: LLStore.name() } : null; }
  function setShare(on) {
    $('share').classList.toggle('on', on); $('share').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('share-lbl').textContent = on ? 'Sharing my location' : 'Share my location';
    $('geo-note').hidden = true;
    if (on) {
      LLGeo.start(function (f) { lastFix = f; LLMap.put(ME, pos(), true); LLPeer.send(pos()); },
        function (msg) { $('geo-note').textContent = msg; $('geo-note').hidden = false; });
    } else {
      LLGeo.stop(); lastFix = null; LLMap.drop(ME); LLPeer.send({ k: 'off' });
    }
  }
  LLPeer.on('status', status);
  LLPeer.on('signal', function (m, from) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'pos') LLMap.put(from, m, false); else if (m.k === 'off') LLMap.drop(from);
  });
  LLPeer.on('roster', function () { var p = pos(); if (p) LLPeer.send(p); });
  LLPeer.provide(function () { return pos() || { k: 'none' }; });
  $('share').addEventListener('click', function () { setShare(!LLGeo.on()); });
  $('btn-code').addEventListener('click', function () { $('code-box').hidden = !$('code-box').hidden; $('code-in').focus(); });
  $('code-go').addEventListener('click', function () { go($('code-in').value.trim()); });
  addEventListener('pagehide', function () { if (LLGeo.on()) { LLPeer.send({ k: 'off' }); LLGeo.stop(); } });
  $('me-name').textContent = LLStore.name();
  LLMap.init($('map'));
  setTimeout(function () { var c = urlCode() || meshCode() || LLStore.code(); if (ok(c)) go(c); else go(''); }, inHubDelay());
  function inHubDelay() { return window.parent !== window ? 400 : 0; }
})();
