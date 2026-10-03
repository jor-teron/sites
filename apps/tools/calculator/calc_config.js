/*
 * Calculator — calc_config.js
 * Every setting and text in one place. All calc_*.js files share window.CALC (plain
 * <script> tags, no modules, nothing loaded from outside this folder).
 */
window.CALC = window.CALC || {};

CALC.config = {
  version: '2.0',

  format: {
    sigDigits: 12,          // results are rounded to this many significant digits (0.1+0.2 → 0.3)
    expHigh: 1e15,          // |x| ≥ this → e-notation (1.2345e+21)
    expLow: 1e-9,           // 0 < |x| < this → e-notation (1.5e-12)
    group: ',',             // thousands separator
    point: '.'
  },

  maxExprLength: 200,       // characters in the expression
  historyMax: 20,
  storage: { history: 'calc_history', angle: 'calc_angle' },
  toastMs: 1400,

  // expression text size: largest, smallest before it starts wrapping (px)
  exprFont: { max: 46, min: 22 },

  text: {
    errors: {
      div0: "Can't divide by 0",
      domain: 'Invalid input',
      undef: 'Undefined',
      fact: '! needs a whole number ≥ 0',
      overflow: 'Number too large',
      syntax: 'Incomplete expression',
      empty: ''
    },
    copied: 'Copied',
    copyFailed: 'Copy failed',
    historyEmpty: 'No calculations yet',
    historyCleared: 'History cleared'
  }
};
