/*
 * apps/office/shared/office-newdoc.js  (HO12)
 * Hub Office new-blank-tab helper. A new document tab gets ?new=1 so the
 * suite skips restoring its last document. Opening a file (a hash such as
 * #drive=…&file=…) does not get the flag. Standalone launches have no flag
 * and still restore.
 *
 *   OfficeNewDoc.isNewDocLaunch(search)  true when the query has new=1
 *   OfficeNewDoc.frameSrc(baseUrl, opts) opts.hash, opts.newBlank,
 *                                        opts.untitled (HO12b: &untitled=N
 *                                        with new=1, the tab's "Untitled N")
 */
(function (root) {
  'use strict';

  function isNewDocLaunch(search) {
    if (search == null) {
      search = (typeof location !== 'undefined' && location && location.search) ? location.search : '';
    }
    try {
      return new URLSearchParams(String(search)).get('new') === '1';
    } catch (e) {
      return false;
    }
  }

  /* Build an iframe src. new=1 is added for a new blank tab, not for a
     file open (when a hash is present, or when opts.newBlank is false).
     An existing ? query uses &new=1. */
  function frameSrc(baseUrl, opts) {
    opts = opts || {};
    var url = String(baseUrl || '');
    var hash = opts.hash ? String(opts.hash).replace(/^#/, '') : '';
    var addNew = opts.newBlank;
    if (addNew == null) addNew = !hash;
    if (addNew) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'new=1';
    /* HO12b: pass the tab's Untitled number so the suite can use the same name. */
    var un = Math.floor(Number(opts.untitled));
    if (addNew && isFinite(un) && un >= 1) url += '&untitled=' + un;
    if (hash) url += '#' + hash;
    return url;
  }

  var api = { isNewDocLaunch: isNewDocLaunch, frameSrc: frameSrc };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OfficeNewDoc = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
