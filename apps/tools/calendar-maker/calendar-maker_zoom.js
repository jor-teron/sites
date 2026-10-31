/* Calendar Maker CM12-F2: display-only preview zoom (slider 25-400%, Fit, Ctrl+wheel, drag pan, pinch).
   Only canvas.style.width changes; canvas.width/height (250 dpi render), Print and PDF are untouched. */
(function () {
  'use strict';
  var MIN = 25, MAX = 400, PX = 96 / 250; /* 100% = real A4 size (250 dpi canvas shown at 96 css px/in) */
  function clamp(z) { z = Math.round(+z || 100); return Math.max(MIN, Math.min(MAX, z)); }
  /* percent at which the canvas (aspect cvW:cvH) fits inside wrapW x wrapH */
  function fitPct(wrapW, wrapH, cvW, cvH) {
    if (!wrapW || !cvW || !cvH) return 100;
    var k = wrapW / (cvW * PX);
    if (wrapH) k = Math.min(k, wrapH / (cvH * PX));
    return clamp(k * 100);
  }
  function attach(wrap, cv, doc) {
    doc = doc || document;
    var st = { z: 100, fit: true };
    var bar = doc.createElement('div'); bar.className = 'zoom-bar';
    var fitB = doc.createElement('button'); fitB.type = 'button'; fitB.textContent = 'Fit';
    var sl = doc.createElement('input'); sl.type = 'range'; sl.min = MIN; sl.max = MAX; sl.step = 5; sl.value = 100;
    sl.setAttribute('aria-label', 'Preview zoom');
    var out = doc.createElement('span'); out.className = 'zoom-pct';
    bar.appendChild(fitB); bar.appendChild(sl); bar.appendChild(out);
    wrap.insertBefore(bar, wrap.firstChild || null);
    function availW() { return Math.max(100, (wrap.clientWidth || 794) - 16); }
    function availH() { return Math.max(100, (wrap.clientHeight || 0) - 16); }
    function cvAspect() { return [cv.width || 210, cv.height || 297]; }
    function fitNow() { var a = cvAspect(); return fitPct(availW(), availH(), a[0], a[1]); }
    function apply() {
      if (st.fit) { st.z = fitNow(); cv.style.width = ''; cv.style.maxWidth = ''; wrap.classList.remove('zoomed'); }
      else {
        var wpx = cvAspect()[0] * PX * st.z / 100;
        cv.style.width = Math.round(wpx) + 'px'; cv.style.maxWidth = 'none';
        wrap.classList.toggle('zoomed', st.z > fitNow());
      }
      sl.value = st.z; out.textContent = st.z + '%'; fitB.disabled = st.fit;
    }
    function set(z, cx, cy) {
      var old = cv.getBoundingClientRect ? cv.getBoundingClientRect() : null;
      st.z = clamp(z); st.fit = false; apply();
      if (old && cx != null && old.width) { /* keep the point under the cursor still */
        var nw = cv.getBoundingClientRect(), k = nw.width / old.width;
        var px = cx - old.left, py = cy - old.top;
        wrap.scrollLeft += (nw.left - old.left) + px * k - px; wrap.scrollTop += (nw.top - old.top) + py * k - py;
      }
    }
    sl.addEventListener('input', function () { set(sl.value); });
    fitB.addEventListener('click', function () { st.fit = true; apply(); });
    function onWheel(e) {
      if (!e.ctrlKey) return; /* plain wheel scrolls */
      e.preventDefault();
      set(st.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY);
    }
    wrap.addEventListener('wheel', onWheel, { passive: false });
    /* drag pan + pinch */
    var pts = {}, drag = null, pinch = null;
    function n() { return Object.keys(pts).length; }
    wrap.addEventListener('pointerdown', function (e) {
      pts[e.pointerId] = e;
      if (n() === 2) { var p = Object.values(pts); pinch = { d: Math.hypot(p[0].clientX - p[1].clientX, p[0].clientY - p[1].clientY), z: st.z }; drag = null; }
      else if (wrap.classList.contains('zoomed')) { drag = { x: e.clientX, y: e.clientY, l: wrap.scrollLeft, t: wrap.scrollTop }; wrap.classList.add('grabbing'); if (wrap.setPointerCapture) wrap.setPointerCapture(e.pointerId); }
    });
    wrap.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return; pts[e.pointerId] = e;
      if (pinch && n() === 2) { var p = Object.values(pts), d = Math.hypot(p[0].clientX - p[1].clientX, p[0].clientY - p[1].clientY); if (pinch.d) set(pinch.z * d / pinch.d); }
      else if (drag) { wrap.scrollLeft = drag.l - (e.clientX - drag.x); wrap.scrollTop = drag.t - (e.clientY - drag.y); }
    });
    function up(e) { delete pts[e.pointerId]; if (n() < 2) pinch = null; if (!n()) { drag = null; wrap.classList.remove('grabbing'); } }
    wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', function () { if (st.fit) apply(); });
    apply();
    return { state: st, set: set, fit: function () { st.fit = true; apply(); }, refresh: apply, onWheel: onWheel, bar: bar };
  }
  var api = { MIN: MIN, MAX: MAX, clamp: clamp, fitPct: fitPct, attach: attach };
  if (typeof window !== 'undefined') window.CMZoom = api;
  if (typeof document !== 'undefined' && document.addEventListener && document.getElementById) {
    var go = function () {
      [['preview-wrap', 'sheet'], ['list-wrap', 'list-sheet']].forEach(function (p) {
        var w = document.getElementById(p[0]), c = document.getElementById(p[1]);
        if (w && c && !w._zoom) w._zoom = attach(w, c);
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
})();
