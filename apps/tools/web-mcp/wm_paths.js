/* Web MCP — wm_paths.js: path containment so every tool stays inside the picked folder. MCP1 */
(function (root) {
  'use strict';

  /* Config is loaded first in the page; tests pass it in via the same global or require. */
  var C = root.WM_CONFIG || (typeof require === 'function' ? require('./wm_config.js') : {});

  /**
   * Normalize a user path so it cannot escape the picked folder.
   * Backslashes become slashes. "." segments are dropped. ".." pops a segment
   * but stops at the folder root (it never walks above it). Absolute paths
   * (leading "/", a drive letter, or a UNC share) are rejected. Empty or "."
   * means the folder root. Returns { ok, path, parts, isRoot, reason }.
   */
  function resolvePath(raw) {
    /* Coerce a missing value to an empty string so callers can pass null. */
    var s = raw == null ? '' : String(raw);
    /* Empty / whitespace-only paths mean the picked folder itself. */
    s = s.trim();
    if (!s || s === '.') {
      return { ok: true, path: '.', parts: [], isRoot: true, reason: '' };
    }
    /* Hard cap so a huge string cannot stall the resolver. */
    var maxChars = C.MAX_PATH_CHARS || 2048;
    if (s.length > maxChars) {
      return { ok: false, path: '', parts: [], isRoot: false, reason: 'too long' };
    }
    /* Control characters (including NUL) are never valid path text. */
    if (/[\0-\x1f\x7f]/.test(s)) {
      return { ok: false, path: '', parts: [], isRoot: false, reason: 'control' };
    }
    /* Accept either slash style, then work only with forward slashes. */
    s = s.replace(/\\/g, '/');
    /* Leading slash, Windows drive, or UNC are absolute escapes. */
    if (s.charAt(0) === '/') {
      return { ok: false, path: '', parts: [], isRoot: false, reason: 'absolute' };
    }
    if (/^[a-zA-Z]:/.test(s)) {
      return { ok: false, path: '', parts: [], isRoot: false, reason: 'drive' };
    }
    if (s.slice(0, 2) === '//') {
      return { ok: false, path: '', parts: [], isRoot: false, reason: 'unc' };
    }
    /* Walk each segment, clamping ".." at the root instead of rejecting it. */
    var parts = s.split('/');
    var out = [];
    var i;
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p || p === '.') continue;
      if (p === '..') {
        if (out.length) out.pop();
        continue;
      }
      /* Windows device names would be surprising inside a picked folder. */
      var stem = p.split('.')[0].toUpperCase();
      if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) {
        return { ok: false, path: '', parts: [], isRoot: false, reason: 'device' };
      }
      out.push(p);
    }
    if (!out.length) {
      return { ok: true, path: '.', parts: [], isRoot: true, reason: '' };
    }
    return { ok: true, path: out.join('/'), parts: out, isRoot: false, reason: '' };
  }

  /**
   * Throw if resolvePath failed or (when mustExist is later checked) return the result.
   * A thin helper so tools can do `var rel = requirePath(args.path)`.
   */
  function requirePath(raw) {
    var resolved = resolvePath(raw);
    if (!resolved.ok) {
      throw new Error('path is outside the picked folder (' + resolved.reason + ')');
    }
    return resolved;
  }

  /**
   * Split a resolved relative path into parent directory parts and a final name.
   * The root ('.' or empty) has no name and cannot be used as a file target.
   */
  function splitPath(resolved) {
    var parts = resolved && resolved.parts ? resolved.parts : [];
    if (!parts.length) {
      return { dirs: [], name: '', isRoot: true };
    }
    return { dirs: parts.slice(0, -1), name: parts[parts.length - 1], isRoot: false };
  }

  /* Public API, also exported for Node tests. */
  var api = {
    resolvePath: resolvePath,
    requirePath: requirePath,
    splitPath: splitPath
  };
  root.WMPaths = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
