/* Remote — rm_dav_client.js: WebDAV client that talks to the server with fetch.
 * No relay: the browser calls the http(s) base URL directly, so the server must allow
 * CORS from this page. Authentication is HTTP Basic, held only in memory.
 *
 * The live client has the same shape as the SFTP client so the file view can reuse it:
 *   { root, max, list, stat, read, write, mkdir, rename, remove, close, isOpen, isBusy }.
 * Paths are arrays of names under the connection's start folder. max is 0 (no size cap).
 *
 * Ops: PROPFIND Depth 1 (or 0 for stat), GET, PUT, MKCOL, MOVE (Destination, Overwrite),
 * DELETE (Depth: infinity on a folder). Error codes: cors, auth, denied, notfound,
 * method, storage, exists, failed.
 *
 * buildRequest / explainError / basicAuth / statusCode are exported so node can test them.
 */
(function (root) {
  'use strict';

  /* Config and helpers, loaded as script tags (or required in tests). */
  var C = root.RM_CONFIG || (typeof require === 'function' ? require('./rm_config.js') : {});
  var DavUrl = root.RMDavUrl || (typeof require === 'function' ? require('./rm_dav_url.js') : {});
  var DavXml = root.RMDavXml || (typeof require === 'function' ? require('./rm_dav_xml.js') : {});

  /* Body sent with a PROPFIND so we get type, size, date and display name. */
  var PROPFIND_BODY = '<?xml version="1.0" encoding="utf-8"?>'
    + '<propfind xmlns="DAV:">'
    + '<prop><displayname/><resourcetype/><getcontentlength/><getlastmodified/></prop>'
    + '</propfind>';

  /* Build an Error that also carries .sftp (the view already reads that) and .explain. */
  function fail(code, error) {
    var msg = explainError(code, error);
    var e = new Error(msg);
    e.sftp = code || 'failed';
    e.dav = code || 'failed';
    e.explain = msg;
    return e;
  }

  /* Map an HTTP status to a short error code the UI can switch on. */
  function statusCode(status) {
    var n = parseInt(status, 10) || 0;
    if (n === 401 || n === 407) return 'auth';
    if (n === 403) return 'denied';
    if (n === 404) return 'notfound';
    if (n === 405 || n === 501) return 'method';
    if (n === 409 || n === 412) return 'exists';
    if (n === 507) return 'storage';
    if (n >= 200 && n < 300) return '';
    return 'failed';
  }

  /* Turn a code (and optional message) into a clear sentence plus a README hint. */
  function explainError(code, error) {
    var c = code || 'failed';
    var hint = C.DAV_README_HINT || ' See the README for how to allow CORS on the WebDAV server.';
    if (c === 'cors' || c === 'reach') {
      var r = error || C.DAV_ERR_CORS || "Can't reach the WebDAV server.";
      return /README/.test(r) ? r : r + hint;
    }
    if (c === 'auth') return C.DAV_ERR_AUTH || 'Login failed. Check the user and password.';
    if (c === 'denied') return C.DAV_ERR_DENIED || 'Access denied.';
    if (c === 'notfound') return C.DAV_ERR_NOTFOUND || 'That file or folder was not found.';
    if (c === 'method') {
      var m = error || C.DAV_ERR_METHOD || 'The server does not allow that WebDAV method (405).';
      return /README/.test(m) ? m : m + hint;
    }
    if (c === 'storage') return C.DAV_ERR_STORAGE || 'The server is out of storage (507).';
    if (c === 'exists') return C.DAV_ERR_EXISTS || 'A file or folder with that name already exists.';
    if (c === 'mixed') return error || C.DAV_ERR_MIXED || 'This https page cannot use an http:// WebDAV server.';
    return error || ('WebDAV error: ' + c);
  }

  /* HTTP Basic header value. Uses UTF-8 so a non-ASCII password still encodes. */
  function basicAuth(user, pass) {
    var s = String(user || '') + ':' + String(pass || '');
    var b64;
    if (typeof Buffer !== 'undefined') {
      b64 = Buffer.from(s, 'utf8').toString('base64');
    } else if (typeof btoa === 'function') {
      b64 = btoa(unescape(encodeURIComponent(s)));
    } else {
      b64 = '';
    }
    return 'Basic ' + b64;
  }

  /**
   * Build a fetch request descriptor (no I/O).
   * op: 'propfind' | 'get' | 'put' | 'mkcol' | 'move' | 'delete'
   * url is the target. opts: { user, pass, depth, destination, overwrite, body }.
   * Returns { method, url, headers, body }.
   */
  function buildRequest(op, url, opts) {
    opts = opts || {};
    var headers = {};
    if (opts.user || opts.pass) headers.Authorization = basicAuth(opts.user, opts.pass);
    var method = 'GET';
    var body = opts.body;
    if (op === 'propfind') {
      method = 'PROPFIND';
      headers.Depth = opts.depth == null ? '1' : String(opts.depth);
      headers['Content-Type'] = 'application/xml; charset=utf-8';
      body = body || PROPFIND_BODY;
    } else if (op === 'get') {
      method = 'GET';
      body = undefined;
    } else if (op === 'put') {
      method = 'PUT';
      if (opts.contentType) headers['Content-Type'] = opts.contentType;
    } else if (op === 'mkcol') {
      method = 'MKCOL';
      body = undefined;
    } else if (op === 'move') {
      method = 'MOVE';
      headers.Destination = opts.destination || '';
      headers.Overwrite = opts.overwrite ? 'T' : 'F';
      body = undefined;
    } else if (op === 'delete') {
      method = 'DELETE';
      if (opts.recursive) headers.Depth = 'infinity';
      body = undefined;
    }
    return { method: method, url: url, headers: headers, body: body };
  }

  /* Byte length of an ArrayBuffer, TypedArray, Blob, or similar payload. */
  function byteLength(data) {
    if (!data) return 0;
    if (typeof data.byteLength === 'number') return data.byteLength;
    if (typeof data.size === 'number') return data.size;
    if (typeof data.length === 'number') return data.length;
    return 0;
  }

  /**
   * Open a WebDAV session: PROPFIND the start collection, then return a live client.
   * opts: { url (base), folder, user, pass, fetch, pageProtocol }.
   */
  function connect(opts) {
    opts = opts || {};
    var doFetch = opts.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!doFetch) return Promise.reject(fail('cors', C.DAV_ERR_CORS));
    var base = DavUrl.normalize(opts.url || '', { port: opts.port, pageProtocol: opts.pageProtocol });
    if (!base.ok) return Promise.reject(fail('failed', base.reason));
    if (base.insecure) return Promise.reject(fail('mixed', base.warn));
    /* Start folder under the base collection, or the base itself when it is empty. */
    var rootNorm = (function () {
      var raw = opts.folder || opts.root || '';
      var s = String(raw || '').replace(/\\/g, '/').split('/').filter(function (n) { return n && n !== '.'; });
      if (s.indexOf('..') >= 0) return { ok: false, reason: 'Start folder cannot contain ..' };
      return { ok: true, parts: s };
    })();
    if (!rootNorm.ok) return Promise.reject(fail('failed', rootNorm.reason));
    var rootUrl = DavUrl.joinUrl(base.url, rootNorm.parts, true);
    var cred = { user: opts.user || '', pass: opts.pass || '' };
    var closed = false;
    var pending = 0;

    /* Send one WebDAV request and follow the status / CORS mapping. */
    function send(op, url, extra) {
      if (closed) return Promise.reject(fail('cors', 'disconnected'));
      var req = buildRequest(op, url, Object.assign({}, cred, extra || {}));
      pending += 1;
      return doFetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        credentials: 'omit'
      }).then(function (res) {
        pending = Math.max(0, pending - 1);
        if (closed) return Promise.reject(fail('cors', 'disconnected'));
        var code = statusCode(res.status);
        /* 207 Multi-Status and 201/204 are success. */
        if (!code || res.status === 207) {
          return res;
        }
        return Promise.reject(fail(code, ''));
      }, function (err) {
        pending = Math.max(0, pending - 1);
        /* A TypeError from fetch is the usual CORS / mixed-content / network failure. */
        var name = err && err.name;
        if (name === 'TypeError' || !err || !err.dav) {
          return Promise.reject(fail('cors', C.DAV_ERR_CORS));
        }
        return Promise.reject(err);
      });
    }

    /* URL of a path array under the start folder. Folders get a trailing slash. */
    function href(path, asDir) {
      return DavUrl.joinUrl(rootUrl, path, !!asDir);
    }

    return send('propfind', rootUrl, { depth: '1' }).then(function (res) {
      return res.text().then(function (xml) {
        /* A successful list of the start folder is enough to treat the session as open. */
        var entries = DavXml.parseMultistatus(xml, rootUrl);
        var client = {
          root: rootUrl,
          max: 0,
          list: function (path) {
            var url = href(path, true);
            return send('propfind', url, { depth: '1' }).then(function (r) {
              return r.text().then(function (body) {
                return DavXml.parseMultistatus(body, url);
              });
            });
          },
          stat: function (path) {
            var url = href(path, false);
            /* Try the file URL first, then the folder form. */
            return send('propfind', url, { depth: '0' }).then(function (r) {
              return r.text().then(function (body) {
                var list = DavXml.parseMultistatus(body, '');
                return list[0] || { name: (path && path[path.length - 1]) || '', isDir: false, size: 0, mtime: 0 };
              });
            }, function (err) {
              if (!err || err.dav !== 'notfound') return Promise.reject(err);
              return send('propfind', href(path, true), { depth: '0' }).then(function (r) {
                return r.text().then(function (body) {
                  var list = DavXml.parseMultistatus(body, '');
                  return list[0] || { name: (path && path[path.length - 1]) || '', isDir: true, size: 0, mtime: 0 };
                });
              });
            });
          },
          read: function (path) {
            return send('get', href(path, false)).then(function (r) { return r.arrayBuffer(); });
          },
          write: function (path, data) {
            return send('put', href(path, false), { body: data || new ArrayBuffer(0) }).then(function () { return {}; });
          },
          mkdir: function (path) {
            return send('mkcol', href(path, true)).then(function () { return {}; });
          },
          rename: function (path, to) {
            return send('move', href(path, false), { destination: href(to, false), overwrite: false }).then(function () { return {}; });
          },
          remove: function (path, recursive) {
            return send('delete', href(path, !!recursive), { recursive: !!recursive }).then(function () { return {}; });
          },
          close: function () { closed = true; },
          isOpen: function () { return !closed; },
          isBusy: function () { return pending > 0; }
        };
        /* Touch entries so a unused-var lint would not fire; the probe already proved the folder lists. */
        client._listed = entries.length;
        return client;
      });
    });
  }

  /* Public API, also exported for Node tests. */
  var api = {
    connect: connect,
    buildRequest: buildRequest,
    explainError: explainError,
    basicAuth: basicAuth,
    statusCode: statusCode,
    PROPFIND_BODY: PROPFIND_BODY,
    byteLength: byteLength
  };
  root.RMDavClient = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
