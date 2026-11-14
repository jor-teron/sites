#!/usr/bin/env node
/* SH18 row height: auto-fit math, insert/delete shifts, .hos round-trip, freeze offsets.
 * No DOM and no browser.
 *   node apps/office/spreadsheet/test-sh18-row-height.js
 */
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var assert = require("assert");
var dir = __dirname;
var Hos = require("./spreadsheet_hos.js");

var ctx = {
  console: console, Date: Date, Math: Math, Number: Number, String: String,
  Boolean: Boolean, Array: Array, Object: Object, JSON: JSON, parseInt: parseInt,
  isNaN: isNaN, isFinite: isFinite, RegExp: RegExp, Error: Error, TypeError: TypeError,
  NaN: NaN, Infinity: Infinity, undefined: undefined,
  CFG: { rowHeight: { auto: 30, min: 8, max: 400 }, colWidth: { auto: 100, min: 30, rowHead: 40 } },
  CLS: { table: "sheet", rowHeadCol: "row-head", dataCol: "data", colGrip: "col-grip", rowGrip: "row-grip" },
  COLS: 26, ROWS: 100,
  SHEET_INIT: { push: function () {} },
  document: {
    getElementById: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  },
  window: { addEventListener: function () {} }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, "spreadsheet_resize.js"), "utf8"), ctx, { filename: "spreadsheet_resize.js" });

var failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL", name + ":", e.message || e); }
}
function eq(got, expected, msg) {
  if (got !== expected) throw new Error((msg || "") + " got " + JSON.stringify(got) + " expected " + JSON.stringify(expected));
}

test("empty automatic row stays at the 30px floor", function () {
  eq(ctx.estimateRowHeight("", { automatic: true }), 30);
  eq(ctx.estimateRowHeight("Hello", { automatic: true }), 30);
});

test("explicit line breaks grow an automatic row", function () {
  var one = ctx.estimateRowHeight("one line", { automatic: true });
  var two = ctx.estimateRowHeight("line one\nline two", { automatic: true });
  var three = ctx.estimateRowHeight("a\nb\nc", { automatic: true });
  eq(one, 30);
  /* (before HO3) default font 13px: eq(two, 39); eq(three, 55); */
  eq(two, 46);   // HO3: default 12pt = 16px, 6 + 2 * 16 * 1.25
  eq(three, 66);
  if (!(three > two && two > one)) throw new Error("line breaks should stack");
});

test("wrap estimate grows for long text; no wrap stays at the floor", function () {
  var long = "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"; // 33 chars
  var wrapped = ctx.estimateRowHeight(long, { wrap: true, widthPx: 100, automatic: true });
  var clipped = ctx.estimateRowHeight(long, { wrap: false, widthPx: 100, automatic: true });
  eq(clipped, 30);
  /* (before HO3) eq(wrapped, 55); // 3 visual lines at default 13px font */
  eq(wrapped, 86); // HO3: 4 visual lines at default 16px (12pt) font
  if (!(wrapped > clipped)) throw new Error("wrap should be taller than clipped");
});

test("font size raises a single-line automatic row", function () {
  var h = ctx.estimateRowHeight("Title", { fontSize: 24, automatic: true });
  eq(h, 36);
  if (!(h > 30)) throw new Error("24px font should exceed the 30px floor");
});

test("clamp is 8–400; automatic never goes below 30", function () {
  eq(ctx.clampRowHeight(4), 8);
  eq(ctx.clampRowHeight(500), 400);
  eq(ctx.clampRowHeight(28), 28);
  var many = [];
  var i;
  for (i = 0; i < 80; i++) many.push("line");
  var tall = ctx.estimateRowHeight(many.join("\n"), { automatic: true });
  eq(tall, 400);
  eq(ctx.estimateRowHeight("", { automatic: true, fontSize: 8 }), 30);
  eq(ctx.estimateRowHeight("x", { automatic: false, fontSize: 8, padding: 0, lineHeight: 1 }), 8);
});

test("manual height is kept; automatic is content-fit", function () {
  /* usedRowHeight: a number on heights[] is manual; null uses auto-fit. */
  var manual = ctx.clampRowHeight(80);
  eq(manual, 80);
  var autoEmpty = ctx.estimateRowHeight("", { automatic: true });
  var autoBreak = ctx.estimateRowHeight("a\nb", { automatic: true });
  eq(autoEmpty, 30);
  if (!(autoBreak > autoEmpty)) throw new Error("automatic should grow for a break");
  if (manual === autoBreak) throw new Error("manual 80 should differ from auto two-line height");
});

test("insert and delete shift heights the same way colWidths already shifted", function () {
  var heights = [];
  var i;
  for (i = 0; i < 100; i++) heights.push(null);
  heights[1] = 28;
  heights[2] = 40;
  ctx.shiftSizeList(heights, 1, 1, null, 100);
  eq(heights.length, 100);
  eq(heights[1], null);
  eq(heights[2], 28);
  eq(heights[3], 40);
  ctx.shiftSizeList(heights, 1, -1, null, 100);
  eq(heights.length, 100);
  eq(heights[1], 28);
  eq(heights[2], 40);
  eq(heights[99], null);
  ctx.shiftSizeList(heights, 1, -1, null, 100);
  eq(heights[1], 40);
  eq(heights[2], null);
});

test("hos version stays 1 and a manual height round-trips", function () {
  var doc = {
    name: "Heights",
    sheets: [{
      name: "Sheet1",
      cells: [{ r: 1, c: 0, formula: "A\nB", value: "A\nB", style: { wrap: true } }],
      heights: [null, 28]
    }]
  };
  var back = Hos.parse(Hos.stringify(doc));
  eq(Hos.VERSION, 1);
  eq(back.version, 1);
  eq(back.format, "hos");
  eq(back.sheets[0].heights[0], null);
  eq(back.sheets[0].heights[1], 28);
  eq(back.sheets[0].heights.length, 100);
  var clamped = Hos.parse(Hos.stringify({
    name: "Clamp",
    sheets: [{ name: "Sheet1", cells: [], heights: [3, 999] }]
  }));
  eq(clamped.sheets[0].heights[0], 8);
  eq(clamped.sheets[0].heights[1], 400);
});

test("freeze offset helper sums mixed heights and skips hidden rows", function () {
  var heights = [40, 30, 80, 50];
  var hidden = { 2: true };
  var tops = ctx.freezeTopOffsets(30, 4, function (r) { return heights[r]; }, function (r) { return !!hidden[r]; });
  eq(tops.length, 5);
  eq(tops[0], 30);
  eq(tops[1], 70);   // +40
  eq(tops[2], 100);  // +30
  eq(tops[3], 100);  // row 2 hidden, 80 skipped
  eq(tops[4], 150);  // +50
  var even = ctx.freezeTopOffsets(30, 2, function () { return 30; }, function () { return false; });
  eq(even[0], 30);
  eq(even[1], 60);
  eq(even[2], 90);
});

test("title and SHEET_VERSION are SH22, ?v= stays HO3; no format bump", function () {
  var html = fs.readFileSync(path.join(dir, "spreadsheet.html"), "utf8");
  var settings = fs.readFileSync(path.join(dir, "spreadsheet_settings.js"), "utf8");
  var css = fs.readFileSync(path.join(dir, "spreadsheet.css"), "utf8");
  var resize = fs.readFileSync(path.join(dir, "spreadsheet_resize.js"), "utf8");
  var grid = fs.readFileSync(path.join(dir, "spreadsheet_grid.js"), "utf8");
  /* (before SH21) if (html.indexOf("<title>Spreadsheet SH18</title>") < 0) throw new Error("title is not SH18"); */
  /* (before SH19) if (html.indexOf("<title>Spreadsheet SH21</title>") < 0) throw new Error("title is not SH21"); */
  /* (before SH22) if (html.indexOf("<title>Spreadsheet SH19</title>") < 0) throw new Error("title is not SH19"); */
  if (html.indexOf("<title>Spreadsheet SH22</title>") < 0) throw new Error("title is not SH22");
  /* (before HO3) if (html.indexOf("?v=SH18") < 0) throw new Error("?v=SH18 missing"); */
  if (html.indexOf("?v=HO3") < 0) throw new Error("?v=HO3 missing");
  if (html.indexOf("(before SH18)") < 0) throw new Error("old title was not kept as a comment");
  /* (before SH21) if (settings.indexOf('SHEET_VERSION = "SH18"') < 0) throw new Error("SHEET_VERSION is not SH18"); */
  /* (before SH19) if (settings.indexOf('SHEET_VERSION = "SH21"') < 0) throw new Error("SHEET_VERSION is not SH21"); */
  /* (before SH22) if (settings.indexOf('SHEET_VERSION = "SH19"') < 0) throw new Error("SHEET_VERSION is not SH19"); */
  if (settings.indexOf('SHEET_VERSION = "SH22"') < 0) throw new Error("SHEET_VERSION is not SH22");
  if (css.indexOf(".row-grip") < 0) throw new Error("row-grip CSS missing");
  if (css.indexOf("row-resizing") < 0) throw new Error("row-resizing cursor missing");
  if (resize.indexOf("function estimateRowHeight") < 0) throw new Error("estimateRowHeight missing");
  if (grid.indexOf("CLS.rowGrip") < 0) throw new Error("row grip was not added to the grid");
  eq(Hos.VERSION, 1);
});

console.log("passed", passed, "failed", failed);
process.exit(failed ? 1 : 0);
