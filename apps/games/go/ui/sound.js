/*
 * Go — tiny WebAudio clicks (GO-1). Honours shared sfx + masterVolume.
 * The AudioContext is created on the first tap (browsers block sound before that).
 */
const GoSound = (() => {
  let ctx = null;
  function beep(freq, ms, type = 'sine', vol = 0.25, at = 0) {
    if (!GO_SETTINGS.get('sfx')) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const t = ctx.currentTime + at, o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      gn.gain.setValueAtTime(vol * (GO_SETTINGS.get('masterVolume') ?? 0.8), t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
      o.connect(gn).connect(ctx.destination); o.start(t); o.stop(t + ms / 1000);
    } catch (_) { /* no audio: ignore */ }
  }
  return {
    stone: () => beep(520, 60, 'triangle', 0.3),
    capture: () => { beep(330, 80, 'square', 0.12); beep(250, 110, 'square', 0.1, 0.07); },
    pass: () => beep(200, 120, 'sine', 0.2),
    end: () => [392, 523, 659].forEach((f, i) => beep(f, 170, 'triangle', 0.15, i * 0.13)),
  };
})();
