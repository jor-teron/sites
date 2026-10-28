/* Morse Code MC1 — the code table and pure helpers (no sound, no drawing). International Morse: A-Z, 0-9, common punctuation.
   Text form used everywhere: '.' dot, '-' dash, one space between letters, ' / ' between words.
   Timing (PARIS standard): 1 unit = 1200 / WPM ms; dot 1, dash 3, gap inside a letter 1, between letters 3, between words 7. */
window.MC = window.MC || {};
(() => {
  const M = window.MC;
  M.table = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
    N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
    1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', 0: '-----',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '!': '-.-.--', '-': '-....-', '(': '-.--.', ')': '-.--.-', '@': '.--.-.', '=': '-...-', ':': '---...', "'": '.----.'
  };
  M.rev = {}; for (const k in M.table) M.rev[M.table[k]] = k;
  M.letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''); M.digits = '1234567890'.split(''); M.punct = '.,?/!-()@=:\''.split('');
  // graded lessons: a few new characters each, short and common letters first (Koch-style: learn by sound, add letters slowly)
  M.lessons = ['ET', 'AIMN', 'SOKD', 'RUWG', 'HVFL', 'BCPJ', 'XYZQ', '12345', '67890', '.,?/'].map((s, i) => ({ id: 'L' + (i + 1), add: s.split('') }));
  M.lessonPool = i => M.lessons.slice(0, i + 1).reduce((a, l) => a.concat(l.add), []);
  M.unit = wpm => 1200 / wpm;
  M.encode = text => String(text).toUpperCase().trim().split(/\s+/).filter(Boolean)
    .map(w => w.split('').map(c => M.table[c] || '#').join(' ')).join(' / ');
  M.decode = code => String(code).replace(/[\u00B7\u2022\u2219]/g, '.').replace(/[\u2212\u2013\u2014_]/g, '-').trim()
    .split(/\s*\/\s*|\s{3,}|\n+/).filter(Boolean)
    .map(w => w.trim().split(/\s+/).map(s => M.rev[s] || '#').join('')).join(' ');
  // timeline for a code string: [[on, ms], ...] alternating sound / silence, in units -> ms
  M.timeline = (code, wpm) => {
    const u = M.unit(wpm), out = [];
    code.split('').forEach((ch, i, a) => {
      if (ch === '.' || ch === '-') { out.push([1, (ch === '.' ? 1 : 3) * u]); const n = a[i + 1]; if (n === '.' || n === '-') out.push([0, u]); }
      else if (ch === ' ') out.push([0, (a[i + 1] === '/' || a[i - 1] === '/' ? 2 : 3) * u]);   // ' / ' = 2 + 3 + 2 = 7 units
      else if (ch === '/') out.push([0, 3 * u]);
    });
    return out;
  };
})();
