#!/usr/bin/env node
/* Pure-helper tests for Spreadsheet SH21: formula hint / fx picker script order
 * (no DOM, no jsdom, no browser).
 *   node apps/office/spreadsheet/test-sh21-fx-hint.js
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

function readHtml() {
  return fs.readFileSync(path.join(dir, "spreadsheet.html"), "utf8");
}

function liveHtml(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function scriptSrcs(html) {
  var srcs = [], re = /<script\s+src="([^"]+)"/gi, m;
  while ((m = re.exec(html))) srcs.push(m[1]);
  return srcs;
}

function baseName(src) {
  return src.replace(/[?#].*$/, "").replace(/^.*\//, "");
}

test("title is SH22, SHEET_VERSION is SH22, ?v= stays HO3", function () {
  var html = readHtml();
  var settings = fs.readFileSync(path.join(dir, "spreadsheet_settings.js"), "utf8");
  /* (before SH19) if (html.indexOf("<title>Spreadsheet SH21</title>") < 0) throw new Error("title is not SH21"); */
  /* (before SH22) if (html.indexOf("<title>Spreadsheet SH19</title>") < 0) throw new Error("title is not SH19"); */
  if (html.indexOf("<title>Spreadsheet SH22</title>") < 0) throw new Error("title is not SH22");
  if (html.indexOf("(before SH21)") < 0) throw new Error("old title or script tag was not kept as a comment");
  if (html.indexOf("?v=HO3") < 0) throw new Error("?v=HO3 missing");
  /* (before SH19) if (/spreadsheet_[^"'?]+\.(js|css)\?v=SH21/.test(html)) throw new Error("unexpected ?v=SH21 cache token"); */
  /* (before SH22) if (/spreadsheet_[^"'?]+\.(js|css)\?v=SH19/.test(html)) throw new Error("unexpected ?v=SH19 cache token"); */
  if (/spreadsheet_[^"'?]+\.(js|css)\?v=SH22/.test(html)) throw new Error("unexpected ?v=SH22 cache token");
  /* (before SH19) if (settings.indexOf('var SHEET_VERSION = "SH21";') < 0) throw new Error("SHEET_VERSION is not SH21"); */
  /* (before SH22) if (settings.indexOf('var SHEET_VERSION = "SH19";') < 0) throw new Error("SHEET_VERSION is not SH19"); */
  if (settings.indexOf('var SHEET_VERSION = "SH22";') < 0) throw new Error("SHEET_VERSION is not SH22");
});

test("live script order: spreadsheet_fx.js comes after spreadsheet_state.js", function () {
  var names = scriptSrcs(liveHtml(readHtml())).map(baseName);
  var state = names.indexOf("spreadsheet_state.js");
  var fx = names.indexOf("spreadsheet_fx.js");
  var edit = names.indexOf("spreadsheet_edit.js");
  if (state < 0) throw new Error("state.js missing from live scripts");
  if (fx < 0) throw new Error("fx.js missing from live scripts");
  if (fx <= state) throw new Error("fx.js still loads at index " + fx + " before state.js at " + state);
  if (edit >= 0 && fx <= edit) throw new Error("fx.js should load after edit.js (got fx=" + fx + " edit=" + edit + ")");
});

test("the old early fx.js tag is kept as a (before SH21) comment", function () {
  var html = readHtml();
  if (html.indexOf("<!-- (before SH21) <script src=\"spreadsheet_fx.js?v=HO3\"></script>") < 0) {
    throw new Error("old early fx.js script tag was not kept as a (before SH21) comment");
  }
  var live = liveHtml(html);
  var early = live.indexOf("spreadsheet_fx.js");
  var state = live.indexOf("spreadsheet_state.js");
  if (early < 0 || state < 0) throw new Error("live html missing fx.js or state.js");
  if (early < state) throw new Error("a live fx.js reference still appears before state.js");
});

test("every file that pushes to SHEET_INIT loads after state.js", function () {
  var files = fs.readdirSync(dir).filter(function (f) { return /^spreadsheet_.*\.js$/.test(f); });
  var pushers = [];
  files.forEach(function (f) {
    var src = fs.readFileSync(path.join(dir, f), "utf8");
    var live = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (/\bSHEET_INIT\.push\s*\(/.test(live)) pushers.push(f);
  });
  if (pushers.indexOf("spreadsheet_fx.js") < 0) throw new Error("fx.js no longer pushes to SHEET_INIT");
  var names = scriptSrcs(liveHtml(readHtml())).map(baseName);
  var state = names.indexOf("spreadsheet_state.js");
  if (state < 0) throw new Error("state.js missing");
  pushers.forEach(function (f) {
    var i = names.indexOf(f);
    if (i < 0) throw new Error(f + " pushes to SHEET_INIT but is not in spreadsheet.html");
    if (i <= state) throw new Error(f + " loads at " + i + " at or before state.js at " + state);
  });
});

test("vm load in HTML order registers initFxUi on SHEET_INIT", function () {
  var names = scriptSrcs(liveHtml(readHtml())).map(baseName);
  var fx = names.indexOf("spreadsheet_fx.js");
  if (fx < 0) throw new Error("fx.js missing");
  var prefix = [];
  var i;
  for (i = 0; i <= fx; i++) {
    if (/^spreadsheet_.*\.js$/.test(names[i])) prefix.push(names[i]);
  }
  if (prefix[prefix.length - 1] !== "spreadsheet_fx.js") {
    throw new Error("prefix ends with " + prefix[prefix.length - 1]);
  }
  if (prefix.indexOf("spreadsheet_state.js") < 0) throw new Error("state.js not in prefix before fx.js");

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
  prefix.forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f });
  });
  if (typeof ctx.initFxUi !== "function") throw new Error("initFxUi was not defined");
  if (!Array.isArray(ctx.SHEET_INIT)) throw new Error("SHEET_INIT is not an array: " + typeof ctx.SHEET_INIT);
  if (ctx.SHEET_INIT.indexOf(ctx.initFxUi) < 0) {
    throw new Error("SHEET_INIT does not include initFxUi (length " + ctx.SHEET_INIT.length + ")");
  }
});

console.log("passed", passed, "failed", failed);
process.exit(failed ? 1 : 0);
