#!/usr/bin/env node
/* Pure-helper tests for Spreadsheet SH22: click another sheet's cell to insert Sheet2!A1
 * (no DOM, no jsdom, no browser).
 *   node apps/office/spreadsheet/test-sh22-sheet-pointing.js
 */
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var dir = __dirname;
var failed = 0, passed = 0;

function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL", name + ":", e.message || e); }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || "") + " got " + JSON.stringify(a) + " want " + JSON.stringify(b));
}

/* refs.js gives quoteSheetName + colLetter; point.js needs SHEET_INIT at load */
var ctx = { COL_LETTERS: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", COLS: 26, ROWS: 100, SHEET_INIT: [], console: console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, "spreadsheet_refs.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(dir, "spreadsheet_point.js"), "utf8"), ctx);

test("ref text uses the typed-ref quoting rule", function () {
  eq(ctx.pointRefText("Sheet2", 0, 0), "Sheet2!A1");
  eq(ctx.pointRefText("My Sheet", 4, 2), "'My Sheet'!C5");
  eq(ctx.pointRefText("Bob's", 0, 1), "'Bob''s'!B1");
  eq(ctx.pointRefText("AB12", 0, 0), "'AB12'!A1", "A1-looking name is quoted");
});

test("insert at the caret, then a second click replaces the just-inserted ref", function () {
  var a = ctx.pointInsertRef("=SUM()", 5, 5, null, "Sheet2!A1");
  eq(a.text, "=SUM(Sheet2!A1)");
  eq(a.caret, 14);
  var b = ctx.pointInsertRef(a.text, a.caret, a.caret, a.last, "Sheet2!B3");
  eq(b.text, "=SUM(Sheet2!B3)");
  eq(b.caret, 14);
});

test("after typing, the next click inserts instead of replacing", function () {
  var a = ctx.pointInsertRef("=", 1, 1, null, "Sheet2!A1");
  var typed = a.text + "+";
  var b = ctx.pointInsertRef(typed, typed.length, typed.length, a.last, "'My Sheet'!C5");
  eq(b.text, "=Sheet2!A1+'My Sheet'!C5");
});

test("a selected span is replaced by the ref", function () {
  eq(ctx.pointInsertRef("=A1+X", 4, 5, null, "Sheet2!A1").text, "=A1+Sheet2!A1");
});

test("tab click decision: a formula draft starts pointing, plain text does not", function () {
  eq(ctx.pointTabAction(null, "=SUM(", 0, 1), "start");
  eq(ctx.pointTabAction(null, "hello", 0, 1), "normal");
  eq(ctx.pointTabAction(null, null, 0, 1), "normal");
  eq(ctx.pointTabAction(null, "=A1", 0, 0), "normal", "same tab");
  var st = { sheet: 0, r: 1, c: 1, last: null };
  eq(ctx.pointTabAction(st, "=A1", 1, 2), "switch");
  eq(ctx.pointTabAction(st, "=A1", 2, 0), "return");
});

test("SH22 wiring: switchSheet asks pointOnTab first; point.js loads after fx.js", function () {
  var sheets = fs.readFileSync(path.join(dir, "spreadsheet_sheets.js"), "utf8");
  var i = sheets.indexOf("pointOnTab(i)"), j = sheets.indexOf("blurEditing();", sheets.indexOf("function switchSheet"));
  if (i < 0 || i > j) throw new Error("switchSheet does not call pointOnTab before blurEditing");
  var html = fs.readFileSync(path.join(dir, "spreadsheet.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  var fx = html.indexOf("spreadsheet_fx.js"), pt = html.indexOf("spreadsheet_point.js");
  if (pt < 0 || pt < fx) throw new Error("spreadsheet_point.js missing or before fx.js");
  if (fs.readFileSync(path.join(dir, "spreadsheet_toolbar.js"), "utf8").indexOf("pointFinish(true)") < 0) throw new Error("formula bar Enter does not finish pointing");
});

console.log("passed", passed, "failed", failed);
process.exit(failed ? 1 : 0);
