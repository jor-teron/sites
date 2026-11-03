/*
 * Ludo — tiny WebAudio sounds (LUDO-1c): roll, move (a soft tick per square), capture, home, finish, win.
 * Honours the shared sfx + masterVolume settings. The AudioContext starts on the first tap
 * (browsers block sound before that); with no audio it stays silent.
 */
const LDSound = (() => {
  let ctx = null;
  function beep(freq, ms, type = 'sine', vol = 0.25, at = 0, to = 0) {
    if (!LD_SETTINGS.get('sfx')) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const t = ctx.currentTime + at, o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
      gn.gain.setValueAtTime(vol * (LD_SETTINGS.get('masterVolume') ?? 0.8), t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
      o.connect(gn).connect(ctx.destination); o.start(t); o.stop(t + ms / 1000);
    } catch (_) { /* no audio: ignore */ }
  }
  return {
    roll: () => { for (let i = 0; i < 4; i++) beep(300 + Math.random() * 300, 40, 'square', 0.06, i * 0.07); },
    step: () => beep(660, 35, 'triangle', 0.12),
    move: () => beep(520, 70, 'triangle', 0.18),
    capture: () => { beep(180, 240, 'sawtooth', 0.14, 0, 60); beep(90, 200, 'square', 0.08, 0.04); },
    home: () => [660, 880].forEach((f, i) => beep(f, 140, 'triangle', 0.2, i * 0.1)),
    finish: () => [523, 659, 784].forEach((f, i) => beep(f, 150, 'triangle', 0.16, i * 0.12)),
    win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 170, 'square', 0.12, i * 0.12)),
    pass: () => beep(220, 160, 'sine', 0.12, 0, 160),
  };
})();
