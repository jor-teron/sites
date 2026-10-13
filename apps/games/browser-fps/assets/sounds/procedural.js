/**
 * Browser FPS sound asset: procedural — every sound synthesised with Web Audio (no files).
 * Interface: default export { kind: 'sounds', name, make(ctx, out, noise) -> { [soundName](opts) } }
 *   ctx = AudioContext, out = destination node, noise = shared 1 s white-noise AudioBuffer.
 *   Each sound fn receives { gain (0..1), pan (-1..1) } already resolved by the engine and the voice's output node.
 * Swap by pointing CONFIG.audio.pack at another module with the same names.
 */
export function make(ctx) {
  const r = (a, b) => a + Math.random() * (b - a);
  const env = (node, t, peak, att, dec) => {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + att);
    node.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
  };
  // noise burst through a filter
  function noise(out, nb, { t, type = 'lowpass', f = 2000, f2, q = 0.7, peak = 1, att = 0.002, dec = 0.15, rate = 1 }) {
    const s = ctx.createBufferSource(); s.buffer = nb; s.playbackRate.value = rate;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + att + dec);
    const g = ctx.createGain(); env(g, t, peak, att, dec);
    s.connect(fl).connect(g).connect(out);
    s.start(t, Math.random() * 0.5, att + dec + 0.05);
  }
  function tone(out, { t, type = 'sine', f = 440, f2, peak = 0.5, att = 0.003, dec = 0.2 }) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + att + dec);
    const g = ctx.createGain(); env(g, t, peak, att, dec);
    o.connect(g).connect(out); o.start(t); o.stop(t + att + dec + 0.05);
  }
  const click = (out, nb, t, f = 3500, peak = 0.5) => noise(out, nb, { t, type: 'bandpass', f, q: 4, peak, dec: 0.025 });

  return {
    shot(out, nb, t) {               // player rifle: crack + body + low thump, slightly varied
      const v = r(0.92, 1.08);
      noise(out, nb, { t, type: 'highpass', f: 1800 * v, peak: 0.6, dec: 0.06 });
      noise(out, nb, { t, f: 3000 * v, f2: 300, peak: 0.9, dec: 0.16 });
      tone(out, { t, type: 'triangle', f: 140 * v, f2: 45, peak: 0.8, dec: 0.12 });
    },
    dryClick(out, nb, t) { click(out, nb, t, 2600, 0.5); click(out, nb, t + 0.05, 1800, 0.25); },
    reload(out, nb, t) {             // mag out ... mag in ... bolt
      click(out, nb, t + 0.05, 1500, 0.5); noise(out, nb, { t: t + 0.08, type: 'bandpass', f: 700, q: 2, peak: 0.2, dec: 0.12 });
      click(out, nb, t + 0.75, 1200, 0.6); click(out, nb, t + 0.8, 2400, 0.4);
      click(out, nb, t + 1.15, 3000, 0.5); click(out, nb, t + 1.25, 2000, 0.5);
    },
    enemyShot(out, nb, t) {
      const v = r(0.9, 1.1);
      noise(out, nb, { t, f: 2200 * v, f2: 250, peak: 0.8, dec: 0.2 });
      tone(out, { t, type: 'triangle', f: 110 * v, f2: 40, peak: 0.6, dec: 0.14 });
    },
    hitBody(out, nb, t) { noise(out, nb, { t, f: 900, peak: 0.6, dec: 0.07 }); tone(out, { t, f: 220, f2: 120, peak: 0.3, dec: 0.06 }); },
    hitHead(out, nb, t) { tone(out, { t, type: 'sine', f: 1760, peak: 0.35, dec: 0.35 }); tone(out, { t, type: 'sine', f: 2640, peak: 0.15, dec: 0.25 }); noise(out, nb, { t, f: 1200, peak: 0.4, dec: 0.05 }); },
    enemyDeath(out, nb, t) { tone(out, { t, type: 'sawtooth', f: 180, f2: 60, peak: 0.25, att: 0.01, dec: 0.5 }); noise(out, nb, { t: t + 0.45, f: 400, peak: 0.6, dec: 0.25 }); },
    hurt(out, nb, t) { tone(out, { t, type: 'sawtooth', f: r(150, 175), f2: 90, peak: 0.3, att: 0.01, dec: 0.18 }); noise(out, nb, { t, f: 300, peak: 0.7, dec: 0.12 }); },
    playerDeath(out, nb, t) { tone(out, { t, type: 'sawtooth', f: 160, f2: 40, peak: 0.4, att: 0.02, dec: 1.0 }); noise(out, nb, { t: t + 0.6, f: 250, peak: 0.8, dec: 0.4 }); tone(out, { t: t + 0.1, f: 70, f2: 30, peak: 0.5, dec: 1.5 }); },
    grenadeThrow(out, nb, t) { click(out, nb, t, 4000, 0.4); tone(out, { t: t + 0.04, f: 3200, f2: 2600, peak: 0.08, dec: 0.12 }); noise(out, nb, { t: t + 0.08, type: 'bandpass', f: 900, f2: 2500, q: 1, peak: 0.25, att: 0.05, dec: 0.15 }); },
    grenadeBounce(out, nb, t) { const v = r(0.9, 1.15); tone(out, { t, type: 'triangle', f: 1400 * v, peak: 0.25, dec: 0.08 }); click(out, nb, t, 2500 * v, 0.4); },
    explosion(out, nb, t) {
      noise(out, nb, { t, f: 4000, f2: 120, peak: 1, att: 0.003, dec: 1.2, rate: 0.6 });
      noise(out, nb, { t, type: 'highpass', f: 1500, peak: 0.6, dec: 0.12 });
      tone(out, { t, type: 'sine', f: 90, f2: 28, peak: 1, att: 0.005, dec: 0.9 });
    },
    medkit(out, nb, t) { tone(out, { t, type: 'triangle', f: 660, peak: 0.3, dec: 0.12 }); tone(out, { t: t + 0.1, type: 'triangle', f: 990, peak: 0.3, dec: 0.25 }); },
    grenadePickup(out, nb, t) { click(out, nb, t, 2000, 0.5); click(out, nb, t + 0.07, 2800, 0.4); tone(out, { t: t + 0.05, type: 'triangle', f: 520, peak: 0.2, dec: 0.15 }); },
    snowstep(out, nb, t) {   // crunch: low thump + gritty band-passed crackle
      noise(out, nb, { t, f: r(250, 380), peak: 0.28, att: 0.006, dec: 0.09 });
      noise(out, nb, { t: t + 0.01, type: 'bandpass', f: r(1600, 2400), f2: r(900, 1200), q: 1.6, peak: 0.3, att: 0.01, dec: 0.16, rate: r(0.8, 1.1) });
      noise(out, nb, { t: t + 0.05, type: 'highpass', f: 3000, peak: 0.08, att: 0.005, dec: 0.06 });
    },
    footstep(out, nb, t) { noise(out, nb, { t, f: r(350, 500), peak: 0.35, att: 0.004, dec: 0.07 }); },
  };
}
export default { kind: 'sounds', name: 'procedural', make };
