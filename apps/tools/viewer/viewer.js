/*
 * Viewer start-up (apps/tools/viewer/viewer.js) — buttons, keys and life cycle:
 *   ← → / PageUp PageDown / ‹ › previous / next (on a focused video ← → are −10 / +10 s),
 *   Home / End first / last, J / L −10 / +10 s, K or Space play / pause, + − zoom, 0 Fit, 1 1:1,
 *   R rotate, F full screen. Opens the hash on load and on every hashchange (Files picks another
 *   file into an open Viewer window); lets go of the file when the page goes.
 */
(function () {
  'use strict';
  const { $ } = VW;
  const vid = $('vid');
  function full() {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => VW.toast('Full screen is not allowed here'));
  }
  $('prev').addEventListener('click', () => VW.go(-1));
  $('next').addEventListener('click', () => VW.go(1));
  $('full').addEventListener('click', full);

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'SELECT' || t.tagName === 'INPUT')) return;
    const k = e.key, isVid = VW.video.active(), isImg = VW.image.active();
    const onVid = isVid && t === vid;
    let done = true;
    if (k === 'ArrowLeft' || k === 'ArrowRight') { if (onVid) VW.video.skip(k === 'ArrowLeft' ? -10 : 10); else VW.go(k === 'ArrowLeft' ? -1 : 1); }
    else if (k === 'PageUp' || k === 'PageDown') VW.go(k === 'PageUp' ? -1 : 1);
    else if (k === 'Home') VW.show(0);
    else if (k === 'End') VW.show(VW.st.items.length - 1);
    else if ((k === 'j' || k === 'J') && isVid) VW.video.skip(-10);
    else if ((k === 'l' || k === 'L') && isVid) VW.video.skip(10);
    else if ((k === 'k' || k === 'K' || (k === ' ' && !onVid && (!t || t.tagName !== 'BUTTON'))) && isVid) { if (vid.paused) vid.play().catch(() => {}); else vid.pause(); }
    else if ((k === '+' || k === '=') && isImg) VW.image.zoomBy(1.25);
    else if ((k === '-' || k === '_') && isImg) VW.image.zoomBy(0.8);
    else if (k === '0' && isImg) VW.image.fit();
    else if (k === '1' && isImg) VW.image.actual();
    else if ((k === 'r' || k === 'R') && isImg) VW.image.rotate();
    else if (k === 'f' || k === 'F') full();
    else done = false;
    if (done) e.preventDefault();
  });

  window.addEventListener('hashchange', () => VW.start());
  window.addEventListener('pagehide', () => VW.release());
  window.addEventListener('pageshow', (e) => { if (e.persisted && VW.st.items.length) VW.show(VW.st.i); });
  VW.start();
  $('stage').focus({ preventScroll: true });
})();
