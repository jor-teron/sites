/* DB Browser — db_helpers.js: size format, CSV quoting, SQL identifiers, paging, file-size warn. DB1+DB2 */
(function (root) {
  'use strict';

  var PAGE_SIZE = 50;
  var QUERY_ROW_CAP = 1000;
  var SIZE_WARN_BYTES = 100 * 1024 * 1024; // ~100 MB — whole DB loads into memory
  var HISTORY_KEY = 'dbBrowser.queryHistory';
  var HISTORY_MAX = 20;

  function trim(s) {
    return String(s == null ? '' : s).trim();
  }

  function formatBytes(n) {
    var v = Number(n);
    if (!isFinite(v) || v < 0) v = 0;
    if (v < 1024) return Math.round(v) + ' B';
    var u = ['KB', 'MB', 'GB', 'TB'];
    var i = -1;
    do {
      v /= 1024;
      i++;
    } while (v >= 1024 && i < u.length - 1);
    var digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    return v.toFixed(digits) + ' ' + u[i];
  }

  /** Quote a SQL identifier with double quotes (SQLite style). */
  function quoteIdent(name) {
    return '"' + String(name == null ? '' : name).replace(/"/g, '""') + '"';
  }

  /** CSV cell: quote when needed; double internal quotes. */
  function csvCell(val) {
    if (val == null) return '';
    var s = String(val);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function rowsToCsv(columns, rows) {
    var cols = Array.isArray(columns) ? columns : [];
    var data = Array.isArray(rows) ? rows : [];
    var lines = [];
    lines.push(cols.map(csvCell).join(','));
    for (var i = 0; i < data.length; i++) {
      var row = data[i] || [];
      var cells = [];
      for (var c = 0; c < cols.length; c++) cells.push(csvCell(row[c]));
      lines.push(cells.join(','));
    }
    return lines.join('\r\n') + (lines.length ? '\r\n' : '');
  }

  /**
   * Paging math. page is 1-based.
   * Returns { page, pageSize, totalRows, totalPages, offset, from, to }.
   */
  function pageInfo(totalRows, page, pageSize) {
    var size = Number(pageSize) > 0 ? Math.floor(Number(pageSize)) : PAGE_SIZE;
    var total = Math.max(0, Math.floor(Number(totalRows) || 0));
    var pages = total === 0 ? 1 : Math.ceil(total / size);
    var p = Math.floor(Number(page) || 1);
    if (p < 1) p = 1;
    if (p > pages) p = pages;
    var offset = (p - 1) * size;
    var from = total === 0 ? 0 : offset + 1;
    var to = Math.min(offset + size, total);
    return {
      page: p,
      pageSize: size,
      totalRows: total,
      totalPages: pages,
      offset: offset,
      from: from,
      to: to
    };
  }

  function shouldWarnFileSize(bytes) {
    return Number(bytes) > SIZE_WARN_BYTES;
  }

  function isDbFileName(name) {
    return /\.(db|sqlite|sqlite3)$/i.test(String(name || ''));
  }

  function ensureDbExt(name) {
    var s = trim(name) || 'database.db';
    if (!/\.(db|sqlite|sqlite3)$/i.test(s)) s += '.db';
    return s;
  }

  function suggestSaveName(openedName) {
    var base = trim(openedName) || 'database.db';
    base = base.replace(/\\/g, '/').split('/').pop() || 'database.db';
    if (!/\.(db|sqlite|sqlite3)$/i.test(base)) base += '.db';
    var dot = base.lastIndexOf('.');
    var stem = dot > 0 ? base.slice(0, dot) : base;
    var ext = dot > 0 ? base.slice(dot) : '.db';
    return stem + '-copy' + ext;
  }

  function loadQueryHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(function (x) { return typeof x === 'string' && x.trim(); }).slice(0, HISTORY_MAX) : [];
    } catch (e) {
      return [];
    }
  }

  function pushQueryHistory(sql) {
    var s = trim(sql);
    if (!s) return loadQueryHistory();
    var list = loadQueryHistory().filter(function (x) { return x !== s; });
    list.unshift(s);
    if (list.length > HISTORY_MAX) list = list.slice(0, HISTORY_MAX);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
    return list;
  }

  /** Friendly SQLite error message. */
  function friendlySqlError(err) {
    var msg = String((err && (err.message || err)) || 'Unknown error');
    var m;
    if ((m = msg.match(/no such table:\s*(\S+)/i))) {
      return 'There is no table called “' + m[1] + '”. Check the spelling or pick one from the list.';
    }
    if ((m = msg.match(/no such column:\s*(\S+)/i))) {
      return 'There is no column called “' + m[1] + '”. Check the spelling.';
    }
    if ((m = msg.match(/near "(.*)":\s*syntax error/i))) {
      return 'SQL did not understand the code near “' + m[1] + '”. Look for a missing comma, bracket or quote.';
    }
    if (/incomplete input/i.test(msg)) {
      return 'The statement is not finished. Maybe a ) or a closing quote is missing.';
    }
    if ((m = msg.match(/UNIQUE constraint failed:\s*(\S+)/i))) {
      return m[1] + ' must be unique, and that value is already used.';
    }
    if ((m = msg.match(/table (\S+) already exists/i))) {
      return 'A table called ' + m[1] + ' already exists.';
    }
    return 'SQL could not do this: ' + msg;
  }

  var api = {
    PAGE_SIZE: PAGE_SIZE,
    QUERY_ROW_CAP: QUERY_ROW_CAP,
    SIZE_WARN_BYTES: SIZE_WARN_BYTES,
    HISTORY_KEY: HISTORY_KEY,
    HISTORY_MAX: HISTORY_MAX,
    trim: trim,
    formatBytes: formatBytes,
    quoteIdent: quoteIdent,
    csvCell: csvCell,
    rowsToCsv: rowsToCsv,
    pageInfo: pageInfo,
    shouldWarnFileSize: shouldWarnFileSize,
    isDbFileName: isDbFileName,
    ensureDbExt: ensureDbExt,
    suggestSaveName: suggestSaveName,
    loadQueryHistory: loadQueryHistory,
    pushQueryHistory: pushQueryHistory,
    friendlySqlError: friendlySqlError
  };

  root.DBHelpers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
