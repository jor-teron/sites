#!/usr/bin/env node
/* SH17 borders: colour, print rules, merged outer edges, xlsx.
 * No DOM and no browser.
 *   node apps/office/spreadsheet/test-sh17-borders.js
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
  Boolean: Boolean, Array: Array, Object: Object, Proxy: Proxy, JSON: JSON, parseInt: parseInt,
  isNaN: isNaN, isFinite: isFinite, RegExp: RegExp, Error: Error, TypeError: TypeError,
  NaN: NaN, Infinity: Infinity, undefined: undefined,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  document: { addEventListener: function () {}, getElementById: function () { return null; } }
};
vm.createContext(ctx);
vm.runInContext(files.map(function (f) {
  return fs.readFileSync(path.join(dir, f), "utf8");
}).join("\n;\n"), ctx, { filename: "spreadsheet-sh17.js" });

var failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL", name + ":", e.message || e); }
}
function eq(got, expected, msg) {
  if (got !== expected) throw new Error((msg || "") + " got " + JSON.stringify(got) + " expected " + JSON.stringify(expected));
}
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
}

test("auto border colour is theme-based; an explicit colour is kept", function () {
  eq(ctx.styleBorderCss(""), "");
  eq(ctx.styleBorderCss("auto"), "1px solid var(--user-border)");
  eq(ctx.styleBorderCss("#000000"), "1px solid var(--user-border)");
  eq(ctx.styleBorderCss("#000"), "1px solid var(--user-border)");
  eq(ctx.styleBorderCss("#ff0000"), "1px solid #ff0000");
  eq(ctx.styleBorderIsAuto("auto"), true);
  eq(ctx.styleBorderIsAuto("#3366cc"), false);
});

test("xlsx writes auto and the old default black as 000000", function () {
  eq(ctx.styleBorderExportColor("auto"), "000000");
  eq(ctx.styleBorderExportColor("#000000"), "000000");
  eq(ctx.styleBorderExportColor("#000"), "000000");
  eq(ctx.styleBorderExportColor("#3366cc"), "3366CC");
  var auto = ctx.xlsxCellStyle({ bt: "auto", br: "#3366cc" });
  eq(auto.border.top.style, "thin");
  eq(auto.border.top.color.rgb, "000000");
  eq(auto.border.right.color.rgb, "3366CC");
  var legacy = ctx.xlsxCellStyle({ bt: "#000000" });
  eq(legacy.border.top.color.rgb, "000000");
});

test("a top border is drawn on the cell above, which wins the shared edge", function () {
  var g = {
    "0,0": { bt: "", br: "", bb: "", bl: "" },
    "1,0": { bt: "auto", br: "", bb: "", bl: "" }
  };
  function get(r, c) { return g[r + "," + c] || { bt: "", br: "", bb: "", bl: "" }; }
  var above = ctx.stylePaintEdges(0, 0, get, [], 4, 4);
  var self = ctx.stylePaintEdges(1, 0, get, [], 4, 4);
  eq(above.bb, "auto");
  eq(self.bt, "auto");
  eq(above.bt, "");
});

test("an existing bottom border is not replaced by the cell below", function () {
  var g = {
    "0,0": { bt: "", br: "", bb: "#ff0000", bl: "" },
    "1,0": { bt: "auto", br: "", bb: "", bl: "" }
  };
  function get(r, c) { return g[r + "," + c]; }
  eq(ctx.stylePaintEdges(0, 0, get, [], 4, 4).bb, "#ff0000");
});

test("a left border is drawn on the cell to its left", function () {
  var g = {
    "0,0": { bt: "", br: "", bb: "", bl: "" },
    "0,1": { bt: "", br: "", bb: "", bl: "#00aa00" }
  };
  function get(r, c) { return g[r + "," + c]; }
  eq(ctx.stylePaintEdges(0, 0, get, [], 4, 4).br, "#00aa00");
  eq(ctx.stylePaintEdges(0, 1, get, [], 4, 4).bl, "#00aa00");
});

test("merged cell shows the outer edges, not an inside line", function () {
  var merges = [{ r1: 0, c1: 0, r2: 1, c2: 1 }];
  var g = {
    "0,0": { bt: "auto", br: "", bb: "", bl: "auto" },
    "0,1": { bt: "auto", br: "auto", bb: "", bl: "auto" },
    "1,0": { bt: "", br: "", bb: "auto", bl: "auto" },
    "1,1": { bt: "", br: "auto", bb: "auto", bl: "" }
  };
  function get(r, c) { return g[r + "," + c]; }
  var anchor = ctx.stylePaintEdges(0, 0, get, merges, 4, 4);
  eq(anchor.bt, "auto");
  eq(anchor.bl, "auto");
  eq(anchor.br, "auto");
  eq(anchor.bb, "auto");
  /* B1's left border is inside the merge, so it must not become A's right edge
     when the outer right is empty. */
  g["0,1"].br = "";
  eq(ctx.stylePaintEdges(0, 0, get, merges, 4, 4).br, "");
});

test("painted side is marked so print and no-grid rules can skip it", function () {
  var classes = {};
  var props = {};
  var attrs = {};
  var td = {
    classList: {
      add: function (c) { classes[c] = true; },
      remove: function (c) { delete classes[c]; }
    },
    style: {
      setProperty: function (p, v, imp) { props[p] = v + " " + imp; },
      removeProperty: function (p) { delete props[p]; }
    },
    setAttribute: function (k, v) { attrs[k] = v; },
    removeAttribute: function (k) { delete attrs[k]; }
  };
  ctx.styleApplyBorderSide(td, "border-top", "bd-t", "auto");
  eq(classes["bd-t"], true);
  eq(attrs["data-bd-t"], "1");
  eq(props["border-top"], "1px solid var(--user-border) important");
  ctx.styleApplyBorderSide(td, "border-top", "bd-t", "#ff0000");
  eq(props["border-top"], "1px solid #ff0000 important");
  ctx.styleApplyBorderSide(td, "border-top", "bd-t", "");
  eq(classes["bd-t"], undefined);
  eq(attrs["data-bd-t"], undefined);
  eq(props["border-top"], undefined);
});

test("print and screen rules skip marked sides and do not force every cell", function () {
  var page = stripComments(fs.readFileSync(path.join(dir, "spreadsheet_page.css"), "utf8"));
  var css = stripComments(fs.readFileSync(path.join(dir, "spreadsheet.css"), "utf8"));
  ["t", "r", "b", "l"].forEach(function (side) {
    if (page.indexOf(":not(.bd-" + side + ")") < 0) throw new Error("missing print skip for bd-" + side);
    if (css.indexOf(":not(.bd-" + side + ")") < 0) throw new Error("missing screen skip for bd-" + side);
  });
  if (page.indexOf("print-no-grid td.cell {") >= 0) throw new Error("blanket print-no-grid colour rule is still active");
  if (page.indexOf("td.cell { border-color: #999") >= 0) throw new Error("blanket print grid colour rule is still active");
  if (css.indexOf("sheet-no-grid td.cell { border-color: transparent") >= 0) throw new Error("screen no-grid still clears every side");
  if (page.indexOf("#fff") < 0 || page.indexOf("#999") < 0) throw new Error("gridline colours missing");
  if (css.indexOf("--user-border: #f0f0f0") < 0) throw new Error("dark auto colour missing");
  if (css.indexOf("--user-border: #000000") < 0) throw new Error("light auto colour missing");
});

test("borders button, hidden #bd-sel, and no version bump", function () {
  var html = fs.readFileSync(path.join(dir, "spreadsheet.html"), "utf8");
  var live = stripComments(html);
  if (live.indexOf('id="btn-borders"') < 0) throw new Error("missing Borders button");
  if (live.indexOf("<svg") < 0) throw new Error("missing inline svg");
  if (live.indexOf('id="bd-sel"') < 0) throw new Error("missing #bd-sel");
  ["all", "outside", "inside", "top", "bottom", "left", "right", "none"].forEach(function (mode) {
    if (live.indexOf('data-border="' + mode + '"') < 0) throw new Error("missing option " + mode);
  });
  if (html.indexOf("(before SH17)") < 0) throw new Error("old select was not kept as a comment");
  if (live.indexOf("unpkg") >= 0 || live.indexOf("jsdelivr") >= 0 || live.indexOf("cdn.") >= 0) throw new Error("CDN reference");
  /* (before SH18) this test required title / ?v= / SHEET_VERSION SH14 and forbade ?v=SH17 */
  /* (before SH21) if (html.indexOf("<title>Spreadsheet SH18</title>") < 0) throw new Error("title is not SH18"); */
  /* (before SH19) if (html.indexOf("<title>Spreadsheet SH21</title>") < 0) throw new Error("title is not SH21"); */
  if (html.indexOf("<title>Spreadsheet SH19</title>") < 0) throw new Error("title is not SH19");
  /* (before HO3) if (html.indexOf("?v=SH18") < 0) throw new Error("SH18 cache token missing"); */
  if (html.indexOf("?v=HO3") < 0) throw new Error("HO3 cache token missing");
  var settings = fs.readFileSync(path.join(dir, "spreadsheet_settings.js"), "utf8");
  /* (before SH21) if (settings.indexOf('SHEET_VERSION = "SH18"') < 0) throw new Error("SHEET_VERSION is not SH18"); */
  /* (before SH19) if (settings.indexOf('SHEET_VERSION = "SH21"') < 0) throw new Error("SHEET_VERSION is not SH21"); */
  if (settings.indexOf('SHEET_VERSION = "SH19"') < 0) throw new Error("SHEET_VERSION is not SH19");
  eq(ctx.CFG.storage.key, "sheet-v4");
  /* (before SH24) eq(ctx.COLS, 26); eq(ctx.ROWS, 100); */
  eq(ctx.COLS, 182);
  eq(ctx.ROWS, 1000);
});

test("xlsx merges are still written", function () {
  var XLSX = { utils: { encode_cell: function (a) { return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".charAt(a.c) + (a.r + 1); } } };
  ctx.emptyWorkbook();
  var sh = ctx.workbook.sheets[0];
  sh.cells[0][0].style.bt = "auto";
  sh.merges = [{ r1: 0, c1: 0, r2: 1, c2: 2 }];
  var ws = ctx.xlsxBuildSheet(XLSX, sh.cells, sh);
  eq(ws["!merges"].length, 1);
  eq(ws["!merges"][0].e.c, 2);
  eq(ws["A1"].s.border.top.color.rgb, "000000");
});

console.log("passed", passed, "failed", failed);
process.exit(failed ? 1 : 0);
