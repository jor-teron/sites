/* Web MCP — wm_ui.js: theme, status, live log, and control wiring helpers. MCP1 */
(function (root) {
  'use strict';

  /* Config holds the Hub theme keys and the log cap. */
  var C = root.WM_CONFIG;

  /**
   * Read a localStorage key, returning '' when storage is blocked.
   */
  function lsGet(key) {
    try { return root.localStorage.getItem(key) || ''; } catch (_) { return ''; }
  }

  /**
   * Write a localStorage key, ignoring quota or privacy errors.
   */
  function lsSet(key, value) {
    try { root.localStorage.setItem(key, value); } catch (_) { /* ignore */ }
  }

  /**
   * Resolve 'dark' or 'light' from the Hub keys (read only) or prefers-color-scheme.
   */
  function resolveTheme() {
    var auto = lsGet(C.HUB_THEME_AUTO_KEY) === '1';
    if (!auto) {
      var t = lsGet(C.HUB_THEME_KEY);
      if (t === 'dark' || t === 'light') return t;
    }
    try {
      if (root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch (_) { /* ok */ }
    return 'light';
  }

  /**
   * Apply the resolved theme to <html> without writing any Hub keys.
   */
  function applyTheme() {
    var eff = resolveTheme();
    var el = document.documentElement;
    el.dataset.theme = eff;
    el.classList.toggle('light', eff === 'light');
    el.classList.toggle('dark', eff === 'dark');
    el.style.colorScheme = eff;
    return eff;
  }

  /**
   * Watch the device scheme, Hub storage, hub-prefs messages, and focus for theme changes.
   */
  function bootTheme() {
    applyTheme();
    try {
      var mq = root.matchMedia('(prefers-color-scheme: dark)');
      var handler = function () { applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    } catch (_) { /* ok */ }
    root.addEventListener('storage', function (e) {
      if (!e.key || e.key.indexOf('sites-hub.') === 0) applyTheme();
    });
    root.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'hub-prefs') applyTheme();
    });
    root.addEventListener('focus', applyTheme);
  }

  /**
   * Set the status line text and tone (idle, ok, warn, error, busy).
   */
  function setStatus(text, tone) {
    var el = document.getElementById('status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (tone ? ' ' + tone : '');
  }

  /**
   * Update the folder label and the Allow button's disabled state.
   */
  function setFolder(state, name) {
    var label = document.getElementById('folder-label');
    var allow = document.getElementById('btn-allow');
    var pick = document.getElementById('btn-pick');
    if (state === 'unsupported') {
      if (label) label.textContent = 'Folder access is not available in this browser.';
      if (allow) allow.disabled = true;
      if (pick) pick.disabled = true;
      return;
    }
    if (pick) pick.disabled = false;
    if (state === 'ready') {
      if (label) label.textContent = 'Folder: ' + (name || '(ready)');
      if (allow) allow.disabled = true;
    } else if (state === 'need') {
      if (label) label.textContent = 'Folder saved (' + (name || 'unnamed') + '). Click Allow to grant access again.';
      if (allow) allow.disabled = false;
    } else {
      if (label) label.textContent = 'No folder selected';
      if (allow) allow.disabled = true;
    }
  }

  /**
   * Show or hide the unsupported-browser banner.
   */
  function setUnsupported(on, message) {
    var el = document.getElementById('unsupported');
    if (!el) return;
    if (on) {
      el.hidden = false;
      el.textContent = message || C.UNSUPPORTED_MESSAGE;
    } else {
      el.hidden = true;
      el.textContent = '';
    }
  }

  /**
   * Enable or disable Connect / Disconnect to match the current link state.
   */
  function setLinkButtons(wanted) {
    var c = document.getElementById('btn-connect');
    var d = document.getElementById('btn-disconnect');
    if (c) c.disabled = !!wanted;
    if (d) d.disabled = !wanted;
  }

  /**
   * Prepend one tool-call row to the live log (name, path, ok/error, ms).
   */
  function addLog(row) {
    var list = document.getElementById('log');
    if (!list || !row) return;
    var li = document.createElement('li');
    li.className = row.ok ? 'ok' : 'err';
    var when = new Date();
    var hh = String(when.getHours()).padStart(2, '0');
    var mm = String(when.getMinutes()).padStart(2, '0');
    var ss = String(when.getSeconds()).padStart(2, '0');
    var time = document.createElement('span');
    time.className = 't';
    time.textContent = hh + ':' + mm + ':' + ss;
    var name = document.createElement('span');
    name.className = 'n';
    name.textContent = row.name || '';
    var path = document.createElement('span');
    path.className = 'p';
    path.textContent = row.path || '';
    var res = document.createElement('span');
    res.className = 'r';
    res.textContent = row.ok ? 'ok' : (row.error ? 'error' : 'error');
    var ms = document.createElement('span');
    ms.className = 'm';
    ms.textContent = String(row.ms == null ? 0 : row.ms) + 'ms';
    li.appendChild(time);
    li.appendChild(name);
    li.appendChild(path);
    li.appendChild(res);
    li.appendChild(ms);
    list.insertBefore(li, list.firstChild);
    while (list.childNodes.length > C.LOG_MAX) {
      list.removeChild(list.lastChild);
    }
  }

  /* Public UI helpers used by wm_main. */
  var api = {
    lsGet: lsGet,
    lsSet: lsSet,
    resolveTheme: resolveTheme,
    applyTheme: applyTheme,
    bootTheme: bootTheme,
    setStatus: setStatus,
    setFolder: setFolder,
    setUnsupported: setUnsupported,
    setLinkButtons: setLinkButtons,
    addLog: addLog
  };
  root.WMUI = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
