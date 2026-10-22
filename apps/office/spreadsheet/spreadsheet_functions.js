/*
 * spreadsheet_functions.js
 * Formula function library: evalFunc(name, args) for every function listed in FUNCTIONS.txt,
 * plus the IF comparison helper. Used by the evaluator in spreadsheet_formula.js.
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

