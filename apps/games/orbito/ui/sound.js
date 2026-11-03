/*
 * Orbito — tiny WebAudio sounds (ORB-1): place, slide (a rival marble moved), turn (the board turning), win, lose, draw.
 * Honours the shared sfx + masterVolume settings. The AudioContext starts on the first tap
 * (browsers block sound before that); with no audio it stays silent.
 */
const OBSound = (() => {
  let ctx = null;
  function beep(freq, ms, type = 'sine', vol = 0.25, at = 0, to = 0) {
    if (!OB_SETTINGS.get('sfx')) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const t = ctx.currentTime + at, o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
      gn.gain.setValueAtTime(vol * (OB_SETTINGS.get('masterVolume') ?? 0.8), t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
      o.connect(gn).connect(ctx.destination); o.start(t); o.stop(t + ms / 1000);
    } catch (_) { /* no audio: ignore */ }
  }
  return {
    place: () => { beep(740, 60, 'triangle', 0.2); beep(370, 90, 'sine', 0.12, 0.02); },
    slide: () => beep(420, 120, 'triangle', 0.14, 0, 300),
    turn: () => { beep(160, 380, 'sine', 0.1, 0, 240); for (let i = 0; i < 3; i++) beep(900 + i * 60, 30, 'triangle', 0.05, 0.08 + i * 0.12); },
    deny: () => beep(150, 120, 'square', 0.08),
    win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 170, 'square', 0.12, i * 0.12)),
    lose: () => [392, 330, 262].forEach((f, i) => beep(f, 190, 'triangle', 0.14, i * 0.15)),
    draw: () => [440, 440].forEach((f, i) => beep(f, 160, 'sine', 0.14, i * 0.2)),
  };
})();
