/* Intercom IC5 — getting your attention (mirrors Telephone TP6/TP7). A web page can't raise its own window, so:
   1. a system Notification when the page is hidden or its host frame isn't visible / focused:
      "🔔 <who> is calling" for a talk request that waits for Accept / Decline (IC3 public-mesh ask), tag 'ic-call';
      "🔊 <who> is talking" for a talk that is already playing, tag 'ic-talk'. Click → focus + Talk screen.
      Closed when the request is answered / declined / timed out, or the talk ends. Never asks permission by itself.
   2. inside a host only, to window.parent: {sharedLink:'attention', app:'intercom', kind:'call', title, urgent:true, from, fav?}
      while a request waits, {sharedLink:'attention', app:'intercom', kind:'call-end'} when it stops.
      The host's {sharedLink:'attention-reply', app:'intercom', kind:'call', action:'answer'|'decline'} (from window.parent
      only, while a request waits) goes through the same Accept / Decline path as the in-app dialog.
   Setting: intercom-settings-v1 callNotify (true by default; works only once permission is 'granted'), notifyHinted. */
(function () {
  'use strict';
  var inHub = window.parent !== window, ringing = null, notes = {}, hooks = {};
  function supported() { try { return typeof Notification !== 'undefined'; } catch (_) { return false; } }
  function perm() { try { return supported() ? Notification.permission : 'unsupported'; } catch (_) { return 'unsupported'; } }
  function away() {
    try { if (document.hidden) return true; } catch (_) { /* */ }
    if (!inHub) return false;
    try { if (window.parent.document.hidden) return true; } catch (_) { /* cross-origin */ }
    try { if (typeof document.hasFocus === 'function' && !document.hasFocus() && window.parent.document && typeof window.parent.document.hasFocus === 'function' && !window.parent.document.hasFocus()) return true; } catch (_) { /* */ }
    try { var fe = window.frameElement; if (fe && (fe.offsetParent === null || fe.hidden)) return true; } catch (_) { /* */ }
    return false;
  }
  function post(m) { if (!inHub) return; try { window.parent.postMessage(m, '*'); } catch (_) { /* */ } }
  function bring() {
    try { window.focus(); } catch (_) { /* */ }
    try { if (inHub) window.parent.focus(); } catch (_) { /* */ }
    try { if (hooks.front) hooks.front(); } catch (_) { /* */ }
  }
  function close(tag) {
    var n = notes[tag]; delete notes[tag];
    try { if (n && n.close) n.close(); } catch (_) { /* */ }
  }
  function notify(tag, title) {
    if (!window.ICSave || ICSave.get('callNotify') === false || perm() !== 'granted' || !away()) return;
    close(tag);
    try {
      var n = new Notification(title, { body: 'Intercom', tag: tag, requireInteraction: tag === 'ic-call', renotify: true, icon: 'intercom_icon.png' });
      n.onclick = function () { bring(); try { n.close(); } catch (_) { /* */ } };
      notes[tag] = n;
    } catch (_) { /* unsupported here */ }
  }
  function hint() {
    if (perm() === 'default' && ICSave.get('callNotify') !== false && !ICSave.get('notifyHinted') && hooks.hint) { ICSave.set('notifyHinted', true); try { hooks.hint(); } catch (_) { /* */ } }
  }
  var A = {
    hooks: hooks, perm: perm, supported: supported, away: away,
    request: function () {
      try { if (!supported()) return Promise.resolve('unsupported'); var p = Notification.requestPermission(); return p && p.then ? p : Promise.resolve(Notification.permission); } catch (_) { return Promise.resolve(perm()); }
    },
    ring: function (a) {   // a = {id, name, fav}: a talk request waiting for Accept / Decline
      if (ringing) A.ringEnd();
      var who = (a && a.name) || 'Someone', title = '🔔 ' + who + ' is calling';
      ringing = { id: a && a.id };
      var msg = { sharedLink: 'attention', app: 'intercom', kind: 'call', title: title, urgent: true, from: who };
      if (a && a.fav) msg.fav = true;
      post(msg); notify('ic-call', title); hint();
    },
    ringEnd: function () {
      if (!ringing) return;
      ringing = null; close('ic-call');
      post({ sharedLink: 'attention', app: 'intercom', kind: 'call-end' });
    },
    ringing: function () { return !!ringing; },
    heard: function (t) { notify('ic-talk', '🔊 ' + ((t && t.name) || 'Someone') + ' is talking'); hint(); },
    quiet: function () { close('ic-talk'); }   // nobody talking any more
  };
  window.addEventListener('message', function (e) {
    var d = e && e.data;
    if (!inHub || !d || e.source !== window.parent || d.sharedLink !== 'attention-reply' || d.app !== 'intercom' || d.kind !== 'call') return;
    if ((d.action !== 'answer' && d.action !== 'decline') || !ringing) return;
    if (d.action === 'answer') { try { if (hooks.front) hooks.front(); } catch (_) { /* */ } }
    if (hooks.action) hooks.action(d.action);
  });
  window.ICAlert = A;
})();
