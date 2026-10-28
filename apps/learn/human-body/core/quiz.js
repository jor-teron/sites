/* Human Body Explorer HBE1 — quiz logic (no drawing). A round is 8 questions, mixed:
   'tap'  = "Tap the liver" on the body (shows the part's own group so the answer is visible),
   'job'  = "What does the heart do?" with 4 choices taken from the parts' job lines.
   Best score is saved by the Learn kit under learn.human-body.best (key 'quiz'); last score under learn.human-body.last. */
window.HB = window.HB || {};
(() => {
  const H = window.HB, N = 8, PREFIX = 'learn.human-body.';
  const prog = window.LRN && LRN.progress ? LRN.progress(PREFIX) : null;
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };

  function makeRound() {
    return shuffle(H.parts).slice(0, N).map((p, i) => {
      if (i % 2 === 0) return { type: 'tap', part: p, view: p.sys };
      const wrong = shuffle(H.parts.filter(o => o.id !== p.id)).slice(0, 3);
      return { type: 'job', part: p, choices: shuffle([p].concat(wrong)).map(o => ({ id: o.id, text: o.job })) };
    });
  }

  H.quiz = {
    N,
    start() { this.qs = makeRound(); this.i = 0; this.score = 0; this.done = false; return this; },
    cur() { return this.qs[this.i]; },
    answer(id) {                                   // returns true if right; moves on with next()
      const ok = id === this.cur().part.id;
      if (ok) this.score++;
      return ok;
    },
    next() { this.i++; if (this.i >= this.qs.length) this.finish(); return !this.done; },
    finish() {
      this.done = true;
      this.isBest = prog ? prog.saveScore('quiz', this.score, N) : false;
      if (window.LRN && LRN.store) LRN.store.write(PREFIX + 'last', { score: this.score, of: N, at: Date.now() });
    },
    best() { return prog ? prog.best('quiz') : null; },
    markViewed(id) { if (prog) prog.markViewed(id); },
    viewed() { return prog ? prog.viewed() : {}; }
  };
})();
