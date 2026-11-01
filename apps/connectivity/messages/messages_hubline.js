/* Messages CX1 — adapter for the Hub's shared line, window.top.HubLine (H91). Every HubLine call lives here, so an API
   rename is a one-place fix. Absent / cross-origin / throws → has() is false and Messages uses only its own PeerJS lobby.
   Used: send(num, payload) → 'delivered'|'queued'|'offline'; onMessage(fn) → off; takeInbox('msg') → [entries] (clears);
   myNumber(); CX1.1 onDelivered(fn → {id, to}) → off (a 'queued' send later acked). 'queued' = online but no ack in 8 s. Text messages only: files and read receipts stay on Messages' own P2P link.
   Hub message / inbox shape {kind:'msg', k:'msg', id, from, name, text, at} ⇄ Messages {t:'msg', id, from, name, text, ts}. */
(function () {
  'use strict';
  function line() { try { var h = window.top && window.top.HubLine; return h && typeof h.send === 'function' ? h : null; } catch (_) { return null; } }
  function toMs(e) { return e && (e.kind === 'msg' || e.k === 'msg' || (e.kind == null && e.k == null)) ? { t: 'msg', id: e.id, from: String(e.from || ''), name: e.name, text: e.text, ts: +e.at || Date.now() } : null; }
  var offs = [];
  window.MSLine = {
    has: function () { return !!line(); },
    myNumber: function () { try { var h = line(); return h && h.myNumber ? String(h.myNumber() || '') : ''; } catch (_) { return ''; } },
    /* resolves 'delivered' | 'queued' | 'offline' | 'error' */
    send: function (num, m) {
      var h = line(); if (!h) return Promise.resolve('error');
      try { return Promise.resolve(h.send(num, { k: 'msg', id: m.id, from: m.from, name: m.name, text: m.text, at: m.ts })).then(function (r) { return r === 'delivered' || r === 'queued' || r === 'offline' ? r : 'error'; }, function () { return 'error'; }); }
      catch (_) { return Promise.resolve('error'); }
    },
    onMessage: function (fn) {
      var h = line(); if (!h || typeof h.onMessage !== 'function') return;
      try { var off = h.onMessage(function (e) { var m = toMs(e); if (m) fn(m); }); if (typeof off === 'function') offs.push(off); } catch (_) { /* */ }
    },
    onDelivered: function (fn) {
      var h = line(); if (!h || typeof h.onDelivered !== 'function') return;
      try { var off = h.onDelivered(function (d) { if (d && d.id) fn(String(d.id), String(d.to || '')); }); if (typeof off === 'function') offs.push(off); } catch (_) { /* */ }
    },
    take: function () { var h = line(); if (!h || typeof h.takeInbox !== 'function') return []; try { return (h.takeInbox('msg') || []).map(toMs).filter(Boolean); } catch (_) { return []; } }
  };
  addEventListener('pagehide', function () { offs.forEach(function (f) { try { f(); } catch (_) { /* */ } }); offs = []; });
})();
