/*
 * base-store.js  (BS1)
 * Data model + IndexedDB storage for Base. Whole database kept in memory (small) and saved as ONE
 * record ('db') in IndexedDB 'office-base'; falls back to memory-only with a toast.
 *   BASE.db = { tables: [{ id, name, fields: [{id, name, type}], rows: [{id, v: {fieldId: value}}] }], current }
 *   Types: text | number | date | bool.
 * API: BaseStore.load(cb), BaseStore.save() (debounced autosave), BaseStore.newTable(name, fields),
 *      BaseStore.table(), BaseStore.templates, BaseStore.uid()
 */
var BASE = { db: { tables: [], current: null }, memOnly: false, sort: null, view: "grid", formIndex: 0, selRow: null, search: "" };

var BaseStore = (function () {
  var DB_NAME = "office-base", STORE = "kv", idb = null, saveT = null;
  function uid() { return Math.random().toString(36).slice(2, 9); }
  function toast(m) { if (typeof OfficeToast !== "undefined") OfficeToast.show(m, 3000); }
  function open(cb) {
    try {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { idb = r.result; cb(); };
      r.onerror = function () { fail(); cb(); };
    } catch (e) { fail(); cb(); }
  }
  function fail() { BASE.memOnly = true; toast("Storage unavailable: changes kept in memory only"); }
  function load(cb) {
    open(function () {
      if (!idb) return cb();
      try {
        var g = idb.transaction(STORE).objectStore(STORE).get("db");
        g.onsuccess = function () { if (g.result && g.result.tables) BASE.db = g.result; cb(); };
        g.onerror = function () { cb(); };
      } catch (e) { cb(); }
    });
  }
  function saveNow() {
    if (!idb) return;
    try { idb.transaction(STORE, "readwrite").objectStore(STORE).put(BASE.db, "db"); }
    catch (e) { fail(); }
  }
  function save() { clearTimeout(saveT); saveT = setTimeout(saveNow, 400); }
  function table() {
    var d = BASE.db;
    return d.tables.filter(function (t) { return t.id === d.current; })[0] || d.tables[0] || null;
  }
  function newTable(name, fields, rows) {
    var t = { id: uid(), name: name, fields: fields.map(function (f) { return { id: uid(), name: f[0], type: f[1] }; }), rows: [] };
    (rows || []).forEach(function (r) {
      var v = {}; t.fields.forEach(function (f, i) { v[f.id] = r[i] === undefined ? "" : r[i]; }); t.rows.push({ id: uid(), v: v });
    });
    BASE.db.tables.push(t); BASE.db.current = t.id; save(); return t;
  }
  var templates = {
    Contacts: { fields: [["Name", "text"], ["Phone", "text"], ["Village / Town", "text"], ["Birthday", "date"], ["Notes", "text"]],
      rows: [["Asha", "98xxxxxx01", "Diphu", "1995-04-12", "Friend"]] },
    Expenses: { fields: [["Date", "date"], ["Item", "text"], ["Amount", "number"], ["Who", "text"], ["Paid", "bool"]],
      rows: [["2026-10-01", "Rice 10kg", 650, "Shop", true]] },
    Stock: { fields: [["Item", "text"], ["Price", "number"], ["Quantity", "number"], ["In stock", "bool"]],
      rows: [["Notebook", 40, 25, true]] },
    Blank: { fields: [["Name", "text"]], rows: [] }
  };
  return { load: load, save: save, saveNow: saveNow, table: table, newTable: newTable, templates: templates, uid: uid };
})();
