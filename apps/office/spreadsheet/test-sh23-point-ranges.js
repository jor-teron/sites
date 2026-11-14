#!/usr/bin/env node
/* Pure-helper tests for Spreadsheet SH23: click or drag cells on the same sheet to insert
 * refs and ranges in a formula (no DOM, no jsdom, no browser).
 *   node apps/office/spreadsheet/test-sh23-point-ranges.js
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

var ctx = { COL_LETTERS: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", COLS: 26, ROWS: 100, SHEET_INIT: [], console: console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, "spreadsheet_refs.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(dir, "spreadsheet_point.js"), "utf8"), ctx);

function allows(text, caret, last) { return ctx.pointCaretAllowsRef(text, caret, caret, last || null); }

test("a ref may go right after = ( , an operator or :", function () {
  ["=", "=SUM(", "=SUM(A1,", "=A1+", "=A1-", "=A1*", "=A1/", "=A1^", "=A1&", "=A1=", "=A1<", "=A1>", "=A1<>", "=SUM(A1:"]
    .forEach(function (t) { eq(allows(t, t.length), true, t); });
  eq(allows("=SUM( ", 6), true, "spaces before the caret are skipped");
  eq(allows("=SUM(B2)", 5), true, "caret right after ( in the middle");
});

test("no ref after a value, a name, a closing bracket, in plain text or a string", function () {
  ["=A1", "=SUM(A1)", "=SU", "=1", "=A1%"].forEach(function (t) { eq(allows(t, t.length), false, t); });
  eq(allows("hello", 5), false, "plain text");
  eq(allows("", 0), false, "empty");
  eq(allows("=A1+", 0), false, "before the =");
  eq(allows('="a+', 4), false, "inside a string literal");
  eq(allows('="a"&', 5), true, "after a closed string");
});

test("the caret right after the just-inserted ref allows a replacing click", function () {
  var a = ctx.pointInsertRef("=", 1, 1, null, "A1");
  eq(allows(a.text, a.caret, a.last), true);
  eq(allows(a.text + "1", a.caret, a.last), false, "text changed since the insert");
  eq(allows(a.text, a.caret, null), false, "without last, =A1 is not a ref spot");
});

test("replacing the last ref: only right away, not after typing", function () {
  var a = ctx.pointInsertRef("=SUM()", 5, 5, null, "A1");
  eq(a.text, "=SUM(A1)");
  var b = ctx.pointInsertRef(a.text, a.caret, a.caret, a.last, "B2:C4");
  eq(b.text, "=SUM(B2:C4)");
  eq(b.caret, 10);
  var c = ctx.pointInsertRef(b.text, b.caret, b.caret, b.last, "B2:D9");
  eq(c.text, "=SUM(B2:D9)", "a drag keeps replacing");
  var typed = c.text.slice(0, 10) + "," + c.text.slice(10);
  var d = ctx.pointInsertRef(typed, 11, 11, c.last, "E1");
  eq(d.text, "=SUM(B2:D9,E1)", "after typing a comma the next click inserts");
  eq(ctx.pointCanReplace("=SUM(B2:D9)", 10, 10, { start: 5, end: 10, ref: "B2:D9", text: "=SUM(B2:D9)+" }), false, "stale last.text");
});

test("range text is top-left:bottom-right, one cell is a single ref", function () {
  eq(ctx.pointRangeText(null, 0, 0, 2, 1), "A1:B3");
  eq(ctx.pointRangeText(null, 2, 1, 0, 0), "A1:B3", "dragged up-left");
  eq(ctx.pointRangeText(null, 0, 1, 2, 0), "A1:B3", "dragged down-left");
  eq(ctx.pointRangeText(null, 4, 2, 4, 2), "C5");
  eq(ctx.pointRangeText(null, 99, 25, 0, 0), "A1:Z100");
});

test("other-sheet ranges use the typed-ref quoting rule", function () {
  eq(ctx.pointRangeText("Sheet2", 2, 1, 0, 0), "Sheet2!A1:B3");
  eq(ctx.pointRangeText("My Sheet", 0, 0, 2, 1), "'My Sheet'!A1:B3");
  eq(ctx.pointRangeText("Bob's", 0, 0, 0, 0), "'Bob''s'!A1");
  eq(ctx.pointRangeText("Sheet2", 3, 3, 3, 3), ctx.pointRefText("Sheet2", 3, 3), "matches the SH22 single ref");
});

test("SH23 wiring: drag listener, no same-sheet auto-commit, version SH23", function () {
  var src = fs.readFileSync(path.join(dir, "spreadsheet_point.js"), "utf8");
  if (src.indexOf('addEventListener("mouseover", pointOnCellOver, true)') < 0) throw new Error("drag listener missing");
  if (src.indexOf("pointCaretAllowsRef(el.value") < 0) throw new Error("cell click does not check the caret");
  var settings = fs.readFileSync(path.join(dir, "spreadsheet_settings.js"), "utf8");
  /* (before SH24) if (settings.indexOf('var SHEET_VERSION = "SH23";') < 0) throw new Error("SHEET_VERSION is not SH23"); */
  if (settings.indexOf('var SHEET_VERSION = "SH24";') < 0) throw new Error("SHEET_VERSION is not SH24");
});

console.log("passed", passed, "failed", failed);
process.exit(failed ? 1 : 0);
