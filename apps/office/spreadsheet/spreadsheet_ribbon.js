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
var SHEET_COLLAPSE = null;   /* DF13c Word-style collapse (../shared/office-collapse.js) */

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
  /* DF13: hover opens tabs / File menu (shared ../shared/office-hover.js). */
  if (typeof OfficeHover !== "undefined") {
    var fb = document.getElementById("of-file-btn"), fm = document.getElementById("of-file-menu");
    OfficeHover.attach({
      tabsEl: tabsEl, tabSelector: ".of-tab",
      selectTab: function (id) { ribbonSelectTab(id); if (SHEET_COLLAPSE) SHEET_COLLAPSE.peek(); },
      fileBtn: fb, fileMenu: fm,
      isFileOpen: function () { return !!(fm && !fm.hidden); },
      setFile: function (v) { ribbonSetFile(v); },
      enabled: function () { return !SHEET_SETTINGS || SHEET_SETTINGS.s.hoverTabs !== false; }
    });
  }
  var rib = document.getElementById("of-ribbon");
  if (typeof OfficeCollapse !== "undefined" && rib) {
    rib.classList.add("of-collapsible");
    SHEET_COLLAPSE = OfficeCollapse.attach({
      tabsEl: tabsEl, tabSelector: ".of-tab", ribbonEl: rib,
      docEl: document.getElementById("sheet-wrap"),
      collapsed: !!(SHEET_SETTINGS && SHEET_SETTINGS.s.ribbonCollapsed),
      onUserChange: function (v) { if (SHEET_SETTINGS) SHEET_SETTINGS.set("ribbonCollapsed", v); else SHEET_COLLAPSE.apply(v); }
    });
  }
  if (typeof initPageSetup === "function") initPageSetup();
}
