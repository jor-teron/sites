/* ============================================================
   FILE: modules/draftly-zoom.js
   PROJECT: Draftly
   ROLE: Document zoom 50%–200% (status bar − % +, Ctrl+wheel,
         trackpad pinch, Ctrl+= / Ctrl+- / Ctrl+0).
   HOW: Sets Draftly.view.userZoom and re-runs view.fit(), which
        scales #pages with a transform. Layout, page-break flow,
        print, PDF and DOCX all work in unscaled units.
   DEPENDS: Draftly.view, Draftly.marks (optional)
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.zoom = {};
Draftly.zoom.min = 0.5;
Draftly.zoom.max = 2;
Draftly.zoom.step = 0.1;
Draftly.zoom.key = 'draftly_zoom';
Draftly.zoom.wheelAcc = 0;

Draftly.zoom.get = function get() { return Draftly.view.userZoom || 1; };

Draftly.zoom.set = function set(z) {
  var Z = Draftly.zoom;
  z = Math.round(Math.min(Z.max, Math.max(Z.min, z)) * 10) / 10;
  Draftly.view.userZoom = z;
  try { localStorage.setItem(Z.key, String(z)); } catch (e) {}
  Draftly.view.fit();
  if (Draftly.marks) Draftly.marks.schedule();
  var pct = document.getElementById('zoomPctBtn');
  if (pct) pct.textContent = Math.round(z * 100) + '%';
  return z;
};

Draftly.zoom.by = function by(dir) { return Draftly.zoom.set(Draftly.zoom.get() + dir * Draftly.zoom.step); };

Draftly.zoom.init = function init() {
  var Z = Draftly.zoom;
  var saved = 1;
  try { saved = parseFloat(localStorage.getItem(Z.key)) || 1; } catch (e) {}
  Z.set(saved);
  var bind = function (id, fn) {
    var b = document.getElementById(id);
    if (!b) return;
    b.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    b.addEventListener('click', function (ev) { ev.preventDefault(); fn(); });
  };
  bind('zoomOutBtn', function () { Z.by(-1); });
  bind('zoomInBtn', function () { Z.by(1); });
  bind('zoomPctBtn', function () { Z.set(1); });
  /* Ctrl+wheel and pinch (Chrome sends ctrlKey wheel): zoom the page, not the browser. */
  window.addEventListener('wheel', function (ev) {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    Z.wheelAcc += ev.deltaY;
    var lim = ev.deltaMode === 0 && Math.abs(ev.deltaY) < 50 ? 50 : 1;  // pinch sends small steps
    if (Math.abs(Z.wheelAcc) >= lim) { Z.by(Z.wheelAcc < 0 ? 1 : -1); Z.wheelAcc = 0; }
  }, { passive: false });
  document.addEventListener('keydown', function (ev) {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
    if (ev.key === '=' || ev.key === '+') { ev.preventDefault(); Z.by(1); }
    else if (ev.key === '-' || ev.key === '_') { ev.preventDefault(); Z.by(-1); }
    else if (ev.key === '0') { ev.preventDefault(); Z.set(1); }
  });
};

Draftly.zoom.init();
