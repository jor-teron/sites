/* ============================================================
   FILE: modules/draftly-ruler.js
   PROJECT: Draftly
   ROLE: DF4 horizontal cm ruler above the page. Follows zoom,
         paper size and orientation; margins shaded grey. Drag
         the left / right margin edges (mouse + touch, snap
         0.1 cm) to set Custom margins via Draftly.ui.setPage.
         Page tab "Ruler" toggle, default off ('draftly_ruler').
   DEPENDS: config, view, ui (setPage), storage via ui
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.ruler = {};
Draftly.ruler.KEY = 'draftly_ruler';
Draftly.ruler.on = false;
Draftly.ruler.drag = null;

Draftly.ruler.el = function el(id) { return document.getElementById(id); };

/* Build the ruler node once, just above #pagesScaler. */
Draftly.ruler.build = function build() {
  var R = Draftly.ruler;
  var ws = R.el('workspace'), scaler = R.el('pagesScaler');
  if (!ws || !scaler || R.el('ruler')) return;
  var r = document.createElement('div');
  r.className = 'ruler'; r.id = 'ruler'; r.hidden = true;
  r.setAttribute('aria-hidden', 'true');
  r.innerHTML = '<div class="ruler-track" id="rulerTrack">' +
    '<div class="ruler-ticks" id="rulerTicks"></div>' +
    '<div class="ruler-margin ruler-margin-l" id="rulerMarginL"></div>' +
    '<div class="ruler-margin ruler-margin-r" id="rulerMarginR"></div>' +
    '<div class="ruler-grab" data-side="left" id="rulerGrabL" title="Drag to change the left margin"></div>' +
    '<div class="ruler-grab" data-side="right" id="rulerGrabR" title="Drag to change the right margin"></div>' +
    '<span class="ruler-tip" id="rulerTip" hidden></span></div>';
  ws.insertBefore(r, scaler);
  ['rulerGrabL', 'rulerGrabR'].forEach(function (id) { R.el(id).addEventListener('pointerdown', R.start); });
};

/* Scaled px per cm and paper width in cm. */
Draftly.ruler.metrics = function metrics() {
  var cfg = Draftly.config;
  var land = document.body.classList.contains(cfg.landscapeClass);
  return { cm: Draftly.view.CM_PX * (Draftly.view.zoom || 1), w: land ? cfg.paperHeightCm : cfg.paperWidthCm };
};

/* Redraw ticks, numbers and margin shading. */
Draftly.ruler.sync = function sync(live) {
  var R = Draftly.ruler, cfg = Draftly.config;
  var r = R.el('ruler');
  if (!r || !R.on) return;
  var m = R.metrics();
  var track = R.el('rulerTrack');
  track.style.width = (m.w * m.cm) + 'px';
  var L = live ? live.left : cfg.marginLeftCm, Rt = live ? live.right : cfg.marginRightCm;
  R.el('rulerMarginL').style.width = (L * m.cm) + 'px';
  R.el('rulerMarginR').style.width = (Rt * m.cm) + 'px';
  R.el('rulerGrabL').style.left = (L * m.cm) + 'px';
  R.el('rulerGrabR').style.left = ((m.w - Rt) * m.cm) + 'px';
  if (live) return;
  var minor = m.cm >= 40 ? 0.1 : (m.cm >= 16 ? 0.5 : 1);
  var key = m.w + '|' + m.cm.toFixed(3);
  if (R.lastKey === key) return;
  R.lastKey = key;
  var html = '';
  var n = Math.round(m.w / minor);
  for (var i = 0; i <= n; i++) {
    var x = i * minor, whole = Math.abs(x - Math.round(x)) < 1e-6, half = Math.abs(x * 2 - Math.round(x * 2)) < 1e-6;
    var cls = whole ? 'cm' : (half ? 'half' : 'mm');
    html += '<i class="t-' + cls + '" style="left:' + (x * m.cm).toFixed(2) + 'px"></i>';
    if (whole && x > 0 && x < m.w - 0.3) html += '<b style="left:' + (x * m.cm).toFixed(2) + 'px">' + Math.round(x) + '</b>';
  }
  R.el('rulerTicks').innerHTML = html;
};

Draftly.ruler.set = function set(on, save) {
  var R = Draftly.ruler;
  R.on = !!on;
  var r = R.el('ruler'), btn = R.el('rulerToggle');
  if (r) r.hidden = !R.on;
  if (btn) { btn.setAttribute('aria-pressed', String(R.on)); btn.classList.toggle('active', R.on); }
  if (save) { try { localStorage.setItem(R.KEY, R.on ? '1' : '0'); } catch (e) {} }
  R.lastKey = null;
  R.sync();
};

/* ----- drag ----- */
Draftly.ruler.start = function start(e) {
  var R = Draftly.ruler, cfg = Draftly.config;
  e.preventDefault();
  var g = e.currentTarget;
  try { g.setPointerCapture(e.pointerId); } catch (x) {}
  R.drag = { side: g.getAttribute('data-side'), x0: e.clientX, g: g,
    m: { top: cfg.marginTopCm, bottom: cfg.marginBottomCm, left: cfg.marginLeftCm, right: cfg.marginRightCm } };
  R.drag.cur = Object.assign({}, R.drag.m);
  g.classList.add('dragging');
  g.addEventListener('pointermove', R.move);
  g.addEventListener('pointerup', R.end);
  g.addEventListener('pointercancel', R.end);
};

Draftly.ruler.move = function move(e) {
  var R = Draftly.ruler, d = R.drag, cfg = Draftly.config;
  if (!d) return;
  var mt = R.metrics();
  var dx = (e.clientX - d.x0) / mt.cm;
  var v = d.side === 'left' ? d.m.left + dx : d.m.right - dx;
  var other = d.side === 'left' ? d.m.right : d.m.left;
  var max = Math.min(cfg.marginCustomMax || 5, mt.w - other - 2);   // keep at least 2 cm of text
  v = Math.round(Math.max(cfg.marginCustomMin || 0.5, Math.min(max, v)) * 10) / 10;
  d.cur[d.side] = v;
  R.sync(d.cur);
  var tip = R.el('rulerTip');
  tip.hidden = false;
  tip.textContent = (d.side === 'left' ? 'L ' : 'R ') + v.toFixed(1) + ' cm';
  tip.style.left = (d.side === 'left' ? v : mt.w - v) * mt.cm + 'px';
};

Draftly.ruler.end = function end() {
  var R = Draftly.ruler, d = R.drag, cfg = Draftly.config;
  if (!d) return;
  R.drag = null;
  d.g.classList.remove('dragging');
  d.g.removeEventListener('pointermove', R.move);
  d.g.removeEventListener('pointerup', R.end);
  d.g.removeEventListener('pointercancel', R.end);
  R.el('rulerTip').hidden = true;
  if (d.cur[d.side] === d.m[d.side]) { R.sync(); return; }
  Draftly.ui.setPage(cfg.paperSize, 'custom', d.cur);
  R.sync();
};

Draftly.ruler.init = function init() {
  var R = Draftly.ruler;
  R.build();
  /* Follow zoom / paper / orientation: every one of them ends in view.fit(). */
  var fit = Draftly.view.fit;
  Draftly.view.fit = function () { var out = fit.apply(this, arguments); R.sync(); return out; };
  var btn = R.el('rulerToggle');
  if (btn) {
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function (e) { e.preventDefault(); R.set(!R.on, true); });
  }
  var stored = null;
  try { stored = localStorage.getItem(R.KEY); } catch (e) {}
  R.set(stored === '1', false);
};

Draftly.ruler.init();
