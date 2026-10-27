/* Typing Tutor TT1 — on-screen QWERTY keyboard and hand hint.
   const kb = TT.keyboard(kbEl, handsEl); kb.show(nextChar) lights the next key (and the Shift to hold), colours keys by finger
   and lights the finger in the hand picture; kb.flash(ch, ok) blinks the key just typed. TT.keyInfo(ch) -> {id, shift, finger}.
   Fingers: lp lr lm li (left pinky, ring, middle, index), th (thumbs), ri rm rr rp (right). */
window.TT = window.TT || {};
(() => {
  const T = window.TT;
  // [base, shifted, finger, width]
  const ROWS = [
    [['`', '~', 'lp'], ['1', '!', 'lp'], ['2', '@', 'lr'], ['3', '#', 'lm'], ['4', '$', 'li'], ['5', '%', 'li'], ['6', '^', 'ri'], ['7', '&', 'ri'], ['8', '*', 'rm'], ['9', '(', 'rr'], ['0', ')', 'rp'], ['-', '_', 'rp'], ['=', '+', 'rp'], ['Back', '', 'rp', 2]],
    [['Tab', '', 'lp', 1.5], ['q', 'Q', 'lp'], ['w', 'W', 'lr'], ['e', 'E', 'lm'], ['r', 'R', 'li'], ['t', 'T', 'li'], ['y', 'Y', 'ri'], ['u', 'U', 'ri'], ['i', 'I', 'rm'], ['o', 'O', 'rr'], ['p', 'P', 'rp'], ['[', '{', 'rp'], [']', '}', 'rp'], ['\\', '|', 'rp', 1.5]],
    [['Caps', '', 'lp', 1.75], ['a', 'A', 'lp'], ['s', 'S', 'lr'], ['d', 'D', 'lm'], ['f', 'F', 'li'], ['g', 'G', 'li'], ['h', 'H', 'ri'], ['j', 'J', 'ri'], ['k', 'K', 'rm'], ['l', 'L', 'rr'], [';', ':', 'rp'], ["'", '"', 'rp'], ['Enter', '', 'rp', 2.25]],
    [['ShiftL', '', 'lp', 2.25], ['z', 'Z', 'lp'], ['x', 'X', 'lr'], ['c', 'C', 'lm'], ['v', 'V', 'li'], ['b', 'B', 'li'], ['n', 'N', 'ri'], ['m', 'M', 'ri'], [',', '<', 'rm'], ['.', '>', 'rr'], ['/', '?', 'rp'], ['ShiftR', '', 'rp', 2.75]],
    [[' ', '', 'th', 6.25]]
  ];
  const NAMES = { lp: 'left little finger', lr: 'left ring finger', lm: 'left middle finger', li: 'left index finger', th: 'thumb',
    ri: 'right index finger', rm: 'right middle finger', rr: 'right ring finger', rp: 'right little finger' };
  const LABEL = { ShiftL: 'Shift', ShiftR: 'Shift', Back: '\u232B', ' ': 'Space' };
  const MAP = {};
  ROWS.forEach(r => r.forEach(([b, s, f]) => { if (b.length === 1) MAP[b] = { id: b, shift: false, finger: f }; if (s) MAP[s] = { id: b, shift: true, finger: f }; }));
  T.keyInfo = ch => MAP[ch] || null;
  T.fingerName = f => NAMES[f] || '';

  T.keyboard = function (kbEl, handsEl) {
    const keys = {};
    const div = (cls, txt) => { const d = document.createElement('div'); d.className = cls; if (txt != null) d.textContent = txt; return d; };
    kbEl.replaceChildren(); kbEl.setAttribute('aria-hidden', 'true');
    ROWS.forEach(r => {
      const row = div('tt-row');
      r.forEach(([b, s, f, w]) => {
        const k = div('tt-key f-' + f + (b.length > 1 || b === ' ' ? ' tt-wide' : ''));
        k.style.flexGrow = w || 1;
        if (b.length === 1 && b !== ' ' && s && s !== b.toUpperCase()) { k.append(div('tt-s', s), div('tt-b', b)); }
        else k.textContent = LABEL[b] || (b.length === 1 ? b.toUpperCase() : b);
        if (b === 'f' || b === 'j') k.classList.add('tt-bump');
        keys[b] = k; row.append(k);
      });
      kbEl.append(row);
    });
    // hands: left pinky..thumb, thumb..right pinky
    const fingers = {};
    if (handsEl) {
      handsEl.replaceChildren(); handsEl.setAttribute('aria-hidden', 'true');
      [['lp', 'lr', 'lm', 'li', 'th'], ['th', 'ri', 'rm', 'rr', 'rp']].forEach((hand, hi) => {
        const hd = div('tt-hand' + (hi ? ' right' : ''));
        hand.forEach((f, i) => { const d = div('tt-fing f-' + f + ' n' + (hi ? 4 - i : i)); (fingers[f] = fingers[f] || []).push(d); hd.append(d); });
        hd.append(div('tt-palm')); handsEl.append(hd);
      });
    }
    let lit = [];
    function show(ch) {
      lit.forEach(el => el.classList.remove('tt-next', 'tt-on')); lit = [];
      const info = ch == null ? null : MAP[ch];
      if (!info) return null;
      const add = (el, c) => { if (el) { el.classList.add(c); lit.push(el); } };
      add(keys[info.id], 'tt-next');
      (fingers[info.finger] || []).forEach(d => add(d, 'tt-on'));
      if (info.shift) {                                               // hold Shift with the other hand
        const left = info.finger[0] === 'l', sk = keys[left ? 'ShiftR' : 'ShiftL'];
        add(sk, 'tt-next'); (fingers[left ? 'rp' : 'lp'] || []).forEach(d => add(d, 'tt-on'));
      }
      return info;
    }
    function flash(ch, ok) {
      const info = MAP[ch]; const k = info && keys[info.id]; if (!k) return;
      const c = ok ? 'tt-hit' : 'tt-miss'; k.classList.remove('tt-hit', 'tt-miss'); void k.offsetWidth; k.classList.add(c);
      setTimeout(() => k.classList.remove(c), 160);
    }
    return { show, flash };
  };
})();
