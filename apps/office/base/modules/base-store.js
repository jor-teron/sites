/*
 * base-store.js  (BS1, BS3: safe start)
 * Data model + IndexedDB storage for Base. Whole database kept in memory (small) and saved as ONE
 * record ('db') in IndexedDB 'office-base'; falls back to memory-only with an in-app banner.
 *   BASE.db = { tables: [{ id, name, fields: [{id, name, type}], rows: [{id, v: {fieldId: value}}] }], current,
 *               queries: [saved query, see base-query.js] (BS2) }
 *   Types: text | number | date | bool.
 * BS3 safe start: open() and the first read each get a 1.5 s timeout (+ onblocked). If storage never
 *   answers, is blocked by another tab, or is missing, Base goes memory-only (BASE.memOnly, banner) and
 *   renders anyway; a late connection is closed so it can never overwrite the saved record. Saves never
 *   throw. Loaded data goes through repair(): bad pieces are fixed or dropped and the untouched original
 *   is kept (BaseStore.raw(), and in IndexedDB as 'db-backup' when something was fixed) for
 *   "Download raw data". reset() clears the 'db' record (see BaseUI.recover).
 * API: BaseStore.load(cb), BaseStore.save() (debounced autosave), BaseStore.saveNow(), BaseStore.newTable(name, fields),
 *      BaseStore.table(), BaseStore.templates, BaseStore.uid(), BaseStore.repair(raw), BaseStore.raw(),
 *      BaseStore.reset(cb), BaseStore.warn(msg)
 */
var BASE = { db: { tables: [], current: null, queries: [] }, query: null, totals: false, memOnly: false, sort: null, view: "grid", formIndex: 0, selRow: null, search: "" };

var BaseStore = (function () {
  var DB_NAME = "office-base", STORE = "kv", TIMEOUT = 1500, idb = null, saveT = null, rawData = null;
  var TYPES = { text: 1, number: 1, date: 1, bool: 1 };
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
      var r = indexedDB.open(DB_NAME, 1);
      t = setTimeout(function () { finish(false, "did not answer"); }, TIMEOUT);
      r.onupgradeneeded = function () { try { r.result.createObjectStore(STORE); } catch (e) {} };
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
      }
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
  /* Returns { db, fixed } where fixed counts every change. Never throws; never mutates raw. */
  function repair(raw) {
    var fixed = 0, out = { tables: [], current: null, queries: [] };
    try {
      if (!isObj(raw)) return { db: out, fixed: 1 };
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
          var nf = { id: str(f.id), name: str(f.name).trim(), type: TYPES[f.type] ? f.type : "" };
          if (!nf.id || fseen[nf.id]) { fixed++; nf.id = uid(); } fseen[nf.id] = 1;
          if (!nf.name) { fixed++; nf.name = "Field " + (fi + 1); }
          if (!nf.type) { fixed++; nf.type = "text"; }
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
          Object.keys(v).forEach(function (k) { var x = v[k]; nr.v[k] = (x === null || typeof x === "object" || typeof x === "function") ? (x === null ? "" : (fixed++, String(x))) : x; });
          nt.fields.forEach(function (f) { if (!(f.id in nr.v)) nr.v[f.id] = f.type === "bool" ? false : ""; });
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
    } catch (e) { fixed++; }
    return { db: out, fixed: fixed };
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
    BASE.db = { tables: [], current: null, queries: [] }; BASE.query = null; BASE.sort = null; BASE.selRow = null; BASE.formIndex = 0; BASE.search = "";
    rawData = null;
    var called = false; function done() { if (!called) { called = true; cb && cb(); } }
    if (!idb) return done();
    try {
      var tx = idb.transaction(STORE, "readwrite");
      tx.oncomplete = done; tx.onabort = tx.onerror = function () { fail("could not be cleared"); done(); };
      tx.objectStore(STORE).delete("db");
      setTimeout(done, TIMEOUT);
    } catch (e) { fail("could not be cleared"); done(); }
  }
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
  return { load: load, save: save, saveNow: saveNow, table: table, newTable: newTable, templates: templates, uid: uid,
    repair: repair, raw: function () { return rawData; }, reset: reset, warn: warn };
})();
