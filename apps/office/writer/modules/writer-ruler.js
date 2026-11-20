/* ============================================================
   FILE: modules/writer-ruler.js
   DF25: was modules/draftly-ruler.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: DF4 horizontal cm ruler above the page. Follows zoom,
         paper size and orientation; margins shaded grey. Drag
         the left / right margin edges (mouse + touch, snap
         0.1 cm) to set Custom margins via Writer.ui.setPage.
         Page tab "Ruler" toggle, default off ('writer_ruler').
         DW17: sets --rs (R.scale, pure) so track, ticks and
         indent markers grow / shrink with zoom.
         DW19: left and right margins are linked: dragging one edge
         moves the other to the same value (text stays centred).
         Alt while dragging = only that side. Setting 'linkMargins'
         (writer-settings.js, on by default); a chain-link button on
         the ruler (touch screens) flips it. Math: R.linkMargins (pure).
   DEPENDS: config, view, ui (setPage), storage via ui
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.ruler = {};
Writer.ruler.KEY = 'writer_ruler';   /* (before DF25) Writer.ruler.KEY = 'draftly_ruler'; */
Writer.ruler.on = false;
Writer.ruler.drag = null;

Writer.ruler.el = function el(id) { return document.getElementById(id); };

/* Build the ruler node once, just above #pagesScaler. */
Writer.ruler.build = function build() {
  var R = Writer.ruler;
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
    '<span class="ruler-tip" id="rulerTip" hidden></span>' +
    /* DW19: link toggle (shown on touch screens, ui/ruler.css) */
    '<button type="button" class="ruler-link" id="rulerLink" aria-pressed="true" title="Left and right margins are linked (tap to unlink)" aria-label="Link left and right margins">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="rl-a" d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path class="rl-b" d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/><path class="rl-cut" d="M4 4l16 16"/></svg></button>' +
    '</div>';
  ws.insertBefore(r, scaler);
  ['rulerGrabL', 'rulerGrabR'].forEach(function (id) { R.el(id).addEventListener('pointerdown', R.start); });
  var link = R.el('rulerLink');
  if (link) {
    link.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    link.addEventListener('mousedown', function (e) { e.preventDefault(); });
    link.addEventListener('click', function (e) { e.preventDefault(); R.setLink(!R.linked()); });
  }
};

/* DW19: the margin link setting (writer_settings.linkMargins; on when missing). */
Writer.ruler.linkOn = true;   /* used only when the Settings module is missing */
Writer.ruler.linkedFrom = function linkedFrom(s) {
  return !(s && s.linkMargins === false);
};
Writer.ruler.linked = function linked() {
  var st = Writer.settings && Writer.settings.s;
  return st ? Writer.ruler.linkedFrom(st) : Writer.ruler.linkOn;
};
Writer.ruler.setLink = function setLink(on) {
  on = !!on;
  if (Writer.settings && Writer.settings.s && Writer.settings.set && Writer.settings.panel) Writer.settings.set('linkMargins', on);
  else if (Writer.settings && Writer.settings.s) Writer.settings.s.linkMargins = on;
  else Writer.ruler.linkOn = on;
  Writer.ruler.syncLink();
  if (Writer.ui && Writer.ui.showToast) Writer.ui.showToast(on ? 'Left and right margins linked' : 'Left and right margins unlinked');
  return on;
};
Writer.ruler.syncLink = function syncLink() {
  var b = Writer.ruler.el('rulerLink');
  if (!b) return;
  var on = Writer.ruler.linked();
  b.setAttribute('aria-pressed', String(on));
  b.classList.toggle('active', on);
  b.title = on ? 'Left and right margins are linked (tap to unlink)' : 'Left and right margins are separate (tap to link)';
};

/* DW19: new margins for a drag. Pure.
   o: side 'left'|'right', start {left, right} (cm), dx (cm, pointer moved right = +),
      w paper width (cm), linked (setting), alt (Alt held), min, max (cfg custom limits), minText (2).
   Linked (and no Alt): both sides take the dragged value, so the text stays centred;
   the text width never goes below minText. Otherwise only that side moves (before DW19 rule).
   Values snap to 0.1 cm. Returns { left, right, linked, tip }. */
Writer.ruler.linkMargins = function linkMargins(o) {
  o = o || {};
  var st = o.start || {};
  var min = o.min != null ? o.min : 0.5, maxCfg = o.max != null ? o.max : 5;
  var minText = o.minText != null ? o.minText : 2;
  var w = Number(o.w) || 21;
  var side = o.side === 'right' ? 'right' : 'left';
  var dx = Number(o.dx) || 0;
  var v = side === 'left' ? st.left + dx : st.right - dx;
  var link = !!o.linked && !o.alt;
  var out = { left: st.left, right: st.right, linked: link };
  var max;
  if (link) {
    max = Math.min(maxCfg, (w - minText) / 2);
    v = Math.round(Math.max(min, Math.min(max, v)) * 10) / 10;
    if ((w - 2 * v) < minText - 1e-9) v = Math.floor(((w - minText) / 2) * 10) / 10;
    out.left = v; out.right = v;
  } else {
    var other = side === 'left' ? st.right : st.left;
    max = Math.min(maxCfg, w - other - minText);   /* keep at least 2 cm of text */
    v = Math.round(Math.max(min, Math.min(max, v)) * 10) / 10;
    out[side] = v;
  }
  out.tip = Writer.ruler.tipLabel(out.left, out.right);
  return out;
};
Writer.ruler.tipLabel = function tipLabel(l, r) {
  return 'Left ' + Number(l).toFixed(1) + ' \u00b7 Right ' + Number(r).toFixed(1) + ' cm';
};

/* Scaled px per cm and paper width in cm. */
Writer.ruler.metrics = function metrics() {
  var cfg = Writer.config;
  var land = document.body.classList.contains(cfg.landscapeClass);
  return { cm: Writer.view.CM_PX * (Writer.view.zoom || 1), w: land ? cfg.paperHeightCm : cfg.paperWidthCm };
};

/* DW17: ruler / indent-marker scale for a zoom: the zoom, held to 0.8-1.6
   so markers stay grabbable at 50% and do not get huge at 200%. Pure. */
Writer.ruler.scale = function scale(zoom) {
  var z = Number(zoom);
  if (!isFinite(z) || z <= 0) z = 1;
  return Math.round(Math.max(0.8, Math.min(1.6, z)) * 1000) / 1000;
};

/* Redraw ticks, numbers and margin shading. */
Writer.ruler.sync = function sync(live) {
  var R = Writer.ruler, cfg = Writer.config;
  var r = R.el('ruler');
  if (!r || !R.on) return;
  var m = R.metrics();
  var track = R.el('rulerTrack');
  track.style.width = (m.w * m.cm) + 'px';
  /* DW17: track height, ticks, labels and indent markers follow zoom (ui/ruler.css). */
  r.style.setProperty('--rs', String(R.scale(Writer.view.zoom || 1)));
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

Writer.ruler.set = function set(on, save) {
  var R = Writer.ruler;
  R.on = !!on;
  var r = R.el('ruler'), btn = R.el('rulerToggle');
  if (r) r.hidden = !R.on;
  if (btn) { btn.setAttribute('aria-pressed', String(R.on)); btn.classList.toggle('active', R.on); }
  if (save) { try { localStorage.setItem(R.KEY, R.on ? '1' : '0'); } catch (e) {} }
  R.lastKey = null;
  R.sync();
};

/* ----- drag ----- */
Writer.ruler.start = function start(e) {
  var R = Writer.ruler, cfg = Writer.config;
  e.preventDefault();
  var g = e.currentTarget;
  try { g.setPointerCapture(e.pointerId); } catch (x) {}
  R.drag = { side: g.getAttribute('data-side'), x0: e.clientX, g: g,
    m: { top: cfg.marginTopCm, bottom: cfg.marginBottomCm, left: cfg.marginLeftCm, right: cfg.marginRightCm } };
  R.drag.cur = Object.assign({}, R.drag.m);
  R.drag.alt = !!e.altKey;   /* DW19 */
  g.classList.add('dragging');
  g.addEventListener('pointermove', R.move);
  g.addEventListener('pointerup', R.end);
  g.addEventListener('pointercancel', R.end);
};

Writer.ruler.move = function move(e) {
  var R = Writer.ruler, d = R.drag, cfg = Writer.config;
  if (!d) return;
  var mt = R.metrics();
  var dx = (e.clientX - d.x0) / mt.cm;
  /* DW19: linked margins (R.linkMargins); Alt = only this side. The commented lines below are the before-DW19 math. */
  var nm = R.linkMargins({ side: d.side, start: d.m, dx: dx, w: mt.w, linked: R.linked(), alt: !!(e.altKey || d.alt),
    min: cfg.marginCustomMin || 0.5, max: cfg.marginCustomMax || 5, minText: 2 });
  d.cur.left = nm.left; d.cur.right = nm.right;
  R.sync(d.cur);
  var tip0 = R.el('rulerTip');
  tip0.hidden = false;
  tip0.textContent = nm.tip;
  tip0.style.left = (d.side === 'left' ? nm.left : mt.w - nm.right) * mt.cm + 'px';
  /* (before DW19) only the dragged side moved:
  var v = d.side === 'left' ? d.m.left + dx : d.m.right - dx;
  var other = d.side === 'left' ? d.m.right : d.m.left;
  var max = Math.min(cfg.marginCustomMax || 5, mt.w - other - 2);   // keep at least 2 cm of text
  v = Math.round(Math.max(cfg.marginCustomMin || 0.5, Math.min(max, v)) * 10) / 10;
  d.cur[d.side] = v;
  R.sync(d.cur);
  var tip = R.el('rulerTip');
  tip.hidden = false;
  tip.textContent = (d.side === 'left' ? 'L ' : 'R ') + v.toFixed(1) + ' cm';
  tip.style.left = (d.side === 'left' ? v : mt.w - v) * mt.cm + 'px'; */
};

Writer.ruler.end = function end() {
  var R = Writer.ruler, d = R.drag, cfg = Writer.config;
  if (!d) return;
  R.drag = null;
  d.g.classList.remove('dragging');
  d.g.removeEventListener('pointermove', R.move);
  d.g.removeEventListener('pointerup', R.end);
  d.g.removeEventListener('pointercancel', R.end);
  R.el('rulerTip').hidden = true;
  /* (before DW19) if (d.cur[d.side] === d.m[d.side]) { R.sync(); return; } */
  if (d.cur.left === d.m.left && d.cur.right === d.m.right) { R.sync(); return; }
  Writer.ui.setPage(cfg.paperSize, 'custom', d.cur);
  R.sync();
};

Writer.ruler.init = function init() {
  var R = Writer.ruler;
  R.build();
  /* Follow zoom / paper / orientation: every one of them ends in view.fit(). */
  var fit = Writer.view.fit;
  Writer.view.fit = function () { var out = fit.apply(this, arguments); R.sync(); return out; };
  var btn = R.el('rulerToggle');
  if (btn) {
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function (e) { e.preventDefault(); R.set(!R.on, true); });
  }
  var stored = null;
  try { stored = localStorage.getItem(R.KEY); } catch (e) {}
  R.set(stored === '1', false);
  R.syncLink();   /* DW19 */
};

Writer.ruler.init();
