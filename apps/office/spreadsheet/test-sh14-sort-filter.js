#!/usr/bin/env node
/* Pure-helper tests for Spreadsheet SH14 SORT, SORTBY, FILTER, UNIQUE
 * and element-wise array comparisons / arithmetic (no DOM, no browser).
 *   node apps/office/spreadsheet/test-sh14-sort-filter.js
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
  Boolean: Boolean, Array: Array, Object: Object, JSON: JSON, parseInt: parseInt,
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
}).join("\n;\n"), ctx, { filename: "spreadsheet-sh14.js" });

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
  var addr = ctx.parseAddr(a1), out = [], i, r, c;
  for (i = 0; i < n; i++) {
    r = addr.r + i;
    c = addr.c;
    out.push(ctx.displayedVal(r, c, si));
  }
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

test("SORT ascending: numbers, case-insensitive text, blanks last, stable", function () {
  reset();
  setCell(0, "A1", "=2");
  setCell(0, "B1", "b");
  setCell(0, "A3", "b");
  setCell(0, "B3", "x");
  setCell(0, "A4", "=2");
  setCell(0, "B4", "a");
  setCell(0, "A5", "A");
  setCell(0, "B5", "y");
  setCell(0, "A6", "=10");
  setCell(0, "B6", "z");
  setCell(0, "D1", "=SORT(A1:B6)");
  recalc();
  eq(col(0, "D1", 6), [2, 2, 10, "A", "b", ""]);
  eq(col(0, "E1", 6), ["b", "a", "z", "y", "x", ""]);
  eq(ctx.workbook.sheets[0].cells[1][3].formula, "");
  eq(ctx.workbook.sheets[0].cells[1][3].value, "");
});

test("SORT descending keeps blanks last and does not reverse ties", function () {
  reset();
  setCell(0, "A1", "=2");
  setCell(0, "A3", "b");
  setCell(0, "A4", "=2");
  setCell(0, "A5", "A");
  setCell(0, "A6", "=10");
  setCell(0, "C1", "=SORT(A1:A6,1,-1)");
  recalc();
  eq(col(0, "C1", 6), [10, 2, 2, "b", "A", ""]);
});

test("SORT sort_index, by_col, and bad options", function () {
  reset();
  setCell(0, "A1", "=1"); setCell(0, "B1", "=3");
  setCell(0, "A2", "=1"); setCell(0, "B2", "=1");
  setCell(0, "A3", "=2"); setCell(0, "B3", "=2");
  setCell(0, "D1", "=SORT(A1:B3,2,1,FALSE)");
  setCell(0, "F1", "=3"); setCell(0, "G1", "=1"); setCell(0, "H1", "=2");
  setCell(0, "F2", "=SORT(F1:H1,1,1,TRUE)");
  setCell(0, "A5", "=SORT(A1:A3,2)");
  setCell(0, "A6", "=SORT(A1:A3,1,0)");
  setCell(0, "A7", "=SORT(A1:A3,1,1,2)");
  setCell(0, "A8", "=SORT(A1:A3,1,-1,TRUE)");
  recalc();
  eq(col(0, "D1", 3), [1, 2, 1]);
  eq(col(0, "E1", 3), [1, 2, 3]);
  eq(row(0, "F2", 3), [1, 2, 3]);
  eq(val(0, "A5"), "#VALUE!");
  eq(val(0, "A6"), "#VALUE!");
  eq(val(0, "A7"), "#VALUE!");
  /* one column, by_col TRUE: the only column stays in place */
  eq(col(0, "A8", 3), [1, 1, 2]);
});

test("SORT #SPILL! when a cell is in the way, and an error key", function () {
  reset();
  setCell(0, "A1", "=3");
  setCell(0, "A2", "=1");
  setCell(0, "A3", "=2");
  setCell(0, "C2", "busy");
  setCell(0, "C1", "=SORT(A1:A3)");
  setCell(0, "E1", "=9");
  setCell(0, "E2", "=4");
  setCell(0, "F1", "=1/0");
  setCell(0, "F2", "=5");
  setCell(0, "G1", "=SORT(E1:F2)");
  setCell(0, "E4", "=1/0");
  setCell(0, "E5", "=5");
  setCell(0, "G4", "=SORT(E4:E5)");
  recalc();
  eq(val(0, "C1"), "#SPILL!");
  eq(val(0, "C2"), "busy");
  eq(shown(0, "C3"), "");
  eq(val(0, "G1"), 4);
  eq(shown(0, "H1"), 5);
  eq(shown(0, "G2"), 9);
  eq(shown(0, "H2"), "#DIV/0!");
  eq(val(0, "G4"), "#DIV/0!");
});

test("SORTBY one key, two keys, horizontal, and #VALUE!", function () {
  reset();
  setCell(0, "A1", "=2"); setCell(0, "B1", "b");
  setCell(0, "A2", "=1"); setCell(0, "B2", "a");
  setCell(0, "A3", "=2"); setCell(0, "B3", "a");
  setCell(0, "D1", "=SORTBY(A1:B3,A1:A3,-1)");
  setCell(0, "F1", "=SORTBY(A1:B3,A1:A3,1,B1:B3,1)");
  setCell(0, "A5", "=3"); setCell(0, "B5", "=1"); setCell(0, "C5", "=2");
  setCell(0, "A6", "=30"); setCell(0, "B6", "=10"); setCell(0, "C6", "=20");
  setCell(0, "A8", "=SORTBY(A5:C6,A5:C5,1)");
  setCell(0, "E5", "=SORTBY(A1:B3,A1:A2)");
  setCell(0, "E6", "=SORTBY(A1:A3,B1:B3,2)");
  setCell(0, "E7", "=SORTBY(A1:B3,A1:A3,1,A5:C5)");
  recalc();
  eq(col(0, "D1", 3), [2, 2, 1]);
  eq(col(0, "E1", 3), ["b", "a", "a"]);
  eq(col(0, "F1", 3), [1, 2, 2]);
  eq(col(0, "G1", 3), ["a", "a", "b"]);
  eq(row(0, "A8", 3), [1, 2, 3]);
  eq(row(0, "A9", 3), [10, 20, 30]);
  eq(val(0, "E5"), "#VALUE!");
  eq(val(0, "E6"), "#VALUE!");
  eq(val(0, "E7"), "#VALUE!");
});

test("FILTER rows, columns, if_empty, #CALC! and #VALUE!", function () {
  reset();
  setCell(0, "A1", "apple"); setCell(0, "B1", "=5");
  setCell(0, "A2", "pear"); setCell(0, "B2", "=20");
  setCell(0, "A3", "apple"); setCell(0, "B3", "=15");
  setCell(0, "D1", "=FILTER(A1:B3,B1:B3>10)");
  setCell(0, "D4", "=FILTER(A1:B3,B1:B3>100)");
  setCell(0, "D5", "=FILTER(A1:B3,B1:B3>100,\"none\")");
  setCell(0, "D6", "=FILTER(A1:B3,B1:B2)");
  setCell(0, "F1", "=1"); setCell(0, "G1", "=2"); setCell(0, "H1", "=3");
  setCell(0, "F2", "=4"); setCell(0, "G2", "=5"); setCell(0, "H2", "=6");
  setCell(0, "F3", "=1"); setCell(0, "G3", "=0"); setCell(0, "H3", "=1");
  setCell(0, "F5", "=FILTER(F1:H2,F3:H3)");
  setCell(0, "A8", "=IFERROR(FILTER(A1:A3,A1:A3=\"missing\"),\"ok\")");
  recalc();
  eq(col(0, "D1", 2), ["pear", "apple"]);
  eq(col(0, "E1", 2), [20, 15]);
  eq(val(0, "D4"), "#CALC!");
  eq(val(0, "D5"), "none");
  eq(val(0, "D6"), "#VALUE!");
  eq(row(0, "F5", 2), [1, 3]);
  eq(row(0, "F6", 2), [4, 6]);
  eq(val(0, "A8"), "ok");
});

test("FILTER AND via * and OR via +, including parentheses", function () {
  reset();
  setCell(0, "A1", "apple"); setCell(0, "B1", "=5"); setCell(0, "C1", "x");
  setCell(0, "A2", "pear"); setCell(0, "B2", "=20"); setCell(0, "C2", "y");
  setCell(0, "A3", "apple"); setCell(0, "B3", "=15"); setCell(0, "C3", "X");
  setCell(0, "E1", "=FILTER(A1:B3,(B1:B3>10)*(C1:C3=\"x\"))");
  setCell(0, "E4", "=FILTER(B1:B3,(B1:B3>10)+(A1:A3=\"pear\"))");
  setCell(0, "G1", "=(B1:B3>10)*(C1:C3=\"x\")");
  recalc();
  eq(val(0, "E1"), "apple");
  eq(shown(0, "F1"), 15);
  eq(shown(0, "E2"), "");
  eq(col(0, "E4", 2), [20, 15]);
  eq(col(0, "G1", 3), [0, 0, 1]);
});

test("UNIQUE rows, columns, exactly_once and #CALC!", function () {
  reset();
  setCell(0, "A1", "apple");
  setCell(0, "A2", "Apple");
  setCell(0, "A3", "pear");
  setCell(0, "A4", "apple");
  setCell(0, "C1", "=UNIQUE(A1:A4)");
  setCell(0, "E1", "a"); setCell(0, "F1", "b"); setCell(0, "G1", "a");
  setCell(0, "E2", "=UNIQUE(E1:G1)");
  setCell(0, "E3", "=UNIQUE(E1:G1,TRUE)");
  setCell(0, "A6", "a"); setCell(0, "A7", "b"); setCell(0, "A8", "a"); setCell(0, "A9", "c");
  setCell(0, "C6", "=UNIQUE(A6:A9,FALSE,TRUE)");
  setCell(0, "C9", "=UNIQUE(A1:A2,FALSE,TRUE)");
  setCell(0, "E6", "=1"); setCell(0, "F6", "=2");
  setCell(0, "E7", "=1"); setCell(0, "F7", "=3");
  setCell(0, "E8", "=1"); setCell(0, "F8", "=2");
  setCell(0, "H6", "=UNIQUE(E6:F8)");
  recalc();
  eq(col(0, "C1", 2), ["apple", "pear"]);
  eq(shown(0, "C3"), "");
  eq(row(0, "E2", 3), ["a", "b", "a"]);
  eq(row(0, "E3", 2), ["a", "b"]);
  eq(col(0, "C6", 2), ["b", "c"]);
  eq(val(0, "C9"), "#CALC!");
  eq(row(0, "H6", 2), [1, 2]);
  eq(row(0, "H7", 2), [1, 3]);
  eq(shown(0, "H8"), "");
});

test("nesting, A1#, and another sheet", function () {
  reset();
  setCell(0, "A1", "b");
  setCell(0, "A2", "a");
  setCell(0, "A3", "b");
  setCell(0, "A4", "a");
  setCell(0, "C1", "=SORT(UNIQUE(A1:A4))");
  setCell(0, "B1", "=5");
  setCell(0, "B2", "=20");
  setCell(0, "B3", "=15");
  setCell(0, "B4", "=1");
  setCell(0, "E1", "=SUM(FILTER(B1:B4,A1:A4=\"a\"))");
  setCell(0, "A6", "=SEQUENCE(3)");
  setCell(0, "E6", "=SORT(A6#,1,-1)");
  setCell(1, "A1", "=3");
  setCell(1, "A2", "=1");
  setCell(1, "A3", "=2");
  setCell(0, "G1", "=SORT(Sheet2!A1:A3)");
  recalc();
  eq(col(0, "C1", 2), ["a", "b"]);
  eq(val(0, "E1"), 21);
  eq(col(0, "E6", 3), [3, 2, 1]);
  eq(col(0, "G1", 3), [1, 2, 3]);
});

test("array comparisons and arithmetic, including SEQUENCE(3)+1", function () {
  reset();
  setCell(0, "B1", "=10");
  setCell(0, "B2", "=200");
  setCell(0, "B3", "=50");
  setCell(0, "C1", "X");
  setCell(0, "C2", "x");
  setCell(0, "D1", "=B1:B3>100");
  setCell(0, "E1", "=C1:C2=\"x\"");
  setCell(0, "A5", "=SEQUENCE(3)+1");
  setCell(0, "C5", "=SEQUENCE(2,2)*2");
  setCell(0, "A9", "=SEQUENCE(3)+SEQUENCE(1,3)");
  setCell(0, "C9", "=(SEQUENCE(3)+1)*2");
  setCell(0, "E5", "=5");
  setCell(0, "E7", "=1");
  setCell(0, "F5", "=E5:E7+1");
  setCell(0, "A11", "=SUM(SEQUENCE(3)+1)");
  recalc();
  eq(col(0, "D1", 3), ["FALSE", "TRUE", "FALSE"]);
  eq(col(0, "E1", 2), ["TRUE", "TRUE"]);
  eq(col(0, "A5", 3), [2, 3, 4]);
  eq(row(0, "C5", 2), [2, 4]);
  eq(row(0, "C6", 2), [6, 8]);
  eq(val(0, "A9"), "#VALUE!");
  eq(col(0, "C9", 3), [4, 6, 8]);
  eq(col(0, "F5", 3), [6, 1, 2]);
  eq(val(0, "A11"), 9);
});

test("scalar formulas stay on the old path", function () {
  reset();
  setCell(0, "A1", "=10");
  setCell(0, "B1", "=20");
  setCell(0, "C1", "=A1+B1");
  setCell(0, "C2", "=1+2");
  setCell(0, "C3", "=8/2");
  setCell(0, "C4", "=1/0");
  setCell(0, "C5", "=0.1+0.2");
  setCell(0, "C6", "=A1>5");
  setCell(0, "C7", "=A1:A1");
  setCell(0, "C8", "=A1+1");
  var i;
  for (i = 1; i <= 40; i++) {
    setCell(0, "E" + i, String(i));
    setCell(0, "F" + i, "=E" + i + "*2");
  }
  var t = Date.now();
  recalc();
  if (Date.now() - t > 2000) throw new Error("scalar recalc was too slow");
  eq(val(0, "C1"), 30);
  eq(val(0, "C2"), 3);
  eq(val(0, "C3"), 4);
  eq(val(0, "C4"), "#DIV/0!");
  eq(val(0, "C5"), 0.3);
  eq(val(0, "C6"), "#ERR");
  eq(val(0, "C7"), "#ERR");
  eq(val(0, "C8"), 11);
  eq(val(0, "F40"), 80);
  eq(ctx.spillAnchorInfo(0, 0, 2), null);
  eq(ctx.spillTouchFlag.on, false);
});

test("FX catalog lists SORT, SORTBY, FILTER and UNIQUE", function () {
  var sort = ctx.fxFindName("SORT");
  var by = ctx.fxFindName("SORTBY");
  var filter = ctx.fxFindName("FILTER");
  var unique = ctx.fxFindName("UNIQUE");
  if (!sort || sort.cat !== "Arrays" || sort.sig.indexOf("sort_order") < 0) throw new Error("SORT hint");
  if (!by || by.sig.indexOf("by_array1") < 0) throw new Error("SORTBY hint");
  if (!filter || filter.sig.indexOf("if_empty") < 0) throw new Error("FILTER hint");
  if (!unique || unique.sig.indexOf("exactly_once") < 0) throw new Error("UNIQUE hint");
  var ctxn = ctx.fxCaretContext("=FILTER(A1:A3,", 14);
  if (!ctxn || ctxn.name !== "FILTER" || ctxn.arg !== 1) throw new Error("caret " + JSON.stringify(ctxn));
});

test("grid is still 26 x 100 and errors include #CALC!", function () {
  eq(ctx.COLS, 26);
  eq(ctx.ROWS, 100);
  if (ctx.ALL_ERRORS.indexOf("#CALC!") < 0) throw new Error("missing #CALC!");
  if (ctx.ALL_ERRORS.indexOf("#SPILL!") < 0) throw new Error("missing #SPILL!");
  if (ctx.CFG.errorValues.indexOf("#CALC!") < 0) throw new Error("config missing #CALC!");
});

console.log("passed", passed, "failed", failed);
process.exit(failed ? 1 : 0);
