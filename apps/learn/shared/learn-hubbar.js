/*
 * apps/learn/shared/learn-hubbar.js  (TB1, BG-3a)  Learn apps: move the in-page top row (.lrn-head) into the Hub window title bar.
 * App side of the Hub H49 contract (Hub side: hub/link/hub-gamebar.js; Office twin: apps/office/shared/office-hubbar.js).
 *   LearnHubBar.attach(head, opts)   head = the .lrn-head element; opts (all optional):
 *     tabs:    selector of the mode group whose buttons become title-bar tabs (default '.lrn-mode')
 *              OR an array of {id, label, short, icon, hash, controls} to RENDER small tabs inside the bar.
 *              An array is the BG-3a option; a string or omitted tabs keeps the old selector behaviour, so
 *              apps that do not pass an array look and behave exactly as before.
 *     active:  id of the tab to select first (array form). With hash routing, the current location.hash wins.
 *     onChange:function(id, tab) after a user (or hash) change (array form; not called for the first paint).
 *     hash:    true to drive location.hash from tab.hash (or from a tab that sets hash: ''). If omitted, hash
 *              routing turns on automatically when any tab has a hash property.
 *     tabLabel:aria-label for the tab list (array form; default 'Sections').
 *     buttons: selector of extra head buttons sent as quick buttons (default: none). The app name (h1) and the
 *              version label are never sent: the Hub window already shows the app name.
 * Mirroring: tab id = the button's data-m / data-mode / data-tab (or its index); a hidden tab group sends no tabs; hidden buttons
 *   are left out. A title-bar-only button: style="display:none" in the page, toggled with its hidden attribute (Learn kit Back).
 *   Active tab = the button with aria-pressed="true" or aria-selected="true". Array-form labels sent to the Hub use data-label
 *   when present, so a short on-screen label does not change the Hub label.
 * A title-bar click calls .click() on the matching in-page button, so the app's own handlers run unchanged.
 * The row changing (mode switch, buttons enabled / disabled) is watched and sent as 'update' (or 'set' if the list changed).
 * Messages: app -> hub window.parent.postMessage({hubTitleBar:{v:1, op, ...}}, origin) ('*' on file://, origin 'null');
 *           hub -> app {hubTitleBarHello:{v:1}} (send 'set' again after every hello) and {hubTitleBarClick:{v:1, kind, id}}.
 * Only messages with event.source === window.parent and event.origin === location.origin are used.
 * The in-page row stays until a hello arrives: standalone pages and Phone mode never get one, so they keep it.
 * Array-form tabs are painted into the in-page bar even when standalone, so the tabs are visible outside a Hub window.
 * Classic script, no modules, works from file://.
 * Helpers (pure, for tests and apps): normHash, tabHash, tabFromHash, tabCaption, tabSelector.
 */
var LearnHubBar = (function () {
  var V = 1, MAX_B = 8, MAX_T = 10;
  var IN_FRAME = (function () { try { return window.parent && window.parent !== window; } catch (e) { return true; } })();
  var api = { linked: false, inFrame: IN_FRAME };
  function str(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); }
  function declTabs(opts) {
    return opts && Array.isArray(opts.tabs) && opts.tabs.length ? opts.tabs.slice(0, MAX_T) : null;
  }
  function tabSelector(opts) {
    if (declTabs(opts)) return '.lrn-hubtabs';
    return (opts && typeof opts.tabs === 'string' && opts.tabs) ? opts.tabs : '.lrn-mode';
  }
  function normHash(h) {
    h = String(h == null ? '' : h).trim();
    if (h === '' || h === '#') return '';
    return h.charAt(0) === '#' ? h : '#' + h;
  }
  function tabHash(t) {
    if (!t) return '';
    if (t.hash != null) return normHash(t.hash);
    return '';
  }
  function tabFromHash(tabs, hash) {
    if (!tabs || !tabs.length) return null;
    var h = normHash(hash), i, t, fallback = tabs[0];
    for (i = 0; i < tabs.length; i++) {
      t = tabs[i];
      if (!t) continue;
      if (tabHash(t) === h) return t;
      if (tabHash(t) === '') fallback = t;
    }
    return fallback;
  }
  function tabCaption(t, compact) {
    if (!t) return '';
    if (compact) return String(t.short || t.icon || t.label || t.id || '');
    return String(t.label || t.short || t.id || '');
  }
  function usesHash(opts, tabs) {
    if (opts && opts.hash === true) return true;
    if (opts && opts.hash === false) return false;
    if (!tabs) return false;
    for (var i = 0; i < tabs.length; i++) if (tabs[i] && Object.prototype.hasOwnProperty.call(tabs[i], 'hash')) return true;
    return false;
  }
  function applyHash(hash) {
    var next = normHash(hash), cur = normHash(typeof location !== 'undefined' ? location.hash : '');
    if (next === cur) return;
    if (next) { location.hash = next; return; }
    var url = location.pathname + (location.search || '');
    try { history.pushState(null, '', url); } catch (e) { location.hash = ''; return; }
    var ev;
    try { ev = new HashChangeEvent('hashchange'); } catch (e2) { ev = document.createEvent('Event'); ev.initEvent('hashchange', false, false); }
    window.dispatchEvent(ev);
  }
  function paintTabs(head, tabs, opts) {
    opts = opts || {};
    var hashOn = usesHash(opts, tabs);
    var list = document.createElement('div');
    list.className = 'lrn-hubtabs';
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', str(opts.tabLabel || 'Sections', 60));
    if ((' ' + (head.className || '') + ' ').indexOf(' lrn-head-tabs ') < 0) {
      head.className = (head.className ? head.className + ' ' : '') + 'lrn-head-tabs';
    }
    var current = '', buttons = [];
    function find(id) {
      for (var i = 0; i < tabs.length; i++) if (tabs[i] && String(tabs[i].id) === String(id)) return tabs[i];
      return null;
    }
    function paintActive(id) {
      current = String(id);
      for (var i = 0; i < buttons.length; i++) {
        var on = buttons[i].getAttribute('data-tab') === current;
        buttons[i].setAttribute('aria-selected', on ? 'true' : 'false');
        buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        buttons[i].tabIndex = on ? 0 : -1;
      }
    }
    function activate(id, reason) {
      var tab = find(id) || tabs[0];
      if (!tab) return;
      id = String(tab.id);
      if (id === current && reason !== 'set') return;
      paintActive(id);
      if (hashOn && reason !== 'hash' && reason !== 'set') applyHash(tabHash(tab));
      if (typeof opts.onChange === 'function' && reason !== 'set') opts.onChange(id, tab);
    }
    function onKey(e) {
      var n = buttons.length, k = e.key, ix = -1, i, next;
      for (i = 0; i < n; i++) if (buttons[i] === e.currentTarget) ix = i;
      if (ix < 0) return;
      next = ix;
      if (k === 'ArrowRight' || k === 'ArrowDown') next = (ix + 1) % n;
      else if (k === 'ArrowLeft' || k === 'ArrowUp') next = (ix - 1 + n) % n;
      else if (k === 'Home') next = 0;
      else if (k === 'End') next = n - 1;
      else return;
      e.preventDefault();
      buttons[next].focus();
      activate(buttons[next].getAttribute('data-tab'), 'key');
    }
    for (var i = 0; i < tabs.length; i++) {
      (function (t) {
        if (!t || t.id == null || t.id === '') return;
        var btn = document.createElement('button'), full, short, label;
        btn.type = 'button';
        btn.setAttribute('role', 'tab');
        btn.setAttribute('data-tab', str(t.id, 32));
        label = tabCaption(t, false);
        btn.setAttribute('data-label', str(label, 20));
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
        if (t.controls) btn.setAttribute('aria-controls', String(t.controls));
        full = document.createElement('span');
        full.className = 'lrn-hubtab-full';
        full.textContent = label;
        short = document.createElement('span');
        short.className = 'lrn-hubtab-short';
        short.setAttribute('aria-hidden', 'true');
        short.textContent = tabCaption(t, true);
        btn.appendChild(full);
        btn.appendChild(short);
        btn.addEventListener('click', function () { activate(t.id, 'click'); });
        btn.addEventListener('keydown', onKey);
        list.appendChild(btn);
        buttons.push(btn);
      })(tabs[i]);
    }
    var h1 = head.querySelector && head.querySelector('h1');
    if (h1 && h1.nextSibling) head.insertBefore(list, h1.nextSibling);
    else if (h1) head.appendChild(list);
    else if (head.firstChild) head.insertBefore(list, head.firstChild);
    else head.appendChild(list);
    var start = opts.active;
    if (!start && hashOn) {
      var fromH = tabFromHash(tabs, typeof location !== 'undefined' ? location.hash : '');
      start = fromH && fromH.id;
    }
    if (!start && tabs[0]) start = tabs[0].id;
    activate(start, 'set');
    if (hashOn) {
      window.addEventListener('hashchange', function () {
        var t = tabFromHash(tabs, location.hash);
        if (t) activate(t.id, 'hash');
      });
    }
    return { setActive: function (id) { activate(id, 'set'); }, tabList: list };
  }
  function post(body) {
    if (!IN_FRAME) return;
    body.v = V;
    var target = (location.origin && location.origin !== 'null') ? location.origin : '*';
    try { window.parent.postMessage({ hubTitleBar: body }, target); } catch (e) { /* parent gone */ }
  }
  api.normHash = normHash;
  api.tabHash = tabHash;
  api.tabFromHash = tabFromHash;
  api.tabCaption = tabCaption;
  api.tabSelector = tabSelector;
  api.attach = function (head, opts) {
    if (!head) return null;
    opts = opts || {};
    var decls = declTabs(opts), painted = null;
    if (decls) painted = paintTabs(head, decls, opts);
    if (!IN_FRAME) return painted ? { resend: function () {}, setActive: painted.setActive } : null;
    var tabSel = tabSelector(opts), btnSel = opts.buttons || '', last = '', lastActive = null, queued = false;
    function tabEls() { var g = head.querySelector(tabSel); return g && !g.hidden ? Array.prototype.slice.call(g.querySelectorAll('button')).slice(0, MAX_T) : []; }
    function btnEls() { return btnSel ? Array.prototype.slice.call(head.querySelectorAll(btnSel)).filter(function (b) { return !b.closest(tabSel); }).slice(0, MAX_B) : []; }
    function tabId(b, i) { return str(b.dataset.m || b.dataset.mode || b.dataset.tab || 't' + i, 32); }
    function btnId(b, i) { return str(b.dataset.hb || b.id || 'b' + i, 32); }
    function snap() {
      var active = '', tabs = tabEls().map(function (b, i) { var id = tabId(b, i); if (b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-selected') === 'true') active = id; return { id: id, label: str(b.getAttribute('data-label') || b.textContent, 20) }; });
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
    return { resend: function () { send(true); }, setActive: painted ? painted.setActive : function () {} };
  };
  return api;
})();
