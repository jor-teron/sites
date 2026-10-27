/* Typing Tutor TT1 — stats and saved progress.
   TT.calc(run) -> {wpm, acc, secs, errors, missed:[[char,count],...]} from an engine run.
     WPM = correct characters / 5 per minute; accuracy = correct keystrokes / all keystrokes (fixed mistakes still count).
   TT.save: localStorage via the Learn kit (LRN.store), keys learn.typing-tutor.best {lessonId: {wpm, acc}} and
     learn.typing-tutor.test {'60'|'120'|'300': {wpm, acc}}. A lesson unlocks when the one before has a best accuracy of 90% or more. */
window.TT = window.TT || {};
(() => {
  const T = window.TT, P = 'learn.typing-tutor.';
  const S = (window.LRN && window.LRN.store) || { read: (k, d) => d, write: () => {} };
  T.PASS = 90;

  T.calc = function (run) {
    const ms = Math.max(1, (run.end || Date.now()) - (run.start || Date.now()));
    const min = ms / 60000, keys = run.correct + run.wrong;
    const missed = Object.entries(run.missed).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      wpm: run.start ? Math.round(run.goodChars / 5 / min) : 0,
      acc: keys ? Math.round(run.correct / keys * 100) : 100,
      secs: Math.round(ms / 1000), errors: run.wrong, missed
    };
  };

  const obj = k => { const v = S.read(P + k, {}); return v && typeof v === 'object' ? v : {}; };
  T.save = {
    best: id => obj('best')[id] || null,
    // keep the best accuracy; on a tie keep the faster run. Returns true when it is a new best.
    lesson(id, r) {
      const all = obj('best'), b = all[id];
      if (b && (b.acc > r.acc || (b.acc === r.acc && b.wpm >= r.wpm))) return false;
      all[id] = { wpm: r.wpm, acc: r.acc }; S.write(P + 'best', all); return true;
    },
    unlocked(index) { return index === 0 || ((this.best(T.LESSONS[index - 1].id) || {}).acc || 0) >= T.PASS; },
    test: secs => obj('test')[secs] || null,
    testRun(secs, r) {                                                 // keep the fastest test at 90%+ accuracy, else the best one so far
      const all = obj('test'), b = all[secs], score = x => (x.acc >= T.PASS ? 1000 : 0) + x.wpm;
      if (b && score(b) >= score(r)) return false;
      all[secs] = { wpm: r.wpm, acc: r.acc }; S.write(P + 'test', all); return true;
    },
    reset() { S.write(P + 'best', {}); S.write(P + 'test', {}); }
  };
})();
