#!/usr/bin/env node
/* Pure-helper tests for Base BS6 (no DOM, no jsdom, no browser).
 *   node apps/office/base/test-bs6-helpers.js
 */
var assert = require("assert");
var path = require("path");
var fs = require("fs");
var vm = require("vm");
var dir = path.join(__dirname, "modules");
var BaseTypes = require(path.join(dir, "base-types.js"));
var BaseLinks = require(path.join(dir, "base-links.js"));

var failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL", name + ":", e.message || e); }
}

function db() {
  var customers = {
    id: "cust", name: "Customers",
    fields: [
      { id: "cn", name: "Name", type: "text" },
      { id: "cv", name: "Village", type: "text" }
    ],
    rows: [
      { id: "c1", v: { cn: "Asha", cv: "Diphu" } },
      { id: "c2", v: { cn: "Raju", cv: "Lumding" } }
    ]
  };
  var orders = {
    id: "ord", name: "Orders",
    fields: [
      { id: "oi", name: "Item", type: "text" },
      { id: "oc", name: "Customer", type: "ref", to: "cust", display: "cn" },
      { id: "ov", name: "Village", type: "lookup", via: "oc", src: "cv" },
      { id: "ot", name: "Tags", type: "ref", to: "cust", multi: true, display: "cn" }
    ],
    rows: [
      { id: "o1", v: { oi: "Rice", oc: "c1", ov: "", ot: ["c1", "c2"] } },
      { id: "o2", v: { oi: "Salt", oc: "c2", ov: "", ot: [] } },
      { id: "o3", v: { oi: "Oil", oc: "", ov: "", ot: [] } }
    ]
  };
  return { schema: 6, tables: [customers, orders], current: "ord", queries: [] };
}

test("ids / normalize / isEmpty", function () {
  assert.deepStrictEqual(BaseLinks.ids("c1"), ["c1"]);
  assert.deepStrictEqual(BaseLinks.ids(["c1", "c1", "", "c2"]), ["c1", "c2"]);
  assert.strictEqual(BaseLinks.normalize(["c1", "c2"], false), "c1");
  assert.deepStrictEqual(BaseLinks.normalize("c1", true), ["c1"]);
  assert.ok(BaseLinks.isEmpty(""));
  assert.ok(BaseLinks.isEmpty([]));
  assert.ok(!BaseLinks.isEmpty("c1"));
});

test("displayText uses the display field, and flags missing records", function () {
  var d = db(), f = d.tables[1].fields[1];
  assert.strictEqual(BaseLinks.displayText(f, "c1", d), "Asha");
  assert.strictEqual(BaseLinks.displayText(f, "c2", d), "Raju");
  assert.strictEqual(BaseLinks.displayText(f, "gone", d), "(missing)");
  assert.strictEqual(BaseLinks.displayText(f, ["c1", "c2"], d), "Asha, Raju");
  assert.strictEqual(BaseLinks.missingCount(f, "gone", d), 1);
  assert.strictEqual(BaseLinks.missingCount(f, "c1", d), 0);
});

test("lookupValue / lookupText follow the link (single and multi)", function () {
  var d = db(), t = d.tables[1], look = t.fields[2], multi = t.fields[3];
  assert.strictEqual(BaseLinks.lookupValue(t, look, t.rows[0], d), "Diphu");
  assert.strictEqual(BaseLinks.lookupText(t, look, t.rows[0], d), "Diphu");
  assert.strictEqual(BaseLinks.lookupText(t, look, t.rows[2], d), "");
  var names = { type: "lookup", via: "ot", src: "cn" };
  var v = BaseLinks.lookupValue(t, names, t.rows[0], d);
  assert.deepStrictEqual(v, ["Asha", "Raju"]);
  assert.strictEqual(BaseLinks.lookupText(t, names, t.rows[0], d), "Asha, Raju");
});

test("inbound finds records that link to a customer, including multi", function () {
  var d = db(), cust = d.tables[0], asha = cust.rows[0];
  var hits = BaseLinks.inbound(cust, asha, d);
  assert.strictEqual(hits.length, 2); /* Rice.Customer and Rice.Tags */
  var tables = hits.map(function (h) { return h.table.id + ":" + h.field.id + ":" + h.row.id; }).sort();
  assert.deepStrictEqual(tables, ["ord:oc:o1", "ord:ot:o1"]);
  var fields = BaseLinks.inboundFields(cust, d);
  assert.strictEqual(fields.length, 2);
});

test("deleteImpact counts and clearLinksTo removes only the named ids", function () {
  var d = db(), cust = d.tables[0], asha = cust.rows[0];
  var imp = BaseLinks.deleteImpact(cust, [asha], d);
  assert.ok(imp.count >= 1);
  assert.ok(imp.groups.some(function (g) { return g.tableName === "Orders"; }));
  var n = BaseLinks.clearLinksTo("cust", { c1: 1 }, d);
  assert.ok(n >= 1);
  var orders = d.tables[1];
  assert.strictEqual(orders.rows[0].v.oc, "");
  assert.deepStrictEqual(orders.rows[0].v.ot, ["c2"]); /* Raju stays */
  assert.strictEqual(orders.rows[1].v.oc, "c2");
  var after = BaseLinks.inbound(cust, asha, d);
  assert.strictEqual(after.length, 0);
});

test("clearing a whole table of links empties every ref that pointed at it", function () {
  var d = db();
  BaseLinks.clearLinksTo("cust", null, d);
  var orders = d.tables[1];
  assert.strictEqual(orders.rows[0].v.oc, "");
  assert.deepStrictEqual(orders.rows[0].v.ot, []);
  assert.strictEqual(orders.rows[1].v.oc, "");
});

test("queryFields adds Link ▸ column paths; resolve reads the linked value", function () {
  var d = db(), t = d.tables[1];
  var qf = BaseLinks.queryFields(t, d);
  var path = qf.filter(function (f) { return f.id === "oc.cv"; })[0];
  assert.ok(path);
  assert.strictEqual(path.name, "Customer ▸ Village");
  assert.strictEqual(path.type, "text");
  assert.deepStrictEqual(BaseLinks.resolve(t, path, t.rows[0], d), ["Diphu"]);
  assert.deepStrictEqual(BaseLinks.resolve(t, path, t.rows[2], d), []);
});

test("repair upgrades schema 5 to current and keeps ref arrays", function () {
  var ctx = {
    console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    BaseTypes: BaseTypes, BaseLinks: BaseLinks,
    indexedDB: undefined, document: undefined,
    OfficeNotify: undefined, BaseHistory: undefined, BasePics: undefined, BASE: undefined
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, "base-store.js"), "utf8"), ctx);
  var raw = {
    schema: 5,
    tables: [{
      id: "cust", name: "Customers",
      fields: [{ id: "cn", name: "Name", type: "text" }],
      rows: [{ id: "c1", v: { cn: "Asha" } }]
    }, {
      id: "ord", name: "Orders",
      fields: [
        { id: "oi", name: "Item", type: "text" },
        { id: "oc", name: "Customer", type: "ref", to: "cust", display: "cn" },
        { id: "ot", name: "Tags", type: "ref", to: "cust", multi: true, display: "cn" },
        { id: "ov", name: "Village", type: "lookup", via: "oc", src: "cv" }
      ],
      rows: [{ id: "o1", v: { oi: "Rice", oc: "c1", ot: ["c1", "c2"], ov: "ignored" } }]
    }],
    current: "ord",
    queries: []
  };
  var res = ctx.BaseStore.repair(raw);
  assert.strictEqual(res.migrated, true);
  assert.strictEqual(res.db.schema, ctx.BaseStore.SCHEMA);
  var ot = res.db.tables.filter(function (x) { return x.id === "ord"; })[0];
  var tags = ot.fields.filter(function (f) { return f.id === "ot"; })[0];
  var look = ot.fields.filter(function (f) { return f.id === "ov"; })[0];
  assert.strictEqual(tags.type, "ref");
  assert.ok(tags.multi);
  assert.strictEqual(tags.to, "cust");
  assert.strictEqual(look.type, "lookup");
  assert.strictEqual(look.via, "oc");
  assert.strictEqual(JSON.stringify(ot.rows[0].v.ot), JSON.stringify(["c1", "c2"]));
  assert.strictEqual(ot.rows[0].v.oc, "c1");
  assert.strictEqual(ot.rows[0].v.ov, ""); /* lookup value is not stored */
  raw.schema = ctx.BaseStore.SCHEMA;
  var res2 = ctx.BaseStore.repair(raw);
  assert.strictEqual(res2.migrated, false);
});

test("BaseTypes.isEmpty and uniqueKey understand ref values", function () {
  assert.ok(BaseTypes.isEmpty({ type: "ref" }, ""));
  assert.ok(BaseTypes.isEmpty({ type: "ref" }, []));
  assert.ok(!BaseTypes.isEmpty({ type: "ref" }, "c1"));
  var f = { type: "ref", unique: true, id: "oc", name: "Customer" };
  assert.strictEqual(BaseTypes.uniqueKey(f, "c1"), BaseTypes.uniqueKey(f, ["c1"]));
});

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
