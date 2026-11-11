/*
 * spreadsheet_functions.js
 * Formula function library: evalFunc(name, args, at) for every function listed in FUNCTIONS.txt,
 * plus the IF comparison helper. Used by the evaluator in spreadsheet_formula.js.
 * SH9 adds lookups, SUMIF/COUNTIF/AVERAGEIF, logic, extra text and date functions,
 * MEDIAN/RANK/RAND, plus FX_CATALOG for the formula hint and function picker.
 * SH13: SEQUENCE and RANDARRAY return 2D arrays (spillWrap). Any function may.
 * SH14: SORT, SORTBY, FILTER, UNIQUE. Array expressions (+, comparisons) are accepted
 * by the numeric aggregates, so SUM(SEQUENCE(3)+1) and SUM(FILTER(...)) work.
 * SH16: ROW, COLUMN and INDIRECT. No-arg ROW/COLUMN use the position passed in
 * as `at` (the formula cell). INDIRECT resolves text to a cell or a range.
 * SH15: TEXTSPLIT spills through the SH13 engine. CHAR(n) is the character
 * for a code from 1 to 255 (CHAR(10) is a line break). Delimiters are one
 * string each; this parser has no array constants and no CSV quotes.
 */

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
 * Evaluate one function call.
 * SH16: `at` is the formula cell {r, c, si} (0-based). Only ROW/COLUMN with no
 * argument need it. Other functions ignore it.
 */
/* (before SH16): function evalFunc(name, args) { */
function evalFunc(name, args, at) {
  var n = name.toUpperCase();
  var nums, i, acc, a0, a1, list, t, v;

  if (n === "SUM" || n === "AVERAGE" || n === "MIN" || n === "MAX" || n === "COUNT") {
    nums = [];
    for (i = 0; i < args.length; i++) {
      list = rangeValues(args[i], true);
      if (list) nums = nums.concat(list);
      else {
        v = evalExpr(args[i]);
        /* (before SH14):
        if (typeof v === "number" && !isNaN(v)) nums.push(v);
        */
        fxPushNums(nums, v);
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
          if (!isEmpty(list[a0].r, list[a0].c, list[a0].si)) acc++;
        }
      } else {
        v = evalExpr(args[i]);
        /* (before SH14):
        if (v !== "" && v !== null && v !== undefined) acc++;
        */
        if (isSpillArray(v)) {
          for (a0 = 0; a0 < v.rows.length; a0++) {
            for (a1 = 0; a1 < v.rows[a0].length; a1++) {
              if (v.rows[a0][a1] !== "" && v.rows[a0][a1] != null) acc++;
            }
          }
        } else if (v !== "" && v !== null && v !== undefined) acc++;
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
    if (list && list.length === 1) return isEmpty(list[0].r, list[0].c, list[0].si);
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


  /* ---- SH9 helpers ---- */

  if (n === "AND") {
    if (!args.length) return ERR_VALUE;
    for (i = 0; i < args.length; i++) {
      list = rangeCells(args[i]);
      if (list) {
        for (a0 = 0; a0 < list.length; a0++) {
          v = rawVal(list[a0].r, list[a0].c, list[a0].si);
          if (isErrorValue(v)) fail(v);
          if (!fxTruthy(v)) return false;
        }
      } else {
        if (!evalCond(args[i])) return false;
      }
    }
    return true;
  }

  if (n === "OR") {
    if (!args.length) return ERR_VALUE;
    for (i = 0; i < args.length; i++) {
      list = rangeCells(args[i]);
      if (list) {
        for (a0 = 0; a0 < list.length; a0++) {
          v = rawVal(list[a0].r, list[a0].c, list[a0].si);
          if (isErrorValue(v)) fail(v);
          if (fxTruthy(v)) return true;
        }
      } else {
        if (evalCond(args[i])) return true;
      }
    }
    return false;
  }

  if (n === "NOT") {
    if (!args.length) return ERR_VALUE;
    return !evalCond(args[0]);
  }

  if (n === "IFS") {
    if (args.length < 2) return ERR;
    for (i = 0; i + 1 < args.length; i += 2) {
      if (evalCond(args[i])) return evalExpr(args[i + 1]);
    }
    return ERR_NA;
  }

  if (n === "SWITCH") {
    if (args.length < 3) return ERR;
    a0 = evalExpr(args[0]);
    if (isErrorValue(a0)) fail(a0);
    for (i = 1; i + 1 < args.length; i += 2) {
      a1 = evalExpr(args[i]);
      if (isErrorValue(a1)) fail(a1);
      if (fxEqual(a0, a1)) return evalExpr(args[i + 1]);
    }
    if (args.length % 2 === 0) return evalExpr(args[args.length - 1]);
    return ERR_NA;
  }

  if (n === "SUMIF" || n === "COUNTIF" || n === "AVERAGEIF") {
    return fxIfAgg(n, args);
  }
  if (n === "SUMIFS") return fxIfsAgg("SUM", args);
  if (n === "COUNTIFS") return fxIfsAgg("COUNT", args);
  if (n === "AVERAGEIFS") return fxIfsAgg("AVERAGE", args);

  if (n === "VLOOKUP") return fxVLookup(args);
  if (n === "HLOOKUP") return fxHLookup(args);
  if (n === "XLOOKUP") return fxXLookup(args);
  if (n === "INDEX") return fxIndex(args);
  if (n === "MATCH") return fxMatch(args);

  if (n === "MID") {
    t = String(evalExpr(args[0]));
    a0 = Math.floor(Number(evalExpr(args[1])));
    a1 = args.length > 2 ? Math.floor(Number(evalExpr(args[2]))) : t.length;
    if (isNaN(a0) || isNaN(a1) || a0 < 1 || a1 < 0) return ERR_VALUE;
    return t.substr(a0 - 1, a1);
  }

  if (n === "FIND") {
    a0 = String(evalExpr(args[0]));
    t = String(evalExpr(args[1]));
    a1 = args.length > 2 ? Math.floor(Number(evalExpr(args[2]))) : 1;
    if (isNaN(a1) || a1 < 1) return ERR_VALUE;
    i = t.indexOf(a0, a1 - 1);
    return i < 0 ? ERR_VALUE : i + 1;
  }

  if (n === "SUBSTITUTE") {
    t = String(evalExpr(args[0]));
    a0 = String(evalExpr(args[1]));
    a1 = String(evalExpr(args[2]));
    if (a0 === "") return t;
    if (args.length > 3) {
      i = Math.floor(Number(evalExpr(args[3])));
      if (isNaN(i) || i < 1) return ERR_VALUE;
      var pos = -1, seen = 0;
      while ((pos = t.indexOf(a0, pos + 1)) >= 0) {
        seen++;
        if (seen === i) return t.slice(0, pos) + a1 + t.slice(pos + a0.length);
      }
      return t;
    }
    return t.split(a0).join(a1);
  }

  if (n === "PROPER") {
    t = String(evalExpr(args[0]));
    return t.replace(/[A-Za-z0-9]+/g, function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    });
  }

  if (n === "TEXTJOIN") {
    if (args.length < 3) return ERR;
    var delim = String(evalExpr(args[0]));
    var skip = fxTruthy(evalExpr(args[1]));
    var parts = [];
    for (i = 2; i < args.length; i++) {
      list = rangeValues(args[i], false);
      if (list) {
        for (a0 = 0; a0 < list.length; a0++) {
          v = list[a0];
          if (isErrorValue(v)) fail(v);
          if (skip && (v === "" || v == null)) continue;
          parts.push(v == null ? "" : String(v));
        }
      } else {
        v = evalExpr(args[i]);
        if (isErrorValue(v)) fail(v);
        if (skip && (v === "" || v == null)) continue;
        parts.push(v == null ? "" : String(v));
      }
    }
    return parts.join(delim);
  }

  if (n === "TEXT") {
    if (args.length < 2) return ERR;
    return fxText(evalExpr(args[0]), evalExpr(args[1]));
  }

  if (n === "DATE") {
    if (args.length < 3) return ERR;
    a0 = Math.floor(Number(evalExpr(args[0])));
    a1 = Math.floor(Number(evalExpr(args[1])));
    acc = Math.floor(Number(evalExpr(args[2])));
    if (isNaN(a0) || isNaN(a1) || isNaN(acc)) return ERR_VALUE;
    return fxDateToIso(fxMakeDate(a0, a1, acc));
  }

  if (n === "YEAR" || n === "MONTH" || n === "DAY") {
    t = fxParseDate(evalExpr(args[0]));
    if (!t) return ERR_VALUE;
    if (n === "YEAR") return t.getUTCFullYear();
    if (n === "MONTH") return t.getUTCMonth() + 1;
    return t.getUTCDate();
  }

  if (n === "WEEKDAY") {
    t = fxParseDate(evalExpr(args[0]));
    if (!t) return ERR_VALUE;
    a1 = args.length > 1 ? Number(evalExpr(args[1])) : 1;
    i = t.getUTCDay(); /* 0=Sun..6=Sat */
    if (a1 === 1) return i + 1;
    if (a1 === 2) return i === 0 ? 7 : i;
    if (a1 === 3) return i === 0 ? 6 : i - 1;
    return ERR_NUM;
  }

  if (n === "DATEDIF") {
    if (args.length < 3) return ERR;
    a0 = fxParseDate(evalExpr(args[0]));
    a1 = fxParseDate(evalExpr(args[1]));
    t = String(evalExpr(args[2])).toUpperCase();
    if (!a0 || !a1) return ERR_VALUE;
    if (a0.getTime() > a1.getTime()) return ERR_NUM;
    return fxDateDif(a0, a1, t);
  }

  if (n === "EDATE") {
    if (args.length < 2) return ERR;
    a0 = fxParseDate(evalExpr(args[0]));
    a1 = Math.floor(Number(evalExpr(args[1])));
    if (!a0 || isNaN(a1)) return ERR_VALUE;
    return fxDateToIso(fxAddMonths(a0, a1));
  }

  if (n === "ROUNDUP" || n === "ROUNDDOWN") {
    a0 = Number(evalExpr(args[0]));
    a1 = args.length > 1 ? Number(evalExpr(args[1])) : 0;
    if (isNaN(a0) || isNaN(a1)) return ERR;
    t = Math.pow(10, a1 || 0);
    if (n === "ROUNDUP") {
      return a0 >= 0 ? Math.ceil(a0 * t - 1e-12) / t : Math.floor(a0 * t + 1e-12) / t;
    }
    return a0 >= 0 ? Math.floor(a0 * t + 1e-12) / t : Math.ceil(a0 * t - 1e-12) / t;
  }

  if (n === "MEDIAN") {
    nums = [];
    for (i = 0; i < args.length; i++) {
      list = rangeValues(args[i], true);
      if (list) nums = nums.concat(list);
      else {
        v = evalExpr(args[i]);
        /* (before SH14):
        if (typeof v === "number" && !isNaN(v)) nums.push(v);
        */
        fxPushNums(nums, v);
      }
    }
    if (!nums.length) return ERR_NUM;
    nums.sort(function (x, y) { return x - y; });
    i = nums.length;
    if (i % 2) return nums[(i - 1) / 2];
    return (nums[i / 2 - 1] + nums[i / 2]) / 2;
  }

  if (n === "RANK") {
    if (args.length < 2) return ERR;
    a0 = Number(evalExpr(args[0]));
    if (isNaN(a0)) return ERR_VALUE;
    list = rangeValues(args[1], true);
    if (!list || !list.length) return ERR_NA;
    a1 = args.length > 2 ? Number(evalExpr(args[2])) : 0;
    acc = 1;
    for (i = 0; i < list.length; i++) {
      if (a1 === 1) { if (list[i] < a0) acc++; }
      else if (list[i] > a0) acc++;
    }
    return acc;
  }

  if (n === "RAND") {
    return Math.random();
  }

  if (n === "RANDBETWEEN") {
    if (args.length < 2) return ERR;
    a0 = Math.ceil(Number(evalExpr(args[0])));
    a1 = Math.floor(Number(evalExpr(args[1])));
    if (isNaN(a0) || isNaN(a1)) return ERR_VALUE;
    if (a0 > a1) return ERR_NUM;
    return a0 + Math.floor(Math.random() * (a1 - a0 + 1));
  }

  /* SH13: dynamic arrays. Bad arguments return #VALUE! (a string, so IFERROR can see it).
     A size bigger than the grid returns #SPILL! without allocating a huge array. */
  if (n === "SEQUENCE") return fxSequence(args);
  if (n === "RANDARRAY") return fxRandArray(args);

  /* SH14 dynamic-array lookups. Wrong shape or a bad option is #VALUE!.
     FILTER with nothing included and no if_empty is #CALC!. */
  if (n === "SORT") return fxSort(args);
  if (n === "SORTBY") return fxSortBy(args);
  if (n === "FILTER") return fxFilter(args);
  if (n === "UNIQUE") return fxUnique(args);

  /* SH16 */
  if (n === "ROW") return fxRow(args, at);
  if (n === "COLUMN") return fxColumn(args, at);
  if (n === "INDIRECT") return fxIndirect(args);

  /* SH15 */
  if (n === "CHAR") return fxChar(args);
  if (n === "TEXTSPLIT") return fxTextSplit(args);

  return ERR;
}

/* Numbers inside a scalar or a spilled array. An error inside an array fails the call. */
function fxPushNums(nums, v) {
  var r, c, cell;
  if (isSpillArray(v)) {
    for (r = 0; r < v.rows.length; r++) {
      for (c = 0; c < v.rows[r].length; c++) {
        cell = v.rows[r][c];
        if (isErrorValue(cell)) fail(cell);
        if (typeof cell === "number" && !isNaN(cell)) nums.push(cell);
        else if (cell !== "" && cell != null && !isNaN(Number(cell)) && String(Number(cell)) === String(cell)) nums.push(Number(cell));
      }
    }
    return;
  }
  if (typeof v === "number" && !isNaN(v)) nums.push(v);
}

function fxNumFrom(x) {
  if (typeof x === "number") return x;
  if (x === "" || x == null) return NaN;
  var n = Number(x);
  return isNaN(n) ? NaN : n;
}

/* Read a number argument. missingOk uses dflt when the argument was left out. */
function fxReadNum(arg, missingOk, dflt) {
  if (arg == null || String(arg).trim() === "") return missingOk ? dflt : ERR_VALUE;
  var v;
  try { v = evalExpr(arg); }
  catch (e) {
    if (e instanceof CellError) return e.value;
    return ERR_VALUE;
  }
  if (isSpillArray(v)) return ERR_VALUE;
  if (isErrorValue(v)) return v;
  if (typeof v === "string" && /^TRUE$/i.test(v)) v = 1;
  else if (typeof v === "string" && /^FALSE$/i.test(v)) v = 0;
  if (v === "" || v == null) return ERR_VALUE;
  var n = typeof v === "number" ? v : Number(String(v).trim());
  if (typeof n !== "number" || isNaN(n) || !isFinite(n)) return ERR_VALUE;
  return n;
}

function fxReadBool(arg, dflt) {
  if (arg == null || String(arg).trim() === "") return dflt;
  var v;
  try { v = evalExpr(arg); }
  catch (e) {
    if (e instanceof CellError) return e.value;
    return ERR_VALUE;
  }
  if (isSpillArray(v)) return ERR_VALUE;
  if (isErrorValue(v)) return v;
  if (v === true || v === 1 || /^TRUE$/i.test(String(v))) return true;
  if (v === false || v === 0 || /^FALSE$/i.test(String(v))) return false;
  return ERR_VALUE;
}

/* Positive integer size. Zero, negative, or non-numeric → #VALUE!. */
function fxReadSize(arg, missingOk, dflt) {
  var n = fxReadNum(arg, missingOk, dflt);
  if (isErrorValue(n)) return n;
  n = n < 0 ? Math.ceil(n) : Math.floor(n);
  if (n <= 0) return ERR_VALUE;
  return n;
}

function fxSequence(args) {
  var rows = fxReadSize(args[0], false);
  var cols = fxReadSize(args[1], true, 1);
  var start = fxReadNum(args[2], true, 1);
  var step = fxReadNum(args[3], true, 1);
  if (isErrorValue(rows)) return rows;
  if (isErrorValue(cols)) return cols;
  if (isErrorValue(start)) return start;
  if (isErrorValue(step)) return step;
  if (typeof ROWS === "number" && (rows > ROWS || cols > COLS)) return ERR_SPILL;
  var out = [], r, c, row, n = start;
  for (r = 0; r < rows; r++) {
    row = [];
    for (c = 0; c < cols; c++) {
      if (!isFinite(n)) return ERR_NUM;
      row.push(n);
      n = n + step;
    }
    out.push(row);
  }
  return spillWrap(out);
}

function fxRandArray(args) {
  var rows = fxReadSize(args[0], true, 1);
  var cols = fxReadSize(args[1], true, 1);
  var min = fxReadNum(args[2], true, 0);
  var max = fxReadNum(args[3], true, 1);
  var whole = fxReadBool(args[4], false);
  if (isErrorValue(rows)) return rows;
  if (isErrorValue(cols)) return cols;
  if (isErrorValue(min)) return min;
  if (isErrorValue(max)) return max;
  if (isErrorValue(whole)) return whole;
  if (whole) {
    min = Math.ceil(min);
    max = Math.floor(max);
  }
  if (min > max) return ERR_VALUE;
  if (typeof ROWS === "number" && (rows > ROWS || cols > COLS)) return ERR_SPILL;
  var out = [], r, c, row, val;
  for (r = 0; r < rows; r++) {
    row = [];
    for (c = 0; c < cols; c++) {
      if (whole) val = min + Math.floor(Math.random() * (max - min + 1));
      else val = min + Math.random() * (max - min);
      row.push(val);
    }
    out.push(row);
  }
  return spillWrap(out);
}

/* ---- SH14 SORT, SORTBY, FILTER, UNIQUE ---- */

/* A plain number, or text the sheet stored for a typed number ("10"). TRUE/FALSE stay text. */
function fxAsNumber(v) {
  var s, n;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  s = v.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  n = Number(s);
  return isFinite(n) ? n : null;
}

function fxMatrixFromSpill(v) {
  var grid = [], r, c, row;
  for (r = 0; r < v.rows.length; r++) {
    row = [];
    for (c = 0; c < v.rows[r].length; c++) row.push({ r: -1, c: -1, si: -1, v: v.rows[r][c] });
    grid.push(row);
  }
  return { rows: v.rows.length, cols: v.rows[0].length, cells: grid };
}

/* A range, an A1# / @@ array, an expression, or a scalar (as 1×1). */
function fxArgKind(arg) {
  var token, parsed, mat, v, multi, direct;
  if (arg == null || String(arg).trim() === "") return { empty: true };
  token = String(arg).trim();
  direct = false;
  try {
    if (typeof arrayFromToken === "function" && arrayFromToken(token)) direct = true;
    else {
      parsed = parseRefToken(token);
      if (parsed) {
        if (parsed.error) return { error: parsed.error };
        direct = true;
      }
    }
    if (direct) {
      mat = rangeMatrix(token);
      if (!mat || !mat.rows || !mat.cols) return { error: ERR_VALUE };
      multi = mat.rows * mat.cols > 1;
      return { mat: mat, multi: multi, single: !multi, scalar: multi ? undefined : mat.cells[0][0].v };
    }
  } catch (e) {
    if (e instanceof CellError) return { error: e.value };
    return { error: ERR_VALUE };
  }
  try { v = evalExpr(token); }
  catch (e2) {
    if (e2 instanceof CellError) return { error: e2.value };
    return { error: ERR_VALUE };
  }
  if (isErrorValue(v)) return { error: v };
  if (isSpillArray(v)) {
    mat = fxMatrixFromSpill(v);
    multi = mat.rows * mat.cols > 1;
    return { mat: mat, multi: multi, single: !multi, scalar: multi ? undefined : mat.cells[0][0].v };
  }
  return {
    scalar: v, single: true, multi: false,
    mat: { rows: 1, cols: 1, cells: [[{ r: -1, c: -1, si: -1, v: v }]] }
  };
}

function fxReadMatrix(arg) {
  var k = fxArgKind(arg);
  if (k.error) return k.error;
  if (k.empty || !k.mat) return ERR_VALUE;
  return k.mat;
}

function fxMatrixSpill(mat) {
  var rows = [], r, c, row;
  for (r = 0; r < mat.rows; r++) {
    row = [];
    for (c = 0; c < mat.cols; c++) row.push(mat.cells[r][c].v);
    rows.push(row);
  }
  return spillWrap(rows);
}

/* Numbers (and numeric text) first, then text A–Z ignoring case, blanks last.
   Descending flips the value inside a type only, so blanks stay last. */
function fxSortRank(v) {
  var n;
  if (isErrorValue(v)) return { err: v };
  if (v == null || (typeof v === "string" && v.trim() === "")) return { t: 2 };
  n = fxAsNumber(v);
  if (n != null) return { t: 0, n: n };
  return { t: 1, s: String(v).toLowerCase() };
}

function fxRankCmp(a, b, order) {
  var ka = fxSortRank(a), kb = fxSortRank(b), d;
  if (ka.err || kb.err) return 0;
  if (ka.t !== kb.t) return ka.t - kb.t;
  if (ka.t === 2) return 0;
  if (ka.t === 0) d = ka.n < kb.n ? -1 : ka.n > kb.n ? 1 : 0;
  else d = ka.s < kb.s ? -1 : ka.s > kb.s ? 1 : 0;
  return order < 0 ? -d : d;
}

function fxOrderIndices(n, specs) {
  var idx = [], i, s, v;
  for (s = 0; s < specs.length; s++) {
    for (i = 0; i < specs[s].vals.length; i++) {
      v = specs[s].vals[i];
      if (isErrorValue(v)) return v;
    }
  }
  for (i = 0; i < n; i++) idx.push(i);
  idx.sort(function (a, b) {
    var k, d;
    for (k = 0; k < specs.length; k++) {
      d = fxRankCmp(specs[k].vals[a], specs[k].vals[b], specs[k].order);
      if (d) return d;
    }
    return a - b;
  });
  return idx;
}

function fxPermute(mat, idx, dir) {
  var rows = [], r, c, i;
  if (isErrorValue(idx)) return idx;
  if (!idx.length) return ERR_CALC;
  if (dir === "row") {
    for (i = 0; i < idx.length; i++) {
      rows[i] = [];
      for (c = 0; c < mat.cols; c++) rows[i][c] = mat.cells[idx[i]][c].v;
    }
  } else {
    for (r = 0; r < mat.rows; r++) {
      rows[r] = [];
      for (i = 0; i < idx.length; i++) rows[r][i] = mat.cells[r][idx[i]].v;
    }
  }
  return spillWrap(rows);
}

/* "row" = reorder rows using a column key. "col" = reorder columns using a row key. */
function fxByDir(mat, by) {
  var vertical, horizontal;
  if (!by || by.rows < 1 || by.cols < 1) return ERR_VALUE;
  if (by.rows > 1 && by.cols > 1) return ERR_VALUE;
  vertical = by.cols === 1 && by.rows === mat.rows;
  horizontal = by.rows === 1 && by.cols === mat.cols;
  if (vertical) return "row";
  if (horizontal) return "col";
  return ERR_VALUE;
}

function fxKeyVals(by, dir) {
  var vals = [], i;
  if (dir === "row") {
    for (i = 0; i < by.rows; i++) vals.push(by.cells[i][0].v);
  } else {
    for (i = 0; i < by.cols; i++) vals.push(by.cells[0][i].v);
  }
  return vals;
}

function fxAsOrder(v) {
  var n;
  if (isErrorValue(v)) return v;
  n = fxAsNumber(v);
  if (n === 1 || n === -1) return n;
  return ERR_VALUE;
}

function fxSort(args) {
  var mat, index, order, byCol, vals, i, n, dir;
  if (!args || !args.length) return ERR;
  mat = fxReadMatrix(args[0]);
  if (isErrorValue(mat)) return mat;
  if (!mat || !mat.rows || !mat.cols) return ERR_VALUE;
  index = fxReadNum(args.length > 1 ? args[1] : "", true, 1);
  order = fxReadNum(args.length > 2 ? args[2] : "", true, 1);
  byCol = fxReadBool(args.length > 3 ? args[3] : "", false);
  if (isErrorValue(index)) return index;
  if (isErrorValue(order)) return order;
  if (isErrorValue(byCol)) return byCol;
  if (order !== 1 && order !== -1) return ERR_VALUE;
  index = Math.floor(index);
  vals = [];
  if (byCol) {
    if (index < 1 || index > mat.rows) return ERR_VALUE;
    dir = "col";
    n = mat.cols;
    for (i = 0; i < n; i++) vals.push(mat.cells[index - 1][i].v);
  } else {
    if (index < 1 || index > mat.cols) return ERR_VALUE;
    dir = "row";
    n = mat.rows;
    for (i = 0; i < n; i++) vals.push(mat.cells[i][index - 1].v);
  }
  return fxPermute(mat, fxOrderIndices(n, [{ vals: vals, order: order }]), dir);
}

function fxSortBy(args) {
  var mat, i, by, nxt, order, d, dir, specs, n;
  if (!args || args.length < 2) return ERR_VALUE;
  mat = fxReadMatrix(args[0]);
  if (isErrorValue(mat)) return mat;
  if (!mat || !mat.rows || !mat.cols) return ERR_VALUE;
  i = 1;
  dir = null;
  specs = [];
  while (i < args.length) {
    by = fxArgKind(args[i]);
    if (by.error) return by.error;
    if (by.empty || !by.mat) return ERR_VALUE;
    i++;
    order = 1;
    if (i < args.length) {
      nxt = fxArgKind(args[i]);
      if (nxt.error) return nxt.error;
      if (nxt.multi) {
        /* the next by_array; this key keeps ascending */
      } else if (nxt.empty) {
        order = 1;
        i++;
      } else {
        order = fxAsOrder(nxt.scalar);
        if (isErrorValue(order)) return order;
        i++;
      }
    }
    d = fxByDir(mat, by.mat);
    if (isErrorValue(d)) return d;
    if (dir == null) dir = d;
    else if (dir !== d) return ERR_VALUE;
    specs.push({ vals: fxKeyVals(by.mat, d), order: order });
  }
  if (!specs.length) return ERR_VALUE;
  n = dir === "row" ? mat.rows : mat.cols;
  return fxPermute(mat, fxOrderIndices(n, specs), dir);
}

function fxIncludeFlag(v) {
  var n;
  if (isErrorValue(v)) return v;
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === "number") return isFinite(v) && v !== 0;
  if (v == null || (typeof v === "string" && v.trim() === "")) return false;
  if (typeof v === "string" && /^TRUE$/i.test(v.trim())) return true;
  if (typeof v === "string" && /^FALSE$/i.test(v.trim())) return false;
  n = fxAsNumber(v);
  if (n != null) return n !== 0;
  return ERR_VALUE;
}

function fxLooseValue(arg) {
  var k = fxArgKind(arg);
  if (k.error) return k.error;
  if (k.empty) return "";
  if (k.multi) return fxMatrixSpill(k.mat);
  if (k.scalar !== undefined) return k.scalar;
  if (k.mat) return fxMatrixSpill(k.mat);
  return ERR_VALUE;
}

function fxFilter(args) {
  var mat, inc, dir, i, f, keep, vertical, horizontal, n;
  if (!args || args.length < 2) return ERR;
  mat = fxReadMatrix(args[0]);
  if (isErrorValue(mat)) return mat;
  if (!mat || !mat.rows || !mat.cols) return ERR_VALUE;
  inc = fxReadMatrix(args[1]);
  if (isErrorValue(inc)) return inc;
  if (!inc || !inc.rows || !inc.cols) return ERR_VALUE;
  if (inc.rows > 1 && inc.cols > 1) return ERR_VALUE;
  vertical = inc.cols === 1 && inc.rows === mat.rows;
  horizontal = inc.rows === 1 && inc.cols === mat.cols;
  if (vertical) dir = "row";
  else if (horizontal) dir = "col";
  else return ERR_VALUE;
  n = dir === "row" ? mat.rows : mat.cols;
  keep = [];
  for (i = 0; i < n; i++) {
    f = fxIncludeFlag(dir === "row" ? inc.cells[i][0].v : inc.cells[0][i].v);
    if (typeof f !== "boolean") return f;
    if (f) keep.push(i);
  }
  if (!keep.length) {
    if (args.length < 3) return ERR_CALC;
    return fxLooseValue(args[2]);
  }
  return fxPermute(mat, keep, dir);
}

function fxSameVal(a, b) {
  var na, nb, aBlank, bBlank;
  if (isErrorValue(a) || isErrorValue(b)) return String(a) === String(b);
  aBlank = a == null || (typeof a === "string" && a.trim() === "");
  bBlank = b == null || (typeof b === "string" && b.trim() === "");
  if (aBlank || bBlank) return aBlank && bBlank;
  na = fxAsNumber(a);
  nb = fxAsNumber(b);
  if (na != null || nb != null) return na != null && nb != null && na === nb;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function fxLineOf(mat, i, byCol) {
  var out = [], k;
  if (!byCol) {
    for (k = 0; k < mat.cols; k++) out.push(mat.cells[i][k].v);
  } else {
    for (k = 0; k < mat.rows; k++) out.push(mat.cells[k][i].v);
  }
  return out;
}

function fxLineEq(a, b) {
  var i;
  if (a.length !== b.length) return false;
  for (i = 0; i < a.length; i++) if (!fxSameVal(a[i], b[i])) return false;
  return true;
}

function fxUnique(args) {
  var mat, byCol, once, n, lines, i, j, keep, count;
  if (!args || !args.length) return ERR;
  mat = fxReadMatrix(args[0]);
  if (isErrorValue(mat)) return mat;
  if (!mat || !mat.rows || !mat.cols) return ERR_VALUE;
  byCol = fxReadBool(args.length > 1 ? args[1] : "", false);
  once = fxReadBool(args.length > 2 ? args[2] : "", false);
  if (isErrorValue(byCol)) return byCol;
  if (isErrorValue(once)) return once;
  n = byCol ? mat.cols : mat.rows;
  lines = [];
  for (i = 0; i < n; i++) lines.push(fxLineOf(mat, i, byCol));
  keep = [];
  if (!once) {
    for (i = 0; i < n; i++) {
      for (j = 0; j < i; j++) if (fxLineEq(lines[i], lines[j])) break;
      if (j === i) keep.push(i);
    }
  } else {
    for (i = 0; i < n; i++) {
      count = 0;
      for (j = 0; j < n; j++) if (fxLineEq(lines[i], lines[j])) count++;
      if (count === 1) keep.push(i);
    }
  }
  if (!keep.length) return ERR_CALC;
  return fxPermute(mat, keep, byCol ? "col" : "row");
}

/* ---- SH9 function helpers (pure; used by evalFunc and the tests) ---- */

function fxTruthy(v) {
  if (v === true || v === "TRUE") return true;
  if (v === false || v === "FALSE" || v === "" || v == null) return false;
  if (typeof v === "number") return v !== 0;
  var n = Number(v);
  if (v !== "" && !isNaN(n)) return n !== 0;
  return String(v) !== "";
}

function fxEqual(a, b) {
  if (isErrorValue(a)) fail(a);
  if (isErrorValue(b)) fail(b);
  var an = Number(a), bn = Number(b);
  var aNum = a !== "" && a != null && !isNaN(an);
  var bNum = b !== "" && b != null && !isNaN(bn);
  if (aNum && bNum) return an === bn;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function fxCmpVal(a, b) {
  var an = Number(a), bn = Number(b);
  var aNum = a !== "" && a != null && !isNaN(an);
  var bNum = b !== "" && b != null && !isNaN(bn);
  if (aNum && bNum) return an < bn ? -1 : (an > bn ? 1 : 0);
  var as = String(a).toLowerCase(), bs = String(b).toLowerCase();
  return as < bs ? -1 : (as > bs ? 1 : 0);
}

function fxWildcardRe(pat) {
  var s = String(pat), out = "", i, ch, esc = false;
  for (i = 0; i < s.length; i++) {
    ch = s.charAt(i);
    if (esc) {
      out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      esc = false;
      continue;
    }
    if (ch === "~") { esc = true; continue; }
    if (ch === "*") { out += ".*"; continue; }
    if (ch === "?") { out += "."; continue; }
    out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + out + "$", "i");
}

function fxMatchCriteria(value, criteria) {
  if (isErrorValue(value)) fail(value);
  if (criteria === "" || criteria == null) return value === "" || value == null;
  if (typeof criteria === "number" || (typeof criteria === "boolean")) return fxEqual(value, criteria);
  var s = String(criteria), op, rhs, m;
  m = s.match(/^(<=|>=|<>|==|=|<|>)(.*)$/);
  if (m) {
    op = m[1] === "==" ? "=" : m[1];
    rhs = m[2];
    if (rhs !== "" && !isNaN(Number(rhs))) rhs = Number(rhs);
    if (value === "" || value == null) {
      if (op === "<>") return true;
      return false;
    }
    return cmp(op, value, rhs);
  }
  if (/[*?]/.test(s) || s.indexOf("~") >= 0) {
    return fxWildcardRe(s).test(value == null ? "" : String(value));
  }
  return fxEqual(value, s);
}

function fxEvalCriteria(arg) {
  var s = String(arg == null ? "" : arg).trim();
  if (/^(<=|>=|<>|==|=|<|>)/.test(s) && !parseRefToken(s)) {
    if (/^".*"$/.test(s) || /^'.*'$/.test(s)) return evalExpr(s);
    return s;
  }
  return evalExpr(s);
}

function rangeMatrix(token) {
  var arr = typeof arrayFromToken === "function" ? arrayFromToken(token) : null;
  if (arr) {
    var gridA = [], ra, ca, rowA;
    for (ra = 0; ra < arr.rows.length; ra++) {
      rowA = [];
      for (ca = 0; ca < arr.rows[ra].length; ca++) rowA.push({ r: -1, c: -1, si: -1, v: arr.rows[ra][ca] });
      gridA.push(rowA);
    }
    return { rows: arr.rows.length, cols: arr.rows[0].length, cells: gridA, si: -1 };
  }
  var parsed = parseRefToken(token), list, r1, r2, c1, c2, r, c, grid, row;
  if (!parsed) return null;
  if (parsed.error) fail(parsed.error);
  list = parsed.list;
  if (!list || !list.length) return { rows: 0, cols: 0, cells: [] };
  r1 = list[0].r; r2 = list[0].r; c1 = list[0].c; c2 = list[0].c;
  for (r = 1; r < list.length; r++) {
    if (list[r].r < r1) r1 = list[r].r;
    if (list[r].r > r2) r2 = list[r].r;
    if (list[r].c < c1) c1 = list[r].c;
    if (list[r].c > c2) c2 = list[r].c;
  }
  grid = [];
  for (r = r1; r <= r2; r++) {
    row = [];
    for (c = c1; c <= c2; c++) {
      row.push({ r: r, c: c, si: list[0].si, v: rawVal(r, c, list[0].si) });
    }
    grid.push(row);
  }
  return { rows: r2 - r1 + 1, cols: c2 - c1 + 1, cells: grid, si: list[0].si };
}

function fxIfAgg(kind, args) {
  if (args.length < 2) return ERR;
  var critRange = rangeMatrix(args[0]);
  var crit = fxEvalCriteria(args[1]);
  var valRange = args.length > 2 ? rangeMatrix(args[2]) : critRange;
  if (!critRange) return ERR_VALUE;
  if (!valRange) return ERR_VALUE;
  var rows = Math.min(critRange.rows, valRange.rows);
  var cols = Math.min(critRange.cols, valRange.cols);
  var r, c, v, acc = 0, n = 0, cell;
  for (r = 0; r < rows; r++) {
    for (c = 0; c < cols; c++) {
      if (!fxMatchCriteria(critRange.cells[r][c].v, crit)) continue;
      cell = valRange.cells[r][c];
      /* (before SH13) v = rawVal(cell.r, cell.c, cell.si); arrays have no grid address */
      v = cell.r < 0 ? cell.v : rawVal(cell.r, cell.c, cell.si);
      if (isErrorValue(v)) fail(v);
      if (kind === "COUNTIF") { n++; continue; }
      v = cell.r < 0 ? fxNumFrom(cell.v) : numVal(cell.r, cell.c, cell.si);
      if (isNaN(v)) continue;
      acc += v;
      n++;
    }
  }
  if (kind === "COUNTIF") return n;
  if (kind === "AVERAGEIF") return n ? acc / n : ERR_DIV0;
  return acc;
}

function fxIfsAgg(kind, args) {
  /* SUMIFS(sum_range, c1, crit1, ...)  COUNTIFS(c1, crit1, ...) */
  var start = kind === "COUNT" ? 0 : 1;
  if (args.length < start + 2 || (args.length - start) % 2) return ERR;
  var sumRange = kind === "COUNT" ? null : rangeMatrix(args[0]);
  if (kind !== "COUNT" && !sumRange) return ERR_VALUE;
  var pairs = [], i, mat, crit, rows, cols, r, c, ok, v, acc = 0, n = 0, base = null;
  for (i = start; i < args.length; i += 2) {
    mat = rangeMatrix(args[i]);
    if (!mat) return ERR_VALUE;
    if (!base) base = mat;
    if (mat.rows !== base.rows || mat.cols !== base.cols) return ERR_VALUE;
    pairs.push({ mat: mat, crit: fxEvalCriteria(args[i + 1]) });
  }
  if (kind !== "COUNT" && (sumRange.rows !== base.rows || sumRange.cols !== base.cols)) return ERR_VALUE;
  rows = base.rows; cols = base.cols;
  for (r = 0; r < rows; r++) {
    for (c = 0; c < cols; c++) {
      ok = true;
      for (i = 0; i < pairs.length; i++) {
        if (!fxMatchCriteria(pairs[i].mat.cells[r][c].v, pairs[i].crit)) { ok = false; break; }
      }
      if (!ok) continue;
      if (kind === "COUNT") { n++; continue; }
      /* (before SH13) v = numVal(sumRange.cells[r][c].r, sumRange.cells[r][c].c, sumRange.cells[r][c].si); */
      v = sumRange.cells[r][c].r < 0 ? fxNumFrom(sumRange.cells[r][c].v) : numVal(sumRange.cells[r][c].r, sumRange.cells[r][c].c, sumRange.cells[r][c].si);
      if (isNaN(v)) continue;
      acc += v;
      n++;
    }
  }
  if (kind === "COUNT") return n;
  if (kind === "AVERAGE") return n ? acc / n : ERR_DIV0;
  return acc;
}

function fxLookupKey(v) { return v; }

function fxFindRow(col, key, approx) {
  var i, last = -1, c;
  for (i = 0; i < col.length; i++) {
    c = fxCmpVal(col[i], key);
    if (fxEqual(col[i], key)) return i;
    if (approx && c <= 0) last = i;
  }
  return approx ? last : -1;
}

function fxVLookup(args) {
  if (args.length < 3) return ERR;
  var key = evalExpr(args[0]), v;
  var mat = rangeMatrix(args[1]);
  var col = Math.floor(Number(evalExpr(args[2])));
  var approx = args.length > 3 ? fxTruthy(evalExpr(args[3])) : true;
  if (!mat) return ERR_VALUE;
  if (isNaN(col) || col < 1) return ERR_VALUE;
  if (col > mat.cols) return ERR_REF;
  var keys = [], i;
  for (i = 0; i < mat.rows; i++) {
    if (isErrorValue(mat.cells[i][0].v)) fail(mat.cells[i][0].v);
    keys.push(mat.cells[i][0].v);
  }
  i = fxFindRow(keys, key, approx);
  if (i < 0) return ERR_NA;
  v = mat.cells[i][col - 1].v;
  if (isErrorValue(v)) fail(v);
  return v;
}

function fxHLookup(args) {
  if (args.length < 3) return ERR;
  var key = evalExpr(args[0]), v;
  var mat = rangeMatrix(args[1]);
  var row = Math.floor(Number(evalExpr(args[2])));
  var approx = args.length > 3 ? fxTruthy(evalExpr(args[3])) : true;
  if (!mat) return ERR_VALUE;
  if (isNaN(row) || row < 1) return ERR_VALUE;
  if (row > mat.rows) return ERR_REF;
  var keys = [], i;
  for (i = 0; i < mat.cols; i++) {
    if (isErrorValue(mat.cells[0][i].v)) fail(mat.cells[0][i].v);
    keys.push(mat.cells[0][i].v);
  }
  i = fxFindRow(keys, key, approx);
  if (i < 0) return ERR_NA;
  v = mat.cells[row - 1][i].v;
  if (isErrorValue(v)) fail(v);
  return v;
}

function fxFlatVector(mat) {
  var out = [], r, c;
  if (!mat) return null;
  if (mat.rows === 1) {
    for (c = 0; c < mat.cols; c++) out.push(mat.cells[0][c]);
  } else if (mat.cols === 1) {
    for (r = 0; r < mat.rows; r++) out.push(mat.cells[r][0]);
  } else return null;
  return out;
}

function fxXLookup(args) {
  if (args.length < 3) return ERR;
  var key = evalExpr(args[0]), v;
  var look = fxFlatVector(rangeMatrix(args[1]));
  var ret = fxFlatVector(rangeMatrix(args[2]));
  var ifNA = args.length > 3 ? args[3] : null;
  var mode = args.length > 4 ? Number(evalExpr(args[4])) : 0;
  var search = args.length > 5 ? Number(evalExpr(args[5])) : 1;
  if (!look || !ret || look.length !== ret.length) return ERR_VALUE;
  if (isNaN(mode)) mode = 0;
  var i, idx = -1, last = -1;
  function scan(from, to, step) {
    var j, c;
    for (j = from; step > 0 ? j <= to : j >= to; j += step) {
      if (isErrorValue(look[j].v)) fail(look[j].v);
      if (mode === 0 || mode === 2) {
        if (mode === 2 && /[*?]/.test(String(key))) {
          if (fxWildcardRe(String(key)).test(String(look[j].v))) return j;
        } else if (fxEqual(look[j].v, key)) return j;
      } else {
        c = fxCmpVal(look[j].v, key);
        if (c === 0) return j;
        if (mode === -1 && c <= 0) last = j;
        if (mode === 1 && c >= 0 && last < 0) last = j;
      }
    }
    return -1;
  }
  if (search === -1) idx = scan(look.length - 1, 0, -1);
  else idx = scan(0, look.length - 1, 1);
  if (idx < 0 && (mode === -1 || mode === 1)) idx = last;
  if (idx < 0) {
    if (ifNA != null && String(ifNA).trim() !== "") return evalExpr(ifNA);
    return ERR_NA;
  }
  v = ret[idx].v;
  if (isErrorValue(v)) fail(v);
  return v;
}

function fxIndex(args) {
  if (args.length < 2) return ERR;
  var mat = rangeMatrix(args[0]), v;
  if (!mat) return ERR_VALUE;
  var row = Math.floor(Number(evalExpr(args[1])));
  var col = args.length > 2 ? Math.floor(Number(evalExpr(args[2]))) : 0;
  if (isNaN(row) || row < 0 || (args.length > 2 && (isNaN(col) || col < 0))) return ERR_VALUE;
  var r, c;
  if (mat.rows === 1 && args.length === 2) { c = row; r = 1; }
  else if (mat.cols === 1 && args.length === 2) { r = row; c = 1; }
  else { r = row; c = col || 1; }
  if (r < 1 || c < 1 || r > mat.rows || c > mat.cols) return ERR_REF;
  v = mat.cells[r - 1][c - 1].v;
  if (isErrorValue(v)) fail(v);
  return v;
}

function fxMatch(args) {
  if (args.length < 2) return ERR;
  var key = evalExpr(args[0]);
  var vec = fxFlatVector(rangeMatrix(args[1]));
  var typ = args.length > 2 ? Number(evalExpr(args[2])) : 1;
  if (!vec) return ERR_VALUE;
  if (isNaN(typ)) typ = 1;
  var i, last = -1, c;
  for (i = 0; i < vec.length; i++) {
    if (isErrorValue(vec[i].v)) fail(vec[i].v);
    c = fxCmpVal(vec[i].v, key);
    if (typ === 0) {
      if (fxEqual(vec[i].v, key)) return i + 1;
    } else if (typ === 1) {
      if (c <= 0) last = i;
    } else if (typ === -1) {
      if (c >= 0 && last < 0) last = i;
    }
  }
  if (typ === 0) return ERR_NA;
  return last < 0 ? ERR_NA : last + 1;
}

/* Dates are handled as UTC calendar dates so YEAR/MONTH/DAY stay stable.
   A number is treated as an Excel serial (1899-12-30 + days; dates from
   1 March 1900 match Excel, earlier serials may be a day off because of
   Excel's 1900 leap-year bug — we do not reproduce that bug). */
function fxPad2(n) { return n < 10 ? "0" + n : String(n); }

function fxMakeDate(y, m, d) {
  if (y >= 0 && y < 100) y += 1900;
  var dt = new Date(Date.UTC(y, m - 1, d));
  return dt;
}

function fxDateToIso(dt) {
  return dt.getUTCFullYear() + "-" + fxPad2(dt.getUTCMonth() + 1) + "-" + fxPad2(dt.getUTCDate());
}

function fxParseDate(v) {
  if (v === "" || v == null) return null;
  if (typeof v === "number" && isFinite(v)) {
    var ms = Math.round((v - 25569) * 86400000);
    var d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return d;
  }
  var s = String(v).trim(), m, y, mo, da, d;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
    return isNaN(d.getTime()) ? null : d;
  }
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    da = +m[1]; mo = +m[2]; y = +m[3];
    if (mo > 12 && da <= 12) { var tmp = da; da = mo; mo = tmp; }
    d = new Date(Date.UTC(y, mo - 1, da));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function fxAddMonths(dt, months) {
  var y = dt.getUTCFullYear(), m = dt.getUTCMonth() + months, day = dt.getUTCDate();
  var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  if (day > last) day = last;
  return new Date(Date.UTC(y, m, day, dt.getUTCHours(), dt.getUTCMinutes(), dt.getUTCSeconds()));
}

function fxDateDif(a, b, unit) {
  var y = b.getUTCFullYear() - a.getUTCFullYear();
  var m = b.getUTCMonth() - a.getUTCMonth();
  var d = b.getUTCDate() - a.getUTCDate();
  if (unit === "Y") {
    if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) y--;
    return y;
  }
  if (unit === "M") {
    m = y * 12 + m;
    if (b.getUTCDate() < a.getUTCDate()) m--;
    return m;
  }
  if (unit === "D") return Math.round((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())) / 86400000);
  if (unit === "YM") {
    m = b.getUTCMonth() - a.getUTCMonth();
    if (b.getUTCDate() < a.getUTCDate()) m--;
    if (m < 0) m += 12;
    return m;
  }
  if (unit === "MD") {
    if (d >= 0) return d;
    var prev = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate();
    return prev + d;
  }
  if (unit === "YD") {
    var start = new Date(Date.UTC(b.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()));
    if (start.getTime() > b.getTime()) start = new Date(Date.UTC(b.getUTCFullYear() - 1, a.getUTCMonth(), a.getUTCDate()));
    return Math.round((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) / 86400000);
  }
  return ERR;
}

function fxText(value, fmt) {
  fmt = String(fmt == null ? "" : fmt);
  if (fmt === "") return String(value == null ? "" : value);
  var dt = fxParseDate(value);
  var isDateFmt = /y{2,4}|m{1,4}|d{1,2}|h{1,2}|s{1,2}/i.test(fmt) && /[yYmMdDhHsS]/.test(fmt) && !/^0/.test(fmt) && fmt.indexOf("%") < 0;
  if (dt && isDateFmt) return fxTextDate(dt, fmt);
  var n = typeof value === "number" ? value : (String(value).trim() !== "" && !isNaN(Number(value)) ? Number(value) : null);
  if (n === null || !isFinite(n)) return String(value == null ? "" : value);
  var pct = /%$/.test(fmt), commas = /#,/.test(fmt), dec = 0, m, s;
  var body = fmt.replace(/%$/, "");
  m = body.match(/0\.(0+)/);
  if (m) dec = m[1].length;
  if (pct) n = n * 100;
  if (commas) s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  else s = Math.abs(n).toFixed(dec);
  if (n < 0 && s !== (0).toFixed(dec) && s !== "0") s = "-" + s;
  if (pct) s += "%";
  return s;
}

function fxTextDate(dt, fmt) {
  var y = dt.getUTCFullYear(), mo = dt.getUTCMonth() + 1, da = dt.getUTCDate();
  var hh = dt.getUTCHours(), mm = dt.getUTCMinutes(), ss = dt.getUTCSeconds();
  var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var hasH = /h/i.test(fmt);
  var out = "", i = 0, ch, run, low;
  var s = fmt;
  while (i < s.length) {
    ch = s.charAt(i);
    low = ch.toLowerCase();
    run = 1;
    while (i + run < s.length && s.charAt(i + run).toLowerCase() === low) run++;
    if (low === "y") {
      out += run >= 4 ? String(y) : String(y).slice(-2);
    } else if (low === "m") {
      if (hasH && run <= 2 && /h/i.test(s.slice(0, i))) out += run === 2 ? fxPad2(mm) : String(mm);
      else if (run >= 4) out += months[mo - 1];
      else if (run === 3) out += months[mo - 1].slice(0, 3);
      else out += run === 2 ? fxPad2(mo) : String(mo);
    } else if (low === "d") {
      out += run >= 2 ? fxPad2(da) : String(da);
    } else if (low === "h") {
      out += run >= 2 ? fxPad2(hh) : String(hh);
    } else if (low === "s") {
      out += run >= 2 ? fxPad2(ss) : String(ss);
    } else {
      out += s.slice(i, i + run);
    }
    i += run;
  }
  return out;
}

/* ---- SH16 ROW, COLUMN, INDIRECT ---- */

/* Position of the formula cell. `at` is what the evaluator passed in. */
function fxHere(at) {
  return {
    r: at && typeof at.r === "number" ? at.r : (typeof evalRow === "number" ? evalRow : 0),
    c: at && typeof at.c === "number" ? at.c : (typeof evalCol === "number" ? evalCol : 0)
  };
}

/* Bounds of a reference argument, including an A1# spill. Not a ref → #VALUE!.
   Out of the sheet → #REF!. */
function fxRefSpan(token) {
  var parsed, i, cell, r1, r2, c1, c2;
  parsed = parseRefToken(String(token == null ? "" : token).trim());
  if (!parsed) return { error: ERR_VALUE };
  if (parsed.error) return { error: parsed.error };
  if (!parsed.list || !parsed.list.length) return { error: ERR_REF };
  r1 = r2 = parsed.list[0].r;
  c1 = c2 = parsed.list[0].c;
  for (i = 1; i < parsed.list.length; i++) {
    cell = parsed.list[i];
    if (cell.r < r1) r1 = cell.r;
    if (cell.r > r2) r2 = cell.r;
    if (cell.c < c1) c1 = cell.c;
    if (cell.c > c2) c2 = cell.c;
  }
  return { r1: r1, r2: r2, c1: c1, c2: c2, si: parsed.list[0].si };
}

function fxRow(args, at) {
  var span, rows, r, here;
  if (args.length > 1) return ERR_VALUE;
  if (!args.length || String(args[0]).trim() === "") {
    here = fxHere(at);
    return here.r + 1;
  }
  span = fxRefSpan(args[0]);
  if (span.error) return span.error;
  if (span.r1 === span.r2) return span.r1 + 1;
  rows = [];
  for (r = span.r1; r <= span.r2; r++) rows.push([r + 1]);
  return spillWrap(rows);
}

function fxColumn(args, at) {
  var span, row, c, here;
  if (args.length > 1) return ERR_VALUE;
  if (!args.length || String(args[0]).trim() === "") {
    here = fxHere(at);
    return here.c + 1;
  }
  span = fxRefSpan(args[0]);
  if (span.error) return span.error;
  if (span.c1 === span.c2) return span.c1 + 1;
  row = [];
  for (c = span.c1; c <= span.c2; c++) row.push(c + 1);
  return spillWrap([row]);
}

/* Text → reference. One cell is its value. A range is an array (spills, and
   SUM / the other aggregates accept it). Bad text or a cell off the grid is #REF!.
   Every cell named is a dependency so a later edit, or a formula that runs
   later in this recalc, is picked up. A loop throws #LOOP!. */
function fxIndirect(args) {
  var v, text, parsed, i, cell, r, c, r1, r2, c1, c2, si, rows, row;
  if (!args.length || String(args[0] == null ? "" : args[0]).trim() === "") return ERR_REF;
  try { v = evalExpr(args[0]); }
  catch (e) {
    if (e instanceof CellError) return e.value;
    return ERR;
  }
  if (isSpillArray(v)) return ERR_REF;
  if (isErrorValue(v)) return v;
  text = String(v == null ? "" : v).trim();
  if (!text) return ERR_REF;
  parsed = parseRefToken(text);
  if (!parsed || parsed.error || !parsed.list || !parsed.list.length) return ERR_REF;
  r1 = r2 = parsed.list[0].r;
  c1 = c2 = parsed.list[0].c;
  si = parsed.list[0].si;
  for (i = 1; i < parsed.list.length; i++) {
    cell = parsed.list[i];
    if (cell.si !== si) return ERR_REF;
    if (cell.r < r1) r1 = cell.r;
    if (cell.r > r2) r2 = cell.r;
    if (cell.c < c1) c1 = cell.c;
    if (cell.c > c2) c2 = cell.c;
  }
  for (r = r1; r <= r2; r++) {
    for (c = c1; c <= c2; c++) noteDynamicDep(si, r, c);
  }
  rows = [];
  for (r = r1; r <= r2; r++) {
    row = [];
    for (c = c1; c <= c2; c++) row.push(rawVal(r, c, si));
    rows.push(row);
  }
  return spillWrap(rows);
}

/* ---- SH15 CHAR and TEXTSPLIT ---- */

/* Character for a code from 1 to 255. CHAR(10) is a line break, CHAR(65) is A.
   Outside that range, or not a number, is #VALUE!. */
function fxChar(args) {
  var n;
  if (!args.length || String(args[0]).trim() === "") return ERR_VALUE;
  n = fxReadNum(args[0], false);
  if (isErrorValue(n)) return n;
  n = n < 0 ? Math.ceil(n) : Math.floor(n);
  if (n < 1 || n > 255) return ERR_VALUE;
  return String.fromCharCode(n);
}

/* Where `delim` sits in `text` at or after `from`. Case-fold compares equal
   length slices, so a delimiter is not a regular expression. */
function fxDelimAt(text, delim, from, ignoreCase) {
  var n = delim.length, i, slice, needle;
  if (!n) return -1;
  needle = ignoreCase ? delim.toLowerCase() : delim;
  for (i = from; i + n <= text.length; i++) {
    slice = text.substring(i, i + n);
    if ((ignoreCase ? slice.toLowerCase() : slice) === needle) return i;
  }
  return -1;
}

/* Split `text` on every `delim`. Empty pieces stay unless ignoreEmpty.
   An empty delimiter is not used here (the caller treats that as "do not split"). */
function fxSplitParts(text, delim, ignoreCase, ignoreEmpty) {
  var parts, i, at, kept, k;
  if (!delim) return ignoreEmpty && text === "" ? [] : [text];
  if (!ignoreCase) parts = text.split(delim);
  else {
    parts = [];
    i = 0;
    for (;;) {
      at = fxDelimAt(text, delim, i, true);
      if (at < 0) { parts.push(text.slice(i)); break; }
      parts.push(text.slice(i, at));
      i = at + delim.length;
      if (i >= text.length) { parts.push(""); break; }
    }
  }
  if (!ignoreEmpty) return parts;
  kept = [];
  for (k = 0; k < parts.length; k++) if (parts[k] !== "") kept.push(parts[k]);
  return kept;
}

/* One TEXTSPLIT value.
   mode "text": a blank argument is #VALUE!.
   mode "delim": a blank argument means "no delimiter" ("").
   mode "pad": keep the value as-is (a number stays a number).
   A range, or any array that is not 1×1, is #VALUE!. One cell is its value. */
function fxSplitOne(arg, mode) {
  var token, parsed, arr, v, cell;
  if (arg == null || String(arg).trim() === "") return mode === "delim" ? "" : ERR_VALUE;
  token = String(arg).trim();
  parsed = parseRefToken(token);
  if (parsed) {
    if (parsed.error) return parsed.error;
    if (!parsed.list || parsed.list.length !== 1) return ERR_VALUE;
    cell = parsed.list[0];
    v = rawVal(cell.r, cell.c, cell.si);
    if (mode !== "pad") {
      if (isErrorValue(v)) return v;
      return v == null ? "" : String(v);
    }
    return v;
  }
  arr = typeof arrayFromToken === "function" ? arrayFromToken(token) : null;
  if (arr) {
    if (arr.rows.length !== 1 || !arr.rows[0] || arr.rows[0].length !== 1) return ERR_VALUE;
    v = arr.rows[0][0];
    if (mode !== "pad") {
      if (isErrorValue(v)) return v;
      return v == null ? "" : String(v);
    }
    return v;
  }
  try { v = evalExpr(token); }
  catch (e) {
    if (e instanceof CellError) return e.value;
    return ERR;
  }
  if (isSpillArray(v)) {
    if (v.rows.length !== 1 || !v.rows[0] || v.rows[0].length !== 1) return ERR_VALUE;
    v = v.rows[0][0];
  }
  if (mode !== "pad") {
    if (isErrorValue(v)) return v;
    return v == null ? "" : String(v);
  }
  return v;
}

/* TEXTSPLIT(text, col_delimiter, [row_delimiter], [ignore_empty], [match_mode], [pad_with])
   Row delimiter first, then each row by the column delimiter. Plain split:
   quotes are ordinary characters. No array-constant delimiter ({",",";"}).
   Empty column delimiter and no row delimiter is #VALUE!. A range is #VALUE!. */
function fxTextSplit(args) {
  var text, colD, rowD, skip, mode, pad, lines, grid, i, cells, w, r, row;
  if (!args || !args.length) return ERR;
  text = fxSplitOne(args[0], "text");
  if (isErrorValue(text)) return text;
  colD = fxSplitOne(args.length > 1 ? args[1] : "", "delim");
  if (isErrorValue(colD)) return colD;
  rowD = fxSplitOne(args.length > 2 ? args[2] : "", "delim");
  if (isErrorValue(rowD)) return rowD;
  if (colD === "" && rowD === "") return ERR_VALUE;
  skip = fxReadBool(args.length > 3 ? args[3] : null, false);
  if (isErrorValue(skip)) return skip;
  mode = fxReadNum(args.length > 4 ? args[4] : null, true, 0);
  if (isErrorValue(mode)) return mode;
  if (mode !== 0 && mode !== 1) return ERR_VALUE;
  if (args.length > 5 && String(args[5]).trim() !== "") {
    pad = fxSplitOne(args[5], "pad");
    if (isErrorValue(pad)) return pad;
  } else pad = ERR_NA;
  lines = rowD ? fxSplitParts(text, rowD, mode === 1, skip) : [text];
  grid = [];
  w = 0;
  for (i = 0; i < lines.length; i++) {
    cells = colD ? fxSplitParts(lines[i], colD, mode === 1, skip) : [lines[i]];
    if (!cells.length) continue;
    if (cells.length > w) w = cells.length;
    grid.push(cells);
  }
  if (!grid.length || !w) return ERR_VALUE;
  for (r = 0; r < grid.length; r++) {
    row = grid[r];
    while (row.length < w) row.push(pad);
  }
  return spillWrap(grid);
}

/* Catalog used by the formula hint and the function picker (SH9). */
var FX_CATALOG = [
  { name: "SUM", cat: "Math", sig: "SUM(range, ...)", hint: "Add numbers." },
  { name: "AVERAGE", cat: "Math", sig: "AVERAGE(range, ...)", hint: "Average of numbers." },
  { name: "MIN", cat: "Math", sig: "MIN(range, ...)", hint: "Smallest number." },
  { name: "MAX", cat: "Math", sig: "MAX(range, ...)", hint: "Largest number." },
  { name: "COUNT", cat: "Math", sig: "COUNT(range, ...)", hint: "Count of numbers." },
  { name: "COUNTA", cat: "Math", sig: "COUNTA(range, ...)", hint: "Count of non-empty cells." },
  { name: "ROUND", cat: "Math", sig: "ROUND(number, digits)", hint: "Round to a number of digits." },
  { name: "ROUNDUP", cat: "Math", sig: "ROUNDUP(number, digits)", hint: "Round away from zero." },
  { name: "ROUNDDOWN", cat: "Math", sig: "ROUNDDOWN(number, digits)", hint: "Round toward zero." },
  { name: "ABS", cat: "Math", sig: "ABS(number)", hint: "Absolute value." },
  { name: "INT", cat: "Math", sig: "INT(number)", hint: "Round down to an integer." },
  { name: "SQRT", cat: "Math", sig: "SQRT(number)", hint: "Square root." },
  { name: "MOD", cat: "Math", sig: "MOD(number, divisor)", hint: "Remainder after division." },
  { name: "POWER", cat: "Math", sig: "POWER(number, power)", hint: "Raise to a power." },
  { name: "MEDIAN", cat: "Math", sig: "MEDIAN(range, ...)", hint: "Middle value." },
  { name: "RANK", cat: "Math", sig: "RANK(number, range, [order])", hint: "Rank of a number in a list. Order 0 (default) is descending." },
  { name: "RAND", cat: "Math", sig: "RAND()", hint: "Random number greater than or equal to 0 and less than 1." },
  { name: "RANDBETWEEN", cat: "Math", sig: "RANDBETWEEN(bottom, top)", hint: "Random integer between bottom and top, inclusive." },
  { name: "IF", cat: "Logic", sig: "IF(condition, then, [else])", hint: "Return one value if a condition is true, another if false." },
  { name: "IFERROR", cat: "Logic", sig: "IFERROR(value, fallback)", hint: "If value is an error, return the fallback." },
  { name: "ISBLANK", cat: "Logic", sig: "ISBLANK(cell)", hint: "TRUE if the cell is empty." },
  { name: "AND", cat: "Logic", sig: "AND(cond, ...)", hint: "TRUE if every argument is true." },
  { name: "OR", cat: "Logic", sig: "OR(cond, ...)", hint: "TRUE if any argument is true." },
  { name: "NOT", cat: "Logic", sig: "NOT(cond)", hint: "Reverse a TRUE / FALSE value." },
  { name: "IFS", cat: "Logic", sig: "IFS(cond1, value1, ...)", hint: "First condition that is true, and its value. #N/A if none match." },
  { name: "SWITCH", cat: "Logic", sig: "SWITCH(expr, val1, result1, ..., [default])", hint: "Pick a result that matches expr." },
  { name: "VLOOKUP", cat: "Lookup", sig: "VLOOKUP(lookup_value, table, col_index, [range_lookup])", hint: "Look down the first column and return a value from the same row. range_lookup TRUE (default) is approximate." },
  { name: "HLOOKUP", cat: "Lookup", sig: "HLOOKUP(lookup_value, table, row_index, [range_lookup])", hint: "Look across the first row and return a value from the same column." },
  { name: "XLOOKUP", cat: "Lookup", sig: "XLOOKUP(lookup_value, lookup_range, return_range, [if_not_found], [match_mode], [search_mode])", hint: "Look up a value and return the matching item. match_mode 0 is exact (default)." },
  { name: "INDEX", cat: "Lookup", sig: "INDEX(range, row, [column])", hint: "Value at a row (and column) in a range. 1-based." },
  { name: "ROW", cat: "Lookup", sig: "ROW([reference])", hint: "Row number of this cell, or of a reference. A range spills one number per row. A1# uses that spill." },
  { name: "COLUMN", cat: "Lookup", sig: "COLUMN([reference])", hint: "Column number of this cell (A is 1), or of a reference. A range spills one number per column." },
  { name: "INDIRECT", cat: "Lookup", sig: "INDIRECT(text)", hint: "The cell or range named by text, such as \"B2\" or \"B\"&2. A range spills and works inside SUM. A bad address is #REF!. Recalculates whenever any cell changes." },
  { name: "MATCH", cat: "Lookup", sig: "MATCH(lookup_value, range, [match_type])", hint: "Relative position of a value. Type 0 is exact, 1 (default) is the largest less than or equal." },
  { name: "SUMIF", cat: "Lookup", sig: "SUMIF(range, criteria, [sum_range])", hint: "Sum cells that meet a condition." },
  { name: "SUMIFS", cat: "Lookup", sig: "SUMIFS(sum_range, criteria_range1, criteria1, ...)", hint: "Sum cells that meet every condition." },
  { name: "COUNTIF", cat: "Lookup", sig: "COUNTIF(range, criteria)", hint: "Count cells that meet a condition." },
  { name: "COUNTIFS", cat: "Lookup", sig: "COUNTIFS(criteria_range1, criteria1, ...)", hint: "Count cells that meet every condition." },
  { name: "AVERAGEIF", cat: "Lookup", sig: "AVERAGEIF(range, criteria, [average_range])", hint: "Average of cells that meet a condition." },
  { name: "LEN", cat: "Text", sig: "LEN(text)", hint: "Number of characters." },
  { name: "UPPER", cat: "Text", sig: "UPPER(text)", hint: "Convert to upper case." },
  { name: "LOWER", cat: "Text", sig: "LOWER(text)", hint: "Convert to lower case." },
  { name: "PROPER", cat: "Text", sig: "PROPER(text)", hint: "Capitalise the first letter of each word." },
  { name: "TRIM", cat: "Text", sig: "TRIM(text)", hint: "Remove extra spaces." },
  { name: "LEFT", cat: "Text", sig: "LEFT(text, [n])", hint: "First n characters (default 1)." },
  { name: "RIGHT", cat: "Text", sig: "RIGHT(text, [n])", hint: "Last n characters (default 1)." },
  { name: "MID", cat: "Text", sig: "MID(text, start, num_chars)", hint: "Characters from a 1-based start position." },
  { name: "FIND", cat: "Text", sig: "FIND(find_text, within_text, [start])", hint: "1-based position of find_text (case-sensitive). #VALUE! if not found." },
  { name: "SUBSTITUTE", cat: "Text", sig: "SUBSTITUTE(text, old, new, [instance])", hint: "Replace old with new. Instance replaces only that occurrence." },
  { name: "CONCAT", cat: "Text", sig: "CONCAT(text, ...)", hint: "Join text values." },
  { name: "TEXTJOIN", cat: "Text", sig: "TEXTJOIN(delimiter, ignore_empty, text, ...)", hint: "Join text with a delimiter. ignore_empty TRUE skips blanks." },
  { name: "TEXT", cat: "Text", sig: "TEXT(value, format)", hint: "Format a number or date as text. Examples: 0.00, 0%, yyyy-mm-dd, dd/mm/yyyy." },
  { name: "CHAR", cat: "Text", sig: "CHAR(number)", hint: "The character for a code from 1 to 255. CHAR(10) is a line break. CHAR(65) is A. A code outside that range is #VALUE!." },
  { name: "TEXTSPLIT", cat: "Text", sig: "TEXTSPLIT(text, col_delimiter, [row_delimiter], [ignore_empty], [match_mode], [pad_with])", hint: "Split text across columns and down rows. It spills. ignore_empty TRUE skips empty pieces. match_mode 1 ignores case. Short rows are padded (default #N/A). No delimiter, or a range, is #VALUE!." },
  { name: "TODAY", cat: "Date", sig: "TODAY()", hint: "Today's date as YYYY-MM-DD." },
  { name: "NOW", cat: "Date", sig: "NOW()", hint: "Current date and time." },
  { name: "DATE", cat: "Date", sig: "DATE(year, month, day)", hint: "Build a date. Month or day overflow rolls over (DATE(2024,13,1) is 2025-01-01)." },
  { name: "YEAR", cat: "Date", sig: "YEAR(date)", hint: "Year of a date." },
  { name: "MONTH", cat: "Date", sig: "MONTH(date)", hint: "Month of a date (1–12)." },
  { name: "DAY", cat: "Date", sig: "DAY(date)", hint: "Day of the month." },
  { name: "WEEKDAY", cat: "Date", sig: "WEEKDAY(date, [return_type])", hint: "Day of the week. Type 1 (default): Sunday=1. Type 2: Monday=1. Type 3: Monday=0." },
  { name: "DATEDIF", cat: "Date", sig: "DATEDIF(start, end, unit)", hint: "Difference. Unit Y, M, D, YM, MD or YD. Start must be on or before end." },
  { name: "EDATE", cat: "Date", sig: "EDATE(start, months)", hint: "The date a number of months before or after start." },
  { name: "SEQUENCE", cat: "Arrays", sig: "SEQUENCE(rows, [cols], [start], [step])", hint: "A grid of numbers. Defaults: 1 column, start at 1, step 1. Spills into empty cells to the right and below. Zero or negative size is #VALUE!." },
  { name: "RANDARRAY", cat: "Arrays", sig: "RANDARRAY([rows], [cols], [min], [max], [whole])", hint: "A grid of random numbers. Defaults: 1×1, from 0 up to 1, decimals. whole TRUE returns integers from min to max inclusive. Spills." },
  { name: "SORT", cat: "Arrays", sig: "SORT(array, [sort_index], [sort_order], [by_col])", hint: "Sort rows (or columns if by_col is TRUE). sort_order 1 is ascending, -1 is descending. Numbers, then text ignoring case, blanks last. Ties keep their order. Spills." },
  { name: "SORTBY", cat: "Arrays", sig: "SORTBY(array, by_array1, [sort_order1], [by_array2, sort_order2], ...)", hint: "Sort by one or more arrays of the same height (or width). Order 1 is ascending, -1 descending. A different size is #VALUE!. Spills." },
  { name: "FILTER", cat: "Arrays", sig: "FILTER(array, include, [if_empty])", hint: "Keep rows where include is a matching TRUE/FALSE column, or columns where it is a matching row. No match returns if_empty, or #CALC! if it is omitted. A different size is #VALUE!." },
  { name: "UNIQUE", cat: "Arrays", sig: "UNIQUE(array, [by_col], [exactly_once])", hint: "Distinct rows, or columns if by_col is TRUE. exactly_once TRUE keeps values that appear only once. Text match ignores case. Spills." }
];

function fxFindName(name) {
  var n = String(name || "").toUpperCase(), i;
  for (i = 0; i < FX_CATALOG.length; i++) if (FX_CATALOG[i].name === n) return FX_CATALOG[i];
  return null;
}

function fxSuggest(prefix, limit) {
  var p = String(prefix || "").toUpperCase(), out = [], i;
  if (!p) return FX_CATALOG.slice(0, limit || 12);
  for (i = 0; i < FX_CATALOG.length; i++) {
    if (FX_CATALOG[i].name.indexOf(p) === 0) out.push(FX_CATALOG[i]);
  }
  for (i = 0; i < FX_CATALOG.length && out.length < (limit || 12); i++) {
    if (FX_CATALOG[i].name.indexOf(p) > 0 && out.indexOf(FX_CATALOG[i]) < 0) out.push(FX_CATALOG[i]);
  }
  return out.slice(0, limit || 12);
}

/**
 * Innermost function at the caret: { name, arg, names, item } or a typed prefix { prefix, names }.
 */
function fxCaretContext(text, caret) {
  var s = String(text || ""), i, ch, inQ = false, name, depth, stack = [], p, item, arg, names;
  if (s.charAt(0) !== "=") return null;
  if (caret == null || caret < 0 || caret > s.length) caret = s.length;
  for (i = 1; i < caret; i++) {
    ch = s.charAt(i);
    if (ch === '"') { inQ = !inQ; continue; }
    if (inQ) continue;
    if (/[A-Za-z]/.test(ch)) {
      p = i;
      while (i + 1 < caret && /[A-Za-z0-9]/.test(s.charAt(i + 1))) i++;
      if (s.charAt(i + 1) === "(") {
        stack.push({ name: s.slice(p, i + 1).toUpperCase(), arg: 0 });
        i++; /* skip ( */
      }
      continue;
    }
    if (ch === "(") { stack.push({ name: "", arg: 0 }); continue; }
    if (ch === ")" && stack.length) { stack.pop(); continue; }
    if (ch === "," && stack.length) stack[stack.length - 1].arg++;
  }
  if (stack.length) {
    name = stack[stack.length - 1].name;
    arg = stack[stack.length - 1].arg;
    item = name ? fxFindName(name) : null;
    return { name: name, arg: arg, item: item };
  }
  /* prefix just after = or after an operator / comma / ( */
  p = caret;
  while (p > 1 && /[A-Za-z0-9]/.test(s.charAt(p - 1))) p--;
  if (p < caret && /[A-Za-z]/.test(s.charAt(p))) {
    name = s.slice(p, caret);
    names = fxSuggest(name, 8);
    if (names.length) return { prefix: name, names: names, start: p, end: caret };
  }
  return null;
}
