/* Morse Code MC1 — the beep (WebAudio sine, default 600 Hz) and the player. play(code) schedules the whole message on one
   oscillator with short ramps (no clicks), and calls onLight(true/false) in time so the screen lamp flashes with the sound.
   key(true/false) is the live side tone for the tap key. The AudioContext starts on the first tap (browsers need a gesture).
   MC.audio.count = beeps sounded (for tests). */
window.MC = window.MC || {};
(() => {
  const M = window.MC;
  let ctx = null, osc = null, gain = null, timers = [], keyOsc = null;
  const init = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    return (ctx = new AC());
  };
  const tone = () => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = M.audio.hz; g.gain.value = 0; o.connect(g); g.connect(ctx.destination); return [o, g]; };
  M.audio = {
    hz: 600, count: 0, playing: false, unlock: init,
    stop() {
      timers.forEach(clearTimeout); timers = []; this.playing = false;
      if (osc) { try { gain.gain.cancelScheduledValues(0); gain.gain.value = 0; osc.stop(); } catch (e) { /* stopped */ } osc = null; }
    },
    play(code, wpm, onLight, onDone) {
      this.stop(); const light = onLight || (() => {});
      const tl = M.timeline(code, wpm); let t = 0;
      const c = init(), start = c ? c.currentTime + 0.05 : 0;
      if (c) { [osc, gain] = tone(); osc.start(start); }
      tl.forEach(([on, ms]) => {
        if (on) {
          const a = start + t / 1000, b = a + ms / 1000;
          if (c) { gain.gain.setValueAtTime(0, a); gain.gain.linearRampToValueAtTime(0.3, a + 0.005); gain.gain.setValueAtTime(0.3, b - 0.005); gain.gain.linearRampToValueAtTime(0, b); }
          timers.push(setTimeout(() => { this.count++; light(true); }, 50 + t), setTimeout(() => light(false), 50 + t + ms));
        }
        t += ms;
      });
      this.playing = true;
      if (osc) osc.stop(start + t / 1000 + 0.05);
      timers.push(setTimeout(() => { this.playing = false; osc = null; if (onDone) onDone(); }, 80 + t));
      return t;
    },
    key(on) {                                            // side tone while the tap key is held
      if (!init()) return;
      if (on && !keyOsc) { keyOsc = tone(); keyOsc[0].start(); keyOsc[1].gain.setTargetAtTime(0.3, ctx.currentTime, 0.003); this.count++; }
      if (!on && keyOsc) { const [o, g] = keyOsc; g.gain.setTargetAtTime(0, ctx.currentTime, 0.004); o.stop(ctx.currentTime + 0.05); keyOsc = null; }
    }
  };
})();
