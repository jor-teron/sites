#!/usr/bin/env node
/* Pure-helper tests for Base BS9 (no DOM, no jsdom, no browser, no SheetJS, no sql.js).
 *   node apps/office/base/test-bs9-helpers.js
 */
var assert = require("assert");
var path = require("path");
var BaseCsv = require(path.join(__dirname, "modules/base-csv.js"));
if (typeof global !== "undefined") global.BaseCsv = BaseCsv;
var BaseFiles = require(path.join(__dirname, "modules/base-files.js"));

var failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL", name + ":", e.message || e); }
}

var seq = 0;
function ids() { return "id" + (++seq); }
function sample() {
  return {
    schema: 8,
    tables: [
      {
        id: "cust", name: "Customers",
        fields: [
          { id: "cn", name: "Name", type: "text" },
          { id: "pic", name: "Photo", type: "picture" }
        ],
        rows: [
          { id: "c1", v: { cn: "Asha", pic: "pic_aaa" } },
          { id: "c2", v: { cn: "Raju", pic: "" } }
        ]
      },
      {
        id: "ord", name: "Orders",
        fields: [
          { id: "oi", name: "Item", type: "text" },
          { id: "oc", name: "Customer", type: "ref", to: "cust", display: "cn" },
          { id: "amt", name: "Amount", type: "number" }
        ],
        rows: [
          { id: "o1", v: { oi: "Rice", oc: "c1", amt: 100 } },
          { id: "o2", v: { oi: "Salt", oc: "c2", amt: 50 } }
        ]
      }
    ],
    current: "ord",
    queries: [{ id: "q1", name: "Food", table: "ord", conds: [] }],
    reports: [{ id: "r1", name: "By item", table: "ord", groupBy: "oi" }],
    views: [{ id: "v1", name: "Grid", table: "ord", cols: ["oi"] }]
  };
}

test("pack and parse a backup, list picture keys", function () {
  var db = sample();
  var packed = BaseFiles.pack(db, { pic_aaa: { type: "image/webp", data: "QQ==" } });
  assert.strictEqual(packed.magic, "hbase");
  assert.strictEqual(packed.version, 1);
  assert.ok(packed.db.tables.length === 2);
  assert.strictEqual(packed.pics.pic_aaa.type, "image/webp");
  /* pack copies the db, does not alias it */
  db.tables[0].name = "CHANGED";
  assert.strictEqual(packed.db.tables[0].name, "Customers");
  var res = BaseFiles.parse(JSON.stringify(packed));
  assert.ok(res.ok);
  assert.strictEqual(res.pack.db.tables[1].id, "ord");
  assert.deepStrictEqual(BaseFiles.listPicKeys(packed.db), ["pic_aaa"]);
});

test("parse rejects garbage, a plain array, and JSON without the hbase marker", function () {
  assert.strictEqual(BaseFiles.parse("not-json").ok, false);
  assert.strictEqual(BaseFiles.parse([]).ok, false);
  assert.strictEqual(BaseFiles.parse({ tables: [] }).ok, false);
  assert.ok(/hbase/.test(BaseFiles.parse({ tables: [] }).error) || /backup/.test(BaseFiles.parse({ db: { tables: [] } }).error));
  var missing = BaseFiles.parse({ magic: "hbase" });
  assert.strictEqual(missing.ok, false);
});

test("remapCopy assigns new ids, remaps links and pictures, and uniquifies names", function () {
  seq = 0;
  var packed = BaseFiles.pack(sample(), { pic_aaa: { type: "image/webp", data: "QQ==" } });
  var out = BaseFiles.remapCopy(packed, ["Customers", "Orders"], ids);
  assert.strictEqual(out.db.tables[0].name, "Customers 2");
  assert.strictEqual(out.db.tables[1].name, "Orders 2");
  assert.notStrictEqual(out.db.tables[0].id, "cust");
  assert.notStrictEqual(out.db.tables[1].rows[0].id, "o1");
  var orders = out.db.tables[1], cust = out.db.tables[0];
  var custField = orders.fields.filter(function (f) { return f.id === "oc"; })[0];
  assert.strictEqual(custField.to, cust.id);
  var asha = cust.rows.filter(function (r) { return r.v.cn === "Asha"; })[0];
  var rice = orders.rows.filter(function (r) { return r.v.oi === "Rice"; })[0];
  assert.strictEqual(rice.v.oc, asha.id);
  assert.notStrictEqual(asha.v.pic, "pic_aaa");
  assert.ok(out.pics[asha.v.pic]);
  assert.strictEqual(out.pics[asha.v.pic].data, "QQ==");
  assert.strictEqual(out.db.queries[0].table, orders.id);
  assert.strictEqual(out.db.reports[0].table, orders.id);
  assert.strictEqual(out.db.views[0].table, orders.id);
  assert.notStrictEqual(out.db.queries[0].id, "q1");
  assert.strictEqual(out.db.current, cust.id); /* first remapped table */
});

test("tablesFromJson: array of objects, named lists, and a cap on rows", function () {
  var a = BaseFiles.tablesFromJson([
    { Name: "Asha", Amount: "100" },
    { Name: "Raju", Amount: "50" }
  ]);
  assert.strictEqual(a.tables.length, 1);
  assert.strictEqual(a.tables[0].fields[0][0], "Name");
  assert.strictEqual(a.tables[0].fields[1][1], "number");
  assert.strictEqual(a.tables[0].rows[0][1], 100);
  var b = BaseFiles.tablesFromJson({ People: [{ Name: "Asha" }], Sales: [{ Item: "Rice", Amount: 1 }] });
  assert.strictEqual(b.tables.length, 2);
  assert.ok(b.tables.some(function (t) { return t.name === "People"; }));
  var rows = [];
  for (var i = 0; i < 5010; i++) rows.push({ n: i });
  var c = BaseFiles.tablesFromJson(rows);
  assert.strictEqual(c.tables[0].rows.length, 5000);
  assert.ok(c.notes.cutRows >= 10);
});

test("tablesFromJson does not silently import a .hbase pack as loose rows", function () {
  var r = BaseFiles.tablesFromJson({ magic: "hbase", db: { tables: [] } });
  assert.strictEqual(r.tables.length, 0);
  assert.ok(r.notes && r.notes.hbase);
});

test("tablesFromJson reads a Base-shaped { tables: [{ fields, rows }] }", function () {
  var r = BaseFiles.tablesFromJson({
    tables: [{
      name: "People",
      fields: [{ id: "n", name: "Name", type: "text" }, { id: "a", name: "Age", type: "number" }],
      rows: [{ id: "r1", v: { n: "Asha", a: 30 } }]
    }]
  });
  assert.strictEqual(r.tables.length, 1);
  assert.strictEqual(r.tables[0].name, "People");
  assert.strictEqual(r.tables[0].fields[0][0], "Name");
  assert.strictEqual(r.tables[0].rows[0][0], "Asha");
});

test("tablesFromAoA guesses types; tablesFromSql uses columns + values", function () {
  var a = BaseFiles.tablesFromAoA([
    { name: "Exp", rows: [["Date", "Item", "Amount"], ["2026-10-01", "Rice", "650"], ["2026-10-02", "Salt", "40"]] }
  ]);
  assert.strictEqual(a.tables[0].name, "Exp");
  assert.strictEqual(a.tables[0].fields[0][1], "date");
  assert.strictEqual(a.tables[0].fields[2][1], "number");
  assert.strictEqual(a.tables[0].rows[0][2], 650);
  var s = BaseFiles.tablesFromSql([
    { name: "t", columns: ["Name", "Paid"], values: [["Asha", "yes"], ["Raju", "no"]] }
  ]);
  assert.strictEqual(s.tables[0].name, "t");
  assert.strictEqual(s.tables[0].fields[1][1], "bool");
  assert.strictEqual(s.tables[0].rows[0][1], true);
});

test("sheetAoA skips picture columns and writes display-ready values", function () {
  var t = sample().tables[0];
  var built = BaseFiles.sheetAoA(t, t.rows);
  assert.strictEqual(built.skippedPics, 1);
  assert.deepStrictEqual(built.aoa[0], ["Name"]);
  assert.deepStrictEqual(built.aoa[1], ["Asha"]);
  var o = sample().tables[1];
  var amt = BaseFiles.cellText(o, o.fields[2], o.rows[0]);
  assert.strictEqual(amt, 100);
});

test("uniqueName adds a suffix when the name is already used", function () {
  var used = ["Table"];
  assert.strictEqual(BaseFiles.uniqueName("Table", used), "Table 2");
  assert.strictEqual(BaseFiles.uniqueName("Table", used), "Table 3");
  assert.ok(used.indexOf("Table 2") >= 0);
});

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
