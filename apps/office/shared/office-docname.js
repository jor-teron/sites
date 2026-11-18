/*
 * apps/office/shared/office-docname.js  (HO11)
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
    var n = sanitize(name);
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
    set: set
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OfficeDocName = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
