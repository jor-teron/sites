/* ============================================================
   FILE: modules/writer-view.js
   DF25: was modules/draftly-view.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Fit-to-screen page scaling and in-app popups (Recent, Page).
   HOW: #pages is laid out at true A4 size and scaled with a CSS
        transform; #pagesScaler takes the scaled size so the
        workspace scrolls correctly with no sideways scroll.
        Layout (and writer-flow.js measuring) is never scaled.
        Print / PDF / DOCX ignore the scale.
   DEPENDS: Writer.config, Writer.marks (optional)
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.view = {};
Writer.view.zoom = 1;       /* effective scale = fit-to-width x user zoom */
Writer.view.userZoom = 1;   /* status-bar zoom (writer-zoom.js) */
Writer.view.CM_PX = 96 / 2.54;

/* Recompute the scale from the workspace width. */
Writer.view.fit = function fit() {
  var cfg = Writer.config;
  var ws = document.getElementById('workspace');
  var pages = document.getElementById('pages');
  var scaler = document.getElementById('pagesScaler');
  if (!ws || !pages || !scaler) return;
  var cs = getComputedStyle(ws);
  var avail = ws.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  var landscape = document.body.classList.contains(cfg.landscapeClass);
  var paperW = (landscape ? cfg.paperHeightCm : cfg.paperWidthCm) * Writer.view.CM_PX;
  var z = avail > 0 ? Math.min(1, avail / paperW) : 1;
  z = Math.floor(z * (Writer.view.userZoom || 1) * 1000) / 1000;
  var changed = z !== Writer.view.zoom;
  Writer.view.zoom = z;
  pages.style.transform = z === 1 ? '' : 'scale(' + z + ')';
  pages.style.width = paperW + 'px';
  Writer.view.size();
  if (changed && Writer.marks) Writer.marks.schedule();
};

/* Give the scaler the scaled size of the pages column. */
Writer.view.size = function size() {
  var pages = document.getElementById('pages');
  var scaler = document.getElementById('pagesScaler');
  if (!pages || !scaler) return;
  var z = Writer.view.zoom;
  scaler.style.width = Math.floor(pages.offsetWidth * z) + 'px';
  scaler.style.height = Math.ceil(pages.offsetHeight * z) + 'px';
};

/* ----- popups ----- */
Writer.view.openPop = null;

/* Show `menu` under `anchor`, kept inside the viewport. */
Writer.view.place = function place(menu, anchor) {
  var r = anchor.getBoundingClientRect();
  var vw = document.documentElement.clientWidth;
  menu.style.top = Math.round(r.bottom + 8) + 'px';
  menu.style.left = '0px';
  var w = menu.offsetWidth;
  var left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), vw - w - 8);
  menu.style.left = Math.round(Math.max(8, left)) + 'px';
};

Writer.view.togglePop = function togglePop(menuId, anchorId, force) {
  var menu = document.getElementById(menuId);
  var anchor = document.getElementById(anchorId);
  if (!menu || !anchor) return false;
  var show = typeof force === 'boolean' ? force : menu.hidden;
  if (Writer.view.openPop && Writer.view.openPop.menu !== menu) Writer.view.closePops();
  menu.hidden = !show;
  anchor.classList.toggle('active', show);
  anchor.setAttribute('aria-expanded', show ? 'true' : 'false');
  if (show) {
    Writer.view.place(menu, anchor);
    Writer.view.openPop = { menu: menu, anchor: anchor };
  } else if (Writer.view.openPop && Writer.view.openPop.menu === menu) {
    Writer.view.openPop = null;
  }
  return show;
};

Writer.view.closePops = function closePops() {
  var o = Writer.view.openPop;
  if (!o) return;
  o.menu.hidden = true;
  o.anchor.classList.remove('active');
  o.anchor.setAttribute('aria-expanded', 'false');
  Writer.view.openPop = null;
};

/* Page panel contents: orientation buttons and info lines. */
Writer.view.syncPagePanel = function syncPagePanel() {
  var cfg = Writer.config;
  var landscape = document.body.classList.contains(cfg.landscapeClass);
  var btns = document.querySelectorAll('#pagePanel .seg-btn[data-orient]');
  var opts = document.querySelectorAll('#pagePanel .seg-btn[data-size], #pagePanel .seg-btn[data-margins]');
  for (var j = 0; j < opts.length; j++) {
    var hit = opts[j].getAttribute('data-size') === cfg.paperSize || opts[j].getAttribute('data-margins') === cfg.marginPreset;
    opts[j].classList.toggle('active', hit);
    opts[j].setAttribute('aria-pressed', hit ? 'true' : 'false');
  }
  var cm = document.getElementById('customMarginsBtn');
  if (cm) {
    cm.classList.toggle('active', cfg.marginPreset === 'custom');
    cm.setAttribute('aria-pressed', cfg.marginPreset === 'custom' ? 'true' : 'false');
  }
  var sl = document.getElementById('paperSizeLabel');
  if (sl) sl.textContent = cfg.pageSizeName;
  for (var i = 0; i < btns.length; i++) {
    var on = (btns[i].getAttribute('data-orient') === 'landscape') === landscape;
    btns[i].classList.toggle('active', on);
    btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  var m = document.getElementById('marginInfo');
  if (m) m.textContent = 'T ' + cfg.marginTopCm + ' · B ' + cfg.marginBottomCm + ' · L ' + cfg.marginLeftCm + ' · R ' + cfg.marginRightCm + ' cm';
};

Writer.view.init = function init() {
  var pages = document.getElementById('pages');
  if (window.ResizeObserver && pages) {
    new ResizeObserver(function () { Writer.view.size(); }).observe(pages);
  }
  var t = null;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(function () {
      Writer.view.fit();
      if (Writer.view.openPop) Writer.view.place(Writer.view.openPop.menu, Writer.view.openPop.anchor);
    }, 60);
  });
  document.addEventListener('mousedown', function (e) {
    var o = Writer.view.openPop;
    if (!o) return;
    if (o.menu.contains(e.target) || o.anchor.contains(e.target)) return;
    Writer.view.closePops();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') Writer.view.closePops();
  });
  var tb = document.getElementById('toolbar');
  /* keep an open popup under its button while the toolbar row scrolls */
  if (tb) tb.addEventListener('scroll', function () {
    var o = Writer.view.openPop;
    if (o) Writer.view.place(o.menu, o.anchor);
  }, { passive: true });
  var opts = document.querySelectorAll('#pagePanel .seg-btn[data-size], #pagePanel .seg-btn[data-margins]');
  for (var k = 0; k < opts.length; k++) {
    opts[k].addEventListener('click', function (e) {
      var cfg = Writer.config;
      var b = e.currentTarget;
      Writer.ui.setPage(b.getAttribute('data-size') || cfg.paperSize, b.getAttribute('data-margins') || cfg.marginPreset);
      Writer.ui.showToast('Page: ' + cfg.pageSizeName + ', ' + cfg.marginLabel() + ' margins');
    });
  }
  var btns = document.querySelectorAll('#pagePanel .seg-btn[data-orient]');
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', function (e) {
      var mode = e.currentTarget.getAttribute('data-orient');
      Writer.ui.setOrientation(mode);
      Writer.ui.showToast('Orientation: ' + mode);
    });
  }
  Writer.view.syncPagePanel();
  Writer.view.fit();
};
