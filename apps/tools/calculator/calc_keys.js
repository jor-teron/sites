/*
 * Calculator — calc_keys.js
 * Keyboard: digits, . or , (decimal), + - * / x, ( ) % ^ !, Enter or =, Backspace,
 * Esc / Delete clear (Esc first closes the history), Ctrl+C copies the answer.
 * The matching on-screen key flashes.
 */
(function (CALC) {
  'use strict';

  const MAP = {
    '.': '.', ',': '.', '+': '+', '-': '-', '*': '*', 'x': '*', 'X': '*', '×': '*', '/': '/', '÷': '/',
    '(': '(', ')': ')', '%': '%', '^': '^', '!': '!', 'Enter': '=', '=': '=',
    'Backspace': 'back', 'Escape': 'clear', 'Delete': 'clear', 'Clear': 'clear'
  };

  CALC.keys = {
    init: () => {
      window.addEventListener('keydown', (e) => {
        if (e.altKey) return;
        if (e.ctrlKey || e.metaKey) {
          if (e.key.toLowerCase() === 'c' && !String(window.getSelection ? window.getSelection() : '')) {
            e.preventDefault(); CALC.ui.copy();
          }
          return;
        }
        if (e.key === 'Escape' && CALC.ui.historyOpen()) { e.preventDefault(); CALC.ui.closeHistory(); return; }
        const k = /^[0-9]$/.test(e.key) ? e.key : MAP[e.key];
        if (!k) return;
        e.preventDefault();
        if (CALC.ui.historyOpen()) CALC.ui.closeHistory();
        CALC.press(k);
        CALC.ui.flash(k);
      });
    }
  };

  function boot() {
    CALC.history.load();
    CALC.ui.init();
    CALC.keys.init();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.CALC);
