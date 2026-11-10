/* Remote — rm_url.js: normalize optional relay URLs (ws:// and wss://). No DOM, so node can test it. */
(function (root) {
  'use strict';

  /**
   * Turn a typed relay value into a ws:// or wss:// URL.
   * raw is the field text. pageProtocol is 'http:', 'https:', or a short 'http' / 'https'.
   * A bare host (optional :port and /path) gets wss:// on https pages and ws:// on http pages.
   * When the page protocol is unknown, a bare host gets wss:// (the Hub is served over https).
   * http:// becomes ws:// and https:// becomes wss://. Other schemes are rejected.
   * Returns { ok, url, insecure, warn, reason }.
   */
  function normalizeRelay(raw, pageProtocol) {
    /* Coerce a missing value to an empty string so callers can pass null. */
    var s = raw == null ? '' : String(raw).trim();
    /* An empty field is fine: the relay is optional in RM1. */
    if (!s) return { ok: true, url: '', insecure: false, warn: '', reason: '' };
    /* Normalize the page protocol so both 'https:' and 'https' work in tests and in the browser. */
    var page = String(pageProtocol || '').toLowerCase();
    /* True when the Hub (or this page) is on https, which cannot open a plain ws:// socket. */
    var onHttps = page === 'https:' || page === 'https';
    /* True when the page itself is on http, so a bare host may use ws:// on a LAN. */
    var onHttp = page === 'http:' || page === 'http';
    /* Working copy of the URL we will return if it checks out. */
    var url = s;
    /* Lower-case prefix used only to detect the scheme. */
    var lower = s.toLowerCase();
    if (lower.indexOf('https://') === 0) {
      /* A typed https URL is treated as the secure WebSocket form. */
      url = 'wss://' + s.slice(8);
    } else if (lower.indexOf('http://') === 0) {
      /* A typed http URL is treated as the plain WebSocket form. */
      url = 'ws://' + s.slice(7);
    } else if (lower.indexOf('wss://') === 0 || lower.indexOf('ws://') === 0) {
      /* Already a WebSocket URL: keep the host, port and path as typed. */
      url = s;
    } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
      /* Any other scheme (ftp, file, tcp, ...) is not a relay URL. */
      return { ok: false, url: '', insecure: false, warn: '', reason: 'Relay URL must use ws:// or wss://.' };
    } else {
      /* Bare host, optional :port and /path. Reject spaces so we do not build a broken URL. */
      if (/\s/.test(s)) {
        return { ok: false, url: '', insecure: false, warn: '', reason: 'Enter a valid relay host or ws:// / wss:// URL.' };
      }
      /* Default to wss:// unless the page itself is clearly http. */
      var scheme = onHttp ? 'ws' : 'wss';
      url = scheme + '://' + s;
    }
    /* Whatever remains after the scheme must include a host, not just a path. */
    var rest = url.replace(/^wss?:\/\//i, '');
    if (!rest || rest.charAt(0) === '/') {
      return { ok: false, url: '', insecure: false, warn: '', reason: 'Enter a valid relay host or ws:// / wss:// URL.' };
    }
    /* Flag a ws:// URL on an https page so the form can warn before the browser blocks it. */
    var insecure = onHttps && /^ws:\/\//i.test(url);
    /* Empty when there is no warning; otherwise a short sentence for the hint line. */
    var warn = insecure
      ? 'This https page cannot use a ws:// relay. Use wss://, or open the Hub over http on your LAN.'
      : '';
    return { ok: true, url: url, insecure: insecure, warn: warn, reason: '' };
  }

  /* Public API, also exported for Node tests. */
  var api = { normalizeRelay: normalizeRelay };
  root.RMUrl = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
