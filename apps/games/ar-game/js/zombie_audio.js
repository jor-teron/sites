/*
 * AR Theme Game — Zombie sounds, synthesized with Web Audio (no files).
 * Groans: sawtooth through a wobbling formant filter. Hits: noise thud.
 * Death: falling groan. Damage: low boom. Started from a user tap.
 */
let ctx = null;
let master = null;
let noiseBuf = null;

export function startZombieAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
  } catch (err) {
    ctx = null;
  }
}

export function stopZombieAudio() {
  if (ctx && ctx.state === "running") ctx.suspend();
}

function ready() {
  return ctx && ctx.state === "running";
}

function out(pan) {
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan || 0));
    p.connect(master);
    return p;
  }
  return master;
}

/** @param {number} vol 0..1  @param {number} pan -1..1 */
export function groan(vol = 0.5, pan = 0, dur = 1.1, fall = 0.75) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const f0 = 70 + Math.random() * 40;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.linearRampToValueAtTime(f0 * fall, t + dur);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5 + Math.random() * 4;
  const lfoG = ctx.createGain();
  lfoG.gain.value = f0 * 0.08;
  lfo.connect(lfoG).connect(osc.frequency);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 4;
  bp.frequency.setValueAtTime(500, t);
  bp.frequency.linearRampToValueAtTime(320 + Math.random() * 300, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35 * vol + 0.001, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(bp).connect(g).connect(out(pan));
  osc.start(t);
  lfo.start(t);
  osc.stop(t + dur + 0.05);
  lfo.stop(t + dur + 0.05);
}

function noise(vol, pan, dur, freq, type = "lowpass") {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out(pan));
  src.start(t);
  src.stop(t + dur + 0.02);
}

export function hitSound(pan = 0) {
  if (!ready()) return;
  noise(0.6, pan, 0.12, 1400);
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.4, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  o.connect(g).connect(out(pan));
  o.start(t);
  o.stop(t + 0.16);
  groan(0.25, pan, 0.25, 1.2);
}

export function deathSound(pan = 0) {
  if (!ready()) return;
  groan(0.9, pan, 1.3, 0.45);
  setTimeout(() => ready() && noise(0.5, pan, 0.3, 300), 650);
}

export function damageSound() {
  if (!ready()) return;
  noise(0.9, 0, 0.45, 180);
  groan(1, 0, 0.6, 0.8);
}

export function zombieAudioState() {
  return ctx ? ctx.state : "none";
}
