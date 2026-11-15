/* Web Browser — www_logic.js: pure WWW1 logic (address/search parsing, blocked-host check, per-tab back/forward, history, bookmarks). No DOM; tested by tests/www1.test.cjs. */
(function (root) {
  'use strict';

  var C = root.WWW_CONFIG || (typeof require === 'function' ? require('./www_config.js') : null);

  /* Host-like text: localhost, an IPv4 address, or a dotted name ending in a 2+ letter TLD; optional :port and /path?query#hash. */
  var HOST_RE = /^(localhost|\d{1,3}(\.\d{1,3}){3}|([a-z0-9-]+\.)+[a-z][a-z0-9-]{1,62})(:\d{1,5})?([\/?#].*)?$/i;
  /* Hosts reached with plain http by default: localhost and private/loopback IPv4 ranges. */
  var LOCAL_RE = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?([\/?#].*)?$/i;

  /* Build the search URL for a query with the chosen engine (falls back to the default engine). */
  function searchUrl(query, engineId) {
    var eng = C.ENGINES[engineId] || C.ENGINES[C.DEFAULT_ENGINE];
    return eng.url + encodeURIComponent(query);
  }

  /*
   * Turn address-bar text into { kind, url }.
   * kind: 'home' | 'url' | 'search'. Returns null for empty input. javascript: is searched, never run.
   */
  function parseInput(text, engineId) {
    var s = String(text == null ? '' : text).trim();
    if (!s) return null;
    if (s === C.HOME_URL || s.toLowerCase() === 'about:home') return { kind: 'home', url: C.HOME_URL };
    var m = /^([a-z][a-z0-9+.-]*:)/i.exec(s);
    if (m && C.SCHEMES.indexOf(m[1].toLowerCase()) >= 0 && !/\s/.test(s)) {
      var scheme = m[1].toLowerCase();
      if ((scheme === 'http:' || scheme === 'https:') && !/^https?:\/\/[^\/\s]/i.test(s)) {
        return { kind: 'search', url: searchUrl(s, engineId) };
      }
      return { kind: 'url', url: s };
    }
    if (!/\s/.test(s) && HOST_RE.test(s)) {
      return { kind: 'url', url: (LOCAL_RE.test(s) ? 'http://' : 'https://') + s };
    }
    return { kind: 'search', url: searchUrl(s, engineId) };
  }

  /* Lower-case host of an http(s) URL, or '' when it has none or cannot be parsed. */
  function hostOf(url) {
    var m = /^https?:\/\/(?:[^@\/?#]*@)?(\[[^\]]+\]|[^:\/?#]+)/i.exec(String(url || ''));
    return m ? m[1].toLowerCase().replace(/\.$/, '') : '';
  }

  /* True when the URL's host is in the list or a subdomain of one (www.google.com matches google.com). */
  function isKnownBlocked(url, list) {
    var h = hostOf(url);
    if (!h) return false;
    var hosts = list || C.BLOCKED_HOSTS;
    for (var i = 0; i < hosts.length; i++) {
      var b = hosts[i].toLowerCase();
      if (h === b || h.slice(-(b.length + 1)) === '.' + b) return true;
    }
    return false;
  }

  /* True when a secure page would block this URL as mixed content (plain http, not localhost). */
  function isMixedContent(pageProtocol, url) {
    if (pageProtocol !== 'https:') return false;
    if (!/^http:\/\//i.test(String(url || ''))) return false;
    var h = hostOf(url);
    return !(h === 'localhost' || h === '127.0.0.1' || h === '[::1]');
  }

  /* Short label for a URL: the host without www., or the URL itself. */
  function labelFor(url) {
    if (url === C.HOME_URL) return 'Home';
    var h = hostOf(url);
    return h ? h.replace(/^www\./, '') : String(url || '');
  }

  /* ---- Per-tab back/forward (the app's own list; cross-origin frames cannot be read). ---- */

  /* New tab history starting at url (default: home). */
  function tabHistory(url) {
    return { entries: [url || C.HOME_URL], index: 0 };
  }

  /* Current URL of a tab history. */
  function current(h) {
    return h.entries[h.index];
  }

  /* Navigate: drop forward entries, append url (unless it equals the current one), cap the length. Returns a new object. */
  function push(h, url, max) {
    var cap = max || C.TAB_HISTORY_MAX;
    var entries = h.entries.slice(0, h.index + 1);
    if (entries[entries.length - 1] !== url) entries.push(url);
    while (entries.length > cap) entries.shift();
    return { entries: entries, index: entries.length - 1 };
  }

  function canBack(h) { return h.index > 0; }
  function canForward(h) { return h.index < h.entries.length - 1; }

  /* Step back or forward; returns a new object (unchanged copy at the ends). */
  function back(h) { return { entries: h.entries.slice(), index: canBack(h) ? h.index - 1 : h.index }; }
  function forward(h) { return { entries: h.entries.slice(), index: canForward(h) ? h.index + 1 : h.index }; }

  /* Make saved tab history safe to use (bad index, missing entries). */
  function sanitizeTabHistory(h) {
    if (!h || !Array.isArray(h.entries) || !h.entries.length) return tabHistory();
    var entries = h.entries.filter(function (u) { return typeof u === 'string' && u; });
    if (!entries.length) return tabHistory();
    var i = Math.max(0, Math.min(entries.length - 1, h.index | 0));
    return { entries: entries, index: i };
  }

  /* ---- Visited history (newest first). ---- */

  /* Record a visit. The home page is not recorded. A repeat of the newest URL just refreshes its time. */
  function addHistory(list, url, title, now, max) {
    if (!url || url === C.HOME_URL) return list.slice();
    var cap = max || C.HISTORY_MAX;
    var out = list.slice();
    var entry = { url: url, title: title || labelFor(url), t: now };
    if (out.length && out[0].url === url) out[0] = entry;
    else out.unshift(entry);
    if (out.length > cap) out.length = cap;
    return out;
  }

  /* Entries whose URL or title contains every word of the query (case-insensitive). */
  function searchHistory(list, query) {
    var words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return list.slice();
    return list.filter(function (e) {
      var hay = (e.url + ' ' + (e.title || '')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    });
  }

  /* Remove one history entry by its time stamp and URL. */
  function removeHistory(list, url, t) {
    return list.filter(function (e) { return !(e.url === url && e.t === t); });
  }

  /* ---- Bookmarks. ---- */

  function hasBookmark(list, url) {
    return list.some(function (b) { return b.url === url; });
  }

  /* Add (or retitle) a bookmark; the home page cannot be bookmarked. */
  function addBookmark(list, url, title) {
    if (!url || url === C.HOME_URL) return list.slice();
    var t = String(title || '').trim() || labelFor(url);
    if (hasBookmark(list, url)) {
      return list.map(function (b) { return b.url === url ? { url: url, title: t } : b; });
    }
    return list.concat([{ url: url, title: t }]);
  }

  function removeBookmark(list, url) {
    return list.filter(function (b) { return b.url !== url; });
  }

  /* Add when missing, remove when present. */
  function toggleBookmark(list, url, title) {
    return hasBookmark(list, url) ? removeBookmark(list, url) : addBookmark(list, url, title);
  }

  /* Saved settings merged over the defaults; an unknown engine falls back to the default. */
  function mergeSettings(saved) {
    var out = {};
    var d = C.DEFAULT_SETTINGS;
    Object.keys(d).forEach(function (k) {
      out[k] = saved && typeof saved[k] === typeof d[k] ? saved[k] : d[k];
    });
    if (!C.ENGINES[out.engine]) out.engine = C.DEFAULT_ENGINE;
    return out;
  }

  var WWW_LOGIC = {
    searchUrl: searchUrl,
    parseInput: parseInput,
    hostOf: hostOf,
    isKnownBlocked: isKnownBlocked,
    isMixedContent: isMixedContent,
    labelFor: labelFor,
    tabHistory: tabHistory,
    current: current,
    push: push,
    canBack: canBack,
    canForward: canForward,
    back: back,
    forward: forward,
    sanitizeTabHistory: sanitizeTabHistory,
    addHistory: addHistory,
    searchHistory: searchHistory,
    removeHistory: removeHistory,
    hasBookmark: hasBookmark,
    addBookmark: addBookmark,
    removeBookmark: removeBookmark,
    toggleBookmark: toggleBookmark,
    mergeSettings: mergeSettings
  };

  root.WWW_LOGIC = WWW_LOGIC;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WWW_LOGIC;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
