/*
 * spreadsheet_refs.js
 * Cell references: addresses, ranges and cell values for the evaluator, and ref rewriting
 * (mapRefs, shiftFormula, adjustRefs) plus dependency lists for recalc.
 * SH8: Sheet2!A1, Sheet2!A1:B5 and quoted 'My Sheet'!A1, plus rename / delete rewrites.
 * Used by fill, paste, sort and insert / delete.
 */

/**
 * Convert column index 0..25 to letter A..Z
 */
function colLetter(c) {
  return COL_LETTERS.charAt(c);
}

/**
 * Parse A1-style address. Returns {r,c} 0-based or null
 */
function parseAddr(token) {
  var m = String(token).trim().toUpperCase().match(/^\$?([A-Z])\$?([1-9][0-9]*)$/);   // $A$1, $A1, A$1 ok
  if (!m) return null;
  var c = COL_LETTERS.indexOf(m[1]);
  var r = parseInt(m[2], 10) - 1;
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
  return { r: r, c: c };
}

/**
 * Expand range A1:B3 into list of {r,c}
 */
function expandRange(a, b) {
  var out = [];
  var r1 = Math.min(a.r, b.r);
  var r2 = Math.max(a.r, b.r);
  var c1 = Math.min(a.c, b.c);
  var c2 = Math.max(a.c, b.c);
  var r, c;
  for (r = r1; r <= r2; r++) {
    for (c = c1; c <= c2; c++) {
      out.push({ r: r, c: c });
    }
  }
  return out;
}

function cellsOfSafe(si) {
  if (typeof cellsOf === "function") return cellsOf(si);
  return cells;
}

/**
 * Numeric value of a cell, or NaN if blank/text
 */
function numVal(r, c, si) {
  var v = cellsOfSafe(si)[r][c].value;
  if (v === "" || v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  var n = Number(v);
  return isNaN(n) ? NaN : n;
}

/**
 * Raw display value
 */
function rawVal(r, c, si) {
  var v = cellsOfSafe(si)[r][c].value;
  if (v === undefined || v === null) return "";
  return v;
}

/**
 * True if cell has no formula and no value
 */
function isEmpty(r, c, si) {
  var cell = cellsOfSafe(si)[r][c];
  var f = cell.formula;
  var v = cell.value;
  return (f === "" || f == null) && (v === "" || v == null);
}

/**
 * Split top-level function arguments by comma
 */
function splitArgs(s) {
  var args = [];
  var cur = "";
  var depth = 0;
  var i, ch, inQ = false;
  for (i = 0; i < s.length; i++) {
    ch = s.charAt(i);
    if (ch === '"' && s.charAt(i - 1) !== "\\") inQ = !inQ;
    if (!inQ) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        args.push(cur.trim());
        cur = "";
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim() !== "") args.push(cur.trim());
  return args;
}

/* Quote a sheet name when it isn't a plain identifier (or looks like A1). */
function quoteSheetName(name) {
  name = String(name);
  if (/^[A-Za-z_][A-Za-z0-9._]*$/.test(name) && !/^[A-Za-z]{1,3}[0-9]+$/.test(name)) return name;
  return "'" + name.replace(/'/g, "''") + "'";
}

function unquoteSheetName(s) {
  s = String(s);
  if (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

var SHEET_NAME_BAD = /[\\\/?*\[\]:]/;

function validateSheetName(name, skipIdx) {
  name = String(name == null ? "" : name).trim();
  if (!name) return "Enter a sheet name.";
  if (name.length > (CFG.sheets && CFG.sheets.nameMax || 31)) return "Name must be 31 characters or fewer.";
  if (SHEET_NAME_BAD.test(name)) return "A name can't contain \\ / * ? : [ or ].";
  var i = typeof findSheetIndex === "function" ? findSheetIndex(name) : -1;
  if (i >= 0 && i !== skipIdx) return "That name is already used.";
  return "";
}

function parseAddrLoose(token) {
  var m = String(token).trim().toUpperCase().match(/^(\$?)([A-Z])(\$?)([1-9][0-9]*)$/);
  if (!m) return null;
  return { ac: !!m[1], c: COL_LETTERS.indexOf(m[2]), ar: !!m[3], r: parseInt(m[4], 10) - 1, raw: true };
}

/**
 * Parse a range token, optional sheet prefix: Sheet2!A1, 'My Sheet'!A1:B5, A1:B2.
 * Returns { sheet, si, list:[{r,c,si}], error } or null if it isn't a ref.
 */
function parseRefToken(token) {
  var s = String(token || "").trim();
  var sheet = null, rest = s, i, name, ch;
  if (!s) return null;
  if (s.charAt(0) === "'") {
    name = "";
    i = 1;
    while (i < s.length) {
      ch = s.charAt(i);
      if (ch === "'") {
        if (s.charAt(i + 1) === "'") { name += "'"; i += 2; continue; }
        if (s.charAt(i + 1) === "!") { sheet = name; rest = s.slice(i + 2); break; }
        return null;
      }
      name += ch;
      i++;
    }
    if (sheet == null) return null;
  } else {
    i = s.indexOf("!");
    if (i > 0) { sheet = s.slice(0, i); rest = s.slice(i + 1); }
  }
  var si;
  if (sheet != null) {
    si = typeof findSheetIndex === "function" ? findSheetIndex(sheet) : -1;
    if (si < 0) return { sheet: sheet, si: -1, list: null, error: ERR_REF };
  } else {
    si = typeof evalSheetIdx === "number" ? evalSheetIdx : 0;
  }
  rest = rest.trim();
  var parts, a, b, list, k;
  if (rest.indexOf(":") >= 0) {
    parts = rest.split(":");
    a = parseAddr(parts[0]);
    b = parseAddr(parts[1]);
    if (!a || !b) {
      if (parts.length === 2 && REF_LIKE.test(parts[0].trim().replace(/\$/g, "").toUpperCase()) &&
          REF_LIKE.test(parts[1].trim().replace(/\$/g, "").toUpperCase())) {
        return { sheet: sheet, si: si, list: null, error: ERR_REF };
      }
      return null;
    }
    list = expandRange(a, b);
  } else {
    a = parseAddr(rest);
    if (!a) {
      if (REF_LIKE.test(rest.replace(/\$/g, "").toUpperCase())) return { sheet: sheet, si: si, list: null, error: ERR_REF };
      return null;
    }
    list = [a];
  }
  for (k = 0; k < list.length; k++) list[k].si = si;
  return { sheet: sheet, si: si, list: list, error: null };
}

/**
 * Values from a range token like A1:A10, Sheet2!A1 or a single A1
 */
function rangeValues(token, numericOnly) {
  var parsed = parseRefToken(token), i, v, out = [];
  if (!parsed) return null;
  if (parsed.error) fail(parsed.error);
  for (i = 0; i < parsed.list.length; i++) {
    if (isErrorValue(rawVal(parsed.list[i].r, parsed.list[i].c, parsed.list[i].si))) {
      fail(rawVal(parsed.list[i].r, parsed.list[i].c, parsed.list[i].si));
    }
    if (numericOnly) {
      v = numVal(parsed.list[i].r, parsed.list[i].c, parsed.list[i].si);
      if (!isNaN(v)) out.push(v);
    } else {
      out.push(rawVal(parsed.list[i].r, parsed.list[i].c, parsed.list[i].si));
    }
  }
  return out;
}

/**
 * All cells in a range token (each item has r, c, si)
 */
function rangeCells(token) {
  var parsed = parseRefToken(token);
  if (!parsed) return null;
  if (parsed.error) fail(parsed.error);
  return parsed.list;
}

function isRefBoundary(s, p) {
  if (p <= 0) return true;
  return !/[A-Za-z0-9_$']/.test(s.charAt(p - 1));
}

function matchAddrAt(s, p) {
  var m = s.slice(p).match(/^(\$?)([A-Za-z])(\$?)([0-9]+)/);
  if (!m) return null;
  var c = COL_LETTERS.indexOf(m[2].toUpperCase());
  if (c < 0) return null;
  return { ac: !!m[1], c: c, ar: !!m[3], r: parseInt(m[4], 10) - 1, len: m[0].length };
}

/**
 * Match a (possibly sheet-qualified) A1 or A1:B2 at index p. Returns { ref, end } or null.
 */
function matchRefAt(s, p) {
  if (!isRefBoundary(s, p)) return null;
  var q = p, sheet = null, a, b, end, ch, name;
  if (s.charAt(q) === "'") {
    name = "";
    q++;
    while (q < s.length) {
      ch = s.charAt(q);
      if (ch === "'") {
        if (s.charAt(q + 1) === "'") { name += "'"; q += 2; continue; }
        q++;
        break;
      }
      name += ch;
      q++;
    }
    if (s.charAt(q) !== "!") return null;
    sheet = name;
    q++;
  } else {
    var id = s.slice(q).match(/^([A-Za-z_][A-Za-z0-9._]*)!/);
    if (id) { sheet = id[1]; q += id[0].length; }
  }
  a = matchAddrAt(s, q);
  if (!a) return null;
  end = q + a.len;
  var ref = { sheet: sheet, ac1: a.ac, c1: a.c, ar1: a.ar, r1: a.r, range: false };
  var rest = s.slice(end);
  var sp = rest.match(/^\s*:\s*/);
  if (sp) {
    b = matchAddrAt(s, end + sp[0].length);
    if (b) {
      ref.range = true;
      ref.ac2 = b.ac; ref.c2 = b.c; ref.ar2 = b.ar; ref.r2 = b.r;
      end = end + sp[0].length + b.len;
    }
  }
  return { ref: ref, end: end };
}

/**
 * Call fn on every cell ref / range in a formula (outside "strings").
 * fn(ref) gets { sheet, r1, c1, ar1, ac1, r2, c2, ar2, ac2, range }
 * and returns replacement text. Used by fill, paste, sort and insert/delete.
 */
function mapRefs(formula, fn) {
  var f = String(formula);
  if (f.charAt(0) !== "=") return f;
  return f.split('"').map(function (part, i) {
    if (i % 2) return part;
    var out = "", p = 0, m;
    while (p < part.length) {
      m = matchRefAt(part, p);
      if (!m) { out += part.charAt(p); p++; continue; }
      out += fn(m.ref);
      p = m.end;
    }
    return out;
  }).join('"');
}

/* Text for one ref end; out of the sheet → #REF! */
function refText(ac, c, ar, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return ERR_REF;
  return (ac ? "$" : "") + COL_LETTERS.charAt(c) + (ar ? "$" : "") + String(r + 1);
}
function refsText(x) {
  var a = refText(x.ac1, x.c1, x.ar1, x.r1);
  if (!x.range) return a;
  var b = refText(x.ac2, x.c2, x.ar2, x.r2);
  return a === ERR_REF || b === ERR_REF ? ERR_REF : a + ":" + b;
}

/* Rebuild a ref including a sheet prefix (kept fixed on copy / fill). */
function refToken(x) {
  var body = refsText(x);
  if (body === ERR_REF) return ERR_REF;
  if (x.sheet == null || x.sheet === "") return body;
  return quoteSheetName(x.sheet) + "!" + body;
}

/**
 * Shift relative A1 refs by dr, dc (fill, paste, sort). $ parts stay put.
 * A sheet prefix is kept as it is. A ref pushed outside the sheet becomes #REF!.
 */
function shiftFormula(formula, dr, dc) {
  if (!formula || String(formula).charAt(0) !== "=") return formula;
  return mapRefs(formula, function (x) {
    if (!x.ac1) x.c1 += dc;
    if (!x.ar1) x.r1 += dr;
    if (x.range) { if (!x.ac2) x.c2 += dc; if (!x.ar2) x.r2 += dr; }
    return refToken(x);
  });
}

/**
 * Fix refs after inserting (delta 1) or deleting (delta -1) row/column `at`
 * on sheet `targetSi` (defaults to the active / eval sheet). axis "r" or "c".
 * Only refs that point at that sheet move (including unqualified refs on it).
 * Absolute ($) refs move too. Refs to a deleted cell → #REF!; ranges grow / shrink.
 */
function adjustRefs(formula, axis, at, delta, targetSi, formulaSi) {
  if (!formula || String(formula).charAt(0) !== "=") return formula;
  if (targetSi == null) targetSi = typeof evalSheetIdx === "number" ? evalSheetIdx : 0;
  if (formulaSi == null) formulaSi = targetSi;
  var limit = axis === "r" ? ROWS : COLS;
  var k1 = axis === "r" ? "r1" : "c1", k2 = axis === "r" ? "r2" : "c2";
  return mapRefs(formula, function (x) {
    var si = x.sheet == null ? formulaSi : (typeof findSheetIndex === "function" ? findSheetIndex(x.sheet) : -1);
    if (si !== targetSi) return refToken(x);
    if (!x.range) {
      if (delta > 0) { if (x[k1] >= at) x[k1]++; }
      else if (x[k1] === at) return ERR_REF;
      else if (x[k1] > at) x[k1]--;
      return refToken(x);
    }
    var swap = x[k1] > x[k2], lo = swap ? x[k2] : x[k1], hi = swap ? x[k1] : x[k2];
    if (delta > 0) {
      if (lo >= at) lo++;
      if (hi >= at) hi++;
      if (lo >= limit) return ERR_REF;
      if (hi >= limit) hi = limit - 1;
    } else {
      if (lo === at && hi === at) return ERR_REF;
      if (lo > at) lo--;
      if (hi >= at) hi--;
    }
    if (swap) { x[k1] = hi; x[k2] = lo; } else { x[k1] = lo; x[k2] = hi; }
    return refToken(x);
  });
}

function namesEqual(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

/** Rewrite or drop sheet prefixes after a rename or delete. */
function rewriteSheetRefs(formula, oldName, newName) {
  if (!formula || String(formula).charAt(0) !== "=") return formula;
  return mapRefs(formula, function (x) {
    if (x.sheet == null || !namesEqual(x.sheet, oldName)) return refToken(x);
    if (newName == null) return ERR_REF;
    x.sheet = newName;
    return refToken(x);
  });
}

/**
 * Cells a formula refers to (single refs and ranges inside the sheet), as
 * global indexes: sheet * (ROWS*COLS) + r*COLS + c. fromSi is the formula's sheet.
 */
function formulaDeps(f, fromSi) {
  var out = [], seen = {};
  if (fromSi == null) fromSi = typeof evalSheetIdx === "number" ? evalSheetIdx : 0;
  function add(si, r, c) {
    if (si < 0 || r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    var k = si * (ROWS * COLS) + r * COLS + c;
    if (!seen[k]) { seen[k] = 1; out.push(k); }
  }
  mapRefs(String(f).charAt(0) === "=" ? f : "=" + f, function (x) {
    var si = x.sheet == null ? fromSi : (typeof findSheetIndex === "function" ? findSheetIndex(x.sheet) : -1);
    if (si < 0) return refToken(x);
    if (!x.range) add(si, x.r1, x.c1);
    else {
      var r1 = Math.min(x.r1, x.r2), r2 = Math.max(x.r1, x.r2);
      var c1 = Math.min(x.c1, x.c2), c2 = Math.max(x.c1, x.c2), r, c;
      for (r = r1; r <= r2; r++) for (c = c1; c <= c2; c++) add(si, r, c);
    }
    return refToken(x);
  });
  return out;
}

function isFormula(f) { return !!f && String(f).charAt(0) === "="; }

function cellIndex(si, r, c) { return si * (ROWS * COLS) + r * COLS + c; }
function indexSheet(k) { return Math.floor(k / (ROWS * COLS)); }
function indexRow(k) { return Math.floor((k % (ROWS * COLS)) / COLS); }
function indexCol(k) { return k % COLS; }
