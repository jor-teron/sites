/* Original short oscillator sounds, unlocked by a user gesture; no audio files. */
'use strict';
BRK.sound = (() => {
  let context;
  const tones = { launch: 420, paddle: 240, hit: 520, break: 760, solid: 150,
    power: 900, laser: 620, lost: 130, over: 90, level: 1040 };
  return {
    unlock() {
      try {
        if (!context) context = new (window.AudioContext || window.webkitAudioContext)();
        if (context.state === 'suspended') context.resume().catch(() => {});
      } catch (_) { /* no WebAudio */ }
    },
    play(type) {
      if (!context || context.state !== 'running' || !BRK.settings.get('sfx')) return;
      const volume = BRK.settings.get('masterVolume');
      if (!volume) return;
      const t = context.currentTime, o = context.createOscillator(), g = context.createGain();
      o.type = type === 'solid' ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(tones[type] || 440, t);
      o.frequency.exponentialRampToValueAtTime((tones[type] || 440) * .6, t + .09);
      g.gain.setValueAtTime(.065 * volume, t);
      g.gain.exponentialRampToValueAtTime(.001, t + .11);
      o.connect(g); g.connect(context.destination); o.start(t); o.stop(t + .12);
    },
  };
})();
