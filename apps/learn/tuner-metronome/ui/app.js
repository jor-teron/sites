/* Tuner & Metronome TM1 — screens: Metronome (30-240 BPM slider, +/- and tap tempo, 2/3/4/6 beats per bar with an
   accented beat 1, flashing beat dots and a swinging pendulum, presets) and Tuner (microphone only after "Start
   listening", note + octave, optional sargam with Sa = C, frequency, cents needle -50..+50 that turns green within
   ±5, guitar mode EADGBE with tighten/loosen hints, reference tones). Plain-language help on screen for beginners.
   Saves in localStorage: learn.tuner-metronome.metro {bpm, beats}, .tuner {mode, sargam} and .screen. */
(() => {
  const TM = window.TM, VER = 'TM1', store = LRN.store, K = 'learn.tuner-metronome.', root = document.getElementById('app');
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : String(c)));
    return el;
  };
  const S = (tag, attrs) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) el.setAttribute(k, attrs[k]); return el; };
  let ctx = null;
  const getCtx = () => { const A = window.AudioContext || window.webkitAudioContext; if (!ctx && A) ctx = new A(); ctx && ctx.state === 'suspended' && ctx.resume(); return ctx; };
  const MODES = { metro: 'Metronome', tuner: 'Tuner' };
  const modeBar = h('div', { class: 'lrn-mode', role: 'group', 'aria-label': 'Mode' }, Object.keys(MODES).map(m => h('button', { type: 'button', 'data-m': m, onclick: () => go(m) }, MODES[m])));
  const main = h('main', { class: 'lrn-main tm-main', id: 'lrn-main' });
  root.className = 'lrn tm';
  root.replaceChildren(h('header', { class: 'lrn-head' }, h('h1', null, h('span', { class: 'lrn-here' }, 'Tuner & Metronome')), modeBar, h('span', { class: 'tm-ver' }, VER)), main);
  let stopper = null;
  function go(m) {
    stopper && stopper(); stopper = null;
    modeBar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    document.title = 'Tuner & Metronome ' + VER + ' \u2013 ' + MODES[m]; store.write(K + 'screen', m); try { history.replaceState(null, '', '#' + m); } catch (e) { /* some file:// setups refuse */ }
    (m === 'metro' ? metro : tuner)();
  }
  const help = t => h('p', { class: 'tm-help' }, t);

  // ---------- metronome ----------
  const met = TM.makeMetro(getCtx), ms = store.read(K + 'metro', {}) || {};
  met.set({ bpm: ms.bpm || 90, beats: [2, 3, 4, 6].includes(ms.beats) ? ms.beats : 4 });
  const speedWord = b => b < 70 ? 'slow' : b < 110 ? 'medium (walking pace)' : b < 160 ? 'fast' : 'very fast';
  function metro() {
    const save = () => store.write(K + 'metro', { bpm: met.bpm, beats: met.beats });
    const big = h('div', { class: 'tm-bpm', 'aria-live': 'polite' }), word = h('div', { class: 'tm-word' });
    const slider = h('input', { type: 'range', min: 30, max: 240, step: 1, class: 'tm-slider', 'aria-label': 'Beats per minute', oninput: () => setBpm(+slider.value) });
    const dots = h('div', { class: 'tm-dots' }), arm = S('g', {}), pend = S('svg', { viewBox: '0 0 200 120', class: 'tm-pend', 'aria-hidden': 'true' });
    arm.append(S('line', { x1: 100, y1: 112, x2: 100, y2: 14, stroke: 'currentColor', 'stroke-width': 4, 'stroke-linecap': 'round' }), S('circle', { cx: 100, cy: 30, r: 9, fill: '#ffb000' }));
    pend.append(S('path', { d: 'M40 116 L100 6 L160 116 Z', fill: 'none', stroke: 'currentColor', 'stroke-opacity': 0.25, 'stroke-width': 3 }), arm);
    const startBtn = h('button', { type: 'button', class: 'lrn-qc tm-go', onclick: () => { met.running ? met.stop() : met.start(); paintRun(); } });
    const beatsRow = h('div', { class: 'tm-row', role: 'group', 'aria-label': 'Beats per bar' });
    function setBpm(b) { met.set({ bpm: b }); paint(); save(); }
    function paintRun() { startBtn.textContent = met.running ? '\u25A0 Stop' : '\u25B6 Start'; startBtn.setAttribute('aria-pressed', String(met.running)); if (!met.running) lightDot(-1); }
    function paint() {
      big.textContent = met.bpm + ' BPM'; word.textContent = (met.bpm === 60 ? 'one click every second \u2013 ' : '') + speedWord(met.bpm); slider.value = met.bpm;
      beatsRow.replaceChildren(h('span', { class: 'tm-lab' }, 'Beats per bar:'), ...[2, 3, 4, 6].map(n => h('button', { type: 'button', class: 'lrn-qc', 'data-beats': n, 'aria-pressed': String(met.beats === n), onclick: () => { met.set({ beats: n }); paint(); save(); } }, n)));
      dots.replaceChildren(...Array.from({ length: met.beats }, (_, i) => h('span', { class: 'tm-dot' + (i ? '' : ' one') }, i + 1)));
    }
    const lightDot = b => dots.querySelectorAll('.tm-dot').forEach((d, i) => d.classList.toggle('on', i === b));
    let taps = [];
    function tap() {
      const now = performance.now(); if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
      taps.push(now); taps = taps.slice(-6);
      if (taps.length > 1) setBpm(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
    }
    const step = d => h('button', { type: 'button', class: 'lrn-qc tm-step', 'aria-label': (d > 0 ? 'Faster' : 'Slower') + ' by 1', onclick: () => setBpm(met.bpm + d) }, d > 0 ? '+' : '\u2212');
    main.replaceChildren(h('div', { class: 'tm-page' },
      h('h2', { class: 'lrn-h' }, '\u{1F941} Metronome'),
      help('A metronome clicks a steady beat so you can keep time while you play. BPM means beats per minute: 60 BPM is one click every second, 120 BPM is two.'),
      h('div', { class: 'tm-metro' },
        h('div', { class: 'tm-vis' }, pend, dots),
        h('div', { class: 'tm-ctl' }, big, word,
          h('div', { class: 'tm-row tm-sl' }, step(-1), slider, step(1)),
          h('div', { class: 'tm-row' }, startBtn, h('button', { type: 'button', class: 'lrn-qc tm-tap', onclick: tap }, '\u{1F446} Tap tempo')),
          h('div', { class: 'tm-row' }, h('span', { class: 'tm-lab' }, 'Presets:'), [['Slow', 60], ['Walk', 90], ['Fast', 120]].map(([l, b]) => h('button', { type: 'button', class: 'lrn-qc', 'data-bpm': b, onclick: () => setBpm(b) }, l + ' ' + b))),
          beatsRow)),
      help('Music is counted in groups of beats called bars. Beat 1 of each bar clicks higher (the accent) so you always know where the bar starts. Most songs use 4; waltzes use 3.'),
      help('Tap tempo: tap the button 4 or more times along with a song and the metronome copies its speed.')));
    paint(); paintRun();
    let raf = 0, last = null, count = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!met.running || !ctx) { arm.setAttribute('transform', 'rotate(0 100 112)'); return; }
      const now = ctx.currentTime;
      while (met.queue.length && met.queue[0].t <= now) { last = met.queue.shift(); count++; lightDot(last.b); }
      if (!last) return;
      const ph = Math.min(1, (now - last.t) / (60 / met.bpm));
      arm.setAttribute('transform', 'rotate(' + (32 * Math.sin(Math.PI * ph) * (count % 2 ? 1 : -1)).toFixed(1) + ' 100 112)');
    };
    loop();
    stopper = () => { cancelAnimationFrame(raf); met.stop(); };
  }

  // ---------- tuner ----------
  const ts = Object.assign({ mode: 'guitar', sargam: false }, store.read(K + 'tuner', {}) || {});
  function tone(f) {
    const c = getCtx(); if (!c) return;
    const t = c.currentTime, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(g); o2.connect(g); g.connect(c.destination); [o, o2].forEach(x => { x.start(t); x.stop(t + 2.3); });
    TM.lastTone = f;
  }
  const MSG = {
    none: 'The microphone is not available here. Browsers only allow it on secure pages (https or localhost), so opening this file straight from your device may block it. The reference tones below still work.',
    NotAllowedError: 'Microphone access was blocked. To use the tuner, allow the microphone for this page in your browser settings, then tap Start listening again.',
    NotFoundError: 'No microphone was found on this device. You can still tune by ear with the reference tones below.'
  };
  MSG.SecurityError = MSG.none;
  function tuner() {
    const save = () => store.write(K + 'tuner', ts);
    let an = null, src = null, stream = null, raf = 0, lastT = 0, hist = [], quiet = 0, pick = null, cur = null;
    const msg = h('p', { class: 'tm-msg', role: 'status', hidden: true });
    const noteEl = h('div', { class: 'tm-note' }, '\u2013'), sarEl = h('div', { class: 'tm-sar' }), hzEl = h('div', { class: 'tm-hz' }, 'Tap Start listening, then play one note');
    const hint = h('p', { class: 'tm-hint' });
    const needle = S('line', { x1: 150, y1: 150, x2: 150, y2: 30, 'stroke-width': 5, 'stroke-linecap': 'round', class: 'tm-needle' });
    const meter = S('svg', { viewBox: '0 0 300 170', class: 'tm-meter', role: 'img', 'aria-label': 'Tuning needle' });
    const pt = (c, r) => { const a = (c * 1.2 - 90) * Math.PI / 180; return [150 + r * Math.cos(a), 150 + r * Math.sin(a)]; };
    const arc = (c0, c1, r) => { const [x0, y0] = pt(c0, r), [x1, y1] = pt(c1, r); return 'M' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + x1.toFixed(1) + ' ' + y1.toFixed(1); };
    meter.append(S('path', { d: arc(-50, 50, 120), fill: 'none', stroke: 'currentColor', 'stroke-opacity': 0.2, 'stroke-width': 14 }), S('path', { d: arc(-5, 5, 120), fill: 'none', stroke: '#3ecf6e', 'stroke-width': 14 }));
    [-50, -25, 0, 25, 50].forEach(c => { const [x, y] = pt(c, 98); const t = S('text', { x: x.toFixed(1), y: (y + 4).toFixed(1), 'text-anchor': 'middle', 'font-size': 13, fill: 'currentColor' }); t.textContent = (c > 0 ? '+' : '') + c; meter.append(t); });
    [['too low', 40], ['too high', 260]].forEach(([l, x]) => { const t = S('text', { x, y: 166, 'text-anchor': 'middle', 'font-size': 13, fill: 'currentColor', 'fill-opacity': 0.7 }); t.textContent = l; meter.append(t); });
    meter.append(needle, S('circle', { cx: 150, cy: 150, r: 8, fill: 'currentColor' }));
    const listenBtn = h('button', { type: 'button', class: 'lrn-qc tm-go tm-listen', onclick: () => (an ? stopListen() : startMic()) }, '\u{1F3A4} Start listening');
    const strRow = h('div', { class: 'tm-strings', role: 'group', 'aria-label': 'Guitar strings' });
    const refBtn = h('button', { type: 'button', class: 'lrn-qc tm-ref', onclick: () => tone(refFreq()) });
    const refFreq = () => ts.mode === 'guitar' ? (pick || (cur ? TM.closestString(cur).s : TM.strings[1])).f : (cur ? TM.note(cur).target : 440);
    function paintRef() {
      const f = refFreq(), n = TM.note(f);
      refBtn.textContent = '\u{1F50A} Play ' + n.name + n.oct + (ts.sargam ? ' (' + n.sargam + ')' : '');
      strRow.hidden = ts.mode !== 'guitar';
      const near = cur ? TM.closestString(cur).s : null;
      strRow.querySelectorAll('button').forEach(b => { b.classList.toggle('near', !!near && +b.dataset.s === near.i); b.setAttribute('aria-pressed', String(!!pick && pick.i === +b.dataset.s)); });
    }
    strRow.append(...TM.strings.map(s => h('button', { type: 'button', class: 'lrn-qc', 'data-s': s.i, title: 'String ' + s.n + ' \u2013 tap to hear it', onclick: () => { pick = pick === s ? null : s; if (pick) tone(s.f); paintRef(); } }, h('b', null, s.label), h('small', null, 'string ' + s.n))));
    const opt = (k, v, l) => h('button', { type: 'button', class: 'lrn-qc', 'data-mode': v, 'aria-pressed': String(ts[k] === v), onclick: () => { ts[k] = v; save(); pick = null; tuner(); } }, l);
    function show(f) {
      cur = f;
      const n = TM.note(f), gs = TM.closestString(f), g = ts.mode === 'guitar', c = g ? (pick ? Math.round((TM.midiOf(f) - pick.midi) * 1000) / 10 : gs.cents) : n.cents, s = pick || gs.s;
      const shown = g && Math.abs(c) <= 50 ? s.label : n.name + n.oct;
      noteEl.textContent = shown; sarEl.textContent = ts.sargam ? TM.note(g ? s.f : f).sargam : '';
      hzEl.textContent = f.toFixed(1) + ' Hz  \u00B7  ' + (c > 0 ? '+' : '') + c.toFixed(0) + ' cents';
      const cc = Math.max(-50, Math.min(50, c)), [x, y] = pt(cc, 112), ok = Math.abs(c) <= 5;
      needle.setAttribute('x2', x.toFixed(1)); needle.setAttribute('y2', y.toFixed(1)); meter.classList.toggle('ok', ok);
      hint.className = 'tm-hint' + (ok ? ' ok' : '');
      hint.textContent = g
        ? (Math.abs(c) > 50 ? 'That is far from string ' + s.n + ' (' + s.label + '). ' + (c < 0 ? 'Tighten' : 'Loosen') + ' it a lot, or check you are playing the right string.'
          : ok ? '\u2714 String ' + s.n + ' (' + s.label + ') is in tune!' : 'String ' + s.n + ' (' + s.label + ') is too ' + (c < 0 ? 'low \u2013 tighten the string a little (turn the peg to raise the pitch).' : 'high \u2013 loosen the string a little (turn the peg to lower the pitch).'))
        : (ok ? '\u2714 In tune: that is ' + n.name + n.oct + '.' : 'A little too ' + (c < 0 ? 'low (flat) \u2013 go slightly higher.' : 'high (sharp) \u2013 go slightly lower.'));
      TM.last = { f, note: n.name + n.oct, cents: c, string: s.label, ok };
      paintRef();
    }
    function connect(node) {
      const c = getCtx(); an = c.createAnalyser(); an.fftSize = 4096; node.connect(an); src = node; hist = []; quiet = 0;
      const buf = new Float32Array(an.fftSize);
      listenBtn.textContent = '\u25A0 Stop listening'; listenBtn.setAttribute('aria-pressed', 'true');
      const loop = t => {
        raf = requestAnimationFrame(loop); if (t - lastT < 66) return; lastT = t;
        an.getFloatTimeDomainData(buf);
        const f = TM.detect(buf, c.sampleRate);
        if (!f) { if (++quiet > 15) hzEl.textContent = 'Listening\u2026 play one note and let it ring'; return; }
        quiet = 0; hist.push(f); if (hist.length > 5) hist.shift();
        show(hist.slice().sort((a, b) => a - b)[hist.length >> 1]);
      };
      raf = requestAnimationFrame(loop);
    }
    function stopListen() {
      cancelAnimationFrame(raf); raf = 0;
      try { src && src.disconnect(); src && src.stop && src.stop(); } catch (e) { /* already stopped */ }
      stream && stream.getTracks().forEach(t => t.stop()); stream = src = an = null;
      listenBtn.textContent = '\u{1F3A4} Start listening'; listenBtn.setAttribute('aria-pressed', 'false');
    }
    const fail = name => { msg.hidden = false; msg.textContent = MSG[name] || 'Could not start the microphone (' + (name || 'unknown error') + '). The reference tones below still work.'; TM.micError = name || 'unknown'; };
    async function startMic() {
      msg.hidden = true; const md = navigator.mediaDevices;
      if (!md || !md.getUserMedia || !getCtx()) return fail('none');
      try { stream = await md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
      catch (e) { return fail(e && e.name); }
      connect(getCtx().createMediaStreamSource(stream));
    }
    TM.feed = (f, type) => { stopListen(); const c = getCtx(), o = c.createOscillator(); o.type = type || 'sine'; o.frequency.value = f; o.start(); connect(o); return o; };   // test hook: oscillator instead of the mic
    main.replaceChildren(h('div', { class: 'tm-page' },
      h('h2', { class: 'lrn-h' }, '\u{1F3B8} Tuner'),
      help('A tuner tells you if a note is too high (sharp) or too low (flat). Tap Start listening, allow the microphone, and play one string or sing one note at a time.'),
      h('div', { class: 'tm-row' }, opt('mode', 'guitar', '\u{1F3B8} Guitar'), opt('mode', 'notes', '\u{1F3B5} Any note'),
        h('label', { class: 'tm-chk' }, h('input', { type: 'checkbox', checked: ts.sargam || null, onchange: e => { ts.sargam = e.target.checked; save(); cur ? show(cur) : paintRef(); } }), ' Show sargam (Sa = C)')),
      h('div', { class: 'tm-row' }, listenBtn, refBtn), msg,
      h('div', { class: 'tm-tuner' }, h('div', { class: 'tm-readout' }, noteEl, sarEl, hzEl), meter), hint, strRow,
      help('When the needle sits in the middle and turns green you are in tune. A cent is a tiny step: 100 cents make one semitone (the gap between two piano keys).'),
      ts.mode === 'guitar' ? help('Standard guitar tuning, thickest string to thinnest: E A D G B E. Tap a string to hear its note and tune just that one.') : null));
    paintRef();
    stopper = stopListen;
  }
  go(MODES[location.hash.slice(1)] ? location.hash.slice(1) : (MODES[store.read(K + 'screen')] ? store.read(K + 'screen') : 'metro'));
  addEventListener('hashchange', () => { const m = location.hash.slice(1); if (MODES[m] && store.read(K + 'screen') !== m) go(m); });
  TM.metro = met;
})();
