#!/usr/bin/env node
/* HO3: 12pt default font in Spreadsheet and Tables.
 * Settings default and unit, the one-time 13 -> 12pt move, saved px sizes kept, explicit
 * cell sizes untouched, auto-fit default 16px, CSS fallbacks, Tables sheet text, cache tokens.
 * Runs the real ../shared/office-settings.js and spreadsheet_settings.js against a tiny fake DOM.
 * No browser.
 *   node apps/office/spreadsheet/test-ho3-font-default.js
 */
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var dir = __dirname;
var Hos = require("./spreadsheet_hos.js");

function read(p) { return fs.readFileSync(path.join(dir, p), "utf8"); }

/* ---------- tiny fake DOM ---------- */
function fakeEl(tag) {
  var props = {};
  var el = {
    tagName: String(tag || "div").toUpperCase(), children: [], hidden: false, value: "", textContent: "",
    id: "", className: "", type: "", innerHTML: "",
    style: { setProperty: function (k, v) { props[k] = v; }, getPropertyValue: function (k) { return props[k] || ""; } },
    _props: props,
    classList: { _s: {}, toggle: function (c, on) { this._s[c] = !!on; }, add: function (c) { this._s[c] = true; }, remove: function (c) { delete this._s[c]; }, contains: function (c) { return !!this._s[c]; } },
    setAttribute: function () {}, getAttribute: function () { return null; },
    addEventListener: function () {}, focus: function () {},
    appendChild: function (c) { el.children.push(c); return c; }
  };
  return el;
}

function makeCtx(saved) {
  var store = {};
  if (saved !== undefined) store.spreadsheet_settings = JSON.stringify(saved);
  var body = fakeEl("body");
  var ctx = {
    console: console, Math: Math, Number: Number, String: String, Boolean: Boolean, Array: Array,
    Object: Object, JSON: JSON, parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, isFinite: isFinite,
    RegExp: RegExp, Error: Error, Promise: Promise,
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); }
    },
    document: {
      body: body,
      createElement: fakeEl,
      getElementById: function () { return null; },
      addEventListener: function () {}
    },
    location: { origin: "http://x" },
    addEventListener: function () {},
    OfficeTheme: { isDark: function () { return false; }, apply: function () {}, watch: function () {} },
    OfficeNotify: { show: function () {} },
    CFG: { rowHeight: { auto: 30, min: 8, max: 400 }, colWidth: { auto: 100, min: 30, rowHead: 40 } },
    COLS: 26, ROWS: 100,
    SHEET_INIT: { push: function () {} }
  };
  ctx.window = ctx;
  ctx.window.parent = ctx;
  vm.createContext(ctx);
  ["../shared/office-settings.js", "spreadsheet_settings.js", "spreadsheet_resize.js"].forEach(function (f) {
    vm.runInContext(read(f).replace(/^\s*(const|let) /gm, "var "), ctx, { filename: f });
  });
  ctx._store = store;
  ctx._body = body;
  return ctx;
}
function selectOptions(ctx) {
  /* the "Default size" select built by OfficeSettings: find the <select> whose options mention pt */
  var found = null;
  (function walk(n) {
    if (!n || found) return;
    if (n.tagName === "SELECT" && n.children.some(function (o) { return /pt$/.test(o.value); })) { found = n; return; }
    (n.children || []).forEach(walk);
  })(ctx._body);
  return found ? found.children.map(function (o) { return o.value; }) : null;
}

var failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL", name + ":", e.message || e); }
}
function eq(got, expected, msg) {
  if (got !== expected) throw new Error((msg || "") + " got " + JSON.stringify(got) + " expected " + JSON.stringify(expected));
}

test("fresh Settings: default is 12pt, applied as --sheet-font-size: 12pt", function () {
  var ctx = makeCtx();
  eq(ctx.SHEET_SETTINGS.s.fontSize, "12pt");
  eq(ctx.SHEET_SETTINGS.s.ho3, true);
  eq(ctx._body._props["--sheet-font-size"], "12pt");
  var saved = JSON.parse(ctx._store.spreadsheet_settings);
  eq(saved.fontSize, "12pt");
});

test("Settings size menu is pt with 12 selected", function () {
  var ctx = makeCtx();
  var opts = selectOptions(ctx);
  if (!opts) throw new Error("Default size select not built");
  eq(opts.join(","), "9pt,10pt,11pt,12pt,14pt,16pt,18pt");
  if (opts.indexOf("12pt") < 0) throw new Error("12pt missing");
});

test("one-time move: saved old factory 13 becomes 12pt", function () {
  var ctx = makeCtx({ theme: "light", ss1: true, gridlines: true, formulaBar: true, font: "Arial", fontSize: 13, hoverTabs: true, ribbonCollapsed: false });
  eq(ctx.SHEET_SETTINGS.s.fontSize, "12pt");
  eq(ctx.SHEET_SETTINGS.s.font, "Arial", "other settings kept");
  eq(ctx.SHEET_SETTINGS.s.theme, "light", "other settings kept");
  eq(ctx._body._props["--sheet-font-size"], "12pt");
  var saved = JSON.parse(ctx._store.spreadsheet_settings);
  eq(saved.ho3, true);
  eq(saved.fontSize, "12pt");
});

test("saved non-13 px size stays px (16 is not reread as 16pt)", function () {
  var ctx = makeCtx({ theme: "auto", ss1: true, fontSize: 16 });
  eq(ctx.SHEET_SETTINGS.s.fontSize, "16px");
  eq(ctx._body._props["--sheet-font-size"], "16px");
  var opts = selectOptions(ctx);
  if (!opts || opts.indexOf("16px") < 0) throw new Error("earlier px size not listed: " + JSON.stringify(opts));
  eq(ctx.defaultSheetFontSize(), 16);
  var ctx11 = makeCtx({ fontSize: 11 });
  eq(ctx11.SHEET_SETTINGS.s.fontSize, "11px");
  eq(ctx11.defaultSheetFontSize(), 11);
});

test("after the move, a pt choice and a second load are stable", function () {
  var ctx = makeCtx({ fontSize: 13 });
  ctx.SHEET_SETTINGS.set("fontSize", "14pt");
  eq(ctx._body._props["--sheet-font-size"], "14pt");
  var again = makeCtx(JSON.parse(ctx._store.spreadsheet_settings));
  eq(again.SHEET_SETTINGS.s.fontSize, "14pt");
  var moved = makeCtx({ fontSize: "12pt", ho3: true });
  eq(moved.SHEET_SETTINGS.s.fontSize, "12pt");
});

test("reset returns to 12pt", function () {
  var ctx = makeCtx({ fontSize: 18 });
  eq(ctx.SHEET_SETTINGS.s.fontSize, "18px");
  ctx.SHEET_SETTINGS.reset();
  eq(ctx.SHEET_SETTINGS.s.fontSize, "12pt");
  eq(ctx._body._props["--sheet-font-size"], "12pt");
});

test("pure helpers: CSS length, px math, migrate", function () {
  var ctx = makeCtx();
  eq(ctx.sheetFontSizeCss("12pt"), "12pt");
  eq(ctx.sheetFontSizeCss("16px"), "16px");
  eq(ctx.sheetFontSizeCss(16), "16px");
  eq(ctx.sheetFontSizeCss("12ptpx"), "12pt");
  eq(ctx.sheetFontSizeCss(undefined), "12pt");
  eq(ctx.sheetFontSizePx("12pt"), 16);
  eq(ctx.sheetFontSizePx("9pt"), 12);
  eq(ctx.sheetFontSizePx("16px"), 16);
  eq(ctx.sheetMigrateFontSize({ fontSize: 13 }), "12pt");
  eq(ctx.sheetMigrateFontSize({ fontSize: 13, ho3: true }), "13px");
  eq(ctx.sheetMigrateFontSize({ fontSize: 12 }), "12px");
  eq(ctx.sheetMigrateFontSize({}), "12pt");
  eq(ctx.sheetMigrateFontSize(null), "12pt");
});

test("auto-fit default is 16px (12pt); one line still fits under the 30px floor", function () {
  var ctx = makeCtx();
  eq(ctx.SHEET_DEFAULT_FONT_PX, 16);
  eq(ctx.defaultSheetFontSize(), 16);
  eq(ctx.estimateRowHeight("x", { automatic: false, padding: 6, lineHeight: 1.25 }), 26);
  eq(ctx.estimateRowHeight("x", { automatic: true }), 30);
  eq(ctx.estimateRowHeight("a\nb", { automatic: true }), 46);
  eq(ctx.CFG.rowHeight.auto, 30);
});

test("explicit cell fontSize stays px through .hos and the style path", function () {
  var style = read("spreadsheet_style.js");
  if (style.indexOf('inp.style.fontSize = st.fontSize ? (st.fontSize + "px") : "";') < 0) throw new Error("explicit cell size is no longer px");
  if (style.indexOf("var bd, fs, i, sizes = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24];") < 0) throw new Error("Home-tab px size list changed");
  if (/st\.fontSize\s*=\s*styleDefaultSizePx/.test(style)) throw new Error("default size is written into a cell");
  eq(Hos.VERSION, 1, "no .hos format bump");
  var hos = read("spreadsheet_hos.js");
  if (hos.indexOf("ho3") >= 0 || hos.indexOf("HO3") >= 0) throw new Error(".hos code should not change for HO3");
  /* explicit size wins over the default in auto-fit math */
  var ctx = makeCtx();
  eq(ctx.estimateRowHeight("x", { fontSize: 24, automatic: true }), 36);
});

test("CSS fallbacks: Spreadsheet 12pt; Tables sheet text 12pt, chrome 13px", function () {
  var css = read("spreadsheet.css");
  if (css.indexOf("font-size: var(--sheet-font-size, 12pt);") < 0) throw new Error("spreadsheet.css fallback is not 12pt");
  if (/^\s*font-size: var\(--sheet-font-size, 13px\);/m.test(css)) throw new Error("live 13px fallback left in spreadsheet.css");
  if (css.indexOf("(before HO3)") < 0) throw new Error("old line not kept as a comment");
  var t = fs.readFileSync(path.join(dir, "../tables/tables.css"), "utf8");
  if (!/^\s*--sheet-font-size: 12pt;/m.test(t)) throw new Error("tables --sheet-font-size is not 12pt");
  if (!/^\s*--ui-font-size: 13px;/m.test(t)) throw new Error("tables chrome size missing");
  if (t.indexOf(".grid td.cell,") < 0 || t.indexOf("font-size: var(--sheet-font-size, 12pt)") < 0) throw new Error("tables cells do not use the sheet size");
  if (/^\s*--sheet-font-size: 13px;/m.test(t)) throw new Error("live 13px left in tables.css");
  if (t.indexOf("(before HO3)") < 0) throw new Error("tables old lines not kept as comments");
  var th = fs.readFileSync(path.join(dir, "../tables/tables.html"), "utf8");
  if (th.indexOf("?v=") >= 0) throw new Error("tables.html should have no ?v= (NV2)");
});

test("cache tokens stay HO3, title and SHEET_VERSION are SH21; Writer still 12pt", function () {
  var html = read("spreadsheet.html");
  if (html.indexOf("?v=SH18") >= 0) throw new Error("stale ?v=SH18 left");
  if (html.indexOf("?v=HO3") < 0) throw new Error("?v=HO3 missing");
  /* (before SH21) if (html.indexOf("<title>Spreadsheet SH18</title>") < 0) throw new Error("title changed"); */
  if (html.indexOf("<title>Spreadsheet SH21</title>") < 0) throw new Error("title is not SH21");
  /* (before SH21) if (read("spreadsheet_settings.js").indexOf('var SHEET_VERSION = "SH18";') < 0) throw new Error("SHEET_VERSION changed"); */
  if (read("spreadsheet_settings.js").indexOf('var SHEET_VERSION = "SH21";') < 0) throw new Error("SHEET_VERSION is not SH21");
  var wsrc = fs.readFileSync(path.join(dir, "../writer/modules/writer-config.js"), "utf8");
  if (!/fontSizePt:\s*12\b/.test(wsrc)) throw new Error("Writer fontSizePt 12 not found");
});

console.log("passed", passed, "failed", failed);
process.exit(failed ? 1 : 0);
