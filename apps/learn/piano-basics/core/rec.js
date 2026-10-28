/* Piano Basics PB2 — record what you play and play it back with the same timing. Memory only (gone on reload).
   Notes: [{ m, t0, t1 }] in ms from the start of the recording. Playback schedules each note on the audio clock a little ahead
   (lookahead timer), so timing stays exact even if the page is busy; onNote(m, on) lights the keys at the same moments.
   P.rec.plan = the playback schedule [{ m, at (ms from start), dur (ms) }], kept for checking. */
window.PB = window.PB || {};
(() => {
  const P = window.PB, MAXN = 3000, MAXMS = 10 * 60e3;
  const R = P.rec = { notes: [], on: false, playing: false, plan: [], onNote: null, onEnd: null };
  let t0 = 0, open = {}, timer = 0, lights = [];
  const now = () => performance.now();
  R.start = () => { R.stop(); R.notes = []; open = {}; t0 = now(); R.on = true; };
  R.down = m => { if (!R.on) return; const t = now() - t0; if (t > MAXMS || R.notes.length >= MAXN) { R.end(); return; } if (open[m]) R.up(m); open[m] = { m, t0: t, t1: t }; R.notes.push(open[m]); };
  R.up = m => { if (!R.on || !open[m]) return; open[m].t1 = now() - t0; delete open[m]; };
  R.end = () => { if (!R.on) return; const t = now() - t0; for (const k in open) open[k].t1 = t; open = {}; R.on = false; };
  R.length = () => R.notes.length ? Math.max(...R.notes.map(n => n.t1)) : 0;
  R.play = () => {
    R.end(); R.stop(); if (!R.notes.length) return false;
    const A = P.audio; if (!A.unlock()) return false;
    const first = R.notes[0].t0, start = A.now() + 0.15, wall = now() + 150;    // small gap before the first note
    R.plan = R.notes.map(n => ({ m: n.m, at: n.t0 - first, dur: Math.max(60, n.t1 - n.t0) }));
    R.startAt = start; R.playing = true; let i = 0;
    const pump = () => {                             // every 50 ms: schedule notes due in the next 200 ms
      const horizon = (A.now() - start) * 1000 + 200;
      while (i < R.plan.length && R.plan[i].at <= horizon) {
        const p = R.plan[i++], at = start + p.at / 1000 - A.now();
        p.v = A.on(p.m, p.dur / 1000, Math.max(0, at));
        if (R.onNote) { const w = wall + p.at - now(); lights.push(setTimeout(() => R.onNote(p.m, true), w), setTimeout(() => R.onNote(p.m, false), w + p.dur)); }
      }
      if (i >= R.plan.length) { clearInterval(timer); const last = R.plan[R.plan.length - 1]; lights.push(setTimeout(() => { R.playing = false; if (R.onEnd) R.onEnd(); }, wall + last.at + last.dur - now() + 100)); }
    };
    timer = setInterval(pump, 50); pump();
    return true;
  };
  R.stop = () => { clearInterval(timer); lights.forEach(clearTimeout); lights = []; if (R.playing) { R.playing = false; P.audio.allOff(); if (R.onNote) R.notes.forEach(n => R.onNote(n.m, false)); } };
})();
