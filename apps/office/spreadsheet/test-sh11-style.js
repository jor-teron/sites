#!/usr/bin/env node
/* Pure-helper tests for Spreadsheet SH11 formatting (no DOM, no jsdom, no browser).
 *   node apps/office/spreadsheet/test-sh11-style.js
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
  "spreadsheet_storage.js",
  "spreadsheet_format.js",
  "spreadsheet_style.js",
  "spreadsheet_xlsx.js"
];
var ctx = {
  console: console, Date: Date, Math: Math, Number: Number, String: String,
  Boolean: Boolean, Array: Array, Object: Object, JSON: JSON, parseInt: parseInt,
  isNaN: isNaN, isFinite: isFinite, RegExp: RegExp, Error: Error, TypeError: TypeError,
  NaN: NaN, Infinity: Infinity, undefined: undefined,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  document: { addEventListener: function () {}, getElementById: function () { return null; } }
};
vm.createContext(ctx);
vm.runInContext(files.map(function (f) {
  return fs.readFileSync(path.join(dir, f), "utf8");
}).join("\n;\n"), ctx, { filename: "spreadsheet-sh11.js" });

var failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL", name + ":", e.message || e); }
}
function eq(got, expected, msg) {
  if (got !== expected) throw new Error((msg || "") + " got " + JSON.stringify(got) + " expected " + JSON.stringify(expected));
}

test("date and time display formats", function () {
  eq(ctx.formatCellValue("2026-11-10", "date"), "2026-11-10");
  eq(ctx.formatCellValue("2026-11-10", "datedmy"), "10/11/2026");
  eq(ctx.formatCellValue("2026-11-10 14:05", "time"), "14:05");
  eq(ctx.formatCellValue("2026-11-10 14:05", "datetime"), "2026-11-10 14:05");
  eq(ctx.formatCellValue(1234.5, "dec2"), "1234.50");
  eq(ctx.formatCellValue("hello", "date"), "hello");
});

test("merge overlap and cover", function () {
  var merges = [{ r1: 0, c1: 0, r2: 1, c2: 1 }];
  eq(!!ctx.styleMergeAt(merges, 1, 1), true);
  eq(!!ctx.styleMergeAt(merges, 2, 0), false);
  eq(ctx.styleMergesOverlap(merges, { r1: 1, r2: 2, c1: 1, c2: 2 }), true);
  eq(ctx.styleMergesOverlap(merges, { r1: 3, r2: 4, c1: 0, c2: 1 }), false);
  var next = ctx.styleAddMerge(merges, { r1: 3, r2: 4, c1: 0, c2: 1 });
  eq(next.length, 2);
  eq(ctx.styleRemoveMergeAt(next, 0, 0).length, 1);
});

test("colour scale interpolation and above/below rules", function () {
  var mid = ctx.styleScaleColor(5, 0, 10, ["#000000", "#ffffff"]);
  eq(mid.toLowerCase(), "#808080");
  var get = function (r, c) { return [[1, 5, 10]][r][c]; };
  var rules = [
    { r1: 0, r2: 0, c1: 0, c2: 2, type: "scale", colors: ["#ffffff", "#00ff00"] },
    { r1: 0, r2: 0, c1: 0, c2: 2, type: "above", value: 7, fill: "#c6efce", color: "#006100" }
  ];
  var hi = ctx.styleCondLook(rules, 0, 2, get, {});
  /* first matching rule is the scale, so 10 is the high colour */
  eq(hi.bg.toLowerCase(), "#00ff00");
  var only = ctx.styleCondLook([rules[1]], 0, 2, get, {});
  eq(only.bg, "#c6efce");
  eq(ctx.styleCondLook([rules[1]], 0, 0, get, {}) == null, true);
});

test("xlsx format codes and style objects", function () {
  eq(ctx.xlsxFmtZ("date"), "yyyy-mm-dd");
  eq(ctx.xlsxFmtZ("datedmy"), "dd/mm/yyyy");
  var s = ctx.xlsxCellStyle({ bold: true, wrap: true, bt: "#000000", fmt: "date" });
  eq(s.font.bold, true);
  eq(s.alignment.wrapText, true);
  eq(!!s.border.top, true);
});

test("xlsx !merges are written from the sheet", function () {
  var XLSX = { utils: { encode_cell: function (a) { return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".charAt(a.c) + (a.r + 1); } } };
  ctx.emptyWorkbook();
  var sh = ctx.workbook.sheets[0];
  sh.cells[0][0].formula = "Hi";
  sh.merges = [{ r1: 0, c1: 0, r2: 1, c2: 2 }];
  var ws = ctx.xlsxBuildSheet(XLSX, sh.cells, sh);
  eq(ws["!merges"].length, 1);
  eq(ws["!merges"][0].e.c, 2);
  eq(ws["!merges"][0].e.r, 1);
});

test("v3 save keeps merges and rules; older files still load", function () {
  ctx.emptyWorkbook();
  var s = ctx.workbook.sheets[0];
  s.merges = [{ r1: 0, c1: 0, r2: 0, c2: 1 }];
  s.condFormats = [{ r1: 0, r2: 5, c1: 0, c2: 0, type: "above", value: 10 }];
  s.cells[0][0].style.fontSize = 16;
  s.cells[0][0].style.wrap = true;
  var raw = ctx.serializeWorkbook();
  eq(raw.v, 3);
  eq(raw.sheets[0].merges[0].c2, 1);
  eq(raw.sheets[0].condFormats[0].type, "above");
  var legacy = ctx.deserializeSheet({ name: "Old", cells: [[{ formula: "1", value: 1, style: {} }]] }, "Sheet1");
  eq((legacy.merges || []).length, 0);
  eq((legacy.condFormats || []).length, 0);
});

test("grid is still 26 x 100", function () {
  eq(ctx.COLS, 26);
  eq(ctx.ROWS, 100);
});

console.log("passed", passed, "failed", failed);
process.exit(failed ? 1 : 0);
