/*
 * apps/office/shared/office-hover.js
 * DF13 hover-to-open for the Office ribbon (Draftly + Spreadsheet). Mouse only:
 * touch / pen keep plain click behaviour.
 *   OfficeHover.attach({
 *     tabsEl, tabSelector: '.of-tab',          // container + tab buttons (data-tab)
 *     selectTab: fn(id),                       // app's existing select-tab function
 *     fileBtn, fileMenu, isFileOpen: fn(), setFile: fn(show),
 *     enabled: fn() -> bool,                   // e.g. settings 'hoverTabs'
 *     delay: 100, closeDelay: 300
 *   });
 * Hover a tab 100 ms -> selectTab (leaving earlier cancels, so no flicker).
 * Hover File 100 ms -> menu opens; it closes 300 ms after the mouse leaves button + menu
 * (re-entering cancels). Only hover-opened menus auto-close; a click on File while
 * hover-open "pins" it open instead of toggling it shut.
 */
var OfficeHover = (function () {
  var fine = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;
  function isMouse(e) { return e.pointerType ? e.pointerType === 'mouse' : !!(fine && fine.matches); }

  function attach(o) {
    var delay = o.delay || 100, closeDelay = o.closeDelay || 300;
    var on = function () { return o.enabled ? !!o.enabled() : true; };
    var tabT = null, openT = null, closeT = null, byHover = false;
    function clear(t) { if (t) clearTimeout(t); return null; }

    if (o.tabsEl) {
      o.tabsEl.addEventListener('pointerover', function (e) {
        var t = e.target.closest && e.target.closest(o.tabSelector);
        if (!t || !isMouse(e) || !on()) return;
        tabT = clear(tabT);
        tabT = setTimeout(function () { tabT = null; if (on()) o.selectTab(t.getAttribute('data-tab')); }, delay);
      });
      o.tabsEl.addEventListener('pointerout', function (e) {
        var t = e.target.closest && e.target.closest(o.tabSelector);
        if (t && e.relatedTarget && t.contains(e.relatedTarget)) return;
        tabT = clear(tabT);
      });
    }

    var btn = o.fileBtn, menu = o.fileMenu;
    if (btn && menu) {
      var inside = function (n) { return n && (btn.contains(n) || menu.contains(n)); };
      var enter = function (e) {
        if (!isMouse(e) || !on()) return;
        closeT = clear(closeT);
        if (e.currentTarget === btn && !o.isFileOpen() && !openT) {
          openT = setTimeout(function () {
            openT = null;
            if (on() && !o.isFileOpen()) { o.setFile(true); byHover = true; }
          }, delay);
        }
      };
      var leave = function (e) {
        if (!isMouse(e) || inside(e.relatedTarget)) return;
        openT = clear(openT);
        if (byHover && o.isFileOpen()) {
          closeT = clear(closeT);
          closeT = setTimeout(function () {
            closeT = null;
            if (byHover && o.isFileOpen()) o.setFile(false);
            byHover = false;
          }, closeDelay);
        }
      };
      [btn, menu].forEach(function (el) {
        el.addEventListener('pointerenter', enter);
        el.addEventListener('pointerleave', leave);
      });
      /* Click while hover-open: pin it (don't toggle it shut). Capture runs before app's toggle. */
      btn.addEventListener('click', function (e) {
        openT = clear(openT); closeT = clear(closeT);
        if (byHover && o.isFileOpen()) { byHover = false; e.stopImmediatePropagation(); e.preventDefault(); }
        else byHover = false;
      }, true);
      document.addEventListener('pointerdown', function (e) { if (!inside(e.target)) { byHover = false; closeT = clear(closeT); } }, true);
    }
    return { cancel: function () { tabT = clear(tabT); openT = clear(openT); closeT = clear(closeT); } };
  }
  return { attach: attach };
})();
window.OfficeHover = OfficeHover;
