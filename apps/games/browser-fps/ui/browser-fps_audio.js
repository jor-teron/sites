/**
 * Browser FPS — audio engine (Web Audio, no files).
 * createAudio(cfg, pack): cfg = CONFIG.audio, pack = sound asset (assets/sounds/*.js).
 * Returns { unlock(), play(name, { pos, listener, yaw, vol }), setMuted(b), toggleMute(), muted, ctx, names }.
 * - AudioContext is created / resumed on the first user gesture (unlock()).
 * - One shared noise buffer; at most cfg.maxVoices sounds at once (oldest dropped); per-sound rate limit.
 * - Positional: volume falls with distance (refDist..maxDist), stereo pan from the listener's yaw.
 */
export function createAudio(cfg, pack) {
  let ctx = null, master = null, nb = null, sounds = null;
  let muted = localStorage.getItem(cfg.storageKey) === '1';
  const voices = [];             // { g, end }
  const last = Object.create(null);

  function unlock() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : cfg.masterVolume;
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp).connect(ctx.destination);
        nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = nb.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        sounds = pack.make(ctx);
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { console.warn('[audio]', e.message || e); }
  }

  function play(name, o = {}) {
    if (!ctx || muted || ctx.state !== 'running' || !sounds || !sounds[name]) return false;
    const now = ctx.currentTime;
    const minGap = cfg.minGap[name] ?? 0.02;
    if (last[name] !== undefined && now - last[name] < minGap) return false;
    last[name] = now;
    let vol = (cfg.volumes[name] ?? 1) * (o.vol ?? 1), pan = 0;
    if (o.pos && o.listener) {
      const dx = o.pos.x - o.listener.x, dz = o.pos.z - o.listener.z;
      const d = Math.hypot(dx, dz);
      vol *= d <= cfg.refDist ? 1 : Math.max(0, 1 - (d - cfg.refDist) / (cfg.maxDist - cfg.refDist)) ** 1.5;
      if (d > 0.3) {
        const yaw = o.yaw || 0;   // camera looks along (-sin yaw, -cos yaw); right = (cos yaw, -sin yaw)
        pan = Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d)) * 0.8;
      }
    }
    if (vol < 0.01) return false;
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end < now) voices.splice(i, 1);
    if (voices.length >= cfg.maxVoices) { const v = voices.shift(); v.g.gain.setTargetAtTime(0, now, 0.01); }
    const g = ctx.createGain(); g.gain.value = vol;
    let out = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p).connect(master); }
    else g.connect(master);
    try { sounds[name](out, nb, now + 0.005); } catch (e) { console.warn('[audio]', name, e.message || e); }
    voices.push({ g, end: now + (cfg.voiceLen[name] ?? 0.6) });
    return true;
  }

  function setMuted(b) {
    muted = !!b;
    localStorage.setItem(cfg.storageKey, muted ? '1' : '0');
    if (master) master.gain.setTargetAtTime(muted ? 0 : cfg.masterVolume, ctx.currentTime, 0.02);
    api.onMute && api.onMute(muted);
  }
  const api = {
    unlock, play, setMuted, toggleMute: () => setMuted(!muted),
    get muted() { return muted; }, get ctx() { return ctx; },
    get names() { return sounds ? Object.keys(sounds) : []; },
    get voices() { return voices.length; }, onMute: null,
  };
  return api;
}
