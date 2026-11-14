#!/usr/bin/env node
/* Pure-helper tests for Spreadsheet SH16 ROW, COLUMN and INDIRECT
 * (no DOM, no browser).
 *   node apps/office/spreadsheet/test-sh16-row-column-indirect.js
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
  "spreadsheet_state.js"
];
var ctx = {
  console: console, Date: Date, Math: Math, Number: Number, String: String,
  Boolean: Boolean, Array: Array, Object: Object, Proxy: Proxy, JSON: JSON, parseInt: parseInt,
  isNaN: isNaN, isFinite: isFinite, RegExp: RegExp, Error: Error, TypeError: TypeError,
  NaN: NaN, Infinity: Infinity, undefined: undefined,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  document: {
    addEventListener: function () {},
    getElementById: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    createElement: function () {
      return { style: {}, classList: { add: function () {}, toggle: function () {} },
        appendChild: function () {}, querySelector: function () { return null; } };
    }
  },
  window: { addEventListener: function () {}, devicePixelRatio: 1 }
};
vm.createContext(ctx);
vm.runInContext(files.map(function (f) {
  return fs.readFileSync(path.join(dir, f), "utf8");
}).join("\n;\n"), ctx, { filename: "spreadsheet-sh16.js" });

var failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL", name + ":", e.message || e); }
}
function reset() {
  ctx.emptyWorkbook();
  ctx.workbook.sheets.push(ctx.makeSheet("Sheet2"));
  ctx.workbook.active = 0;
  ctx.bindActiveSheet();
}
function setCell(si, a1, formula) {
  var addr = ctx.parseAddr(a1);
  if (!addr) throw new Error("bad addr " + a1);
  ctx.workbook.sheets[si].cells[addr.r][addr.c].formula = String(formula);
}
function val(si, a1) {
  var addr = ctx.parseAddr(a1);
  return ctx.workbook.sheets[si].cells[addr.r][addr.c].value;
}
function shown(si, a1) {
  var addr = ctx.parseAddr(a1);
  return ctx.displayedVal(addr.r, addr.c, si);
}
function col(si, a1, n) {
  var addr = ctx.parseAddr(a1), out = [], i;
  for (i = 0; i < n; i++) out.push(ctx.displayedVal(addr.r + i, addr.c, si));
  return out;
}
function row(si, a1, n) {
  var addr = ctx.parseAddr(a1), out = [], i;
  for (i = 0; i < n; i++) out.push(ctx.displayedVal(addr.r, addr.c + i, si));
  return out;
}
function recalc() { ctx.recalcAll(); }
function eq(got, expected, msg) {
  if (typeof expected === "number" && typeof got === "number") {
    if (Math.abs(got - expected) > 1e-9) throw new Error((msg || "") + " got " + got + " expected " + expected);
    return;
  }
  var gs = JSON.stringify(got), es = JSON.stringify(expected);
  if (gs !== es) throw new Error((msg || "") + " got " + gs + " expected " + es);
}

test("ROW() and COLUMN() with no argument use the formula cell", function () {
  reset();
  setCell(0, "B5", "=ROW()");
  setCell(0, "C1", "=COLUMN()");
  setCell(0, "D4", "=ROW()");
  setCell(0, "D5", "=COLUMN()");
  recalc();
  eq(val(0, "B5"), 5);
  eq(val(0, "C1"), 3);
  eq(val(0, "D4"), 4);
  eq(val(0, "D5"), 4);
});

test("ROW(ref) and COLUMN(ref)", function () {
  reset();
  setCell(0, "A1", "=ROW(B5)");
  setCell(0, "A2", "=COLUMN(C1)");
  setCell(0, "A3", "=ROW(C1)");
  setCell(0, "A4", "=COLUMN(B5)");
  recalc();
  eq(val(0, "A1"), 5);
  eq(val(0, "A2"), 3);
  eq(val(0, "A3"), 1);
  eq(val(0, "A4"), 2);
});

test("ROW of a vertical range spills, COLUMN of a horizontal range spills", function () {
  reset();
  setCell(0, "C1", "=ROW(A1:A5)");
  setCell(0, "A7", "=COLUMN(A1:C1)");
  recalc();
  eq(col(0, "C1", 5), [1, 2, 3, 4, 5]);
  eq(row(0, "A7", 3), [1, 2, 3]);
  eq(ctx.workbook.sheets[0].cells[1][2].formula, "");
  eq(ctx.workbook.sheets[0].cells[1][2].value, "");
});

test("ROW and COLUMN of a 2D range and of an A1# spill", function () {
  reset();
  setCell(0, "E1", "=ROW(B2:D4)");
  setCell(0, "E6", "=COLUMN(B2:D4)");
  setCell(0, "A10", "=SEQUENCE(4)");
  setCell(0, "C10", "=ROW(A10#)");
  setCell(0, "A16", "=SEQUENCE(1,3)");
  setCell(0, "A18", "=COLUMN(A16#)");
  setCell(0, "E18", "=ROW(A16#)");
  recalc();
  eq(col(0, "E1", 3), [2, 3, 4]);
  eq(row(0, "E6", 3), [2, 3, 4]);
  eq(col(0, "C10", 4), [10, 11, 12, 13]);
  eq(row(0, "A18", 3), [1, 2, 3]);
  eq(val(0, "E18"), 16);
});

test("INDIRECT of one cell", function () {
  reset();
  setCell(0, "B2", "=5");
  setCell(0, "A1", "=INDIRECT(\"B2\")");
  recalc();
  eq(val(0, "A1"), 5);
});

test("INDIRECT of built text", function () {
  reset();
  setCell(0, "B2", "=11");
  setCell(0, "A1", "=INDIRECT(\"B\"&2)");
  setCell(0, "D1", "=2");
  setCell(0, "C1", "=INDIRECT(\"B\"&D1)");
  recalc();
  eq(val(0, "A1"), 11);
  eq(val(0, "C1"), 11);
});

test("INDIRECT range spills alone and adds up inside SUM", function () {
  reset();
  setCell(0, "A1", "=1");
  setCell(0, "A2", "=2");
  setCell(0, "A3", "=3");
  setCell(0, "C1", "=INDIRECT(\"A1:A3\")");
  setCell(0, "E1", "=SUM(INDIRECT(\"A1:A3\"))");
  recalc();
  eq(col(0, "C1", 3), [1, 2, 3]);
  eq(val(0, "E1"), 6);
});

test("INDIRECT bad or out-of-grid address is #REF!", function () {
  reset();
  /* (before SH24) A150 and AA1 were outside the 26×100 sheet.
  setCell(0, "A1", "=INDIRECT(\"A150\")");
  setCell(0, "A2", "=INDIRECT(\"AA1\")");
  */
  setCell(0, "A1", "=INDIRECT(\"A1001\")");
  setCell(0, "A2", "=INDIRECT(\"GA1\")");
  setCell(0, "A3", "=INDIRECT(\"Hello\")");
  setCell(0, "A4", "=INDIRECT(\"A0\")");
  setCell(0, "A5", "=INDIRECT(\"\")");
  setCell(0, "B1", "=INDIRECT(\"AA1\")");
  setCell(0, "AA1", "7");
  setCell(0, "A150", "4");
  setCell(0, "B2", "=INDIRECT(\"A150\")");
  recalc();
  eq(val(0, "A1"), "#REF!");
  eq(val(0, "A2"), "#REF!");
  eq(val(0, "A3"), "#REF!");
  eq(val(0, "A4"), "#REF!");
  eq(val(0, "A5"), "#REF!");
  eq(val(0, "B1"), 7);
  eq(val(0, "B2"), 4);
});

test("INDIRECT recalculates after the target cell changes", function () {
  reset();
  setCell(0, "B2", "=5");
  setCell(0, "A1", "=INDIRECT(\"B2\")");
  recalc();
  eq(val(0, "A1"), 5);
  setCell(0, "B2", "=9");
  recalc();
  eq(val(0, "A1"), 9);
  setCell(0, "C1", "=4");
  setCell(0, "B2", "=C1*3");
  recalc();
  eq(val(0, "A1"), 12);
  setCell(0, "C1", "=5");
  recalc();
  eq(val(0, "A1"), 15);
});

test("INDIRECT of a formula that is calculated later in the same pass", function () {
  reset();
  setCell(0, "B1", "=3");
  setCell(0, "D1", "=2");
  setCell(0, "A1", "=INDIRECT(\"B\"&D1)");
  setCell(0, "B2", "=B1+5");
  recalc();
  eq(val(0, "B2"), 8);
  eq(val(0, "A1"), 8);
});

test("INDIRECT circular reference is #LOOP!", function () {
  reset();
  setCell(0, "A1", "=INDIRECT(\"A1\")");
  setCell(0, "A2", "=INDIRECT(\"B2\")");
  setCell(0, "B2", "=A2+1");
  setCell(0, "C4", "=INDIRECT(\"C\"&4)");
  recalc();
  eq(val(0, "A1"), "#LOOP!");
  eq(val(0, "A2"), "#LOOP!");
  eq(val(0, "B2"), "#LOOP!");
  eq(val(0, "C4"), "#LOOP!");
});

test("built INDIRECT follows the address when the text changes", function () {
  reset();
  setCell(0, "D1", "=2");
  setCell(0, "B2", "=8");
  setCell(0, "B3", "=15");
  setCell(0, "A1", "=INDIRECT(\"B\"&D1)");
  recalc();
  eq(val(0, "A1"), 8);
  setCell(0, "D1", "=3");
  recalc();
  eq(val(0, "A1"), 15);
});

test("FX catalog lists ROW, COLUMN and INDIRECT", function () {
  var row = ctx.fxFindName("ROW");
  var col = ctx.fxFindName("COLUMN");
  var ind = ctx.fxFindName("INDIRECT");
  if (!row || row.sig.indexOf("reference") < 0) throw new Error("ROW hint missing");
  if (!col || col.sig.indexOf("COLUMN") !== 0) throw new Error("COLUMN hint missing");
  if (!ind || ind.sig.indexOf("text") < 0) throw new Error("INDIRECT hint missing");
  var hint = ctx.fxCaretContext("=ROW(", 5);
  if (!hint || hint.name !== "ROW") throw new Error("caret " + JSON.stringify(hint));
});

test("grid, storage and error list are unchanged", function () {
  /* (before SH24) if (ctx.ROWS !== 100 || ctx.COLS !== 26) throw new Error("grid changed"); */
  if (ctx.ROWS !== 1000 || ctx.COLS !== 182) throw new Error("grid changed");
  if (ctx.STORE_KEY !== "sheet-v4") throw new Error("storage key changed");
  if (ctx.ALL_ERRORS.indexOf("#LOOP!") < 0) throw new Error("missing #LOOP!");
  if (ctx.ALL_ERRORS.indexOf("#REF!") < 0) throw new Error("missing #REF!");
});

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
