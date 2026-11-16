/* Local Web Audio synthesis only. Starts solely after a user gesture. */
(function () {
  let ctx, engine, gain, muted = false, blink = -1, cranking = false, crankEnds = 0, crankNodes = [];
  let horn = null, hornHeld = false;
  const CRANK_S = .8;
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
  function tone(freq, duration, volume, type = 'sine', when) {
    if (!ctx || muted || ctx.state !== 'running') return;
    const osc = ctx.createOscillator(), amp = ctx.createGain(), t = when == null ? ctx.currentTime : when;
    osc.type = type; osc.frequency.value = freq; amp.gain.setValueAtTime(volume, t);
    amp.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(amp).connect(ctx.destination); osc.start(t); osc.stop(t + duration);
    osc.onended = () => { osc.disconnect(); amp.disconnect(); };
  }
  function dropCrank() {
    cranking = false; crankEnds = 0;
    for (const n of crankNodes) { try { n.stop(); } catch (_) {} try { n.disconnect(); } catch (_) {} }
    crankNodes = [];
  }
  function playCrank() {
    if (!ctx || muted || ctx.state !== 'running') return;
    dropCrank();
    const t = ctx.currentTime, dur = CRANK_S;
    cranking = true; crankEnds = t + dur;
    // Starter motor: low sawtooth that rises, then drops as the engine catches.
    const motor = ctx.createOscillator(), amp = ctx.createGain();
    motor.type = 'sawtooth';
    motor.frequency.setValueAtTime(85, t);
    motor.frequency.linearRampToValueAtTime(130, t + .55);
    motor.frequency.exponentialRampToValueAtTime(55, t + dur);
    amp.gain.setValueAtTime(.0001, t);
    for (let i = 0; i < 9; i++) {
      const ti = t + i * .075;
      amp.gain.setValueAtTime(.05, ti);
      amp.gain.exponentialRampToValueAtTime(.008, ti + .065);
    }
    amp.gain.exponentialRampToValueAtTime(.0001, t + dur);
    motor.connect(amp).connect(ctx.destination); motor.start(t); motor.stop(t + dur);
    crankNodes.push(motor, amp);
    motor.onended = () => { motor.disconnect(); amp.disconnect(); };
    // Pinion chatter over the top.
    const chat = ctx.createOscillator(), camp = ctx.createGain();
    chat.type = 'square';
    chat.frequency.setValueAtTime(420, t);
    chat.frequency.linearRampToValueAtTime(280, t + dur);
    camp.gain.setValueAtTime(.0001, t);
    for (let i = 0; i < 10; i++) {
      const ti = t + i * .07;
      camp.gain.setValueAtTime(.018, ti);
      camp.gain.exponentialRampToValueAtTime(.0001, ti + .04);
    }
    chat.connect(camp).connect(ctx.destination); chat.start(t); chat.stop(t + dur);
    crankNodes.push(chat, camp);
    chat.onended = () => { chat.disconnect(); camp.disconnect(); };
    // Catch: a short mid tone as the idle hum takes over.
    tone(200, .2, .04, 'sawtooth', t + .65);
  }

  const HORN_MIN_S = .6, HORN_ATTACK = .012, HORN_RELEASE = .04;
  function dropHorn(immediate) {
    hornHeld = false;
    if (!horn) return;
    const t = ctx ? ctx.currentTime : 0, rel = immediate ? .02 : HORN_RELEASE, nodes = horn;
    horn = null;
    if (!ctx) return;
    try {
      nodes.gain.gain.cancelScheduledValues(t);
      const v = Math.max(.0001, nodes.gain.gain.value);
      nodes.gain.gain.setValueAtTime(v, t);
      nodes.gain.gain.exponentialRampToValueAtTime(.0001, t + rel);
    } catch (_) { /* already stopping */ }
    for (const o of nodes.oscs) { try { o.stop(t + rel + .02); } catch (_) {} }
  }
  function startHornVoice() {
    if (!ctx || muted || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (horn) {
      try {
        horn.gain.gain.cancelScheduledValues(t);
        const v = Math.max(.0001, horn.gain.gain.value);
        horn.gain.gain.setValueAtTime(v, t);
        horn.gain.gain.exponentialRampToValueAtTime(.075, t + HORN_ATTACK);
      } catch (_) { /* keep existing voice */ }
      return;
    }
    const mix = ctx.createGain(), mid = ctx.createGain();
    mix.gain.setValueAtTime(.0001, t);
    mix.gain.exponentialRampToValueAtTime(.075, t + HORN_ATTACK);
    mid.gain.value = .6;
    mix.connect(ctx.destination);
    const sq = ctx.createOscillator(); sq.type = 'square'; sq.frequency.value = 330;
    const tr = ctx.createOscillator(); tr.type = 'triangle'; tr.frequency.value = 440;
    sq.connect(mix); tr.connect(mid).connect(mix);
    sq.start(t); tr.start(t);
    const voice = { oscs: [sq, tr], gain: mix, extra: mid, started: t };
    horn = voice;
    sq.onended = () => {
      if (horn === voice) horn = null;
      try { sq.disconnect(); tr.disconnect(); mid.disconnect(); mix.disconnect(); } catch (_) {}
    };
  }
  function hornDown() {
    unlock();
    hornHeld = true;
    if (!ctx || muted) return;
    const go = () => { if (hornHeld && !muted) startHornVoice(); };
    if (ctx.state === 'suspended') ctx.resume().then(go).catch(() => {});
    else go();
  }
  function hornUp() {
    if (!hornHeld && !horn) return;
    hornHeld = false;
    if (!ctx || !horn) return;
    const t = ctx.currentTime, stopAt = (window.DS.hornStopAt || ((a, b) => Math.max(b, a + HORN_MIN_S)))(horn.started, t, HORN_MIN_S);
    const rel = HORN_RELEASE;
    try {
      const g = horn.gain.gain;
      g.cancelScheduledValues(t);
      const v = Math.max(.0001, g.value);
      g.setValueAtTime(v, t);
      if (stopAt > t + .001) g.setValueAtTime(v, stopAt);
      g.exponentialRampToValueAtTime(.0001, stopAt + rel);
    } catch (_) { /* already stopping */ }
    for (const o of horn.oscs) { try { o.stop(stopAt + rel + .02); } catch (_) {} }
  }
  function hornStop() { dropHorn(true); }

  window.DS.sound = {
    unlock,
    mute(value) { muted = !!value; if (gain && muted && ctx) gain.gain.setValueAtTime(0, ctx.currentTime); if (muted) hornStop(); },
    hornDown, hornUp, hornStop,
    horn() { hornDown(); hornUp(); },
    crank() {
      unlock();
      if (!ctx || muted) return;
      if (ctx.state === 'suspended') ctx.resume().then(playCrank).catch(() => {});
      else playCrank();
    },
    fault() { unlock(); tone(240, .16, .035, 'sine'); },
    update(c, paused) {
      if (!ctx) return;
      const t = ctx.currentTime;
      if (cranking && t >= crankEnds) cranking = false;
      engine.frequency.setTargetAtTime(Math.max(25, c.rpm / 25), t, .08);
      gain.gain.setTargetAtTime(!muted && !paused && c.engine && !cranking ? .012 + Math.abs(c.v) * .0005 : 0, t, cranking ? .04 : .07);
      const b = Math.floor(c.elapsed * 2);
      if (b !== blink && c.indicator && !paused) tone(b % 2 ? 850 : 650, .035, .025, 'triangle');
      blink = b;
    },
    cutEngine() {
      dropCrank();
      if (gain && ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, .05);
    },
    close() { dropCrank(); hornStop(); if (ctx) ctx.close().catch(() => {}); ctx = null; }
  };
  window.addEventListener('pagehide', () => window.DS.sound.close());
})();
