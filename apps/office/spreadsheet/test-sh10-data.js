#!/usr/bin/env node
/* Pure-helper tests for Spreadsheet SH10 data tools (no DOM, no jsdom, no browser).
 *   node apps/office/spreadsheet/test-sh10-data.js
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
  "spreadsheet_data.js"
];
var ctx = {
  console: console,
  Date: Date,
  Math: Math,
  Number: Number,
  String: String,
  Boolean: Boolean,
  Array: Array,
  Object: Object, Proxy: Proxy,
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
vm.runInContext(files.map(function (f) {
  return fs.readFileSync(path.join(dir, f), "utf8");
}).join("\n;\n"), ctx, { filename: "spreadsheet-sh10.js" });

var failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL", name + ":", e.message || e); }
}
function eq(got, expected, msg) {
  if (got !== expected) throw new Error((msg || "") + " got " + JSON.stringify(got) + " expected " + JSON.stringify(expected));
}

test("find is case-insensitive by default and can match case", function () {
  var sheets = [{ cells: [
    [{ formula: "Apple", value: "Apple" }, { formula: "pear", value: "pear" }],
    [{ formula: "=A1", value: "Apple" }, { formula: "APPLE pie", value: "APPLE pie" }]
  ] }];
  var all = ctx.dataFindMatches(sheets, { query: "apple", matchCase: false, scopeSi: 0 });
  eq(all.length, 3);
  var exact = ctx.dataFindMatches(sheets, { query: "Apple", matchCase: true, scopeSi: 0 });
  eq(exact.length, 2); /* A1 formula + A2 value/formula? A2 formula is =A1, value Apple — inFormula false, inValue true; A1 inFormula true */
});

test("find across sheets, and replace only stored text", function () {
  var sheets = [
    { cells: [[{ formula: "cat", value: "cat" }, { formula: "=SUM(1)", value: "1" }]] },
    { cells: [[{ formula: "catalog", value: "catalog" }]] }
  ];
  var all = ctx.dataFindMatches(sheets, { query: "cat", matchCase: false });
  eq(all.length, 2);
  var n = ctx.dataReplaceAll(sheets, { query: "cat", replacement: "dog", matchCase: false });
  eq(n, 2);
  eq(sheets[0].cells[0][0].formula, "dog");
  eq(sheets[1].cells[0][0].formula, "dogalog");
  /* the SUM cell value "1" wouldn't match "cat"; nothing else to replace */
});

test("replace does not rewrite a formula just because the result matched", function () {
  var sheets = [{ cells: [[{ formula: "=10+20", value: "30" }]] }];
  var hits = ctx.dataFindMatches(sheets, { query: "30" });
  eq(hits.length, 1);
  eq(hits[0].inFormula, false);
  eq(hits[0].inValue, true);
  var n = ctx.dataReplaceAll(sheets, { query: "30", replacement: "99" });
  eq(n, 0);
  eq(sheets[0].cells[0][0].formula, "=10+20");
});

test("dataNextMatch wraps around", function () {
  var m = [
    { si: 0, r: 0, c: 2 },
    { si: 0, r: 2, c: 0 },
    { si: 1, r: 0, c: 0 }
  ];
  eq(ctx.dataNextMatch(m, 0, 0, 2), 1);
  eq(ctx.dataNextMatch(m, 1, 0, 0), 0); /* wrap */
  eq(ctx.dataNextMatch(m, 0, 0, 0), 0); /* first after 0,0 is c=2 */
});

test("remove-duplicates keeps the first row and an optional header", function () {
  var rows = [
    ["Name", "City"],
    ["Ann", "Delhi"],
    ["Bob", "Pune"],
    ["ann", "Delhi"],
    ["Ann", "Goa"]
  ];
  var keep = ctx.dataUniqueKeep(rows.map(function (r) { return [r[0], r[1]]; }), true);
  eq(keep.join(","), "true,true,true,false,true");
  var keepName = ctx.dataUniqueKeep(rows.map(function (r) { return [r[0]]; }), true);
  eq(keepName.join(","), "true,true,true,false,false"); /* Ann / ann / Ann */
});

test("multi-column sort with a header row", function () {
  var names = ["Name", "Bob", "Ann", "Ann"];
  var cities = ["City", "Pune", "Goa", "Delhi"];
  var order = ctx.dataSortOrder(4, [
    { values: names, desc: false },
    { values: cities, desc: false }
  ], true);
  eq(order.join(","), "0,3,2,1"); /* header, Ann+Delhi, Ann+Goa, Bob */
});

test("validation list parse and membership", function () {
  var p = ctx.dataParseListSource("Yes, No,  Maybe ");
  eq(p.items.join("|"), "Yes|No|Maybe");
  eq(ctx.dataInList("yes", p.items), true);
  eq(ctx.dataInList("ok", p.items), false);
  eq(ctx.dataInList("2", ["1", "2", "3"]), true);
  var r = ctx.dataParseListSource("A1:A10");
  eq(r.range, "A1:A10");
});

test("filter row visibility", function () {
  eq(ctx.dataRowPasses(["apple", 10], { 0: { blanks: false, values: ["apple", "pear"] } }), true);
  eq(ctx.dataRowPasses(["fig", 10], { 0: { blanks: false, values: ["apple", "pear"] } }), false);
  eq(ctx.dataRowPasses(["", 10], { 0: { blanks: false, values: ["apple"] } }), false);
  eq(ctx.dataRowPasses(["", 10], { 0: { blanks: true, values: ["apple"] } }), true);
  eq(ctx.dataRowPasses(["apple", 10], { 1: { blanks: false, values: ["5", "10"] } }), true);
});

test("applyFilters hides non-matching rows and skips the header", function () {
  ctx.emptyWorkbook();
  var s = ctx.workbook.sheets[0];
  s.cells[0][0].formula = "Fruit"; s.cells[0][0].value = "Fruit";
  s.cells[1][0].formula = "apple"; s.cells[1][0].value = "apple";
  s.cells[2][0].formula = "pear"; s.cells[2][0].value = "pear";
  s.cells[3][0].formula = "apple"; s.cells[3][0].value = "apple";
  s.filters = { on: true, r1: 0, r2: 3, c1: 0, c2: 0, cols: { 0: { blanks: false, values: ["apple"] } } };
  ctx.applyFilters(0);
  eq(s.filterHidden[0], false);
  eq(s.filterHidden[1], false);
  eq(s.filterHidden[2], true);
  eq(s.filterHidden[3], false);
  eq(ctx.rowHidden(2, 0), true);
  eq(ctx.rowHidden(1, 0), false);
});

test("sheet-v4 save keeps filters and validations (old files still load)", function () {
  ctx.emptyWorkbook();
  var s = ctx.workbook.sheets[0];
  s.cells[0][0].formula = "A"; s.cells[0][0].value = "A";
  s.filters = { on: true, r1: 0, r2: 2, c1: 0, c2: 0, cols: { 0: { blanks: true, values: ["A"] } } };
  s.validations = [{ r1: 0, r2: 5, c1: 1, c2: 1, source: "Yes, No" }];
  var raw = ctx.serializeWorkbook();
  eq(raw.v, 4);
  eq(raw.sheets[0].filters.on, true);
  eq(raw.sheets[0].validations[0].source, "Yes, No");
  /* A v3 payload without the new fields still deserializes. */
  var legacy = ctx.deserializeSheet({ name: "Old", cells: [[{ formula: "1", value: 1, style: {} }]] }, "Sheet1");
  eq(legacy.filters.on, false);
  eq(legacy.validations.length, 0);
});

/* (before SH24) test("grid is still 26 x 100", function () { eq(ctx.COLS, 26); eq(ctx.ROWS, 100); }); */
test("grid is 182 x 1000", function () {
  eq(ctx.COLS, 182);
  eq(ctx.ROWS, 1000);
});

console.log("passed", passed, "failed", failed);
process.exit(failed ? 1 : 0);
