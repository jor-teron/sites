/*
 * Paper Scan — ps_loupe.js  (magnifier while dragging a corner)
 * PS.loupe.show(stage, img, nx, ny, sx, sy): round 120 px loupe at 2.5× zoom, floating above the
 * finger (stage coords sx,sy), showing the photo around normalized point nx,ny with a crosshair.
 * Flips below the finger near the top edge. PS.loupe.hide() removes it from view.
 */
(function () {
  'use strict';
  const PS = window.PS = window.PS || {};
  const SIZE = 120, ZOOM = 2.5;
  let cv = null;
  function el(stage) {
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'ps-loupe'; }
    if (cv.parentNode !== stage) stage.appendChild(cv);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== SIZE * dpr) { cv.width = cv.height = SIZE * dpr; }
    return cv;
  }
  // scale = displayed px per photo px (so zoom is relative to what the user sees).
  function show(stage, img, nx, ny, sx, sy, scale) {
    const c = el(stage), x = c.getContext('2d'), S = c.width;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const span = SIZE / (ZOOM * (scale || 1)); // photo px visible across the loupe
    x.save(); x.clearRect(0, 0, S, S);
    x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); x.clip();
    x.fillStyle = '#222'; x.fillRect(0, 0, S, S);
    x.drawImage(img, nx * iw - span / 2, ny * ih - span / 2, span, span, 0, 0, S, S);
    x.strokeStyle = '#ff2d6f'; x.lineWidth = S / 60;
    x.beginPath(); x.moveTo(S / 2, S * 0.2); x.lineTo(S / 2, S * 0.8); x.moveTo(S * 0.2, S / 2); x.lineTo(S * 0.8, S / 2); x.stroke();
    x.restore();
    const up = sy - SIZE - 50 >= 0;
    c.style.left = (sx - SIZE / 2) + 'px';
    c.style.top = (up ? sy - SIZE - 50 : sy + 50) + 'px';
    c.hidden = false;
  }
  function hide() { if (cv) cv.hidden = true; }
  PS.loupe = { show, hide };
})();
