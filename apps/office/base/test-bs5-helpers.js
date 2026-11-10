#!/usr/bin/env node
/* Pure-helper tests for Base BS5 (no DOM, no jsdom, no browser).
 *   node apps/office/base/test-bs5-helpers.js
 */
var assert = require("assert");
var path = require("path");
var fs = require("fs");
var vm = require("vm");
var dir = path.join(__dirname, "modules");
var BaseTypes = require(path.join(dir, "base-types.js"));
var BaseHistory = require(path.join(dir, "base-history.js"));

var failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL", name + ":", e.message || e); }
}

/* ---- auto-number ---- */
test("nextId starts at 1 and increments", function () {
  var f = { type: "id" };
  assert.strictEqual(BaseTypes.nextId(f), 1);
  assert.strictEqual(BaseTypes.nextId(f), 2);
  assert.strictEqual(BaseTypes.nextId(f), 3);
  assert.strictEqual(f.next, 4);
});
test("nextId never goes backwards after a 'delete'", function () {
  var f = { type: "id", next: 5 };
  assert.strictEqual(BaseTypes.nextId(f), 5);
  assert.strictEqual(f.next, 6);
});
test("fillAutoIds numbers existing rows in order and sets next", function () {
  var f = { id: "id1", type: "id" };
  var t = { fields: [f], rows: [{ id: "a", v: {} }, { id: "b", v: {} }, { id: "c", v: {} }] };
  BaseTypes.fillAutoIds(t, f);
  assert.strictEqual(t.rows[0].v.id1, 1);
  assert.strictEqual(t.rows[1].v.id1, 2);
  assert.strictEqual(t.rows[2].v.id1, 3);
  assert.strictEqual(f.next, 4);
  /* a later 'delete' of row 2 must not reuse 2 */
  t.rows.splice(1, 1);
  assert.strictEqual(BaseTypes.nextId(f), 4);
  assert.strictEqual(f.next, 5);
});

/* ---- validation: required + unique ---- */
function tableWith(field, values) {
  var f = field;
  return {
    fields: [f],
    rows: values.map(function (v, i) { return { id: "r" + i, v: { [f.id]: v } }; })
  };
}
test("required empty is an error but not a unique block", function () {
  var f = { id: "n", name: "Name", type: "text", required: true };
  var t = tableWith(f, [""]);
  var r = BaseTypes.validate(t, f, "", "r0");
  assert.ok(r.error.indexOf("required") >= 0);
  assert.strictEqual(r.block, false);
});
test("unique rejects a duplicate (case-insensitive for text)", function () {
  var f = { id: "e", name: "Email", type: "email", unique: true };
  var t = tableWith(f, ["Ada@example.com", "bob@example.com"]);
  var r = BaseTypes.validate(t, f, "ada@example.com", "r-new");
  assert.ok(r.block);
  assert.ok(/unique/i.test(r.error));
  var self = BaseTypes.validate(t, f, "Ada@example.com", "r0");
  assert.strictEqual(self.block, false);
});
test("unique allows several empties", function () {
  var f = { id: "e", name: "Email", type: "email", unique: true };
  var t = tableWith(f, ["", ""]);
  var r = BaseTypes.validate(t, f, "", "r-new");
  assert.strictEqual(r.block, false);
});
test("unique for currency compares numerically", function () {
  var f = { id: "a", name: "Amount", type: "currency", unique: true };
  var t = tableWith(f, [1500]);
  var r = BaseTypes.validate(t, f, 1500, "r-new");
  assert.ok(r.block);
  var ok = BaseTypes.validate(t, f, 1500.5, "r-new");
  assert.strictEqual(ok.block, false);
});

/* ---- format warnings (do not block) ---- */
test("email / phone / link warn but do not block", function () {
  var email = BaseTypes.validate({ fields: [], rows: [] }, { id: "e", name: "Email", type: "email" }, "not-an-email", "x");
  assert.ok(email.warn); assert.ok(!email.block);
  var phone = BaseTypes.validate({ fields: [], rows: [] }, { id: "p", name: "Phone", type: "phone" }, "12", "x");
  assert.ok(phone.warn); assert.ok(!phone.block);
  var link = BaseTypes.validate({ fields: [], rows: [] }, { id: "l", name: "Link", type: "link" }, "javascript:alert(1)", "x");
  assert.ok(link.warn); assert.ok(!link.block);
  var good = BaseTypes.validate({ fields: [], rows: [] }, { id: "e", name: "Email", type: "email" }, "a@b.co", "x");
  assert.strictEqual(good.warn, "");
});
test("hrefFor refuses javascript: and data:", function () {
  assert.strictEqual(BaseTypes.hrefFor("javascript:alert(1)"), "");
  assert.strictEqual(BaseTypes.hrefFor("data:text/html,hi"), "");
  assert.ok(/^https:\/\//.test(BaseTypes.hrefFor("example.com")));
  assert.ok(/^https:\/\//.test(BaseTypes.hrefFor("https://example.com")));
  assert.ok(/^mailto:/.test(BaseTypes.hrefFor("a@b.co")));
});

/* ---- currency ---- */
test("formatCurrency uses ₹ and two decimals", function () {
  var s = BaseTypes.formatCurrency(123456.7);
  assert.ok(s.indexOf("₹") === 0);
  assert.ok(/56\.70$/.test(s) || /56\.7$/.test(s));
  assert.strictEqual(BaseTypes.formatCurrency(""), "");
  assert.strictEqual(BaseTypes.parseCurrency("₹1,23,456.78"), 123456.78);
  assert.strictEqual(BaseTypes.parseCurrency(""), "");
  assert.strictEqual(BaseTypes.parseCurrency("nope"), null);
});

/* ---- conversion / retype preview ---- */
test("convert number to text keeps the digits; to picture is lost", function () {
  var c = BaseTypes.convert(40, "number", "text");
  assert.strictEqual(c.value, "40"); assert.ok(!c.lost);
  var p = BaseTypes.convert(40, "number", "picture");
  assert.strictEqual(p.value, ""); assert.ok(p.lost);
  var cur = BaseTypes.convert("₹80", "text", "currency");
  assert.strictEqual(cur.value, 80); assert.ok(!cur.lost);
  var bad = BaseTypes.convert("rice", "text", "number");
  assert.strictEqual(bad.value, ""); assert.ok(bad.lost);
});
test("previewRetype counts how many values would be lost", function () {
  var f = { id: "x", name: "X", type: "text" };
  var t = tableWith(f, ["10", "hello", "20"]);
  var p = BaseTypes.previewRetype(t, f, "number");
  assert.strictEqual(p.kept, 2);
  assert.strictEqual(p.lost, 1);
  var toId = BaseTypes.previewRetype(t, f, "id");
  assert.ok(toId.fill);
  assert.strictEqual(toId.lost, 0);
});

/* ---- undo stack (pure) ---- */
test("undo / redo stack restores states and caps at the limit", function () {
  var S = BaseHistory.stack(3);
  S.push("a", "one"); S.push("b", "two"); S.push("c", "three"); S.push("d", "four");
  assert.strictEqual(S.length(), 3);
  assert.deepStrictEqual(S.labels(), ["two", "three", "four"]);
  var u = S.undo("now");
  assert.strictEqual(u.snap, "d");
  assert.ok(S.canRedo());
  var r = S.redo("c-now");
  assert.strictEqual(r.snap, "now");
  S.push("e", "five");
  assert.ok(!S.canRedo());
  S.clear();
  assert.ok(!S.canUndo());
  assert.ok(!S.canRedo());
});

/* ---- repair / schema migrate (BS4 payload) ---- */
test("repair upgrades a BS4 database without dropping tables or rows", function () {
  var ctx = {
    console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    BaseTypes: BaseTypes, indexedDB: undefined, document: undefined,
    OfficeNotify: undefined, BaseHistory: undefined, BasePics: undefined, BASE: undefined
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, "base-store.js"), "utf8"), ctx);
  var raw = {
    tables: [{
      id: "t1", name: "Expenses",
      fields: [
        { id: "d", name: "Date", type: "date" },
        { id: "a", name: "Amount", type: "number" },
        { id: "p", name: "Paid", type: "bool" }
      ],
      rows: [{ id: "r1", v: { d: "2026-10-01", a: 650, p: true } }]
    }],
    current: "t1",
    queries: []
  };
  var res = ctx.BaseStore.repair(raw);
  assert.strictEqual(res.fixed, 0);
  assert.strictEqual(res.migrated, true);
  assert.strictEqual(res.db.schema, ctx.BaseStore.SCHEMA);
  assert.strictEqual(res.db.tables.length, 1);
  assert.strictEqual(res.db.tables[0].rows[0].v.a, 650);
  assert.strictEqual(res.db.tables[0].fields[1].type, "number");
  /* new props are preserved when already present */
  raw.schema = ctx.BaseStore.SCHEMA;
  raw.tables[0].fields.push({ id: "c", name: "Kind", type: "choice", options: ["Food", "Bus"], required: true, unique: false, def: "Food" });
  raw.tables[0].rows[0].v.c = "Food";
  var res2 = ctx.BaseStore.repair(raw);
  assert.strictEqual(res2.migrated, false);
  var kind = res2.db.tables[0].fields.filter(function (f) { return f.id === "c"; })[0];
  assert.strictEqual(kind.type, "choice");
  assert.ok(kind.required);
  assert.strictEqual(JSON.stringify(kind.options), JSON.stringify(["Food", "Bus"]));
  assert.strictEqual(kind.def, "Food");
});

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
