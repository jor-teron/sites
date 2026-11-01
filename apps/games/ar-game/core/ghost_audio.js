/*
 * AR Theme Game — ghost proximity sound (Web Audio synthesis, ES module).
 * Filtered noise "whoosh" + a detuned low hum, louder and brighter as you
 * aim closer to the ghost, panned left/right toward it. One AudioContext is
 * created lazily on a user gesture and reused; it is suspended when idle.
 */
let ctx = null;
let nodes = null;
let suspendTimer = 0;

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();

  // 2 s of white noise, looped
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;

  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 500;
  band.Q.value = 1.2;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.6;

  const hum1 = ctx.createOscillator();
  hum1.type = "sine";
  hum1.frequency.value = 92;
  const hum2 = ctx.createOscillator();
  hum2.type = "sine";
  hum2.frequency.value = 95.5;
  const humGain = ctx.createGain();
  humGain.gain.value = 0.25;

  // Slow wobble on the whoosh filter
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.35;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain).connect(band.frequency);

  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const master = ctx.createGain();
  master.gain.value = 0;

  noise.connect(band).connect(noiseGain).connect(master);
  hum1.connect(humGain);
  hum2.connect(humGain);
  humGain.connect(master);
  if (pan) {
    master.connect(pan).connect(ctx.destination);
  } else {
    master.connect(ctx.destination);
  }
  noise.start();
  hum1.start();
  hum2.start();
  lfo.start();
  nodes = { band, master, pan };
  return true;
}

/** Create/resume audio. Must be called from a user gesture the first time. */
export function startGhostAudio() {
  if (suspendTimer) {
    clearTimeout(suspendTimer);
    suspendTimer = 0;
  }
  if (!ctx && !build()) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

/**
 * @param {number} closeness 0 (ghost behind you) … 1 (aiming right at it)
 * @param {number} pan -1 left … +1 right
 */
export function setGhostAudio(closeness, pan) {
  if (!ctx || !nodes || ctx.state !== "running") return;
  const t = ctx.currentTime;
  const c = Math.max(0, Math.min(1, closeness));
  const level = 0.02 + Math.pow(c, 3) * 0.35;
  nodes.master.gain.setTargetAtTime(level, t, 0.08);
  nodes.band.frequency.setTargetAtTime(300 + c * 1400, t, 0.1);
  if (nodes.pan) nodes.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.1);
}

/** Fade out and suspend (keeps the graph for reuse, no per-swap allocation). */
export function stopGhostAudio() {
  if (!ctx || !nodes) return;
  nodes.master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  if (suspendTimer) clearTimeout(suspendTimer);
  suspendTimer = setTimeout(() => {
    suspendTimer = 0;
    if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
  }, 200);
}

export function ghostAudioState() {
  return ctx ? ctx.state : "none";
}
