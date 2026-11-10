#!/usr/bin/env node
/* Pure-helper tests for Spreadsheet SH9 formulas (no DOM, no jsdom, no browser).
 *   node apps/office/spreadsheet/test-sh9-formulas.js
 */
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var assert = require("assert");

var dir = __dirname;
var files = [
  "spreadsheet_config.js",
  "spreadsheet_formula.js",
  "spreadsheet_functions.js",
  "spreadsheet_refs.js",
  "spreadsheet_state.js"
];
var ctx = {
  console: console,
  Date: Date,
  Math: Math,
  Number: Number,
  String: String,
  Boolean: Boolean,
  Array: Array,
  Object: Object,
  JSON: JSON,
  parseInt: parseInt,
  isNaN: isNaN,
  isFinite: isFinite,
  RegExp: RegExp,
  Error: Error,
  TypeError: TypeError,
  NaN: NaN,
  Infinity: Infinity,
  undefined: undefined,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout
};
vm.createContext(ctx);
var code = files.map(function (f) {
  return fs.readFileSync(path.join(dir, f), "utf8");
}).join("\n;\n");
vm.runInContext(code, ctx, { filename: "spreadsheet-sh9.js" });

var failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL", name + ":", e.message || e); }
}

function reset() {
  ctx.emptyWorkbook();
  ctx.workbook.sheets.push(ctx.makeSheet("Sheet2"));
  ctx.workbook.sheets.push(ctx.makeSheet("My Sheet"));
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

function recalc() { ctx.recalcAll(); }

function eq(got, expected, msg) {
  if (typeof expected === "number" && typeof got === "number") {
    if (Math.abs(got - expected) > 1e-9) {
      throw new Error((msg || "") + " got " + got + " expected " + expected);
    }
    return;
  }
  if (got !== expected) {
    throw new Error((msg || "") + " got " + JSON.stringify(got) + " expected " + JSON.stringify(expected));
  }
}

/* ---------- existing functions still work ---------- */
test("SUM AVERAGE MIN MAX COUNT", function () {
  reset();
  setCell(0, "A1", "10"); setCell(0, "A2", "20"); setCell(0, "A3", "30");
  setCell(0, "B1", "=SUM(A1:A3)");
  setCell(0, "B2", "=AVERAGE(A1:A3)");
  setCell(0, "B3", "=MIN(A1:A3)");
  setCell(0, "B4", "=MAX(A1:A3)");
  setCell(0, "B5", "=COUNT(A1:A3)");
  recalc();
  eq(val(0, "B1"), 60);
  eq(val(0, "B2"), 20);
  eq(val(0, "B3"), 10);
  eq(val(0, "B4"), 30);
  eq(val(0, "B5"), 3);
});

test("TRUE FALSE literals", function () {
  reset();
  setCell(0, "A1", "=TRUE");
  setCell(0, "A2", "=FALSE");
  setCell(0, "A3", "=1+TRUE");
  setCell(0, "A4", "=5*FALSE");
  recalc();
  eq(val(0, "A1"), "TRUE");
  eq(val(0, "A2"), "FALSE");
  eq(val(0, "A3"), 2);
  eq(val(0, "A4"), 0);
});

/* ---------- lookups ---------- */
test("VLOOKUP exact and approximate", function () {
  reset();
  setCell(0, "A1", "1"); setCell(0, "B1", "a");
  setCell(0, "A2", "5"); setCell(0, "B2", "b");
  setCell(0, "A3", "10"); setCell(0, "B3", "c");
  setCell(0, "C1", "=VLOOKUP(5,A1:B3,2,FALSE)");
  setCell(0, "C2", "=VLOOKUP(6,A1:B3,2,FALSE)");
  setCell(0, "C3", "=VLOOKUP(6,A1:B3,2,TRUE)");
  setCell(0, "C4", "=VLOOKUP(0,A1:B3,2,TRUE)");
  setCell(0, "C5", "=VLOOKUP(5,A1:B3,3,FALSE)");
  recalc();
  eq(val(0, "C1"), "b");
  eq(val(0, "C2"), "#N/A");
  eq(val(0, "C3"), "b");
  eq(val(0, "C4"), "#N/A");
  eq(val(0, "C5"), "#REF!");
});

test("VLOOKUP on another sheet", function () {
  reset();
  setCell(1, "A1", "100"); setCell(1, "B1", "ok");
  setCell(1, "A2", "200"); setCell(1, "B2", "yes");
  setCell(0, "C1", "=VLOOKUP(200,Sheet2!A1:B2,2,FALSE)");
  recalc();
  eq(val(0, "C1"), "yes");
});

test("HLOOKUP exact", function () {
  reset();
  setCell(0, "A1", "x"); setCell(0, "B1", "y"); setCell(0, "C1", "z");
  setCell(0, "A2", "10"); setCell(0, "B2", "20"); setCell(0, "C2", "30");
  setCell(0, "A3", "=HLOOKUP(\"y\",A1:C2,2,FALSE)");
  recalc();
  eq(val(0, "A3"), 20);
});

test("XLOOKUP exact, fallback, last-to-first", function () {
  reset();
  setCell(0, "A1", "p"); setCell(0, "B1", "1");
  setCell(0, "A2", "q"); setCell(0, "B2", "2");
  setCell(0, "A3", "p"); setCell(0, "B3", "3");
  setCell(0, "C1", "=XLOOKUP(\"q\",A1:A3,B1:B3)");
  setCell(0, "C2", "=XLOOKUP(\"no\",A1:A3,B1:B3,\"missing\")");
  setCell(0, "C3", "=XLOOKUP(\"p\",A1:A3,B1:B3,,0,-1)");
  setCell(0, "C4", "=XLOOKUP(\"no\",A1:A3,B1:B3)");
  recalc();
  eq(val(0, "C1"), 2);
  eq(val(0, "C2"), "missing");
  eq(val(0, "C3"), 3);
  eq(val(0, "C4"), "#N/A");
});

test("INDEX and MATCH", function () {
  reset();
  setCell(0, "A1", "red"); setCell(0, "B1", "10");
  setCell(0, "A2", "blue"); setCell(0, "B2", "20");
  setCell(0, "A3", "green"); setCell(0, "B3", "30");
  setCell(0, "C1", "=INDEX(B1:B3,2)");
  setCell(0, "C2", "=INDEX(A1:B3,3,1)");
  setCell(0, "C3", "=MATCH(\"blue\",A1:A3,0)");
  setCell(0, "C4", "=INDEX(B1:B3,MATCH(\"green\",A1:A3,0))");
  setCell(0, "C5", "=INDEX(B1:B3,9)");
  setCell(0, "C6", "=MATCH(25,B1:B3,1)");
  recalc();
  eq(val(0, "C1"), 20);
  eq(val(0, "C2"), "green");
  eq(val(0, "C3"), 2);
  eq(val(0, "C4"), 30);
  eq(val(0, "C5"), "#REF!");
  eq(val(0, "C6"), 2);
});

/* ---------- conditional aggregates ---------- */
test("SUMIF COUNTIF AVERAGEIF", function () {
  reset();
  setCell(0, "A1", "apple"); setCell(0, "B1", "10");
  setCell(0, "A2", "pear"); setCell(0, "B2", "5");
  setCell(0, "A3", "apple"); setCell(0, "B3", "7");
  setCell(0, "A4", "fig"); setCell(0, "B4", "20");
  setCell(0, "C1", "=SUMIF(A1:A4,\"apple\",B1:B4)");
  setCell(0, "C2", "=COUNTIF(A1:A4,\"apple\")");
  setCell(0, "C3", "=AVERAGEIF(A1:A4,\"apple\",B1:B4)");
  setCell(0, "C4", "=COUNTIF(B1:B4,\">9\")");
  setCell(0, "C5", "=SUMIF(B1:B4,\">=10\")");
  setCell(0, "C6", "=COUNTIF(A1:A4,\"*a*\")");
  setCell(0, "C7", "=AVERAGEIF(A1:A4,\"none\",B1:B4)");
  recalc();
  eq(val(0, "C1"), 17);
  eq(val(0, "C2"), 2);
  eq(val(0, "C3"), 8.5);
  eq(val(0, "C4"), 2);
  eq(val(0, "C5"), 30);
  eq(val(0, "C6"), 3); /* apple, pear, apple — fig has no a? fig has no a. apple, pear, apple = 3 */
  eq(val(0, "C7"), "#DIV/0!");
});

test("SUMIFS COUNTIFS with two criteria and a cross-sheet range", function () {
  reset();
  setCell(0, "A1", "east"); setCell(0, "B1", "apple"); setCell(0, "C1", "10");
  setCell(0, "A2", "west"); setCell(0, "B2", "apple"); setCell(0, "C2", "4");
  setCell(0, "A3", "east"); setCell(0, "B3", "pear"); setCell(0, "C3", "8");
  setCell(0, "A4", "east"); setCell(0, "B4", "apple"); setCell(0, "C4", "6");
  setCell(0, "D1", "=SUMIFS(C1:C4,A1:A4,\"east\",B1:B4,\"apple\")");
  setCell(0, "D2", "=COUNTIFS(A1:A4,\"east\",B1:B4,\"apple\")");
  setCell(1, "A1", "3"); setCell(1, "A2", "9"); setCell(1, "A3", "12");
  setCell(0, "D3", "=COUNTIF(Sheet2!A1:A3,\">=9\")");
  recalc();
  eq(val(0, "D1"), 16);
  eq(val(0, "D2"), 2);
  eq(val(0, "D3"), 2);
});

/* ---------- logic ---------- */
test("AND OR NOT IFS SWITCH", function () {
  reset();
  setCell(0, "A1", "5");
  setCell(0, "B1", "=AND(A1>0,A1<10)");
  setCell(0, "B2", "=AND(A1>0,A1>10)");
  setCell(0, "B3", "=OR(A1>10,A1=5)");
  setCell(0, "B4", "=NOT(A1=5)");
  setCell(0, "B5", "=IFS(A1>10,\"big\",A1>0,\"ok\")");
  setCell(0, "B6", "=IFS(A1>10,\"big\")");
  setCell(0, "B7", "=SWITCH(A1,1,\"one\",5,\"five\",\"other\")");
  setCell(0, "B8", "=SWITCH(A1,1,\"one\",2,\"two\")");
  recalc();
  eq(val(0, "B1"), "TRUE");
  eq(val(0, "B2"), "FALSE");
  eq(val(0, "B3"), "TRUE");
  eq(val(0, "B4"), "FALSE");
  eq(val(0, "B5"), "ok");
  eq(val(0, "B6"), "#N/A");
  eq(val(0, "B7"), "five");
  eq(val(0, "B8"), "#N/A");
});

/* ---------- text ---------- */
test("MID FIND SUBSTITUTE PROPER TEXTJOIN TEXT", function () {
  reset();
  setCell(0, "A1", "Hello World");
  setCell(0, "B1", "=MID(A1,7,5)");
  setCell(0, "B2", "=FIND(\"World\",A1)");
  setCell(0, "B3", "=FIND(\"world\",A1)");
  setCell(0, "B4", "=SUBSTITUTE(A1,\"l\",\"L\")");
  setCell(0, "B5", "=SUBSTITUTE(A1,\"l\",\"L\",2)");
  setCell(0, "B6", "=PROPER(\"mary ANN\")");
  setCell(0, "C1", "a"); setCell(0, "C2", ""); setCell(0, "C3", "b");
  setCell(0, "B7", "=TEXTJOIN(\",\",TRUE,C1:C3)");
  setCell(0, "B8", "=TEXTJOIN(\",\",FALSE,C1:C3)");
  setCell(0, "B9", "=TEXT(12.3,\"0.00\")");
  setCell(0, "B10", "=TEXT(0.25,\"0%\")");
  setCell(0, "B11", "=TEXT(DATE(2026,11,10),\"yyyy-mm-dd\")");
  setCell(0, "B12", "=TEXT(DATE(2026,11,10),\"dd/mm/yyyy\")");
  recalc();
  eq(val(0, "B1"), "World");
  eq(val(0, "B2"), 7);
  eq(val(0, "B3"), "#VALUE!");
  eq(val(0, "B4"), "HeLLo WorLd");
  eq(val(0, "B5"), "HelLo World");
  eq(val(0, "B6"), "Mary Ann");
  eq(val(0, "B7"), "a,b");
  eq(val(0, "B8"), "a,,b");
  eq(val(0, "B9"), "12.30");
  eq(val(0, "B10"), "25%");
  eq(val(0, "B11"), "2026-11-10");
  eq(val(0, "B12"), "10/11/2026");
});

/* ---------- dates ---------- */
test("DATE YEAR MONTH DAY WEEKDAY DATEDIF EDATE", function () {
  reset();
  setCell(0, "A1", "=DATE(2024,13,1)");
  setCell(0, "A2", "=YEAR(A1)");
  setCell(0, "A3", "=MONTH(A1)");
  setCell(0, "A4", "=DAY(A1)");
  setCell(0, "A5", "=DATE(2026,11,10)");
  setCell(0, "A6", "=WEEKDAY(A5,1)");
  setCell(0, "A7", "=WEEKDAY(A5,2)");
  setCell(0, "A8", "=DATEDIF(DATE(2020,1,15),DATE(2026,11,10),\"Y\")");
  setCell(0, "A9", "=DATEDIF(DATE(2026,1,15),DATE(2026,11,10),\"M\")");
  setCell(0, "A10", "=DATEDIF(DATE(2026,11,1),DATE(2026,11,10),\"D\")");
  setCell(0, "A11", "=EDATE(DATE(2026,1,31),1)");
  setCell(0, "A12", "=YEAR(TODAY())");
  setCell(0, "A13", "=DATEDIF(DATE(2026,11,10),DATE(2026,1,1),\"D\")");
  recalc();
  eq(val(0, "A1"), "2025-01-01");
  eq(val(0, "A2"), 2025);
  eq(val(0, "A3"), 1);
  eq(val(0, "A4"), 1);
  eq(val(0, "A5"), "2026-11-10");
  /* 10 Nov 2026 is a Tuesday. Type 1: Sun=1 so Tue=3. Type 2: Mon=1 so Tue=2. */
  eq(val(0, "A6"), 3);
  eq(val(0, "A7"), 2);
  eq(val(0, "A8"), 6);
  eq(val(0, "A9"), 9);
  eq(val(0, "A10"), 9);
  eq(val(0, "A11"), "2026-02-28");
  eq(val(0, "A12"), new Date().getFullYear()); /* TODAY is local Y-M-D; YEAR parses as UTC date parts, year still matches */
  eq(val(0, "A13"), "#NUM!");
});

test("Excel serial after 1 March 1900", function () {
  reset();
  /* 2026-11-10 is Excel serial 46336 (days from 1899-12-30). */
  setCell(0, "A1", "46336");
  setCell(0, "B1", "=YEAR(A1)");
  setCell(0, "B2", "=MONTH(A1)");
  setCell(0, "B3", "=DAY(A1)");
  recalc();
  eq(val(0, "B1"), 2026);
  eq(val(0, "B2"), 11);
  eq(val(0, "B3"), 10);
});

/* ---------- math ---------- */
test("ROUNDUP ROUNDDOWN MEDIAN RANK RAND RANDBETWEEN", function () {
  reset();
  setCell(0, "A1", "1.1"); setCell(0, "A2", "3"); setCell(0, "A3", "2"); setCell(0, "A4", "3");
  setCell(0, "B1", "=ROUNDUP(1.1,0)");
  setCell(0, "B2", "=ROUNDUP(-1.1,0)");
  setCell(0, "B3", "=ROUNDDOWN(1.9,0)");
  setCell(0, "B4", "=ROUNDDOWN(-1.9,0)");
  setCell(0, "B5", "=ROUNDUP(1234,-2)");
  setCell(0, "B6", "=MEDIAN(A1:A4)");
  setCell(0, "B7", "=RANK(3,A1:A4)");
  setCell(0, "B8", "=RANK(3,A1:A4,1)");
  setCell(0, "B9", "=RAND()");
  setCell(0, "B10", "=RANDBETWEEN(3,7)");
  setCell(0, "B11", "=RANDBETWEEN(9,2)");
  recalc();
  eq(val(0, "B1"), 2);
  eq(val(0, "B2"), -2);
  eq(val(0, "B3"), 1);
  eq(val(0, "B4"), -1);
  eq(val(0, "B5"), 1300);
  eq(val(0, "B6"), 2.5); /* 1.1, 2, 3, 3 — wait order 1.1, 2, 3, 3 median (2+3)/2 = 2.5 */
  eq(val(0, "B7"), 1);   /* two 3s share rank 1 in descending (3 is the largest) */
  eq(val(0, "B8"), 3);   /* ascending: 1.1, 2, then 3 — rank 3 */
  var r = val(0, "B9");
  if (typeof r !== "number" || r < 0 || r >= 1) throw new Error("RAND out of range " + r);
  var n = val(0, "B10");
  if (typeof n !== "number" || n < 3 || n > 7 || n !== Math.floor(n)) throw new Error("RANDBETWEEN " + n);
  eq(val(0, "B11"), "#NUM!");
});

/* ---------- IFERROR catches #N/A ---------- */
test("IFERROR wraps a failed lookup", function () {
  reset();
  setCell(0, "A1", "=IFERROR(VLOOKUP(\"no\",B1:C2,2,FALSE),\"gone\")");
  recalc();
  eq(val(0, "A1"), "gone");
});

/* ---------- catalog / caret hint (pure) ---------- */
test("FX_CATALOG covers every SH9 name", function () {
  var need = ["VLOOKUP","HLOOKUP","XLOOKUP","INDEX","MATCH","SUMIF","SUMIFS","COUNTIF","COUNTIFS","AVERAGEIF","AND","OR","NOT","IFS","SWITCH","MID","FIND","SUBSTITUTE","TEXT","PROPER","TEXTJOIN","DATE","YEAR","MONTH","DAY","WEEKDAY","DATEDIF","EDATE","ROUNDUP","ROUNDDOWN","MEDIAN","RANK","RAND","RANDBETWEEN"];
  var have = {};
  ctx.FX_CATALOG.forEach(function (it) { have[it.name] = 1; });
  need.forEach(function (n) {
    if (!have[n]) throw new Error("missing from catalog: " + n);
  });
});

test("fxCaretContext highlights the current argument and prefix", function () {
  var a = ctx.fxCaretContext("=VLOOKUP(A1,B1:C10,", 19);
  if (!a || a.name !== "VLOOKUP" || a.arg !== 2) throw new Error("expected VLOOKUP arg 2, got " + JSON.stringify(a));
  if (!a.item || a.item.sig.indexOf("VLOOKUP") !== 0) throw new Error("missing item");
  var b = ctx.fxCaretContext("=VL", 3);
  if (!b || !b.names || !b.names.length || b.names[0].name !== "VLOOKUP") throw new Error("prefix VL should suggest VLOOKUP");
  var c = ctx.fxCaretContext("hello", 5);
  if (c) throw new Error("non-formula should be null");
});

/* ---------- grid size unchanged ---------- */
test("grid is still 26 x 100", function () {
  eq(ctx.COLS, 26);
  eq(ctx.ROWS, 100);
  eq(ctx.CFG.grid.cols, 26);
  eq(ctx.CFG.grid.rows, 100);
});

console.log("passed", passed, "failed", failed);
process.exit(failed ? 1 : 0);
