/* Typing Tutor TT1 — typing engine (no DOM).
   const e = TT.engine(text, {onMark(i), onDone()}); e.type(ch) for each typed character, e.back() for Backspace.
   Wrong keys still move on (shown red); Backspace steps back one character so it can be fixed.
   e.marks[i]: 0 = not typed yet, 1 = right, 2 = wrong. e.run: {start, end, correct, wrong, missed{char:n}, goodChars}.
   e.append(more) grows the text (free test). The clock starts on the first key. */
window.TT = window.TT || {};
(() => {
  window.TT.engine = function (text, cb) {
    cb = cb || {};
    const run = { start: 0, end: 0, correct: 0, wrong: 0, missed: {}, get goodChars() { let n = 0; for (let i = 0; i < e.pos; i++) if (e.marks[i] === 1) n++; return n; } };
    const e = {
      text, pos: 0, marks: new Uint8Array(text.length), run, done: false,
      expected() { return e.text[e.pos]; },
      type(ch) {
        if (e.done || e.pos >= e.text.length) return null;
        if (!run.start) run.start = Date.now();
        const want = e.text[e.pos], ok = ch === want;
        if (ok) run.correct++; else { run.wrong++; const k = want === ' ' ? 'Space' : want; run.missed[k] = (run.missed[k] || 0) + 1; }
        e.marks[e.pos] = ok ? 1 : 2; e.pos++;
        if (cb.onMark) cb.onMark(e.pos - 1);
        if (e.pos >= e.text.length && !cb.endless) e.finish();
        return ok;
      },
      back() {
        if (e.done || e.pos === 0) return;
        e.pos--; e.marks[e.pos] = 0; if (cb.onMark) cb.onMark(e.pos);
      },
      append(more) {
        const m = new Uint8Array(e.text.length + more.length); m.set(e.marks); e.marks = m; e.text += more;
      },
      finish() { if (e.done) return; e.done = true; run.end = Date.now(); if (!run.start) run.start = run.end; if (cb.onDone) cb.onDone(); }
    };
    return e;
  };
})();
