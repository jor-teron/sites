/* Clock Reading CR3 — time maths and words (no drawing). A time is t = minutes since midnight (0..1439).
   CR.words(t) gives British-style kid wording: "seven o'clock", "five past nine", "quarter past three", "half past twelve",
   "twenty to five", "seven minutes past two". CR.utcNow() is the real time in GMT (UTC). CR3: no quizzes any more. */
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
  C.fmt12 = (t, ampm) => C.h12(t) + ':' + C.pad(C.min(t)) + (ampm ? (C.h24(t) < 12 ? ' AM' : ' PM') : '');
  C.fmt24 = t => C.pad(C.h24(t)) + ':' + C.pad(C.min(t));
  C.words = t => {
    const m = C.min(t), h = C.h12(t), next = (h % 12) + 1;
    if (m === 0) return NUM[h] + ' o\u2019clock';
    if (m === 30) return 'half past ' + NUM[h];
    const n = m < 30 ? m : 60 - m, unit = n === 15 || n % 5 === 0 ? '' : n === 1 ? ' minute' : ' minutes';
    return num(n) + unit + (m < 30 ? ' past ' + NUM[h] : ' to ' + NUM[next]);
  };
  C.part = t => { const h = C.h24(t); return h < 5 ? 'at night' : h < 12 ? 'in the morning' : h < 17 ? 'in the afternoon' : h < 21 ? 'in the evening' : 'at night'; };
  C.utcNow = () => { const d = new Date(); return { t: d.getUTCHours() * 60 + d.getUTCMinutes(), s: d.getUTCSeconds() }; };
})();
