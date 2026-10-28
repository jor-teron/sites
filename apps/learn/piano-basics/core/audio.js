/* Piano Basics PB2 — sound made with WebAudio, no audio files. Four light sounds (P.audio.sound):
   piano     = triangle + quiet sine an octave up, fast attack, decaying tail;
   organ     = soft sines (1x, 2x, 3x), gentle attack, steady while held;
   bell      = sine + two bell-like partials (2.76x, 5.4x), rings out slowly;
   harmonium = two slightly detuned sawtooth reeds + a square an octave down, bellows-like attack, steady while held.
   All go through one low-pass filter. At most 10 notes ring at once (weak phones).
   on(m, dur, at): dur in seconds = auto release (demo / playback), else wait for off(m); at = seconds from now (scheduled start).
   The AudioContext starts on the first tap / key press (browsers need a user gesture). PB.audio.count = notes played. */
window.PB = window.PB || {};
(() => {
  const P = window.PB, MAX = 10;
  let ctx = null, out = null;
  const live = [];                                     // {m, gain, oscs, rel}
  const VOICES = {
    piano: { parts: [['triangle', 1, 1], ['sine', 2, 0.25]], att: 0.006, peak: 0.6, env: (g, t) => { g.exponentialRampToValueAtTime(0.25, t + 0.25); g.exponentialRampToValueAtTime(0.0001, t + 2.4); }, len: 2.5, rel: 0.18 },
    organ: { parts: [['sine', 1, 1], ['sine', 2, 0.45], ['sine', 3, 0.18]], att: 0.04, peak: 0.32, env: null, len: 0, rel: 0.12 },
    bell: { parts: [['sine', 1, 1], ['sine', 2.76, 0.32], ['sine', 5.4, 0.12]], att: 0.003, peak: 0.55, env: (g, t) => { g.exponentialRampToValueAtTime(0.0001, t + 3.2); }, len: 3.3, rel: 0.8 },
    harmonium: { parts: [['sawtooth', 1, 0.5], ['sawtooth', 1.0035, 0.4], ['square', 0.5, 0.18]], att: 0.06, peak: 0.2, env: null, len: 0, rel: 0.1 }
  };
  const HOLD = 30;                                     // organ / harmonium: longest a held note keeps sounding (s)
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    out = ctx.createGain(); out.gain.value = 0.5; out.connect(lp); lp.connect(ctx.destination);
    return ctx;
  }
  function stopVoice(v, at) {                          // release now (cancel the rest of the envelope) or at a later, scheduled time
    const t = Math.max(at, ctx.currentTime), g = v.gain.gain;
    if (t > ctx.currentTime + 0.02) g.setTargetAtTime(0.0001, t, v.rel / 4);
    else { g.cancelScheduledValues(t); g.setValueAtTime(Math.max(g.value, 0.0001), t); g.exponentialRampToValueAtTime(0.0001, t + v.rel); }
    v.oscs.forEach(o => { try { o.stop(t + v.rel + 0.02); } catch (e) { /* already stopped */ } });
  }
  P.audio = {
    count: 0,
    sound: 'piano',
    sounds: { piano: 'Piano', organ: 'Soft organ', bell: 'Bell', harmonium: 'Harmonium' },
    unlock: init,
    now: () => ctx ? ctx.currentTime : 0,
    on(m, dur, at) {
      if (!init()) return null;
      const V = VOICES[this.sound] || VOICES.piano, t = ctx.currentTime + (at || 0), f = P.freq(m), g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(V.peak, t + V.att);
      if (V.env) V.env(g.gain, t);
      g.connect(out);
      const len = V.len || HOLD;
      const oscs = V.parts.map(([type, mul, lvl]) => {
        const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = f * mul; og.gain.value = lvl;
        o.connect(og); og.connect(g); o.start(t); o.stop(t + len); return o;
      });
      const v = { m, gain: g, oscs, rel: V.rel, start: t, f };
      live.push(v); while (live.length > MAX) stopVoice(live.shift(), ctx.currentTime);
      if (dur) stopVoice(v, t + dur);
      this.count++; this.last = v;
      return v;
    },
    off(m) { if (!ctx) return; for (let i = live.length - 1; i >= 0; i--) if (live[i].m === m) { stopVoice(live[i], ctx.currentTime); live.splice(i, 1); } },
    allOff() { if (!ctx) return; while (live.length) stopVoice(live.pop(), ctx.currentTime); }
  };
})();
