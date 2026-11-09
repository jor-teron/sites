/* DB Browser — db_engine.js: load sql.js, open/create DB, list tables, paged SELECT, export. DB1+DB2 */
(function (root) {
  'use strict';

  var H = root.DBHelpers;
  var SQL = null;
  var db = null;
  var modified = false;
  var openedName = '';
  var openedSize = 0;
  var engineP = null;

  function loadScript(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { ok(); };
      s.onerror = function () { no(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function ensureEngine() {
    if (SQL) return Promise.resolve(SQL);
    if (engineP) return engineP;
    engineP = loadScript('vendor/sqljs/sql-wasm.js').then(function () {
      if (typeof initSqlJs !== 'function') throw new Error('sql.js failed to load');
      return initSqlJs({
        locateFile: function (file) { return 'vendor/sqljs/' + file; }
      });
    }).then(function (mod) {
      SQL = mod;
      return SQL;
    }).catch(function (err) {
      engineP = null;
      throw err;
    });
    return engineP;
  }

  function closeDb() {
    if (db) {
      try { db.close(); } catch (e) { /* ignore */ }
    }
    db = null;
    modified = false;
    openedName = '';
    openedSize = 0;
  }

  function markModified() {
    modified = true;
  }

  function isModified() {
    return modified;
  }

  function getOpenedName() {
    return openedName;
  }

  function getOpenedSize() {
    return openedSize;
  }

  function hasDb() {
    return !!db;
  }

  async function openBytes(u8, name, size) {
    await ensureEngine();
    closeDb();
    var bytes = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
    db = new SQL.Database(bytes);
    // Sanity check
    db.exec('SELECT 1 FROM sqlite_master LIMIT 1');
    openedName = name || 'database.db';
    openedSize = size != null ? size : bytes.length;
    modified = false;
    return { name: openedName, size: openedSize };
  }

  async function openFile(file) {
    if (!file) throw new Error('No file');
    var buf = await file.arrayBuffer();
    return openBytes(new Uint8Array(buf), file.name, file.size);
  }

  async function newEmpty(name) {
    await ensureEngine();
    closeDb();
    db = new SQL.Database();
    openedName = name || 'untitled.db';
    openedSize = 0;
    modified = false;
    return { name: openedName, size: 0 };
  }

  function listObjects() {
    if (!db) return [];
    var rows = db.exec(
      "SELECT name, type FROM sqlite_master " +
      "WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' " +
      "ORDER BY type DESC, name COLLATE NOCASE"
    );
    if (!rows.length) return [];
    var out = [];
    var values = rows[0].values || [];
    for (var i = 0; i < values.length; i++) {
      var name = values[i][0];
      var type = values[i][1];
      var count = 0;
      if (type === 'table') {
        try {
          var cr = db.exec('SELECT COUNT(*) FROM ' + H.quoteIdent(name));
          count = cr.length ? cr[0].values[0][0] : 0;
        } catch (e) {
          count = -1;
        }
      } else {
        try {
          var vr = db.exec('SELECT COUNT(*) FROM ' + H.quoteIdent(name));
          count = vr.length ? vr[0].values[0][0] : 0;
        } catch (e) {
          count = -1;
        }
      }
      out.push({ name: name, type: type, count: count });
    }
    return out;
  }

  function getSchema(name) {
    if (!db || !name) return '';
    var rows = db.exec(
      "SELECT sql FROM sqlite_master WHERE name = " +
      "'" + String(name).replace(/'/g, "''") + "' LIMIT 1"
    );
    if (!rows.length || !rows[0].values.length) return '';
    return rows[0].values[0][0] || '';
  }

  function getColumns(name) {
    if (!db || !name) return [];
    try {
      var rows = db.exec('PRAGMA table_info(' + H.quoteIdent(name) + ')');
      if (!rows.length) return [];
      // cid, name, type, notnull, dflt_value, pk
      return (rows[0].values || []).map(function (r) {
        return { name: r[1], type: r[2] || '', notnull: !!r[3], pk: !!r[5] };
      });
    } catch (e) {
      return [];
    }
  }

  /**
   * Fetch one page of rows from a table/view.
   * sortCol / sortDir optional ('ASC'|'DESC').
   */
  function fetchTablePage(name, page, pageSize, sortCol, sortDir) {
    if (!db || !name) {
      return { columns: [], rows: [], info: H.pageInfo(0, 1, pageSize) };
    }
    var total = 0;
    try {
      var cr = db.exec('SELECT COUNT(*) FROM ' + H.quoteIdent(name));
      total = cr.length ? Number(cr[0].values[0][0]) || 0 : 0;
    } catch (e) {
      throw e;
    }
    var info = H.pageInfo(total, page, pageSize || H.PAGE_SIZE);
    var order = '';
    if (sortCol) {
      var dir = String(sortDir || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      order = ' ORDER BY ' + H.quoteIdent(sortCol) + ' ' + dir;
    }
    var sql =
      'SELECT * FROM ' + H.quoteIdent(name) + order +
      ' LIMIT ' + info.pageSize + ' OFFSET ' + info.offset;
    var result = db.exec(sql);
    if (!result.length) {
      // Empty table: still want column names
      var cols = getColumns(name).map(function (c) { return c.name; });
      return { columns: cols, rows: [], info: info };
    }
    return {
      columns: result[0].columns || [],
      rows: result[0].values || [],
      info: info
    };
  }

  /**
   * Run one or more SQL statements. Returns { results, changed, error }.
   * Each SELECT result is capped at QUERY_ROW_CAP (+ truncated flag).
   */
  function runSql(sqlText) {
    if (!db) throw new Error('No database open');
    var text = String(sqlText || '');
    var results = [];
    var changed = false;
    var stmts;
    try {
      stmts = db.iterateStatements(text);
    } catch (err) {
      return { results: [], changed: false, error: err };
    }
    try {
      var step;
      while (!(step = stmts.next()).done) {
        var stmt = step.value;
        var cols = stmt.getColumnNames();
        var rows = [];
        var truncated = false;
        var isSelect = cols && cols.length > 0;
        if (isSelect) {
          while (stmt.step()) {
            if (rows.length >= H.QUERY_ROW_CAP) {
              truncated = true;
              break;
            }
            rows.push(stmt.get());
          }
          results.push({
            kind: 'select',
            columns: cols,
            rows: rows,
            truncated: truncated,
            totalShown: rows.length
          });
        } else {
          // Non-SELECT: still need to step once for side effects
          try { stmt.step(); } catch (e) { /* some statements finish without a row */ }
          var changes = db.getRowsModified();
          results.push({
            kind: 'exec',
            sql: stmt.getSQL ? stmt.getSQL() : '',
            changes: changes
          });
          if (changes !== 0) changed = true;
          // DDL also counts as modified even if getRowsModified is 0
          var lead = String(stmt.getSQL ? stmt.getSQL() : text).replace(/^\s+/, '').slice(0, 12).toUpperCase();
          if (/^(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE|REPLACE|ATTACH|DETACH)/.test(lead)) {
            changed = true;
          }
        }
        stmt.free();
      }
    } catch (err) {
      try { if (stmts && stmts.free) stmts.free(); } catch (e) { /* ignore */ }
      return { results: results, changed: changed, error: err };
    }
    if (changed) markModified();
    return { results: results, changed: changed, error: null };
  }

  function exportBytes() {
    if (!db) throw new Error('No database open');
    return db.export();
  }

  /** Fetch all rows for CSV export of a table (capped). */
  function fetchAllForCsv(name, cap) {
    if (!db || !name) return { columns: [], rows: [], truncated: false };
    var limit = Number(cap) > 0 ? Math.floor(Number(cap)) : 100000;
    var sql = 'SELECT * FROM ' + H.quoteIdent(name) + ' LIMIT ' + (limit + 1);
    var result = db.exec(sql);
    if (!result.length) {
      return { columns: getColumns(name).map(function (c) { return c.name; }), rows: [], truncated: false };
    }
    var rows = result[0].values || [];
    var truncated = rows.length > limit;
    if (truncated) rows = rows.slice(0, limit);
    return { columns: result[0].columns || [], rows: rows, truncated: truncated };
  }

  root.DBEngine = {
    ensureEngine: ensureEngine,
    openFile: openFile,
    openBytes: openBytes,
    newEmpty: newEmpty,
    closeDb: closeDb,
    hasDb: hasDb,
    isModified: isModified,
    markModified: markModified,
    getOpenedName: getOpenedName,
    getOpenedSize: getOpenedSize,
    listObjects: listObjects,
    getSchema: getSchema,
    getColumns: getColumns,
    fetchTablePage: fetchTablePage,
    runSql: runSql,
    exportBytes: exportBytes,
    fetchAllForCsv: fetchAllForCsv
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
