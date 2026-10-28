/*
 * base-quick.js  (HO1 Hub Office Quick Access)
 * Registers Base with ../../shared/office-quick.js (bar before File; Hub title bar through
 * ../../shared/office-hubbar.js).
 *   Undo / Redo: Base has no history yet, so both stay disabled (Base Undo/Redo is a later release).
 *   Save = BaseStore.saveNow() now + ✓ Saved tick (fails when storage is memory-only).
 *   Print = window.print() (same as File > Print).
 *   Ctrl/Cmd+S and Ctrl/Cmd+P go through OfficeQuick; Ctrl+Z / Ctrl+Y stay native (text fields).
 * Loads early (no edits to base-ui.js / base-store.js) and registers on DOMContentLoaded,
 * after base-ui.js has built the ribbon.
 * DEPENDS: OfficeQuick, BaseStore, BASE, BASE_RIBBON_TABS, BASE_RIBBON, BASE_COLLAPSE, ribbonSelectTab, ribbonSetFile.
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
      undoKey: function () { return false; },
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
