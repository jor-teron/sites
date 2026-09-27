/*
 * formula.js
 * Spreadsheet formula parser and evaluator.
 * Grid size and cell store come from spreadsheet.js (COLS, ROWS, cells).
 * Supported: =expr, cell refs, ranges, listed functions, + - * / ^ &
 */

/* Formula error token shown in cells */
var ERR = "#ERR";

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
  var m = String(token).trim().toUpperCase().match(/^([A-Z])([1-9][0-9]{0,2})$/);
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
    if (!a || !b) return null;
    list = expandRange(a, b);
  } else {
    a = parseAddr(token);
    if (!a) return null;
    list = [a];
  }
  for (i = 0; i < list.length; i++) {
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
    if (!a || !b) return null;
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
      if (v === ERR || v === "#DIV/0!") return evalExpr(args[1]);
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
    if (isNaN(a0) || a0 < 0) return ERR;
    return Math.sqrt(a0);
  }

  if (n === "MOD") {
    a0 = Number(evalExpr(args[0]));
    a1 = Number(evalExpr(args[1]));
    if (isNaN(a0) || isNaN(a1) || a1 === 0) return ERR;
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

  var guard = 0;
  while (guard++ < 40) {
    m = s.match(/([A-Za-z][A-Za-z0-9]*)\(([^()]*)\)/);
    if (!m) break;
    name = m[1];
    inside = pushStrings(m[2], bag);
    out = evalFunc(name, splitArgs(inside));
    if (typeof out === "string") {
      bag.push(out);
      s = s.replace(m[0], "__S" + (bag.length - 1) + "__");
    } else {
      s = s.replace(m[0], String(out));
    }
  }

  s = s.replace(/\b([A-Za-z][1-9][0-9]{0,2})\b/g, function (tok) {
    addr = parseAddr(tok);
    if (!addr) return tok;
    n = numVal(addr.r, addr.c);
    if (!isNaN(n)) return String(n);
    bag.push(String(rawVal(addr.r, addr.c)));
    return "__S" + (bag.length - 1) + "__";
  });

  if (s.indexOf("&") >= 0) {
    out = s.split("&").map(function (part) {
      part = part.trim();
      if (/^__S\d+__$/.test(part)) return pushStrings(part, bag);
      try {
        return String(simpleMath(part));
      } catch (e) {
        return pushStrings(part, bag);
      }
    });
    return out.join("");
  }

  s = s.replace(/__S(\d+)__/g, function (m, i) {
    var val = bag[parseInt(i, 10)];
    var num = Number(val);
    if (val !== "" && !isNaN(num)) return String(num);
    return JSON.stringify(val);
  });

  try {
    return simpleMath(s);
  } catch (e) {
    return ERR;
  }
}

/**
 * Arithmetic only: digits and + - * / ^ ( )
 */
function simpleMath(s) {
  var safe = s.replace(/\s+/g, "");
  if (safe === "") return "";
  if (!/^[0-9+\-*/^().eE]+$/.test(safe)) {
    if (/^".*"$/.test(s.trim())) return JSON.parse(s.trim());
    throw new Error("bad");
  }
  safe = safe.replace(/\^/g, "**");
  var result = Function('"use strict"; return (' + safe + ")")();
  if (typeof result === "number" && !isFinite(result)) return "#DIV/0!";
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
    return evalExpr(s);
  } catch (e) {
    return ERR;
  }
}

/**
 * Shift A1 refs in a formula by dr, dc (autofill)
 */
function shiftFormula(formula, dr, dc) {
  if (!formula || String(formula).charAt(0) !== "=") return formula;
  return String(formula).replace(/\b([A-Za-z])([1-9][0-9]{0,2})\b/g, function (tok, letter, rowStr) {
    var c = COL_LETTERS.indexOf(letter.toUpperCase()) + dc;
    var r = parseInt(rowStr, 10) - 1 + dr;
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return tok;
    return COL_LETTERS.charAt(c) + String(r + 1);
  });
}

/**
 * Recalculate entire sheet
 */
function recalcAll() {
  var r, c, f, pass;
  for (pass = 0; pass < 2; pass++) {
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        f = cells[r][c].formula;
        if (f && String(f).charAt(0) === "=") {
          cells[r][c].value = evalFormula(f);
        } else {
          cells[r][c].value = f;
        }
      }
    }
  }
}
