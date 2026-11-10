/* Synthesized effects only, unlocked by a real user gesture. No downloads. */
const SNLSound = (() => {
  let context;
  function unlock() {
    if (!SNLSettings.get('sfx')) return;
    try {
      context ||= new (window.AudioContext || window.webkitAudioContext)();
      context.resume().catch(() => {});
    } catch (_) {}
  }
  function play(kind) {
    const volume = SNLSettings.get('masterVolume');
    if (!SNLSettings.get('sfx') || !volume || !context || context.state !== 'running') return;
    const notes =
      {
        roll: [160, 220],
        hop: [420],
        ladder: [330, 440, 550, 660],
        snake: [320, 250, 170],
        win: [440, 550, 660, 880],
      }[kind] || [];
    notes.forEach((freq, i) => {
      const start = context.currentTime + i * 0.07,
        osc = context.createOscillator(),
        gain = context.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume * 0.09, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(start);
      osc.stop(start + 0.14);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  }
  return { unlock, play };
})();
