/*
 * base-files.js  (BS9)
 * Full .hbase backup/restore (tables, queries, reports, views, links, pictures),
 * Excel import/export through the Spreadsheet app's vendored SheetJS (lazy relative
 * load, not copied), read-only JSON and SQLite import, and "Send to Spreadsheet"
 * (downloads a workbook — Spreadsheet has no in-app hand-off).
 *
 *   .hbase file = JSON { magic: "hbase", version: 1, schema, exported, db, pics:
 *                 { key: { type, data: "<base64>" } } }
 *   Restore can replace everything (not undoable) or add a remapped copy (undoable).
 *   SheetJS: ../spreadsheet/vendor/sheetjs/xlsx.full.min.js
 *   sql.js (already in the repo, not copied): ../../tools/db-browser/vendor/sqljs/
 *
 * Pure helpers (pack, parse, remap, tablesFromJson / FromAoA / FromSql) have no DOM
 * and are safe to load in Node. Caps: 20 imported tables, 5 000 rows each.
 *
 * API: BaseFiles.MAGIC, .CAPS, .pack, .parse, .remapCopy, .listPicKeys,
 *      .tablesFromJson, .tablesFromAoA, .tablesFromSql, .sheetAoA,
 *      .backup, .restoreFile, .open, .exportXlsx, .sendToSpreadsheet, .loadXlsx
 */
(function (root) {
  var MAGIC = "hbase", VERSION = 1;
  var CAPS = { tables: 20, rows: 5000 };
  var XLSX_SRC = "../spreadsheet/vendor/sheetjs/xlsx.full.min.js";
  var SQL_DIR = "../../tools/db-browser/vendor/sqljs/";
  var xlsxLoading = null, sqlLoading = null;

  function toast(m, ms) { try { if (typeof OfficeNotify !== "undefined") OfficeNotify.show(m, ms || 3500); } catch (e) {} }
  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function uid() { return (typeof BaseStore !== "undefined" && BaseStore.uid) ? BaseStore.uid() : Math.random().toString(36).slice(2, 9); }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function note(title, message) {
    var back = el("div", "dlg-backdrop base-v-back");
    var box = el("div", "dlg base-v-dlg"); box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    box.appendChild(el("div", "dlg-title", title));
    box.appendChild(el("div", "dlg-message", message));
    var act = el("div", "dlg-actions"), ok = el("button", "dlg-btn dlg-ok", "OK"); ok.type = "button";
    ok.addEventListener("click", function () { back.remove(); });
    act.appendChild(ok); box.appendChild(act); back.appendChild(box); document.body.appendChild(back); ok.focus();
  }

  function listPicKeys(db) {
    var keys = [];
    ((db && db.tables) || []).forEach(function (t) {
      (t.fields || []).forEach(function (f) {
        if (f.type !== "picture") return;
        (t.rows || []).forEach(function (r) {
          var v = r.v && r.v[f.id];
          if (v && keys.indexOf(v) < 0) keys.push(v);
        });
      });
    });
    return keys;
  }
  function pack(db, pics) {
    return {
      magic: MAGIC, version: VERSION,
      schema: (db && db.schema) || (typeof BaseStore !== "undefined" ? BaseStore.SCHEMA : 8),
      exported: new Date().toISOString(),
      db: db ? copy(db) : { schema: 8, tables: [], current: null, queries: [], reports: [], views: [] },
      pics: pics && typeof pics === "object" ? pics : {}
    };
  }
  function parse(raw) {
    var obj = raw;
    if (typeof raw === "string") {
      try { obj = JSON.parse(raw); } catch (e) { return { ok: false, error: "That file is not valid JSON." }; }
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, error: "That is not a Base backup." };
    if (obj.magic !== MAGIC) return { ok: false, error: "That file is not a .hbase backup (missing “hbase” marker)." };
    if (!obj.db || typeof obj.db !== "object" || !Array.isArray(obj.db.tables)) {
      return { ok: false, error: "That backup has no tables list." };
    }
    var pics = obj.pics && typeof obj.pics === "object" && !Array.isArray(obj.pics) ? obj.pics : {};
    return { ok: true, pack: { magic: MAGIC, version: obj.version || 1, schema: obj.schema, exported: obj.exported, db: obj.db, pics: pics } };
  }
  function uniqueName(name, used) {
    var base = String(name || "Table").trim() || "Table", n = base, i = 2;
    while (used.indexOf(n) >= 0) n = base + " " + i++;
    used.push(n);
    return n;
  }
  /* New ids for every table, row, picture and saved query/report/view, so a copy
     can sit next to the current database. Link-to-record values are remapped. */
  function remapCopy(src, usedNames, idFn) {
    idFn = idFn || uid;
    usedNames = (usedNames || []).slice();
    var srcDb = src.db || src, srcPics = src.pics || {};
    var db = copy(srcDb), tableId = {}, rowId = {}, picKey = {};
    (db.tables || []).forEach(function (t) {
      var old = t.id;
      t.id = idFn();
      tableId[old] = t.id;
      t.name = uniqueName(t.name, usedNames);
      (t.rows || []).forEach(function (r) { var o = r.id; r.id = idFn(); rowId[o] = r.id; });
    });
    (db.tables || []).forEach(function (t) {
      (t.fields || []).forEach(function (f) {
        if (f.type === "ref" && f.to && tableId[f.to]) f.to = tableId[f.to];
        (t.rows || []).forEach(function (r) {
          if (!r.v) return;
          if (f.type === "ref") {
            var v = r.v[f.id];
            if (Array.isArray(v)) r.v[f.id] = v.map(function (id) { return rowId[id] || id; });
            else if (v) r.v[f.id] = rowId[v] || v;
          }
          if (f.type === "picture" && r.v[f.id]) {
            var k = r.v[f.id];
            if (!picKey[k]) picKey[k] = "pic_" + idFn();
            r.v[f.id] = picKey[k];
          }
        });
      });
    });
    ["queries", "reports", "views"].forEach(function (key) {
      (db[key] || []).forEach(function (x) {
        x.id = idFn();
        if (x.table && tableId[x.table]) x.table = tableId[x.table];
      });
    });
    db.current = db.tables[0] ? db.tables[0].id : null;
    var pics = {};
    Object.keys(srcPics).forEach(function (k) { pics[picKey[k] || k] = srcPics[k]; });
    return { db: db, pics: pics, tableId: tableId, rowId: rowId, picKey: picKey };
  }

  function guess(vals) { return typeof BaseCsv !== "undefined" ? BaseCsv.guess(vals) : "text"; }
  function cast(v, type) { return typeof BaseCsv !== "undefined" ? BaseCsv.cast(v, type) : v; }
  function capRows(rows, extra) {
    if ((rows || []).length <= CAPS.rows) return { rows: rows || [], cut: 0 };
    var cut = rows.length - CAPS.rows;
    extra.cutRows = (extra.cutRows || 0) + cut;
    return { rows: rows.slice(0, CAPS.rows), cut: cut };
  }
  /* Array-of-arrays (first row = headers) → a table spec for BaseStore.newTable. */
  function tablesFromAoA(sheets) {
    var out = [], notes = { cutRows: 0, cutSheets: 0 };
    (sheets || []).forEach(function (sh, i) {
      if (out.length >= CAPS.tables) { notes.cutSheets++; return; }
      var rows = (sh && sh.rows) || [];
      if (!rows.length) return;
      var head = rows[0].map(function (h, hi) { return String(h == null ? "" : h).trim() || "Field " + (hi + 1); });
      var body = capRows(rows.slice(1), notes).rows;
      var n = head.length, fields = head.map(function (h, hi) {
        return [h, guess(body.map(function (r) { return String(r[hi] == null ? "" : r[hi]); }))];
      });
      var data = body.map(function (r) {
        var o = []; for (var c = 0; c < n; c++) o.push(cast(r[c] == null ? "" : r[c], fields[c][1])); return o;
      });
      out.push({ name: (sh.name || "Sheet " + (i + 1)).trim() || "Sheet", fields: fields, rows: data });
    });
    return { tables: out, notes: notes };
  }
  /* Flexible JSON → table specs. Does not treat a .hbase pack as a loose table list. */
  function tablesFromJson(obj) {
    if (obj && obj.magic === MAGIC) return { tables: [], notes: { hbase: true } };
    if (typeof obj === "string") {
      try { obj = JSON.parse(obj); } catch (e) { return { tables: [], error: "That file is not valid JSON." }; }
    }
    if (obj == null) return { tables: [], error: "That JSON is empty." };
    var sheets = [], notes = { cutRows: 0, cutSheets: 0 };
    function fromObjects(name, arr) {
      if (!Array.isArray(arr) || !arr.length) return;
      if (sheets.length >= CAPS.tables) { notes.cutSheets++; return; }
      var keys = [], seen = {};
      arr.forEach(function (row) {
        if (!row || typeof row !== "object" || Array.isArray(row)) return;
        Object.keys(row).forEach(function (k) { if (!seen[k]) { seen[k] = 1; keys.push(k); } });
      });
      if (!keys.length) keys = ["Value"];
      var sliced = capRows(arr, notes).rows;
      var rows = [keys].concat(sliced.map(function (row) {
        if (row && typeof row === "object" && !Array.isArray(row)) return keys.map(function (k) { return row[k] == null ? "" : row[k]; });
        return [row == null ? "" : row];
      }));
      sheets.push({ name: name || "Table", rows: rows });
    }
    if (Array.isArray(obj)) {
      if (!obj.length) return { tables: [], error: "That JSON array is empty." };
      if (obj[0] && typeof obj[0] === "object" && !Array.isArray(obj[0])) fromObjects("Table", obj);
      else if (Array.isArray(obj[0])) sheets.push({ name: "Table", rows: obj });
      else fromObjects("Table", obj.map(function (v) { return { Value: v }; }));
    } else if (Array.isArray(obj.tables)) {
      obj.tables.forEach(function (t, i) {
        var name = (t && t.name) || ("Table " + (i + 1));
        if (t && Array.isArray(t.rows) && t.rows[0] && t.rows[0].v && Array.isArray(t.fields)) {
          var keys = t.fields.map(function (f) { return f.name || f.id; });
          var aoa = [keys].concat(t.rows.map(function (r) {
            return t.fields.map(function (f) { return r.v && r.v[f.id] != null ? r.v[f.id] : ""; });
          }));
          var sliced = capRows(aoa.slice(1), notes);
          sheets.push({ name: name, rows: [keys].concat(sliced.rows) });
        } else if (t && Array.isArray(t.rows) && Array.isArray(t.rows[0])) {
          sheets.push({ name: name, rows: t.rows });
        } else if (t && Array.isArray(t.rows)) fromObjects(name, t.rows);
        else if (Array.isArray(t)) fromObjects(name, t);
      });
    } else if (Array.isArray(obj.rows)) {
      fromObjects(obj.name || "Table", obj.rows);
    } else {
      Object.keys(obj).forEach(function (k) {
        if (Array.isArray(obj[k])) fromObjects(k, obj[k]);
      });
    }
    var built = tablesFromAoA(sheets);
    built.notes.cutRows += notes.cutRows;
    built.notes.cutSheets += notes.cutSheets;
    if (!built.tables.length && !built.error) built.error = "No table data was found in that JSON.";
    return built;
  }
  /* sql.js exec shape: { columns: [...], values: [[...]] } per table. */
  function tablesFromSql(list) {
    var sheets = [];
    (list || []).forEach(function (t) {
      var cols = t.columns || [];
      var values = t.values || [];
      sheets.push({ name: t.name || "Table", rows: [cols].concat(values) });
    });
    return tablesFromAoA(sheets);
  }

  function cellText(t, f, row) {
    var v = row.v ? row.v[f.id] : "";
    if (f.type === "picture") return "";
    if (f.type === "currency") return (v === "" || v == null || isNaN(+v)) ? "" : +v;
    if (f.type === "bool") return v ? "Yes" : "No";
    if (f.type === "ref" && typeof BaseLinks !== "undefined") return BaseLinks.displayText(f, v) || "";
    if (f.type === "lookup" && typeof BaseLinks !== "undefined") return BaseLinks.lookupText(t, f, row) || "";
    return v == null ? "" : v;
  }
  function sheetAoA(t, rows) {
    var fields = (t.fields || []).filter(function (f) { return f.type !== "picture"; });
    var aoa = [fields.map(function (f) { return f.name; })];
    (rows || []).forEach(function (r) { aoa.push(fields.map(function (f) { return cellText(t, f, r); })); });
    return { aoa: aoa, skippedPics: (t.fields || []).length - fields.length, fields: fields };
  }

  /* ---- I/O (DOM / IndexedDB) ---- */
  function downloadBlob(blob, name) {
    var a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function loadScript(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { ok(); };
      s.onerror = function () { fail(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }
  function loadXlsx() {
    if (typeof XLSX !== "undefined") return Promise.resolve(XLSX);
    if (xlsxLoading) return xlsxLoading;
    xlsxLoading = loadScript(XLSX_SRC).then(function () {
      if (typeof XLSX === "undefined") throw new Error("SheetJS did not start");
      return XLSX;
    }).catch(function (e) { xlsxLoading = null; throw e; });
    return xlsxLoading;
  }
  function loadSql() {
    if (typeof initSqlJs === "function" && loadSql._mod) return Promise.resolve(loadSql._mod);
    if (sqlLoading) return sqlLoading;
    sqlLoading = loadScript(SQL_DIR + "sql-wasm.js").then(function () {
      if (typeof initSqlJs !== "function") throw new Error("sql.js did not start");
      return initSqlJs({ locateFile: function (f) { return SQL_DIR + f; } });
    }).then(function (mod) { loadSql._mod = mod; return mod; })
      .catch(function (e) { sqlLoading = null; throw e; });
    return sqlLoading;
  }

  function stampName() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function currentRows(t) {
    return (typeof BaseGrid !== "undefined") ? BaseGrid.visibleRows(t, true) : (t.rows || []).slice();
  }

  function backup() {
    var db = typeof BASE !== "undefined" ? BASE.db : null;
    if (!db || !db.tables || !db.tables.length) return toast("Nothing to back up yet — make a table first");
    function done(pics) {
      var body = JSON.stringify(pack(db, pics || {}));
      downloadBlob(new Blob([body], { type: "application/json" }), "base-backup-" + stampName() + ".hbase");
      var n = Object.keys(pics || {}).length;
      toast("Backup saved" + (n ? " (with " + n + " picture" + (n === 1 ? "" : "s") + ")" : ""));
    }
    if (typeof BasePics !== "undefined" && BasePics.exportAll) BasePics.exportAll(done);
    else done({});
  }

  function applyTables(built, label) {
    if (built.error) return toast(built.error);
    if (!built.tables || !built.tables.length) return toast("No rows to import");
    try { if (typeof BaseHistory !== "undefined") BaseHistory.push(label || "Import"); } catch (e) {}
    var first = null, names = [];
    built.tables.forEach(function (spec) {
      var t = BaseStore.newTable(BaseUI ? (function () {
        /* uniqueName is local in BaseUI — fall back here */
        var n = spec.name, base = n, i = 2;
        while (BASE.db.tables.some(function (x) { return x.name === n; })) n = base + " " + i++;
        return n;
      })() : spec.name, spec.fields, spec.rows);
      if (!first) first = t;
      names.push(t.name);
    });
    BASE.sort = null; BASE.selRow = null; BASE.view = "grid";
    if (typeof BaseUI !== "undefined") BaseUI.render();
    var msg = "Imported " + names.length + " table" + (names.length === 1 ? "" : "s") + " (“" + names.slice(0, 3).join("”, “") + (names.length > 3 ? "”…" : "”") + ")";
    if (built.notes && built.notes.cutRows) msg += ". Stopped at " + CAPS.rows + " rows per table.";
    if (built.notes && built.notes.cutSheets) msg += " Extra sheets were skipped.";
    toast(msg, 5000);
    return first;
  }

  function restoreReplace(pk) {
    var repaired = (typeof BaseStore !== "undefined") ? BaseStore.repair(pk.db) : { db: pk.db };
    try { if (typeof BaseHistory !== "undefined") BaseHistory.clear(); } catch (e) {}
    function finish() {
      BASE.db = repaired.db;
      if (!BASE.db.schema && typeof BaseStore !== "undefined") BASE.db.schema = BaseStore.SCHEMA;
      BASE.query = null; BASE.report = null; BASE.sort = null; BASE.selRow = null; BASE.formIndex = 0; BASE.search = ""; BASE.view = "grid";
      var inp = document.getElementById("search"); if (inp) inp.value = "";
      if (typeof BaseStore !== "undefined") BaseStore.saveNow();
      if (typeof BaseUI !== "undefined") BaseUI.render();
      toast("Backup restored — your previous data was replaced");
    }
    if (typeof BasePics !== "undefined" && BasePics.clearAll) {
      BasePics.clearAll(function () {
        if (BasePics.importAll) BasePics.importAll(pk.pics || {}, finish);
        else finish();
      });
    } else finish();
  }
  function restoreCopy(pk) {
    var used = (BASE.db.tables || []).map(function (t) { return t.name; });
    var mapped = remapCopy(pk, used, uid);
    try { if (typeof BaseHistory !== "undefined") BaseHistory.push("Restore backup (copy)"); } catch (e) {}
    (mapped.db.tables || []).forEach(function (t) { BASE.db.tables.push(t); });
    ["queries", "reports", "views"].forEach(function (k) {
      if (!BASE.db[k]) BASE.db[k] = [];
      (mapped.db[k] || []).forEach(function (x) { BASE.db[k].push(x); });
    });
    if (mapped.db.tables[0]) BASE.db.current = mapped.db.tables[0].id;
    BASE.query = null; BASE.report = null; BASE.sort = null; BASE.selRow = null; BASE.view = "grid";
    function finish() {
      if (typeof BaseStore !== "undefined") BaseStore.save();
      if (typeof BaseUI !== "undefined") BaseUI.render();
      toast("Backup added as a copy (“" + (mapped.db.tables[0] && mapped.db.tables[0].name || "tables") + "”)");
    }
    if (typeof BasePics !== "undefined" && BasePics.importAll) BasePics.importAll(mapped.pics || {}, finish);
    else finish();
  }
  function restoreDialog(pk) {
    var n = (pk.db.tables || []).length, pics = Object.keys(pk.pics || {}).length;
    var back = el("div", "dlg-backdrop base-v-back");
    var box = el("div", "dlg base-v-dlg"); box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    box.appendChild(el("div", "dlg-title", "Restore backup?"));
    var msg = el("div", "dlg-message");
    msg.textContent = "This backup has " + n + " table" + (n === 1 ? "" : "s") +
      (pics ? " and " + pics + " picture" + (pics === 1 ? "" : "s") : "") +
      ". You can replace everything in Base, or add the backup as a copy next to what you already have.";
    box.appendChild(msg);
    var act = el("div", "dlg-actions");
    function btn(lab, cls, fn) { var b = el("button", "dlg-btn " + cls, lab); b.type = "button"; b.addEventListener("click", fn); act.appendChild(b); return b; }
    btn("Cancel", "", function () { back.remove(); });
    btn("Add as a copy", "dlg-ok", function () { back.remove(); restoreCopy(pk); });
    var rep = btn("Replace everything", "dlg-ok dlg-danger", function () {
      back.remove();
      OfficeDialog.confirm({
        title: "Replace everything?",
        message: "This deletes your current tables, queries, reports, views and pictures, then loads the backup. This cannot be undone.",
        okLabel: "Replace", danger: true
      }).then(function (ok) { if (ok) restoreReplace(pk); });
    });
    box.appendChild(act); back.appendChild(box); document.body.appendChild(back); rep.focus();
  }
  function restoreFile(file) {
    var rd = new FileReader();
    rd.onload = function () {
      var res = parse(String(rd.result || ""));
      if (!res.ok) return toast(res.error);
      restoreDialog(res.pack);
    };
    rd.onerror = function () { toast("Could not read that file"); };
    rd.readAsText(file);
  }

  function importXlsx(file) {
    toast("Opening " + file.name + "…");
    Promise.all([loadXlsx(), file.arrayBuffer()]).then(function (res) {
      var X = res[0], wb = X.read(res[1], { type: "array" });
      var sheets = (wb.SheetNames || []).map(function (name) {
        var ws = wb.Sheets[name];
        var rows = X.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
        return { name: name, rows: rows };
      });
      applyTables(tablesFromAoA(sheets), "Import Excel");
    }).catch(function (e) { toast("Could not open the workbook: " + (e && e.message || e)); });
  }
  function importJson(file) {
    var rd = new FileReader();
    rd.onload = function () {
      var text = String(rd.result || ""), obj;
      try { obj = JSON.parse(text); } catch (e) { return toast("That file is not valid JSON."); }
      if (obj && obj.magic === MAGIC) {
        var res = parse(obj);
        if (!res.ok) return toast(res.error);
        return restoreDialog(res.pack);
      }
      applyTables(tablesFromJson(obj), "Import JSON");
    };
    rd.onerror = function () { toast("Could not read that file"); };
    rd.readAsText(file);
  }
  function importSqlite(file) {
    toast("Opening " + file.name + "…");
    Promise.all([loadSql(), file.arrayBuffer()]).then(function (res) {
      var SQL = res[0], db = new SQL.Database(new Uint8Array(res[1]));
      var names = [];
      try {
        var master = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
        if (master[0] && master[0].values) names = master[0].values.map(function (r) { return String(r[0]); });
      } catch (e) { db.close(); throw e; }
      var list = [];
      names.forEach(function (name) {
        if (list.length >= CAPS.tables) return;
        try {
          var q = db.exec("SELECT * FROM \"" + String(name).replace(/"/g, '""') + "\" LIMIT " + (CAPS.rows + 1));
          if (!q[0]) return;
          list.push({ name: name, columns: q[0].columns, values: q[0].values });
        } catch (e) {}
      });
      db.close();
      var built = tablesFromSql(list);
      if (names.length > CAPS.tables) built.notes.cutSheets = names.length - CAPS.tables;
      names.forEach(function () {});
      /* mark row cap if any table had more than CAPS.rows (we asked for +1) */
      list.forEach(function (t) { if ((t.values || []).length > CAPS.rows) { t.values = t.values.slice(0, CAPS.rows); built.notes.cutRows += 1; } });
      applyTables(built, "Import SQLite");
    }).catch(function () {
      toast("SQLite could not be opened. sql.js is loaded from the DB Browser app in this site; serve the whole site (not a lone file:// page) and try again. JSON and .hbase still work.", 6000);
    });
  }

  function looksSqlite(file, buf) {
    var n = (file && file.name || "").toLowerCase();
    if (/\.(sqlite3?|db)$/.test(n)) return true;
    if (!buf || buf.byteLength < 16) return false;
    var s = ""; try { s = String.fromCharCode.apply(null, new Uint8Array(buf, 0, 16)); } catch (e) { return false; }
    return s.indexOf("SQLite format 3") === 0;
  }
  function open(file) {
    if (!file) return;
    var n = (file.name || "").toLowerCase();
    if (/\.hbase$/.test(n)) return restoreFile(file);
    if (/\.xlsx?$/.test(n)) return importXlsx(file);
    if (/\.json$/.test(n)) return importJson(file);
    if (/\.(sqlite3?|db)$/.test(n)) return importSqlite(file);
    if (/\.(csv|tsv|txt)$/.test(n) || /text\//.test(file.type || "")) {
      var rd = new FileReader();
      rd.onload = function () {
        try { if (typeof BaseHistory !== "undefined") BaseHistory.push("Import CSV"); } catch (e) {}
        var t = BaseCsv.importText((typeof BaseUI !== "undefined" ? (function (name) {
          var n = name, base = n, i = 2;
          while (BASE.db.tables.some(function (x) { return x.name === n; })) n = base + " " + i++;
          return n;
        })(file.name.replace(/\.[^.]+$/, "")) : file.name.replace(/\.[^.]+$/, "")), String(rd.result));
        if (!t) return toast("That CSV is empty");
        BASE.sort = null; if (typeof BaseUI !== "undefined") BaseUI.render();
        toast("Imported " + t.rows.length + " records");
      };
      return rd.readAsText(file);
    }
    /* Peek at the first bytes for JSON / sqlite / hbase without an extension. */
    var peek = file.slice(0, 32);
    var fr = new FileReader();
    fr.onload = function () {
      var buf = fr.result, head = "";
      try { head = String.fromCharCode.apply(null, new Uint8Array(buf)); } catch (e) {}
      if (looksSqlite(file, buf)) return importSqlite(file);
      if (/^\s*\{/.test(head) || /^\s*\[/.test(head)) return importJson(file);
      toast("This file type is not supported. Try .hbase, .xlsx, .csv, .json or .sqlite.");
    };
    fr.readAsArrayBuffer(peek);
  }

  function workbookFromView(X, t) {
    var built = sheetAoA(t, currentRows(t));
    var wb = X.utils.book_new();
    var ws = X.utils.aoa_to_sheet(built.aoa);
    var name = String(t.name || "Sheet").replace(/[\\/?*\[\]]/g, " ").slice(0, 31) || "Sheet";
    X.utils.book_append_sheet(wb, ws, name);
    return { wb: wb, skippedPics: built.skippedPics, rows: built.aoa.length - 1, name: name };
  }
  function writeXlsx(X, wb, filename) {
    var out = X.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
  }
  function exportXlsx() {
    var t = typeof BaseStore !== "undefined" && BaseStore.table();
    if (!t) return toast("Make a table first");
    loadXlsx().then(function (X) {
      var built = workbookFromView(X, t);
      writeXlsx(X, built.wb, (t.name || "table") + ".xlsx");
      toast("Excel file saved" + (built.skippedPics ? " (picture columns left out)" : "") + " — " + built.rows + " rows");
    }).catch(function () { toast("Excel export needs SheetJS from the Spreadsheet app. A CSV will be saved instead."); BaseCsv.exportTable(t); });
  }
  function sendToSpreadsheet() {
    var t = typeof BaseStore !== "undefined" && BaseStore.table();
    if (!t) return toast("Make a table first");
    loadXlsx().then(function (X) {
      var built = workbookFromView(X, t);
      var fname = (t.name || "table") + ".xlsx";
      writeXlsx(X, built.wb, fname);
      note("Sent as a workbook",
        "Spreadsheet does not take a hand-off from other Office apps — it only opens a file you choose. A workbook of the current view (“" + built.name + "”, " + built.rows + " row" + (built.rows === 1 ? "" : "s") + ") was saved as " + fname + ". In Spreadsheet, use File > Open to load it." + (built.skippedPics ? " Picture columns were left out." : ""));
    }).catch(function () {
      BaseCsv.exportTable(t);
      note("Sent as CSV",
        "SheetJS (from the Spreadsheet app) could not be loaded, so a CSV of the current view was saved instead. In Spreadsheet, use File > Open to load it. There is no in-app hand-off.");
    });
  }
  function pickRestore() {
    var inp = document.getElementById("file-restore");
    if (inp) inp.click();
  }

  var api = {
    MAGIC: MAGIC, VERSION: VERSION, CAPS: CAPS, XLSX_SRC: XLSX_SRC, SQL_DIR: SQL_DIR,
    pack: pack, parse: parse, remapCopy: remapCopy, listPicKeys: listPicKeys, uniqueName: uniqueName,
    tablesFromJson: tablesFromJson, tablesFromAoA: tablesFromAoA, tablesFromSql: tablesFromSql,
    sheetAoA: sheetAoA, cellText: cellText,
    backup: backup, restoreFile: restoreFile, pickRestore: pickRestore, open: open,
    exportXlsx: exportXlsx, sendToSpreadsheet: sendToSpreadsheet, loadXlsx: loadXlsx
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BaseFiles = api;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
