#!/usr/bin/env node
/* Pure-helper tests for Spreadsheet SH25: Grid context menu with row and column
 * insert, delete, cut, copy, paste, clear and hide (no external browser needed).
 *   node apps/office/spreadsheet/test-sh25-context-menu.js
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

var ctx = {
  console: console, Date: Date, Math: Math, Number: Number, String: String,
  Boolean: Boolean, Array: Array, Object: Object, JSON: JSON,
  parseInt: parseInt, isNaN: isNaN, isFinite: isFinite, RegExp: RegExp,
  Error: Error, TypeError: TypeError, NaN: NaN, Infinity: Infinity,
  undefined: undefined, setTimeout: setTimeout, clearTimeout: clearTimeout,
  document: undefined,
  COLS: 26, ROWS: 100,
  COL_LETTERS: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  SHEET_INIT: [],
  CLS: { rowNum: "row-num", colHead: "col-head", corner: "corner", cell: "cell" },
  TXT: { rowPrefix: "Row ", columnPrefix: "Column " }
};
vm.createContext(ctx);

// Load required scripts in dependency order
var files = [
  "spreadsheet_config.js",
  "spreadsheet_formula.js",
  "spreadsheet_functions.js",
  "spreadsheet_refs.js",
  "spreadsheet_state.js",
  "spreadsheet_rows.js"
];
files.forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f });
});

test("gridContextMenuItems returns correct row context menu items", function () {
  var items = ctx.gridContextMenuItems("row");
  var labels = items.map(function (it) { return it.sep ? "---" : it.label; });
  eq(labels, [
    "Insert row above",
    "Delete row",
    "---",
    "Clear contents",
    "---",
    "Hide row",
    /* (before SH39) "Unhide rows" was the last item */
    "Unhide rows",
    "---",
    "Fit row height"
  ]);
});

test("gridContextMenuItems returns correct column context menu items", function () {
  var items = ctx.gridContextMenuItems("col");
  var labels = items.map(function (it) { return it.sep ? "---" : it.label; });
  eq(labels, [
    "Insert column left",
    "Delete column",
    "---",
    "Clear contents",
    "---",
    "Hide column",
    "Unhide columns"
  ]);
});

test("gridContextMenuItems returns correct cell context menu items", function () {
  var items = ctx.gridContextMenuItems("cell");
  var labels = items.map(function (it) { return it.sep ? "---" : it.label; });
  eq(labels, [
    "Cut",
    "Copy",
    "Paste",
    "---",
    "Insert row above",
    "Delete row",
    "Insert column left",
    "Delete column",
    "---",
    "Clear contents"
  ]);
});

test("gridContextMenuItems returns correct corner context menu items", function () {
  var items = ctx.gridContextMenuItems("corner");
  var labels = items.map(function (it) { return it.sep ? "---" : it.label; });
  eq(labels, [
    "Cut",
    "Copy",
    "Paste",
    "---",
    "Clear contents"
  ]);
});

test("row context menu insert/delete invokes changeLines", function () {
  var calledAxis = null, calledDelta = 0;
  ctx.changeLines = function (axis, delta) {
    calledAxis = axis;
    calledDelta = delta;
  };
  var rowItems = ctx.gridContextMenuItems("row");
  var ins = rowItems.find(function (it) { return it.id === "row-ins"; });
  var del = rowItems.find(function (it) { return it.id === "row-del"; });

  ins.run();
  eq(calledAxis, "r");
  eq(calledDelta, 1);

  del.run();
  eq(calledAxis, "r");
  eq(calledDelta, -1);
});

test("col context menu insert/delete invokes changeLines", function () {
  var calledAxis = null, calledDelta = 0;
  ctx.changeLines = function (axis, delta) {
    calledAxis = axis;
    calledDelta = delta;
  };
  var colItems = ctx.gridContextMenuItems("col");
  var ins = colItems.find(function (it) { return it.id === "col-ins"; });
  var del = colItems.find(function (it) { return it.id === "col-del"; });

  ins.run();
  eq(calledAxis, "c");
  eq(calledDelta, 1);

  del.run();
  eq(calledAxis, "c");
  eq(calledDelta, -1);
});

test("cell context menu row/col insert/delete invokes changeLines", function () {
  var actions = [];
  ctx.changeLines = function (axis, delta) {
    actions.push(axis + ":" + delta);
  };
  var cellItems = ctx.gridContextMenuItems("cell");
  cellItems.find(function (it) { return it.id === "row-ins"; }).run();
  cellItems.find(function (it) { return it.id === "row-del"; }).run();
  cellItems.find(function (it) { return it.id === "col-ins"; }).run();
  cellItems.find(function (it) { return it.id === "col-del"; }).run();

  eq(actions, ["r:1", "r:-1", "c:1", "c:-1"]);
});

test("DOM context menu creation and removal in mock DOM", function () {
  var elements = {};
  var mockDoc = {
    getElementById: function (id) { return elements[id] || null; },
    createElement: function (tag) {
      var el = {
        tagName: tag.toUpperCase(),
        children: [],
        style: {},
        setAttribute: function (k, v) { this[k] = v; },
        appendChild: function (c) { this.children.push(c); },
        addEventListener: function () {},
        remove: function () {
          if (this.id && elements[this.id]) delete elements[this.id];
        },
        querySelector: function () { return null; }
      };
      return el;
    },
    body: {
      appendChild: function (c) {
        if (c.id) elements[c.id] = c;
      }
    }
  };

  ctx.document = mockDoc;
  ctx.window = { innerWidth: 1024, innerHeight: 768 };

  ctx.openGridContextMenu({ preventDefault: function () {}, clientX: 150, clientY: 200 }, [
    { id: "test", label: "Test Action", run: function () {} }
  ]);

  var menu = mockDoc.getElementById("sheet-context-menu");
  if (!menu) throw new Error("sheet-context-menu was not created in DOM");
  eq(menu.className, "sheet-context-menu");
  eq(menu.children.length, 1);

  ctx.closeGridContextMenu();
  eq(mockDoc.getElementById("sheet-context-menu"), null, "menu removed after close");
});

console.log("passed", passed, "failed", failed);
process.exit(failed ? 1 : 0);
