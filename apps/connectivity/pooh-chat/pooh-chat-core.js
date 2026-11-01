/*
  Pooh Chat — pure logic (pooh-chat-core.js, PC1/PC2). No DOM; also loaded by the node test harness.
  - c5(code): 5 digits only (FC5/H83; old 4-digit codes are rejected).
  - pickCode(o): URL code → Hub private mesh code (parent.HubMeshLink) → SharedLink.LOBBY → '00000'.
  - hasRelay(win): true when the parent page runs the Hub chat relay (parent.SharedChat.send exists,
    same-origin). Then Pooh Chat posts {sharedLink:'chat', text} and opens no peer of its own.
  - merge(list, msgs): add by id (dedupe), sort by ts, keep the last MAX (200).
  - backfill(list): the last BACK (50) messages sent to a peer that just joined.
  - rows(list, isMine): bubble side ('me' | 'them') + showName only when the sender changes.
  - dot(state): 'on' | 'wait' | 'off' from a status word.
*/
(function (root) {
  'use strict';
  var MAX = 200, BACK = 50;
  function c5(c) { c = String(c == null ? '' : c); return /^\d{5}$/.test(c) ? c : ''; }
  function urlCode(hash, search) {
    var s = String(hash || '') + '&' + String(search || '');
    var m = s.match(/[#?&](?:code|hub)=(\d+)/);
    return m ? c5(m[1]) : '';
  }
  function lobbyOf(wins) {
    for (var i = 0; i < wins.length; i++) {
      try { var S = wins[i] && wins[i].SharedLink; if (S && c5(S.LOBBY)) return String(S.LOBBY); } catch (_) { /* cross-origin */ }
    }
    return '00000';
  }
  function meshCode(par) {
    try { var h = par && par.HubMeshLink; if (h && typeof h.isPrivate === 'function' && h.isPrivate()) return c5(h.privateCode()); } catch (_) { /* */ }
    return '';
  }
  /* o = {hash, search, parent (or null standalone), wins:[self, parent, top]} */
  function pickCode(o) {
    return urlCode(o.hash, o.search) || meshCode(o.parent) || lobbyOf(o.wins || []);
  }
  function hasRelay(win) {
    try { return !!(win && win.parent && win.parent !== win && win.parent.SharedChat && typeof win.parent.SharedChat.send === 'function'); } catch (_) { return false; }
  }
  function clean(m) {
    if (!m || typeof m !== 'object' || !m.id || typeof m.text !== 'string' || !m.text.trim()) return null;
    return { type: 'chat', id: String(m.id).slice(0, 80), from: String(m.from || '').slice(0, 64), name: String(m.name || 'Device').slice(0, 40), text: m.text.slice(0, 2000), ts: Number(m.ts) || Date.now() };
  }
  function merge(list, msgs) {
    var seen = {}, out = [], added = [];
    (list || []).forEach(function (m) { if (m && m.id && !seen[m.id]) { seen[m.id] = 1; out.push(m); } });
    (msgs || []).forEach(function (x) { var m = clean(x); if (m && !seen[m.id]) { seen[m.id] = 1; out.push(m); added.push(m); } });
    if (added.length) out.sort(function (a, b) { return a.ts - b.ts; });
    return { list: out.slice(-MAX), added: added };
  }
  function backfill(list) { return (list || []).slice(-BACK); }
  function rows(list, isMine) {
    var prev = null;
    return (list || []).map(function (m) {
      var mine = !!isMine(m), key = mine ? '\u0000me' : (m.from || m.name);
      var r = { m: m, side: mine ? 'me' : 'them', showName: !mine && key !== prev };
      prev = key; return r;
    });
  }
  function dot(s) {
    s = String(s || '');
    if (/^(online|connected|hub)/i.test(s)) return 'on';
    if (/offline|not connected|could not|fail|disconnected/i.test(s)) return 'off';
    return 'wait';
  }
  var api = { MAX: MAX, BACK: BACK, c5: c5, urlCode: urlCode, lobbyOf: lobbyOf, meshCode: meshCode, pickCode: pickCode,
    hasRelay: hasRelay, clean: clean, merge: merge, backfill: backfill, rows: rows, dot: dot };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PoohCore = api;
})(this);
