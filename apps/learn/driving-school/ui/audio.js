/* Local Web Audio synthesis only. Starts solely after a user gesture. */
(function () {
  let ctx, engine, gain, muted = false, blink = -1;
  function unlock() {
    try {
      if (!ctx) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        ctx = new Audio(); engine = ctx.createOscillator(); gain = ctx.createGain();
        engine.type = 'sawtooth'; gain.gain.value = 0;
        const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 190;
        engine.connect(filter).connect(gain).connect(ctx.destination); engine.start();
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (_) { /* Audio support is optional; driving remains available. */ }
  }
  function tone(freq, duration, volume, type = 'sine') {
    if (!ctx || muted || ctx.state !== 'running') return;
    const osc = ctx.createOscillator(), amp = ctx.createGain(), t = ctx.currentTime;
    osc.type = type; osc.frequency.value = freq; amp.gain.setValueAtTime(volume, t);
    amp.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(amp).connect(ctx.destination); osc.start(); osc.stop(t + duration);
    osc.onended = () => { osc.disconnect(); amp.disconnect(); };
  }
  window.DS.sound = {
    unlock,
    mute(value) { muted = !!value; if (gain && muted) gain.gain.setValueAtTime(0, ctx.currentTime); },
    horn() { unlock(); tone(330, .35, .075, 'square'); tone(440, .35, .045, 'triangle'); },
    update(c, paused) {
      if (!ctx) return;
      engine.frequency.setTargetAtTime(Math.max(25, c.rpm / 25), ctx.currentTime, .08);
      gain.gain.setTargetAtTime(!muted && !paused && c.engine ? .012 + Math.abs(c.v) * .0005 : 0, ctx.currentTime, .07);
      const b = Math.floor(c.elapsed * 2);
      if (b !== blink && c.indicator && !paused) tone(b % 2 ? 850 : 650, .035, .025, 'triangle');
      blink = b;
    },
    close() { if (ctx) ctx.close().catch(() => {}); ctx = null; }
  };
  window.addEventListener('pagehide', () => window.DS.sound.close());
})();
