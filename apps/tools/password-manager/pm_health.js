/* Password Manager PW2 — health check: weak, reused and old passwords. Pure helper. */
(function (root) {
  'use strict';

  var YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  var WEAK_BITS = 40;

  function entryPassword(e) {
    if (!e || e.deleted) return '';
    if (e.type === 'login' || e.type === 'wifi' || e.type === 'card') return String(e.password || '');
    return String(e.password || '');
  }

  function hasPasswordField(e) {
    if (!e || e.deleted) return false;
    return e.type === 'login' || e.type === 'wifi';
  }

  function bitsOf(pw) {
    if (root && root.PMGen && typeof root.PMGen.estimateBits === 'function') {
      return root.PMGen.estimateBits(pw);
    }
    var size = 0;
    if (/[a-z]/.test(pw)) size += 26;
    if (/[A-Z]/.test(pw)) size += 26;
    if (/\d/.test(pw)) size += 10;
    if (/[^a-zA-Z0-9]/.test(pw)) size += 24;
    if (!size) size = 26;
    return pw ? pw.length * (Math.log(size) / Math.log(2)) : 0;
  }

  function changedAt(e) {
    var iso = (e && (e.passwordChanged || e.updated || e.created)) || '';
    var n = Date.parse(iso);
    return isNaN(n) ? 0 : n;
  }

  function titleOf(e) {
    if (root && root.PMUtil && typeof root.PMUtil.entryTitle === 'function') return root.PMUtil.entryTitle(e);
    return (e && e.title) || 'Untitled';
  }

  /**
   * @param {object[]} entries
   * @param {number} [now]
   * @param {number} [maxAgeMs]
   * @returns {{weak:object[], reused:object[], old:object[], counts:object}}
   *   each item is {id, title, type, reason, bits?, ageDays?, also?:string[]}
   */
  function check(entries, now, maxAgeMs) {
    now = now || Date.now();
    maxAgeMs = maxAgeMs || YEAR_MS;
    var list = (entries || []).filter(function (e) { return e && e.id && !e.deleted; });
    var weak = [];
    var old = [];
    var byPw = Object.create(null);

    list.forEach(function (e) {
      if (!hasPasswordField(e)) return;
      var pw = entryPassword(e);
      if (!pw) {
        weak.push({ id: e.id, title: titleOf(e), type: e.type, reason: 'empty', bits: 0 });
        return;
      }
      var bits = bitsOf(pw);
      if (bits < WEAK_BITS) {
        weak.push({ id: e.id, title: titleOf(e), type: e.type, reason: 'weak', bits: Math.round(bits) });
      }
      var when = changedAt(e);
      if (when && (now - when) > maxAgeMs) {
        old.push({
          id: e.id,
          title: titleOf(e),
          type: e.type,
          reason: 'old',
          ageDays: Math.floor((now - when) / (24 * 60 * 60 * 1000))
        });
      }
      if (!byPw[pw]) byPw[pw] = [];
      byPw[pw].push(e);
    });

    var reused = [];
    Object.keys(byPw).forEach(function (pw) {
      var group = byPw[pw];
      if (group.length < 2) return;
      group.forEach(function (e) {
        reused.push({
          id: e.id,
          title: titleOf(e),
          type: e.type,
          reason: 'reused',
          also: group.filter(function (o) { return o.id !== e.id; }).map(titleOf)
        });
      });
    });

    return {
      weak: weak,
      reused: reused,
      old: old,
      counts: { weak: weak.length, reused: reused.length, old: old.length, checked: list.length }
    };
  }

  var api = {
    YEAR_MS: YEAR_MS,
    WEAK_BITS: WEAK_BITS,
    check: check,
    bitsOf: bitsOf,
    changedAt: changedAt
  };

  root.PMHealth = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
