/* Guitar Chords GC1 — plucked-string sound with WebAudio, no audio files. Karplus-Strong: a short burst of noise is fed
   through a delay one pitch-period long with an averaging filter, which sounds like a plucked string. Each note's buffer
   is made once and cached. One voice per string (a new pluck stops the old one), so a strum rings at most 6 notes.
   The AudioContext starts on the first tap (browsers need a user gesture). GC.audio.count = notes played. */
window.GC = window.GC || {};
(() => {
  const G = window.GC, LEN = 1.6, cache = {}, live = [];
  let ctx = null, out = null;
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); out = ctx.createGain(); out.gain.value = 0.55; out.connect(ctx.destination);
    return ctx;
  }
  function buffer(m) {
    if (cache[m]) return cache[m];
    const sr = ctx.sampleRate, n = Math.round(sr * LEN), N = Math.max(2, Math.round(sr / G.freq(m)));
    const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), ring = new Float32Array(N);
    let prev = 0;
    for (let i = 0; i < N; i++) { prev = prev * 0.5 + (Math.random() * 2 - 1) * 0.5; ring[i] = prev; }   // softened noise = warmer pick
    const decay = m > 60 ? 0.994 : 0.997;
    for (let i = 0, k = 0; i < n; i++) {
      const a = ring[k], k2 = k + 1 === N ? 0 : k + 1;
      d[i] = a * (i < 40 ? i / 40 : 1);
      ring[k] = (a + ring[k2]) * 0.5 * decay; k = k2;
    }
    return (cache[m] = b);
  }
  G.audio = {
    count: 0,
    unlock: init,
    pluck(s, m, when, vol) {                              // string index, MIDI note, delay in s
      if (!init()) return;
      const t = ctx.currentTime + (when || 0);
      if (live[s]) { const o = live[s]; o.g.gain.setTargetAtTime(0, t, 0.02); try { o.src.stop(t + 0.15); } catch (e) { /* done */ } }
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buffer(m); g.gain.value = vol || 0.45;
      src.connect(g); g.connect(out); src.start(t);
      live[s] = { src, g }; this.count++;
    },
    click(accent) {                                       // metronome tick
      if (!init()) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = accent ? 1500 : 1000; g.gain.setValueAtTime(accent ? 0.35 : 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.07);
    },
    mute() { if (!ctx) return; live.forEach(o => o && o.g.gain.setTargetAtTime(0, ctx.currentTime, 0.03)); }
  };
  // strum a chord: down = low E to high e; gap between strings in seconds
  G.strum = (c, up, gap) => {
    const order = [0, 1, 2, 3, 4, 5].filter(s => c.f[s] >= 0); if (up) order.reverse();
    order.forEach((s, i) => G.audio.pluck(s, G.note(s, c.f[s]), i * (gap || 0.03), up ? 0.35 : 0.45));
    return order;
  };
})();
