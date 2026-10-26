/*
 * apps/office/shared/office-collapse.js
 * DF13c Word-style ribbon collapse (Draftly + Spreadsheet). Look: office-collapse.css.
 *   var C = OfficeCollapse.attach({
 *     tabsEl, tabSelector,          // tab row + tab buttons (data-tab, aria-selected)
 *     ribbonEl,                     // the ribbon <nav> holding the panels
 *     docEl,                        // document / sheet area: a click there hides a peek
 *     collapsed: bool,              // initial (persisted) state
 *     onUserChange: fn(collapsed),  // user toggled: app stores it (settings), then calls C.apply
 *     onLayout: fn()                // page / ruler / grid relayout after collapse or expand
 *   });
 *   C.apply(bool) · C.isCollapsed() · C.peek(force) · C.unpeek() · C.isPeek()
 * Click the active tab -> collapse (body.ribbon-collapsed, tab row stays).
 * Collapsed: clicking / hover-selecting a tab shows its ribbon floating over the page (no layout
 * shift); it hides on a click in docEl, Esc, or the mouse leaving ribbon + tabs for 300 ms.
 * Double-click a tab -> expand again (pinned).
 */
var OfficeCollapse = (function () {
  function attach(o) {
    var C = {}, collapsed = false, peek = false, leaveT = null, quietUntil = 0;
    var body = document.body, rib = o.ribbonEl, tabs = o.tabsEl, sel = o.tabSelector;
    function clear() { if (leaveT) { clearTimeout(leaveT); leaveT = null; } }
    function layout() {
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
      if (o.onLayout) o.onLayout();
    }
    function place() {
      var r = tabs && tabs.offsetParent !== null ? tabs.getBoundingClientRect() : null;
      var top = r && r.height ? r.bottom : 0;
      rib.style.setProperty('--of-peek-top', Math.round(top) + 'px');
    }
    C.isCollapsed = function () { return collapsed; };
    C.isPeek = function () { return peek; };
    C.apply = function (v) {
      v = !!v;
      if (v === collapsed) return;
      collapsed = v; C.unpeek();
      body.classList.toggle('ribbon-collapsed', v);
      layout();
    };
    C.peek = function (force) {
      if (!collapsed || (!force && Date.now() < quietUntil)) return;   /* no hover-peek right after collapsing */
      clear(); place();
      if (!peek) { peek = true; rib.classList.add('of-peek'); }
    };
    C.unpeek = function () {
      clear();
      if (!peek) return;
      peek = false; rib.classList.remove('of-peek');
    };
    function user(v) { if (o.onUserChange) o.onUserChange(v); else C.apply(v); }

    if (tabs) {
      var wasActive = null;
      tabs.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest(sel);
        wasActive = t && t.getAttribute('aria-selected') === 'true' ? t : null;
      }, true);
      tabs.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest(sel);
        if (!t) return;
        if (!collapsed) { if (wasActive === t) { quietUntil = Date.now() + 400; user(true); } }
        else if (peek && wasActive === t) C.unpeek();
        else C.peek(true);
      });
      tabs.addEventListener('dblclick', function (e) {
        var t = e.target.closest && e.target.closest(sel);
        if (t && collapsed) user(false);
      });
    }
    function inside(n) { return n && (rib.contains(n) || (tabs && tabs.contains(n))); }
    function popup(n) { return n && n.closest && n.closest('[role="menu"], .pop-menu, .of-settings, dialog, .of-dialog'); }
    [rib, tabs].forEach(function (el) {
      if (!el) return;
      el.addEventListener('pointerenter', clear);
      el.addEventListener('pointerleave', function (e) {
        if (!peek || e.pointerType !== 'mouse' || inside(e.relatedTarget) || popup(e.relatedTarget)) return;
        clear(); leaveT = setTimeout(function () { leaveT = null; C.unpeek(); }, 300);
      });
    });
    document.addEventListener('pointerdown', function (e) {
      if (peek && o.docEl && o.docEl.contains(e.target)) C.unpeek();
    }, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && peek) C.unpeek(); });
    window.addEventListener('resize', function () { if (peek) place(); });
    C.apply(o.collapsed);
    return C;
  }
  return { attach: attach };
})();
window.OfficeCollapse = OfficeCollapse;
