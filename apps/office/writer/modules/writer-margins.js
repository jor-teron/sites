/* ============================================================
   FILE: modules/writer-margins.js
   DF25: was modules/draftly-margins.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Page tab > Margins > Custom…: a small dialog for top /
         bottom / left / right in cm (0.5–5, step 0.1) with
         "Same for all". A global pref like the presets.
   DEPENDS: config, ui, view, storage
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.margins = {};
Writer.margins.IDS = { top: 'mTop', bottom: 'mBottom', left: 'mLeft', right: 'mRight' };

Writer.margins.el = function el(id) { return document.getElementById(id); };

/* Fill the dialog from the active margins. */
Writer.margins.fill = function fill() {
  var M = Writer.margins;
  var cfg = Writer.config;
  var cur = { top: cfg.marginTopCm, bottom: cfg.marginBottomCm, left: cfg.marginLeftCm, right: cfg.marginRightCm };
  Object.keys(M.IDS).forEach(function (k) { M.el(M.IDS[k]).value = String(cur[k]); });
  var same = cur.top === cur.bottom && cur.top === cur.left && cur.top === cur.right;
  M.el('mSame').checked = same;
  M.syncSame();
};

/* With "Same for all", only Top is typed; the rest follow it. */
Writer.margins.syncSame = function syncSame() {
  var M = Writer.margins;
  var same = M.el('mSame').checked;
  ['mBottom', 'mLeft', 'mRight'].forEach(function (id) {
    M.el(id).disabled = same;
    if (same) M.el(id).value = M.el('mTop').value;
  });
};

Writer.margins.read = function read() {
  var M = Writer.margins;
  var v = {};
  Object.keys(M.IDS).forEach(function (k) { v[k] = M.el(M.IDS[k]).value; });
  if (M.el('mSame').checked) v.bottom = v.left = v.right = v.top;
  return Writer.config.clampMargins(v);
};

Writer.margins.open = function open(show) {
  var shown = Writer.view.togglePop('marginDialog', 'customMarginsBtn', show);
  if (shown) {
    Writer.margins.fill();
    setTimeout(function () { var t = Writer.margins.el('mTop'); t.focus(); t.select(); }, 0);
  }
  /* togglePop marks the anchor active while open; keep the real state after. */
  if (!shown) Writer.view.syncPagePanel();
};

Writer.margins.apply = function apply() {
  var cfg = Writer.config;
  var m = Writer.margins.read();
  Writer.view.togglePop('marginDialog', 'customMarginsBtn', false);
  Writer.ui.setPage(cfg.paperSize, 'custom', m);
  Writer.ui.showToast('Margins: T ' + m.top + ' · B ' + m.bottom + ' · L ' + m.left + ' · R ' + m.right + ' cm');
};

Writer.margins.bind = function bind() {
  var M = Writer.margins;
  var btn = M.el('customMarginsBtn');
  if (!btn || !M.el('marginDialog')) return;
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    M.open(M.el('marginDialog').hidden);
  });
  M.el('mSame').addEventListener('change', M.syncSame);
  M.el('mTop').addEventListener('input', function () { if (M.el('mSame').checked) M.syncSame(); });
  M.el('mApply').addEventListener('click', function (e) { e.preventDefault(); M.apply(); });
  M.el('mCancel').addEventListener('click', function (e) { e.preventDefault(); M.open(false); });
  M.el('marginDialog').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); M.apply(); }
  });
};
