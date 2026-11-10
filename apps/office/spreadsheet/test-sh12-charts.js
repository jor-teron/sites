#!/usr/bin/env node
/* Pure-helper tests for Spreadsheet SH12 charts and sheet-v4 migration
 * (no DOM, no jsdom, no browser, no canvas library).
 *   node apps/office/spreadsheet/test-sh12-charts.js
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
  "spreadsheet_charts.js"
];
var ctx = {
  console: console, Date: Date, Math: Math, Number: Number, String: String,
  Boolean: Boolean, Array: Array, Object: Object, JSON: JSON, parseInt: parseInt,
  isNaN: isNaN, isFinite: isFinite, RegExp: RegExp, Error: Error, TypeError: TypeError,
  NaN: NaN, Infinity: Infinity, undefined: undefined,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  document: { addEventListener: function () {}, getElementById: function () { return null; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    createElement: function () { return { style: {}, classList: { add: function () {}, toggle: function () {} }, appendChild: function () {}, querySelector: function () { return null; } }; } },
  window: { addEventListener: function () {}, devicePixelRatio: 1 }
};
vm.createContext(ctx);
vm.runInContext(files.map(function (f) {
  return fs.readFileSync(path.join(dir, f), "utf8");
}).join("\n;\n"), ctx, { filename: "spreadsheet-sh12.js" });

var failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL", name + ":", e.message || e); }
}
function eq(got, expected, msg) {
  if (got !== expected) throw new Error((msg || "") + " got " + JSON.stringify(got) + " expected " + JSON.stringify(expected));
}

function grid(rows) {
  return rows.map(function (row) {
    return row.map(function (v) { return { formula: String(v == null ? "" : v), value: v, style: {} }; });
  });
}

function stubCtx() {
  var calls = [];
  var c = {
    fillStyle: "", strokeStyle: "", font: "", textAlign: "", lineWidth: 1,
    clearRect: function () { calls.push("clearRect"); },
    fillRect: function () { calls.push("fillRect"); },
    strokeRect: function () { calls.push("strokeRect"); },
    beginPath: function () { calls.push("beginPath"); },
    moveTo: function () { calls.push("moveTo"); },
    lineTo: function () { calls.push("lineTo"); },
    arc: function () { calls.push("arc"); },
    closePath: function () { calls.push("closePath"); },
    fill: function () { calls.push("fill"); },
    stroke: function () { calls.push("stroke"); },
    fillText: function () { calls.push("fillText"); },
    measureText: function (s) { return { width: String(s).length * 7 }; },
    setTransform: function () { calls.push("setTransform"); }
  };
  return { ctx: c, calls: calls };
}

test("extract a table with a header row and category column", function () {
  var g = grid([
    ["Name", "Q1", "Q2"],
    ["Ann", 10, 20],
    ["Bob", 30, 40]
  ]);
  var d = ctx.chartExtractData(g, { r1: 0, r2: 2, c1: 0, c2: 2 }, {});
  eq(d.labels.join(","), "Ann,Bob");
  eq(d.series.length, 2);
  eq(d.series[0].name, "Q1");
  eq(d.series[0].values.join(","), "10,30");
  eq(d.series[1].values.join(","), "20,40");
  eq(d.title, "Name");
});

test("extract a single row or column of numbers", function () {
  var row = grid([[5, 8, 13]]);
  var d = ctx.chartExtractData(row, { r1: 0, r2: 0, c1: 0, c2: 2 }, {});
  eq(d.series.length, 1);
  eq(d.series[0].values.join(","), "5,8,13");
  var col = grid([[5], [8], [13]]);
  d = ctx.chartExtractData(col, { r1: 0, r2: 2, c1: 0, c2: 0 }, {});
  eq(d.series[0].values.join(","), "5,8,13");
  eq(d.labels.join(","), "1,2,3");
});

test("parse A1 ranges and tokens", function () {
  var g = ctx.chartParseRange("B2:D5");
  eq(g.r1, 1); eq(g.c1, 1); eq(g.r2, 4); eq(g.c2, 3);
  eq(ctx.chartRangeToken({ r1: 1, c1: 1, r2: 4, c2: 3 }), "B2:D5");
});

test("chartDraw paints each type onto a stub context", function () {
  var data = { title: "Demo", labels: ["A", "B"], series: [{ name: "S", values: [2, 5] }] };
  ["column", "bar", "line", "pie"].forEach(function (type) {
    var s = stubCtx();
    ctx.chartDraw(s.ctx, type, data, 360, 220);
    if (s.calls.indexOf("fillRect") < 0 && s.calls.indexOf("arc") < 0 && s.calls.indexOf("lineTo") < 0) {
      throw new Error(type + " drew nothing: " + s.calls.join(","));
    }
  });
});

test("sheet-v4 save includes charts; a v3 payload still opens", function () {
  eq(ctx.STORE_KEY, "sheet-v4");
  eq(ctx.CFG.storage.legacyKey, "sheet-v3");
  ctx.emptyWorkbook();
  var s = ctx.workbook.sheets[0];
  s.cells[0][0].formula = "A"; s.cells[0][0].value = "A";
  s.charts = [{ id: "c1", type: "column", range: "A1:B3", title: "Sales", x: 10, y: 20, w: 360, h: 220 }];
  var raw = ctx.serializeWorkbook();
  eq(raw.v, 4);
  eq(raw.sheets[0].charts[0].type, "column");
  /* v3-shaped payload (no charts) loads and gets an empty charts array. */
  var ok = ctx.applyWorkbookPayload({
    v: 3,
    sheets: [{ name: "Old", cells: [[{ formula: "1", value: 1, style: {} }]] }]
  });
  eq(ok, true);
  eq(ctx.workbook.sheets[0].name, "Old");
  eq(Array.isArray(ctx.workbook.sheets[0].charts) && ctx.workbook.sheets[0].charts.length === 0, true);
});

test("legacy single-sheet payload still becomes Sheet1", function () {
  var ok = ctx.applyWorkbookPayload({ cells: [[{ formula: "9", value: 9, style: {} }]] });
  eq(ok, true);
  eq(ctx.workbook.sheets[0].name, "Sheet1");
  eq(ctx.workbook.sheets[0].cells[0][0].formula, "9");
});

test("grid is still 26 x 100", function () {
  eq(ctx.COLS, 26);
  eq(ctx.ROWS, 100);
});

console.log("passed", passed, "failed", failed);
process.exit(failed ? 1 : 0);
