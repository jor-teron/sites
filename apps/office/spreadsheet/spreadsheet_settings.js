/*
 * spreadsheet_settings.js
 * SH1 Settings panel for Spreadsheet (gear at the right of the top bar), built with the shared
 * ../shared/office-settings.js. One localStorage key 'spreadsheet_settings'.
 * View: theme, open tabs on hover (DF13), collapse ribbon (DF13c), (light / dark / auto via ../shared/office-theme.js), gridlines, formula bar.
 * Editing: default cell font and size. About: version + reset.
 * Runs at load (scripts sit at the end of <body>) so the theme applies before first paint.
 * SS1: Theme is Auto (default) / Light / Dark. Auto inside the Sites Hub (same-origin parent frame)
 * follows localStorage 'sites-hub.theme' ('dark' = Dark, anything else = Light), standalone it follows
 * prefers-color-scheme. Live: storage event, same-origin {type:'hub-prefs'} message, focus, system change.
 * Settings saved before SS1 (no ss1 flag) with the old default 'dark' move to 'auto' once.
 * HO3: the default cell size is 12 pt (16px at 96 dpi), the same as Writer. Settings fontSize is now a
 * CSS length string ("12pt"; older saves may keep "16px"). Before HO3 it was a bare number in px.
 * One-time move (ho3 flag): a saved 13 (the old factory default) becomes "12pt"; any other saved number
 * stays in px ("16" -> "16px") so nobody's chosen size changes. Explicit cell sizes (Home tab, .hos)
 * are still px and are not touched.
 */
var SHEET_SETTINGS_KEY = "spreadsheet_settings";
var SHEET_THEME_KEY = "spreadsheet_theme";      // resolved 'dark' | 'light' for other readers
/* (before SH18) var SHEET_VERSION = "SH14";                     // legacy: "SH13" / "SH12" / "SH11" / "SH10" / "SH9" */
/* (before SH21) var SHEET_VERSION = "SH18";                     // legacy: "SH14" / "SH13" / "SH12" / "SH11" / "SH10" / "SH9" */
var SHEET_VERSION = "SH21";                     // legacy: "SH18" / "SH14" / "SH13" / "SH12" / "SH11" / "SH10" / "SH9"
var SHEET_FONTS = ["Segoe UI", "Arial", "Calibri", "Times New Roman", "Consolas"];
/* (before HO3) var SHEET_SIZES = [11, 12, 13, 14, 16, 18];   // px */
var SHEET_SIZES = [9, 10, 11, 12, 14, 16, 18];   // HO3: Settings default size, in pt
var SHEET_DEFAULT_FONT_SIZE = "12pt";            // HO3: matches Writer (fontSizePt 12)
var SHEET_OLD_FACTORY_PX = 13;                   // HO3: factory default before HO3 (px)
var SHEET_SETTINGS = null;

/* ---------- HO3 pure helpers (no DOM; test-ho3-font-default.js) ---------- */
/* Settings fontSize -> CSS length. "12pt" / "16px" pass through; a bare number is old px. */
function sheetFontSizeCss(v) {
  if (typeof v === "number" && isFinite(v) && v > 0) return v + "px";
  if (typeof v === "string" && /^\d+(\.\d+)?(pt|px)$/.test(v)) return v;
  return SHEET_DEFAULT_FONT_SIZE;
}
/* Settings fontSize -> px number for layout math (pt * 96 / 72). */
function sheetFontSizePx(v) {
  var css = sheetFontSizeCss(v), n = parseFloat(css);
  return /pt$/.test(css) ? Math.round(n * 96 / 72 * 100) / 100 : n;
}
/* One-time HO3 move from the raw saved object. Returns the fontSize to use.
 * Already moved (ho3) or a valid string -> keep. Old factory 13 -> "12pt". Other old numbers -> "Npx". */
function sheetMigrateFontSize(raw) {
  var v = raw && typeof raw === "object" ? raw.fontSize : undefined;
  if (typeof v === "string") return sheetFontSizeCss(v);
  if (typeof v === "number" && isFinite(v) && v > 0) {
    if (raw.ho3 !== true && v === SHEET_OLD_FACTORY_PX) return SHEET_DEFAULT_FONT_SIZE;
    return v + "px";
  }
  return SHEET_DEFAULT_FONT_SIZE;
}
/* Settings "Default size" list: pt sizes, plus the saved px size (if any) so it still shows. */
function sheetFontSizeOptions(current) {
  var out = SHEET_SIZES.map(function (n) { return [n + "pt", n + " pt"]; });
  var css = sheetFontSizeCss(current);
  if (/px$/.test(css)) out.push([css, parseFloat(css) + " px (earlier setting)"]);
  return out;
}

/* SS1: Auto follows the Hub when framed by a same-origin Hub page (same rule as My Day MD3) */
var SHEET_HUB_THEME_KEY = "sites-hub.theme";
var SHEET_THEME_MODES = [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]];
function sheetInHub() { try { return window.parent !== window && window.parent.location.origin === location.origin; } catch (e) { return false; } }
function sheetHubTheme() { var v = ""; try { v = localStorage.getItem(SHEET_HUB_THEME_KEY) || ""; } catch (e) {} return v === "dark" ? "dark" : "light"; }
function sheetIsDark(mode) {
  if (mode === "auto") return sheetInHub() ? sheetHubTheme() === "dark" : OfficeTheme.isDark("auto");
  return mode === "dark";
}
var sheetLastDark = null;
function sheetApplyTheme() {
  var d = sheetIsDark(SHEET_SETTINGS.s.theme);
  if (d === sheetLastDark) return;
  sheetLastDark = d;
  OfficeTheme.apply(d, { lightClass: "sheet-light", key: SHEET_THEME_KEY });
}

function sheetApplySetting(k) {
  var s = SHEET_SETTINGS.s, b = document.body;
  /* legacy (SH1): if (!k || k === "theme") OfficeTheme.apply(OfficeTheme.isDark(s.theme), { lightClass: "sheet-light", key: SHEET_THEME_KEY }); */
  if (!k || k === "theme") sheetApplyTheme();
  if (!k || k === "gridlines") b.classList.toggle("sheet-no-grid", !s.gridlines);
  if (!k || k === "formulaBar") {
    var fr = document.getElementById("sheet-formula-row");
    if (fr) fr.hidden = !s.formulaBar;
  }
  if (!k || k === "font" || k === "fontSize") {
    b.style.setProperty("--sheet-font", "'" + s.font + "', system-ui, sans-serif");
    /* (before HO3) b.style.setProperty("--sheet-font-size", s.fontSize + "px"); */
    b.style.setProperty("--sheet-font-size", sheetFontSizeCss(s.fontSize));
  }
  if ((!k || k === "ribbonCollapsed") && typeof SHEET_COLLAPSE !== "undefined" && SHEET_COLLAPSE) SHEET_COLLAPSE.apply(s.ribbonCollapsed);
}

/* SH4: File > Settings opens the same panel as the gear */
function wireSettingsMenuItem() {
  var b = document.getElementById("settingsMenuBtn"), g = document.getElementById("settingsBtn");
  if (!b || !g) return;
  b.addEventListener("click", function () {
    if (typeof ribbonSetFile === "function") ribbonSetFile(false);
    g.click();
  });
}

function initSheetSettings() {
  wireSettingsMenuItem();
  if (typeof OfficeSettings === "undefined") return;
  /* HO3: the panel is built inside create(), before SHEET_SETTINGS is set, so read the saved size here */
  var savedSize = SHEET_DEFAULT_FONT_SIZE;
  try { var raw0 = JSON.parse(localStorage.getItem(SHEET_SETTINGS_KEY) || "null"); if (raw0 && typeof raw0 === "object") savedSize = sheetMigrateFontSize(raw0); } catch (e) {}
  SHEET_SETTINGS = OfficeSettings.create({
    key: SHEET_SETTINGS_KEY,
    /* legacy (SH1): theme default "dark" */
    /* (before HO3) defaults: { theme: "auto", ss1: true, gridlines: true, formulaBar: true, font: "Segoe UI", fontSize: 13, hoverTabs: true, ribbonCollapsed: false }, */
    defaults: { theme: "auto", ss1: true, ho3: true, gridlines: true, formulaBar: true, font: "Segoe UI", fontSize: SHEET_DEFAULT_FONT_SIZE, hoverTabs: true, ribbonCollapsed: false },
    gearBtn: document.getElementById("settingsBtn"),
    validate: function (s) {
      /* SS1 one-time move: SH1 saved the old default 'dark' for everyone, so pre-SS1 settings start on Auto */
      var raw = null; try { raw = JSON.parse(localStorage.getItem(SHEET_SETTINGS_KEY) || "null"); } catch (e) {}
      if (raw && typeof raw === "object" && raw.ss1 === undefined && s.theme === "dark") s.theme = "auto";
      s.ss1 = true;
      if (["light", "dark", "auto"].indexOf(s.theme) === -1) s.theme = "auto";   // legacy (SH1): = "dark"
      /* HO3: OfficeSettings drops a saved number now that the default is a string, so read the raw save */
      if (raw && typeof raw === "object" && raw.fontSize !== undefined) s.fontSize = sheetMigrateFontSize(raw);
      else s.fontSize = sheetFontSizeCss(s.fontSize);
      s.ho3 = true;
    },
    sections: [
      { title: "View", rows: [
        { key: "theme", type: "select", id: "set-theme", label: "Theme", options: SHEET_THEME_MODES },   // legacy (SH1): OfficeTheme.modes
        { key: "gridlines", type: "switch", id: "set-gridlines", label: "Gridlines" },
        { key: "formulaBar", type: "switch", id: "set-formula-bar", label: "Formula bar" },
        { key: "hoverTabs", type: "switch", id: "set-hover-tabs", label: "Open tabs on hover" },
        { key: "ribbonCollapsed", type: "switch", id: "set-ribbon-collapsed", label: "Collapse ribbon" }
      ] },
      { title: "Editing", rows: [
        { key: "font", type: "select", id: "set-font", label: "Default font", options: SHEET_FONTS.map(function (f) { return [f, f]; }) },
        /* (before HO3) { key: "fontSize", type: "select", id: "set-font-size", label: "Default size", cast: Number, options: SHEET_SIZES.map(function (n) { return [n, n + " px"]; }) } */
        { key: "fontSize", type: "select", id: "set-font-size", label: "Default size", options: function () { return sheetFontSizeOptions(SHEET_SETTINGS && SHEET_SETTINGS.s ? SHEET_SETTINGS.s.fontSize : savedSize); } }
      ] },
      { title: "About", rows: [{ type: "about", id: "set-version", text: "Spreadsheet " + SHEET_VERSION }] }
    ],
    onChange: function (k) { sheetApplySetting(k); },
    onReset: function () { sheetApplySetting(); },
    confirm: function (msg) {
      /* (before HO2) : window.confirm(msg) */
      return typeof OfficeDialog !== "undefined" && OfficeDialog.confirm
        ? OfficeDialog.confirm({ title: "Reset settings?", message: msg, okLabel: "Reset" })
        : Promise.resolve(false);
    },
    toast: function (m) { OfficeNotify.show(m); }
  });
  sheetApplySetting();
  OfficeTheme.watch(function () { if (SHEET_SETTINGS.s.theme === "auto") sheetApplySetting("theme"); });
  /* SS1: live Hub theme changes (same signals as My Day MD3 / shared/theme/hub_theme.js); no polling */
  function hubChanged() { if (SHEET_SETTINGS.s.theme === "auto") sheetApplyTheme(); }
  addEventListener("storage", function (e) {
    if (!e.key || e.key === SHEET_HUB_THEME_KEY) hubChanged();
    else if (e.key === SHEET_SETTINGS_KEY) {   // another Spreadsheet tab changed the theme
      try { var t = JSON.parse(e.newValue || "null"); if (t && t.theme && t.theme !== SHEET_SETTINGS.s.theme) { SHEET_SETTINGS.s.theme = t.theme; sheetApplyTheme(); SHEET_SETTINGS.syncForm(); } } catch (x) {}
    }
  });
  addEventListener("message", function (e) { if (e.origin === location.origin && e.data && e.data.type === "hub-prefs") hubChanged(); });
  addEventListener("focus", hubChanged);
}

initSheetSettings();
