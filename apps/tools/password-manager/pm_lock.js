/* Password Manager PW1 — auto-lock, lock-on-hidden, and unlock fail delays. */
(function (root) {
  'use strict';

  var FAIL_FREE = 5;
  var DELAY_START_MS = 5000;
  var DELAY_CAP_MS = 60000;

  // After 5 wrong unlocks: 5s, then 10s, 20s, 40s, capped at 60s.
  function delayMsAfterFails(fails) {
    var n = Number(fails) || 0;
    if (n < FAIL_FREE) return 0;
    var exp = n - FAIL_FREE;
    var ms = DELAY_START_MS * Math.pow(2, exp);
    return Math.min(DELAY_CAP_MS, ms);
  }

  function remainingDelay(rec, now) {
    now = now || Date.now();
    var until = rec && rec.delayUntil ? Number(rec.delayUntil) : 0;
    return until > now ? until - now : 0;
  }

  function applyFail(rec, now) {
    now = now || Date.now();
    var next = {
      fails: (rec && rec.fails ? Number(rec.fails) : 0) + 1,
      delayUntil: rec && rec.delayUntil ? Number(rec.delayUntil) : 0,
      hint: rec && rec.hint ? rec.hint : ''
    };
    var wait = delayMsAfterFails(next.fails);
    next.delayUntil = wait ? now + wait : 0;
    return next;
  }

  function clearFails(rec) {
    return {
      fails: 0,
      delayUntil: 0,
      hint: rec && rec.hint ? rec.hint : ''
    };
  }

  // ---- session timers (browser only) ----
  var idleMs = 5 * 60 * 1000;
  var hiddenMs = 0;
  var lastInput = 0;
  var hiddenSince = 0;
  var idleTimer = null;
  var hiddenTimer = null;
  var onLock = null;
  var listening = false;
  var locked = true;

  function settingsFrom(getSettings) {
    var s = (typeof getSettings === 'function' ? getSettings() : getSettings) || {};
    var autoMin = Number(s.autoLockMin);
    if (autoMin !== 1 && autoMin !== 5 && autoMin !== 15 && autoMin !== 30) autoMin = 5;
    var hidMin = Number(s.lockHiddenMin);
    if (hidMin !== 1 && hidMin !== 5) hidMin = 0;
    return { autoLockMin: autoMin, lockHiddenMin: hidMin };
  }

  var getSettings = function () { return { autoLockMin: 5, lockHiddenMin: 0 }; };

  function bump() {
    lastInput = Date.now();
  }

  function doLock() {
    if (locked) return;
    locked = true;
    stopTimers();
    if (typeof onLock === 'function') {
      try { onLock(); } catch (_) { /* app */ }
    }
  }

  function tickIdle() {
    if (locked) return;
    var s = settingsFrom(getSettings);
    idleMs = s.autoLockMin * 60 * 1000;
    if (Date.now() - lastInput >= idleMs) doLock();
  }

  function armHidden() {
    clearTimeout(hiddenTimer);
    hiddenTimer = null;
    if (locked) return;
    var s = settingsFrom(getSettings);
    hiddenMs = s.lockHiddenMin * 60 * 1000;
    if (!hiddenMs || !hiddenSince) return;
    var left = hiddenMs - (Date.now() - hiddenSince);
    if (left <= 0) {
      doLock();
      return;
    }
    hiddenTimer = setTimeout(function () {
      hiddenTimer = null;
      if (document.visibilityState === 'hidden') doLock();
    }, left);
  }

  function onVis() {
    if (locked) return;
    if (document.visibilityState === 'hidden') {
      hiddenSince = Date.now();
      armHidden();
    } else {
      hiddenSince = 0;
      clearTimeout(hiddenTimer);
      hiddenTimer = null;
      bump();
    }
  }

  function stopTimers() {
    if (idleTimer) { clearInterval(idleTimer); idleTimer = null; }
    if (hiddenTimer) { clearTimeout(hiddenTimer); hiddenTimer = null; }
  }

  function onActivity() {
    if (locked) return;
    bump();
  }

  function start(opts) {
    opts = opts || {};
    getSettings = opts.getSettings || getSettings;
    onLock = opts.onLock || onLock;
    locked = false;
    bump();
    hiddenSince = document.visibilityState === 'hidden' ? Date.now() : 0;
    stopTimers();
    idleTimer = setInterval(tickIdle, 1000);
    armHidden();
    if (!listening) {
      listening = true;
      ['pointerdown', 'keydown', 'input', 'touchstart', 'wheel'].forEach(function (ev) {
        document.addEventListener(ev, onActivity, { passive: true });
      });
      document.addEventListener('visibilitychange', onVis);
    }
  }

  function stop() {
    locked = true;
    stopTimers();
    hiddenSince = 0;
  }

  function lockNow() {
    doLock();
  }

  function isLocked() { return locked; }

  var api = {
    FAIL_FREE: FAIL_FREE,
    delayMsAfterFails: delayMsAfterFails,
    remainingDelay: remainingDelay,
    applyFail: applyFail,
    clearFails: clearFails,
    start: start,
    stop: stop,
    lockNow: lockNow,
    bump: bump,
    isLocked: isLocked
  };

  root.PMLock = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
