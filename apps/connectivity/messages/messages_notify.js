/* Messages MS2 — incoming message alerts + Hub Do Not Disturb (Telephone TP7 pattern).
   DND: window.parent.HubDnd (isOn / on('change') / off('change')) inside a host, else localStorage 'sites-hub.dnd' === '1'.
   While DND is on nothing alerts (messages are still stored and the unread badge still counts).
   Alert when the page is hidden: Hub card window.top.HubNotify.notice() inside the Hub, else a browser Notification
   (tag 'ms-<num>', only once permission is 'granted'). Setting: messages-settings-v1 notify (true by default). */
(function () {
  'use strict';
  var K_ON = 'sites-hub.dnd', fns = [], inHub = window.parent !== window;
  function hub() { try { var h = window.parent !== window && window.parent.HubDnd; return h && typeof h.isOn === 'function' ? h : null; } catch (_) { return null; } }
  function dnd() { var h = hub(); if (h) { try { return !!h.isOn(); } catch (_) { /* fall back */ } } try { return localStorage.getItem(K_ON) === '1'; } catch (_) { return false; } }
  function fire() { var on = dnd(); fns.slice().forEach(function (f) { try { f(on); } catch (_) { /* */ } }); }
  var h0 = hub();
  if (h0) { try { h0.on('change', fire); addEventListener('pagehide', function () { try { h0.off('change', fire); } catch (_) { /* */ } }); } catch (_) { /* */ } }
  addEventListener('storage', function (e) { if (!e || e.key === null || e.key === K_ON) fire(); });
  function perm() { try { return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'; } catch (_) { return 'unsupported'; } }
  function ask() { try { if (perm() !== 'default') return Promise.resolve(perm()); var p = Notification.requestPermission(); return p && p.then ? p : Promise.resolve(perm()); } catch (_) { return Promise.resolve(perm()); } }
  function hubCard(o) { if (!inHub) return false; try { window.top.HubNotify.notice(o); return true; } catch (_) { return false; } }
  /* incoming message: who = display name, num, text; onOpen() brings the conversation up */
  function incoming(who, num, text, onOpen) {
    if (dnd() || !window.MSStore || MSStore.get('notify') === false || !document.hidden) return false;
    var body = String(text).slice(0, 120);
    if (hubCard({ icon: '💬', title: 'Messages · ' + who, text: body, timeoutMs: 10000 })) return true;
    if (perm() !== 'granted') return false;
    try { var n = new Notification('💬 ' + who, { body: body, tag: 'ms-' + num, renotify: true, icon: 'messages_icon.png' });
      n.onclick = function () { try { window.focus(); } catch (_) { /* */ } try { onOpen && onOpen(); } catch (_) { /* */ } try { n.close(); } catch (_) { /* */ } }; return true; } catch (_) { return false; }
  }
  window.MSNotify = { dnd: dnd, onDnd: function (f) { if (typeof f === 'function') fns.push(f); }, incoming: incoming, perm: perm, ask: ask, hubCard: hubCard, inHub: inHub, _fire: fire };
})();
