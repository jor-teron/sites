/*
 * Calculator — calc_parse.js
 * Safe expression evaluator (no eval): tokenizer + shunting-yard → RPN → value.
 *
 * Internal expression text (what calc_state.js builds; the display prettifies it):
 *   numbers 12  3.5  .5  7.        operators + - * / ^       postfix % !
 *   brackets ( )                    constants π e             functions sin( cos( tan( ln( log( √(
 * Rules: precedence ^ (right) > unary minus > * / > + - ; postfix % and ! bind tightest
 * (2^3! = 2^6, -3! = -6, -2^2 = -4, 2^-1 = 0.5); implicit × (2π, 2(3), (1)(2), 3sin(30));
 * missing ")" at the end are closed automatically; a + b% = a + a·b/100 (also −),
 * a × b% = a·b/100, b% alone = b/100.
 * Errors are thrown as { code } with code in div0 | domain | undef | fact | overflow |
 * syntax | empty (texts in CALC.config.text.errors).
 */
(function (CALC) {
  'use strict';

  const P = CALC.parse = {};
  const FUNCS = ['sin', 'cos', 'tan', 'ln', 'log'];
  const BIN = { '+': [1, 'L'], '-': [1, 'L'], '*': [2, 'L'], '/': [2, 'L'], '^': [4, 'R'] };
  const NEG_PREC = 3;

  function fail(code) { const e = new Error(code); e.code = code; throw e; }
  P.fail = fail;

  // ----- tokenizer -----
  // token: { type: num|op|post|lp|rp|fn|const, v, s (source text), i (index) }
  P.tokenize = (str) => {
    const out = [];
    let i = 0;
    const s = String(str || '');
    while (i < s.length) {
      const c = s[i];
      if (c === ' ') { i++; continue; }
      if ((c >= '0' && c <= '9') || c === '.') {
        const m = /^(\d+\.?\d*|\.\d*)/.exec(s.slice(i));
        out.push({ type: 'num', v: m[0] === '.' ? NaN : parseFloat(m[0]), s: m[0], i: i });
        i += m[0].length; continue;
      }
      if ('+-*/^'.indexOf(c) !== -1) { out.push({ type: 'op', v: c, s: c, i: i }); i++; continue; }
      if (c === '×') { out.push({ type: 'op', v: '*', s: c, i: i }); i++; continue; }
      if (c === '÷') { out.push({ type: 'op', v: '/', s: c, i: i }); i++; continue; }
      if (c === '−') { out.push({ type: 'op', v: '-', s: c, i: i }); i++; continue; }
      if (c === '%' || c === '!') { out.push({ type: 'post', v: c, s: c, i: i }); i++; continue; }
      if (c === '(') { out.push({ type: 'lp', v: c, s: c, i: i }); i++; continue; }
      if (c === ')') { out.push({ type: 'rp', v: c, s: c, i: i }); i++; continue; }
      if (c === 'π') { out.push({ type: 'const', v: 'pi', s: c, i: i }); i++; continue; }
      if (c === '√') { out.push({ type: 'fn', v: 'sqrt', s: c, i: i }); i++; continue; }
      if (/[a-z]/i.test(c)) {
        const w = /^[a-z]+/i.exec(s.slice(i))[0].toLowerCase();
        const f = FUNCS.find((n) => w.startsWith(n));
        if (f) { out.push({ type: 'fn', v: f, s: s.substr(i, f.length), i: i }); i += f.length; continue; }
        if (w.startsWith('sqrt')) { out.push({ type: 'fn', v: 'sqrt', s: s.substr(i, 4), i: i }); i += 4; continue; }
        if (w.startsWith('pi')) { out.push({ type: 'const', v: 'pi', s: s.substr(i, 2), i: i }); i += 2; continue; }
        if (w[0] === 'e') { out.push({ type: 'const', v: 'e', s: s[i], i: i }); i++; continue; }
        fail('syntax');
      }
      fail('syntax');
    }
    return out;
  };

  // A '-' or '+' is unary when nothing, an operator, '(' or a function comes before it.
  P.isUnaryAt = (tokens, k) => {
    const t = tokens[k];
    if (!t || t.type !== 'op' || (t.v !== '-' && t.v !== '+')) return false;
    const p = tokens[k - 1];
    return !p || p.type === 'op' || p.type === 'lp' || p.type === 'fn';
  };

  // ----- shunting-yard → RPN -----
  // RPN items: {k:'num', v} {k:'bin', v} {k:'neg'} {k:'post', v} {k:'fn', v}
  P.toRPN = (tokens) => {
    if (!tokens.length) fail('empty');
    const out = [], stack = [];
    let expect = true;              // expecting an operand
    const pushBin = (op) => {
      const [p, a] = BIN[op];
      while (stack.length) {
        const top = stack[stack.length - 1];
        let tp;
        if (top.k === 'bin') tp = BIN[top.v][0];
        else if (top.k === 'neg') tp = NEG_PREC;
        else break;                  // lp / fn
        if (tp > p || (tp === p && a === 'L')) out.push(stack.pop()); else break;
      }
      stack.push({ k: 'bin', v: op });
    };
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (expect) {
        if (t.type === 'num') {
          if (!isFinite(t.v)) fail('syntax');
          out.push({ k: 'num', v: t.v }); expect = false;
        } else if (t.type === 'const') {
          out.push({ k: 'num', v: t.v === 'pi' ? Math.PI : Math.E }); expect = false;
        } else if (t.type === 'lp') {
          stack.push({ k: 'lp' });
        } else if (t.type === 'fn') {
          if (!tokens[i + 1] || tokens[i + 1].type !== 'lp') fail('syntax');
          stack.push({ k: 'fn', v: t.v });
        } else if (t.type === 'op' && t.v === '-') {
          stack.push({ k: 'neg' });
        } else if (t.type === 'op' && t.v === '+') {
          /* unary plus: ignore */
        } else fail('syntax');
      } else {
        if (t.type === 'op') { pushBin(t.v); expect = true; }
        else if (t.type === 'post') out.push({ k: 'post', v: t.v });
        else if (t.type === 'rp') {
          while (stack.length && stack[stack.length - 1].k !== 'lp') out.push(stack.pop());
          if (!stack.length) fail('syntax');            // more ")" than "("
          stack.pop();
          if (stack.length && stack[stack.length - 1].k === 'fn') out.push(stack.pop());
        } else {
          // implicit multiplication: 2π, 2(3), (1)(2), 3sin(30), π2 — but never number·number ("5..2")
          if (t.type === 'num' && tokens[i - 1] && tokens[i - 1].type === 'num') fail('syntax');
          pushBin('*'); expect = true; i--;
        }
      }
    }
    if (expect) fail('syntax');
    while (stack.length) {
      const top = stack.pop();
      if (top.k === 'lp') continue;                    // missing ")" closed automatically
      out.push(top);
    }
    return out;
  };

  function factorial(n) {
    if (n < 0 || Math.floor(n) !== n) fail('fact');
    if (n > 170) fail('overflow');
    let r = 1;
    for (let k = 2; k <= n; k++) r *= k;
    return r;
  }

  const snap = (x) => (Math.abs(x) < 1e-12 ? 0 : x);

  function trig(name, x, deg) {
    if (!isFinite(x)) fail('domain');
    let rad = x;
    if (deg) {
      const m = ((x % 360) + 360) % 360;
      if (name === 'tan' && (m === 90 || m === 270)) fail('undef');
      rad = m * Math.PI / 180;
    }
    if (name === 'sin') return snap(Math.sin(rad));
    if (name === 'cos') return snap(Math.cos(rad));
    if (Math.abs(Math.cos(rad)) < 1e-12) fail('undef');
    return snap(Math.tan(rad));
  }

  function check(x) {
    if (Number.isNaN(x)) fail('domain');
    if (!isFinite(x)) fail('overflow');
    return x;
  }

  // ----- RPN → number -----
  P.run = (rpn, opts) => {
    const deg = !opts || opts.angle !== 'rad';
    const st = [];
    const pop = () => { if (!st.length) fail('syntax'); return st.pop(); };
    for (const it of rpn) {
      if (it.k === 'num') { st.push({ v: it.v, pct: false }); continue; }
      if (it.k === 'neg') { const a = pop(); st.push({ v: -a.v, pct: a.pct }); continue; }
      if (it.k === 'post') {
        const a = pop();
        if (it.v === '%') st.push({ v: a.v / 100, pct: true });
        else st.push({ v: check(factorial(a.v)), pct: false });
        continue;
      }
      if (it.k === 'fn') {
        const a = pop().v;
        let r;
        if (it.v === 'sqrt') { if (a < 0) fail('domain'); r = Math.sqrt(a); }
        else if (it.v === 'ln') { if (a <= 0) fail('domain'); r = Math.log(a); }
        else if (it.v === 'log') { if (a <= 0) fail('domain'); r = Math.log10(a); }
        else r = trig(it.v, a, deg);
        st.push({ v: check(r), pct: false });
        continue;
      }
      // binary
      const b = pop(), a = pop();
      let r;
      switch (it.v) {
        case '+': r = a.v + (b.pct ? a.v * b.v : b.v); break;
        case '-': r = a.v - (b.pct ? a.v * b.v : b.v); break;
        case '*': r = a.v * b.v; break;
        case '/': if (b.v === 0) fail('div0'); r = a.v / b.v; break;
        case '^': r = Math.pow(a.v, b.v); break;
        default: fail('syntax');
      }
      st.push({ v: check(r), pct: false });
    }
    if (st.length !== 1) fail('syntax');
    return check(st[0].v);
  };

  // Evaluate expression text. opts.angle: 'deg' (default) | 'rad'. Throws { code }.
  P.evaluate = (str, opts) => P.run(P.toRPN(P.tokenize(str)), opts);

  // Unmatched "(" count (the display shows them as faint ")")
  P.openCount = (tokens) => {
    let n = 0;
    for (const t of tokens) { if (t.type === 'lp') n++; else if (t.type === 'rp' && n > 0) n--; }
    return n;
  };
})(typeof window !== 'undefined' ? (window.CALC = window.CALC || {}) : (globalThis.CALC = globalThis.CALC || {}));
