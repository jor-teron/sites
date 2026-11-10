/* Web MCP — wm_ui.js: theme, status, live log, PIN mask controls, and copy helpers. MCP2.1 */
(function (root) {
  'use strict';

  /* Config holds the Hub theme keys, the log cap, and the remask / copy timeouts. */
  var C = root.WM_CONFIG;
  /* Mask helpers for scrubbing a PIN out of status, log, and the Grok URL line. */
  var Mask = root.WMMask;

  /* True while the PIN field is shown in the clear. */
  var pinRevealed = false;
  /* Timer that re-masks the PIN after PIN_REMASK_MS. */
  var pinRemaskTimer = null;
  /* Current PIN, used to scrub status and log text. */
  var currentPin = '';

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
   * Remember the current PIN so later status and log text can be scrubbed.
   */
  function setCurrentPin(pin) {
    currentPin = pin == null ? '' : String(pin);
  }

  /**
   * Replace the current PIN in a string with its masked form.
   */
  function scrub(text) {
    var s = text == null ? '' : String(text);
    if (!Mask || !currentPin) return s;
    return Mask.maskPinInText(s, currentPin);
  }

  /**
   * Set the status line text and tone (idle, ok, warn, error, busy), with the PIN masked.
   */
  function setStatus(text, tone) {
    var el = document.getElementById('status');
    if (!el) return;
    el.textContent = scrub(text || '');
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
   * Prepend one tool-call row to the live log (name, path, ok/error, ms), with the PIN masked.
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
    name.textContent = scrub(row.name || '');
    var path = document.createElement('span');
    path.className = 'p';
    path.textContent = scrub(row.path || '');
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

  /**
   * Clear the remask timer if one is running.
   */
  function clearPinRemaskTimer() {
    if (pinRemaskTimer) {
      clearTimeout(pinRemaskTimer);
      pinRemaskTimer = null;
    }
  }

  /**
   * Hide the PIN again: type=password, Show label, and cancel the remask timer.
   */
  function remaskPin() {
    clearPinRemaskTimer();
    pinRevealed = false;
    var pinEl = document.getElementById('pin');
    var btn = document.getElementById('btn-pin-show');
    if (pinEl && pinEl.type !== 'password') pinEl.type = 'password';
    if (btn) {
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', 'Show PIN');
      btn.title = 'Show PIN';
      btn.textContent = '\uD83D\uDC41 Show';
    }
  }

  /**
   * Start (or restart) the timer that hides the PIN after PIN_REMASK_MS.
   */
  function schedulePinRemask() {
    clearPinRemaskTimer();
    pinRemaskTimer = setTimeout(function () {
      pinRemaskTimer = null;
      remaskPin();
    }, C.PIN_REMASK_MS);
  }

  /**
   * Show the PIN in the clear and start the remask timer.
   */
  function revealPin() {
    var pinEl = document.getElementById('pin');
    var btn = document.getElementById('btn-pin-show');
    if (pinEl) pinEl.type = 'text';
    pinRevealed = true;
    if (btn) {
      btn.setAttribute('aria-pressed', 'true');
      btn.setAttribute('aria-label', 'Hide PIN');
      btn.title = 'Hide PIN';
      btn.textContent = 'Hide';
    }
    schedulePinRemask();
  }

  /**
   * Toggle between a hidden PIN and a briefly visible one.
   */
  function togglePinReveal() {
    if (pinRevealed) remaskPin();
    else revealPin();
  }

  /**
   * Fallback copy via a hidden textarea and document.execCommand('copy').
   */
  function copyTextFallback(value) {
    try {
      var ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (_) {
      return false;
    }
  }

  /**
   * Copy text with navigator.clipboard, falling back to execCommand.
   */
  function copyText(text) {
    var value = text == null ? '' : String(text);
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      return root.navigator.clipboard.writeText(value).then(function () {
        return true;
      }).catch(function () {
        return copyTextFallback(value);
      });
    }
    return Promise.resolve(copyTextFallback(value));
  }

  /**
   * Briefly replace a button's label with 'Copied', then restore it.
   */
  function flashCopied(btn) {
    if (!btn) return;
    var prev = btn.textContent;
    var prevLabel = btn.getAttribute('aria-label');
    btn.textContent = 'Copied';
    if (prevLabel) btn.setAttribute('aria-label', 'Copied');
    setTimeout(function () {
      btn.textContent = prev;
      if (prevLabel) btn.setAttribute('aria-label', prevLabel);
    }, C.COPY_FEEDBACK_MS);
  }

  /**
   * Refresh the masked Grok URL line and enable or disable Copy URL.
   */
  function updateGrokUrl(relayUrl, pin) {
    setCurrentPin(pin);
    var el = document.getElementById('grok-url');
    var btn = document.getElementById('btn-copy-url');
    var masked = Mask && Mask.grokUrlMasked ? Mask.grokUrlMasked(relayUrl, pin) : '';
    var full = Mask && Mask.grokUrl ? Mask.grokUrl(relayUrl, pin) : '';
    if (el) {
      el.textContent = masked ? ('Grok URL: ' + masked) : 'Grok URL will appear once the relay and PIN are set.';
    }
    if (btn) btn.disabled = !full;
  }

  /**
   * Wire Show/Hide and remask the PIN when the page is hidden.
   */
  function bootPinMask() {
    remaskPin();
    var show = document.getElementById('btn-pin-show');
    if (show) show.addEventListener('click', togglePinReveal);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') remaskPin();
    });
    root.addEventListener('pagehide', remaskPin);
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
    addLog: addLog,
    setCurrentPin: setCurrentPin,
    remaskPin: remaskPin,
    bootPinMask: bootPinMask,
    copyText: copyText,
    flashCopied: flashCopied,
    updateGrokUrl: updateGrokUrl
  };
  root.WMUI = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
