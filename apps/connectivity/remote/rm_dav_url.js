/* Remote — rm_dav_url.js: parse and join WebDAV http(s) URLs. No DOM, so node can test it.
 * A base URL looks like https://host/dav/ or http://host/dav/. The default port is 443 for
 * https and 80 for http. An https page cannot fetch an http:// server (mixed content).
 */
(function (root) {
  'use strict';

  /* Config is loaded first in the page; tests pass it in via the same global or require. */
  var C = root.RM_CONFIG || (typeof require === 'function' ? require('./rm_config.js') : {});

  /* Default TCP port for a URL scheme ('http', 'https', 'http:', or 'https:'). */
  function defaultPort(scheme) {
    var s = String(scheme || '').toLowerCase().replace(/:$/, '');
    return s === 'http' ? 80 : 443;
  }

  /* True when the Hub (or this page) is on https, which cannot fetch a plain http:// URL. */
  function pageIsHttps(pageProtocol) {
    var page = String(pageProtocol || '').toLowerCase();
    return page === 'https:' || page === 'https';
  }

  /* Decode a URI component, returning the original string if it is malformed. */
  function decode(s) {
    try { return decodeURIComponent(String(s || '').replace(/\+/g, '%20')); } catch (e) {
      return String(s || '');
    }
  }

  /* Strip a trailing slash, except for the root path "/". */
  function trimSlash(path) {
    var p = String(path || '');
    if (p.length > 1 && p.charAt(p.length - 1) === '/') return p.slice(0, -1);
    return p;
  }

  /**
   * Turn a typed WebDAV value into a canonical http(s) base URL.
   * raw is the field text. opts.port, if a valid number, overrides the URL's port.
   * opts.pageProtocol is 'http:', 'https:', or a short 'http' / 'https' (for the mixed-content warning).
   * A bare host (optional :port and /path) is treated as https://.
   * Returns { ok, url, host, port, path, scheme, insecure, warn, reason }.
   */
  function normalize(raw, opts) {
    opts = opts || {};
    var s = raw == null ? '' : String(raw).trim();
    if (!s) {
      return { ok: false, url: '', host: '', port: '', path: '', scheme: '', insecure: false, warn: '', reason: C.DAV_ERR_URL || 'Enter a WebDAV URL (https://host/dav/ or http://host/dav/).' };
    }
    if (/\s/.test(s)) {
      return { ok: false, url: '', host: '', port: '', path: '', scheme: '', insecure: false, warn: '', reason: C.DAV_ERR_URL || 'Enter a valid WebDAV URL (https://host/dav/).' };
    }
    /* A value with no scheme is treated as https, which is the safe default. */
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
    var u;
    try { u = new URL(s); } catch (e) {
      return { ok: false, url: '', host: '', port: '', path: '', scheme: '', insecure: false, warn: '', reason: C.DAV_ERR_URL || 'Enter a valid WebDAV URL (https://host/dav/).' };
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, url: '', host: '', port: '', path: '', scheme: '', insecure: false, warn: '', reason: C.DAV_ERR_URL || 'WebDAV URL must use http:// or https://.' };
    }
    var host = String(u.hostname || '').replace(/^\[|\]$/g, '');
    if (!host) {
      return { ok: false, url: '', host: '', port: '', path: '', scheme: '', insecure: false, warn: '', reason: C.DAV_ERR_URL || 'Enter a valid WebDAV URL (https://host/dav/).' };
    }
    /* Never keep a user:password from a pasted URL; the password is asked at connect time. */
    u.username = '';
    u.password = '';
    var def = defaultPort(u.protocol);
    var port = parseInt(opts.port, 10) || parseInt(u.port, 10) || def;
    if (port < (C.PORT_MIN || 1) || port > (C.PORT_MAX || 65535)) {
      return { ok: false, url: '', host: '', port: '', path: '', scheme: '', insecure: false, warn: '', reason: 'Port must be 1–65535.' };
    }
    u.port = port === def ? '' : String(port);
    var path = u.pathname || '/';
    if (!path || path.charAt(0) !== '/') path = '/' + path;
    if (path.charAt(path.length - 1) !== '/') path += '/';
    u.pathname = path;
    u.search = '';
    u.hash = '';
    var insecure = pageIsHttps(opts.pageProtocol) && u.protocol === 'http:';
    var warn = insecure ? (C.DAV_ERR_MIXED || 'This https page cannot use an http:// WebDAV server. Use https://, or open the Hub over http on your LAN.') : '';
    return {
      ok: true,
      url: u.href,
      host: host,
      port: String(port),
      path: path,
      scheme: u.protocol === 'http:' ? 'http' : 'https',
      insecure: insecure,
      warn: warn,
      reason: ''
    };
  }

  /**
   * Join a base collection URL with a path array (folder names under that base).
   * trailingSlash is true for a folder URL (MKCOL, PROPFIND, DELETE of a collection).
   */
  function joinUrl(base, parts, trailingSlash) {
    var u;
    try { u = new URL(base); } catch (e) { return ''; }
    var segs = String(u.pathname || '/').split('/').filter(function (n) { return n; });
    (Array.isArray(parts) ? parts : []).forEach(function (n) {
      if (n) segs.push(String(n));
    });
    u.pathname = '/' + segs.map(function (n) { return encodeURIComponent(n); }).join('/') + (trailingSlash ? '/' : '');
    u.search = '';
    u.hash = '';
    return u.href;
  }

  /* Compare two hrefs, ignoring a trailing slash and URI encoding.
   * A path-only href ("/dav/") is equal to a full URL with the same path ("https://h/dav/").
   * Two absolute URLs must also share the same origin.
   */
  function sameHref(a, b) {
    var sa = decode(String(a || ''));
    var sb = decode(String(b || ''));
    /* Resolve a path-only href against the other value when that value is an absolute URL. */
    function parts(s, other) {
      var abs = /^https?:/i.test(s);
      var base = abs ? '' : (/^https?:/i.test(other) ? other : 'https://dummy.invalid');
      try {
        var u = base ? new URL(s, base) : new URL(s);
        return { origin: abs ? u.origin : '', path: trimSlash(u.pathname) };
      } catch (e) {
        return { origin: '', path: trimSlash(s) };
      }
    }
    var pa = parts(sa, sb);
    var pb = parts(sb, sa);
    if (pa.origin && pb.origin && pa.origin !== pb.origin) return false;
    return pa.path === pb.path;
  }

  /* Last path segment of an href, decoded, used as the entry name. */
  function nameFromHref(href, base) {
    var s = decode(String(href || ''));
    var path = s;
    try {
      var u = new URL(s, base || 'https://dummy.invalid');
      path = u.pathname || s;
    } catch (e) { path = s; }
    var segs = trimSlash(path).split('/').filter(function (n) { return n; });
    return segs.length ? decode(segs[segs.length - 1]) : '';
  }

  /* Public API, also exported for Node tests. */
  var api = {
    normalize: normalize,
    defaultPort: defaultPort,
    joinUrl: joinUrl,
    sameHref: sameHref,
    nameFromHref: nameFromHref,
    decode: decode,
    pageIsHttps: pageIsHttps
  };
  root.RMDavUrl = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
