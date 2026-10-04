/* ============================================================
   FILE: modules/draftly-view.js
   PROJECT: Draftly
   ROLE: Fit-to-screen page scaling and in-app popups (Recent, Page).
   HOW: #pages is laid out at true A4 size and scaled with a CSS
        transform; #pagesScaler takes the scaled size so the
        workspace scrolls correctly with no sideways scroll.
        Layout (and draftly-flow.js measuring) is never scaled.
        Print / PDF / DOCX ignore the scale.
   DEPENDS: Draftly.config, Draftly.marks (optional)
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.view = {};
Draftly.view.zoom = 1;
Draftly.view.CM_PX = 96 / 2.54;

/* Recompute the scale from the workspace width. */
Draftly.view.fit = function fit() {
  var cfg = Draftly.config;
  var ws = document.getElementById('workspace');
  var pages = document.getElementById('pages');
  var scaler = document.getElementById('pagesScaler');
  if (!ws || !pages || !scaler) return;
  var cs = getComputedStyle(ws);
  var avail = ws.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  var landscape = document.body.classList.contains(cfg.landscapeClass);
  var paperW = (landscape ? cfg.paperHeightCm : cfg.paperWidthCm) * Draftly.view.CM_PX;
  var z = avail > 0 ? Math.min(1, avail / paperW) : 1;
  z = Math.floor(z * 1000) / 1000;
  var changed = z !== Draftly.view.zoom;
  Draftly.view.zoom = z;
  pages.style.transform = z === 1 ? '' : 'scale(' + z + ')';
  pages.style.width = paperW + 'px';
  Draftly.view.size();
  if (changed && Draftly.marks) Draftly.marks.schedule();
};

/* Give the scaler the scaled size of the pages column. */
Draftly.view.size = function size() {
  var pages = document.getElementById('pages');
  var scaler = document.getElementById('pagesScaler');
  if (!pages || !scaler) return;
  var z = Draftly.view.zoom;
  scaler.style.width = Math.floor(pages.offsetWidth * z) + 'px';
  scaler.style.height = Math.ceil(pages.offsetHeight * z) + 'px';
};

/* ----- popups ----- */
Draftly.view.openPop = null;

/* Show `menu` under `anchor`, kept inside the viewport. */
Draftly.view.place = function place(menu, anchor) {
  var r = anchor.getBoundingClientRect();
  var vw = document.documentElement.clientWidth;
  menu.style.top = Math.round(r.bottom + 8) + 'px';
  menu.style.left = '0px';
  var w = menu.offsetWidth;
  var left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), vw - w - 8);
  menu.style.left = Math.round(Math.max(8, left)) + 'px';
};

Draftly.view.togglePop = function togglePop(menuId, anchorId, force) {
  var menu = document.getElementById(menuId);
  var anchor = document.getElementById(anchorId);
  if (!menu || !anchor) return false;
  var show = typeof force === 'boolean' ? force : menu.hidden;
  if (Draftly.view.openPop && Draftly.view.openPop.menu !== menu) Draftly.view.closePops();
  menu.hidden = !show;
  anchor.classList.toggle('active', show);
  anchor.setAttribute('aria-expanded', show ? 'true' : 'false');
  if (show) {
    Draftly.view.place(menu, anchor);
    Draftly.view.openPop = { menu: menu, anchor: anchor };
  } else if (Draftly.view.openPop && Draftly.view.openPop.menu === menu) {
    Draftly.view.openPop = null;
  }
  return show;
};

Draftly.view.closePops = function closePops() {
  var o = Draftly.view.openPop;
  if (!o) return;
  o.menu.hidden = true;
  o.anchor.classList.remove('active');
  o.anchor.setAttribute('aria-expanded', 'false');
  Draftly.view.openPop = null;
};

/* Page panel contents: orientation buttons and info lines. */
Draftly.view.syncPagePanel = function syncPagePanel() {
  var cfg = Draftly.config;
  var landscape = document.body.classList.contains(cfg.landscapeClass);
  var btns = document.querySelectorAll('#pagePanel .seg-btn');
  for (var i = 0; i < btns.length; i++) {
    var on = (btns[i].getAttribute('data-orient') === 'landscape') === landscape;
    btns[i].classList.toggle('active', on);
    btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  var m = document.getElementById('marginInfo');
  if (m) m.textContent = 'T ' + cfg.marginTopCm + ' · B ' + cfg.marginBottomCm + ' · L ' + cfg.marginLeftCm + ' · R ' + cfg.marginRightCm + ' cm';
};

Draftly.view.init = function init() {
  var pages = document.getElementById('pages');
  if (window.ResizeObserver && pages) {
    new ResizeObserver(function () { Draftly.view.size(); }).observe(pages);
  }
  var t = null;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(function () {
      Draftly.view.fit();
      if (Draftly.view.openPop) Draftly.view.place(Draftly.view.openPop.menu, Draftly.view.openPop.anchor);
    }, 60);
  });
  document.addEventListener('mousedown', function (e) {
    var o = Draftly.view.openPop;
    if (!o) return;
    if (o.menu.contains(e.target) || o.anchor.contains(e.target)) return;
    Draftly.view.closePops();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') Draftly.view.closePops();
  });
  var tb = document.getElementById('toolbar');
  /* keep an open popup under its button while the toolbar row scrolls */
  if (tb) tb.addEventListener('scroll', function () {
    var o = Draftly.view.openPop;
    if (o) Draftly.view.place(o.menu, o.anchor);
  }, { passive: true });
  var btns = document.querySelectorAll('#pagePanel .seg-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', function (e) {
      var mode = e.currentTarget.getAttribute('data-orient');
      Draftly.ui.setOrientation(mode);
      Draftly.ui.showToast('Orientation: ' + mode);
    });
  }
  Draftly.view.syncPagePanel();
  Draftly.view.fit();
};
