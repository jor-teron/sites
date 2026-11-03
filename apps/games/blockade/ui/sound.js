/*
 * Blockade — tiny WebAudio beeps (BLKD-1). Honours shared sfx + masterVolume.
 * The AudioContext is created on the first tap (browsers block sound before that).
 */
const BKSound = (() => {
  let ctx = null;
  function beep(freq, ms, type = 'sine', vol = 0.25, at = 0) {
    if (!BK_SETTINGS.get('sfx')) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const t = ctx.currentTime + at, o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      gn.gain.setValueAtTime(vol * (BK_SETTINGS.get('masterVolume') ?? 0.8), t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
      o.connect(gn).connect(ctx.destination); o.start(t); o.stop(t + ms / 1000);
    } catch (_) { /* no audio: ignore */ }
  }
  return {
    move: () => beep(440, 70, 'triangle', 0.3),
    wall: () => beep(180, 110, 'square', 0.15),
    bad: () => beep(120, 140, 'sawtooth', 0.12),
    win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 160, 'square', 0.12, i * 0.12)),
  };
})();
