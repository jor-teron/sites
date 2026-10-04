/*
 * spreadsheet_formula.js
 * Spreadsheet formula parser and evaluator.
 * Recalc is dependency-aware: refs (incl. ranges) form a graph, cells are evaluated in
 * topological order, cells on (or fed by) a cycle show #LOOP!. Arithmetic uses a small
 * parser (no eval / Function). Errors: #DIV/0! (real division by zero), #NUM! (overflow /
 * not a number), #REF! (ref outside the sheet), #ERR (bad formula). An error in a referenced
 * cell flows on to the formula (IFERROR catches it). Numeric results are rounded to
 * SPREADSHEET_CONFIG.precision significant digits (0.1+0.2 → 0.3).
 * Grid size and cell store come from spreadsheet_logic.js (COLS, ROWS, COL_LETTERS, cells),
 * which reads them from SPREADSHEET_CONFIG in spreadsheet_config.js.
 * Supported: =expr, cell refs, ranges, listed functions, + - * / ^ &
 */

/* Formula error tokens shown in cells */
var ERR = "#ERR";
var ERR_DIV0 = "#DIV/0!";
var ERR_NUM = "#NUM!";
var ERR_REF = "#REF!";
var ERR_LOOP = "#LOOP!";
var ALL_ERRORS = [ERR, ERR_DIV0, ERR_NUM, ERR_REF, ERR_LOOP];

/* Thrown inside evaluation; evalFormula turns it into the cell's value */
function CellError(value) { this.value = value; }
function fail(value) { throw new CellError(value); }
function isErrorValue(v) { return typeof v === "string" && ALL_ERRORS.indexOf(v) !== -1; }

/* Looks like a cell reference (letters + digits), in range or not */
var REF_LIKE = /^\$?[A-Z]{1,3}\$?[0-9]+$/;

/* Round float noise away, keep a number (precision from config, default 15) */
function roundNum(x) {
  var p = (typeof SPREADSHEET_CONFIG !== "undefined" && SPREADSHEET_CONFIG.precision) || 15;
  if (typeof x !== "number" || x === 0) return x;
  return Number(x.toPrecision(p));
}

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
 * Compare two values for IF conditions
 */
function cmp(op, left, right) {
  var ln = Number(left);
  var rn = Number(right);
  var L = (!isNaN(ln) && left !== "") ? ln : String(left);
  var R = (!isNaN(rn) && right !== "") ? rn : String(right);
  if (op === "=" || op === "==") return L == R;
  if (op === "<>" || op === "!=") return L != R;
  if (op === "<") return L < R;
  if (op === ">") return L > R;
  if (op === "<=") return L <= R;
  if (op === ">=") return L >= R;
  return false;
}

/**
 * Pad number to 2 digits
 */
function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

/**
 * Evaluate one function call
 */
function evalFunc(name, args) {
  var n = name.toUpperCase();
  var nums, i, acc, a0, a1, list, t, v;

  if (n === "SUM" || n === "AVERAGE" || n === "MIN" || n === "MAX" || n === "COUNT") {
    nums = [];
    for (i = 0; i < args.length; i++) {
      list = rangeValues(args[i], true);
      if (list) nums = nums.concat(list);
      else {
        v = evalExpr(args[i]);
        if (typeof v === "number" && !isNaN(v)) nums.push(v);
      }
    }
    if (n === "COUNT") return nums.length;
    if (nums.length === 0) return 0;
    acc = nums[0];
    if (n === "MIN") {
      for (i = 1; i < nums.length; i++) if (nums[i] < acc) acc = nums[i];
      return acc;
    }
    if (n === "MAX") {
      for (i = 1; i < nums.length; i++) if (nums[i] > acc) acc = nums[i];
      return acc;
    }
    acc = 0;
    for (i = 0; i < nums.length; i++) acc += nums[i];
    if (n === "SUM") return acc;
    return acc / nums.length;
  }

  if (n === "COUNTA") {
    acc = 0;
    for (i = 0; i < args.length; i++) {
      list = rangeCells(args[i]);
      if (list) {
        for (a0 = 0; a0 < list.length; a0++) {
          if (!isEmpty(list[a0].r, list[a0].c)) acc++;
        }
      } else {
        v = evalExpr(args[i]);
        if (v !== "" && v !== null && v !== undefined) acc++;
      }
    }
    return acc;
  }

  if (n === "IF") {
    if (args.length < 2) return ERR;
    a0 = evalCond(args[0]);
    if (a0) return evalExpr(args[1]);
    return args.length > 2 ? evalExpr(args[2]) : "";
  }

  if (n === "IFERROR") {
    if (args.length < 2) return ERR;
    try {
      v = evalExpr(args[0]);
      if (isErrorValue(v)) return evalExpr(args[1]);
      return v;
    } catch (e) {
      return evalExpr(args[1]);
    }
  }

  if (n === "ISBLANK") {
    list = rangeCells(args[0] || "");
    if (list && list.length === 1) return isEmpty(list[0].r, list[0].c);
    v = evalExpr(args[0] || "");
    return v === "" || v === null || v === undefined;
  }

  if (n === "ROUND") {
    a0 = Number(evalExpr(args[0]));
    a1 = args.length > 1 ? Number(evalExpr(args[1])) : 0;
    if (isNaN(a0)) return ERR;
    t = Math.pow(10, a1 || 0);
    return Math.round(a0 * t) / t;
  }

  if (n === "ABS") {
    a0 = Number(evalExpr(args[0]));
    return isNaN(a0) ? ERR : Math.abs(a0);
  }

  if (n === "INT") {
    a0 = Number(evalExpr(args[0]));
    return isNaN(a0) ? ERR : Math.floor(a0);
  }

  if (n === "SQRT") {
    a0 = Number(evalExpr(args[0]));
    if (isNaN(a0)) return ERR;
    if (a0 < 0) return ERR_NUM;
    return Math.sqrt(a0);
  }

  if (n === "MOD") {
    a0 = Number(evalExpr(args[0]));
    a1 = Number(evalExpr(args[1]));
    if (isNaN(a0) || isNaN(a1)) return ERR;
    if (a1 === 0) return ERR_DIV0;
    return a0 % a1;
  }

  if (n === "POWER") {
    a0 = Number(evalExpr(args[0]));
    a1 = Number(evalExpr(args[1]));
    if (isNaN(a0) || isNaN(a1)) return ERR;
    return Math.pow(a0, a1);
  }

  if (n === "LEN") return String(evalExpr(args[0])).length;
  if (n === "UPPER") return String(evalExpr(args[0])).toUpperCase();
  if (n === "LOWER") return String(evalExpr(args[0])).toLowerCase();
  if (n === "TRIM") return String(evalExpr(args[0])).replace(/^\s+|\s+$/g, "");

  if (n === "LEFT") {
    t = String(evalExpr(args[0]));
    a1 = args.length > 1 ? parseInt(evalExpr(args[1]), 10) : 1;
    return t.slice(0, a1);
  }

  if (n === "RIGHT") {
    t = String(evalExpr(args[0]));
    a1 = args.length > 1 ? parseInt(evalExpr(args[1]), 10) : 1;
    return t.slice(-a1);
  }

  if (n === "CONCAT") {
    t = "";
    for (i = 0; i < args.length; i++) t += String(evalExpr(args[i]));
    return t;
  }

  if (n === "TODAY") {
    v = new Date();
    return v.getFullYear() + "-" + pad2(v.getMonth() + 1) + "-" + pad2(v.getDate());
  }

  if (n === "NOW") {
    v = new Date();
    return v.getFullYear() + "-" + pad2(v.getMonth() + 1) + "-" + pad2(v.getDate()) +
      " " + pad2(v.getHours()) + ":" + pad2(v.getMinutes());
  }

  return ERR;
}

/**
 * Evaluate IF condition string
 */
function evalCond(s) {
  var m = s.match(/(.+?)(<=|>=|<>|==|=|<|>)(.+)/);
  var left, right, op;
  if (m) {
    left = evalExpr(m[1].trim());
    op = m[2];
    right = evalExpr(m[3].trim());
    return cmp(op, left, right);
  }
  left = evalExpr(s);
  return !!(left && left !== 0 && left !== ERR);
}

/**
 * Replace quoted strings with placeholders
 */
function pullStrings(s, bag) {
  return s.replace(/"([^"]*)"/g, function (m, inner) {
    bag.push(inner);
    return "__S" + (bag.length - 1) + "__";
  });
}

/**
 * Restore string placeholders
 */
function pushStrings(s, bag) {
  return s.replace(/__S(\d+)__/g, function (m, i) {
    return bag[parseInt(i, 10)];
  });
}

/**
 * Evaluate an expression (no leading =)
 */
function evalExpr(expr) {
  var s, bag, m, name, inside, addr, n, out;

  if (expr === undefined || expr === null) return "";
  s = String(expr).trim();
  if (s === "") return "";

  if (/^".*"$/.test(s)) return s.slice(1, -1);

  bag = [];
  s = pullStrings(s, bag);
  if (s.indexOf(ERR_REF) !== -1) fail(ERR_REF);       // a ref removed by delete row / column
  s = s.replace(/\$/g, "");                          // $ only matters when copying / filling

  var guard = 0;
  while (guard++ < 40) {
    m = s.match(/([A-Za-z][A-Za-z0-9]*)\(([^()]*)\)/);
    if (!m) break;
    name = m[1];
    /* put string literals back WITH their quotes so each argument stays a string */
    inside = m[2].replace(/__S(\d+)__/g, function (x, i) { return '"' + bag[parseInt(i, 10)] + '"'; });
    out = evalFunc(name, splitArgs(inside));
    /* errors are kept as text here so an outer IFERROR can still see them */
    if (typeof out === "number" && (isNaN(out) || !isFinite(out))) out = ERR_NUM;
    if (typeof out === "boolean") out = out ? "TRUE" : "FALSE";
    if (typeof out === "string") {
      bag.push(out);
      s = s.replace(m[0], "__S" + (bag.length - 1) + "__");
    } else {
      s = s.replace(m[0], String(out));
    }
  }

  s = s.replace(/\b([A-Za-z]{1,3}[0-9]+)\b/g, function (tok) {
    addr = parseAddr(tok);
    if (!addr) fail(ERR_REF);                      // outside the sheet (rows/cols from config)
    if (isErrorValue(rawVal(addr.r, addr.c))) fail(rawVal(addr.r, addr.c));
    n = numVal(addr.r, addr.c);
    if (!isNaN(n)) return String(n);
    bag.push(String(rawVal(addr.r, addr.c)));
    return "__S" + (bag.length - 1) + "__";
  });

  if (s.indexOf("&") >= 0) {
    out = s.split("&").map(function (part) {
      part = part.trim();
      if (/^__S\d+__$/.test(part)) {
        if (isErrorValue(pushStrings(part, bag))) fail(pushStrings(part, bag));
        return pushStrings(part, bag);
      }
      try {
        return String(roundNum(simpleMath(part)));
      } catch (e) {
        if (e instanceof CellError) throw e;
        return pushStrings(part, bag);
      }
    });
    return out.join("");
  }

  s = s.replace(/__S(\d+)__/g, function (m, i) {
    var val = bag[parseInt(i, 10)];
    if (isErrorValue(val)) fail(val);
    var num = Number(val);
    if (val !== "" && !isNaN(num)) return String(num);
    return JSON.stringify(val);
  });

  try {
    return simpleMath(s);
  } catch (e) {
    if (e instanceof CellError) throw e;
    return ERR;
  }
}

/**
 * Arithmetic only: numbers and + - * / ^ ( ), or one quoted string.
 * Small recursive-descent parser (no eval / Function). ^ is right-associative
 * (2^3^2 = 512, as before); a leading minus applies after ^ (-2^2 = -4).
 * Division by zero → #DIV/0!; overflow / NaN → #NUM!; bad syntax throws (→ #ERR).
 */
function simpleMath(s) {
  var src = String(s).trim();
  if (src === "") return "";
  if (/^".*"$/.test(src)) return JSON.parse(src);
  var toks = src.match(/(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?|[+\-*/^()]|\S/g) || [];
  var pos = 0;
  function peek() { return toks[pos]; }
  function next() { return toks[pos++]; }
  function bad() { throw new Error("bad"); }
  function num(x) {
    if (isNaN(x) || !isFinite(x)) fail(ERR_NUM);
    return x;
  }
  function primary() {
    var t = next();
    if (t === undefined) bad();
    if (t === "(") { var v = sum(); if (next() !== ")") bad(); return v; }
    if (t === "-") return -power();
    if (t === "+") return power();
    if (/^(\d|\.\d)/.test(t)) { var n = Number(t); if (isNaN(n)) bad(); return num(n); }
    bad();
  }
  function power() {
    var base = primary();
    if (peek() === "^") { next(); return num(Math.pow(base, power())); }
    return base;
  }
  function product() {
    var v = power(), op, r;
    while (peek() === "*" || peek() === "/") {
      op = next(); r = power();
      if (op === "/") { if (r === 0) fail(ERR_DIV0); v = num(v / r); }
      else v = num(v * r);
    }
    return v;
  }
  function sum() {
    var v = product(), op;
    while (peek() === "+" || peek() === "-") {
      op = next();
      v = num(op === "+" ? v + product() : v - product());
    }
    return v;
  }
  var result = sum();
  if (pos !== toks.length) bad();
  return result;
}

/**
 * Evaluate a cell formula string
 */
function evalFormula(f) {
  var s = String(f).trim();
  if (s.charAt(0) !== "=") return s;
  s = s.slice(1).trim();
  if (s.charAt(0) === '"') {
    var end = s.lastIndexOf('"');
    if (end > 0 && s.slice(end + 1).trim() === "") return s.slice(1, end);
  }
  try {
    var v = evalExpr(s);
    if (typeof v === "number") {
      if (!isFinite(v) || isNaN(v)) return ERR_NUM;
      return roundNum(v);
    }
    return v;
  } catch (e) {
    if (e instanceof CellError) return e.value;
    return ERR;                                      // bad formula (or a stack overflow)
  }
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

/**
 * Recalculate entire sheet: plain cells first, then formulas in dependency order.
 * Formulas left over after the topological sort sit on, or depend on, a cycle → #LOOP!.
 */
function recalcAll() {
  var r, c, k, i, f, n = ROWS * COLS;
  var deps = [], users = [], indeg = [], queue = [], done = 0, total = 0;
  for (k = 0; k < n; k++) { users.push(null); indeg.push(0); deps.push(null); }
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      f = cells[r][c].formula;
      if (!isFormula(f)) cells[r][c].value = f == null ? "" : f;
    }
  }
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      f = cells[r][c].formula;
      if (!isFormula(f)) continue;
      k = r * COLS + c;
      total++;
      deps[k] = formulaDeps(f);
      for (i = 0; i < deps[k].length; i++) {
        var d = deps[k][i];
        if (!isFormula(cells[Math.floor(d / COLS)][d % COLS].formula)) continue;
        indeg[k]++;
        (users[d] || (users[d] = [])).push(k);
      }
      if (indeg[k] === 0) queue.push(k);
    }
  }
  for (i = 0; i < queue.length; i++) {
    k = queue[i];
    r = Math.floor(k / COLS); c = k % COLS;
    cells[r][c].value = evalFormula(cells[r][c].formula);
    done++;
    if (users[k]) users[k].forEach(function (u) { if (--indeg[u] === 0) queue.push(u); });
  }
  if (done < total) {
    for (k = 0; k < n; k++) {
      if (deps[k] && indeg[k] > 0) cells[Math.floor(k / COLS)][k % COLS].value = ERR_LOOP;
    }
  }
}
