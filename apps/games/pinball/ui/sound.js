/*
 * Star Pinball — WebAudio sound effects (PIN-1c), all made in code (no sound files).
 * flipper, bumper, sling, drop target, spinner tick, ramp, hole, mission done, rank up, drain,
 * ball save, nudge, tilt warning, tilt and game over.
 * Follows the shared settings: sfx (on / off) and masterVolume (0 - 1), read at every sound, so a
 * change in Games Settings (this tab or another) applies at once. The AudioContext is made on the
 * first key or tap (browsers block sound before that); with no WebAudio it stays silent.
 * Busy sounds (spinner ticks, bumpers) are rate-limited so a fast ball does not turn into noise.
 * PBSound.log keeps the last sounds asked for ({ name, vol }) for the tests.
 */
const PBSound = (() => {
  const S = PB_SETTINGS;
  let ctx = null, noiseBuf = null;
  const last = {}, log = [];
  const GAP = { spin: 0.03, bumper: 0.04, flipper: 0.05, sling: 0.04, drop: 0.03 };   // s between repeats

  function audio() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (_) { ctx = null; }
    return ctx;
  }
  const vol = () => { const v = Number(S.get('masterVolume')); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8; };
  function tone(c, freq, ms, type, v, at, to) {
    const t = c.currentTime + (at || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0008, t + ms / 1000);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
  }
  function noise(c, ms, v, at, hp) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = c.currentTime + (at || 0), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp || 800;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0008, t + ms / 1000);
    s.connect(f).connect(g).connect(c.destination); s.start(t); s.stop(t + ms / 1000 + 0.02);
  }
  // each sound: (c, v) => notes, v = master volume
  const SOUNDS = {
    flipper: (c, v) => { tone(c, 140, 45, 'square', 0.06 * v); noise(c, 35, 0.05 * v, 0, 2500); },
    bumper: (c, v) => { tone(c, 520, 90, 'square', 0.09 * v, 0, 260); tone(c, 1040, 60, 'triangle', 0.05 * v); },
    sling: (c, v) => { tone(c, 300, 70, 'sawtooth', 0.07 * v, 0, 180); },
    drop: (c, v) => { tone(c, 220, 80, 'triangle', 0.12 * v, 0, 110); noise(c, 40, 0.05 * v, 0, 1500); },
    spin: (c, v) => { tone(c, 1800, 18, 'square', 0.03 * v); },
    ramp: (c, v) => { [392, 523, 659, 784].forEach((f, i) => tone(c, f, 110, 'triangle', 0.09 * v, i * 0.07)); },
    hole: (c, v) => { tone(c, 300, 260, 'sine', 0.14 * v, 0, 90); },
    kick: (c, v) => { tone(c, 120, 90, 'square', 0.08 * v, 0, 300); },
    mission: (c, v) => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(c, f, 120, 'square', 0.07 * v, i * 0.09)); },
    rank: (c, v) => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, f, 200, 'triangle', 0.1 * v, i * 0.11)); tone(c, 1568, 500, 'sine', 0.06 * v, 0.66); },
    drain: (c, v) => { tone(c, 330, 500, 'sawtooth', 0.07 * v, 0, 70); },
    save: (c, v) => { tone(c, 660, 120, 'triangle', 0.1 * v); tone(c, 990, 160, 'triangle', 0.1 * v, 0.12); },
    nudge: (c, v) => { noise(c, 60, 0.07 * v, 0, 300); tone(c, 70, 80, 'sine', 0.12 * v); },
    warn: (c, v) => { tone(c, 880, 120, 'square', 0.08 * v); tone(c, 880, 120, 'square', 0.08 * v, 0.2); },
    tilt: (c, v) => { tone(c, 110, 900, 'sawtooth', 0.12 * v, 0, 55); tone(c, 116, 900, 'sawtooth', 0.08 * v, 0, 58); },
    over: (c, v) => { [392, 330, 262, 196].forEach((f, i) => tone(c, f, 260, 'triangle', 0.12 * v, i * 0.2)); },
  };

  function play(name) {
    if (!S.get('sfx') || !SOUNDS[name]) return false;
    const v = vol(); if (v <= 0) return false;
    const c = audio(); if (!c) return false;
    const now = performance.now() / 1000;                     // not c.currentTime: it stands still while audio is suspended
    if (GAP[name] && now - (last[name] || -1) < GAP[name]) return false;
    last[name] = now;
    log.push({ name, vol: v }); if (log.length > 60) log.shift();
    try { if (c.state === 'suspended') c.resume(); SOUNDS[name](c, v); } catch (_) { /* audio refused: ignore */ }
    return true;
  }
  /** Call from a key or tap: browsers only start audio after one. */
  function unlock() { if (!S.get('sfx')) return; const c = audio(); if (c && c.state === 'suspended') { try { c.resume(); } catch (_) {} } }
  return { play, unlock, log, names: Object.keys(SOUNDS) };
})();
