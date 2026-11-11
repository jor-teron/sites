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
 * SH13: a function may return a 2D array. The anchor cell keeps the top-left value
 * and the rest is spilled into empty cells to the right and below (not stored).
 * A1# is the current spill of A1. #SPILL! when the block does not fit.
 * SH14: SORT, SORTBY, FILTER, UNIQUE. A range or array combined with a scalar,
 * or with a same-size array, uses element-wise + - * / ^ and comparisons.
 * A formula with no array still uses the scalar parser only.
 */

/* Formula error tokens shown in cells */
var ERR = "#ERR";
var ERR_DIV0 = "#DIV/0!";
var ERR_NUM = "#NUM!";
var ERR_REF = "#REF!";
var ERR_LOOP = "#LOOP!";
var ERR_NA = "#N/A";
var ERR_VALUE = "#VALUE!";
var ERR_SPILL = "#SPILL!";
var ERR_CALC = "#CALC!";
/* (before SH13): var ALL_ERRORS = [ERR, ERR_DIV0, ERR_NUM, ERR_REF, ERR_LOOP, ERR_NA, ERR_VALUE]; */
/* (before SH14): var ALL_ERRORS = [ERR, ERR_DIV0, ERR_NUM, ERR_REF, ERR_LOOP, ERR_NA, ERR_VALUE, ERR_SPILL]; */
var ALL_ERRORS = [ERR, ERR_DIV0, ERR_NUM, ERR_REF, ERR_LOOP, ERR_NA, ERR_VALUE, ERR_SPILL, ERR_CALC];

/* Array placeholders (@@n@@) share one bag per formula. Not a cell ref (no letter+digit). */
var evalArrays = [];
/* Ghost spill overlay. Rebuilt on every recalc. Never written into the cell store. */
var spillState = [];
var spillTouchFlag = { on: false };
var spillWake = null;

function isSpillArray(v) {
  return !!(v && typeof v === "object" && v.spill === 1 && Array.isArray(v.rows) &&
    v.rows.length && v.rows[0] && v.rows[0].length);
}

/* 1×1 is a normal value. Larger results stay arrays so the caller can spill them. */
function spillWrap(rows) {
  if (!rows || !rows.length || !rows[0] || !rows[0].length) fail(ERR_VALUE);
  if (rows.length === 1 && rows[0].length === 1) return rows[0][0];
  return { spill: 1, rows: rows };
}

/* A range used as an operand (A1:A3+1, B2:B10>100). 1×1 stays an array so the
   comparison still runs; spillWrap unwraps it when the expression is finished. */
function rangeRefToArray(x) {
  var si = x.sheet == null ? evalSheetIdx : findSheetIndex(x.sheet);
  var r1, r2, c1, c2, r, c, rows, row;
  if (si < 0) fail(ERR_REF);
  r1 = Math.min(x.r1, x.r2);
  r2 = Math.max(x.r1, x.r2);
  c1 = Math.min(x.c1, x.c2);
  c2 = Math.max(x.c1, x.c2);
  if (r1 < 0 || c1 < 0 || r2 >= ROWS || c2 >= COLS) fail(ERR_REF);
  rows = [];
  for (r = r1; r <= r2; r++) {
    row = [];
    for (c = c1; c <= c2; c++) row.push(rawVal(r, c, si));
    rows.push(row);
  }
  return { spill: 1, rows: rows };
}

function arrayFromToken(token) {
  var m = String(token == null ? "" : token).trim().match(/^@@(\d+)@@$/);
  if (!m || !evalArrays) return null;
  var v = evalArrays[parseInt(m[1], 10)];
  return isSpillArray(v) ? v : null;
}

function spillReset(ns) {
  spillState = [];
  var i;
  for (i = 0; i < ns; i++) spillState.push({ ghosts: Object.create(null), anchors: Object.create(null) });
}

function ghostAt(si, r, c) {
  var sh = spillState[si];
  if (!sh) return null;
  return sh.ghosts[r + "," + c] || null;
}

function spillAnchorInfo(si, r, c) {
  var sh = spillState[si];
  if (!sh) return null;
  return sh.anchors[r + "," + c] || null;
}

function readDisplay(si, r, c) {
  var g = ghostAt(si, r, c);
  if (g) return g.value;
  if (!workbook || !workbook.sheets[si]) return "";
  var v = workbook.sheets[si].cells[r][c].value;
  return v == null ? "" : v;
}

function displayedVal(r, c, si) {
  if (si == null) {
    si = (typeof workbook !== "undefined" && workbook) ? workbook.active : 0;
  }
  if (!spillState[si]) {
    var grid = typeof cellsOf === "function" ? cellsOf(si) : null;
    if (!grid || !grid[r] || !grid[r][c]) return "";
    var v = grid[r][c].value;
    return v == null ? "" : v;
  }
  return readDisplay(si, r, c);
}

function normSpill(v) {
  if (typeof v === "number") {
    if (!isFinite(v) || isNaN(v)) return ERR_NUM;
    return roundNum(v);
  }
  if (v == null) return "";
  return v;
}

function stampWrite(writeSeq, idx, seq) {
  writeSeq[idx] = seq;
  if (spillWake) spillWake(idx);
}

function clearAnchorGhosts(si, r, c) {
  var sh = spillState[si];
  if (!sh) return;
  var a = sh.anchors[r + "," + c];
  if (!a) return;
  var i, g, k;
  for (i = 0; i < a.cells.length; i++) {
    g = a.cells[i];
    k = g.r + "," + g.c;
    if (sh.ghosts[k] && sh.ghosts[k].ar === r && sh.ghosts[k].ac === c) delete sh.ghosts[k];
  }
  delete sh.anchors[r + "," + c];
}

function userOccupied(si, r, c) {
  var f = workbook.sheets[si].cells[r][c].formula;
  return !(f == null || f === "");
}

function cellMerged(si, r, c) {
  var merges = workbook.sheets[si].merges, i, m;
  if (!merges) return false;
  for (i = 0; i < merges.length; i++) {
    m = merges[i];
    if (m && r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) return true;
  }
  return false;
}

/**
 * Write a formula result. Arrays spill right and down. A blocked spill
 * (non-empty, merged, another ghost, or past the grid) shows #SPILL! and
 * writes nothing else. Ghosts are display-only.
 */
function applyFormulaResult(si, r, c, result, writeSeq, seq) {
  var grid = workbook.sheets[si].cells;
  var watch = [], seen = Object.create(null);
  function watchCell(rr, cc) {
    var id;
    if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS) return;
    id = rr + "," + cc;
    if (seen[id]) return;
    seen[id] = 1;
    watch.push({ r: rr, c: cc, before: readDisplay(si, rr, cc) });
  }
  var old = spillAnchorInfo(si, r, c);
  var i, rr, cc, rows = null, h = 0, w = 0;
  watchCell(r, c);
  if (old && old.cells) {
    for (i = 0; i < old.cells.length; i++) watchCell(old.cells[i].r, old.cells[i].c);
  }
  if (isSpillArray(result)) {
    rows = result.rows;
    h = rows.length;
    w = rows[0].length;
    if (r + h <= ROWS && c + w <= COLS) {
      for (rr = 0; rr < h; rr++) for (cc = 0; cc < w; cc++) watchCell(r + rr, c + cc);
    }
  }
  clearAnchorGhosts(si, r, c);
  if (rows) {
    var fits = r + h <= ROWS && c + w <= COLS;
    var blocked = !fits;
    if (!blocked) {
      for (rr = 0; rr < h && !blocked; rr++) {
        for (cc = 0; cc < w; cc++) {
          if (rr === 0 && cc === 0) continue;
          if (cellMerged(si, r + rr, c + cc) || userOccupied(si, r + rr, c + cc) || ghostAt(si, r + rr, c + cc)) {
            blocked = true;
          }
        }
      }
    }
    if (blocked) {
      grid[r][c].value = ERR_SPILL;
    } else {
      grid[r][c].value = normSpill(rows[0][0]);
      var owned = [], sh = spillState[si], val;
      for (rr = 0; rr < h; rr++) {
        for (cc = 0; cc < w; cc++) {
          if (rr === 0 && cc === 0) continue;
          val = normSpill(rows[rr][cc]);
          sh.ghosts[(r + rr) + "," + (c + cc)] = { ar: r, ac: c, value: val };
          owned.push({ r: r + rr, c: c + cc });
        }
      }
      if (owned.length) sh.anchors[r + "," + c] = { r: r, c: c, h: h, w: w, cells: owned };
    }
  } else {
    grid[r][c].value = result;
  }
  var spilled = false;
  for (i = 0; i < watch.length; i++) {
    var cell = watch[i];
    var after = readDisplay(si, cell.r, cell.c);
    if (after !== cell.before) {
      stampWrite(writeSeq, cellIndex(si, cell.r, cell.c), seq);
      if (cell.r !== r || cell.c !== c) spilled = true;
    }
  }
  /* A1# depends on the anchor. Wake those readers even when the top-left value stayed put. */
  if (spilled) {
    spillTouchFlag.on = true;
    stampWrite(writeSeq, cellIndex(si, r, c), seq);
  }
}

/* Whole spill of a cell, for the A1# operator. #REF! when it is not spilling. */
function readSpillRef(x) {
  var si = x.sheet == null ? evalSheetIdx : findSheetIndex(x.sheet);
  if (si < 0 || x.r1 < 0 || x.c1 < 0 || x.r1 >= ROWS || x.c1 >= COLS) return ERR_REF;
  var top = workbook.sheets[si].cells[x.r1][x.c1].value;
  var info = spillAnchorInfo(si, x.r1, x.c1);
  if (!info) return isErrorValue(top) ? top : ERR_REF;
  if (isErrorValue(top)) return top;
  var rows = [], rr, cc, row, v, g;
  for (rr = 0; rr < info.h; rr++) {
    row = [];
    for (cc = 0; cc < info.w; cc++) {
      if (rr === 0 && cc === 0) v = top;
      else {
        g = ghostAt(si, x.r1 + rr, x.c1 + cc);
        if (!g || g.ar !== x.r1 || g.ac !== x.c1) return ERR_REF;
        v = g.value;
      }
      if (isErrorValue(v)) return v;
      row.push(v);
    }
    rows.push(row);
  }
  return spillWrap(rows);
}

function markSpillLoop(si, r, c, writeSeq, seq) {
  var old = spillAnchorInfo(si, r, c);
  var owned = old && old.cells ? old.cells.slice() : [];
  var before = workbook.sheets[si].cells[r][c].value;
  var i, g, after;
  clearAnchorGhosts(si, r, c);
  workbook.sheets[si].cells[r][c].value = ERR_LOOP;
  if (before !== ERR_LOOP) stampWrite(writeSeq, cellIndex(si, r, c), seq);
  for (i = 0; i < owned.length; i++) {
    g = owned[i];
    after = readDisplay(si, g.r, g.c);
    if (after !== undefined) stampWrite(writeSeq, cellIndex(si, g.r, g.c), seq);
  }
}

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
 * Innermost named call, with parentheses allowed inside the arguments.
 * Depth is the paren depth of the name, so FILTER inside SUM is evaluated first.
 */
function findFormulaCall(s) {
  var i, ch, depth = 0, inQ = false, best = null, start, name, j, dd, q, c2, open;
  for (i = 0; i < s.length; i++) {
    ch = s.charAt(i);
    if (ch === '"') { inQ = !inQ; continue; }
    if (inQ) continue;
    if (ch === "(") { depth++; continue; }
    if (ch === ")") { if (depth > 0) depth--; continue; }
    if (!/[A-Za-z]/.test(ch)) continue;
    if (i > 0 && /[A-Za-z0-9_$]/.test(s.charAt(i - 1))) continue;
    start = i;
    while (i + 1 < s.length && /[A-Za-z0-9]/.test(s.charAt(i + 1))) i++;
    name = s.slice(start, i + 1);
    if (s.charAt(i + 1) !== "(") continue;
    open = i + 1;
    dd = 0;
    q = false;
    for (j = open; j < s.length; j++) {
      c2 = s.charAt(j);
      if (c2 === '"') { q = !q; continue; }
      if (q) continue;
      if (c2 === "(") dd++;
      else if (c2 === ")") {
        dd--;
        if (dd === 0) {
          if (!best || depth > best.depth) {
            best = { name: name, args: s.slice(open + 1, j), start: start, end: j + 1, depth: depth };
          }
          break;
        }
      }
    }
  }
  return best;
}

/**
 * Evaluate an expression (no leading =)
 */
function evalExpr(expr) {
  var s, bag, m, name, inside, addr, n, out;

  if (expr === undefined || expr === null) return "";
  s = String(expr).trim();
  if (s === "") return "";
  /* A bare array token (a function result, or A1#) is the value. */
  if (arrayFromToken(s)) return arrayFromToken(s);

  if (/^".*"$/.test(s)) return s.slice(1, -1);
  if (/^(TRUE|FALSE)$/i.test(s)) return s.toUpperCase();

  bag = [];
  s = pullStrings(s, bag);
  if (s.indexOf(ERR_REF) !== -1) fail(ERR_REF);       // a ref removed by delete row / column
  /* $ is consumed by mapRefs; do not strip it globally (would break 'Sheet $1'!A1) */

  // (before SH14) a call was /([A-Za-z][A-Za-z0-9]*)\(([^()]*)\)/ and s.replace(m[0], ...).
  // Arguments could not contain parentheses, so FILTER(range, (a>1)*(b="x")) never ran.
  // var guard = 0;
  // while (guard++ < 40) {
  //   m = s.match(/([A-Za-z][A-Za-z0-9]*)\(([^()]*)\)/);
  //   if (!m) break;
  //   name = m[1];
  //   inside = m[2].replace(/__S(\d+)__/g, function (x, i) { return '"' + bag[parseInt(i, 10)] + '"'; });
  //   out = evalFunc(name, splitArgs(inside));
  //   if (isSpillArray(out)) {
  //     evalArrays.push(out);
  //     s = s.replace(m[0], "@@" + (evalArrays.length - 1) + "@@");
  //   } else {
  //     if (typeof out === "number" && (isNaN(out) || !isFinite(out))) out = ERR_NUM;
  //     if (typeof out === "boolean") out = out ? "TRUE" : "FALSE";
  //     if (typeof out === "string") {
  //       bag.push(out);
  //       s = s.replace(m[0], "__S" + (bag.length - 1) + "__");
  //     } else s = s.replace(m[0], String(out));
  //   }
  // }
  var guard = 0, call, repl, liftRanges, av;
  while (guard++ < 40) {
    call = findFormulaCall(s);
    if (!call) break;
    name = call.name;
    /* put string literals back WITH their quotes so each argument stays a string */
    inside = call.args.replace(/__S(\d+)__/g, function (x, i) { return '"' + bag[parseInt(i, 10)] + '"'; });
    out = evalFunc(name, splitArgs(inside));
    /* SH13: any function may return a 2D array. 1×1 is already unwrapped. */
    if (isSpillArray(out)) {
      evalArrays.push(out);
      repl = "@@" + (evalArrays.length - 1) + "@@";
    } else {
      /* (before SH13) every function result was a number, boolean or string */
      /* errors are kept as text here so an outer IFERROR can still see them */
      if (typeof out === "number" && (isNaN(out) || !isFinite(out))) out = ERR_NUM;
      if (typeof out === "boolean") out = out ? "TRUE" : "FALSE";
      if (typeof out === "string") {
        bag.push(out);
        repl = "__S" + (bag.length - 1) + "__";
      } else {
        repl = String(out);
      }
    }
    s = s.slice(0, call.start) + repl + s.slice(call.end);
  }
  if (arrayFromToken(s)) return arrayFromToken(s);
  /* (before SH14): if (s.indexOf("@@") >= 0) fail(ERR_VALUE); */

  /* Lift A1:B2 to an array only when this expression does math or already has an array.
     A bare =A1:A3 stays text and is still #ERR. */
  liftRanges = s.indexOf("@@") >= 0 || /<=|>=|<>|==|[<>=+\-*/^]/.test(s);

  /* SH8: resolve Sheet2!A1 / 'My Sheet'!A1 and ordinary A1 against evalSheetIdx */
  s = mapRefs("=" + s, function (x) {
    var si, rv, sp;
    if (x.spill) {
      sp = readSpillRef(x);
      if (isErrorValue(sp)) fail(sp);
      if (isSpillArray(sp)) {
        evalArrays.push(sp);
        return "@@" + (evalArrays.length - 1) + "@@";
      }
      if (typeof sp === "number" && !isNaN(sp)) return String(sp);
      bag.push(String(sp));
      return "__S" + (bag.length - 1) + "__";
    }
    if (x.range) {
      if (liftRanges) {
        sp = rangeRefToArray(x);
        evalArrays.push(sp);
        return "@@" + (evalArrays.length - 1) + "@@";
      }
      /* (before SH14): return refToken(x); a range beside + or > stayed as A1:B2 text */
      return refToken(x);
    }
    si = x.sheet == null ? evalSheetIdx : findSheetIndex(x.sheet);
    if (si < 0 || x.c1 < 0 || x.c1 >= COLS || x.r1 < 0 || x.r1 >= ROWS) fail(ERR_REF);
    rv = rawVal(x.r1, x.c1, si);
    if (isErrorValue(rv)) fail(rv);
    n = numVal(x.r1, x.c1, si);
    if (!isNaN(n)) return String(n);
    bag.push(String(rv));
    return "__S" + (bag.length - 1) + "__";
  }).slice(1);

  if (arrayFromToken(s)) return arrayFromToken(s);
  /* (before SH14): if (s.indexOf("@@") >= 0) fail(ERR_VALUE); */
  if (s.indexOf("@@") >= 0) {
    if (s.indexOf("&") >= 0) fail(ERR_VALUE);
    av = arrayMath(s, bag);
    if (isSpillArray(av)) return spillWrap(av.rows);
    return av;
  }

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
    /* Keep formatted text ("12.30", "25%") as a string; only coerce when
       the canonical number text matches (so "10" can still be used in maths). */
    if (val !== "" && !isNaN(num) && String(num) === val) return String(num);
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
  var toks = src.match(/(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?|[+\-*/^()]|TRUE|FALSE|\S/gi) || [];
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
    if (/^TRUE$/i.test(t)) return 1;
    if (/^FALSE$/i.test(t)) return 0;
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

/* ---- SH14 element-wise array math. Scalar formulas never reach this. ---- */

function arrayToNum(v) {
  var n, t;
  if (isErrorValue(v)) return v;
  if (v === true || (typeof v === "string" && /^TRUE$/i.test(v))) return 1;
  if (v === false || (typeof v === "string" && /^FALSE$/i.test(v))) return 0;
  if (typeof v === "number") {
    if (!isFinite(v) || isNaN(v)) return ERR_NUM;
    return v;
  }
  if (v == null || v === "") return 0;
  t = String(v).trim();
  if (t === "") return ERR_VALUE;
  n = Number(t);
  if (!isNaN(n) && isFinite(n)) return n;
  return ERR_VALUE;
}

function arrayArith(op, a, b) {
  var x, y, n;
  if (isErrorValue(a)) return a;
  if (isErrorValue(b)) return b;
  x = arrayToNum(a);
  y = arrayToNum(b);
  if (isErrorValue(x)) return x;
  if (isErrorValue(y)) return y;
  if (op === "+") n = x + y;
  else if (op === "-") n = x - y;
  else if (op === "*") n = x * y;
  else if (op === "/") {
    if (y === 0) return ERR_DIV0;
    n = x / y;
  } else n = Math.pow(x, y);
  if (typeof n !== "number" || isNaN(n) || !isFinite(n)) return ERR_NUM;
  return roundNum(n);
}

function arrayFoldCmp(v) {
  if (typeof v !== "string") return v;
  if (v.trim() !== "" && !isNaN(Number(v))) return v;
  return v.toLowerCase();
}

function arrayCmpOne(op, left, right) {
  if (isErrorValue(left)) return left;
  if (isErrorValue(right)) return right;
  return cmp(op, arrayFoldCmp(left), arrayFoldCmp(right)) ? "TRUE" : "FALSE";
}

function arrayCombine(left, right, fn) {
  var la = isSpillArray(left), ra = isSpillArray(right);
  var rows, r, c, h, w, arr, scalar, leftScalar;
  if (!la && !ra) return fn(left, right);
  if (la && ra) {
    if (left.rows.length !== right.rows.length || left.rows[0].length !== right.rows[0].length) fail(ERR_VALUE);
    h = left.rows.length;
    w = left.rows[0].length;
    rows = [];
    for (r = 0; r < h; r++) {
      rows[r] = [];
      for (c = 0; c < w; c++) rows[r][c] = fn(left.rows[r][c], right.rows[r][c]);
    }
    return { spill: 1, rows: rows };
  }
  arr = la ? left : right;
  scalar = la ? right : left;
  leftScalar = !la;
  h = arr.rows.length;
  w = arr.rows[0].length;
  rows = [];
  for (r = 0; r < h; r++) {
    rows[r] = [];
    for (c = 0; c < w; c++) {
      rows[r][c] = leftScalar ? fn(scalar, arr.rows[r][c]) : fn(arr.rows[r][c], scalar);
    }
  }
  return { spill: 1, rows: rows };
}

function arrayNeg(v) {
  if (isSpillArray(v)) return arrayCombine(0, v, function (a, b) { return arrayArith("-", a, b); });
  return arrayArith("-", 0, v);
}

function arrayTokenValue(t, bag) {
  var m, v, n;
  m = /^@@(\d+)@@$/.exec(t);
  if (m) {
    v = evalArrays[parseInt(m[1], 10)];
    if (!isSpillArray(v)) fail(ERR_VALUE);
    return v;
  }
  m = /^__S(\d+)__$/.exec(t);
  if (m) {
    v = bag[parseInt(m[1], 10)];
    if (isErrorValue(v)) fail(v);
    return v;
  }
  if (/^TRUE$/i.test(t)) return "TRUE";
  if (/^FALSE$/i.test(t)) return "FALSE";
  if (/^(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?$/.test(t)) {
    n = Number(t);
    if (isNaN(n) || !isFinite(n)) fail(ERR_NUM);
    return n;
  }
  fail(ERR);
}

/**
 * Element-wise + - * / ^ and comparisons. Same-size arrays, or an array and a scalar.
 * A different shape is #VALUE!. Comparison results are TRUE / FALSE.
 */
function arrayMath(src, bag) {
  var s = String(src).trim();
  var re = /@@\d+@@|__S\d+__|(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?|<=|>=|<>|==|=|<|>|\^|[+\-*/()]|TRUE|FALSE/gi;
  var toks = [], m, last = 0, pos = 0;
  while ((m = re.exec(s))) {
    if (s.slice(last, m.index).replace(/\s+/g, "") !== "") fail(ERR);
    toks.push(m[0]);
    last = re.lastIndex;
  }
  if (s.slice(last).replace(/\s+/g, "") !== "") fail(ERR);
  function peek() { return toks[pos]; }
  function next() { return toks[pos++]; }
  function primary() {
    var t = next(), v;
    if (t === undefined) fail(ERR);
    if (t === "(") { v = comparison(); if (next() !== ")") fail(ERR); return v; }
    if (t === "-") return arrayNeg(power());
    if (t === "+") return power();
    return arrayTokenValue(t, bag);
  }
  function power() {
    var base = primary();
    if (peek() === "^") { next(); return arrayCombine(base, power(), function (a, b) { return arrayArith("^", a, b); }); }
    return base;
  }
  function product() {
    var v = power(), op;
    while (peek() === "*" || peek() === "/") {
      op = next();
      v = arrayCombine(v, power(), function (a, b) { return arrayArith(op, a, b); });
    }
    return v;
  }
  function sumExpr() {
    var v = product(), op;
    while (peek() === "+" || peek() === "-") {
      op = next();
      v = arrayCombine(v, product(), function (a, b) { return arrayArith(op, a, b); });
    }
    return v;
  }
  function comparison() {
    var v = sumExpr(), op;
    if (peek() === "<=" || peek() === ">=" || peek() === "<>" || peek() === "==" || peek() === "=" || peek() === "<" || peek() === ">") {
      op = next();
      if (op === "==") op = "=";
      v = arrayCombine(v, sumExpr(), function (a, b) { return arrayCmpOne(op, a, b); });
    }
    return v;
  }
  var result = comparison();
  if (pos !== toks.length) fail(ERR);
  return result;
}

/**
 * Evaluate a cell formula string
 */
function evalFormula(f) {
  evalArrays = [];
  var s = String(f).trim();
  if (s.charAt(0) !== "=") return s;
  s = s.slice(1).trim();
  if (s.charAt(0) === '"') {
    var end = s.lastIndexOf('"');
    if (end > 0 && s.slice(end + 1).trim() === "") return s.slice(1, end);
  }
  try {
    var v = evalExpr(s);
    if (isSpillArray(v)) return v;
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

// (before SH13) scalar-only recalcAll. It wrote evalFormula straight into cell.value
// and never spilled.
// function recalcAll() {
//   var sheets = workbook.sheets, ns = sheets.length, per = ROWS * COLS, n = ns * per;
//   var r, c, k, i, f, si, grid, d, dr, dc, dsi;
//   var deps = [], users = [], indeg = [], queue = [], done = 0, total = 0;
//   var prevEval = evalSheetIdx;
//   for (k = 0; k < n; k++) { users.push(null); indeg.push(0); deps.push(null); }
//   for (si = 0; si < ns; si++) {
//     grid = sheets[si].cells;
//     for (r = 0; r < ROWS; r++) {
//       for (c = 0; c < COLS; c++) {
//         f = grid[r][c].formula;
//         if (!isFormula(f)) grid[r][c].value = f == null ? "" : f;
//       }
//     }
//   }
//   for (si = 0; si < ns; si++) {
//     grid = sheets[si].cells;
//     for (r = 0; r < ROWS; r++) {
//       for (c = 0; c < COLS; c++) {
//         f = grid[r][c].formula;
//         if (!isFormula(f)) continue;
//         k = cellIndex(si, r, c);
//         total++;
//         deps[k] = formulaDeps(f, si);
//         for (i = 0; i < deps[k].length; i++) {
//           d = deps[k][i];
//           dsi = indexSheet(d); dr = indexRow(d); dc = indexCol(d);
//           if (!isFormula(sheets[dsi].cells[dr][dc].formula)) continue;
//           indeg[k]++;
//           (users[d] || (users[d] = [])).push(k);
//         }
//         if (indeg[k] === 0) queue.push(k);
//       }
//     }
//   }
//   for (i = 0; i < queue.length; i++) {
//     k = queue[i];
//     si = indexSheet(k); r = indexRow(k); c = indexCol(k);
//     evalSheetIdx = si;
//     sheets[si].cells[r][c].value = evalFormula(sheets[si].cells[r][c].formula);
//     done++;
//     if (users[k]) users[k].forEach(function (u) { if (--indeg[u] === 0) queue.push(u); });
//   }
//   if (done < total) {
//     for (k = 0; k < n; k++) {
//       if (deps[k] && indeg[k] > 0) {
//         sheets[indexSheet(k)].cells[indexRow(k)][indexCol(k)].value = ERR_LOOP;
//       }
//     }
//   }
//   evalSheetIdx = prevEval;
// }

/**
 * Recalculate the whole workbook: plain cells first, then formulas in dependency
 * order across sheets (Sheet1!A1 may depend on Sheet2!B1). Formulas left over
 * after the topological sort sit on, or depend on, a cycle → #LOOP!.
 * SH13: array results spill. A formula that read a ghost before the anchor ran
 * is evaluated again. That second pass is skipped when nothing spilled, so a
 * normal edit stays one evaluation per formula.
 */
function recalcAll() {
  var sheets = workbook.sheets, ns = sheets.length, per = ROWS * COLS, n = ns * per;
  var r, c, k, i, f, si, grid, d, dr, dc, dsi;
  var deps = [], users = [], readers = [], indeg = [], queue = [], done = 0, total = 0;
  var depCells = [], writeSeq = [], evalSeq = [], evalCount = [], dead = [], live = [];
  var prevEval = evalSheetIdx;
  spillTouchFlag.on = false;
  spillWake = null;
  spillReset(ns);
  for (k = 0; k < n; k++) {
    users.push(null); readers.push(null); indeg.push(0); deps.push(null); depCells.push(null);
    writeSeq.push(0); evalSeq.push(0); evalCount.push(0); dead.push(0);
  }
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
        depCells[k] = formulaDeps(f, si);
        deps[k] = depCells[k];
        for (i = 0; i < depCells[k].length; i++) {
          d = depCells[k][i];
          if (!readers[d]) readers[d] = [];
          readers[d].push(k);
          dsi = indexSheet(d); dr = indexRow(d); dc = indexCol(d);
          if (!isFormula(sheets[dsi].cells[dr][dc].formula)) continue;
          indeg[k]++;
          (users[d] || (users[d] = [])).push(k);
        }
        if (indeg[k] === 0) queue.push(k);
      }
    }
  }
  var seq = 1;
  function stale(k) {
    var list = depCells[k], j, id;
    if (dead[k] || !list) return false;
    for (j = 0; j < list.length; j++) {
      id = list[j];
      if (writeSeq[id] > evalSeq[k]) return true;
    }
    return false;
  }
  function runFormula(k) {
    var si, r, c;
    if (dead[k]) return;
    si = indexSheet(k); r = indexRow(k); c = indexCol(k);
    if (evalCount[k] >= 8) {
      dead[k] = 1;
      markSpillLoop(si, r, c, writeSeq, seq);
      evalSeq[k] = seq;
      seq++;
      return;
    }
    evalCount[k]++;
    evalSeq[k] = seq;
    seq++;
    evalSheetIdx = si;
    applyFormulaResult(si, r, c, evalFormula(sheets[si].cells[r][c].formula), writeSeq, seq);
    seq++;
  }
  for (i = 0; i < queue.length; i++) {
    k = queue[i];
    runFormula(k);
    live.push(k);
    done++;
    if (users[k]) users[k].forEach(function (u) { if (--indeg[u] === 0) queue.push(u); });
  }
  if (done < total) {
    for (k = 0; k < n; k++) {
      if (deps[k] && indeg[k] > 0) {
        si = indexSheet(k); r = indexRow(k); c = indexCol(k);
        markSpillLoop(si, r, c, writeSeq, seq);
        dead[k] = 1;
        evalSeq[k] = seq;
        seq++;
      }
    }
  }
  if (spillTouchFlag.on) {
    var q = [], qset = Object.create(null), steps = 0, limit = live.length * 8 + 8;
    function poke(k) {
      if (k == null || dead[k] || qset[k]) return;
      if (!stale(k)) return;
      qset[k] = 1;
      q.push(k);
    }
    spillWake = function (idx) {
      var list = readers[idx], j;
      if (!list) return;
      for (j = 0; j < list.length; j++) poke(list[j]);
    };
    for (i = 0; i < live.length; i++) poke(live[i]);
    while (q.length && steps < limit) {
      k = q.shift();
      qset[k] = 0;
      steps++;
      if (dead[k] || !stale(k)) continue;
      runFormula(k);
    }
    while (q.length) {
      k = q.shift();
      if (dead[k]) continue;
      si = indexSheet(k); r = indexRow(k); c = indexCol(k);
      dead[k] = 1;
      markSpillLoop(si, r, c, writeSeq, seq);
      seq++;
    }
    spillWake = null;
  }
  evalSheetIdx = prevEval;
}
