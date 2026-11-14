#!/usr/bin/env node
/* SH24: multi-letter columns, sparse cells, recalc, .hos, visible window.
 * No DOM and no browser.
 *   node apps/office/spreadsheet/test-sh24-grid.js
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
  "spreadsheet_grid.js",
  "spreadsheet_hos.js"
];
var ctx = {
  console: console, Date: Date, Math: Math, Number: Number, String: String,
  Boolean: Boolean, Array: Array, Object: Object, Proxy: Proxy, JSON: JSON,
  parseInt: parseInt, isNaN: isNaN, isFinite: isFinite, RegExp: RegExp,
  Error: Error, TypeError: TypeError, NaN: NaN, Infinity: Infinity,
  undefined: undefined, setTimeout: setTimeout, clearTimeout: clearTimeout,
  document: undefined
};
vm.createContext(ctx);
vm.runInContext(files.map(function (f) {
  return fs.readFileSync(path.join(dir, f), "utf8");
}).join("\n;\n"), ctx, { filename: "spreadsheet-sh24.js" });

var failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL", name + ":", e && e.stack || e); }
}
function eq(got, expected, msg) {
  if (got !== expected) throw new Error((msg || "") + " got " + JSON.stringify(got) + " expected " + JSON.stringify(expected));
}
function reset() {
  ctx.emptyWorkbook();
}
function setCell(a1, formula) {
  var addr = ctx.parseAddr(a1);
  if (!addr) throw new Error("bad addr " + a1);
  ctx.workbook.sheets[0].cells[addr.r][addr.c].formula = String(formula);
}
function val(a1) {
  var addr = ctx.parseAddr(a1);
  return ctx.workbook.sheets[0].cells[addr.r][addr.c].value;
}
function realCount() {
  var n = 0;
  ctx.forEachReal(ctx.cells, function () { n++; });
  return n;
}

test("letters run A Z AA FZ and stop at the grid", function () {
  eq(ctx.colLetter(0), "A");
  eq(ctx.colLetter(25), "Z");
  eq(ctx.colLetter(26), "AA");
  eq(ctx.colLetter(51), "AZ");
  eq(ctx.colLetter(181), "FZ");
  eq(ctx.colIndex("FZ"), 181);
  eq(ctx.colIndex("GA"), 182);
  eq(ctx.parseAddr("FZ1000").r, 999);
  eq(ctx.parseAddr("FZ1000").c, 181);
  if (ctx.parseAddr("GA1")) throw new Error("GA1 should be outside");
  if (ctx.parseAddr("A1001")) throw new Error("A1001 should be outside");
  eq(ctx.refText(false, 26, false, 0), "AA1");
  eq(ctx.refText(true, 181, true, 999), "$FZ$1000");
  eq(ctx.refText(false, 182, false, 0), "#REF!");
});

test("a blank sheet stores no cell objects", function () {
  reset();
  eq(realCount(), 0);
  eq(ctx.cells[0][0].formula, "");
  eq(ctx.cells[10][30].value, "");
  eq(realCount(), 0, "reading an empty slot must not allocate");
});

test("AA1 and FZ1000 calculate, GA1 and A1001 are #REF!", function () {
  reset();
  setCell("AA1", "2");
  setCell("AB1", "=AA1*5");
  setCell("FZ1000", "3");
  setCell("A1", "=FZ1000+1");
  setCell("B1", "=GA1");
  setCell("C1", "=A1001");
  ctx.recalcAll();
  eq(val("AB1"), 10);
  eq(val("A1"), 4);
  eq(val("B1"), "#REF!");
  eq(val("C1"), "#REF!");
  eq(realCount(), 6);
});

test("inserting a column shifts stored cells and does not fill the row", function () {
  reset();
  setCell("C1", "9");
  ctx.shiftSparseCols(ctx.cells[0], 1, 1);
  eq(ctx.realCellAt(ctx.cells, 0, 3).formula, "9");
  eq(ctx.realCellAt(ctx.cells, 0, 2), null);
  eq(realCount(), 1);
});

test("shift keeps a multi-letter column and turns a past-the-edge ref into #REF!", function () {
  eq(ctx.shiftFormula("=AA1+FZ1", 0, 1), "=AB1+#REF!");
  eq(ctx.shiftFormula("=$AA1", 0, 3), "=$AA1");
});

test(".hos save is sparse and an old 26×100 file still opens", function () {
  reset();
  setCell("B2", "hello");
  var Hos = ctx.SHEET_HOS_FORMAT;
  var packed = Hos.pack({
    name: "Wide",
    sheets: [{ name: "Sheet1", cells: ctx.workbook.sheets[0].cells }]
  });
  eq(packed.version, 1);
  eq(packed.format, "hos");
  eq(packed.cols, 182);
  eq(packed.rows, 1000);
  eq(packed.sheets[0].cells.length, 1);
  eq(packed.sheets[0].cells[0].r, 1);
  eq(packed.sheets[0].cells[0].c, 1);
  eq(packed.sheets[0].cells[0].formula, "hello");
  var old = JSON.stringify({
    format: "hos", version: 1, name: "Old", created: 5, updated: 6,
    active: 0, cols: 26, rows: 100,
    sheets: [{ name: "Sheet1", cells: [{ r: 2, c: 3, formula: "Qty", value: "Qty", style: { bold: true } }] }]
  });
  var back = Hos.parse(old);
  eq(back.version, 1);
  eq(back.cols, 182, "opened into the current grid");
  eq(back.sheets[0].cells.length, 1);
  eq(back.sheets[0].cells[0].formula, "Qty");
  eq(back.sheets[0].cells[0].style.bold, true);
});

test("the visible window is a slice, print uses the used range", function () {
  reset();
  var m = ctx.sheetPrefix();
  eq(m.rowY.length, 1001);
  eq(m.colX.length, 183);
  eq(m.colX[26] > m.colX[25], true);
  var spec = ctx.viewSpec(m, 0, 0, 400, 900, false);
  if (spec.r1 > 40) throw new Error("too many rows in the window " + spec.r1);
  if (spec.c1 > 30) throw new Error("too many cols in the window " + spec.c1);
  eq(spec.r0, 0);
  eq(spec.c0, 0);
  setCell("A20", "x");
  var printed = ctx.viewSpec(ctx.sheetPrefix(), 0, 0, 400, 900, true);
  eq(printed.r1, 19);
  eq(printed.c1, 0);
  var ix = ctx.prefixIndex(m.rowY, m.rowY[40] + 1, ctx.ROWS);
  eq(ix, 40);
});

console.log("passed", passed, "failed", failed);
process.exit(failed ? 1 : 0);
