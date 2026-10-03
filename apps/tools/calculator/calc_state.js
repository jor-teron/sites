/*
 * Calculator — calc_state.js
 * The expression being typed and every key's editing rule (no DOM here):
 * one decimal point per number, a new operator replaces the last one ("5*-" keeps a
 * unary minus), token-aware backspace, ± toggles the sign of the last number / bracket,
 * after "=" a digit starts fresh and an operator continues from the answer, repeated "="
 * repeats the last operation, history (last 20, localStorage). Changes → CALC.emit('change').
 */
(function (CALC) {
  'use strict';

  const S = CALC.state = {
    expr: '',           // internal expression text (see calc_parse.js)
    evaluated: false,   // "=" was pressed: the answer is shown big
    lastExpr: '',       // the expression that gave ans
    ans: null,          // last answer (number)
    repeat: '',         // "+3" from "2+3": what a repeated "=" applies again
    error: '',          // message after a failed "="
    angle: 'deg',
    history: []         // [{ e, r }] newest first
  };
  const P = () => CALC.parse;
  const F = () => CALC.format;
  const cfg = () => CALC.config;

  const listeners = [];
  CALC.on = (fn) => listeners.push(fn);
  CALC.emit = (kind) => { for (const fn of listeners) fn(kind || 'change'); };

  const toks = () => P().tokenize(S.expr);
  const isOperand = (t) => !!t && (t.type === 'num' || t.type === 'const' || t.type === 'rp' || t.type === 'post');
  const full = (add) => S.expr.length + (add ? add.length : 0) > cfg().maxExprLength;
  function append(s) { if (!full(s)) S.expr += s; }
  function cut(ts, k) { return ts[k] ? S.expr.slice(0, ts[k].i) : S.expr; }        // text before token k
  function replaceToken(ts, k, s) { S.expr = S.expr.slice(0, ts[k].i) + s + S.expr.slice(ts[k].i + ts[k].s.length); }

  // After "=": operands start a new expression, operators continue from the answer.
  function begin(kind) {
    S.error = '';
    if (!S.evaluated) return;
    S.evaluated = false;
    S.expr = kind === 'operator' && S.ans !== null ? F().plain(S.ans) : '';
  }

  function digit(d) {
    begin('operand');
    const ts = toks(), t = ts[ts.length - 1];
    if (t && t.type === 'num') {
      if (t.s === '0') { replaceToken(ts, ts.length - 1, d); return; }   // no leading zeros
      if (t.s.replace('.', '').length >= 16) return;                     // digits per number
      append(d);
    } else if (isOperand(t)) append('*' + d);
    else append(d);
  }

  function dot() {
    begin('operand');
    const ts = toks(), t = ts[ts.length - 1];
    if (t && t.type === 'num') { if (t.s.indexOf('.') === -1) append('.'); }
    else if (isOperand(t)) append('*0.');
    else append('0.');
  }

  function operator(op) {
    begin('operator');
    const ts = toks(), n = ts.length, t = ts[n - 1];
    if (!t) { if (op === '-') append('-'); return; }
    if (t.type === 'op') {
      if (P().isUnaryAt(ts, n - 1)) {
        if (op === '-') return;
        S.expr = cut(ts, n - 1);                         // drop the unary minus …
        const ts2 = toks(), t2 = ts2[ts2.length - 1];
        if (t2 && t2.type === 'op' && !P().isUnaryAt(ts2, ts2.length - 1)) replaceToken(ts2, ts2.length - 1, op); // … and replace the operator
        return;
      }
      if (op === '-' && (t.v === '*' || t.v === '/' || t.v === '^')) append('-');   // 5×−2
      else replaceToken(ts, n - 1, op);
      return;
    }
    if (t.type === 'lp' || t.type === 'fn') { if (op === '-') append('-'); return; }
    append(op);
  }

  // start index of the last operand (number, constant, bracket group with its function, postfixes)
  function lastOperandStart(ts) {
    let k = ts.length - 1;
    while (k >= 0 && ts[k].type === 'post') k--;
    if (k < 0) return -1;
    if (ts[k].type === 'rp') {
      let depth = 0;
      for (; k >= 0; k--) {
        if (ts[k].type === 'rp') depth++;
        else if (ts[k].type === 'lp' && --depth === 0) break;
      }
      if (k > 0 && ts[k - 1].type === 'fn') k--;
      return k;
    }
    return k;
  }

  function negate() {
    if (S.evaluated && S.ans !== null) { S.evaluated = false; S.error = ''; S.expr = F().plain(-S.ans); return; }
    S.error = '';
    const ts = toks(), n = ts.length, t = ts[n - 1];
    if (!t) { append('-'); return; }
    if (t.type === 'op') { if (P().isUnaryAt(ts, n - 1) && t.v === '-') S.expr = cut(ts, n - 1); else append('-'); return; }
    if (t.type === 'lp' || t.type === 'fn') { append('-'); return; }
    const k = lastOperandStart(ts);
    if (k < 0) return;
    const p = ts[k - 1];
    if (p && p.type === 'op' && P().isUnaryAt(ts, k - 1)) {
      if (p.v === '-') S.expr = S.expr.slice(0, p.i) + S.expr.slice(p.i + 1);   // −5 → 5
      else replaceToken(ts, k - 1, '-');
    } else if (p && p.type === 'op' && (p.v === '+' || p.v === '-')) {
      replaceToken(ts, k - 1, p.v === '+' ? '-' : '+');                         // 5+3 → 5−3
    } else if (!full('-')) {
      S.expr = S.expr.slice(0, ts[k].i) + '-' + S.expr.slice(ts[k].i);          // 5×3 → 5×−3
    }
  }

  function postfix(sym) {
    begin('operator');
    const ts = toks(), t = ts[ts.length - 1];
    if (!isOperand(t)) return;
    if (t.type === 'post' && (t.v === '%' || sym === '%')) return;       // no "%%" / "%!" / "!%"
    append(sym);
  }

  function square() {
    begin('operator');
    const t = toks().pop();
    if (isOperand(t)) append('^2');
  }

  function lparen() { begin('operand'); append('('); }

  function rparen() {
    S.error = '';
    if (S.evaluated) return;
    const ts = toks(), t = ts[ts.length - 1];
    if (P().openCount(ts) > 0 && isOperand(t)) append(')');
  }

  function func(name) { begin('operand'); append((name === 'sqrt' ? '√' : name) + '('); }

  function constant(c) { begin('operand'); append(c === 'pi' ? 'π' : 'e'); }

  // Insert a number (Ans / history): after an operator → appended, otherwise it replaces.
  function insertValue(v) {
    if (v === null || v === undefined) return;
    const s = F().plain(v);
    S.error = '';
    if (S.evaluated) { S.evaluated = false; S.expr = s; return; }
    const ts = toks(), t = ts[ts.length - 1];
    if (!t) S.expr = s;
    else if (t.type === 'op' || t.type === 'lp') {
      if (s[0] === '-' && t.type === 'op' && P().isUnaryAt(ts, ts.length - 1)) S.expr = cut(ts, ts.length - 1);
      append(s);
    } else append('*' + s);
  }

  function back() {
    S.error = '';
    if (S.evaluated) { S.evaluated = false; }
    const ts = toks(), n = ts.length, t = ts[n - 1];
    if (!t) return;
    if (t.type === 'num' && t.s.length > 1) { S.expr = S.expr.slice(0, -1); return; }
    if (t.type === 'lp' && ts[n - 2] && ts[n - 2].type === 'fn') { S.expr = cut(ts, n - 2); return; }   // "sin(" at once
    S.expr = cut(ts, n - 1);
  }

  function clear() { S.expr = ''; S.evaluated = false; S.error = ''; S.repeat = ''; }

  // "+3" from "2+3" (last top-level binary operator + its operand) for repeated "="
  function repeatTail(expr) {
    let ts;
    try { ts = P().tokenize(expr); } catch (_) { return ''; }
    let depth = 0, j = -1;
    ts.forEach((t, k) => {
      if (t.type === 'lp') depth++;
      else if (t.type === 'rp') depth--;
      else if (depth === 0 && t.type === 'op' && !P().isUnaryAt(ts, k)) j = k;
    });
    if (j < 0) return '';
    const tail = expr.slice(ts[j].i);
    return tail + ')'.repeat(P().openCount(P().tokenize(tail)));
  }

  function equals() {
    if (S.evaluated) {
      if (!S.repeat || S.ans === null) return;
      S.expr = F().plain(S.ans) + S.repeat;
    }
    if (!S.expr) return;
    let v;
    try { v = P().evaluate(S.expr, { angle: S.angle }); }
    catch (e) { S.evaluated = false; S.error = cfg().text.errors[e.code] || cfg().text.errors.syntax; return; }
    const open = P().openCount(toks());
    const shown = S.expr + ')'.repeat(open);        // auto-closed brackets become real
    if (!S.evaluated) S.repeat = repeatTail(shown);
    S.lastExpr = shown;
    S.ans = v;
    S.evaluated = true;
    S.error = '';
    if (!/^-?[\d.]+$/.test(shown)) CALC.history.push(shown, v);   // not for a plain number
  }

  // Live value of the current expression (null when incomplete / just a number)
  S.live = () => {
    if (S.evaluated || !S.expr || /^-?[\d.]+$/.test(S.expr)) return null;
    try { return P().evaluate(S.expr, { angle: S.angle }); } catch (_) { return null; }
  };

  const ACTIONS = {
    '.': dot, '+': () => operator('+'), '-': () => operator('-'), '*': () => operator('*'), '/': () => operator('/'),
    '^': () => operator('^'), '%': () => postfix('%'), '!': () => postfix('!'), '(': lparen, ')': rparen,
    neg: negate, sq: square, sqrt: () => func('sqrt'), sin: () => func('sin'), cos: () => func('cos'), tan: () => func('tan'),
    ln: () => func('ln'), log: () => func('log'), pi: () => constant('pi'), e: () => constant('e'),
    ans: () => insertValue(S.ans), '=': equals, back: back, clear: clear,
    angle: () => { S.angle = S.angle === 'deg' ? 'rad' : 'deg'; save(cfg().storage.angle, S.angle); }
  };

  // Press a key: '0'…'9' or an ACTIONS name. Returns false for unknown keys.
  CALC.press = (k) => {
    if (/^[0-9]$/.test(k)) digit(k);
    else if (ACTIONS[k]) ACTIONS[k]();
    else return false;
    CALC.emit('change');
    return true;
  };
  CALC.insertValue = (v) => { insertValue(v); CALC.emit('change'); };

  // ----- history -----
  function save(key, v) { try { localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v)); } catch (_) { /* private mode */ } }
  CALC.history = {
    load: () => {
      try {
        const h = JSON.parse(localStorage.getItem(cfg().storage.history) || '[]');
        S.history = Array.isArray(h) ? h.filter((x) => x && typeof x.e === 'string' && typeof x.r === 'number').slice(0, cfg().historyMax) : [];
      } catch (_) { S.history = []; }
      try { S.angle = localStorage.getItem(cfg().storage.angle) === 'rad' ? 'rad' : 'deg'; } catch (_) { /* ignore */ }
    },
    push: (e, r) => {
      const h = S.history;
      if (h[0] && h[0].e === e && h[0].r === r) return;
      h.unshift({ e: e, r: r });
      h.length = Math.min(h.length, cfg().historyMax);
      save(cfg().storage.history, h);
    },
    clear: () => { S.history = []; save(cfg().storage.history, []); CALC.emit('history'); }
  };
})(window.CALC);
