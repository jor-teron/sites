/* ============================================================
   FILE: modules/base_odb.js
   ROLE: BS11 LibreOffice Base (.odb) reader. Pure and DOM-free:
         given a zip file map (name → bytes or text), parse the
         embedded HSQLDB database/script and return tables and
         rows. Forms, queries, reports and macros are dropped.
         Unzipping is done by the caller (JSZip in base-files.js).
         Throws a typed OdbError with code firebird / external /
         encrypted / invalid.
   API:  BaseOdb.parse(files) → { tables, warnings }
         BaseOdb.acceptsName(name), .dropFile(list), .isOdb(file)
         BaseOdb.OdbError, .CODES, .MSG
   ============================================================ */
(function (root) {
  "use strict";

  var CODES = { firebird: "firebird", external: "external", encrypted: "encrypted", invalid: "invalid" };
  var MSG = {
    firebird: "This .odb uses the Firebird engine, which Base can't read yet. In LibreOffice, export each table to CSV (or migrate to HSQLDB) and import that.",
    external: "This .odb is linked to an external database, which Base can't open. In LibreOffice, export each table to CSV and import that.",
    encrypted: "This .odb is password protected, so Base can't open it.",
    invalid: "This is not a valid LibreOffice Base file (.odb)."
  };

  function OdbError(code, message) {
    var e = new Error(message || MSG[code] || MSG.invalid);
    e.name = "OdbError";
    e.code = code || CODES.invalid;
    e.userMessage = e.message;
    return e;
  }

  function nameOf(v) {
    var n = typeof v === "string" ? v : (v && v.name) || "";
    return String(n || "");
  }
  function acceptsName(name) { return /\.odb$/i.test(nameOf(name)); }
  function isOdb(f) {
    if (acceptsName(f)) return true;
    var t = String((f && f.type) || "").toLowerCase();
    return t.indexOf("opendocument.base") >= 0 || t.indexOf("opendocument.database") >= 0 || t.indexOf("sun.xml.base") >= 0;
  }
  function dropFile(list) {
    var files = !list ? [] : (list.files || list);
    var i, f;
    if (!files || typeof files.length !== "number") return null;
    for (i = 0; i < files.length; i++) {
      f = files[i];
      if (isOdb(f)) return f;
    }
    return null;
  }

  function normPath(n) {
    return String(n || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  }
  function fileNames(files) {
    return Object.keys(files || {}).map(normPath);
  }
  function getFile(files, want) {
    want = normPath(want).toLowerCase();
    var names = Object.keys(files || {}), i, n;
    for (i = 0; i < names.length; i++) {
      n = names[i];
      if (normPath(n).toLowerCase() === want) return files[n];
    }
    return null;
  }
  function hasPath(files, re) {
    return fileNames(files).some(function (n) { return re.test(n); });
  }
  function asText(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    var u8;
    if (typeof Buffer !== "undefined" && Buffer.isBuffer && Buffer.isBuffer(value)) return value.toString("utf8");
    if (value instanceof ArrayBuffer) u8 = new Uint8Array(value);
    else if (value && typeof value.byteLength === "number" && value.buffer) {
      try { u8 = new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength); }
      catch (e) { u8 = new Uint8Array(value); }
    } else if (Array.isArray(value)) u8 = new Uint8Array(value);
    else return String(value);
    if (typeof TextDecoder === "function") return new TextDecoder("utf-8").decode(u8);
    var s = "", i;
    for (i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return s;
  }
  function looksBinary(text) {
    if (text == null) return false;
    var s = String(text), n = Math.min(s.length, 4096), i, bad = 0;
    if (!n) return false;
    for (i = 0; i < n; i++) {
      var c = s.charCodeAt(i);
      if (c === 0) return true;
      if (c === 0xFFFD || (c < 9) || (c > 13 && c < 32)) bad++;
    }
    return bad / n > 0.1;
  }

  function isFirebird(files) {
    return hasPath(files, /(?:^|\/)database\/firebird/i) || hasPath(files, /(?:^|\/)database\/[^/]*\.(fbk|fdb)$/i);
  }
  function hasDatabaseFolder(files) {
    return hasPath(files, /^database(\/|$)/i);
  }
  function isEncrypted(files) {
    var props = getFile(files, "database/properties");
    if (props) {
      var t = asText(props);
      if (/hsqldb\.crypt_/i.test(t) || /^\s*crypt_key\s*=/im.test(t)) return true;
    }
    var man = getFile(files, "META-INF/manifest.xml");
    if (man && /encryption-data/i.test(asText(man))) return true;
    return false;
  }

  function mapType(raw) {
    var t = String(raw || "").replace(/\s+/g, " ").trim().toUpperCase();
    if (/^(INTEGER|INT|BIGINT|SMALLINT|TINYINT|NUMERIC|DECIMAL|DEC|DOUBLE|REAL|FLOAT|NUMBER)$/.test(t) || t === "DOUBLE PRECISION") return "number";
    if (/^(VARCHAR|CHAR|CHARACTER|LONGVARCHAR|VARCHAR_IGNORECASE|CLOB|LONG VARCHAR|CHARACTER VARYING|CHAR VARYING)$/.test(t)) return "text";
    if (/^(BOOLEAN|BOOL|BIT)$/.test(t)) return "bool";
    if (/^(DATE|TIME|TIMESTAMP|DATETIME)$/.test(t)) return "date";
    if (/^(BINARY|VARBINARY|LONGVARBINARY|BLOB|OTHER|OBJECT|LONG VARBINARY|BIT VARYING)$/.test(t)) return "binary";
    return "text";
  }

  function isSpace(c) { return c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f"; }

  function skipSpaceAndComments(s, i) {
    var n = s.length;
    while (i < n) {
      while (i < n && isSpace(s.charAt(i))) i++;
      if (s.charAt(i) === "-" && s.charAt(i + 1) === "-") {
        i += 2;
        while (i < n && s.charAt(i) !== "\n") i++;
        continue;
      }
      if (s.charAt(i) === "/" && s.charAt(i + 1) === "/") {
        i += 2;
        while (i < n && s.charAt(i) !== "\n") i++;
        continue;
      }
      if (s.charAt(i) === "/" && s.charAt(i + 1) === "*") {
        var end = s.indexOf("*/", i + 2);
        i = end < 0 ? n : end + 2;
        continue;
      }
      break;
    }
    return i;
  }

  function readQuoted(s, i, q) {
    var out = "", n = s.length;
    i++;
    while (i < n) {
      var c = s.charAt(i);
      if (c === q) {
        if (s.charAt(i + 1) === q) { out += q; i += 2; continue; }
        return { value: out, end: i + 1 };
      }
      if (q === "'" && c === "\\" && s.charAt(i + 1) === "u" && /^[0-9a-fA-F]{4}/.test(s.slice(i + 2, i + 6))) {
        out += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      out += c;
      i++;
    }
    return { value: out, end: i };
  }

  function readIdent(s, i) {
    i = skipSpaceAndComments(s, i);
    if (i >= s.length) return null;
    if (s.charAt(i) === '"') {
      var q = readQuoted(s, i, '"');
      return { name: q.value, end: q.end, quoted: true };
    }
    var c = s.charAt(i);
    if (!/[A-Za-z_]/.test(c)) return null;
    var j = i + 1;
    while (j < s.length && /[A-Za-z0-9_$]/.test(s.charAt(j))) j++;
    return { name: s.slice(i, j), end: j, quoted: false };
  }

  function readTableName(s, i) {
    var a = readIdent(s, i);
    if (!a) return null;
    var k = skipSpaceAndComments(s, a.end);
    if (s.charAt(k) === ".") {
      var b = readIdent(s, k + 1);
      if (b) return { name: b.name, key: b.name.toUpperCase(), end: b.end };
    }
    return { name: a.name, key: a.name.toUpperCase(), end: a.end };
  }

  function readValue(s, i) {
    i = skipSpaceAndComments(s, i);
    if (i >= s.length) return null;
    var rest = s.slice(i), m;
    m = rest.match(/^NULL\b/i);
    if (m) return { value: null, end: i + m[0].length };
    m = rest.match(/^TRUE\b/i);
    if (m) return { value: true, end: i + m[0].length };
    m = rest.match(/^FALSE\b/i);
    if (m) return { value: false, end: i + m[0].length };
    m = rest.match(/^(DATE|TIME|TIMESTAMP)\b/i);
    if (m) {
      var inner = readValue(s, i + m[0].length);
      if (!inner) return { value: null, end: i + m[0].length };
      var v = inner.value, kind = m[1].toUpperCase();
      if (typeof v === "string") {
        if (kind === "DATE" && /^\d{4}-\d{2}-\d{2}/.test(v)) v = v.slice(0, 10);
        else if (kind === "TIMESTAMP" && /^\d{4}-\d{2}-\d{2}/.test(v)) v = v.slice(0, 10);
        else if (kind === "TIME") v = String(v);
      }
      return { value: v, end: inner.end };
    }
    if (s.charAt(i) === "'") {
      var q = readQuoted(s, i, "'");
      return { value: q.value, end: q.end };
    }
    if ((s.charAt(i) === "X" || s.charAt(i) === "x") && s.charAt(i + 1) === "'") {
      var hex = readQuoted(s, i + 1, "'");
      return { value: hex.value ? ("X'" + hex.value + "'") : null, end: hex.end, binary: true };
    }
    m = rest.match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    if (m) return { value: Number(m[0]), end: i + m[0].length };
    var id = readIdent(s, i);
    if (id) return { value: id.name, end: id.end };
    return { value: null, end: i + 1 };
  }

  function readValueList(s, i) {
    i = skipSpaceAndComments(s, i);
    if (s.charAt(i) !== "(") return null;
    i++;
    var vals = [];
    while (i < s.length) {
      i = skipSpaceAndComments(s, i);
      if (s.charAt(i) === ")") return { values: vals, end: i + 1 };
      var v = readValue(s, i);
      if (!v) break;
      vals.push(v);
      i = skipSpaceAndComments(s, v.end);
      if (s.charAt(i) === ",") { i++; continue; }
      if (s.charAt(i) === ")") return { values: vals, end: i + 1 };
      break;
    }
    return { values: vals, end: i };
  }

  function readIdentList(s, i) {
    var list = readValueList(s, i);
    if (!list) return null;
    return {
      names: list.values.map(function (v) { return String(v.value == null ? "" : v.value); }),
      end: list.end
    };
  }

  function matchingParen(s, i) {
    if (s.charAt(i) !== "(") return -1;
    var depth = 0, n = s.length, q = "";
    while (i < n) {
      var c = s.charAt(i);
      if (q) {
        if (c === q && s.charAt(i + 1) === q) { i += 2; continue; }
        if (c === q) q = "";
        i++;
        continue;
      }
      if (c === "'" || c === '"') { q = c; i++; continue; }
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) return i;
      }
      i++;
    }
    return -1;
  }

  function splitTopComma(s) {
    var parts = [], start = 0, depth = 0, q = "", i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charAt(i);
      if (q) {
        if (c === q && s.charAt(i + 1) === q) { i++; continue; }
        if (c === q) q = "";
        continue;
      }
      if (c === "'" || c === '"') { q = c; continue; }
      if (c === "(") depth++;
      else if (c === ")") { if (depth) depth--; }
      else if (c === "," && depth === 0) {
        parts.push(s.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(s.slice(start));
    return parts;
  }

  function parseColumn(part) {
    var ident = readIdent(part, 0);
    if (!ident) return null;
    var lead = ident.name.toUpperCase();
    if (lead === "CONSTRAINT" || lead === "PRIMARY" || lead === "UNIQUE" || lead === "FOREIGN" || lead === "CHECK") {
      return { constraint: true };
    }
    var i = skipSpaceAndComments(part, ident.end);
    var t1 = readIdent(part, i);
    var typ = t1 ? t1.name : "VARCHAR";
    if (t1) i = t1.end;
    var t2pos = skipSpaceAndComments(part, i);
    var t2 = readIdent(part, t2pos);
    if (t2 && /^(VARCHAR|VARBINARY|PRECISION|VARYING)$/i.test(t2.name) && /^(LONG|DOUBLE|CHARACTER|CHAR)$/i.test(typ)) {
      typ = typ + " " + t2.name;
      i = t2.end;
    }
    i = skipSpaceAndComments(part, i);
    if (part.charAt(i) === "(") {
      var close = matchingParen(part, i);
      i = close < 0 ? part.length : close + 1;
    }
    return { name: ident.name, type: mapType(typ) };
  }

  function parseCreate(stmt) {
    var m = stmt.match(/^CREATE\s+(?:(CACHED|MEMORY|TEXT|TEMP|TEMPORARY)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/i);
    if (!m) return null;
    var kind = (m[1] || "CACHED").toUpperCase();
    if (kind === "TEMP" || kind === "TEMPORARY") kind = "MEMORY";
    var i = m[0].length;
    var name = readTableName(stmt, i);
    if (!name) return null;
    i = skipSpaceAndComments(stmt, name.end);
    if (stmt.charAt(i) !== "(") return { name: name.name, key: name.key, kind: kind, columns: [] };
    var close = matchingParen(stmt, i);
    if (close < 0) return null;
    var body = stmt.slice(i + 1, close);
    var columns = [], parts = splitTopComma(body), p, col;
    for (p = 0; p < parts.length; p++) {
      col = parseColumn(parts[p]);
      if (col && !col.constraint) columns.push(col);
    }
    return { name: name.name, key: name.key, kind: kind, columns: columns, rows: [] };
  }

  function parseInsert(stmt, tables) {
    var m = stmt.match(/^INSERT\s+INTO\s+/i);
    if (!m) return false;
    var name = readTableName(stmt, m[0].length);
    if (!name) return false;
    var table = tables[name.key];
    if (!table) return false;
    var i = skipSpaceAndComments(stmt, name.end);
    var colNames = null;
    if (stmt.charAt(i) === "(") {
      var listed = readIdentList(stmt, i);
      if (listed) {
        colNames = listed.names;
        i = skipSpaceAndComments(stmt, listed.end);
      }
    }
    var valuesKw = stmt.slice(i).match(/^VALUES\b/i);
    if (!valuesKw) return false;
    i += valuesKw[0].length;
    function applyRow(cells) {
      var row = [], c, idx, src, col, v;
      if (colNames) {
        for (c = 0; c < table.columns.length; c++) row.push(null);
        for (c = 0; c < colNames.length; c++) {
          idx = -1;
          for (src = 0; src < table.columns.length; src++) {
            if (table.columns[src].name.toUpperCase() === String(colNames[c] || "").toUpperCase()) { idx = src; break; }
          }
          if (idx >= 0) row[idx] = cells[c] ? cells[c].value : null;
        }
      } else {
        for (c = 0; c < table.columns.length; c++) {
          row.push(cells[c] ? cells[c].value : null);
        }
      }
      table.rows.push(row);
    }
    while (i < stmt.length) {
      var list = readValueList(stmt, i);
      if (!list) break;
      applyRow(list.values);
      i = skipSpaceAndComments(stmt, list.end);
      if (stmt.charAt(i) === ",") { i++; continue; }
      break;
    }
    return true;
  }

  function splitStatements(text) {
    var s = String(text || "").replace(/^\uFEFF/, ""), out = [], cur = "", i = 0, n = s.length;
    var depth = 0, q = "";
    function flush() {
      var t = cur.replace(/^\s+|\s+$/g, "");
      if (t) out.push(t);
      cur = "";
    }
    while (i < n) {
      var c = s.charAt(i);
      if (q) {
        cur += c;
        if (c === q && s.charAt(i + 1) === q) { cur += s.charAt(i + 1); i += 2; continue; }
        if (c === q) q = "";
        i++;
        continue;
      }
      if (c === "'" || c === '"') { q = c; cur += c; i++; continue; }
      if (c === "-" && s.charAt(i + 1) === "-") {
        while (i < n && s.charAt(i) !== "\n") i++;
        continue;
      }
      if (c === "/" && s.charAt(i + 1) === "/") {
        while (i < n && s.charAt(i) !== "\n") i++;
        continue;
      }
      if (c === "/" && s.charAt(i + 1) === "*") {
        var end = s.indexOf("*/", i + 2);
        i = end < 0 ? n : end + 2;
        continue;
      }
      if (c === "(") { depth++; cur += c; i++; continue; }
      if (c === ")") { if (depth) depth--; cur += c; i++; continue; }
      if ((c === ";" || c === "\n") && depth === 0) {
        flush();
        i++;
        continue;
      }
      cur += c;
      i++;
    }
    flush();
    return out;
  }

  function finalizeTables(list) {
    var warnings = [], cachedMissing = [], out = [], i, t, cols, keep, rows, r, row, c;
    for (i = 0; i < list.length; i++) {
      t = list[i];
      keep = [];
      cols = t.columns || [];
      for (c = 0; c < cols.length; c++) {
        if (cols[c].type === "binary") keep.push(false);
        else keep.push(true);
      }
      rows = (t.rows || []).map(function (src) {
        row = [];
        for (c = 0; c < cols.length; c++) {
          if (keep[c]) row.push(src[c] === undefined ? null : src[c]);
        }
        return row;
      });
      out.push({
        name: t.name,
        kind: t.kind,
        columns: cols.filter(function (col, ci) { return keep[ci]; }).map(function (col) {
          return { name: col.name, type: col.type === "binary" ? "text" : col.type };
        }),
        rows: rows
      });
      if ((t.kind === "CACHED" || t.kind === "TEXT") && rows.length === 0 && (t.columns || []).length) {
        if (t.kind === "CACHED") cachedMissing.push(t.name);
      }
    }
    if (cachedMissing.length) {
      warnings.push("Rows of " + cachedMissing.length + " table" + (cachedMissing.length === 1 ? "" : "s") + " could not be read.");
    }
    return { tables: out, warnings: warnings, cachedMissing: cachedMissing };
  }

  function parseScript(text) {
    var stmts = splitStatements(text), tables = {}, order = [], i, stmt, created;
    for (i = 0; i < stmts.length; i++) {
      stmt = stmts[i];
      created = parseCreate(stmt);
      if (created) {
        if (!tables[created.key]) {
          tables[created.key] = created;
          order.push(created);
        }
        continue;
      }
      parseInsert(stmt, tables);
    }
    return finalizeTables(order);
  }

  function parse(files) {
    if (!files || typeof files !== "object" || Array.isArray(files)) throw OdbError(CODES.invalid);
    if (isFirebird(files)) throw OdbError(CODES.firebird);
    if (isEncrypted(files)) throw OdbError(CODES.encrypted);
    var script = getFile(files, "database/script");
    if (script == null) {
      if (!hasDatabaseFolder(files)) throw OdbError(CODES.external);
      throw OdbError(CODES.invalid);
    }
    var text = asText(script);
    if (looksBinary(text)) throw OdbError(CODES.encrypted);
    return parseScript(text);
  }

  var api = {
    parse: parse,
    parseScript: parseScript,
    mapType: mapType,
    acceptsName: acceptsName,
    isOdb: isOdb,
    dropFile: dropFile,
    OdbError: OdbError,
    CODES: CODES,
    MSG: MSG
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BaseOdb = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
