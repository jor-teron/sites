#!/usr/bin/env node
/* Pure-helper tests for Base BS8 (no DOM, no jsdom, no browser).
 *   node apps/office/base/test-bs8-helpers.js
 */
var assert = require("assert");
var path = require("path");
var fs = require("fs");
var vm = require("vm");
var dir = path.join(__dirname, "modules");
var BaseTypes = require(path.join(dir, "base-types.js"));
var BaseLinks = require(path.join(dir, "base-links.js"));
var BaseView = require(path.join(dir, "base-view.js"));

var failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL", name + ":", e.message || e); }
}

function db() {
  var who = {
    id: "who", name: "People",
    fields: [{ id: "pn", name: "Name", type: "text" }],
    rows: [
      { id: "p1", v: { pn: "Asha" } },
      { id: "p2", v: { pn: "Raju" } }
    ]
  };
  var t = {
    id: "exp", name: "Expenses",
    fields: [
      { id: "d", name: "Date", type: "date" },
      { id: "item", name: "Item", type: "text" },
      { id: "cat", name: "Category", type: "text" },
      { id: "amt", name: "Amount", type: "number" },
      { id: "who", name: "Who", type: "ref", to: "who", display: "pn" },
      { id: "tags", name: "Tags", type: "ref", to: "who", multi: true, display: "pn" }
    ],
    rows: [
      { id: "r1", v: { d: "2026-10-01", item: "Rice", cat: "Food", amt: 100, who: "p1", tags: ["p1", "p2"] } },
      { id: "r2", v: { d: "2026-11-10", item: "Salt", cat: "Food", amt: 50, who: "p2", tags: ["p2"] } },
      { id: "r3", v: { d: "2026-11-10", item: "Bus", cat: "Travel", amt: 30, who: "p1", tags: [] } },
      { id: "r4", v: { d: "", item: "Tea", cat: "", amt: 20, who: "", tags: [] } }
    ]
  };
  return { schema: 8, tables: [who, t], current: "exp", queries: [], reports: [], views: [] };
}

test("filters on several columns combine with AND", function () {
  var d = db(), t = d.tables[1];
  var rows = BaseView.applyFilters(t, t.rows, [
    { field: "cat", values: ["Food"] },
    { field: "amt", op: "gt", val: 60 }
  ]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].id, "r1");
});

test("value checklist includes (blank) and drops unchecked values", function () {
  var d = db(), t = d.tables[1];
  var blank = BaseView.applyFilters(t, t.rows, [{ field: "cat", values: [""] }]);
  assert.strictEqual(blank.length, 1);
  assert.strictEqual(blank[0].id, "r4");
  var food = BaseView.applyFilters(t, t.rows, [{ field: "cat", values: ["Food", "Travel"] }]);
  assert.strictEqual(food.length, 3);
});

test("condition operators: eq, has, empty, numeric compare", function () {
  var d = db(), t = d.tables[1];
  assert.strictEqual(BaseView.applyFilters(t, t.rows, [{ field: "item", op: "eq", val: "Rice" }]).length, 1);
  assert.strictEqual(BaseView.applyFilters(t, t.rows, [{ field: "item", op: "has", val: "s" }]).map(function (r) { return r.id; }).join(","), "r2,r3");
  assert.strictEqual(BaseView.applyFilters(t, t.rows, [{ field: "d", op: "empty" }]).length, 1);
  var big = BaseView.applyFilters(t, t.rows, [{ field: "amt", op: "ge", val: 50 }]);
  assert.strictEqual(big.length, 2);
});

test("a multi-link row matches if any linked id is ticked", function () {
  var d = db(), t = d.tables[1];
  var asha = BaseView.applyFilters(t, t.rows, [{ field: "tags", values: ["p1"] }]);
  assert.strictEqual(asha.length, 1);
  assert.strictEqual(asha[0].id, "r1");
  var raju = BaseView.applyFilters(t, t.rows, [{ field: "tags", values: ["p2"] }]);
  assert.deepStrictEqual(raju.map(function (r) { return r.id; }), ["r1", "r2"]);
});

test("uniqueValues lists labels, a blank, and caps extras", function () {
  var d = db(), t = d.tables[1], cat = t.fields[2];
  var u = BaseView.uniqueValues(t, cat, t.rows, 50);
  var keys = u.items.map(function (x) { return x.key; });
  assert.ok(keys.indexOf("") >= 0);
  assert.ok(keys.indexOf("Food") >= 0);
  assert.ok(keys.indexOf("Travel") >= 0);
  var tiny = BaseView.uniqueValues(t, t.fields[1], t.rows, 2);
  assert.strictEqual(tiny.items.length, 2);
  assert.ok(tiny.extra >= 2);
});

test("visibleCols keeps order, drops hidden and unknown ids", function () {
  var d = db(), t = d.tables[1];
  t.layout = { cols: ["amt", "nope", "item", "amt"] };
  var cols = BaseView.visibleCols(t);
  assert.deepStrictEqual(cols.map(function (f) { return f.id; }), ["amt", "item"]);
  t.layout = { cols: [] };
  var all = BaseView.visibleCols(t);
  assert.strictEqual(all.length, t.fields.length);
});

test("normalize clamps widths and freeze, defaults a bad mode", function () {
  var d = db(), t = d.tables[1];
  var L = BaseView.normalize({
    widths: { amt: 20, item: 900, nope: 120 },
    freeze: 5, mode: "wizard", cols: ["item"],
    colors: [{ field: "amt", op: "gt", val: 10, color: "chartreuse", target: "row" }]
  }, t);
  assert.strictEqual(L.widths.amt, 60);
  assert.strictEqual(L.widths.item, 480);
  assert.strictEqual(L.widths.nope, undefined);
  assert.strictEqual(L.freeze, 0);
  assert.strictEqual(L.mode, "grid");
  assert.deepStrictEqual(L.cols, ["item"]);
  assert.strictEqual(L.colors[0].color, "yellow");
});

test("applyColors: first row rule wins; a later cell rule still paints that cell", function () {
  var d = db(), t = d.tables[1], rice = t.rows[0];
  var rules = [
    { field: "amt", op: "gt", val: 60, color: "red", target: "row" },
    { field: "cat", op: "eq", val: "Food", color: "green", target: "row" },
    { field: "item", op: "eq", val: "Rice", color: "blue", target: "cell" }
  ];
  var painted = BaseView.applyColors(rules, t, rice);
  assert.strictEqual(painted.row, "red");
  assert.strictEqual(painted.cells.item, "blue");
  var tea = t.rows[3];
  var none = BaseView.applyColors(rules, t, tea);
  assert.strictEqual(none.row, null);
  assert.strictEqual(Object.keys(none.cells).length, 0);
});

test("monthCells groups records onto the right day and pads full weeks", function () {
  var built = BaseView.monthCells(2026, 11, [
    { date: "2026-11-10", id: "r2" },
    { date: "2026-11-10", id: "r3" },
    { date: "2026-10-01", id: "r1" }
  ]);
  assert.strictEqual(built.month, 11);
  assert.strictEqual(built.year, 2026);
  built.weeks.forEach(function (w) { assert.strictEqual(w.length, 7); });
  var cell = built.cells.filter(function (c) { return c.date === "2026-11-10"; })[0];
  assert.ok(cell);
  assert.strictEqual(cell.inMonth, true);
  assert.strictEqual(cell.day, 10);
  assert.strictEqual(cell.items.length, 2);
  var oct = built.cells.filter(function (c) { return c.date === "2026-10-01"; })[0];
  /* 1 Oct may or may not appear in the November leading pad; if it does it is not inMonth */
  if (oct) assert.strictEqual(oct.inMonth, false);
  var inMonth = built.cells.filter(function (c) { return c.inMonth; });
  assert.strictEqual(inMonth.length, 30);
});

test("repair upgrades schema 7 to 8 and keeps views and table layout", function () {
  var ctx = {
    console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    BaseTypes: BaseTypes, BaseLinks: BaseLinks, BaseView: BaseView,
    indexedDB: undefined, document: undefined,
    OfficeNotify: undefined, BaseHistory: undefined, BasePics: undefined, BASE: undefined
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, "base-store.js"), "utf8"), ctx);
  var raw = {
    schema: 7,
    tables: [{
      id: "exp", name: "Expenses",
      fields: [
        { id: "item", name: "Item", type: "text" },
        { id: "amt", name: "Amount", type: "number" }
      ],
      rows: [{ id: "r1", v: { item: "Rice", amt: 100 } }],
      layout: { cols: ["amt", "item"], widths: { amt: 180 }, freeze: 1, filters: [{ field: "item", values: ["Rice"] }], mode: "grid" }
    }],
    current: "exp",
    queries: [],
    reports: [],
    views: [{
      id: "v1", name: "Food", table: "exp",
      cols: ["item"], freeze: 1, mode: "gallery",
      filters: [{ field: "item", op: "eq", val: "Rice" }],
      colors: [{ field: "amt", op: "gt", val: 50, color: "red", target: "row" }]
    }]
  };
  var res = ctx.BaseStore.repair(raw);
  assert.strictEqual(res.migrated, true);
  assert.strictEqual(res.db.schema, 8);
  assert.strictEqual(ctx.BaseStore.SCHEMA, 8);
  var tb = res.db.tables[0];
  assert.ok(tb.layout);
  assert.deepStrictEqual(tb.layout.cols, ["amt", "item"]);
  assert.strictEqual(tb.layout.widths.amt, 180);
  assert.strictEqual(tb.layout.freeze, 1);
  assert.strictEqual(res.db.views.length, 1);
  assert.strictEqual(res.db.views[0].name, "Food");
  assert.strictEqual(res.db.views[0].mode, "gallery");
  assert.strictEqual(res.db.views[0].colors[0].color, "red");
  raw.schema = 8;
  raw.views.push({ id: "", name: "no-id" });
  raw.views.push({ id: "bad", name: "x", filters: "nope", mode: "weird" });
  var res2 = ctx.BaseStore.repair(raw);
  assert.strictEqual(res2.migrated, false);
  assert.strictEqual(res2.db.schema, 8);
  var kept = res2.db.views.filter(function (v) { return v.id === "v1"; })[0];
  assert.ok(kept);
  var fixed = res2.db.views.filter(function (v) { return v.id === "bad"; })[0];
  assert.ok(fixed);
  assert.strictEqual(fixed.mode, "grid");
  assert.ok(Array.isArray(fixed.filters));
  assert.ok(res2.fixed >= 1);
  assert.strictEqual(res2.db.views.some(function (v) { return !v.id; }), false);
});

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
