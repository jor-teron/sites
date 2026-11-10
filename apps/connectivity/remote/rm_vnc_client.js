/* Remote — rm_vnc_client.js: VNC relay URL, error text, quality/compression helpers,
 * and a thin wrapper that loads this app's own noVNC copy (vendor/novnc/, v1.7.0).
 * The browser talks to a websockify relay on port 8022 with ?token=HOST:PORT, the
 * same target form SSH uses. This module does not import the VNC or SSH apps.
 */
(function (root) {
  'use strict';

  /* Config is loaded first in the page; tests pass it in via the same global or require. */
  var C = root.RM_CONFIG || (typeof require === 'function' ? require('./rm_config.js') : {});

  /* Build an Error that also carries a short code the UI can switch on. */
  function fail(code, msg) {
    var err = new Error(msg);
    err.code = code;
    return err;
  }

  /**
   * Token query value the websockify allowlist plugin expects: host:port,
   * with IPv6 hosts wrapped in brackets. The default port is 5900.
   */
  function targetToken(host, port) {
    var h = String(host || '').replace(/^\[|\]$/g, '');
    var p = parseInt(port, 10);
    if (!p) p = C.DEFAULT_PORTS && C.DEFAULT_PORTS.vnc ? C.DEFAULT_PORTS.vnc : 5900;
    return (h.indexOf(':') >= 0 ? '[' + h + ']' : h) + ':' + p;
  }

  /**
   * Turn a typed relay URL plus a VNC target into the WebSocket URL the relay expects.
   * http:// becomes ws:// and https:// becomes wss://. The token query is always
   * set to the target (any previous token is replaced — that query is the TCP target,
   * not a secret). Returns { ok, url, reason, code }.
   */
  function buildRelayUrl(relay, host, port) {
    var raw = relay == null ? '' : String(relay).trim();
    if (!raw) {
      return { ok: false, url: '', code: 'bad-relay', reason: C.VNC_ERR_RELAY_URL || 'Enter a relay URL.' };
    }
    var u;
    try {
      u = new URL(raw);
    } catch (e) {
      return { ok: false, url: '', code: 'bad-relay', reason: C.VNC_ERR_RELAY_URL || 'The relay URL is not valid.' };
    }
    if (u.protocol === 'http:') u.protocol = 'ws:';
    if (u.protocol === 'https:') u.protocol = 'wss:';
    if (u.protocol !== 'ws:' && u.protocol !== 'wss:') {
      return { ok: false, url: '', code: 'bad-relay', reason: C.VNC_ERR_RELAY_URL || 'The relay URL must use ws:// or wss://.' };
    }
    u.searchParams.set('token', targetToken(host, port));
    return { ok: true, url: u.href, code: '', reason: '' };
  }

  /* Clamp a quality or compression value to the integer range 0–9, or use def when missing. */
  function clampLevel(value, def) {
    var n = parseInt(value, 10);
    if (isNaN(n)) return def;
    if (n < 0) return 0;
    if (n > 9) return 9;
    return n;
  }

  /* Quality 0–9 for a connection, falling back to the default (noVNC's own default is 6). */
  function qualityOf(conn) {
    var def = C.VNC_QUALITY_DEFAULT;
    if (typeof def !== 'number') def = 6;
    return clampLevel(conn && conn.quality, def);
  }

  /* Compression 0–9 for a connection, falling back to the default (noVNC's own default is 2). */
  function compressionOf(conn) {
    var def = C.VNC_COMPRESSION_DEFAULT;
    if (typeof def !== 'number') def = 2;
    return clampLevel(conn && conn.compression, def);
  }

  /* The Low-bandwidth preset: lowest JPEG quality, strongest Tight compression. */
  function lowBandwidth() {
    return {
      quality: typeof C.VNC_QUALITY_LOW === 'number' ? C.VNC_QUALITY_LOW : 0,
      compression: typeof C.VNC_COMPRESSION_LOW === 'number' ? C.VNC_COMPRESSION_LOW : 9
    };
  }

  /**
   * Turn a noVNC disconnect (or a close reason string) into a clear { code, message }.
   * state is 'connecting', 'connected', or 'authfail'.
   */
  function explainClose(detail, state) {
    var reason = '';
    var clean = false;
    if (typeof detail === 'string') {
      reason = detail;
    } else if (detail && typeof detail === 'object') {
      reason = String(detail.reason || detail.message || '');
      clean = !!detail.clean;
    }
    if (state === 'authfail') {
      return { code: 'auth', message: C.VNC_ERR_AUTH || 'Login failed. Check the password.' };
    }
    if (/allow\s*list|not (in the )?allow|refus|forbidden|not permitted/i.test(reason)) {
      return { code: 'allow', message: C.VNC_ERR_ALLOW || 'This host is not in the relay allowlist.' };
    }
    if (state !== 'connected') {
      if (/password|auth|401/i.test(reason)) {
        return { code: 'auth', message: C.VNC_ERR_AUTH || 'Login failed. Check the password.' };
      }
      return { code: 'relay-down', message: C.VNC_ERR_REACH_RELAY || "Can't reach the VNC relay." };
    }
    if (clean) {
      return { code: 'closed', message: C.VNC_ERR_CLOSED_CLEAN || 'Disconnected.' };
    }
    return { code: 'closed', message: C.VNC_ERR_CLOSED || 'Connection lost.' };
  }

  /* Turn a noVNC securityfailure event into a clear auth error. */
  function explainAuth(detail) {
    var reason = detail && detail.reason ? String(detail.reason) : '';
    var base = C.VNC_ERR_AUTH || 'Login failed. Check the password.';
    return { code: 'auth', message: reason ? (base + ' ' + reason) : base };
  }

  /**
   * Load the RFB constructor from this app's noVNC copy.
   * href defaults to vendor/novnc/core/rfb.js (resolved against the page URL).
   * Tests (and a page that already set root.RFB) can inject the constructor.
   */
  function loadRfb(href) {
    if (typeof root.RFB === 'function') return Promise.resolve(root.RFB);
    var src = href || C.VNC_RFB_HREF || 'vendor/novnc/core/rfb.js';
    try {
      return import(src).then(function (mod) {
        var RFB = mod && (mod.default || mod.RFB);
        if (typeof RFB !== 'function') {
          throw fail('lib', C.VNC_ERR_LIB || 'The VNC viewer failed to load.');
        }
        return RFB;
      });
    } catch (e) {
      return Promise.reject(fail('lib', C.VNC_ERR_LIB || 'The VNC viewer failed to load.'));
    }
  }

  /* Public API, also exported for Node tests. */
  var api = {
    targetToken: targetToken,
    buildRelayUrl: buildRelayUrl,
    clampLevel: clampLevel,
    qualityOf: qualityOf,
    compressionOf: compressionOf,
    lowBandwidth: lowBandwidth,
    explainClose: explainClose,
    explainAuth: explainAuth,
    loadRfb: loadRfb,
    fail: fail
  };
  root.RMVncClient = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
