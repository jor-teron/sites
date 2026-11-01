/* Telephone CX1 — adapter for the Hub's shared line, window.top.HubLine (H91). Every HubLine call lives here.
   Absent / cross-origin → has() false and Telephone works exactly as before (own lobby only).
   Outgoing: when the number is not in Telephone's own roster (their Telephone is closed), ring(num) → HubLine.call(num,{video:false})
     → {callId, accepted}. Accepted = the Hub opened their Telephone at #call=<callId>&from=<my number>; the caller then dials
     over Telephone's own lobby as soon as that number shows up (media stays P2P between the two Telephones).
   Incoming: #call=<callId>&from=<num> → expect(from): the next ring from that number within 60 s is answered by itself.
   CX1.1: accepted:false may carry reason (shown as is). Missed: takeInbox('missed') → {kind:'missed', from, name, at, video, callId} added to the call log as missed. */
(function () {
  'use strict';
  function line() { try { var h = window.top && window.top.HubLine; return h && typeof h.call === 'function' ? h : null; } catch (_) { return null; } }
  var want = null;   // {from, until}
  function parse() {
    var m = /[#&?]call=([^&]+)/.exec(location.hash), f = /[#&?]from=(\d{5})(?!\d)/.exec(location.hash);
    if (m && f) want = { from: f[1], callId: decodeURIComponent(m[1]), until: Date.now() + 60000 };
  }
  parse(); addEventListener('hashchange', parse);
  window.TPLine = {
    has: function () { return !!line(); },
    ring: function (num) {
      var h = line(); if (!h) return Promise.resolve({ accepted: false });
      try { return Promise.resolve(h.call(num, { video: false })).then(function (r) { return { accepted: !!(r && r.accepted), callId: r && r.callId, reason: r && r.reason ? String(r.reason).slice(0, 120) : '' }; }, function () { return { accepted: false }; }); }
      catch (_) { return Promise.resolve({ accepted: false }); }
    },
    /* true once when a ring from num is the one the Hub's Answer was for */
    expected: function (num) { if (want && want.from === String(num) && Date.now() < want.until) { want = null; return true; } return false; },
    takeMissed: function () {
      var h = line(), out = []; if (!h || typeof h.takeInbox !== 'function') return out;
      ['missed'].forEach(function (k) { try { (h.takeInbox(k) || []).forEach(function (e) { if (e && /^\d{5}$/.test(String(e.from))) out.push({ num: String(e.from), name: e.name || '', at: +e.at || Date.now() }); }); } catch (_) { /* */ } });
      return out;
    }
  };
})();
