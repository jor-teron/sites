/*
 * File: ui/sound.js
 * Project: tennis-throw — TB9
 * Purpose: Tiny WebAudio blips (no audio files). Volume = Games settings
 *          masterVolume, muted when 'sfx' is off. The AudioContext is made on
 *          the first throw (a user gesture), so browsers allow it. Fails silent.
 */
(function (TT) {
  const CFG = TT.CFG;
  let ac = null;

  function ctx() {
    if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; try { ac = new A(); } catch (e) { return null; } }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }

  /** One tone: freq Hz → freq2 Hz over dur s, oscillator type, relative gain. */
  function tone(freq, freq2, dur, type, gain, delay) {
    const vol = TT.settings.get('sfx') === false ? 0 : (TT.settings.get('masterVolume') ?? 0.8) * CFG.sound.volume * gain;
    if (vol <= 0) return;
    const a = ctx(); if (!a) return;
    const t0 = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0); o.frequency.exponentialRampToValueAtTime(freq2, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }

  /** Play a named effect. */
  TT.sound = function (name, mult) {
    try {
      if (name === 'throw') tone(320, 180, 0.08, 'triangle', 0.6);
      else if (name === 'hit') tone(520 * (mult || 1) ** 0.4, 880 * (mult || 1) ** 0.4, 0.12, 'square', 0.35);
      else if (name === 'bounce') tone(200, 120, 0.05, 'sine', 0.5);
      else if (name === 'miss') tone(300, 120, 0.2, 'sawtooth', 0.25);
      else if (name === 'round') { tone(523, 523, 0.1, 'triangle', 0.5); tone(784, 784, 0.15, 'triangle', 0.5, 0.11); }
      else if (name === 'over') { tone(440, 220, 0.4, 'triangle', 0.6); }
    } catch (e) { /* audio is optional */ }
  };
  /** Physics hook for wall bounces. */
  TT.onBounce = () => TT.sound('bounce');
})(window.TT);
