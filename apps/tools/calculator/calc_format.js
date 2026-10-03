/*
 * Calculator — calc_format.js
 * Numbers → text. format(): ~12 significant digits, thousands separators, e-notation only
 * for very large / small values. plain(): the value as expression text (no commas, no
 * e-notation, float noise removed) for "continue from the answer" and history reuse.
 * groupNumber(): commas in a number the user is typing ("12345.6" → "12,345.6").
 */
(function (CALC) {
  'use strict';

  const F = CALC.format = {};
  const C = () => CALC.config.format;

  F.groupInt = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, C().group);

  F.groupNumber = (s) => {
    const k = s.indexOf('.');
    const int = k === -1 ? s : s.slice(0, k);
    return F.groupInt(int) + (k === -1 ? '' : C().point + s.slice(k + 1));
  };

  F.format = (x) => {
    const c = C();
    if (x === 0 || Object.is(x, -0)) return '0';
    if (!isFinite(x)) return String(x);
    const a = Math.abs(x);
    const digits = Math.max(0, Math.min(20, c.sigDigits - 1 - Math.floor(Math.log10(a))));
    let s = a.toFixed(digits);
    if (a >= c.expHigh || a < c.expLow || Number(s) >= c.expHigh) {
      let [m, e] = x.toExponential(c.sigDigits - 1).split('e');
      if (m.indexOf('.') !== -1) m = m.replace(/0+$/, '').replace(/\.$/, '');
      if (m === '10' || m === '-10') { m = m[0] === '-' ? '-1' : '1'; e = String(Number(e) + 1); }
      const n = Number(e);
      return m + 'e' + (n < 0 ? '-' : '+') + Math.abs(n);
    }
    if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '0') return '0';
    return (x < 0 ? '-' : '') + F.groupNumber(s);
  };

  // Plain decimal text, 15 significant digits (removes 0.30000000000000004 noise).
  F.plain = (x) => {
    if (x === 0 || Object.is(x, -0) || !isFinite(x)) return '0';
    let s = Number(x.toPrecision(15)).toString();
    if (s.indexOf('e') === -1) return s;
    const neg = s[0] === '-';
    if (neg) s = s.slice(1);
    let [m, e] = s.split('e');
    const exp = Number(e);
    let [ip, fp] = m.split('.');
    fp = fp || '';
    let digits = ip + fp, point = ip.length + exp;
    if (point <= 0) s = '0.' + '0'.repeat(-point) + digits;
    else if (point >= digits.length) s = digits + '0'.repeat(point - digits.length);
    else s = digits.slice(0, point) + '.' + digits.slice(point);
    return (neg ? '-' : '') + s;
  };
})(typeof window !== 'undefined' ? (window.CALC = window.CALC || {}) : (globalThis.CALC = globalThis.CALC || {}));
