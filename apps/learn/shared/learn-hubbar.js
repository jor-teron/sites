/*
 * apps/learn/shared/learn-hubbar.js  (TB1)  Learn apps: move the in-page top row (.lrn-head) into the Hub window title bar.
 * App side of the Hub H49 contract (Hub side: hub/link/hub-gamebar.js; Office twin: apps/office/shared/office-hubbar.js).
 *   LearnHubBar.attach(head, opts)   head = the .lrn-head element; opts (all optional):
 *     tabs:    selector of the mode group whose buttons become title-bar tabs (default '.lrn-mode')
 *     buttons: selector of extra head buttons sent as quick buttons (default: none). The app name (h1) and the
 *              version label are never sent: the Hub window already shows the app name.
 * Mirroring: tab id = the button's data-m / data-mode / data-tab (or its index); a hidden tab group sends no tabs; hidden buttons
 *   are left out. A title-bar-only button: style="display:none" in the page, toggled with its hidden attribute (Learn kit Back).
 *   Active tab = the button with aria-pressed="true".
 * A title-bar click calls .click() on the matching in-page button, so the app's own handlers run unchanged.
 * The row changing (mode switch, buttons enabled / disabled) is watched and sent as 'update' (or 'set' if the list changed).
 * Messages: app -> hub window.parent.postMessage({hubTitleBar:{v:1, op, ...}}, origin) ('*' on file://, origin 'null');
 *           hub -> app {hubTitleBarHello:{v:1}} (send 'set' again after every hello) and {hubTitleBarClick:{v:1, kind, id}}.
 * Only messages with event.source === window.parent and event.origin === location.origin are used.
 * The in-page row stays until a hello arrives: standalone pages and Phone mode never get one, so they keep it.
 * Classic script, no modules, works from file://.
 */
var LearnHubBar = (function () {
  var V = 1, MAX_B = 8, MAX_T = 10;
  var IN_FRAME = (function () { try { return window.parent && window.parent !== window; } catch (e) { return true; } })();
  var api = { linked: false, inFrame: IN_FRAME };
  function str(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); }
  function post(body) {
    if (!IN_FRAME) return;
    body.v = V;
    var target = (location.origin && location.origin !== 'null') ? location.origin : '*';
    try { window.parent.postMessage({ hubTitleBar: body }, target); } catch (e) { /* parent gone */ }
  }
  api.attach = function (head, opts) {
    if (!head || !IN_FRAME) return null;
    opts = opts || {};
    var tabSel = opts.tabs || '.lrn-mode', btnSel = opts.buttons || '', last = '', lastActive = null, queued = false;
    function tabEls() { var g = head.querySelector(tabSel); return g && !g.hidden ? Array.prototype.slice.call(g.querySelectorAll('button')).slice(0, MAX_T) : []; }
    function btnEls() { return btnSel ? Array.prototype.slice.call(head.querySelectorAll(btnSel)).filter(function (b) { return !b.closest(tabSel); }).slice(0, MAX_B) : []; }
    function tabId(b, i) { return str(b.dataset.m || b.dataset.mode || b.dataset.tab || 't' + i, 32); }
    function btnId(b, i) { return str(b.dataset.hb || b.id || 'b' + i, 32); }
    function snap() {
      var active = '', tabs = tabEls().map(function (b, i) { var id = tabId(b, i); if (b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-selected') === 'true') active = id; return { id: id, label: str(b.textContent, 20) }; });
      var buttons = btnEls().map(function (b, i) {
        return b.hidden ? null : { id: btnId(b, i), label: str(b.getAttribute('aria-label') || b.textContent, 24), enabled: !b.disabled, title: str(b.title || b.textContent, 60) };
      }).filter(Boolean);
      return { tabs: tabs, buttons: buttons, activeTab: active };
    }
    function send(force) {
      queued = false;
      if (!api.linked) return;
      var s = snap(), shape = JSON.stringify([s.tabs, s.buttons.map(function (b) { return [b.id, b.label]; })]);
      if (force || shape !== last) { post({ op: 'set', buttons: s.buttons, tabs: s.tabs, activeTab: s.activeTab }); last = shape; }
      else if (s.activeTab !== lastActive || s.buttons.length) post({ op: 'update', activeTab: s.activeTab, buttons: s.buttons });
      lastActive = s.activeTab;
    }
    function later() { if (!queued) { queued = true; setTimeout(function () { send(false); }, 0); } }
    window.addEventListener('message', function (e) {
      if (e.source !== window.parent || e.origin !== location.origin) return;
      var d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.hubTitleBarHello && d.hubTitleBarHello.v === V) {
        api.linked = true;
        document.body.classList.add('hub-titlebar');
        head.hidden = true;
        send(true);
      } else if (d.hubTitleBarClick && d.hubTitleBarClick.v === V && api.linked && typeof d.hubTitleBarClick.id === 'string') {
        var c = d.hubTitleBarClick, list = c.kind === 'tab' ? tabEls() : c.kind === 'button' ? btnEls() : [];
        var ix = c.kind === 'tab' ? tabId : btnId;
        for (var i = 0; i < list.length; i++) if (ix(list[i], i) === c.id) { if (!list[i].disabled) list[i].click(); break; }
      }
    });
    if (window.MutationObserver) new MutationObserver(later).observe(head, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'disabled', 'hidden'] });
    return { resend: function () { send(true); } };
  };
  return api;
})();
