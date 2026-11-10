#!/usr/bin/env node
/* Pure-helper tests for Base BS7 (no DOM, no jsdom, no browser).
 *   node apps/office/base/test-bs7-helpers.js
 */
var assert = require("assert");
var path = require("path");
var fs = require("fs");
var vm = require("vm");
var dir = path.join(__dirname, "modules");
var BaseTypes = require(path.join(dir, "base-types.js"));
var BaseLinks = require(path.join(dir, "base-links.js"));
var BaseReport = require(path.join(dir, "base-report.js"));

var failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL", name + ":", e.message || e); }
}
function metric(built, g, field, fn) {
  var col = built.columns.filter(function (c) { return c.fn === fn && (fn === "count" || c.field === field); })[0];
  assert.ok(col, "missing column " + fn + " " + field);
  return BaseReport.metric(g.stats, g.count, col.field, col.fn);
}
function total(built, field, fn) {
  var col = built.columns.filter(function (c) { return c.fn === fn && (fn === "count" || c.field === field); })[0];
  return BaseReport.metric(built.total.stats, built.total.count, col.field, col.fn);
}

function sales() {
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
      { id: "tags", name: "Tags", type: "ref", to: "who", multi: true, display: "pn" },
      { id: "wn", name: "Who name", type: "lookup", via: "who", src: "pn" }
    ],
    rows: [
      { id: "r1", v: { d: "2026-10-01", item: "Rice", cat: "Food", amt: 100, who: "p1", tags: ["p1", "p2"], wn: "" } },
      { id: "r2", v: { d: "2026-10-15", item: "Salt", cat: "Food", amt: 50, who: "p2", tags: ["p2"], wn: "" } },
      { id: "r3", v: { d: "2026-11-02", item: "Bus", cat: "Travel", amt: 30, who: "p1", tags: [], wn: "" } },
      { id: "r4", v: { d: "2026-11-20", item: "Tea", cat: "", amt: 20, who: "", tags: [], wn: "" } }
    ]
  };
  return { schema: 7, tables: [who, t], current: "exp", queries: [], reports: [] };
}

test("monthLabel formats YYYY-MM", function () {
  assert.strictEqual(BaseReport.monthLabel("2026-10"), "Oct 2026");
  assert.strictEqual(BaseReport.monthLabel("2026-01"), "Jan 2026");
});

test("group by text: counts, sum, avg, min, max, grand total", function () {
  var d = sales(), t = d.tables[1];
  var built = BaseReport.build(t, t.rows, {
    groupBy: "cat",
    aggs: [{ fn: "count" }, { field: "amt", fn: "sum" }, { field: "amt", fn: "avg" }, { field: "amt", fn: "min" }, { field: "amt", fn: "max" }]
  }, d);
  assert.strictEqual(built.two, false);
  var by = {};
  built.groups.forEach(function (g) { by[g.label] = g; });
  assert.strictEqual(by.Food.count, 2);
  assert.strictEqual(metric(built, by.Food, "amt", "sum"), 150);
  assert.strictEqual(metric(built, by.Food, "amt", "avg"), 75);
  assert.strictEqual(metric(built, by.Food, "amt", "min"), 50);
  assert.strictEqual(metric(built, by.Food, "amt", "max"), 100);
  assert.strictEqual(by.Travel.count, 1);
  assert.strictEqual(metric(built, by.Travel, "amt", "sum"), 30);
  assert.strictEqual(by["(blank)"].count, 1);
  assert.strictEqual(metric(built, by["(blank)"], "amt", "sum"), 20);
  assert.strictEqual(built.total.count, 4);
  assert.strictEqual(total(built, "amt", "sum"), 200);
  assert.strictEqual(total(built, "amt", "min"), 20);
  assert.strictEqual(total(built, "amt", "max"), 100);
  assert.strictEqual(total(built, "amt", "avg"), 50);
});

test("empty group is labelled (blank)", function () {
  var d = sales(), t = d.tables[1];
  var built = BaseReport.build(t, t.rows, { groupBy: "cat", aggs: [{ fn: "count" }] }, d);
  assert.ok(built.groups.some(function (g) { return g.key === "" && g.label === "(blank)"; }));
});

test("date bucket by month and by year", function () {
  var d = sales(), t = d.tables[1];
  var m = BaseReport.build(t, t.rows, { groupBy: "d", bucket: "month", aggs: [{ fn: "count" }, { field: "amt", fn: "sum" }] }, d);
  var by = {};
  m.groups.forEach(function (g) { by[g.label] = g; });
  assert.strictEqual(by["Oct 2026"].count, 2);
  assert.strictEqual(metric(m, by["Oct 2026"], "amt", "sum"), 150);
  assert.strictEqual(by["Nov 2026"].count, 2);
  assert.strictEqual(metric(m, by["Nov 2026"], "amt", "sum"), 50);
  var y = BaseReport.build(t, t.rows, { groupBy: "d", bucket: "year", aggs: [{ fn: "count" }] }, d);
  assert.strictEqual(y.groups.length, 1);
  assert.strictEqual(y.groups[0].label, "2026");
  assert.strictEqual(y.groups[0].count, 4);
});

test("two group-by levels produce subtotals and a grand total", function () {
  var d = sales(), t = d.tables[1];
  var built = BaseReport.build(t, t.rows, {
    groupBy: "cat", groupBy2: "d", bucket2: "month",
    aggs: [{ fn: "count" }, { field: "amt", fn: "sum" }]
  }, d);
  assert.ok(built.two);
  var food = built.groups.filter(function (g) { return g.label === "Food"; })[0];
  assert.ok(food);
  assert.strictEqual(food.children.length, 1);
  assert.strictEqual(food.children[0].label2, "Oct 2026");
  assert.strictEqual(food.count, 2);
  assert.strictEqual(metric(built, food, "amt", "sum"), 150);
  assert.strictEqual(built.total.count, 4);
  assert.strictEqual(total(built, "amt", "sum"), 200);
});

test("group by a Link to record uses the display name", function () {
  var d = sales(), t = d.tables[1];
  var built = BaseReport.build(t, t.rows, { groupBy: "who", aggs: [{ fn: "count" }, { field: "amt", fn: "sum" }] }, d);
  var by = {};
  built.groups.forEach(function (g) { by[g.label] = g; });
  assert.strictEqual(by.Asha.count, 2);
  assert.strictEqual(metric(built, by.Asha, "amt", "sum"), 130);
  assert.strictEqual(by.Raju.count, 1);
  assert.strictEqual(metric(built, by.Raju, "amt", "sum"), 50);
  assert.strictEqual(by["(blank)"].count, 1);
});

test("a multi-link row is counted in each linked group", function () {
  var d = sales(), t = d.tables[1];
  var built = BaseReport.build(t, t.rows, { groupBy: "tags", aggs: [{ fn: "count" }, { field: "amt", fn: "sum" }] }, d);
  var by = {};
  built.groups.forEach(function (g) { by[g.label] = g; });
  /* r1 is in Asha and Raju; r2 in Raju; r3 and r4 blank */
  assert.strictEqual(by.Asha.count, 1);
  assert.strictEqual(by.Raju.count, 2);
  assert.strictEqual(by["(blank)"].count, 2);
  assert.strictEqual(metric(built, by.Raju, "amt", "sum"), 150); /* 100 + 50 */
  assert.strictEqual(built.total.count, 5); /* exploded: 1+2+2 */
});

test("chartSeries returns counts or a numeric field, in group order", function () {
  var d = sales(), t = d.tables[1];
  var built = BaseReport.build(t, t.rows, { groupBy: "cat", aggs: [{ fn: "count" }, { field: "amt", fn: "sum" }] }, d);
  var c = BaseReport.chartSeries(built, { chartFn: "count" });
  var by = {};
  c.items.forEach(function (it) { by[it.label] = it.value; });
  assert.strictEqual(by.Food, 2);
  assert.strictEqual(by.Travel, 1);
  var s = BaseReport.chartSeries(built, { chartFn: "sum", chartField: "amt" });
  var sb = {};
  s.items.forEach(function (it) { sb[it.label] = it.value; });
  assert.strictEqual(sb.Food, 150);
  assert.strictEqual(s.label.indexOf("Amount") >= 0 || s.fn === "sum", true);
});

test("format shows a dash for a missing number and currency via BaseTypes", function () {
  assert.strictEqual(BaseReport.format(null, "number"), "–");
  assert.strictEqual(BaseReport.format(150, "number"), "150");
  var cur = BaseReport.format(1500, "currency");
  assert.ok(String(cur).indexOf("1,500") >= 0 || String(cur).indexOf("1500") >= 0);
});

test("repair upgrades schema 6 to 7 and keeps saved reports", function () {
  var ctx = {
    console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    BaseTypes: BaseTypes, BaseLinks: BaseLinks,
    indexedDB: undefined, document: undefined,
    OfficeNotify: undefined, BaseHistory: undefined, BasePics: undefined, BASE: undefined
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, "base-store.js"), "utf8"), ctx);
  var raw = {
    schema: 6,
    tables: [{
      id: "exp", name: "Expenses",
      fields: [{ id: "cat", name: "Category", type: "text" }, { id: "amt", name: "Amount", type: "number" }],
      rows: [{ id: "r1", v: { cat: "Food", amt: 100 } }]
    }],
    current: "exp",
    queries: [],
    reports: [{
      id: "rep1", name: "By category", table: "exp", groupBy: "cat",
      aggs: [{ fn: "count" }, { field: "amt", fn: "sum" }],
      chart: "bar", chartFn: "count"
    }]
  };
  var res = ctx.BaseStore.repair(raw);
  assert.strictEqual(res.migrated, true);
  assert.strictEqual(res.db.schema, 7);
  assert.strictEqual(ctx.BaseStore.SCHEMA, 7);
  assert.strictEqual(res.db.reports.length, 1);
  assert.strictEqual(res.db.reports[0].name, "By category");
  assert.strictEqual(res.db.reports[0].chart, "bar");
  assert.strictEqual(res.db.reports[0].aggs.length, 2);
  /* already current, plus a broken report, is not a migrate */
  raw.schema = 7;
  raw.reports.push({ id: "", name: "no-id" });
  raw.reports.push({ id: "bad", name: "x", aggs: "nope", chart: "weird" });
  var res2 = ctx.BaseStore.repair(raw);
  assert.strictEqual(res2.migrated, false);
  assert.strictEqual(res2.db.schema, 7);
  var kept = res2.db.reports.filter(function (r) { return r.id === "rep1"; })[0];
  assert.ok(kept);
  var fixed = res2.db.reports.filter(function (r) { return r.id === "bad"; })[0];
  assert.ok(fixed);
  assert.strictEqual(fixed.chart, "none");
  assert.ok(Array.isArray(fixed.aggs));
  assert.ok(res2.fixed >= 1);
  assert.strictEqual(res2.db.reports.some(function (r) { return !r.id; }), false);
});

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
