#!/usr/bin/env node
/* Pure-helper tests for Spreadsheet SH15 TEXTSPLIT and CHAR
 * (no DOM, no browser).
 *   node apps/office/spreadsheet/test-sh15-textsplit.js
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
}).join("\n;\n"), ctx, { filename: "spreadsheet-sh15.js" });

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
function block(si, a1, rows, cols) {
  var addr = ctx.parseAddr(a1), out = [], r, c, line;
  for (r = 0; r < rows; r++) {
    line = [];
    for (c = 0; c < cols; c++) line.push(ctx.displayedVal(addr.r + r, addr.c + c, si));
    out.push(line);
  }
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

test("column split spills across the row and a 1x1 stays a value", function () {
  reset();
  setCell(0, "A1", '=TEXTSPLIT("a,b,c",",")');
  setCell(0, "A3", '=TEXTSPLIT("hello",",")');
  setCell(0, "A5", '=TEXTSPLIT("a*b*c","*")');
  setCell(0, "A7", '=TEXTSPLIT("a::b::c","::")');
  recalc();
  eq(row(0, "A1", 3), ["a", "b", "c"]);
  eq(ctx.workbook.sheets[0].cells[0][1].formula, "");
  eq(ctx.workbook.sheets[0].cells[0][1].value, "");
  eq(!!ghost(0, "B1"), true);
  eq(val(0, "A3"), "hello");
  eq(ctx.spillAnchorInfo(0, 2, 0), null);
  eq(row(0, "A5", 3), ["a", "b", "c"]);
  eq(row(0, "A7", 3), ["a", "b", "c"]);
});

test("row and column split", function () {
  reset();
  setCell(0, "A1", '=TEXTSPLIT("a,b;c,d",",",";")');
  setCell(0, "E1", '=TEXTSPLIT("a"&CHAR(10)&"b"&CHAR(10)&"c","",CHAR(10))');
  recalc();
  eq(block(0, "A1", 2, 2), [["a", "b"], ["c", "d"]]);
  eq(col(0, "E1", 3), ["a", "b", "c"]);
  eq(shown(0, "F1"), "");
});

test("ignore_empty skips empty pieces", function () {
  reset();
  setCell(0, "A1", '=TEXTSPLIT("a,,b,",",")');
  setCell(0, "A3", '=TEXTSPLIT("a,,b,",",",,TRUE)');
  setCell(0, "A5", '=TEXTSPLIT("a,,b;;c,",",",";",TRUE)');
  setCell(0, "E1", '=TEXTSPLIT(",,",",",,TRUE)');
  recalc();
  eq(row(0, "A1", 4), ["a", "", "b", ""]);
  eq(row(0, "A3", 2), ["a", "b"]);
  eq(shown(0, "C3"), "");
  eq(block(0, "A5", 2, 2), [["a", "b"], ["c", "#N/A"]]);
  eq(val(0, "E1"), "#VALUE!");
});

test("match_mode 1 is case-insensitive and 0 is not", function () {
  reset();
  setCell(0, "A1", '=TEXTSPLIT("redXblueXgreen","x")');
  setCell(0, "A3", '=TEXTSPLIT("redXblueXgreen","x",,,1)');
  setCell(0, "A5", '=TEXTSPLIT("oneXtwoYthree","x","y",,1)');
  setCell(0, "E1", '=TEXTSPLIT("xxabyyABzz","AB",,,1)');
  recalc();
  eq(val(0, "A1"), "redXblueXgreen");
  eq(row(0, "A3", 3), ["red", "blue", "green"]);
  eq(block(0, "A5", 2, 2), [["one", "two"], ["three", "#N/A"]]);
  eq(row(0, "E1", 3), ["xx", "yy", "zz"]);
});

test("ragged rows are padded, default #N/A", function () {
  reset();
  setCell(0, "A1", '=TEXTSPLIT("a,b,c;d,e",",",";")');
  setCell(0, "A4", '=TEXTSPLIT("a,b,c;d,e",",",";",FALSE,0,"-")');
  setCell(0, "A7", '=TEXTSPLIT("a;b,c;d,e,f",",",";")');
  setCell(0, "E7", '=TEXTSPLIT("a,b,c;d,e",",",";",,,0)');
  recalc();
  eq(block(0, "A1", 2, 3), [["a", "b", "c"], ["d", "e", "#N/A"]]);
  eq(block(0, "A4", 2, 3), [["a", "b", "c"], ["d", "e", "-"]]);
  eq(block(0, "A7", 3, 3), [["a", "#N/A", "#N/A"], ["b", "c", "#N/A"], ["d", "e", "f"]]);
  eq(block(0, "E7", 2, 3), [["a", "b", "c"], ["d", "e", 0]]);
});

test("CHAR(10) is a row delimiter, including text stored in a cell", function () {
  reset();
  setCell(0, "A1", '=TEXTSPLIT("a,b"&CHAR(10)&"c,d",",",CHAR(10))');
  setCell(0, "A4", "a,b\nc,d");
  setCell(0, "C4", '=TEXTSPLIT(A4,",",CHAR(10))');
  setCell(0, "E1", "=CHAR(65)");
  setCell(0, "E2", "=CHAR(10)");
  setCell(0, "E3", "=CHAR(97)");
  setCell(0, "E4", "=LEN(CHAR(10))");
  recalc();
  eq(block(0, "A1", 2, 2), [["a", "b"], ["c", "d"]]);
  eq(block(0, "C4", 2, 2), [["a", "b"], ["c", "d"]]);
  eq(val(0, "E1"), "A");
  eq(val(0, "E2"), "\n");
  eq(val(0, "E3"), "a");
  eq(val(0, "E4"), 1);
});

test("single cell ref works, a range is #VALUE!, quotes are not CSV", function () {
  reset();
  setCell(0, "A1", "x,y,z");
  setCell(0, "B1", ";");
  setCell(0, "A2", "p;q;r");
  setCell(0, "D1", "=TEXTSPLIT(A1,\",\")");
  setCell(0, "D3", "=TEXTSPLIT(A2,B1)");
  setCell(0, "D5", "=TEXTSPLIT(A1:A2,\",\")");
  setCell(0, "D6", "=TEXTSPLIT(A1:B1,\",\")");
  setCell(0, "D7", "=TEXTSPLIT(SEQUENCE(2),\",\")");
  setCell(0, "A8", 'a,"b,c",d');
  setCell(0, "D8", '=TEXTSPLIT(A8,",")');
  recalc();
  eq(row(0, "D1", 3), ["x", "y", "z"]);
  eq(row(0, "D3", 3), ["p", "q", "r"]);
  eq(val(0, "D5"), "#VALUE!");
  eq(val(0, "D6"), "#VALUE!");
  eq(val(0, "D7"), "#VALUE!");
  eq(row(0, "D8", 4), ["a", "\"b", "c\"", "d"]);
  setCell(0, "A1", "x,y");
  recalc();
  eq(row(0, "D1", 3), ["x", "y", ""]);
  eq(ghost(0, "F1"), null);
});

test("#VALUE! when there is no delimiter, a bad option, or a bad CHAR", function () {
  reset();
  setCell(0, "A1", '=TEXTSPLIT("a,b")');
  setCell(0, "A2", '=TEXTSPLIT("a,b","")');
  setCell(0, "A3", '=TEXTSPLIT("a,b","","")');
  setCell(0, "A4", '=TEXTSPLIT("a,b",",",,,2)');
  setCell(0, "A5", '=TEXTSPLIT("a,b",",",,"maybe")');
  setCell(0, "A6", '=TEXTSPLIT("a,b",",",,, "no")');
  setCell(0, "A7", "=1/0");
  setCell(0, "B7", "=TEXTSPLIT(A7,\",\")");
  setCell(0, "A8", "=CHAR(0)");
  setCell(0, "A9", "=CHAR(256)");
  setCell(0, "A10", "=CHAR(-1)");
  setCell(0, "A11", '=CHAR("x")');
  setCell(0, "A12", "=CHAR(65.9)");
  recalc();
  eq(val(0, "A1"), "#VALUE!");
  eq(val(0, "A2"), "#VALUE!");
  eq(val(0, "A3"), "#VALUE!");
  eq(val(0, "A4"), "#VALUE!");
  eq(val(0, "A5"), "#VALUE!");
  eq(val(0, "A6"), "#VALUE!");
  eq(val(0, "B7"), "#DIV/0!");
  eq(val(0, "A8"), "#VALUE!");
  eq(val(0, "A9"), "#VALUE!");
  eq(val(0, "A10"), "#VALUE!");
  eq(val(0, "A11"), "#VALUE!");
  eq(val(0, "A12"), "A");
});

test("#SPILL! when a cell blocks TEXTSPLIT, and nothing partial is written", function () {
  reset();
  setCell(0, "B1", "busy");
  setCell(0, "A1", '=TEXTSPLIT("a,b,c",",")');
  setCell(0, "A3", "busy");
  setCell(0, "A2", '=TEXTSPLIT("a"&CHAR(10)&"b"&CHAR(10)&"c","",CHAR(10))');
  recalc();
  eq(val(0, "A1"), "#SPILL!");
  eq(val(0, "B1"), "busy");
  eq(shown(0, "C1"), "");
  eq(ghost(0, "C1"), null);
  eq(val(0, "A2"), "#SPILL!");
  eq(val(0, "A3"), "busy");
  eq(shown(0, "A4"), "");
  eq(ghost(0, "A4"), null);
});

test("INDEX and A1# read a TEXTSPLIT spill", function () {
  reset();
  setCell(0, "A1", '=TEXTSPLIT("a,b;c,d",",",";")');
  setCell(0, "E1", '=INDEX(TEXTSPLIT("a,b;c,d",",",";"),2,1)');
  setCell(0, "E2", "=INDEX(A1#,2,2)");
  setCell(0, "E3", "=A1#");
  setCell(0, "A4", '=TEXTSPLIT("10,20,30",",")');
  setCell(0, "E6", "=SUM(A4#)");
  setCell(0, "A6", '=INDEX(TEXTSPLIT("a,b,c",","),2)');
  setCell(0, "A8", '=INDEX(TEXTSPLIT("a,b,c;d",",",";"),2,2)');
  recalc();
  eq(val(0, "E1"), "c");
  eq(val(0, "E2"), "d");
  eq(block(0, "E3", 2, 2), [["a", "b"], ["c", "d"]]);
  eq(val(0, "E6"), 60);
  eq(val(0, "A6"), "b");
  eq(val(0, "A8"), "#N/A");
  eq(row(0, "A4", 3), ["10", "20", "30"]);
});

test("FX catalog lists CHAR and TEXTSPLIT for the hint and the picker", function () {
  var ch = ctx.fxFindName("CHAR");
  var sp = ctx.fxFindName("TEXTSPLIT");
  if (!ch || ch.cat !== "Text" || ch.sig.indexOf("CHAR") !== 0) throw new Error("CHAR hint missing");
  if (!sp || sp.cat !== "Text" || sp.sig.indexOf("pad_with") < 0) throw new Error("TEXTSPLIT hint missing");
  var hint = ctx.fxCaretContext("=TEXTSPLIT(", 11);
  if (!hint || hint.name !== "TEXTSPLIT" || !hint.item) throw new Error("caret " + JSON.stringify(hint));
  var names = ctx.fxSuggest("TEXT", 8).map(function (it) { return it.name; });
  if (names.indexOf("TEXTSPLIT") < 0) throw new Error("suggest " + names.join(","));
  var help = fs.readFileSync(path.join(dir, "FUNCTIONS.txt"), "utf8");
  if (help.indexOf("TEXTSPLIT") < 0 || help.indexOf("CHAR(number)") < 0) throw new Error("FUNCTIONS.txt missing");
});

test("grid, storage and cache token stay put", function () {
  var html = fs.readFileSync(path.join(dir, "spreadsheet.html"), "utf8");
  /* (before SH18) required title Spreadsheet SH14 and forbade ?v=SH15 */
  if (html.indexOf("?v=SH15") >= 0) throw new Error("unexpected ?v=SH15");
  /* (before SH21) if (html.indexOf("Spreadsheet SH18") < 0) throw new Error("title is not SH18"); */
  if (html.indexOf("Spreadsheet SH21") < 0) throw new Error("title is not SH21");
  if (ctx.ROWS !== 100 || ctx.COLS !== 26) throw new Error("grid changed");
  if (ctx.STORE_KEY !== "sheet-v4") throw new Error("storage key changed");
});

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
