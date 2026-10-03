/*
 * Calculator — calc_ui.js
 * Display (expression on top that shrinks then wraps, live grey result under it; after "="
 * the answer is big), keypad buttons (never take focus, so Space can't re-press them),
 * tap the answer to copy (toast), history drawer, DEG/RAD label.
 */
(function (CALC) {
  'use strict';

  const U = CALC.ui = {};
  const S = CALC.state;
  const cfg = () => CALC.config;
  const F = () => CALC.format;
  const $ = (id) => document.getElementById(id);
  const PRETTY_OP = { '*': '×', '/': '÷', '-': '−', '+': '+', '^': '^' };
  let toastTimer = 0;

  // ----- expression → DOM (pretty: × ÷ −, commas, faint auto-closing brackets) -----
  function renderExpr(el, expr) {
    el.textContent = '';
    let ts;
    try { ts = CALC.parse.tokenize(expr); } catch (_) { el.textContent = expr; return; }
    const add = (txt, cls) => { const s = document.createElement('span'); s.textContent = txt; if (cls) s.className = cls; el.appendChild(s); };
    ts.forEach((t, k) => {
      if (t.type === 'num') add(F().groupNumber(t.s));
      else if (t.type === 'op') {
        const unary = CALC.parse.isUnaryAt(ts, k);
        add(unary ? PRETTY_OP[t.v] : (t.v === '^' ? '^' : '\u2009' + PRETTY_OP[t.v] + '\u2009'), unary ? '' : 'op');
      } else if (t.type === 'fn') add(t.v === 'sqrt' ? '√' : t.v);
      else if (t.type === 'const') add(t.v === 'pi' ? 'π' : 'e');
      else add(t.s);
    });
    const open = CALC.parse.openCount(ts);
    if (open) add(')'.repeat(open), 'ghost');
  }

  // Shrink the expression font until it fits one line; below the minimum it wraps.
  function fit() {
    const el = $('expr');
    const cs = getComputedStyle(el);
    const max = parseFloat(cs.getPropertyValue('--fmax')) || cfg().exprFont.max;
    const min = parseFloat(cs.getPropertyValue('--fmin')) || cfg().exprFont.min;
    el.classList.remove('wrap');
    let size = max;
    el.style.fontSize = size + 'px';
    while (el.scrollWidth > el.clientWidth + 1 && size > min) { size -= 2; el.style.fontSize = size + 'px'; }
    if (el.scrollWidth > el.clientWidth + 1) { el.classList.add('wrap'); el.scrollTop = el.scrollHeight; }
  }

  U.render = () => {
    const d = $('display'), expr = $('expr'), res = $('result');
    d.classList.toggle('done', S.evaluated);
    d.classList.toggle('err', !!S.error);
    if (S.evaluated) {
      renderExpr(expr, S.lastExpr);
      res.textContent = F().format(S.ans);
    } else {
      renderExpr(expr, S.expr);
      if (S.error) res.textContent = S.error;
      else { const v = S.live(); res.textContent = v === null ? '' : '= ' + F().format(v); }
    }
    res.classList.toggle('copyable', S.evaluated || (!S.error && !!res.textContent));
    const ang = S.angle.toUpperCase();
    $('angle-ind').textContent = ang;
    const ak = document.querySelector('[data-k="angle"]');
    if (ak) ak.textContent = ang;
    fit();
  };

  // ----- copy -----
  function copyValue() {
    const v = S.evaluated ? S.ans : S.live();
    if (v === null || v === undefined || S.error) return;
    const text = F().format(v).split(cfg().format.group).join('');
    const done = () => U.toast(cfg().text.copied + ' ' + text);
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      ta.remove();
      if (ok) done(); else U.toast(cfg().text.copyFailed);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }
  U.copy = copyValue;

  U.toast = (msg) => {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, cfg().toastMs);
  };

  // ----- history drawer -----
  function renderHistory() {
    const list = $('hist-list');
    list.textContent = '';
    S.history.forEach((h, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.tabIndex = -1; b.dataset.i = i;
      const e = document.createElement('span'); e.className = 'he'; renderExpr(e, h.e);
      const r = document.createElement('span'); r.className = 'hr'; r.textContent = '= ' + F().format(h.r);
      b.appendChild(e); b.appendChild(r); li.appendChild(b); list.appendChild(li);
    });
    $('hist-empty').hidden = S.history.length > 0;
    $('hist-clear').disabled = !S.history.length;
  }
  U.openHistory = () => { renderHistory(); $('hist').hidden = false; $('hist-btn').classList.add('on'); };
  U.closeHistory = () => { $('hist').hidden = true; $('hist-btn').classList.remove('on'); };
  U.historyOpen = () => !$('hist').hidden;

  // Buttons never take focus; act on click (no 300 ms delay with touch-action: manipulation).
  function noFocus(el) {
    el.tabIndex = -1;
    el.addEventListener('mousedown', (e) => e.preventDefault());
  }

  U.flash = (k) => {
    const sel = '.key[data-k="' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"]';
    const b = Array.from(document.querySelectorAll(sel)).find((x) => x.offsetParent);   // the visible one
    if (!b) return;
    b.classList.add('down');
    setTimeout(() => b.classList.remove('down'), 110);
  };

  U.init = () => {
    for (const b of document.querySelectorAll('button')) noFocus(b);
    for (const b of document.querySelectorAll('.key')) {
      b.addEventListener('pointerdown', () => b.classList.add('down'));
      const up = () => b.classList.remove('down');
      b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
      b.addEventListener('click', () => { if (U.historyOpen()) U.closeHistory(); CALC.press(b.dataset.k); });
    }
    // hold ⌫ to clear everything
    const bs = document.querySelector('.key[data-k="back"]');
    let holdTimer = 0, held = false;
    bs.addEventListener('pointerdown', () => { held = false; holdTimer = setTimeout(() => { held = true; CALC.press('clear'); }, 550); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) bs.addEventListener(ev, () => clearTimeout(holdTimer));
    bs.addEventListener('click', (e) => { if (held) { e.stopImmediatePropagation(); held = false; } }, true);

    $('result').addEventListener('click', copyValue);
    $('hist-btn').addEventListener('click', () => (U.historyOpen() ? U.closeHistory() : U.openHistory()));
    $('hist-close').addEventListener('click', U.closeHistory);
    $('hist-clear').addEventListener('click', () => { CALC.history.clear(); renderHistory(); U.toast(cfg().text.historyCleared); });
    $('hist-list').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      const h = S.history[+b.dataset.i];
      U.closeHistory();
      if (h) CALC.insertValue(h.r);
    });
    $('hist-empty').textContent = cfg().text.historyEmpty;
    CALC.on(() => U.render());
    window.addEventListener('resize', fit);
    U.render();
  };
})(window.CALC);
