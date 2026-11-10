/*
 * spreadsheet_formula.js
 * Spreadsheet formula parser and evaluator.
 * Recalc is dependency-aware: refs (incl. ranges) form a graph, cells are evaluated in
 * topological order, cells on (or fed by) a cycle show #LOOP!. Arithmetic uses a small
 * parser (no eval / Function). Errors: #DIV/0! (real division by zero), #NUM! (overflow /
 * not a number), #REF! (ref outside the sheet), #ERR (bad formula). An error in a referenced
 * cell flows on to the formula (IFERROR catches it). Numeric results are rounded to
 * SPREADSHEET_CONFIG.precision significant digits (0.1+0.2 → 0.3).
 * Grid size and cell store come from spreadsheet_state.js (COLS, ROWS, COL_LETTERS, cells),
 * which reads them from SPREADSHEET_CONFIG in spreadsheet_config.js.
 * Function library: spreadsheet_functions.js. Refs / ranges / ref shifting: spreadsheet_refs.js.
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
  /* $ is consumed by mapRefs; do not strip it globally (would break 'Sheet $1'!A1) */

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

  /* SH8: resolve Sheet2!A1 / 'My Sheet'!A1 and ordinary A1 against evalSheetIdx */
  s = mapRefs("=" + s, function (x) {
    var si, rv;
    if (x.range) return refToken(x);
    si = x.sheet == null ? evalSheetIdx : findSheetIndex(x.sheet);
    if (si < 0 || x.c1 < 0 || x.c1 >= COLS || x.r1 < 0 || x.r1 >= ROWS) fail(ERR_REF);
    rv = rawVal(x.r1, x.c1, si);
    if (isErrorValue(rv)) fail(rv);
    n = numVal(x.r1, x.c1, si);
    if (!isNaN(n)) return String(n);
    bag.push(String(rv));
    return "__S" + (bag.length - 1) + "__";
  }).slice(1);

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
 * Recalculate the whole workbook: plain cells first, then formulas in dependency
 * order across sheets (Sheet1!A1 may depend on Sheet2!B1). Formulas left over
 * after the topological sort sit on, or depend on, a cycle → #LOOP!.
 */
function recalcAll() {
  var sheets = workbook.sheets, ns = sheets.length, per = ROWS * COLS, n = ns * per;
  var r, c, k, i, f, si, grid, d, dr, dc, dsi;
  var deps = [], users = [], indeg = [], queue = [], done = 0, total = 0;
  var prevEval = evalSheetIdx;
  for (k = 0; k < n; k++) { users.push(null); indeg.push(0); deps.push(null); }
  for (si = 0; si < ns; si++) {
    grid = sheets[si].cells;
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        f = grid[r][c].formula;
        if (!isFormula(f)) grid[r][c].value = f == null ? "" : f;
      }
    }
  }
  for (si = 0; si < ns; si++) {
    grid = sheets[si].cells;
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        f = grid[r][c].formula;
        if (!isFormula(f)) continue;
        k = cellIndex(si, r, c);
        total++;
        deps[k] = formulaDeps(f, si);
        for (i = 0; i < deps[k].length; i++) {
          d = deps[k][i];
          dsi = indexSheet(d); dr = indexRow(d); dc = indexCol(d);
          if (!isFormula(sheets[dsi].cells[dr][dc].formula)) continue;
          indeg[k]++;
          (users[d] || (users[d] = [])).push(k);
        }
        if (indeg[k] === 0) queue.push(k);
      }
    }
  }
  for (i = 0; i < queue.length; i++) {
    k = queue[i];
    si = indexSheet(k); r = indexRow(k); c = indexCol(k);
    evalSheetIdx = si;
    sheets[si].cells[r][c].value = evalFormula(sheets[si].cells[r][c].formula);
    done++;
    if (users[k]) users[k].forEach(function (u) { if (--indeg[u] === 0) queue.push(u); });
  }
  if (done < total) {
    for (k = 0; k < n; k++) {
      if (deps[k] && indeg[k] > 0) {
        sheets[indexSheet(k)].cells[indexRow(k)][indexCol(k)].value = ERR_LOOP;
      }
    }
  }
  evalSheetIdx = prevEval;
}
