/* Web Browser — www_logic.js: pure WWW1 logic (address/search parsing, blocked-host check, per-tab back/forward, history, bookmarks) WWW2a relay logic (relay settings, relay URLs, routing, health/secret-test messages) WWW2b (session ids, relay-URL sanitiser, clear-cookies request and messages) WWW2c (real address after relay redirects via X-Relay-Final-Url, Reader support detection and reader URLs) and WWW2d (relay URL auto-fix, Hub-relay/localhost warnings, Test report building with the secret redacted). No DOM; tested by tests/www1.test.cjs, tests/www2a.test.cjs, tests/www2b.test.cjs, tests/www2c.test.cjs and tests/www2d.test.cjs. */
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

  /* ---- WWW2a: Relay Server ---- */

  /* Relay base URL as typed: trimmed, trailing slashes dropped. '' unless it is http(s)://host... */
  function normalizeRelayBase(base) {
    var s = String(base == null ? '' : base).trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\/\s?#]+/i.test(s) || /\s/.test(s)) return '';
    return s.replace(/[?#].*$/, '').replace(/\/+$/, '');
  }

  /* Saved relay settings made safe: {url, secret, enabled}. enabled is false unless both fields are filled. */
  function sanitizeRelay(saved) {
    var d = C.DEFAULT_RELAY;
    var r = {
      url: saved && typeof saved.url === 'string' ? saved.url.trim() : d.url,
      secret: saved && typeof saved.secret === 'string' ? saved.secret.trim() : d.secret,
      enabled: !!(saved && saved.enabled === true)
    };
    if (!r.url || !r.secret) r.enabled = false;
    return r;
  }

  /* True when both fields are filled in and the URL is a usable http(s) base (enabled or not). */
  function relayConfigured(relay) {
    return !!(relay && normalizeRelayBase(relay.url) && String(relay.secret || '').trim());
  }

  /* True when the relay can be used for a page right now: configured and switched on. */
  function relayReady(relay) {
    return !!(relay && relay.enabled === true && relayConfigured(relay));
  }

  /* An http (not https) relay on an https Hub would itself be mixed content, unless it is localhost. */
  function relayMixed(relay, isHttpsHub) {
    if (!isHttpsHub || !relay) return false;
    return isMixedContent('https:', normalizeRelayBase(relay.url));
  }

  /*
   * Relay URL for a page (path-secret form, so a plain iframe src needs no headers):
   * <base>/www/<secret>/fetch?url=<encoded>&session=<id>. Returns '' when base, secret or url is missing.
   */
  function buildRelayUrl(base, secret, url, session) {
    var b = normalizeRelayBase(base);
    var sec = String(secret == null ? '' : secret).trim();
    var u = String(url == null ? '' : url).trim();
    if (!b || !sec || !u) return '';
    var sess = String(session == null || session === '' ? C.RELAY_SESSION : session);
    return b + '/www/' + encodeURIComponent(sec) + '/fetch?url=' + encodeURIComponent(u) + '&session=' + encodeURIComponent(sess);
  }

  /* <base>/health?format=json, or '' when the base is not usable. */
  function relayHealthUrl(base) {
    var b = normalizeRelayBase(base);
    return b ? b + '/health?format=json' : '';
  }

  /* Secret check URL: fetch with no ?url=. v0.7.0 answers 400 "missing ?url=" for a good secret, 401 for a wrong one. */
  function relaySecretProbeUrl(base, secret) {
    var b = normalizeRelayBase(base);
    var sec = String(secret == null ? '' : secret).trim();
    return b && sec ? b + '/www/' + encodeURIComponent(sec) + '/fetch' : '';
  }

  /*
   * The original page URL inside a relay URL (for a same-origin relay frame whose location can be read),
   * or '' when href is not a relay fetch URL for this base. History and the address bar never keep relay URLs.
   */
  function unwrapRelayUrl(href, base) {
    var b = normalizeRelayBase(base);
    var h = String(href || '');
    if (!b || h.indexOf(b + '/www/') !== 0) return '';
    var q = h.indexOf('?');
    if (q < 0) return '';
    var parts = h.slice(q + 1).split('#')[0].split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      if (kv[0] === 'url') {
        try { return decodeURIComponent((kv.slice(1).join('=')).replace(/\+/g, ' ')); } catch (_) { return ''; }
      }
    }
    return '';
  }

  /*
   * Where a page should load:
   *   'direct' — in the frame as-is;  'relay' — in the frame through the relay;  'newtab' — show the card (Open in new tab).
   * opts: { relay, tabMode ('auto'|'relay'|'direct'), isHttpsHub, blockedList, timedOut }.
   * Only http(s) pages can go through the relay. In auto mode, known-blocked hosts, http pages on an https Hub
   * and pages that timed out go through the relay when it is ready; otherwise they get the card.
   */
  function routeFor(url, opts) {
    var o = opts || {};
    var u = String(url || '');
    var web = /^https?:\/\//i.test(u);
    var mixed = isMixedContent(o.isHttpsHub ? 'https:' : '', u);
    var blocked = isKnownBlocked(u, o.blockedList);
    var canRelay = web && relayReady(o.relay) && !relayMixed(o.relay, o.isHttpsHub);
    var mode = C.TAB_MODES.indexOf(o.tabMode) >= 0 ? o.tabMode : 'auto';
    if (mode === 'relay' && canRelay) return 'relay';
    var needsHelp = mixed || blocked || !!o.timedOut;
    if (!needsHelp) return 'direct';
    if (mode !== 'direct' && canRelay) return 'relay';
    return 'newtab';
  }

  /* Origin (scheme://host[:port], lower-case) of an http(s) URL, or ''. */
  function originOf(url) {
    var m = /^(https?:\/\/[^\/?#]+)/i.exec(String(url || ''));
    if (!m) return '';
    var o = m[1].toLowerCase().replace(/^(https?:\/\/)[^@]*@/, '$1');
    return o.replace(/^(https:\/\/[^\/]+):443$/, '$1').replace(/^(http:\/\/[^\/]+):80$/, '$1');
  }

  /* Sandbox for a relay frame: without allow-same-origin when the relay shares the Hub's origin, so proxied sites can't reach the app. */
  function relaySandbox(sandbox, relayBase, hubOrigin) {
    var ro = originOf(normalizeRelayBase(relayBase));
    if (ro && ro === originOf(hubOrigin)) {
      return String(sandbox).split(/\s+/).filter(function (t) { return t && t !== 'allow-same-origin'; }).join(' ');
    }
    return sandbox;
  }

  /* Parse a /health?format=json body (string or object): {ok, version, www (true|false|null), modules}. null if not JSON. */
  function parseHealth(body) {
    var j = body;
    if (typeof body === 'string') {
      try { j = JSON.parse(body); } catch (_) { return null; }
    }
    if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
    var mods = j.modules && typeof j.modules === 'object' && !Array.isArray(j.modules) ? j.modules : {};
    return {
      ok: j.status === 'ok',
      version: typeof j.version === 'string' ? j.version : (j.version != null ? String(j.version) : ''),
      www: Object.prototype.hasOwnProperty.call(mods, 'www') ? mods.www === true : null,
      modules: mods
    };
  }

  /* Plain-language meaning of a relay HTTP status (health check, secret check, or a known fetch status). */
  function statusMessage(status) {
    var n = status | 0;
    if (n === 401 || n === 403) return 'Secret is wrong: the relay refused it (' + n + '). Check the secret in Settings > Relay.';
    if (n === 404) return 'Relay not found at this URL (404). The URL should end in /relay, e.g. https://machine.tailnet.ts.net/relay.';
    if (n === 413) return 'The request was too big for the relay (413, limit 1 MB).';
    if (n === 429) return 'Too many requests: the relay rate limit was hit (429). Wait a minute and try again.';
    if (n === 501) return 'The relay does not support this yet (501).';
    if (n === 502) return 'The relay could not get the page (502): the site failed, was blocked by the relay, or is over 5 MB.';
    if (n === 503 || n === 504) return 'The relay or Funnel is not answering (' + n + '). Is the relay running on your computer?';
    if (n >= 500) return 'The relay had an error (' + n + ').';
    if (n === 0) return 'Relay offline or unreachable.';
    return 'Unexpected answer from the relay (' + n + ').';
  }

  /*
   * Message for the Settings > Relay > Test result. r: {kind, status, body}, kind one of:
   *   'notset' | 'mixed' | 'http' (status + body from /health?format=json) | 'cors' (fetch failed but a no-cors probe reached it)
   *   | 'offline' (network failure) | 'timeout'.
   * Returns {level: 'ok'|'warn'|'error', text, version, www}.
   */
  function healthMessage(r) {
    var x = r || {};
    if (x.kind === 'notset') return { level: 'error', text: 'Relay not set: fill in the relay URL and secret first.' };
    if (x.kind === 'mixed') return { level: 'error', text: 'This Hub is https, so the relay URL must be https too (Tailscale Funnel gives one).' };
    if (x.kind === 'cors') return { level: 'warn', text: "Couldn't verify (relay may not allow this Hub origin); the relay did answer, so you can still try loading a page." };
    if (x.kind === 'timeout') return { level: 'error', text: 'Relay offline: no answer within ' + Math.round(C.RELAY_TEST_TIMEOUT_MS / 1000) + ' s. Is the relay running and Funnel on?' };
    if (x.kind === 'offline') return { level: 'error', text: offlineText(x.healthUrl) };
    if (x.kind !== 'http') return { level: 'error', text: 'Relay test failed.' };
    var st = x.status | 0;
    if (st < 200 || st > 299) return { level: 'error', text: statusMessage(st) };
    var h = parseHealth(x.body);
    if (!h) return { level: 'error', text: 'That URL answered, but not like a Relay Server (no health JSON). The URL should end in /relay.' };
    var ver = h.version ? ' ' + h.version : '';
    if (!h.ok) return { level: 'error', text: 'Relay' + ver + ' reports a problem (status not ok).', version: h.version, www: h.www };
    if (h.www === false) return { level: 'warn', text: 'Relay' + ver + ' is up, but the www module is off. Add www to RELAY_MODULES in relay.conf.', version: h.version, www: false };
    if (h.www === null) return { level: 'warn', text: 'Relay' + ver + ' is up but has no www module (needs Relay Server v0.7.0 or later).', version: h.version, www: null };
    return { level: 'ok', text: 'Relay' + ver + ' is up · www on', version: h.version, www: true };
  }

  /* Meaning of the secret check status (GET <base>/www/<secret>/fetch with no url). */
  function secretProbeMessage(status) {
    var n = status | 0;
    if (n === 400) return { level: 'ok', text: 'Secret accepted.' };
    if (n === 401 || n === 403) return { level: 'error', text: statusMessage(n) };
    if (n === 429) return { level: 'warn', text: statusMessage(n) };
    if (n === 0) return { level: 'warn', text: "Couldn't check the secret from this page; try loading a page." };
    return { level: 'warn', text: 'Secret check unclear (' + n + '); try loading a page.' };
  }

  /* ---- WWW2b: relay sessions, sanitising, clear cookies ---- */

  var SESSION_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  /*
   * New random relay session id: RELAY_SESSION_LEN URL-safe characters (22 → 132 bits).
   * fill(bytes): fills a Uint8Array with random bytes (crypto.getRandomValues in the page; tests pass their own).
   * 256 is a multiple of 64, so byte & 63 is unbiased. Returns '' when no random source is available.
   */
  function newSessionId(fill, len) {
    var n = len || C.RELAY_SESSION_LEN;
    var f = fill;
    if (typeof f !== 'function') {
      var cr = root.crypto;
      if (!cr || typeof cr.getRandomValues !== 'function') return '';
      f = function (a) { return cr.getRandomValues(a); };
    }
    var bytes = new Uint8Array(n);
    f(bytes);
    var out = '';
    for (var i = 0; i < n; i++) out += SESSION_ALPHABET.charAt(bytes[i] & 63);
    return out;
  }

  /* True for a usable saved session id (URL-safe, 16-128 chars). 'default' is not one. */
  function validSessionId(id) {
    return typeof id === 'string' && C.RELAY_SESSION_RE.test(id);
  }

  /* The URL a relay URL points at, whatever relay base it used: path .../www/<x>/fetch (or /reader, WWW2c) or .../www/fetch with ?url=. '' if not one. */
  function unwrapAnyRelayUrl(href) {
    var h = String(href || '');
    if (!/^https?:\/\/[^?#]*\/www\/(?:[^\/?#]+\/)?(?:fetch|reader)\/?\?/i.test(h)) return '';
    return unwrapRelayUrl(h, h.slice(0, h.search(/\/www\//i)));
  }

  /* True when text holds the secret as typed or URL-encoded (secrets shorter than RELAY_SECRET_MIN_SCAN are not scanned). */
  function containsSecret(text, secret) {
    var sec = String(secret == null ? '' : secret).trim();
    if (sec.length < C.RELAY_SECRET_MIN_SCAN) return false;
    var t = String(text == null ? '' : text);
    if (t.indexOf(sec) >= 0) return true;
    var enc = encodeURIComponent(sec);
    if (enc !== sec && t.indexOf(enc) >= 0) return true;
    try { if (t.indexOf(encodeURIComponent(enc)) >= 0) return true; } catch (_) { /* ignore */ }
    return false;
  }

  /*
   * Sanitiser used before every save (history, bookmarks, tabs) and the address bar:
   * a relay URL becomes the original page URL (also nested ones, and relay URLs of an older relay base);
   * anything still holding the relay secret becomes '' (meaning: don't keep it). Other URLs pass through unchanged.
   * relay: {url, secret} (may be null).
   */
  function stripRelay(url, relay) {
    var u = typeof url === 'string' ? url : '';
    if (!u) return '';
    var base = relay ? relay.url : '';
    var secret = relay ? relay.secret : '';
    for (var i = 0; i < 5; i++) {
      var inner = unwrapRelayUrl(u, base) || unwrapAnyRelayUrl(u);
      if (!inner) break;
      u = inner;
    }
    if (unwrapRelayUrl(u, base) || unwrapAnyRelayUrl(u)) return '';
    if (containsSecret(u, secret)) return '';
    return u;
  }

  /* Remove the secret (typed or encoded) from text meant for the screen (status lines, toasts). */
  function redactSecret(text, secret) {
    var t = String(text == null ? '' : text);
    var sec = String(secret == null ? '' : secret).trim();
    if (!sec) return t;
    var enc = encodeURIComponent(sec);
    t = t.split(sec).join('•••');
    if (enc !== sec) t = t.split(enc).join('•••');
    return t;
  }

  /* History list with relay URLs unwrapped and secret-holding entries dropped. */
  function cleanHistory(list, relay) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (e) {
      if (!e || typeof e.url !== 'string') return;
      var u = stripRelay(e.url, relay);
      if (!u) return;
      var title = containsSecret(e.title, relay && relay.secret) ? '' : e.title;
      out.push({ url: u, title: title || labelFor(u), t: e.t });
    });
    return out;
  }

  /* Bookmarks with relay URLs unwrapped, secret-holding ones dropped, and no duplicates after unwrapping. */
  function cleanBookmarks(list, relay) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (b) {
      if (!b || typeof b.url !== 'string') return;
      var u = stripRelay(b.url, relay);
      if (!u || hasBookmark(out, u)) return;
      var title = containsSecret(b.title, relay && relay.secret) ? '' : b.title;
      out.push({ url: u, title: title || labelFor(u) });
    });
    return out;
  }

  /* One tab's back/forward list cleaned the same way (index kept on the same page where possible). */
  function cleanTabHistory(h, relay) {
    var s = sanitizeTabHistory(h);
    var entries = [];
    var index = 0;
    s.entries.forEach(function (u, i) {
      var c = stripRelay(u, relay);
      if (c && entries[entries.length - 1] !== c) entries.push(c);
      if (i <= s.index) index = Math.max(0, entries.length - 1);
    });
    if (!entries.length) return tabHistory();
    return { entries: entries, index: Math.min(index, entries.length - 1) };
  }

  /* Saved tabs state {active, tabs:[{hist, title, mode}]} cleaned for saving. */
  function cleanTabsState(state, relay) {
    var st = state && typeof state === 'object' ? state : {};
    var list = Array.isArray(st.tabs) ? st.tabs : [];
    return {
      active: st.active | 0,
      tabs: list.map(function (t) {
        var x = t || {};
        var title = typeof x.title === 'string' && !containsSecret(x.title, relay && relay.secret) ? x.title : '';
        return { hist: cleanTabHistory(x.hist, relay), title: title, mode: x.mode };
      })
    };
  }

  /*
   * The Clear relay cookies request: POST <base>/www/<secret>/clear?session=<id>.
   * Path-secret and ?session= (no custom headers, no body) keep it a CORS "simple" request, so there is no preflight.
   * Returns {url, init} or null when the relay is not configured.
   */
  function buildClearRequest(relay, session) {
    if (!relayConfigured(relay)) return null;
    var b = normalizeRelayBase(relay.url);
    var sess = String(session == null || session === '' ? C.RELAY_SESSION : session);
    return {
      url: b + '/www/' + encodeURIComponent(String(relay.secret).trim()) + '/clear?session=' + encodeURIComponent(sess),
      init: { method: 'POST', cache: 'no-store', credentials: 'omit' }
    };
  }

  /*
   * Message for Clear relay cookies. r: {kind, status, body}, kind one of:
   *   'notset' | 'mixed' | 'http' (status + JSON body {cleared, session}) | 'cors' (CORS fetch failed, a no-cors POST got through)
   *   | 'offline' | 'timeout'.  origin: this Hub's origin, named in the CORS hint.
   * Returns {level: 'ok'|'warn'|'error', text}. Never includes the secret.
   */
  function clearMessage(r, origin) {
    var x = r || {};
    if (x.kind === 'notset') return { level: 'error', text: 'Relay not set: fill in the relay URL and secret first.' };
    if (x.kind === 'mixed') return healthMessage({ kind: 'mixed' });
    if (x.kind === 'cors') {
      return { level: 'warn', text: 'The clear request was sent, but the relay does not let this Hub read its answer (CORS), so it could not be confirmed. ' +
        'Add ' + (origin || "this Hub's address") + ' to RELAY_WWW_ORIGINS in relay.conf, or tap New session, which logs you out of relayed sites just the same.' };
    }
    if (x.kind === 'timeout') return { level: 'error', text: 'Relay offline: no answer within ' + Math.round(C.RELAY_TEST_TIMEOUT_MS / 1000) + ' s. Tap New session to start fresh anyway.' };
    if (x.kind === 'offline') return { level: 'error', text: 'Relay offline or unreachable, so cookies were not cleared. Tap New session to start fresh anyway.' };
    if (x.kind !== 'http') return { level: 'error', text: 'Clearing relay cookies failed.' };
    var st = x.status | 0;
    if (st === 405) return { level: 'error', text: 'The relay refused the clear request (405). It needs Relay Server v0.7.0 or later.' };
    if (st < 200 || st > 299) return { level: 'error', text: statusMessage(st) };
    var j = null;
    if (typeof x.body === 'string') { try { j = JSON.parse(x.body); } catch (_) { j = null; } } else if (x.body && typeof x.body === 'object') j = x.body;
    if (!j || typeof j !== 'object') return { level: 'warn', text: 'The relay answered, but not like a Relay Server clear (no JSON). Tap New session to be sure.' };
    if (j.cleared === true) return { level: 'ok', text: 'Relay cookies cleared for this device: you are logged out of sites opened through the relay.' };
    return { level: 'ok', text: 'Nothing to clear: the relay had no cookies for this device (they also end after about ' + C.RELAY_SESSION_TTL_MIN + ' minutes idle or a relay restart).' };
  }

  /* ---- WWW2c: real address after relay redirects (X-Relay-Final-Url) ---- */

  /*
   * The light "where did it end up?" request for a relay load: HEAD on the same relay fetch URL
   * (Relay Server v0.7.0 accepts HEAD on fetch and answers with headers only, X-Relay-Final-Url included).
   * Path secret + ?session=, no custom headers: a CORS simple request, so no preflight. null when not configured.
   */
  function buildFinalUrlRequest(relay, url, session) {
    if (!relayConfigured(relay)) return null;
    var u = buildRelayUrl(relay.url, relay.secret, url, session);
    if (!u) return null;
    return { url: u, init: { method: 'HEAD', cache: 'no-store', credentials: 'omit', redirect: 'follow' } };
  }

  /*
   * The original page URL to show after a relay load, from the X-Relay-Final-Url header value.
   * Returns '' (keep the requested URL) when the header is missing, not http(s), the same page, a relay URL that
   * can't be unwrapped, or anything holding the secret. Never returns a relay URL.
   */
  function finalUrlFrom(header, relay, requested) {
    var v = String(header == null ? '' : header).trim();
    if (!v || /[\s<>"]/.test(v)) return '';
    if (!/^https?:\/\/[^\/?#\s]+/i.test(v)) return '';
    var u = stripRelay(v, relay);
    if (!u || !/^https?:\/\//i.test(u)) return '';
    if (u === requested) return '';
    return u;
  }

  /*
   * What a final-URL probe result means. r: {kind, status, header}, kind one of:
   *   'http' (a readable response: status + X-Relay-Final-Url value or null) | 'cors' (the fetch failed though the frame loaded:
   *   the relay doesn't list this Hub in RELAY_WWW_ORIGINS) | 'offline' | 'timeout'.
   * Returns {url, hint}: url = final original URL or ''; hint = '' | 'origin' (add the Hub origin to RELAY_WWW_ORIGINS)
   *   | 'expose' (CORS works but the relay doesn't expose X-Relay-Final-Url via Access-Control-Expose-Headers).
   */
  function finalUrlOutcome(r, relay, requested) {
    var x = r || {};
    if (x.kind === 'cors') return { url: '', hint: 'origin' };
    if (x.kind !== 'http') return { url: '', hint: '' };
    var st = x.status | 0;
    if (x.header == null || x.header === '') {
      /* A readable 2xx/3xx answer without the header: the relay hides it from page scripts. Relay errors (401, 429, 502...) carry no header anyway. */
      return { url: '', hint: st >= 200 && st < 400 ? 'expose' : '' };
    }
    return { url: finalUrlFrom(x.header, relay, requested), hint: '' };
  }

  /* The one-time Settings > Relay hint for a final-URL problem ('' for none). origin: this Hub's origin. */
  function finalUrlHint(kind, origin) {
    var o = origin || "this Hub's address";
    if (kind === 'origin') return 'Add this Hub\'s origin (' + o + ') to RELAY_WWW_ORIGINS to show the real address after redirects.';
    if (kind === 'expose') return "The relay allows this Hub but doesn't expose X-Relay-Final-Url (Access-Control-Expose-Headers), so the real address after redirects can't be shown yet. That needs a Relay Server update.";
    return '';
  }

  /* Tab back/forward list with the current entry replaced by url (a redirect is the same step, not a new one). Collapses a duplicate of the step before. */
  function replaceCurrent(h, url) {
    var s = sanitizeTabHistory(h);
    if (!url) return { entries: s.entries.slice(), index: s.index };
    var entries = s.entries.slice();
    var i = s.index;
    entries[i] = url;
    if (i > 0 && entries[i - 1] === url) { entries.splice(i, 1); i -= 1; }
    return { entries: entries, index: i };
  }

  /*
   * Visited history after a redirect: the newest entry for the requested URL becomes the final URL (its time kept,
   * an auto label relabelled); if the newest entry is something else, the final URL is added as a visit.
   */
  function replaceHistoryUrl(list, fromUrl, toUrl, now, max) {
    var arr = Array.isArray(list) ? list.slice() : [];
    if (!toUrl || toUrl === C.HOME_URL || toUrl === fromUrl) return arr;
    if (arr.length && arr[0] && arr[0].url === fromUrl) {
      var old = arr[0];
      var title = !old.title || old.title === labelFor(fromUrl) ? labelFor(toUrl) : old.title;
      arr[0] = { url: toUrl, title: title, t: old.t };
      if (arr.length > 1 && arr[1] && arr[1].url === toUrl) arr.splice(1, 1);
      return arr;
    }
    return addHistory(arr, toUrl, '', now, max);
  }

  /* ---- WWW2c: Reader view (only when the relay supports it; v0.7.0 answers 501) ---- */

  /* <base>/www/<secret>/reader?url=<encoded>&session=<id>, or '' when the relay isn't configured or the URL isn't http(s). */
  function relayReaderUrl(relay, url, session) {
    if (!relayConfigured(relay)) return '';
    var u = String(url == null ? '' : url).trim();
    if (!/^https?:\/\/[^\/\s?#]+/i.test(u)) return '';
    var sess = String(session == null || session === '' ? C.RELAY_SESSION : session);
    return normalizeRelayBase(relay.url) + '/www/' + encodeURIComponent(String(relay.secret).trim()) + '/reader?url=' + encodeURIComponent(u) + '&session=' + encodeURIComponent(sess);
  }

  /* The one-time reader probe: the reader URL for a small harmless page (C.READER_PROBE_URL), default session. */
  function readerProbeUrl(relay) {
    return relayReaderUrl(relay, C.READER_PROBE_URL, C.RELAY_SESSION);
  }

  /* Cache key for reader support: one probe per relay base + secret (kept in memory only, never saved). */
  function readerKey(relay) {
    if (!relayConfigured(relay)) return '';
    return normalizeRelayBase(relay.url) + '\n' + String(relay.secret).trim();
  }

  /*
   * Reader support from the health JSON (string or object): true when it reports reader (modules.reader, or a
   * top-level reader / features.reader flag), false when it says reader is off or www is off, null when it doesn't say.
   */
  function readerFromHealth(body) {
    var j = body;
    if (typeof body === 'string') { try { j = JSON.parse(body); } catch (_) { return null; } }
    if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
    var mods = j.modules && typeof j.modules === 'object' && !Array.isArray(j.modules) ? j.modules : {};
    var feats = j.features && typeof j.features === 'object' && !Array.isArray(j.features) ? j.features : {};
    if (mods.www === false) return false;
    var flags = [mods.reader, j.reader, feats.reader];
    if (mods.www && typeof mods.www === 'object') flags.push(mods.www.reader);
    for (var i = 0; i < flags.length; i++) if (flags[i] === true) return true;
    for (var k = 0; k < flags.length; k++) if (flags[k] === false) return false;
    return null;
  }

  /*
   * Reader support from the probe status: 2xx → true (shown); 501, 404, 405 and other answers → false (hidden);
   * 0 (network or CORS failure) → null (unknown: hidden, not cached).
   */
  function readerFromStatus(status) {
    var n = status | 0;
    if (n === 0) return null;
    return n >= 200 && n < 300;
  }

  /* Final reader decision: health first, then the probe. Only true shows the button. */
  function readerSupported(health, probeStatus) {
    var h = readerFromHealth(health);
    if (h !== null) return h;
    if (probeStatus === undefined || probeStatus === null) return null;
    return readerFromStatus(probeStatus);
  }

  /* True when the Reader button should show for this tab URL: support confirmed, relay usable, http(s) page. */
  function showReaderButton(supported, relay, url, isHttpsHub) {
    return supported === true && relayReady(relay) && !relayMixed(relay, isHttpsHub) && /^https?:\/\//i.test(String(url || ''));
  }

  /* ---- WWW2d: relay URL auto-fix, Hub-relay warning, detailed Test report ---- */

  /* WWW2d: offline text with likely causes (the health URL to open in this browser, if known). */
  function offlineText(healthUrl) {
    var h = String(healthUrl || '') || 'the relay health page (<relay URL>/health?format=json)';
    return 'Relay offline or unreachable: the request never reached the relay from this device. Open ' + h +
      " in this browser: if it fails too, it's the network, Tailscale, DNS or an ad blocker; if it works, send me the details (Copy details).";
  }

  /* Invisible characters that sneak in when a URL is pasted (zero-width, BOM, soft hyphen, nbsp, bidi marks). */
  var INVISIBLE_RE = /[\u00A0\u00AD\u180E\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u3000\uFEFF]/g;

  /*
   * WWW2d: auto-fix a typed or pasted relay URL. Returns {url, changed, notes}:
   *   url: the usable relay base ('' when it still can't be used), changed: true when url differs from the trimmed input,
   *   notes: short descriptions of each fix (never contain the secret).
   * Fixes: spaces and invisible characters, a missing https://, //host, a trailing /health(?format=json),
   * /www, /www/<anything>/fetch… (also /clear, /reader, /health), a query or #hash, a doubled /relay/relay, trailing slashes,
   * and a bare https://<x>.ts.net gets /relay (the Funnel path of Relay Server).
   */
  function fixRelayUrl(raw) {
    var notes = [];
    var s0 = String(raw == null ? '' : raw);
    var s = s0.replace(INVISIBLE_RE, '');
    if (s !== s0) notes.push('removed invisible characters');
    var t = s.replace(/\s+/g, '');
    if (t !== s.trim()) notes.push('removed spaces');
    s = t;
    if (!s) return { url: '', changed: false, notes: [] };
    if (/^\/\//.test(s)) { s = 'https:' + s; notes.push('added https:'); }
    else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
      if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s) && !/^[^:\/]+\.[^:\/]+:/.test(s)) return { url: '', changed: false, notes: notes };
      s = 'https://' + s.replace(/^:?\/+/, '');
      notes.push('added https://');
    }
    var m = /^([a-z][a-z0-9+.-]*):\/\/([^\/?#]*)([^?#]*)([?#].*)?$/i.exec(s);
    if (!m || !/^https?$/i.test(m[1]) || !m[2]) return { url: '', changed: false, notes: notes };
    var scheme = m[1].toLowerCase();
    /* Lower-case the host (not any user@ part) and drop a trailing dot. */
    var hostLower = m[2].replace(/(^|@)([^@]*)$/, function (all, at, h) { return at + h.toLowerCase(); }).replace(/\.(?=$|:)/, '');
    var path = m[3] || '';
    if (m[4]) notes.push('removed ' + (m[4].charAt(0) === '?' ? 'the query' : 'the #part'));
    path = path.replace(/\/{2,}/g, '/');
    /* /www and everything after it (fetch, clear, reader, health, a secret) is not part of the base. */
    var w = path.search(/\/www(?:\/|$)/i);
    if (w >= 0) { path = path.slice(0, w); notes.push('removed /www…'); }
    path = path.replace(/\/+$/, '');
    if (/\/health$/i.test(path)) { path = path.replace(/\/health$/i, ''); notes.push('removed /health'); }
    path = path.replace(/\/+$/, '');
    if (/(?:\/relay){2,}(?=\/|$)/i.test(path)) { path = path.replace(/(?:\/relay){2,}(?=\/|$)/ig, C.RELAY_PATH); notes.push('removed a doubled /relay'); }
    if (!path && /\.ts\.net(?::\d+)?$/i.test(hostLower.replace(/^.*@/, ''))) { path = C.RELAY_PATH; notes.push('added ' + C.RELAY_PATH); }
    var url = normalizeRelayBase(scheme + '://' + hostLower + path);
    var trimmed = String(raw == null ? '' : raw).trim().replace(/\/+$/, '');
    return { url: url, changed: !!url && url !== trimmed, notes: url ? notes : [] };
  }

  /* WWW2d: port of an http(s) URL ('' for the default). */
  function portOf(url) {
    var m = /^https?:\/\/(?:[^@\/?#]*@)?(?:\[[^\]]+\]|[^:\/?#]+)(?::(\d+))?/i.exec(String(url || ''));
    return m && m[1] ? m[1] : '';
  }

  /* WWW2d: true when the URL points at this device (localhost, 127.x, ::1, 0.0.0.0) or a Hub relay port (8787 RL1, 8022/8023 SSH). */
  function isHubRelayUrl(url) {
    var u = String(url || '');
    var h = hostOf(u);
    if (!h) return false;
    if (C.LOCAL_HOSTS.indexOf(h) >= 0 || /^127\./.test(h) || /\.localhost$/.test(h)) return true;
    return C.HUB_RELAY_PORTS.indexOf(portOf(u)) >= 0;
  }

  /*
   * WWW2d: warnings for a relay URL on this Hub. hubProtocol: location.protocol ('https:', 'http:', 'file:').
   * Returns [{level: 'error'|'warn'|'info', kind, text}] — kinds 'hubrelay', 'mixed', 'file'.
   */
  function relayUrlWarnings(url, hubProtocol) {
    var out = [];
    var b = normalizeRelayBase(url);
    if (!b) return out;
    if (isHubRelayUrl(b)) out.push({ level: 'error', kind: 'hubrelay', text: C.HUB_RELAY_WARN });
    if (hubProtocol === 'https:' && isMixedContent('https:', b)) out.push({ level: 'error', kind: 'mixed', text: healthMessage({ kind: 'mixed' }).text });
    if (hubProtocol === 'file:') out.push({ level: 'info', kind: 'file', text: C.FILE_HUB_NOTE });
    return out;
  }

  /* WWW2d: "TypeError: Failed to fetch" from a fetch error (AbortError gets "timeout"). */
  function describeError(err) {
    if (!err) return 'unknown error';
    var name = err.name ? String(err.name) : 'Error';
    var msg = err.message != null ? String(err.message) : String(err);
    if (name === 'AbortError' && (!msg || /abort/i.test(msg))) msg = 'timeout';
    return msg ? name + ': ' + msg : name;
  }

  /* WWW2d: one step's result as text: {status, ms} | {error, ms} | {opaque: true, ms} | {skipped: reason}. */
  function stepResultText(r) {
    var x = r || {};
    if (x.skipped) return 'skipped (' + x.skipped + ')';
    var t = x.ms != null ? ' in ' + Math.max(0, Math.round(x.ms)) + ' ms' : '';
    if (x.error) return 'failed: ' + x.error + t;
    if (x.opaque) return 'reached the relay (opaque no-cors answer)' + t;
    if (x.status != null) return 'HTTP ' + (x.status | 0) + t;
    return 'not run';
  }

  /*
   * WWW2d: the Test report. t: {release, rawUrl, url, notes, warnings, healthUrl, health, noCors, secret, summary, env},
   * env: {userAgent, origin, onLine, secureContext, protocol, time}. secret: redacted from every line.
   * Returns {steps: [{label, text}], text} where text is the full redacted report for Copy details.
   */
  function buildTestReport(t, secret) {
    var x = t || {};
    var steps = [
      { label: 'a. Health URL', text: x.healthUrl || '(none: relay URL not usable)' },
      { label: 'b. Health GET', text: stepResultText(x.health) },
      { label: 'c. no-cors probe', text: stepResultText(x.noCors || { skipped: 'not needed' }) },
      { label: 'd. Secret check', text: stepResultText(x.secret || { skipped: 'health check did not pass' }) + (x.secret && x.secret.status != null ? ' (' + secretProbeMessage(x.secret.status).text + ')' : '') }
    ];
    var env = x.env || {};
    var lines = ['Web Browser ' + (x.release || C.RELEASE) + ' relay Test report'];
    if (env.time) lines.push('Time: ' + env.time);
    lines.push('Relay URL typed: ' + (x.rawUrl == null ? '' : String(x.rawUrl)));
    lines.push('Relay URL used: ' + (x.url || '(not usable)'));
    if (x.notes && x.notes.length) lines.push('Auto-fixes: ' + x.notes.join(', '));
    (x.warnings || []).forEach(function (w) { lines.push('Warning: ' + w.text); });
    steps.forEach(function (s) { lines.push(s.label + ': ' + s.text); });
    if (x.summary) lines.push('Result: ' + x.summary);
    lines.push('userAgent: ' + (env.userAgent || ''));
    lines.push('location.origin: ' + (env.origin || ''));
    if (env.protocol) lines.push('location.protocol: ' + env.protocol);
    lines.push('navigator.onLine: ' + String(env.onLine));
    lines.push('isSecureContext: ' + String(env.secureContext));
    lines.push('Secret: ' + (String(secret || '').trim() ? 'set (hidden)' : 'not set'));
    var out = {
      steps: steps.map(function (s) { return { label: s.label, text: redactAll(s.text, secret) }; }),
      text: redactAll(lines.join('\n'), secret)
    };
    return out;
  }

  /* WWW2d: redact the secret everywhere, and any /www/<x>/ path segment (a secret pasted into the URL field). */
  function redactAll(text, secret) {
    var t = redactSecret(text, secret);
    return t.replace(/(\/www\/)(?!fetch\b|clear\b|reader\b|health\b)[^\/?#\s]+(?=\/)/gi, '$1•••');
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
    mergeSettings: mergeSettings,
    normalizeRelayBase: normalizeRelayBase,
    sanitizeRelay: sanitizeRelay,
    relayConfigured: relayConfigured,
    relayReady: relayReady,
    relayMixed: relayMixed,
    buildRelayUrl: buildRelayUrl,
    relayHealthUrl: relayHealthUrl,
    relaySecretProbeUrl: relaySecretProbeUrl,
    unwrapRelayUrl: unwrapRelayUrl,
    originOf: originOf,
    relaySandbox: relaySandbox,
    routeFor: routeFor,
    parseHealth: parseHealth,
    statusMessage: statusMessage,
    healthMessage: healthMessage,
    secretProbeMessage: secretProbeMessage,
    newSessionId: newSessionId,
    validSessionId: validSessionId,
    unwrapAnyRelayUrl: unwrapAnyRelayUrl,
    containsSecret: containsSecret,
    stripRelay: stripRelay,
    redactSecret: redactSecret,
    cleanHistory: cleanHistory,
    cleanBookmarks: cleanBookmarks,
    cleanTabHistory: cleanTabHistory,
    cleanTabsState: cleanTabsState,
    buildClearRequest: buildClearRequest,
    clearMessage: clearMessage,
    buildFinalUrlRequest: buildFinalUrlRequest,
    finalUrlFrom: finalUrlFrom,
    finalUrlOutcome: finalUrlOutcome,
    finalUrlHint: finalUrlHint,
    replaceCurrent: replaceCurrent,
    replaceHistoryUrl: replaceHistoryUrl,
    relayReaderUrl: relayReaderUrl,
    readerProbeUrl: readerProbeUrl,
    readerKey: readerKey,
    readerFromHealth: readerFromHealth,
    readerFromStatus: readerFromStatus,
    readerSupported: readerSupported,
    showReaderButton: showReaderButton,
    offlineText: offlineText,
    fixRelayUrl: fixRelayUrl,
    portOf: portOf,
    isHubRelayUrl: isHubRelayUrl,
    relayUrlWarnings: relayUrlWarnings,
    describeError: describeError,
    stepResultText: stepResultText,
    buildTestReport: buildTestReport,
    redactAll: redactAll
  };

  root.WWW_LOGIC = WWW_LOGIC;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WWW_LOGIC;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
