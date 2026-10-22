/*
 * spreadsheet_refs.js
 * Cell references: addresses, ranges and cell values for the evaluator, and ref rewriting
 * (mapRefs, shiftFormula, adjustRefs) plus dependency lists for recalc.
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

/**
 * Numeric value of a cell, or NaN if blank/text
 */
function numVal(r, c) {
  var v = cells[r][c].value;
  if (v === "" || v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  var n = Number(v);
  return isNaN(n) ? NaN : n;
}

/**
 * Raw display value
 */
function rawVal(r, c) {
  var v = cells[r][c].value;
  if (v === undefined || v === null) return "";
  return v;
}

/**
 * True if cell has no formula and no value
 */
function isEmpty(r, c) {
  var f = cells[r][c].formula;
  var v = cells[r][c].value;
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

/**
 * Values from a range token like A1:A10 or a single A1
 */
function rangeValues(token, numericOnly) {
  var parts, a, b, list, i, v, out = [];
  token = token.trim().toUpperCase();
  if (token.indexOf(":") >= 0) {
    parts = token.split(":");
    a = parseAddr(parts[0]);
    b = parseAddr(parts[1]);
    if (!a || !b) {
      if (parts.length === 2 && REF_LIKE.test(parts[0].trim()) && REF_LIKE.test(parts[1].trim())) fail(ERR_REF);
      return null;
    }
    list = expandRange(a, b);
  } else {
    a = parseAddr(token);
    if (!a) return null;
    list = [a];
  }
  for (i = 0; i < list.length; i++) {
    if (isErrorValue(rawVal(list[i].r, list[i].c))) fail(rawVal(list[i].r, list[i].c));
    if (numericOnly) {
      v = numVal(list[i].r, list[i].c);
      if (!isNaN(v)) out.push(v);
    } else {
      out.push(rawVal(list[i].r, list[i].c));
    }
  }
  return out;
}

/**
 * All cells in a range token
 */
function rangeCells(token) {
  var parts, a, b;
  token = token.trim().toUpperCase();
  if (token.indexOf(":") >= 0) {
    parts = token.split(":");
    a = parseAddr(parts[0]);
    b = parseAddr(parts[1]);
    if (!a || !b) {
      if (parts.length === 2 && REF_LIKE.test(parts[0].trim()) && REF_LIKE.test(parts[1].trim())) fail(ERR_REF);
      return null;
    }
    return expandRange(a, b);
  }
  a = parseAddr(token);
  return a ? [a] : null;
}


/**
 * Call fn on every cell ref / range in a formula (outside "strings").
 * fn(ref) gets { r1, c1, ar1, ac1, r2, c2, ar2, ac2, range } (0-based, a* = "$" absolute)
 * and returns replacement text. Used by fill, paste, sort and insert/delete.
 */
var REF_RE = /(\$?)\b([A-Za-z])(\$?)([0-9]+)\b(?:\s*:\s*(\$?)\b([A-Za-z])(\$?)([0-9]+)\b)?/g;
function mapRefs(formula, fn) {
  var f = String(formula);
  if (f.charAt(0) !== "=") return f;
  return f.split('"').map(function (part, i) {
    if (i % 2) return part;                           // inside a quoted string
    return part.replace(REF_RE, function (m, a1, l1, b1, n1, a2, l2, b2, n2) {
      var ref = {
        ac1: !!a1, c1: COL_LETTERS.indexOf(l1.toUpperCase()), ar1: !!b1, r1: parseInt(n1, 10) - 1,
        range: !!l2
      };
      if (ref.c1 < 0) return m;
      if (l2) {
        ref.ac2 = !!a2; ref.c2 = COL_LETTERS.indexOf(l2.toUpperCase()); ref.ar2 = !!b2; ref.r2 = parseInt(n2, 10) - 1;
        if (ref.c2 < 0) return m;
      }
      return fn(ref);
    });
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

/**
 * Shift relative A1 refs by dr, dc (fill, paste, sort). $ parts stay put.
 * A ref pushed outside the sheet becomes #REF!.
 */
function shiftFormula(formula, dr, dc) {
  if (!formula || String(formula).charAt(0) !== "=") return formula;
  return mapRefs(formula, function (x) {
    if (!x.ac1) x.c1 += dc;
    if (!x.ar1) x.r1 += dr;
    if (x.range) { if (!x.ac2) x.c2 += dc; if (!x.ar2) x.r2 += dr; }
    return refsText(x);
  });
}

/**
 * Fix refs after inserting (delta 1) or deleting (delta -1) row/column `at`.
 * axis "r" or "c". Absolute ($) refs move too. Refs to a deleted cell → #REF!;
 * ranges grow / shrink.
 */
function adjustRefs(formula, axis, at, delta) {
  if (!formula || String(formula).charAt(0) !== "=") return formula;
  var limit = axis === "r" ? ROWS : COLS;
  var k1 = axis === "r" ? "r1" : "c1", k2 = axis === "r" ? "r2" : "c2";
  return mapRefs(formula, function (x) {
    if (!x.range) {
      if (delta > 0) { if (x[k1] >= at) x[k1]++; }
      else if (x[k1] === at) return ERR_REF;
      else if (x[k1] > at) x[k1]--;
      return refsText(x);
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
    return refsText(x);
  });
}

/**
 * Cells a formula refers to (single refs and ranges inside the sheet), as r*COLS+c indexes
 */
function formulaDeps(f) {
  var s = String(f).slice(1).replace(/"[^"]*"/g, " ").replace(/\$/g, "");
  var out = [], seen = {};
  function add(r, c) { var k = r * COLS + c; if (!seen[k]) { seen[k] = 1; out.push(k); } }
  s = s.replace(/\b([A-Za-z]{1,3}[0-9]+)\s*:\s*([A-Za-z]{1,3}[0-9]+)\b/g, function (m, x, y) {
    var a = parseAddr(x), b = parseAddr(y), list, i;
    if (a && b) { list = expandRange(a, b); for (i = 0; i < list.length; i++) add(list[i].r, list[i].c); }
    return " ";
  });
  s.replace(/\b([A-Za-z]{1,3}[0-9]+)\b/g, function (tok) {
    var a = parseAddr(tok);
    if (a) add(a.r, a.c);
    return tok;
  });
  return out;
}

function isFormula(f) { return !!f && String(f).charAt(0) === "="; }

