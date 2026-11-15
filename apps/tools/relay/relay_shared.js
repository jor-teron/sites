/* Relay app (RY1) — shared helpers for the Hub relay (hub/relay, RL1). Pure: no DOM, no network.
 * Browser: window.HubRelay. Node: require('./relay_shared.js').
 * localStorage key 'hub.relay' = JSON {url, token, savedAt}
 *   url     relay origin, e.g. "http://127.0.0.1:8787" (http/https; no path)
 *   token   optional relay token ('' or 16-512 characters, hub/relay/relay_config.js)
 *   savedAt ISO time of the last Save
 * Other Hub apps can read it with HubRelay.load(localStorage) and derive URLs with the functions below. */
(function (root) {
  'use strict';
  var KEY = 'hub.relay';
  var DEFAULT_URL = 'http://127.0.0.1:8787';
  var MODULES = ['mcp', 'tcp', 'fetch'];

  // Accepts http(s):// or ws(s):// with or without a path; returns the http(s) origin or '' if invalid.
  function normalizeUrl(value) {
    var s = String(value == null ? '' : value).trim();
    if (!s) return '';
    if (!/^[a-z]+:\/\//i.test(s)) s = 'http://' + s;
    var u;
    try { u = new URL(s); } catch (_) { return ''; }
    var p = u.protocol;
    if (p === 'ws:') p = 'http:'; else if (p === 'wss:') p = 'https:';
    if (p !== 'http:' && p !== 'https:') return '';
    if (u.username || u.password || !u.hostname) return '';
    return p + '//' + u.host;
  }
  function tokenProblem(token) {
    var t = String(token || '');
    if (!t) return '';
    if (t.length < 16 || t.length > 512) return 'The relay token must be 16 to 512 characters.';
    if (/\s/.test(t)) return 'The relay token cannot contain spaces.';
    return '';
  }
  function make(url, token, now) {
    var u = normalizeUrl(url);
    if (!u) throw new Error('Enter a relay address like ' + DEFAULT_URL);
    var bad = tokenProblem(token);
    if (bad) throw new Error(bad);
    return { url: u, token: String(token || ''), savedAt: (now || new Date()).toISOString() };
  }
  function parse(raw) {
    var o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (_) { return null; } }
    if (!o || typeof o !== 'object') return null;
    var u = normalizeUrl(o.url);
    if (!u) return null;
    var t = typeof o.token === 'string' && !tokenProblem(o.token) ? o.token : '';
    return { url: u, token: t, savedAt: typeof o.savedAt === 'string' ? o.savedAt : '' };
  }
  function load(storage) {
    try { return parse(storage && storage.getItem(KEY)); } catch (_) { return null; }
  }
  function save(storage, cfg) {
    var c = make(cfg.url, cfg.token, cfg.savedAt ? new Date(cfg.savedAt) : null);
    storage.setItem(KEY, JSON.stringify(c));
    return c;
  }
  function base(cfg) { return normalizeUrl(cfg && cfg.url) || DEFAULT_URL; }
  function wsBase(cfg) { return base(cfg).replace(/^http/, 'ws'); }
  function enc(v) { return encodeURIComponent(v); }

  function healthUrl(cfg) { return base(cfg) + '/health'; }
  function fetchUrl(cfg) { return base(cfg) + '/fetch'; }
  function mcpUrl(cfg, pin) { return base(cfg) + '/mcp/' + enc(pin || '<PIN>').replace(/%3C/g, '<').replace(/%3E/g, '>'); }
  // WebSockets carry the relay token as ?relay_token= (browsers cannot set headers on a WebSocket).
  function wsUrl(cfg) {
    var t = cfg && cfg.token;
    return wsBase(cfg) + '/ws' + (t ? '?relay_token=' + enc(t) : '');
  }
  function tcpUrl(cfg, host, port) {
    var target = (host || 'HOST') + ':' + (port || 'PORT');
    var q = '?token=' + enc(target).replace(/%3A/gi, ':').replace(/%5B/gi, '[').replace(/%5D/gi, ']');
    var t = cfg && cfg.token;
    return wsBase(cfg) + '/tcp' + q + (t ? '&relay_token=' + enc(t) : '');
  }
  // HTTP requests (/health, /fetch, /mcp) send the token as a header.
  function authHeaders(cfg) {
    return cfg && cfg.token ? { Authorization: 'Bearer ' + cfg.token } : {};
  }
  function mask(text, token) {
    var s = String(text || '');
    if (!token) return s;
    var m = '•'.repeat(8);
    return s.split(token).join(m).split(enc(token)).join(m);
  }

  // GET /health answers "ok\nmodules: mcp, tcp, fetch\n" (hub/relay/relay_core.js).
  function parseHealth(text) {
    var lines = String(text || '').split(/\r?\n/);
    if (lines[0].trim() !== 'ok') return { ok: false, modules: [] };
    var m = /^modules:\s*(.*)$/i.exec((lines[1] || '').trim());
    var mods = m ? m[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
    return { ok: true, modules: mods };
  }
  function isLoopback(hostname) {
    var h = String(hostname || '').toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1' || /\.localhost$/.test(h);
  }
  // An https page cannot call plain http on another machine (mixed content); loopback is allowed by browsers.
  function mixedContent(pageProtocol, cfg) {
    if (pageProtocol !== 'https:') return false;
    var u = new URL(base(cfg));
    return u.protocol === 'http:' && !isLoopback(u.hostname);
  }
  // Turn a /health result into a status. status = HTTP code or 0 when fetch threw.
  function classify(r) {
    r = r || {};
    if (r.mixed) return { state: 'blocked', text: 'Blocked by the browser: this https page cannot reach a plain http address on another device. Use https:// (TLS or a proxy) or open the Hub over http.' };
    if (r.timeout) return { state: 'down', text: 'No answer in time. The relay is not running or the address is wrong.' };
    if (!r.status) return { state: 'down', text: 'Not running, or the browser blocked it. Start the relay; if it is running, add this page\'s origin to CORS_ORIGINS and allow local network access.' };
    if (r.status === 401) return { state: 'auth', text: 'Wrong or missing relay token.' };
    if (r.status === 403) return { state: 'blocked', text: 'The relay refused this host or page. Add the hostname to PUBLIC_HOSTS or this origin to CORS_ORIGINS.' };
    if (r.status === 429) return { state: 'busy', text: 'Too many requests. Wait a little and try again.' };
    if (r.status === 404) return { state: 'down', text: 'Something answered but it is not the Hub relay (no /health).' };
    if (r.status !== 200) return { state: 'down', text: 'Unexpected answer (HTTP ' + r.status + ').' };
    var h = parseHealth(r.body);
    if (!h.ok) return { state: 'down', text: 'Something answered but it is not the Hub relay.' };
    return { state: 'ok', text: 'Connected. Modules on: ' + (h.modules.join(', ') || 'none') + '.', modules: h.modules };
  }

  // Allow-list checks follow hub/relay/README.md (RL1) and relay_security.js.
  // TCP: host:port, bare host = 22, IPv6 in brackets, host-only * globs; no wildcard ports.
  function checkTcp(value) {
    var s = String(value || '').trim();
    var m = /^(\[[a-fA-F0-9:.]+\]|[a-zA-Z0-9.*_-]+)(?::(\d{1,5}))?$/.exec(s);
    if (!m) return { ok: false, error: 'Use host:port, for example 192.168.1.20:22 (no wildcard ports).' };
    if (m[1] === '*' || /^\*+$/.test(m[1].replace(/\./g, ''))) return { ok: false, error: 'A host of only * would allow everything.' };
    var port = Number(m[2] || 22);
    if (port < 1 || port > 65535) return { ok: false, error: 'Port must be 1 to 65535.' };
    return { ok: true, value: m[1].toLowerCase() + ':' + port };
  }
  // Fetch: exact http(s) origins, no paths, no *, no credentials.
  function checkOrigin(value) {
    var s = String(value || '').trim().replace(/\/$/, '');
    var u;
    if (s.indexOf('*') >= 0) return { ok: false, error: 'Wildcards (*) are not allowed.' };
    try { u = new URL(s); } catch (_) { return { ok: false, error: 'Use an origin like https://dav.example.com' }; }
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) return { ok: false, error: 'Use an http:// or https:// origin without a user name.' };
    if (u.origin !== s) return { ok: false, error: 'Use the origin only, without a path: ' + u.origin };
    return { ok: true, value: u.origin };
  }
  // PUBLIC_HOSTS: hostnames without ports.
  function checkHost(value) {
    var s = String(value || '').trim().toLowerCase();
    if (!/^(?:\[[a-f0-9:]+\]|[a-z0-9._-]+)$/.test(s)) return { ok: false, error: 'Use a hostname without port or path, for example pc.tailnet.ts.net' };
    return { ok: true, value: s };
  }
  function uniq(list) { var out = []; (list || []).forEach(function (v) { if (out.indexOf(v) < 0) out.push(v); }); return out; }
  function snippet(lists) {
    lists = lists || {};
    var o = {};
    if (lists.tcp && lists.tcp.length) o.TCP_ALLOWLIST = uniq(lists.tcp);
    if (lists.fetch && lists.fetch.length) o.FETCH_ALLOWLIST = uniq(lists.fetch);
    if (lists.hosts && lists.hosts.length) o.PUBLIC_HOSTS = uniq(lists.hosts);
    return JSON.stringify(o, null, 2);
  }

  var api = {
    KEY: KEY, DEFAULT_URL: DEFAULT_URL, MODULES: MODULES,
    normalizeUrl: normalizeUrl, tokenProblem: tokenProblem, make: make, parse: parse, load: load, save: save,
    healthUrl: healthUrl, fetchUrl: fetchUrl, mcpUrl: mcpUrl, wsUrl: wsUrl, tcpUrl: tcpUrl, authHeaders: authHeaders,
    mask: mask, parseHealth: parseHealth, isLoopback: isLoopback, mixedContent: mixedContent, classify: classify,
    checkTcp: checkTcp, checkOrigin: checkOrigin, checkHost: checkHost, snippet: snippet
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HubRelay = api;
})(typeof self !== 'undefined' ? self : this);
