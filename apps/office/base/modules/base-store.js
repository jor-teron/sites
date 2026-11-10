/*
 * base-store.js  (BS1, BS3: safe start, BS5: schema 5 + pictures store, BS6: schema 6 + ref/lookup, BS7: schema 7 + reports, BS8: schema 8 + views)
 * Data model + IndexedDB storage for Base. Whole database kept in memory (small) and saved as ONE
 * record ('db') in IndexedDB 'office-base'; falls back to memory-only with an in-app banner.
 *   BASE.db = { schema, tables: [{ id, name, fields: [{id, name, type, required?, unique?, def?, options?, next?}],
 *               rows: [{id, v: {fieldId: value}}] }], current, queries, reports, views }
 *   Types: text | number | date | bool | choice | email | phone | link | currency | long | picture | id | ref | lookup.
 *   ref fields keep { to, multi?, display? }; lookup fields keep { via, src }. Values of a ref are a
 *   row-id string or an array of ids (multi).
 *   Picture blobs live in the 'pics' object store (see base-pics.js), not in this record.
 * BS3 safe start: open() and the first read each get a 1.5 s timeout (+ onblocked). If storage never
 *   answers, is blocked by another tab, or is missing, Base goes memory-only (BASE.memOnly, banner) and
 *   renders anyway; a late connection is closed so it can never overwrite the saved record. Saves never
 *   throw. Loaded data goes through repair(): bad pieces are fixed or dropped and the untouched original
 *   is kept (BaseStore.raw(), and in IndexedDB as 'db-backup' when something was fixed) for
 *   "Download raw data". reset() clears the 'db' record (see BaseUI.recover).
 * BS5: existing BS4 databases load unchanged; schema is set to 5 and a backup is written first
 *   (same 'db-backup' key as a repair). IndexedDB version is 2 (adds the 'pics' store).
 * BS6: schema 6 (link-to-record + lookup). Existing schema 5 (and older) databases migrate in place
 *   after the same backup; row values and earlier field types are left as they are.
 * BS7: schema 7 (saved reports). Existing schema 6 (and older) databases migrate in place after the
 *   same backup; tables, queries and links are left as they are. Reports live in BASE.db.reports.
 * BS8: schema 8 (saved views + per-table layout: filters, columns, widths, freeze, colours).
 *   Existing schema 7 (and older) databases migrate in place after the same backup.
 * API: BaseStore.load(cb), BaseStore.save() (debounced autosave), BaseStore.saveNow(), BaseStore.newTable(name, fields),
 *      BaseStore.table(), BaseStore.templates, BaseStore.uid(), BaseStore.repair(raw), BaseStore.raw(),
 *      BaseStore.reset(cb), BaseStore.warn(msg), BaseStore.idb(), BaseStore.addIdField(t),
 *      BaseStore.newRow(t), SCHEMA
 */
var BASE = { db: { schema: 8, tables: [], current: null, queries: [], reports: [], views: [] }, query: null, report: null, totals: false, memOnly: false, sort: null, view: "grid", formIndex: 0, selRow: null, search: "" };

var BaseStore = (function () {
  var DB_NAME = "office-base", STORE = "kv", PICS = "pics", DB_VER = 2, SCHEMA = 8, TIMEOUT = 1500, idb = null, saveT = null, rawData = null;
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
  function emptyDb() { return { schema: SCHEMA, tables: [], current: null, queries: [], reports: [], views: [] }; }
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
        /* BS5–BS8: bump schema in place, after a backup, without calling it "damaged". */
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
          if (nf.type === "ref") {
            nf.to = str(f.to);
            if (f.multi) nf.multi = true;
            if (str(f.display)) nf.display = str(f.display);
          }
          if (nf.type === "lookup") {
            if (str(f.via)) nf.via = str(f.via);
            if (str(f.src)) nf.src = str(f.src);
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
            if (Array.isArray(x)) {
              nr.v[k] = x.map(function (i) { return str(i); }).filter(Boolean);
              return;
            }
            if (typeof x === "object" || typeof x === "function") { fixed++; nr.v[k] = ""; return; }
            nr.v[k] = x;
          });
          nt.fields.forEach(function (f) {
            if (!(f.id in nr.v)) nr.v[f.id] = f.type === "bool" ? false : (f.type === "ref" && f.multi ? [] : "");
            if (f.type === "id" && typeof nr.v[f.id] === "number" && nr.v[f.id] >= f.next) f.next = Math.floor(nr.v[f.id]) + 1;
            if (f.type === "ref") {
              var rv = nr.v[f.id];
              if (f.multi) nr.v[f.id] = Array.isArray(rv) ? rv : (rv ? [str(rv)] : []);
              else if (Array.isArray(rv)) nr.v[f.id] = rv[0] || "";
            } else if (Array.isArray(nr.v[f.id])) { fixed++; nr.v[f.id] = ""; }
            if (f.type === "lookup") nr.v[f.id] = "";
          });
          nt.rows.push(nr);
        });
        if (t.layout != null) {
          if (typeof BaseView !== "undefined" && BaseView.normalize) nt.layout = BaseView.normalize(t.layout, nt);
          else if (isObj(t.layout)) { try { nt.layout = JSON.parse(JSON.stringify(t.layout)); } catch (e) { fixed++; } }
          else fixed++;
        }
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
      var rs = raw.reports;
      if (rs != null && !Array.isArray(rs)) { fixed++; rs = []; }
      (rs || []).forEach(function (r) {
        if (!isObj(r) || !str(r.id)) { fixed++; return; }
        var c; try { c = JSON.parse(JSON.stringify(r)); } catch (e) { fixed++; return; }
        c.id = str(c.id);
        c.name = str(c.name).trim() || "Report";
        c.table = str(c.table);
        c.groupBy = str(c.groupBy);
        c.groupBy2 = str(c.groupBy2);
        if (c.bucket !== "month" && c.bucket !== "year") c.bucket = "value";
        if (c.bucket2 !== "month" && c.bucket2 !== "year") c.bucket2 = "value";
        if (c.chart !== "bar" && c.chart !== "pie") c.chart = "none";
        c.chartFn = str(c.chartFn) || "count";
        c.chartField = str(c.chartField);
        if (!Array.isArray(c.aggs)) { if (c.aggs !== undefined) fixed++; c.aggs = [{ field: "", fn: "count" }]; }
        var okfn = { count: 1, sum: 1, avg: 1, min: 1, max: 1 };
        c.aggs = c.aggs.filter(function (a) { return isObj(a) && okfn[a.fn] ? (a.field = str(a.field), a.fn = str(a.fn), true) : (fixed++, false); });
        if (!c.aggs.length) c.aggs = [{ field: "", fn: "count" }];
        out.reports.push(c);
      });
      var vs = raw.views;
      if (vs != null && !Array.isArray(vs)) { fixed++; vs = []; }
      (vs || []).forEach(function (v) {
        if (!isObj(v) || !str(v.id)) { fixed++; return; }
        var c; try { c = JSON.parse(JSON.stringify(v)); } catch (e) { fixed++; return; }
        c.id = str(c.id);
        c.name = str(c.name).trim() || "View";
        c.table = str(c.table);
        if (!Array.isArray(c.filters)) { if (c.filters !== undefined) fixed++; c.filters = []; }
        if (c.sort != null && !isObj(c.sort)) { fixed++; c.sort = null; }
        if (c.cols != null && !Array.isArray(c.cols)) { fixed++; c.cols = []; }
        if (c.widths != null && !isObj(c.widths)) { fixed++; c.widths = {}; }
        c.freeze = c.freeze === 1 || c.freeze === 2 ? c.freeze : 0;
        if (!Array.isArray(c.colors)) { if (c.colors !== undefined) fixed++; c.colors = []; }
        if (c.mode !== "gallery" && c.mode !== "calendar") c.mode = "grid";
        if (typeof BaseView !== "undefined" && BaseView.normalize) {
          var tb = out.tables.filter(function (x) { return x.id === c.table; })[0] || { fields: [] };
          var n = BaseView.normalize(c, tb);
          c.filters = n.filters; c.sort = n.sort; c.cols = n.cols; c.widths = n.widths;
          c.freeze = n.freeze; c.colors = n.colors; c.mode = n.mode;
          c.galleryPic = n.galleryPic; c.galleryFields = n.galleryFields; c.calendarField = n.calendarField;
        }
        out.views.push(c);
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
    BASE.db = emptyDb(); BASE.query = null; BASE.report = null; BASE.sort = null; BASE.selRow = null; BASE.formIndex = 0; BASE.search = "";
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
    if (nf.type === "ref") {
      if (extra.to) nf.to = extra.to;
      if (extra.multi) nf.multi = true;
      if (extra.display) nf.display = extra.display;
    }
    if (nf.type === "lookup") {
      if (extra.via) nf.via = extra.via;
      if (extra.src) nf.src = extra.src;
    }
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
  function tableById(id) { return (BASE.db.tables || []).filter(function (x) { return x.id === id; })[0] || null; }
  return { load: load, save: save, saveNow: saveNow, table: table, tableById: tableById, newTable: newTable, templates: templates, uid: uid,
    repair: repair, raw: function () { return rawData; }, reset: reset, warn: warn,
    idb: function () { return idb; }, newRow: newRow, addIdField: addIdField, SCHEMA: SCHEMA, normOptions: normOptions };
})();
