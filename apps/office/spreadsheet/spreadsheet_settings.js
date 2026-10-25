/*
 * spreadsheet_settings.js
 * SH1 Settings panel for Spreadsheet (gear at the right of the top bar), built with the shared
 * ../shared/office-settings.js. One localStorage key 'spreadsheet_settings'.
 * View: theme (light / dark / auto via ../shared/office-theme.js), gridlines, formula bar.
 * Editing: default cell font and size. About: version + reset.
 * Runs at load (scripts sit at the end of <body>) so the theme applies before first paint.
 */
var SHEET_SETTINGS_KEY = "spreadsheet_settings";
var SHEET_THEME_KEY = "spreadsheet_theme";      // resolved 'dark' | 'light' for other readers
var SHEET_VERSION = "SH1";
var SHEET_FONTS = ["Segoe UI", "Arial", "Calibri", "Times New Roman", "Consolas"];
var SHEET_SIZES = [11, 12, 13, 14, 16, 18];
var SHEET_SETTINGS = null;

function sheetApplySetting(k) {
  var s = SHEET_SETTINGS.s, b = document.body;
  if (!k || k === "theme") OfficeTheme.apply(OfficeTheme.isDark(s.theme), { lightClass: "sheet-light", key: SHEET_THEME_KEY });
  if (!k || k === "gridlines") b.classList.toggle("sheet-no-grid", !s.gridlines);
  if (!k || k === "formulaBar") {
    var fr = document.getElementById("sheet-formula-row");
    if (fr) fr.hidden = !s.formulaBar;
  }
  if (!k || k === "font" || k === "fontSize") {
    b.style.setProperty("--sheet-font", "'" + s.font + "', system-ui, sans-serif");
    b.style.setProperty("--sheet-font-size", s.fontSize + "px");
  }
}

function initSheetSettings() {
  if (typeof OfficeSettings === "undefined") return;
  SHEET_SETTINGS = OfficeSettings.create({
    key: SHEET_SETTINGS_KEY,
    defaults: { theme: "dark", gridlines: true, formulaBar: true, font: "Segoe UI", fontSize: 13 },
    gearBtn: document.getElementById("settingsBtn"),
    validate: function (s) { if (["light", "dark", "auto"].indexOf(s.theme) === -1) s.theme = "dark"; },
    sections: [
      { title: "View", rows: [
        { key: "theme", type: "select", id: "set-theme", label: "Theme", options: OfficeTheme.modes },
        { key: "gridlines", type: "switch", id: "set-gridlines", label: "Gridlines" },
        { key: "formulaBar", type: "switch", id: "set-formula-bar", label: "Formula bar" }
      ] },
      { title: "Editing", rows: [
        { key: "font", type: "select", id: "set-font", label: "Default font", options: SHEET_FONTS.map(function (f) { return [f, f]; }) },
        { key: "fontSize", type: "select", id: "set-font-size", label: "Default size", cast: Number, options: SHEET_SIZES.map(function (n) { return [n, n + " px"]; }) }
      ] },
      { title: "About", rows: [{ type: "about", id: "set-version", text: "Spreadsheet " + SHEET_VERSION }] }
    ],
    onChange: function (k) { sheetApplySetting(k); },
    onReset: function () { sheetApplySetting(); },
    confirm: function (msg) {
      return typeof OfficeDialog !== "undefined" && OfficeDialog.confirm
        ? OfficeDialog.confirm({ title: "Reset settings?", message: msg, okLabel: "Reset" })
        : window.confirm(msg);
    },
    toast: function (m) { OfficeToast.show(m); }
  });
  sheetApplySetting();
  OfficeTheme.watch(function () { if (SHEET_SETTINGS.s.theme === "auto") sheetApplySetting("theme"); });
}

initSheetSettings();
