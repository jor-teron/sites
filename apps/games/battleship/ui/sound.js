/*
 * Battleship — tiny WebAudio sounds (SHIP-1). Honours shared sfx + masterVolume.
 * The AudioContext is created on the first tap (browsers block sound before that).
 */
const BSSound = (() => {
  let ctx = null;
  function beep(freq, ms, type = 'sine', vol = 0.25, at = 0, to = 0) {
    if (!BS_SETTINGS.get('sfx')) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const t = ctx.currentTime + at, o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
      gn.gain.setValueAtTime(vol * (BS_SETTINGS.get('masterVolume') ?? 0.8), t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
      o.connect(gn).connect(ctx.destination); o.start(t); o.stop(t + ms / 1000);
    } catch (_) { /* no audio: ignore */ }
  }
  return {
    place: () => beep(520, 60, 'triangle', 0.25),
    bad: () => beep(120, 140, 'sawtooth', 0.12),
    miss: () => beep(700, 220, 'sine', 0.18, 0, 200),
    hit: () => { beep(160, 260, 'square', 0.16, 0, 50); beep(90, 200, 'sawtooth', 0.1, 0.03); },
    sunk: () => [220, 165, 110].forEach((f, i) => beep(f, 220, 'square', 0.14, i * 0.14, f * 0.6)),
    win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 160, 'square', 0.12, i * 0.12)),
    lose: () => [392, 330, 262].forEach((f, i) => beep(f, 260, 'triangle', 0.18, i * 0.2)),
  };
})();
