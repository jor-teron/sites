/*
 * apps/office/shared/office-docname.js  (HO11, HO12b)
 * App side of a small Hub Office tab-label contract. Only posts when in a
 * frame. Does not use hub-hello / hub-app, and does not add body.in-hub
 * (those hide the suite's top row, including the ribbon).
 *
 *   OfficeDocName.set(name)           post {hubOfficeDocName:{v:1, name}}
 *                                     to window.parent (same-origin target)
 *   OfficeDocName.sanitize(name)      trim, strip controls, use the basename
 *   OfficeDocName.displayLabel(name)  sanitized, capped at 40 chars with …
 *   OfficeDocName.placeholder(n)      "Untitled 1", "Untitled 2", …
 *   OfficeDocName.parse(data)         name from a message, or null
 *
 * HO12b:
 *   OfficeDocName.stripExt(name)      "Report.how" -> "Report" (known office
 *                                     and text extensions only, so "v1.2" stays)
 *   OfficeDocName.untitledNumber(n)   3 for "Untitled 3" / "untitled 3.how", else 0
 *   OfficeDocName.untitled(names, preferred)
 *                                     "Untitled N": preferred N when free, else the
 *                                     lowest N >= 1 not used by names (case and
 *                                     extension ignored)
 *   OfficeDocName.preferred(search)   N from ?untitled=N (Hub Office new tab), or 0
 *   OfficeDocName.initial(search)     "Untitled N" from the URL, or "Untitled 1"
 *   set(name) now posts the name without its file extension.
 */
(function (root) {
  'use strict';
  var V = 1;
  var MAX_LABEL = 40;
  var MAX_NAME = 200;
  var IN_FRAME = (function () {
    try { return root.parent && root.parent !== root; }
    catch (e) { return true; }
  })();

  function str(v) {
    return (typeof v === 'string') ? v : (v == null ? '' : String(v));
  }

  function sanitize(name) {
    var s = str(name);
    s = s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    s = s.replace(/\\/g, '/');
    var slash = s.lastIndexOf('/');
    if (slash !== -1) s = s.slice(slash + 1).trim();
    if (!s || s === '.' || s === '..') return '';
    if (s.length > MAX_NAME) s = s.slice(0, MAX_NAME);
    return s;
  }

  function displayLabel(name, max) {
    var s = sanitize(name);
    var cap = (typeof max === 'number' && isFinite(max) && max > 1) ? Math.floor(max) : MAX_LABEL;
    if (!s) return '';
    if (s.length <= cap) return s;
    return s.slice(0, cap - 1) + '\u2026';
  }

  function placeholder(n) {
    var num = Number(n);
    if (!isFinite(num) || num < 1) num = 1;
    return 'Untitled ' + Math.floor(num);
  }

  /* HO12b: extensions the office suites open or save. */
  var KNOWN_EXT = /\.(how|hos|hop|hob|hot|docx|doc|odt|rtf|txt|md|markdown|xlsx|xls|ods|csv|tsv|pptx|ppt|odp|odb|db|sqlite|sqlite3|json|hbase|hslides|pdf)$/i;

  function stripExt(name) {
    var s = sanitize(name);
    var t = s.replace(KNOWN_EXT, '').trim();
    return t || s;
  }

  function untitledNumber(name) {
    var m = /^untitled\s+(\d{1,6})$/i.exec(stripExt(name));
    if (!m) return 0;
    var n = parseInt(m[1], 10);
    return n >= 1 ? n : 0;
  }

  function untitled(names, preferred) {
    var used = {};
    (Array.isArray(names) ? names : []).forEach(function (x) {
      var n = untitledNumber(x && typeof x === 'object' ? x.name : x);
      if (n) used[n] = true;
    });
    var p = Math.floor(Number(preferred));
    if (isFinite(p) && p >= 1 && !used[p]) return placeholder(p);
    var k = 1;
    while (used[k]) k++;
    return placeholder(k);
  }

  function preferred(search) {
    if (search == null) {
      try { search = (root.location && root.location.search) ? root.location.search : ''; }
      catch (e) { search = ''; }
    }
    var v = null;
    try { v = new URLSearchParams(String(search)).get('untitled'); }
    catch (e) { v = null; }
    var n = parseInt(v, 10);
    return (isFinite(n) && n >= 1 && n < 1000000) ? n : 0;
  }

  function initial(search) {
    return placeholder(preferred(search) || 1);
  }

  function parse(data) {
    if (!data || typeof data !== 'object' || !data.hubOfficeDocName) return null;
    var body = data.hubOfficeDocName;
    if (!body || typeof body !== 'object' || body.v !== V) return null;
    var name = sanitize(body.name);
    return name || null;
  }

  function postTarget() {
    return (root.location && root.location.origin && root.location.origin !== 'null')
      ? root.location.origin
      : '*';
  }

  function set(name) {
    if (!IN_FRAME) return;
    /* (before HO12b) var n = sanitize(name); */
    var n = stripExt(name);
    if (!n) return;
    try {
      root.parent.postMessage({ hubOfficeDocName: { v: V, name: n } }, postTarget());
    } catch (e) { /* parent gone */ }
  }

  var api = {
    V: V,
    MAX_LABEL: MAX_LABEL,
    MAX_NAME: MAX_NAME,
    inFrame: IN_FRAME,
    sanitize: sanitize,
    displayLabel: displayLabel,
    placeholder: placeholder,
    parse: parse,
    stripExt: stripExt,
    untitledNumber: untitledNumber,
    untitled: untitled,
    preferred: preferred,
    initial: initial,
    set: set
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OfficeDocName = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
