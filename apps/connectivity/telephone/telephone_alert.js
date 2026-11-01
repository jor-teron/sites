/* Telephone TP6 — incoming call attention. A web page can't raise its own window, so:
   1. a system Notification "📞 <who> is calling" (tag 'tp-call', requireInteraction, renotify) when the page is hidden or
      its host frame isn't visible / focused; via an existing service worker registration (Answer / Decline actions) when
      one is already there, else a plain new Notification (no actions). Click → focus + bring Telephone forward.
      Closed when the call is answered, declined, missed or ended. Never asks permission by itself (Settings does).
   2. a host hint to window.parent (inside a host only): {sharedLink:'attention', app:'telephone', kind:'call', title, urgent:true}
      when ringing starts and {sharedLink:'attention', app:'telephone', kind:'call-end'} when it stops (unknown hosts ignore it).
   Setting: telephone-settings-v1 callNotify (true by default; it only works once the browser permission is 'granted'). */
(function () {
  'use strict';
  var inHub = window.parent !== window, ringing = null, note = null, hooks = {};
  function supported() { try { return typeof Notification !== 'undefined'; } catch (_) { return false; } }
  function perm() { try { return supported() ? Notification.permission : 'unsupported'; } catch (_) { return 'unsupported'; } }
  function away() {   // hidden tab, or our host frame isn't the one in front
    try { if (document.hidden) return true; } catch (_) { /* */ }
    if (!inHub) return false;
    try { if (window.parent.document.hidden) return true; } catch (_) { /* cross-origin */ }
    try { if (typeof document.hasFocus === 'function' && !document.hasFocus() && window.parent.document && typeof window.parent.document.hasFocus === 'function' && !window.parent.document.hasFocus()) return true; } catch (_) { /* cross-origin */ }
    try { var fe = window.frameElement; if (fe && (fe.offsetParent === null || fe.hidden)) return true; } catch (_) { /* */ }
    return false;
  }
  function post(m) { if (!inHub) return; try { window.parent.postMessage(m, '*'); } catch (_) { /* */ } }
  function bring() {
    try { window.focus(); } catch (_) { /* */ }
    try { if (inHub) window.parent.focus(); } catch (_) { /* */ }
    try { if (hooks.front) hooks.front(); } catch (_) { /* */ }
  }
  function closeNote() {
    var n = note; note = null;
    try { if (n && n.close) n.close(); } catch (_) { /* */ }
    try {   // service worker notifications: close by tag
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(function (r) {
        if (r && r.getNotifications) r.getNotifications({ tag: 'tp-call' }).then(function (l) { l.forEach(function (x) { try { x.close(); } catch (_) { /* */ } }); }, function () { /* */ });
      }, function () { /* */ });
    } catch (_) { /* */ }
  }
  function notify(title, cid) {
    if (!window.TPSave || TPSave.get('callNotify') === false || perm() !== 'granted' || !away()) return;
    var opt = { body: 'Telephone', tag: 'tp-call', requireInteraction: true, renotify: true, icon: 'telephone_icon.png' };
    function plain() {
      if (!ringing || ringing.cid !== cid) return;
      try { var n = new Notification(title, opt); n.onclick = function () { bring(); try { n.close(); } catch (_) { /* */ } }; note = n; } catch (_) { /* unsupported here */ }
    }
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration().then(function (r) {
          if (!ringing || ringing.cid !== cid) return;
          if (r && r.showNotification) {
            var o = Object.assign({ actions: [{ action: 'answer', title: 'Answer' }, { action: 'decline', title: 'Decline' }], data: { app: 'telephone' } }, opt);
            r.showNotification(title, o).catch(plain);
          } else plain();
        }, plain);
      } else plain();
    } catch (_) { plain(); }
  }
  var A = {
    hooks: hooks,   // front(): show the Phone pane / call screen; hint(): first-call hint while permission is 'default'
    perm: perm, supported: supported, away: away,
    request: function () {
      try { if (!supported()) return Promise.resolve('unsupported'); var p = Notification.requestPermission(); return p && p.then ? p : Promise.resolve(Notification.permission); } catch (_) { return Promise.resolve(perm()); }
    },
    update: function (c) {   // call on every TPCall 'state'
      var on = !!(c && c.dir === 'in' && c.state === 'incoming'), cid = c && (c.cid || c.peer || c.num);
      if (on && (!ringing || ringing.cid !== cid)) {
        if (ringing) A.update(null);
        var who = (hooks.who ? hooks.who(c) : '') || c.name || c.num || 'Someone', title = '📞 ' + who + ' is calling';
        ringing = { cid: cid };
        post({ sharedLink: 'attention', app: 'telephone', kind: 'call', title: title, urgent: true });
        notify(title, cid);
        if (perm() === 'default' && TPSave.get('callNotify') !== false && !TPSave.get('notifyHinted') && hooks.hint) { TPSave.set('notifyHinted', true); try { hooks.hint(); } catch (_) { /* */ } }
      } else if (!on && ringing) {
        ringing = null; closeNote();
        post({ sharedLink: 'attention', app: 'telephone', kind: 'call-end' });
      }
    }
  };
  try {   // service worker notification actions (only if some worker relays them as messages)
    if (navigator.serviceWorker && navigator.serviceWorker.addEventListener) navigator.serviceWorker.addEventListener('message', function (e) {
      var d = e && e.data; if (!d || d.app !== 'telephone') return;
      bring(); if (hooks.action) hooks.action(d.action);
    });
  } catch (_) { /* */ }
  window.TPAlert = A;
})();
