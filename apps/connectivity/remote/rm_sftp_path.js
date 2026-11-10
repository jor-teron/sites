/* Remote — rm_sftp_path.js: SFTP path, breadcrumb, sort and size/date helpers. No DOM, so node can test it.
 * Paths are arrays of names, matching hub/relay/sftp_relay.py (no "/", ".", or ".." in a segment).
 * normalizeRoot prepares the connection start folder for the open message (slashes allowed there).
 */
(function (root) {
  'use strict';

  /* Copy a path array, treating a missing value as the account root. */
  function parts(path) {
    return Array.isArray(path) ? path.slice() : [];
  }

  /* True when a single path segment is legal for the relay. */
  function isValidName(name) {
    /* Coerce so callers can pass numbers or null safely. */
    var n = name == null ? '' : String(name);
    return !!(n && n !== '.' && n !== '..' && n.indexOf('/') < 0 && n.indexOf('\0') < 0);
  }

  /* Parent folder of a path (the root's parent is still the root). */
  function parent(path) {
    var p = parts(path);
    if (p.length) p.pop();
    return p;
  }

  /* Append a name to a path, or return a string error if the name is illegal. */
  function join(path, name) {
    if (!isValidName(name)) return 'bad name';
    return parts(path).concat(String(name));
  }

  /* Join a path into a display string, using rootLabel for the account folder. */
  function formatPath(path, rootLabel) {
    var p = parts(path);
    var base = rootLabel || '/';
    return p.length ? (base.replace(/\/$/, '') + '/' + p.join('/')) : base;
  }

  /**
   * Breadcrumb trail for a path.
   * Each item is { label, path }. The first crumb is the account root (rootLabel, path []).
   */
  function breadcrumbs(path, rootLabel) {
    var out = [{ label: rootLabel || '/', path: [] }];
    var acc = [];
    parts(path).forEach(function (n) {
      acc = acc.concat(n);
      out.push({ label: n, path: acc.slice() });
    });
    return out;
  }

  /* Folders first, then a case-insensitive name sort. */
  function sortEntries(entries) {
    var list = Array.isArray(entries) ? entries.slice() : [];
    list.sort(function (a, b) {
      var ad = !!(a && a.isDir);
      var bd = !!(b && b.isDir);
      if (ad !== bd) return ad ? -1 : 1;
      var an = String((a && a.name) || '').toLowerCase();
      var bn = String((b && b.name) || '').toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      return 0;
    });
    return list;
  }

  /* Human-readable file size (bytes). */
  function formatSize(n) {
    var x = Number(n) || 0;
    if (x < 1024) return x + ' B';
    if (x < 1048576) return (x / 1024).toFixed(1) + ' KB';
    if (x < 1073741824) return (x / 1048576).toFixed(1) + ' MB';
    return (x / 1073741824).toFixed(1) + ' GB';
  }


  /**
   * Prepare a typed start folder for the relay open "root" field.
   * Backslashes become slashes, "." is dropped, ".." is rejected. A leading slash is kept
   * so an absolute folder still works. Empty means the account home.
   */
  function normalizeRoot(raw) {
    var s = raw == null ? '' : String(raw).trim().replace(/\\/g, '/');
    if (!s) return { ok: true, value: '' };
    var segs = s.split('/').filter(function (n) { return n && n !== '.'; });
    if (segs.some(function (n) { return n === '..'; })) return { ok: false, value: '', reason: 'Start folder cannot contain ..' };
    var value = segs.join('/');
    if (s.charAt(0) === '/' && value) value = '/' + value;
    return { ok: true, value: value };
  }

  /* Local date/time for an mtime in milliseconds, or an empty string. */
  function formatTime(ms) {
    var t = Number(ms) || 0;
    if (!t) return '';
    try { return new Date(t).toLocaleString(); } catch (e) { return ''; }
  }

  /* Public API, also exported for Node tests. */
  var api = {
    parts: parts,
    isValidName: isValidName,
    parent: parent,
    join: join,
    formatPath: formatPath,
    breadcrumbs: breadcrumbs,
    sortEntries: sortEntries,
    formatSize: formatSize,
    formatTime: formatTime,
    normalizeRoot: normalizeRoot
  };
  root.RMSftpPath = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
