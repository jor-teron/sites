#!/usr/bin/env node
/* Pure-helper tests for Spreadsheet SH13 spill, SEQUENCE and RANDARRAY
 * (no DOM, no jsdom, no browser).
 *   node apps/office/spreadsheet/test-sh13-spill.js
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
  "spreadsheet_charts.js"
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
}).join("\n;\n"), ctx, { filename: "spreadsheet-sh13.js" });

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
function ghost(si, a1) {
  var addr = ctx.parseAddr(a1);
  return ctx.ghostAt(si, addr.r, addr.c);
}
function recalc() { ctx.recalcAll(); }
function eq(got, expected, msg) {
  if (typeof expected === "number" && typeof got === "number") {
    if (Math.abs(got - expected) > 1e-9) throw new Error((msg || "") + " got " + got + " expected " + expected);
    return;
  }
  if (got !== expected) throw new Error((msg || "") + " got " + JSON.stringify(got) + " expected " + JSON.stringify(expected));
}

test("SEQUENCE column, row and start/step", function () {
  reset();
  setCell(0, "A1", "=SEQUENCE(3)");
  setCell(0, "C1", "=SEQUENCE(2,3)");
  setCell(0, "A6", "=SEQUENCE(2,2,10,-2)");
  recalc();
  eq(val(0, "A1"), 1);
  eq(shown(0, "A2"), 2);
  eq(shown(0, "A3"), 3);
  eq(!!ghost(0, "A2"), true);
  eq(!!ghost(0, "A1"), false);
  eq(val(0, "C1"), 1); eq(shown(0, "D1"), 2); eq(shown(0, "E1"), 3);
  eq(shown(0, "C2"), 4); eq(shown(0, "D2"), 5); eq(shown(0, "E2"), 6);
  eq(val(0, "A6"), 10); eq(shown(0, "B6"), 8);
  eq(shown(0, "A7"), 6); eq(shown(0, "B7"), 4);
});

test("SEQUENCE defaults and 1x1 is a normal value", function () {
  reset();
  setCell(0, "A1", "=SEQUENCE(1)");
  setCell(0, "B1", "=SEQUENCE(1,1,7,4)");
  recalc();
  eq(val(0, "A1"), 1);
  eq(val(0, "B1"), 7);
  eq(ctx.spillAnchorInfo(0, 0, 0), null);
  eq(ctx.spillAnchorInfo(0, 0, 1), null);
});

test("SEQUENCE and RANDARRAY bad arguments", function () {
  reset();
  setCell(0, "A1", "=SEQUENCE()");
  setCell(0, "A2", "=SEQUENCE(0)");
  setCell(0, "A3", "=SEQUENCE(-3)");
  setCell(0, "A4", "=SEQUENCE(\"a\")");
  setCell(0, "A5", "=RANDARRAY(0,1)");
  setCell(0, "A6", "=RANDARRAY(1,-1)");
  setCell(0, "A7", "=RANDARRAY(1,1,5,1)");
  setCell(0, "A8", "=RANDARRAY(1,1,0,1,\"maybe\")");
  setCell(0, "A9", "=SEQUENCE(2.2)");
  recalc();
  eq(val(0, "A1"), "#VALUE!");
  eq(val(0, "A2"), "#VALUE!");
  eq(val(0, "A3"), "#VALUE!");
  eq(val(0, "A4"), "#VALUE!");
  eq(val(0, "A5"), "#VALUE!");
  eq(val(0, "A6"), "#VALUE!");
  eq(val(0, "A7"), "#VALUE!");
  eq(val(0, "A8"), "#VALUE!");
  eq(val(0, "A9"), 1);
  eq(shown(0, "A10"), 2);
});

test("oversized SEQUENCE is #SPILL! and does not allocate past the grid", function () {
  reset();
  var t = Date.now();
  setCell(0, "A1", "=SEQUENCE(100000)");
  setCell(0, "B1", "=SEQUENCE(101)");
  setCell(0, "Z1", "=SEQUENCE(1,2)");
  setCell(0, "A100", "=SEQUENCE(2)");
  recalc();
  if (Date.now() - t > 2000) throw new Error("oversized SEQUENCE was too slow");
  eq(val(0, "A1"), "#SPILL!");
  eq(shown(0, "A2"), "");
  eq(val(0, "B1"), "#SPILL!");
  eq(val(0, "Z1"), "#SPILL!");
  eq(val(0, "A100"), "#SPILL!");
  eq(ghost(0, "A2"), null);
});

test("RANDARRAY bounds and whole numbers", function () {
  reset();
  var orig = ctx.Math.random;
  var seq = [0.25, 0, 0.5, 0.999, 0, 0.5];
  var i = 0;
  ctx.Math.random = function () { return seq[i++ % seq.length]; };
  setCell(0, "A1", "=RANDARRAY()");
  setCell(0, "A2", "=RANDARRAY(1,3,1,3,TRUE)");
  setCell(0, "A3", "=RANDARRAY(2,1,10,20,FALSE)");
  recalc();
  eq(val(0, "A1"), 0.25);
  eq(ctx.spillAnchorInfo(0, 0, 0), null);
  eq(val(0, "A2"), 1);
  eq(shown(0, "B2"), 2);
  eq(shown(0, "C2"), 3);
  eq(val(0, "A3"), 10);
  eq(shown(0, "A4"), 15);
  ctx.Math.random = orig;
});

test("ghosts are not stored as cell values", function () {
  reset();
  setCell(0, "A1", "=SEQUENCE(3)");
  recalc();
  var cell = ctx.workbook.sheets[0].cells[1][0];
  eq(cell.formula, "");
  eq(cell.value, "");
  eq(shown(0, "A2"), 2);
});

test("#SPILL! when a cell is blocked, and nothing partial is written", function () {
  reset();
  setCell(0, "A2", "busy");
  setCell(0, "A1", "=SEQUENCE(3)");
  recalc();
  eq(val(0, "A1"), "#SPILL!");
  eq(val(0, "A2"), "busy");
  eq(shown(0, "A3"), "");
  eq(ghost(0, "A3"), null);
});

test("#SPILL! on a merged cell", function () {
  reset();
  ctx.workbook.sheets[0].merges = [{ r1: 1, c1: 0, r2: 1, c2: 1 }];
  setCell(0, "A1", "=SEQUENCE(3)");
  recalc();
  eq(val(0, "A1"), "#SPILL!");
  eq(ghost(0, "A2"), null);
});

test("#SPILL! when the spill hits another spill", function () {
  reset();
  setCell(0, "D1", "=SEQUENCE(5)");
  setCell(0, "B3", "=SEQUENCE(3,3)");
  recalc();
  eq(val(0, "D1"), 1);
  eq(shown(0, "D5"), 5);
  eq(val(0, "B3"), "#SPILL!");
  eq(shown(0, "B4"), "");
  eq(shown(0, "C3"), "");
});

test("shrink clears ghosts that are no longer in the result", function () {
  reset();
  setCell(0, "A1", "=SEQUENCE(4)");
  recalc();
  eq(shown(0, "A4"), 4);
  setCell(0, "A1", "=SEQUENCE(2)");
  recalc();
  eq(val(0, "A1"), 1);
  eq(shown(0, "A2"), 2);
  eq(shown(0, "A3"), "");
  eq(shown(0, "A4"), "");
  eq(ghost(0, "A3"), null);
  eq(ghost(0, "A4"), null);
});

test("typing into a ghost blocks the source", function () {
  reset();
  setCell(0, "A1", "=SEQUENCE(3)");
  recalc();
  setCell(0, "A2", "9");
  recalc();
  eq(val(0, "A1"), "#SPILL!");
  eq(val(0, "A2"), "9");
  eq(shown(0, "A3"), "");
});

test("a formula can read a ghost, including one calculated later", function () {
  reset();
  setCell(0, "E1", "=B3");
  setCell(0, "A1", "=B2");
  setCell(0, "B1", "=SEQUENCE(3)");
  recalc();
  eq(val(0, "B1"), 1);
  eq(shown(0, "B2"), 2);
  eq(val(0, "A1"), 2);
  eq(val(0, "E1"), 3);
});

test("SUM COUNT MEDIAN and INDEX accept an array", function () {
  reset();
  setCell(0, "A1", "=SUM(SEQUENCE(5))");
  setCell(0, "A2", "=SUM(SEQUENCE(2,3))");
  setCell(0, "A3", "=COUNT(SEQUENCE(5))");
  setCell(0, "A4", "=MEDIAN(SEQUENCE(5))");
  setCell(0, "A5", "=INDEX(SEQUENCE(4),3)");
  setCell(0, "C1", "=SEQUENCE(3)");
  setCell(0, "D1", "=SUM(C1:C3)");
  recalc();
  eq(val(0, "A1"), 15);
  eq(val(0, "A2"), 21);
  eq(val(0, "A3"), 5);
  eq(val(0, "A4"), 3);
  eq(val(0, "A5"), 3);
  eq(val(0, "D1"), 6);
});

test("A1# is the whole spill", function () {
  reset();
  setCell(0, "A1", "=SEQUENCE(3)");
  setCell(0, "E1", "=SUM(A1#)");
  setCell(0, "G1", "=A1#");
  setCell(0, "A5", "5");
  setCell(0, "A6", "=A5#");
  recalc();
  eq(val(0, "E1"), 6);
  eq(val(0, "G1"), 1);
  eq(shown(0, "G2"), 2);
  eq(shown(0, "G3"), 3);
  eq(val(0, "A6"), "#REF!");
  eq(ctx.shiftFormula("=A1#", 1, 1), "=B2#");
  eq(ctx.shiftFormula("=Sheet2!A$1#", 0, 1), "=Sheet2!B$1#");
  eq(ctx.shiftFormula("=$A$1#", 2, 2), "=$A$1#");
});

test("spill across sheets", function () {
  reset();
  setCell(1, "A1", "=SEQUENCE(3)");
  setCell(0, "A1", "=Sheet2!A2");
  setCell(0, "B1", "=SUM(Sheet2!A1#)");
  recalc();
  eq(shown(1, "A2"), 2);
  eq(val(0, "A1"), 2);
  eq(val(0, "B1"), 6);
});

test("circular references are still #LOOP!", function () {
  reset();
  setCell(0, "A1", "=B1");
  setCell(0, "B1", "=A1");
  recalc();
  eq(val(0, "A1"), "#LOOP!");
  eq(val(0, "B1"), "#LOOP!");
});

test("charts read spilled values", function () {
  reset();
  setCell(0, "A1", "=SEQUENCE(3)");
  recalc();
  var d = ctx.chartExtractData(ctx.workbook.sheets[0].cells, { r1: 0, r2: 2, c1: 0, c2: 0 }, {});
  eq(d.series.length, 1);
  eq(d.series[0].values.join(","), "1,2,3");
});

test("plain formulas do not need a spill fix-up", function () {
  reset();
  var i;
  for (i = 1; i <= 40; i++) {
    setCell(0, "A" + i, String(i));
    setCell(0, "B" + i, "=A" + i + "*2");
  }
  var t = Date.now();
  recalc();
  if (Date.now() - t > 2000) throw new Error("plain recalc was too slow");
  eq(val(0, "B40"), 80);
  eq(ctx.spillTouchFlag.on, false);
});

test("FX catalog lists SEQUENCE and RANDARRAY", function () {
  var seq = ctx.fxFindName("SEQUENCE");
  var rnd = ctx.fxFindName("RANDARRAY");
  if (!seq || seq.cat !== "Arrays" || seq.sig.indexOf("rows") < 0) throw new Error("SEQUENCE hint missing");
  if (!rnd || rnd.sig.indexOf("whole") < 0) throw new Error("RANDARRAY hint missing");
  var ctxn = ctx.fxCaretContext("=SEQUENCE(3,", 12);
  if (!ctxn || ctxn.name !== "SEQUENCE" || !ctxn.item) throw new Error("caret hint " + JSON.stringify(ctxn));
});

test("grid is still 26 x 100 and errors include #SPILL!", function () {
  eq(ctx.COLS, 26);
  eq(ctx.ROWS, 100);
  if (ctx.ALL_ERRORS.indexOf("#SPILL!") < 0) throw new Error("missing #SPILL!");
  if (ctx.CFG.errorValues.indexOf("#SPILL!") < 0) throw new Error("config missing #SPILL!");
});

console.log("passed", passed, "failed", failed);
process.exit(failed ? 1 : 0);
