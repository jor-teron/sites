/*
 * base-quick.js  (HO1 Hub Office Quick Access)
 * Registers Base with ../../shared/office-quick.js (bar before File; Hub title bar through
 * ../../shared/office-hubbar.js).
 *   Undo / Redo: BaseHistory (BS5, in-memory, ~100 steps). Disabled when the stack is empty.
 *   Save = BaseStore.saveNow() now + ✓ Saved tick (fails when storage is memory-only).
 *   Print = window.print() (same as File > Print).
 *   Ctrl/Cmd+S and Ctrl/Cmd+P go through OfficeQuick; Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z go to
 *   BaseHistory except inside a text field, where the browser's own undo still runs.
 * Loads early (no edits to base-ui.js / base-store.js) and registers on DOMContentLoaded,
 * after base-ui.js has built the ribbon.
 * DEPENDS: OfficeQuick, BaseStore, BaseHistory, BASE, BASE_RIBBON_TABS, BASE_RIBBON, BASE_COLLAPSE, ribbonSelectTab, ribbonSetFile.
 */
(function () {
  function start() {
    if (typeof OfficeQuick === "undefined" || typeof BaseStore === "undefined") return;
    var fm = document.getElementById("of-file-menu");
    function activeTab() {
      var t = document.querySelector("#of-tabs .of-tab[aria-selected='true']");
      return t ? t.getAttribute("data-tab") : "home";
    }
    OfficeQuick.register({
      app: "Base",
      save: function () { BaseStore.saveNow(); return !BASE.memOnly; },
      print: function () { ribbonSetFile(false); window.print(); },
      undo: function () { if (typeof BaseHistory !== "undefined") BaseHistory.undo(); },
      redo: function () { if (typeof BaseHistory !== "undefined") BaseHistory.redo(); },
      canUndo: function () { return typeof BaseHistory !== "undefined" && BaseHistory.canUndo(); },
      canRedo: function () { return typeof BaseHistory !== "undefined" && BaseHistory.canRedo(); },
      undoKey: function (ev) {
        var tg = ev && ev.target, tag = tg && tg.tagName;
        var editable = tg && (tg.isContentEditable || tag === "TEXTAREA" || (tag === "INPUT" && !/^(checkbox|radio|button|submit|reset|file|range|color)$/i.test(tg.type) && !tg.readOnly));
        return !editable;
      },
      tabs: function () { return [{ id: "file", label: "File" }].concat(BASE_RIBBON_TABS.map(function (t) { return { id: t.id, label: t.label }; })); },
      activeTab: activeTab,
      onTab: function (id) {
        if (id === "file") {
          var open = !!(fm && !fm.hidden);
          ribbonSetFile(!open);
          if (!open && fm && document.body.classList.contains("in-hub")) { fm.style.top = "8px"; fm.style.left = "8px"; }
          return;
        }
        if (fm && !fm.hidden) ribbonSetFile(false);
        ribbonSelectTab(id);
        if (BASE_COLLAPSE) BASE_COLLAPSE.peek(true);
      },
      mount: document.getElementById("of-topbar"),
      before: document.getElementById("of-file-btn"),
      fallback: document.getElementById("of-ribbon")
    });
    if (BASE_RIBBON) {
      var sel = BASE_RIBBON.select;
      BASE_RIBBON.select = function () { var r = sel.apply(this, arguments); OfficeQuick.refresh(); return r; };
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
