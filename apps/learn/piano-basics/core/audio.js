/* Piano Basics PB1 — piano-ish tone with WebAudio, no audio files. Each note = triangle + quiet sine an octave up,
   fast attack and a decaying tail through one low-pass filter. At most 10 notes ring at once (weak phones).
   The AudioContext starts on the first tap / key press (browsers need a user gesture). PB.audio.count = notes played. */
window.PB = window.PB || {};
(() => {
  const P = window.PB, MAX = 10;
  let ctx = null, out = null;
  const live = [];                                     // {m, gain, oscs, end}
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    out = ctx.createGain(); out.gain.value = 0.5; out.connect(lp); lp.connect(ctx.destination);
    return ctx;
  }
  function stopVoice(v, at) {
    const t = Math.max(at, ctx.currentTime);
    v.gain.gain.cancelScheduledValues(t); v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), t);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    v.oscs.forEach(o => { try { o.stop(t + 0.2); } catch (e) { /* already stopped */ } });
  }
  P.audio = {
    count: 0,
    unlock: init,
    on(m, dur) {                                       // dur in seconds = auto release (demo / quiz); else wait for off(m)
      if (!init()) return;
      const t = ctx.currentTime, f = P.freq(m), g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      g.connect(out);
      const oscs = [['triangle', f, 1], ['sine', f * 2, 0.25]].map(([type, fr, lvl]) => {
        const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = fr; og.gain.value = lvl;
        o.connect(og); og.connect(g); o.start(t); o.stop(t + 2.5); return o;
      });
      const v = { m, gain: g, oscs };
      live.push(v); while (live.length > MAX) stopVoice(live.shift(), t);
      if (dur) stopVoice(v, t + dur);
      this.count++;
    },
    off(m) { if (!ctx) return; for (let i = live.length - 1; i >= 0; i--) if (live[i].m === m) { stopVoice(live[i], ctx.currentTime); live.splice(i, 1); } }
  };
})();
