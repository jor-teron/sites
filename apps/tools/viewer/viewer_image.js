/*
 * Viewer pictures (apps/tools/viewer/viewer_image.js) — VW.image: show a picture fitted to the
 * window (never blown up past 100 % on its own), zoom with the wheel (around the pointer),
 * pinch, + / − or the buttons, drag to pan, double click = Fit ↔ 1:1, rotate by 90°.
 * A quick sideways swipe while fitted goes to the previous / next file.
 * The picture is a centred <img> moved by transform: translate(tx, ty) rotate(rot) scale(s).
 *
 * API VW.image: show(url, entry), clear(), zoomBy(k, x?, y?), fit(), actual(), rotate(), active()
 */
(function () {
  'use strict';
  const { $ } = VW;
  const img = $('img'), stage = $('stage');
  const MIN = 0.02, MAX = 32;
  const z = { s: 1, tx: 0, ty: 0, rot: 0, fitted: true, w: 0, h: 0, on: false };

  function fitScale() {
    const r = stage.getBoundingClientRect();
    const side = z.rot % 180 !== 0;
    const w = side ? z.h : z.w, h = side ? z.w : z.h;
    if (!w || !h) return 1;
    return Math.min(1, (r.width - 16) / w, (r.height - 16) / h);
  }
  function apply() {
    img.style.transform = 'translate(-50%, -50%) translate(' + z.tx + 'px, ' + z.ty + 'px) rotate(' + z.rot + 'deg) scale(' + z.s + ')';
    img.classList.toggle('pixel', z.s >= 3);
    $('zoom').textContent = Math.round(z.s * 100) + '%';
    stage.classList.toggle('grab', z.on && !z.fitted);
  }
  function fit() { z.s = fitScale(); z.tx = z.ty = 0; z.fitted = true; apply(); }
  function actual() { z.s = 1; z.tx = z.ty = 0; z.fitted = z.s <= fitScale() + 1e-6; apply(); }
  function rotate() { z.rot = (z.rot + 90) % 360; if (z.fitted) fit(); else apply(); }
  /** Zoom by k around the stage point (x, y) in page pixels (default: the middle). */
  function zoomBy(k, x, y) {
    if (!z.on) return;
    const r = stage.getBoundingClientRect();
    const px = (x == null ? r.left + r.width / 2 : x) - (r.left + r.width / 2);
    const py = (y == null ? r.top + r.height / 2 : y) - (r.top + r.height / 2);
    const s2 = Math.max(MIN, Math.min(MAX, z.s * k)), q = s2 / z.s;
    z.tx = px - (px - z.tx) * q; z.ty = py - (py - z.ty) * q; z.s = s2;
    const f = fitScale();
    if (z.s <= f + 1e-6 && k < 1) { fit(); return; }   // zooming out ends at Fit, centred
    z.fitted = false; apply();
  }
  function show(url, entry) {
    z.on = true; z.rot = 0; z.w = z.h = 0;
    img.onload = () => { z.w = img.naturalWidth; z.h = img.naturalHeight; img.hidden = false; fit(); };
    img.onerror = () => { if (!z.on) return; img.hidden = true; VW.say('This browser can\u2019t show .' + (window.FileTypes.ext(entry.name) || '?') + ' pictures'); };
    img.alt = entry.name;
    img.src = url;
  }
  function clear() {
    z.on = false; img.onload = img.onerror = null;
    img.hidden = true; img.removeAttribute('src');
    stage.classList.remove('grab', 'grabbing');
  }

  stage.addEventListener('wheel', (e) => {
    if (!z.on) return;
    e.preventDefault();
    zoomBy(Math.pow(1.0015, -e.deltaY * (e.deltaMode === 1 ? 33 : 1)), e.clientX, e.clientY);
  }, { passive: false });
  stage.addEventListener('dblclick', (e) => { if (!z.on) return; if (z.fitted) { z.s = fitScale(); zoomBy(1 / z.s, e.clientX, e.clientY); } else fit(); });

  // pointers: one = pan (or swipe while fitted), two = pinch
  const pts = new Map();
  let start = null, pinch = null;
  stage.addEventListener('pointerdown', (e) => {
    if (!z.on || e.button > 0) return;
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) start = { x: e.clientX, y: e.clientY, tx: z.tx, ty: z.ty, t: Date.now(), fitted: z.fitted };
    else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: z.s }; start = null; }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.d > 10) zoomBy((pinch.s * d / pinch.d) / z.s, (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (start && !start.fitted) {
      z.tx = start.tx + e.clientX - start.x; z.ty = start.ty + e.clientY - start.y;
      stage.classList.add('grabbing'); apply();
    }
  });
  function up(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    stage.classList.remove('grabbing');
    if (start && start.fitted && pts.size === 0 && e.type === 'pointerup') {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy) && Date.now() - start.t < 800) VW.go(dx < 0 ? 1 : -1);
    }
    if (pts.size < 2) pinch = null;
    if (!pts.size) start = null;
  }
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  window.addEventListener('resize', () => { if (z.on && z.fitted) fit(); });

  $('zin').addEventListener('click', () => zoomBy(1.25));
  $('zout').addEventListener('click', () => zoomBy(0.8));
  $('fit').addEventListener('click', fit);
  $('actual').addEventListener('click', actual);
  $('rot').addEventListener('click', rotate);

  VW.image = { show, clear, zoomBy, fit, actual, rotate, active: () => z.on, state: () => Object.assign({}, z) };
})();
