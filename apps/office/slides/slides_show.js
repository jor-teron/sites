/* Hub Office Slides SL2 — Present mode (SLShow). A full-screen slideshow of the open deck.
   - Full screen with the Fullscreen API (standard or webkit) on #show; when that is missing or refused (iPhone Safari,
     some embedded views) #show is simply a fixed black overlay over the whole page (mode 'overlay').
   - One slide at a time, drawn with SLEdit.html (the same renderer as the thumbnails), 960 x 540 scaled by one CSS
     transform to fit, letterboxed on black. Nothing animates and no timers run except the 2 s idle timer.
   - Next: → ↓ Space PageDown Enter N, a tap / click on the right two-thirds, a swipe left.
     Previous: ← ↑ PageUp Backspace P, a tap on the left third, a swipe right. Home / End. Type a number + Enter to jump.
     Esc (or the ✕ button) exits back to the editor on the slide shown last.
   - After the last slide: a black end screen "End of slideshow, tap or press to exit" (← goes back).
   - The slide counter and the small ‹ › ✕ buttons show on a change or when the mouse / finger moves, and fade after
     2 s idle; the mouse cursor hides with them.
   - Screen Wake Lock while presenting when the browser has it (re-asked when the page becomes visible again). */
(function () {
  'use strict';
  var IDLE = 2000;
  var $ = function (id) { return document.getElementById(id); };
  var el, fitEl, slideEl, endEl, countEl, cb = {}, on = false, mode = '', i = 0, n = 0, slides = [], atEnd = false;
  var idleT = 0, numBuf = '', numT = 0, lock = null, p0 = null;

  function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function reqFs(x) {
    try {
      if (x.requestFullscreen) return Promise.resolve(x.requestFullscreen({ navigationUI: 'hide' }));
      if (x.webkitRequestFullscreen) { x.webkitRequestFullscreen(); return Promise.resolve(); }
    } catch (e) { return Promise.reject(e); }
    return Promise.reject(new Error('no fullscreen'));
  }
  function exitFs() {
    try {
      if (document.exitFullscreen) { var r = document.exitFullscreen(); if (r && r.catch) r.catch(function () {}); }
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (_) { /* */ }
  }

  /* ---------- wake lock (guarded: only when the browser has it; failures are ignored) ---------- */
  function wake() {
    if (!on || lock || !('wakeLock' in navigator) || !navigator.wakeLock || !navigator.wakeLock.request) return;
    try {
      navigator.wakeLock.request('screen').then(function (l) {
        if (!on) { try { l.release(); } catch (_) { /* */ } return; }
        lock = l; if (l.addEventListener) l.addEventListener('release', function () { if (lock === l) lock = null; });
      }, function () { lock = null; });
    } catch (_) { lock = null; }
  }
  function unwake() { var l = lock; lock = null; if (l) { try { var r = l.release(); if (r && r.catch) r.catch(function () {}); } catch (_) { /* */ } } }

  /* ---------- layout + drawing ---------- */
  function fit() {
    if (!on) return;
    var w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight;
    var s = Math.min(w / SLEdit.W, h / SLEdit.H);
    fitEl.style.width = Math.floor(SLEdit.W * s) + 'px'; fitEl.style.height = Math.floor(SLEdit.H * s) + 'px';
    slideEl.style.transform = 'scale(' + s + ')';
  }
  function draw() {
    endEl.hidden = !atEnd; fitEl.hidden = atEnd;
    if (!atEnd) { slideEl.innerHTML = SLEdit.html(slides[i], i, { show: true }); slideEl.setAttribute('aria-label', 'Slide ' + (i + 1) + ' of ' + n); }
    countEl.textContent = atEnd ? 'End' : (i + 1) + ' / ' + n;
    $('show-prev').disabled = !atEnd && i === 0; $('show-next').disabled = false;
    poke();
  }
  function go(k) {
    k = Math.max(0, Math.min(n - 1, k | 0));
    atEnd = false; i = k; draw(); if (cb.onSlide) cb.onSlide(i);
  }
  function next() { if (atEnd) { exit(); return; } if (i < n - 1) go(i + 1); else { atEnd = true; draw(); } }
  function prev() { if (atEnd) { atEnd = false; draw(); return; } if (i > 0) go(i - 1); else poke(); }

  /* ---------- idle: counter, buttons and cursor fade after 2 s ---------- */
  function poke() {
    if (!on) return;
    el.classList.remove('idle'); clearTimeout(idleT);
    idleT = setTimeout(function () { if (on && !numBuf) el.classList.add('idle'); }, IDLE);
  }

  /* ---------- keys ---------- */
  function onKey(e) {
    if (!on) return;
    var k = e.key;
    if (e.ctrlKey || e.metaKey || e.altKey) {   /* let browser shortcuts through, but never the editor's */
      if (k === 'Enter') e.preventDefault();
      e.stopPropagation(); return;
    }
    e.stopPropagation();
    if (/^[0-9]$/.test(k)) {
      e.preventDefault(); numBuf = (numBuf + k).slice(-4); countEl.textContent = 'Go to ' + numBuf;
      el.classList.remove('idle'); clearTimeout(numT); numT = setTimeout(function () { numBuf = ''; draw(); }, 3000); return;
    }
    if (k === 'Enter' && numBuf) { e.preventDefault(); var t = parseInt(numBuf, 10); numBuf = ''; clearTimeout(numT); if (t >= 1) go(t - 1); else draw(); return; }
    if (numBuf && k !== 'Shift') { numBuf = ''; clearTimeout(numT); }
    if (k === 'Escape') { e.preventDefault(); exit(); return; }
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'Spacebar' || k === 'PageDown' || k === 'Enter' || k === 'n' || k === 'N') { e.preventDefault(); next(); return; }
    if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace' || k === 'p' || k === 'P') { e.preventDefault(); prev(); return; }
    if (k === 'Home') { e.preventDefault(); go(0); return; }
    if (k === 'End') { e.preventDefault(); go(n - 1); return; }
    if (k === 'F5' || k === 'Tab') { e.preventDefault(); return; }
    if (atEnd && k.length === 1) { e.preventDefault(); exit(); return; }   /* "press to exit" */
  }

  /* ---------- tap zones + swipes (pointer events: mouse, touch and pen) ---------- */
  function onDown(e) {
    if (!on || e.target.closest('.show-ctl')) return;
    if (e.button > 0) return;
    p0 = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now() };
  }
  function onUp(e) {
    poke();
    if (!p0 || e.pointerId !== p0.id) return;
    var dx = e.clientX - p0.x, dy = e.clientY - p0.y, dt = Date.now() - p0.t; p0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) { if (dx < 0) next(); else prev(); return; }   /* swipe */
    if (Math.abs(dx) + Math.abs(dy) > 16 || dt > 800) return;                                              /* a drag, not a tap */
    if (atEnd) { exit(); return; }
    var r = el.getBoundingClientRect();
    if (e.clientX - r.left < r.width / 3) prev(); else next();
  }

  function enter(list, start) {
    if (on || !list || !list.length) return false;
    slides = list; n = list.length; i = Math.max(0, Math.min(n - 1, start | 0)); atEnd = false; numBuf = '';
    on = true; mode = 'overlay';
    el.hidden = false; document.documentElement.classList.add('presenting');
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (_) { /* */ }
    el.focus({ preventScroll: true });
    fit(); draw(); wake();
    reqFs(el).then(function () { if (on && fsEl()) { mode = 'fullscreen'; el.classList.add('fs'); } fit(); }, function () { mode = 'overlay'; fit(); });
    if (cb.onEnter) cb.onEnter(i);
    return true;
  }
  function exit() {
    if (!on) return;
    on = false; var last = i, m = mode; mode = '';
    clearTimeout(idleT); clearTimeout(numT); numBuf = ''; atEnd = false; p0 = null;
    el.hidden = true; el.classList.remove('idle', 'fs'); document.documentElement.classList.remove('presenting');
    slideEl.innerHTML = '';
    unwake();
    if (m === 'fullscreen' || fsEl()) exitFs();
    if (cb.onExit) cb.onExit(last);
  }

  function init(o) {
    cb = o || {};
    el = $('show'); fitEl = $('show-fit'); slideEl = $('show-slide'); endEl = $('show-end'); countEl = $('show-count');
    addEventListener('keydown', onKey, true);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', function () { p0 = null; });
    el.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse' || p0) poke(); });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    $('show-prev').onclick = function () { prev(); };
    $('show-next').onclick = function () { next(); };
    $('show-x').onclick = function () { exit(); };
    addEventListener('resize', fit);
    function fsChange() {
      if (!on) { if (fsEl() === el) exitFs(); return; }   /* full screen arrived after a quick exit */
      if (fsEl()) { mode = 'fullscreen'; el.classList.add('fs'); }
      else if (mode === 'fullscreen') { mode = ''; exit(); return; }   /* the browser left full screen (its own Esc) */
      fit();
    }
    document.addEventListener('fullscreenchange', fsChange);
    document.addEventListener('webkitfullscreenchange', fsChange);
    document.addEventListener('visibilitychange', function () { if (on && document.visibilityState === 'visible') wake(); });
  }
  window.SLShow = { init: init, enter: enter, exit: exit, next: next, prev: prev, go: go,
    on: function () { return on; }, mode: function () { return mode; }, index: function () { return i; }, atEnd: function () { return atEnd; },
    locked: function () { return !!lock; } };
})();
