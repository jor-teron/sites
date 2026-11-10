/*
 * base-store.js  (BS1, BS3: safe start, BS5: schema 5 + pictures store)
 * Data model + IndexedDB storage for Base. Whole database kept in memory (small) and saved as ONE
 * record ('db') in IndexedDB 'office-base'; falls back to memory-only with an in-app banner.
 *   BASE.db = { schema, tables: [{ id, name, fields: [{id, name, type, required?, unique?, def?, options?, next?}],
 *               rows: [{id, v: {fieldId: value}}] }], current, queries }
 *   Types: text | number | date | bool | choice | email | phone | link | currency | long | picture | id.
 *   Picture blobs live in the 'pics' object store (see base-pics.js), not in this record.
 * BS3 safe start: open() and the first read each get a 1.5 s timeout (+ onblocked). If storage never
 *   answers, is blocked by another tab, or is missing, Base goes memory-only (BASE.memOnly, banner) and
 *   renders anyway; a late connection is closed so it can never overwrite the saved record. Saves never
 *   throw. Loaded data goes through repair(): bad pieces are fixed or dropped and the untouched original
 *   is kept (BaseStore.raw(), and in IndexedDB as 'db-backup' when something was fixed) for
 *   "Download raw data". reset() clears the 'db' record (see BaseUI.recover).
 * BS5: existing BS4 databases load unchanged; schema is set to 5 and a backup is written first
 *   (same 'db-backup' key as a repair). IndexedDB version is 2 (adds the 'pics' store).
 * API: BaseStore.load(cb), BaseStore.save() (debounced autosave), BaseStore.saveNow(), BaseStore.newTable(name, fields),
 *      BaseStore.table(), BaseStore.templates, BaseStore.uid(), BaseStore.repair(raw), BaseStore.raw(),
 *      BaseStore.reset(cb), BaseStore.warn(msg), BaseStore.idb(), BaseStore.addIdField(t),
 *      BaseStore.newRow(t), SCHEMA
 */
var BASE = { db: { schema: 5, tables: [], current: null, queries: [] }, query: null, totals: false, memOnly: false, sort: null, view: "grid", formIndex: 0, selRow: null, search: "" };

var BaseStore = (function () {
  var DB_NAME = "office-base", STORE = "kv", PICS = "pics", DB_VER = 2, SCHEMA = 5, TIMEOUT = 1500, idb = null, saveT = null, rawData = null;
  function types() { return (typeof BaseTypes !== "undefined" && BaseTypes.TYPES) || { text: 1, number: 1, date: 1, bool: 1 }; }
  function uid() { return Math.random().toString(36).slice(2, 9); }
  function toast(m) { try { if (typeof OfficeNotify !== "undefined") OfficeNotify.show(m, 3000); } catch (e) {} }
  /* In-app warning banner above the status line (no alert). Same text is not added twice. */
  function warn(msg) {
    try {
      var b = document.getElementById("base-warn");
      if (!b) {
        b = document.createElement("div"); b.id = "base-warn"; b.className = "base-warn"; b.setAttribute("role", "alert");
        var st = document.getElementById("status"); if (st && st.parentNode) st.parentNode.insertBefore(b, st); else document.body.appendChild(b);
      }
      if ([].some.call(b.children, function (c) { return c.dataset.msg === msg; })) return;
      var line = document.createElement("div"); line.className = "base-warn-line"; line.dataset.msg = msg;
      var tx = document.createElement("span"); tx.textContent = "⚠ " + msg; line.appendChild(tx);
      var x = document.createElement("button"); x.type = "button"; x.className = "base-warn-x"; x.textContent = "×"; x.title = "Hide"; x.setAttribute("aria-label", "Hide warning");
      x.addEventListener("click", function () { line.remove(); if (!b.children.length) b.remove(); });
      line.appendChild(x); b.appendChild(line);
    } catch (e) {}
  }
  function fail(why) {
    if (idb) { try { idb.close(); } catch (e) {} }
    idb = null;
    if (BASE.memOnly) return;
    BASE.memOnly = true;
    warn("Storage " + (why || "unavailable") + ": Base is working in memory only. Changes will be lost when you close it (use File > Export CSV).");
  }
  /* cb() is called exactly once: on success, error, blocked, exception or after TIMEOUT. */
  function open(cb) {
    var done = false, t = null;
    function finish(ok, why) { if (done) return false; done = true; clearTimeout(t); if (!ok) fail(why); cb(); return true; }
    try {
      if (typeof indexedDB === "undefined" || !indexedDB) return finish(false, "not available");
      var r = indexedDB.open(DB_NAME, DB_VER);
      t = setTimeout(function () { finish(false, "did not answer"); }, TIMEOUT);
      r.onupgradeneeded = function () {
        try {
          var db = r.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
          if (!db.objectStoreNames.contains(PICS)) db.createObjectStore(PICS);
        } catch (e) {}
      };
      r.onsuccess = function () {
        var db = r.result;
        if (done) { try { db.close(); } catch (e) {} return; }   /* too late: stay memory-only, never overwrite */
        db.onversionchange = function () { try { db.close(); } catch (e) {} if (idb === db) fail("was closed by another tab"); };
        idb = db; finish(true);
      };
      r.onerror = function () { finish(false, "failed to open"); };
      r.onblocked = function () { finish(false, "is blocked by another Base tab"); };
    } catch (e) { finish(false, "not available"); }
  }
  function emptyDb() { return { schema: SCHEMA, tables: [], current: null, queries: [] }; }
  function load(cb) {
    var done = false, t = null;
    function finish(val) {
      if (done) return; done = true; clearTimeout(t);
      if (val !== undefined && val !== null) {
        rawData = val;
        var res = repair(val);
        BASE.db = res.db;
        if (res.fixed) {
          warn("Some saved data was damaged and has been repaired (" + res.fixed + " fix" + (res.fixed > 1 ? "es" : "") + "). A copy of the original was kept as a backup.");
          try { if (idb) idb.transaction(STORE, "readwrite").objectStore(STORE).put(val, "db-backup"); } catch (e) {}
        }
        /* BS5: bump schema in place, after a backup, without calling it "damaged". */
        if (res.migrated) {
          try { if (idb && !res.fixed) idb.transaction(STORE, "readwrite").objectStore(STORE).put(val, "db-backup"); } catch (e) {}
          saveNow();
        }
      }
      if (!BASE.db || !BASE.db.schema) { if (!BASE.db) BASE.db = emptyDb(); else BASE.db.schema = SCHEMA; }
      cb();
    }
    open(function () {
      if (!idb) return finish();
      try {
        var g = idb.transaction(STORE).objectStore(STORE).get("db");
        t = setTimeout(function () { fail("did not answer"); finish(); }, TIMEOUT);
        g.onsuccess = function () { finish(g.result); };
        g.onerror = function () { fail("could not be read"); finish(); };
      } catch (e) { fail("could not be read"); finish(); }
    });
  }
  function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }
  function str(x) { return typeof x === "string" ? x : (typeof x === "number" ? String(x) : ""); }
  function normOptions(arr) {
    var out = [], seen = {};
    (Array.isArray(arr) ? arr : []).forEach(function (x) {
      var s = str(x).trim(); if (!s || seen[s]) return; seen[s] = 1; out.push(s);
    });
    return out;
  }
  /* Returns { db, fixed, migrated } where fixed counts every repair. Never throws; never mutates raw. */
  function repair(raw) {
    var fixed = 0, migrated = false, out = emptyDb(), known = types();
    try {
      if (!isObj(raw)) return { db: out, fixed: 1, migrated: true };
      if (raw.schema !== SCHEMA) migrated = true;
      var ts = raw.tables;
      if (!Array.isArray(ts)) { fixed++; ts = isObj(ts) ? Object.keys(ts).map(function (k) { return ts[k]; }) : []; }
      var seen = {};
      ts.forEach(function (t, ti) {
        if (!isObj(t)) { fixed++; return; }
        var nt = { id: str(t.id), name: str(t.name).trim(), fields: [], rows: [] };
        if (!nt.id || seen[nt.id]) { fixed++; nt.id = uid(); } seen[nt.id] = 1;
        if (!nt.name) { fixed++; nt.name = "Table " + (ti + 1); }
        var rows = t.rows;
        if (!Array.isArray(rows)) { fixed++; rows = []; }
        var fs = t.fields, fseen = {};
        if (!Array.isArray(fs)) {
          fixed++; fs = [];
          rows.forEach(function (r) { if (isObj(r) && isObj(r.v)) Object.keys(r.v).forEach(function (k) { if (!fseen[k]) { fseen[k] = 1; fs.push({ id: k, name: k, type: "text" }); } }); });
          fseen = {};
        }
        fs.forEach(function (f, fi) {
          if (!isObj(f)) { fixed++; return; }
          var nf = { id: str(f.id), name: str(f.name).trim(), type: known[f.type] ? f.type : "" };
          if (!nf.id || fseen[nf.id]) { fixed++; nf.id = uid(); } fseen[nf.id] = 1;
          if (!nf.name) { fixed++; nf.name = "Field " + (fi + 1); }
          if (!nf.type) { fixed++; nf.type = "text"; }
          if (f.required) nf.required = true;
          if (f.unique) nf.unique = true;
          if (f.def != null && f.def !== "") nf.def = f.def;
          if (nf.type === "choice") nf.options = normOptions(f.options);
          if (nf.type === "id") {
            var nxt = f.next;
            nf.next = (typeof nxt === "number" && isFinite(nxt) && nxt >= 1) ? Math.floor(nxt) : 1;
          }
          nt.fields.push(nf);
        });
        if (!nt.fields.length) { fixed++; nt.fields.push({ id: uid(), name: "Name", type: "text" }); }
        var rseen = {};
        rows.forEach(function (r) {
          if (!isObj(r)) { fixed++; return; }
          var nr = { id: str(r.id), v: {} };
          if (!nr.id || rseen[nr.id]) { fixed++; nr.id = uid(); } rseen[nr.id] = 1;
          if (!isObj(r.v)) fixed++;
          var v = isObj(r.v) ? r.v : {};
          Object.keys(v).forEach(function (k) {
            var x = v[k];
            if (x === null) { nr.v[k] = ""; return; }
            if (typeof x === "object" || typeof x === "function") { fixed++; nr.v[k] = ""; return; }
            nr.v[k] = x;
          });
          nt.fields.forEach(function (f) {
            if (!(f.id in nr.v)) nr.v[f.id] = f.type === "bool" ? false : "";
            if (f.type === "id" && typeof nr.v[f.id] === "number" && nr.v[f.id] >= f.next) f.next = Math.floor(nr.v[f.id]) + 1;
          });
          nt.rows.push(nr);
        });
        out.tables.push(nt);
      });
      out.current = str(raw.current);
      if (!out.tables.some(function (t) { return t.id === out.current; })) { if (raw.current != null && out.tables.length) fixed++; out.current = out.tables[0] ? out.tables[0].id : null; }
      var qs = raw.queries;
      if (qs != null && !Array.isArray(qs)) { fixed++; qs = []; }
      (qs || []).forEach(function (q) {
        if (!isObj(q) || !str(q.id)) { fixed++; return; }
        var c; try { c = JSON.parse(JSON.stringify(q)); } catch (e) { fixed++; return; }
        if (!Array.isArray(c.conds)) { if (c.conds !== undefined) fixed++; c.conds = []; }
        c.conds = c.conds.filter(function (x) { return isObj(x) || (fixed++, false); });
        if (c.show != null && !Array.isArray(c.show)) { fixed++; delete c.show; }
        if (c.sort != null && !isObj(c.sort)) { fixed++; c.sort = null; }
        if (c.join !== "and" && c.join !== "or") { if (c.join !== undefined) fixed++; c.join = "and"; }
        out.queries.push(c);
      });
      out.schema = SCHEMA;
    } catch (e) { fixed++; }
    return { db: out, fixed: fixed, migrated: migrated };
  }
  function saveNow() {
    clearTimeout(saveT);
    if (!idb || BASE.memOnly) return;
    try {
      var tx = idb.transaction(STORE, "readwrite");
      tx.onabort = tx.onerror = function () { fail("could not save"); };
      tx.objectStore(STORE).put(BASE.db, "db");
    } catch (e) { fail("could not save"); }
  }
  function save() { try { clearTimeout(saveT); saveT = setTimeout(saveNow, 400); } catch (e) {} }
  /* Clear the saved record (if storage works) and empty memory; cb() then renders the templates screen. */
  function reset(cb) {
    clearTimeout(saveT);
    BASE.db = emptyDb(); BASE.query = null; BASE.sort = null; BASE.selRow = null; BASE.formIndex = 0; BASE.search = "";
    rawData = null;
    try { if (typeof BaseHistory !== "undefined") BaseHistory.clear(); } catch (e) {}
    var called = false; function done() { if (!called) { called = true; try { if (typeof BasePics !== "undefined") BasePics.gc(); } catch (e) {} cb && cb(); } }
    if (!idb) return done();
    try {
      var stores = [STORE];
      if (idb.objectStoreNames.contains(PICS)) stores.push(PICS);
      var tx = idb.transaction(stores, "readwrite");
      tx.oncomplete = done; tx.onabort = tx.onerror = function () { fail("could not be cleared"); done(); };
      tx.objectStore(STORE).delete("db");
      if (stores.indexOf(PICS) >= 0) { try { tx.objectStore(PICS).clear(); } catch (e) {} }
      setTimeout(done, TIMEOUT);
    } catch (e) { fail("could not be cleared"); done(); }
  }
  function table() {
    var d = BASE.db;
    return d.tables.filter(function (t) { return t.id === d.current; })[0] || d.tables[0] || null;
  }
  function fieldFromSpec(f) {
    var name, type, extra;
    if (Array.isArray(f)) { name = f[0]; type = f[1]; extra = f[2] || {}; }
    else { name = f.name; type = f.type; extra = f; }
    var nf = { id: uid(), name: name, type: (types()[type] ? type : "text") };
    if (extra.required) nf.required = true;
    if (extra.unique) nf.unique = true;
    if (extra.def != null && extra.def !== "") nf.def = extra.def;
    if (nf.type === "choice") nf.options = normOptions(extra.options);
    if (nf.type === "id") nf.next = 1;
    return nf;
  }
  function newRow(t) {
    var r = { id: uid(), v: {} };
    t.fields.forEach(function (f) {
      if (f.type === "id") r.v[f.id] = (typeof BaseTypes !== "undefined" ? BaseTypes.nextId(f) : (f.next++, f.next - 1));
      else if (typeof BaseTypes !== "undefined") r.v[f.id] = BaseTypes.defaultValue(f);
      else r.v[f.id] = f.type === "bool" ? false : "";
    });
    return r;
  }
  function addIdField(t) {
    if (!t) return null;
    if (t.fields.some(function (f) { return f.type === "id"; })) return null;
    var f = { id: uid(), name: "ID", type: "id", next: 1 };
    t.fields.unshift(f);
    if (typeof BaseTypes !== "undefined") BaseTypes.fillAutoIds(t, f);
    else { var n = 1; t.rows.forEach(function (r) { r.v[f.id] = n++; }); f.next = n; }
    return f;
  }
  function newTable(name, fields, rows, opt) {
    var t = { id: uid(), name: name, fields: (fields || []).map(fieldFromSpec), rows: [] };
    (rows || []).forEach(function (r) {
      var v = {}; t.fields.forEach(function (f, i) { v[f.id] = r[i] === undefined ? (f.type === "bool" ? false : "") : r[i]; }); t.rows.push({ id: uid(), v: v });
    });
    if (opt && opt.addId) addIdField(t);
    if (!BASE.db.schema) BASE.db.schema = SCHEMA;
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
  return { load: load, save: save, saveNow: saveNow, table: table, newTable: newTable, templates: templates, uid: uid,
    repair: repair, raw: function () { return rawData; }, reset: reset, warn: warn,
    idb: function () { return idb; }, newRow: newRow, addIdField: addIdField, SCHEMA: SCHEMA, normOptions: normOptions };
})();
