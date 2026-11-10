/*
 * Battleship — WebAudio sounds (SHIP-2b). Honours shared sfx + masterVolume.
 * Richer cannon, splash and explosion on top of the SHIP-1 beeps. The AudioContext
 * is created on the first tap (browsers block sound before that).
 */
const BSSound = (() => {
  let ctx = null, noise = null;
  function ac() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const n = 2 * ctx.sampleRate, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      noise = buf;
    }
    return ctx;
  }
  function vol() { return (BS_SETTINGS.get('masterVolume') ?? 0.8); }
  function beep(freq, ms, type = 'sine', v = 0.25, at = 0, to = 0) {
    if (!BS_SETTINGS.get('sfx')) return;
    try {
      const c = ac(), t = c.currentTime + at, o = c.createOscillator(), gn = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
      gn.gain.setValueAtTime(v * vol(), t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
      o.connect(gn).connect(c.destination); o.start(t); o.stop(t + ms / 1000);
    } catch (_) { /* no audio: ignore */ }
  }
  function burst(ms, v, at, filterFreq, type, q) {
    if (!BS_SETTINGS.get('sfx')) return;
    try {
      const c = ac(), t = c.currentTime + (at || 0), src = c.createBufferSource(), gn = c.createGain();
      src.buffer = noise; src.loop = true;
      const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(filterFreq || 800, t);
      if (q) f.Q.setValueAtTime(q, t);
      gn.gain.setValueAtTime(v * vol(), t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
      src.connect(f).connect(gn).connect(c.destination); src.start(t); src.stop(t + ms / 1000);
    } catch (_) { /* no audio: ignore */ }
  }
  return {
    place: () => beep(520, 60, 'triangle', 0.25),
    bad: () => beep(120, 140, 'sawtooth', 0.12),
    cannon: () => { burst(180, 0.22, 0, 400, 'lowpass'); beep(180, 200, 'sine', 0.2, 0, 70); beep(420, 90, 'triangle', 0.08, 0.02, 180); },
    miss: () => { burst(280, 0.16, 0, 1800, 'bandpass', 0.7); beep(700, 220, 'sine', 0.1, 0, 200); beep(320, 160, 'sine', 0.08, 0.05, 120); },
    hit: () => { burst(320, 0.28, 0, 900, 'lowpass'); burst(200, 0.12, 0.02, 2400, 'highpass'); beep(160, 260, 'square', 0.12, 0, 50); beep(90, 200, 'sawtooth', 0.1, 0.03); },
    sunk: () => { burst(420, 0.2, 0, 500, 'lowpass'); [220, 165, 110].forEach((f, i) => beep(f, 220, 'square', 0.14, i * 0.14, f * 0.6)); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 160, 'square', 0.12, i * 0.12)),
    lose: () => [392, 330, 262].forEach((f, i) => beep(f, 260, 'triangle', 0.18, i * 0.2)),
  };
})();
if (typeof window !== 'undefined') window.BSSound = BSSound;
