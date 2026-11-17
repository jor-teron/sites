/* ============================================================
   FILE: modules/base_odbgen.js
   ROLE: BS12 LibreOffice Base (.odb) writer. Pure and DOM-free:
         given tables in the same shape BaseOdb.parse returns
         ({ name, columns: [{ name, type }], rows: [[...]] }),
         build the package entries of an embedded-HSQLDB .odb
         and pack them as a store-only ZIP (mimetype first,
         flags 0, no extra field). Forms, queries and reports
         are not written. Unzipping is not done here.
   API:  BaseOdbgen.build(tables) → { entries, files, script,
           properties, manifest, content, settings, warnings }
         BaseOdbgen.pack(entries) → Uint8Array
         BaseOdbgen.tablesFromDb(db, helpers?)
         BaseOdbgen.sqlType(col, values), .sqlLiteral(value, typ)
         BaseOdbgen.MIME
   ============================================================ */
(function (root) {
  "use strict";

  var MIME = "application/vnd.oasis.opendocument.base";
  var XMLDECL = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
  var OFFICE_NS = [
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
    'xmlns:xlink="http://www.w3.org/1999/xlink"',
    'xmlns:db="urn:oasis:names:tc:opendocument:xmlns:database:1.0"',
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
    'xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0"',
    'xmlns:ooo="http://openoffice.org/2004/office"',
    'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"',
    'xmlns:svg="http://www.w3.org/2000/svg"'
  ].join(" ");

  function isNum(n) { return typeof n === "number" && isFinite(n); }
  function isInt(n) { return isNum(n) && Math.floor(n) === n; }

  function xmlEsc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function ident(name) {
    return "\"" + String(name == null ? "" : name).replace(/"/g, "\"\"") + "\"";
  }

  function encodeUtf8(s) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(String(s));
    s = String(s);
    var out = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        var low = s.charCodeAt(i + 1);
        if (low >= 0xDC00 && low <= 0xDFFF) {
          var cp = 0x10000 + ((c - 0xD800) << 10) + (low - 0xDC00);
          out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
          i++;
          continue;
        }
        out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      } else {
        out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
    }
    return new Uint8Array(out);
  }

  function u8(x) {
    if (!x) return new Uint8Array(0);
    if (x instanceof Uint8Array) return x;
    if (typeof Buffer !== "undefined" && Buffer.isBuffer && Buffer.isBuffer(x)) return new Uint8Array(x);
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (typeof x === "string") return encodeUtf8(x);
    return new Uint8Array(x);
  }

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256), n, k, c;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF, i;
    bytes = u8(bytes);
    for (i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function dosStamp(d) {
    d = d || new Date();
    var year = Math.max(1980, d.getFullYear());
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }
  function isBytes(x) {
    if (x == null || typeof x === "string") return true;
    if (x instanceof Uint8Array || x instanceof ArrayBuffer) return true;
    if (typeof Buffer !== "undefined" && Buffer.isBuffer && Buffer.isBuffer(x)) return true;
    return false;
  }
  function asEntry(name, v) {
    if (v && typeof v === "object" && !isBytes(v) && Object.prototype.hasOwnProperty.call(v, "data")) {
      return { name: name, data: v.data, flags: v.flags };
    }
    return { name: name, data: v };
  }

  /* Store-only ZIP. mimetype is stored with flags 0 and no extra field, first in the archive. */
  function pack(files) {
    var entries, parts = [], central = [], offset = 0, stamp = dosStamp(), i;
    if (Array.isArray(files)) {
      entries = [];
      for (i = 0; i < files.length; i++) entries.push({ name: files[i].name, data: files[i].data, flags: files[i].flags });
    } else {
      entries = Object.keys(files || {}).map(function (n) { return asEntry(n, files[n]); });
    }
    if (entries.length > 65535) throw new Error("Too many files for a ZIP");
    for (i = 0; i < entries.length; i++) {
      var name = String(entries[i].name || "").replace(/^\/+/, "").replace(/\\/g, "/");
      var data = u8(entries[i].data);
      var nb = encodeUtf8(name), crc = crc32(data);
      var flags = entries[i].flags != null ? entries[i].flags : (name === "mimetype" ? 0 : 0x0800);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, flags, true);
      lh.setUint16(8, 0, true);
      lh.setUint16(10, stamp.time, true);
      lh.setUint16(12, stamp.date, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, nb.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nb, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, flags, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, stamp.time, true);
      ch.setUint16(14, stamp.date, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, nb.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nb);
      offset += 30 + nb.length + data.length;
    }
    var cdSize = 0;
    for (i = 0; i < central.length; i++) cdSize += central[i].length;
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    parts = parts.concat(central, [new Uint8Array(end.buffer)]);
    var total = 0;
    for (i = 0; i < parts.length; i++) total += parts[i].length;
    var out = new Uint8Array(total), o = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length; }
    return out;
  }

  function hex4(n) {
    var h = (n & 0xFFFF).toString(16).toLowerCase();
    while (h.length < 4) h = "0" + h;
    return h;
  }

  /* HSQLDB 1.8 string literal: '' for quotes, \uXXXX for non-ASCII / controls. */
  function sqlString(s) {
    s = String(s);
    var out = "'", i, c, next;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c === 39) { out += "''"; continue; }
      if (c === 92) {
        next = s.slice(i + 1, i + 5);
        if (s.charAt(i + 1) === "u" && /^[0-9a-fA-F]{4}$/.test(next)) {
          out += "\\u005c";
          continue;
        }
        out += "\\";
        continue;
      }
      if (c < 32 || c > 126) {
        out += "\\u" + hex4(c);
        continue;
      }
      out += s.charAt(i);
    }
    return out + "'";
  }

  function looksDate(s) {
    return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  }
  function looksDateTime(s) {
    return typeof s === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s);
  }
  function dateText(v) {
    if (v == null || v === "") return null;
    if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) {
      var y = v.getFullYear(), m = v.getMonth() + 1, d = v.getDate();
      var p = function (n) { return (n < 10 ? "0" : "") + n; };
      return y + "-" + p(m) + "-" + p(d);
    }
    var s = String(v).trim();
    if (looksDateTime(s)) return s.replace("T", " ");
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
  }

  function baseKind(col) {
    var t = String((col && (col.baseType || col.type)) || "text").toLowerCase();
    if (t === "bool" || t === "boolean" || t === "yes-no" || t === "yesno") return "bool";
    if (t === "date") return "date";
    if (t === "datetime" || t === "timestamp") return "datetime";
    if (t === "number" || t === "currency" || t === "id" || t === "int" || t === "integer" || t === "double") return "number";
    if (t === "long" || t === "longvarchar" || t === "memo") return "long";
    return "text";
  }

  function isKeyCol(col) {
    if (!col) return false;
    if (col.key) return true;
    var t = String(col.baseType || col.type || "").toLowerCase();
    return t === "id";
  }

  function columnValues(rows, idx) {
    var out = [], i;
    for (i = 0; i < (rows || []).length; i++) {
      out.push(rows[i] ? rows[i][idx] : null);
    }
    return out;
  }

  function sqlType(col, values) {
    var kind = baseKind(col);
    var i, v, maxLen = 0, allInt = true, seenNum = false, seenTime = false;
    values = values || [];
    if (kind === "bool") return "BOOLEAN";
    if (kind === "datetime") return "TIMESTAMP";
    if (kind === "date") {
      for (i = 0; i < values.length; i++) {
        v = values[i];
        if (v == null || v === "") continue;
        if (looksDateTime(String(v)) || (Object.prototype.toString.call(v) === "[object Date]" && (v.getHours() || v.getMinutes() || v.getSeconds()))) {
          seenTime = true;
        }
      }
      return seenTime ? "TIMESTAMP" : "DATE";
    }
    if (kind === "number") {
      for (i = 0; i < values.length; i++) {
        v = values[i];
        if (v == null || v === "") continue;
        var n = typeof v === "number" ? v : Number(v);
        if (!isFinite(n)) { allInt = false; continue; }
        seenNum = true;
        if (!isInt(n)) allInt = false;
      }
      if (!seenNum || allInt) return "INTEGER";
      return "DOUBLE";
    }
    if (kind === "long") return "LONGVARCHAR";
    for (i = 0; i < values.length; i++) {
      v = values[i];
      if (v == null) continue;
      var len = String(v).length;
      if (len > maxLen) maxLen = len;
    }
    if (maxLen > 65535) return "LONGVARCHAR";
    return "VARCHAR(" + Math.max(255, maxLen) + ")";
  }

  function sqlLiteral(value, typ) {
    if (value === null || value === undefined) return "NULL";
    typ = String(typ || "").toUpperCase();
    if (typ === "BOOLEAN") {
      if (value === "" || value === null) return "NULL";
      if (value === false || value === 0 || value === "0" || /^false|no|off$/i.test(String(value))) return "FALSE";
      return "TRUE";
    }
    if (typ === "INTEGER" || typ === "DOUBLE") {
      if (value === "") return "NULL";
      var n = typeof value === "number" ? value : Number(value);
      if (!isFinite(n)) return "NULL";
      if (typ === "INTEGER") return String(Math.trunc(n));
      return String(n);
    }
    if (typ === "DATE" || typ === "TIMESTAMP") {
      var d = dateText(value);
      if (d == null || d === "") return "NULL";
      return sqlString(d);
    }
    if (value === "") return "''";
    return sqlString(value);
  }

  function uniqueName(name, used, fallback) {
    var base = String(name == null ? "" : name).trim() || (fallback || "Table");
    var n = base, i = 2;
    var key = n.toUpperCase();
    while (used[key]) { n = base + " " + i++; key = n.toUpperCase(); }
    used[key] = true;
    return n;
  }

  function normalizeTables(tables) {
    var out = [], usedTables = {}, warnings = [];
    (tables || []).forEach(function (t, ti) {
      if (!t) return;
      var name = uniqueName(t.name, usedTables, "Table " + (ti + 1));
      var usedCols = {}, cols = [], i;
      (t.columns || []).forEach(function (c, ci) {
        if (!c) return;
        var cn = uniqueName(c.name, usedCols, "Field " + (ci + 1));
        cols.push({
          name: cn,
          type: c.type,
          baseType: c.baseType || c.type,
          key: isKeyCol(c)
        });
      });
      if (!cols.length) {
        warnings.push("Table “" + name + "” has no columns and was skipped.");
        return;
      }
      var rows = [];
      (t.rows || []).forEach(function (r) {
        var row = [], v;
        for (i = 0; i < cols.length; i++) {
          v = r ? r[i] : null;
          row.push(v === undefined ? null : v);
        }
        rows.push(row);
      });
      var sqlTypes = cols.map(function (c, i) { return sqlType(c, columnValues(rows, i)); });
      var keyIdx = -1;
      for (i = 0; i < cols.length; i++) {
        if (cols[i].key && (sqlTypes[i] === "INTEGER" || sqlTypes[i] === "DOUBLE" || sqlTypes[i].indexOf("VARCHAR") === 0)) {
          keyIdx = i;
          break;
        }
      }
      out.push({ name: name, columns: cols, rows: rows, sqlTypes: sqlTypes, keyIdx: keyIdx });
    });
    return { tables: out, warnings: warnings };
  }

  function createTableSql(t) {
    var parts = [], i, typ;
    for (i = 0; i < t.columns.length; i++) {
      typ = t.sqlTypes[i];
      if (i === t.keyIdx) typ += " NOT NULL PRIMARY KEY";
      parts.push(ident(t.columns[i].name) + " " + typ);
    }
    return "CREATE MEMORY TABLE " + ident(t.name) + "(" + parts.join(",") + ")";
  }

  function insertSql(t, row) {
    var vals = [], i;
    for (i = 0; i < t.columns.length; i++) vals.push(sqlLiteral(row[i], t.sqlTypes[i]));
    return "INSERT INTO " + ident(t.name) + " VALUES(" + vals.join(",") + ")";
  }

  function scriptFrom(norm) {
    var lines = [], i, j, t;
    /* SET DATABASE COLLATION is omitted: HSQLDB 1.8.0.10 rejects the usual
       collation names and LibreOffice then cannot open the file. The rest of
       the script follows a real 1.8.0.10 dump (MEMORY tables, SA, WRITE_DELAY). */
    lines.push("CREATE SCHEMA PUBLIC AUTHORIZATION DBA");
    for (i = 0; i < norm.tables.length; i++) lines.push(createTableSql(norm.tables[i]));
    lines.push("CREATE USER SA PASSWORD \"\"");
    lines.push("GRANT DBA TO SA");
    lines.push("SET WRITE_DELAY 60");
    lines.push("SET SCHEMA PUBLIC");
    for (i = 0; i < norm.tables.length; i++) {
      t = norm.tables[i];
      for (j = 0; j < t.rows.length; j++) lines.push(insertSql(t, t.rows[j]));
    }
    return lines.join("\n") + "\n";
  }

  function propertiesText() {
    return [
      "#HSQL Database Engine 1.8.0.10",
      "hsqldb.cache_file_scale=1",
      "hsqldb.cache_scale=14",
      "hsqldb.cache_size_scale=8",
      "hsqldb.cache_version=1.7.0",
      "hsqldb.compatible_version=1.8.0",
      "hsqldb.default_table_type=memory",
      "hsqldb.log_size=200",
      "hsqldb.nio_data_file=true",
      "hsqldb.original_version=1.8.0",
      "hsqldb.script_format=0",
      "modified=no",
      "readonly=false",
      "runtime.gc_interval=0",
      "sql.enforce_strict_size=false",
      "version=1.8.0",
      ""
    ].join("\n");
  }

  function contentXml(norm) {
    var reps = "", i;
    for (i = 0; i < norm.tables.length; i++) {
      reps += "<db:table-representation db:name=\"" + xmlEsc(norm.tables[i].name) + "\"/>";
    }
    return XMLDECL +
      "<office:document-content " + OFFICE_NS + ' office:version="1.4">' +
      "<office:scripts/>" +
      "<office:font-face-decls/>" +
      "<office:automatic-styles/>" +
      "<office:body><office:database><db:data-source>" +
      "<db:connection-data>" +
      "<db:connection-resource xlink:href=\"sdbc:embedded:hsqldb\" xlink:type=\"simple\"/>" +
      "<db:login db:user-name=\"SA\" db:is-password-required=\"false\"/>" +
      "</db:connection-data>" +
      "<db:driver-settings db:system-driver-settings=\"\" db:base-dn=\"\" db:parameter-name-substitution=\"false\"/>" +
      "<db:application-connection-settings db:is-table-name-length-limited=\"false\" db:append-table-alias-name=\"false\" db:max-row-count=\"100\">" +
      "<db:table-filter><db:table-include-filter><db:table-filter-pattern>%</db:table-filter-pattern></db:table-include-filter></db:table-filter>" +
      "</db:application-connection-settings>" +
      "</db:data-source>" +
      (reps ? "<db:table-representations>" + reps + "</db:table-representations>" : "") +
      "</office:database></office:body></office:document-content>";
  }

  function settingsXml() {
    return XMLDECL +
      "<office:document-settings " + OFFICE_NS + ' office:version="1.4"/>';
  }

  function manifestXml(paths) {
    var body = "<manifest:file-entry manifest:full-path=\"/\" manifest:version=\"1.4\" manifest:media-type=\"" + MIME + "\"/>";
    var i, p, mime;
    for (i = 0; i < paths.length; i++) {
      p = paths[i];
      if (p === "mimetype") continue;
      mime = /\.xml$/.test(p) ? "text/xml" : "text/plain";
      if (p.slice(-1) === "/") mime = "application/vnd.sun.xml.ui.configuration";
      body += "\n <manifest:file-entry manifest:full-path=\"" + xmlEsc(p) + "\" manifest:media-type=\"" + mime + "\"/>";
    }
    return XMLDECL +
      "<manifest:manifest xmlns:manifest=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\" manifest:version=\"1.4\">\n " +
      body + "\n</manifest:manifest>\n";
  }

  function build(tables) {
    var norm = normalizeTables(tables);
    var script = scriptFrom(norm);
    var properties = propertiesText();
    var content = contentXml(norm);
    var settings = settingsXml();
    var paths = ["content.xml", "settings.xml", "database/properties", "database/script"];
    var manifest = manifestXml(paths);
    var entries = [
      { name: "mimetype", data: encodeUtf8(MIME), flags: 0 },
      { name: "META-INF/manifest.xml", data: encodeUtf8(manifest) },
      { name: "content.xml", data: encodeUtf8(content) },
      { name: "settings.xml", data: encodeUtf8(settings) },
      { name: "database/properties", data: encodeUtf8(properties) },
      { name: "database/script", data: encodeUtf8(script) }
    ];
    var files = {};
    entries.forEach(function (e) { files[e.name] = e.data; });
    return {
      entries: entries,
      files: files,
      script: script,
      properties: properties,
      manifest: manifest,
      content: content,
      settings: settings,
      warnings: norm.warnings,
      tables: norm.tables
    };
  }

  function emptyish(f, v) {
    if (v == null) return true;
    if (f && f.type === "bool") return false;
    if (v === "") return true;
    if (Array.isArray(v) && !v.length) return true;
    return false;
  }

  function fieldValue(t, f, row, helpers) {
    helpers = helpers || {};
    var v = row && row.v ? row.v[f.id] : null;
    if (f.type === "lookup") {
      if (helpers.lookupText) return helpers.lookupText(t, f, row) || null;
      return emptyish(f, v) ? null : v;
    }
    if (f.type === "ref") {
      if (helpers.refText) {
        var txt = helpers.refText(f, v);
        return txt == null || txt === "" ? null : txt;
      }
      if (Array.isArray(v)) return v.length ? v.join("; ") : null;
      return emptyish(f, v) ? null : v;
    }
    if (f.type === "picture") return emptyish(f, v) ? null : String(v);
    if (f.type === "bool") return !!v;
    if (f.type === "number" || f.type === "currency" || f.type === "id") {
      if (v === "" || v == null) return null;
      var n = typeof v === "number" ? v : Number(v);
      return isFinite(n) ? n : null;
    }
    if (f.type === "date") return dateText(v);
    if (v == null || v === "") return v == null ? null : "";
    return v;
  }

  function exportType(f) {
    var t = f && f.type;
    if (t === "bool") return "bool";
    if (t === "date") return "date";
    if (t === "number" || t === "currency" || t === "id") return "number";
    return "text";
  }

  /* Live Base db ({ tables: [{ name, fields, rows: [{ v }] }] }) → parse() shape. */
  function tablesFromDb(db, helpers) {
    var out = [], skippedPics = 0, warnings = [];
    ((db && db.tables) || []).forEach(function (t) {
      var fields = [], i, f;
      (t.fields || []).forEach(function (field) {
        if (field.type === "picture") { skippedPics++; return; }
        fields.push(field);
      });
      if (!fields.length) {
        warnings.push("Table “" + (t.name || "Table") + "” has no exportable columns and was skipped.");
        return;
      }
      var columns = fields.map(function (field) {
        return { name: field.name, type: exportType(field), baseType: field.type, key: field.type === "id" };
      });
      var rows = (t.rows || []).map(function (row) {
        var r = [];
        for (i = 0; i < fields.length; i++) r.push(fieldValue(t, fields[i], row, helpers));
        return r;
      });
      out.push({ name: t.name, columns: columns, rows: rows });
    });
    return { tables: out, skippedPics: skippedPics, warnings: warnings };
  }

  var api = {
    MIME: MIME,
    build: build,
    pack: pack,
    tablesFromDb: tablesFromDb,
    sqlType: sqlType,
    sqlLiteral: sqlLiteral,
    sqlString: sqlString,
    scriptFrom: function (tables) { return scriptFrom(normalizeTables(tables)); },
    propertiesText: propertiesText
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BaseOdbgen = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
