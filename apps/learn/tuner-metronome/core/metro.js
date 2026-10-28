/* Tuner & Metronome TM1 — metronome engine. Uses the WebAudio clock with a lookahead scheduler (a 25 ms timer books
   clicks up to 120 ms ahead at exact times), so beats do not drift the way plain setInterval clicks do.
   TM.makeMetro(getCtx) -> { start(), stop(), set({bpm, beats}), running, bpm, beats, queue, log }.
   queue holds booked beats {t, b} for the screen to flash when the audio clock reaches them; log keeps the last 64 for tests. */
(() => {
  const TM = window.TM = window.TM || {};
  TM.makeMetro = getCtx => {
    const m = { bpm: 90, beats: 4, running: false, queue: [], log: [] };
    let ctx = null, timer = 0, next = 0, beat = 0;
    function click(t, accent) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = accent ? 1760 : 1100;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.28, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.06);
    }
    function tick() {
      while (next < ctx.currentTime + 0.12) {
        click(next, beat === 0);
        const e = { t: next, b: beat }; m.queue.push(e); m.log.push(e); if (m.log.length > 64) m.log.shift();
        next += 60 / m.bpm; beat = (beat + 1) % m.beats;
      }
    }
    m.start = () => {
      ctx = getCtx(); if (!ctx || m.running) return;
      ctx.resume && ctx.resume();
      m.running = true; m.log.length = 0; m.queue.length = 0; beat = 0; next = ctx.currentTime + 0.08;
      tick(); timer = setInterval(tick, 25);
    };
    m.stop = () => { m.running = false; clearInterval(timer); m.queue.length = 0; };
    m.set = o => {
      if (o.bpm) m.bpm = Math.max(30, Math.min(240, Math.round(o.bpm)));
      if (o.beats) { m.beats = o.beats; if (beat >= m.beats) beat = 0; }
    };
    return m;
  };
})();
