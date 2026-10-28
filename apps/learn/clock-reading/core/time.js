/* Clock Reading CR1 — time maths and words (no drawing). A time is t = minutes since midnight (0..1439).
   CR.words(t) gives British-style kid wording: "seven o'clock", "five past nine", "quarter past three", "half past twelve",
   "twenty to five", "seven minutes past two". CR.pick(level) makes a random quiz time for a level. */
window.CR = window.CR || {};
(() => {
  const C = window.CR;
  const NUM = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
    'quarter', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const num = n => n <= 20 ? NUM[n] : 'twenty-' + NUM[n - 20];
  C.norm = t => ((Math.round(t) % 1440) + 1440) % 1440;
  C.h24 = t => Math.floor(C.norm(t) / 60);
  C.min = t => C.norm(t) % 60;
  C.h12 = t => (C.h24(t) % 12) || 12;
  C.pad = n => (n < 10 ? '0' : '') + n;
  C.fmt12 = (t, ampm) => C.h12(t) + ':' + C.pad(C.min(t)) + (ampm ? (C.h24(t) < 12 ? ' am' : ' pm') : '');
  C.fmt24 = t => C.pad(C.h24(t)) + ':' + C.pad(C.min(t));
  C.words = t => {
    const m = C.min(t), h = C.h12(t), next = (h % 12) + 1;
    if (m === 0) return NUM[h] + ' o\u2019clock';
    if (m === 30) return 'half past ' + NUM[h];
    const n = m < 30 ? m : 60 - m, unit = n === 15 || n % 5 === 0 ? '' : n === 1 ? ' minute' : ' minutes';
    return num(n) + unit + (m < 30 ? ' past ' + NUM[h] : ' to ' + NUM[next]);
  };
  C.part = t => { const h = C.h24(t); return h < 5 ? 'at night' : h < 12 ? 'in the morning' : h < 17 ? 'in the afternoon' : h < 21 ? 'in the evening' : 'at night'; };
  C.levels = [
    { id: 'oclock', name: 'O\u2019clock', step: 60, snap: 5 },
    { id: 'half', name: 'Half past', step: 30, snap: 5 },
    { id: 'quarter', name: 'Quarter past / to', step: 15, snap: 5 },
    { id: 'five', name: '5 minutes', step: 5, snap: 5 },
    { id: 'any', name: 'Any minute', step: 1, snap: 1 }
  ];
  C.pick = (lv, day) => { const n = (day ? 1440 : 720) / lv.step; return Math.floor(Math.random() * n) * lv.step + (day ? 0 : (Math.random() < 0.5 ? 0 : 720)); };
  // 3 wrong answers that kids often give: hands swapped, the hour next to it, the mirror time, then random ones
  C.wrong = (t, lv, same) => {
    const out = [], add = x => { x = C.norm(x); if (out.length < 3 && x !== t && !out.some(o => same(o, x)) && !same(x, t)) out.push(x); };
    const h = C.h12(t), m = C.min(t);
    if (m % 5 === 0) add((C.h24(t) - h % 12) * 60 + (m / 5 % 12) * 60 + (h % 12) * 5);   // swapped hands
    add(t + 60); add(t - 60); add(t + (m < 30 ? 30 : -30) * (lv.step <= 30 ? 1 : 0) + (lv.step > 30 ? 120 : 0));
    for (let i = 0; out.length < 3 && i < 50; i++) add(C.pick(lv, true));
    return out;
  };
})();
