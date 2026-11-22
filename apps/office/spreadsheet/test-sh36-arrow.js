#!/usr/bin/env node
/* SH36: arrow keys do not rebuild the visible window; a scroll still does;
 * a missing input falls back to a forced rebuild. Minimal DOM stubs, no browser.
 *   node apps/office/spreadsheet/test-sh36-arrow.js
 */
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var dir = __dirname;
var files = [
  "spreadsheet_config.js",
  "spreadsheet_formula.js",
  "spreadsheet_functions.js",
  "spreadsheet_refs.js",
  "spreadsheet_state.js",
  "spreadsheet_grid.js"
];

var wrap = {
  id: "sheet-wrap",
  scrollTop: 0,
  scrollLeft: 0,
  clientHeight: 480,
  clientWidth: 800,
  addEventListener: function () {},
  innerHTML: ""
};
var sizer = { id: "sheet-sizer" };
var ids = { "sheet-wrap": wrap, "sheet-sizer": sizer };

var ctx = {
  console: console, Date: Date, Math: Math, Number: Number, String: String,
  Boolean: Boolean, Array: Array, Object: Object, Proxy: Proxy, JSON: JSON,
  parseInt: parseInt, isNaN: isNaN, isFinite: isFinite, RegExp: RegExp,
  Error: Error, TypeError: TypeError, NaN: NaN, Infinity: Infinity,
  undefined: undefined, setTimeout: setTimeout, clearTimeout: clearTimeout,
  requestAnimationFrame: function (fn) { return 0; },
  cancelAnimationFrame: function () {},
  window: { addEventListener: function () {} },
  document: {
    getElementById: function (id) { return ids[id] || null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    createElement: function (tag) { return { tagName: String(tag).toUpperCase(), style: {}, dataset: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {} }, appendChild: function () {}, addEventListener: function () {}, setAttribute: function () {} }; },
    head: { appendChild: function () {} },
    activeElement: null
  }
};
vm.createContext(ctx);
vm.runInContext(files.map(function (f) {
  return fs.readFileSync(path.join(dir, f), "utf8");
}).join("\n;\n"), ctx, { filename: "spreadsheet-sh36.js" });

var failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL", name + ":", e && e.stack || e); }
}
function eq(got, expected, msg) {
  if (got !== expected) throw new Error((msg || "") + " got " + JSON.stringify(got) + " expected " + JSON.stringify(expected));
}

var buildCalls = 0;
function fillInputs(spec) {
  var grid = ctx.inpGrid;
  grid.length = 0;
  ctx.forEachPaintedSlot(spec.rows, spec.cols, function (r, c) {
    if (!grid[r]) grid[r] = [];
    grid[r][c] = { r: r, c: c, parentNode: { classList: { add: function () {}, remove: function () {} } } };
  });
}
ctx.buildVirtualTable = function (spec) {
  buildCalls++;
  fillInputs(spec);
};
ctx.syncVirtualBox = function () {};
ctx.layoutFrozenVirtual = function () {};
ctx.paintRendered = function () {};
ctx.highlightSel = function () {};
ctx.restoreSheetEdit = function () {};
ctx.wireNameBox = function () {};
ctx.ensureSheetChrome = function () { return sizer; };

function resetView() {
  wrap.scrollTop = 0;
  wrap.scrollLeft = 0;
  ctx.emptyWorkbook();
  ctx.SHEET_VIEW.key = "";
  ctx.SHEET_VIEW.spec = null;
  ctx.SHEET_VIEW.inside = false;
  ctx.SHEET_VIEW.lock = 0;
  ctx.SHEET_VIEW.printing = false;
  ctx.inpGrid.length = 0;
  buildCalls = 0;
}

function hasInput(r, c) {
  return !!(ctx.inpGrid[r] && ctx.inpGrid[r][c]);
}

test("moving to an already-visible cell does not rebuild the table", function () {
  resetView();
  ctx.renderViewport(true);
  eq(buildCalls > 0, true, "initial draw should build");
  eq(hasInput(0, 0), true, "A1 must exist after the first draw (SH34)");
  eq(hasInput(2, 2), true, "C3 should already be in the window");
  var n = buildCalls;
  var top = wrap.scrollTop;
  var left = wrap.scrollLeft;
  ctx.ensureCellVisible(2, 2);
  eq(buildCalls, n, "visible move must not call buildVirtualTable");
  eq(hasInput(2, 2), true, "C3 must still exist");
  eq(wrap.scrollTop, top, "scrollTop must not change");
  eq(wrap.scrollLeft, left, "scrollLeft must not change");
});

test("moving to a cell that needs scrolling rebuilds and the cell exists", function () {
  resetView();
  ctx.renderViewport(true);
  var n = buildCalls;
  eq(hasInput(200, 0), false, "row 201 should start off-window");
  ctx.ensureCellVisible(200, 0);
  eq(wrap.scrollTop > 0, true, "should scroll down to row 201");
  eq(buildCalls, n + 1, "scroll must rebuild the window");
  eq(hasInput(200, 0), true, "row 201 col A must exist after the rebuild");
});

test("a missing input after a no-scroll render falls back to a forced rebuild", function () {
  resetView();
  ctx.renderViewport(true);
  eq(hasInput(3, 1), true, "B4 should be in the first window");
  ctx.inpGrid.length = 0;
  eq(hasInput(3, 1), false, "inputs were cleared on purpose");
  var n = buildCalls;
  var top = wrap.scrollTop;
  ctx.ensureCellVisible(3, 1);
  eq(wrap.scrollTop, top, "B4 is already visible, so no scroll");
  eq(buildCalls, n + 1, "missing input must force renderViewport(true)");
  eq(hasInput(3, 1), true, "B4 must exist after the fallback rebuild");
});

test("row 0 and column 0 stay in the painted slot walk (SH34)", function () {
  eq(ctx.sheetSlotSkip(0), false);
  eq(ctx.sheetSlotSkip(null), true);
  eq(ctx.sheetSlotSkip({ spacer: true, px: 30 }), true);
  var painted = [];
  ctx.forEachPaintedSlot([0, { spacer: true, px: 90 }, null, 1], [0, null, 2], function (r, c) {
    painted.push(r + ":" + c);
  });
  eq(painted.join(" "), "0:0 0:2 1:0 1:2");
  resetView();
  ctx.renderViewport(true);
  eq(hasInput(0, 0), true, "A1 must be built when the window starts at the origin");
});

test("wiring: title, VERSION, ?v= tokens, readme", function () {
  var html = fs.readFileSync(path.join(dir, "spreadsheet.html"), "utf8");
  var settings = fs.readFileSync(path.join(dir, "spreadsheet_settings.js"), "utf8");
  var readme = fs.readFileSync(path.join(dir, "spreadsheet_readme.md"), "utf8");
  var live = html.replace(/<!--[\s\S]*?-->/g, "");
  if (html.indexOf("<title>Spreadsheet SH36</title>") < 0) throw new Error("title is not SH36");
  if (html.indexOf("<!-- (before SH36) <title>Spreadsheet SH35</title> -->") < 0) throw new Error("old title was not kept");
  /* (before SH41) if (live.indexOf("spreadsheet_grid.js?v=SH36") < 0) throw new Error("grid.js cache token is not SH36"); */
  /* (before SH46) if (live.indexOf("spreadsheet_grid.js?v=SH36") < 0 && live.indexOf("spreadsheet_grid.js?v=SH41") < 0) throw new Error("grid.js cache token is not SH36 or SH41"); */
  if (live.indexOf("spreadsheet_grid.js?v=SH36") < 0 && live.indexOf("spreadsheet_grid.js?v=SH41") < 0 && live.indexOf("spreadsheet_grid.js?v=SH46") < 0) throw new Error("grid.js cache token is not SH36 or SH41");
  if (html.indexOf("<!-- (before SH36) <script src=\"spreadsheet_grid.js?v=HO3\"></script> -->") < 0) {
    throw new Error("old grid.js token was not kept");
  }
  /* (before SH37) if (live.indexOf("spreadsheet_settings.js?v=SH36") < 0) throw new Error("settings.js cache token is not SH36"); */
  /* (before SH40) if (!/spreadsheet_settings\.js\?v=SH3[6-9]/.test(live)) throw new Error("settings.js cache token is not SH36 or later"); */
  /* (before SH41) if (!/spreadsheet_settings\.js\?v=SH(3[6-9]|40)/.test(live)) throw new Error("settings.js cache token is not SH36 or later"); */
  /* (before SH42) if (!/spreadsheet_settings\.js\?v=SH(3[6-9]|40|41)/.test(live)) throw new Error("settings.js cache token is not SH36 or later"); */
  /* (before SH44) if (!/spreadsheet_settings\.js\?v=SH(3[6-9]|4[0-2])/.test(live)) throw new Error("settings.js cache token is not SH36 or later"); */
  /* (before SH45) if (!/spreadsheet_settings\.js\?v=SH(3[6-9]|4[0-4])/.test(live)) throw new Error("settings.js cache token is not SH36 or later"); */
  /* (before SH49) if (!/spreadsheet_settings\.js\?v=SH(3[6-9]|4[0-5])/.test(live)) throw new Error("settings.js cache token is not SH36 or later"); */
  /* (before SH46) if (!/spreadsheet_settings\.js\?v=SH(3[6-9]|4[0-5]|49)/.test(live)) throw new Error("settings.js cache token is not SH36 or later"); */
  /* (before SH47) if (!/spreadsheet_settings\.js\?v=SH(3[6-9]|4[0-6]|49)/.test(live)) throw new Error("settings.js cache token is not SH36 or later"); */
  if (!/spreadsheet_settings\.js\?v=SH(3[6-9]|4[0-7]|49)/.test(live)) throw new Error("settings.js cache token is not SH36 or later");
  if (settings.indexOf('var SHEET_VERSION = "SH36";') < 0) throw new Error("SHEET_VERSION is not SH36");
  if (settings.indexOf('/* (before SH36) var SHEET_VERSION = "SH35";') < 0) throw new Error("old SHEET_VERSION was not kept");
  if (readme.indexOf("## SH36") < 0) throw new Error("readme is missing the SH36 note");
  var src = fs.readFileSync(path.join(dir, "spreadsheet_grid.js"), "utf8");
  if (src.indexOf("/* (before SH36) renderViewport(true);") < 0) throw new Error("old renderViewport(true) was not kept as a comment");
  if (!/renderViewport\(false\);\s*if\s*\(!\(inpGrid\[r\]\s*&&\s*inpGrid\[r\]\[c\]\)\)\s*renderViewport\(true\);/.test(src)) {
    throw new Error("ensureCellVisible does not use renderViewport(false) with a missing-input fallback");
  }
});

console.log("passed", passed, "failed", failed);
process.exit(failed ? 1 : 0);
