/*
 * spreadsheet_quick.js  (HO1 Hub Office Quick Access)
 * Registers Spreadsheet's Undo / Redo / Save / Print with ../shared/office-quick.js
 * (bar before File; Hub title bar through ../shared/office-hubbar.js).
 *   Undo / Redo = spreadsheet_undo.js (snapshots of all cells, existing history).
 *   Save = saveStore() now + ✓ Saved tick (the sheet also autosaves after every change).
 *   Print = printSheet() (page setup from spreadsheet_page.js applies through @page).
 * Ctrl/Cmd+Z, Ctrl+Y, Ctrl/Cmd+Shift+Z go through OfficeQuick (spreadsheet_keys.js no longer
 * handles them); while typing in a cell or the formula bar the browser's own text undo applies.
 * DEPENDS: OfficeQuick, UNDO/undo/redo/undoButtons, saveStore, printSheet, SHEET_RIBBON_TABS,
 *          ribbonSelectTab, ribbonSetFile, SHEET_RIBBON, SHEET_COLLAPSE, SHEET_HUB, clipTarget.
 * Load after spreadsheet_hub.js.
 */
SHEET_INIT.push(function () {   /* runs in boot(), after initRibbon() */
  if (typeof OfficeQuick === "undefined") return;
  function activeTab() {
    var t = document.querySelector("#of-tabs .of-tab[aria-selected='true']");
    return t ? t.getAttribute("data-tab") : "home";
  }
  var fm = document.getElementById("of-file-menu");
  OfficeQuick.register({
    app: "Spreadsheet",
    undo: undo,
    redo: redo,
    canUndo: function () { return UNDO.past.length > 0; },
    canRedo: function () { return UNDO.future.length > 0; },
    save: function () {
      var st = document.getElementById("status");
      saveStore();
      return !(st && st.textContent === TXT.saveFailed);
    },
    print: printSheet,
    undoKey: function () { return !!clipTarget(); },
    tabs: function () { return [{ id: "file", label: "File" }].concat(SHEET_RIBBON_TABS.map(function (t) { return { id: t.id, label: t.label }; })); },
    activeTab: activeTab,
    onTab: function (id) {
      if (id === "file") {
        if (typeof SHEET_HUB !== "undefined" && SHEET_HUB.openFile) SHEET_HUB.openFile(false);
        else ribbonSetFile(!!(fm && fm.hidden));
        return;
      }
      if (fm && !fm.hidden) ribbonSetFile(false);
      ribbonSelectTab(id);
      if (typeof SHEET_COLLAPSE !== "undefined" && SHEET_COLLAPSE) SHEET_COLLAPSE.peek(true);
    },
    mount: document.getElementById("of-topbar"),
    before: document.getElementById("of-file-btn"),
    fallback: document.getElementById("of-ribbon")
  });
  var ub = undoButtons;
  undoButtons = function () { var r = ub.apply(this, arguments); OfficeQuick.refresh(); return r; };
  if (SHEET_RIBBON) {
    var sel = SHEET_RIBBON.select;
    SHEET_RIBBON.select = function () { var r = sel.apply(this, arguments); OfficeQuick.refresh(); return r; };
  }
});
