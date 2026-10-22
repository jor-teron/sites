/*
 * spreadsheet_ribbon.js
 * Spreadsheet ribbon setup: tab data + File menu, using the shared ../shared/office-ribbon.js.
 * Buttons keep their ids and are wired by spreadsheet_toolbar.js (wireUi), which calls
 * initRibbon() at the end. Tabs are plain data so a host (e.g. the Hub title bar) can render
 * them later and call ribbonSelectTab(id).
 */
var SHEET_RIBBON_TABS = [
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
  { id: "page", label: "Page" },
  { id: "data", label: "Data" }
];
var RIBBON_TAB_KEY = "spreadsheet-ribbon-tab";
var SHEET_RIBBON = null;

function ribbonSelectTab(id, focus) { if (SHEET_RIBBON) SHEET_RIBBON.select(id, focus); }
function ribbonSetFile(show) { if (SHEET_RIBBON) SHEET_RIBBON.setFile(show); }

function initRibbon() {
  var tabsEl = document.getElementById("of-tabs");
  if (!tabsEl || typeof OfficeRibbon === "undefined") return;
  SHEET_RIBBON = OfficeRibbon.create({
    tabs: SHEET_RIBBON_TABS,
    storageKey: RIBBON_TAB_KEY,
    tabsEl: tabsEl,
    fileBtn: document.getElementById("of-file-btn"),
    fileMenu: document.getElementById("of-file-menu")
  });
  if (typeof initPageSetup === "function") initPageSetup();
}
