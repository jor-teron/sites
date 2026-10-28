/* Piano Basics PB2 — falling notes game. Coloured bars fall onto the key to press; press when the bar touches the line.
   P.makeFall(canvas, piano) returns { start(events, bpm, { speed, wait }), stop(), hit(m), st (score etc.), onJudge, onEnd }.
   events = PB.songEvents(...) ([{ m, t (beats), beats, hand }]). speed 0.6 = slow, 1 = normal. wait = the song stops at each
   note until you press it (for beginners). Hit within 0.15 s = Perfect (100), within 0.3 s = Good (50), later = Miss.
   Draws with requestAnimationFrame only while a song runs; key positions are cached until the size changes (weak phones). */
window.PB = window.PB || {};
(() => {
  const P = window.PB, LEAD = 2.4, PERFECT = 0.15, GOOD = 0.3, SEE = 2.6;   // seconds: count-in, hit windows, how far ahead bars show
  P.makeFall = (cv, piano) => {
    const g = cv.getContext('2d');
    let notes = [], run = 0, last = 0, xs = {}, sizeKey = '', waitOn = false, flashes = [];
    const F = { cv, st: null, onEnd: null, onJudge: null };
    function layout() {
      const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight, k = w + 'x' + h + piano.el.childElementCount;
      if (k === sizeKey) return; sizeKey = k;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = cv.getBoundingClientRect(); xs = {};
      piano.el.querySelectorAll('.pb-key').forEach(el => { const r = el.getBoundingClientRect(); xs[el.dataset.m] = { x: r.left - c.left, w: r.width, b: el.classList.contains('pb-b') }; });
    }
    function judge(n, dt) {
      n.done = Math.abs(dt) <= PERFECT ? 'perfect' : Math.abs(dt) <= GOOD ? 'good' : 'miss';
      const S = F.st; S[n.done]++;
      if (n.done === 'miss') S.streak = 0; else { S.score += n.done === 'perfect' ? 100 : 50; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak); }
      flashes.push({ m: n.m, txt: n.done === 'perfect' ? 'Perfect!' : n.done === 'good' ? 'Good' : 'Miss', ok: n.done !== 'miss', t: performance.now() });
      if (F.onJudge) F.onJudge(S);
    }
    function frame(ts) {
      if (!run) return;
      const S = F.st, dt = Math.min(0.1, (ts - last) / 1000); last = ts;
      // wait mode: the clock stops at the next note until it is pressed
      const due = notes.filter(n => !n.done && n.time <= S.time + 1e-9);
      const hold = S.wait && notes.some(n => !n.done && n.time <= S.time + dt);
      if (hold) { const first = notes.find(n => !n.done); S.time = Math.max(S.time, first.time); } else S.time += dt;
      if (!S.wait) due.forEach(n => { if (S.time - n.time > GOOD) judge(n, S.time - n.time); });
      const w8 = S.wait && hold;
      if (w8 !== waitOn) { waitOn = w8; piano.clear('pb-next'); piano.clear('pb-nextl'); }
      if (w8) notes.forEach(n => { if (!n.done && n.time <= S.time + 1e-6) piano.light(n.m, n.hand === 'L' ? 'pb-nextl' : 'pb-next'); });
      draw();
      if (notes.every(n => n.done) && S.time > S.end + 0.4) { F.stop(); if (F.onEnd) F.onEnd(S); return; }
      requestAnimationFrame(frame);
    }
    function draw() {
      layout();
      const W = cv.clientWidth, H = cv.clientHeight, S = F.st, pps = (H - 6) / SEE, now = performance.now();
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(128,128,128,0.12)';                    // faint lanes over the black keys help aim
      for (const m in xs) if (xs[m].b) g.fillRect(xs[m].x, 0, xs[m].w, H);
      for (const n of notes) {
        if (n.done && n.done !== 'miss') continue;
        const y1 = H - 6 - (n.time - S.time) * pps, len = Math.max(10, n.dur * pps - 3), k = xs[n.m];
        if (!k || y1 < 0 || y1 - len > H) continue;
        const pc = n.m % 12;
        g.globalAlpha = n.done ? 0.3 : 1;
        g.fillStyle = n.hand === 'L' ? 'hsl(' + pc * 30 + ',45%,42%)' : 'hsl(' + pc * 30 + ',80%,60%)';
        const x = k.x + 2, w = k.w - 4, y = Math.min(y1, H - 6) - len;
        g.beginPath(); g.roundRect ? g.roundRect(x, y, w, len, 5) : g.rect(x, y, w, len); g.fill();
        if (n.hand === 'L') { g.fillStyle = '#fff'; g.font = '700 11px system-ui'; g.textAlign = 'center'; g.fillText('L', x + w / 2, y + len - 4); }
      }
      g.globalAlpha = 1;
      g.fillStyle = '#f6c453'; g.fillRect(0, H - 6, W, 4);       // the hit line, just above the keys
      g.font = '800 15px system-ui'; g.textAlign = 'center';
      flashes = flashes.filter(f => now - f.t < 700);
      for (const f of flashes) { const k = xs[f.m]; if (!k) continue; g.globalAlpha = 1 - (now - f.t) / 700; g.fillStyle = f.ok ? '#7ccf95' : '#ff6b6b'; g.fillText(f.txt, Math.min(W - 34, Math.max(34, k.x + k.w / 2)), H - 18 - (now - f.t) / 25); }
      g.globalAlpha = 1;
      if (S.time < 0) { g.fillStyle = '#f6c453'; g.font = '800 34px system-ui'; g.fillText(String(Math.ceil(-S.time)), W / 2, H / 2); }
    }
    F.start = (events, bpm, o) => {
      F.stop();
      const sec = 60 / bpm / (o.speed || 1);
      notes = events.map(e => ({ m: e.m, hand: e.hand, time: e.t * sec, dur: e.beats * sec, done: null }));
      F.st = { time: -LEAD, score: 0, perfect: 0, good: 0, miss: 0, streak: 0, bestStreak: 0, total: notes.length, wait: !!o.wait,
        end: Math.max(...notes.map(n => n.time + n.dur)) };
      sizeKey = ''; flashes = []; waitOn = false; run = 1; last = performance.now(); requestAnimationFrame(frame);
    };
    F.stop = () => { run = 0; piano.clear('pb-next'); piano.clear('pb-nextl'); };
    F.running = () => !!run;
    F.hit = m => {                                    // a key was pressed: find the closest bar on that key
      if (!run) return null;
      const S = F.st; let best = null;
      for (const n of notes) if (!n.done && n.m === m && Math.abs(n.time - S.time) <= GOOD && (!best || Math.abs(n.time - S.time) < Math.abs(best.time - S.time))) best = n;
      if (!best) return null;
      judge(best, S.wait ? Math.max(0, S.time - best.time) : S.time - best.time);
      if (S.wait && notes.find(n => !n.done) && best.time <= S.time + 1e-6) piano.clear(best.hand === 'L' ? 'pb-nextl' : 'pb-next'), waitOn = false;
      return best.done;
    };
    F.peek = () => run ? notes.filter(n => !n.done).slice(0, 4).map(n => ({ m: n.m, dt: n.time - F.st.time })) : [];   // for tests
    return F;
  };
})();
