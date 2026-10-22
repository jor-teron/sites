/* Sound Recorder — Recorder screen: Record / Pause / Stop, live scrolling waveform, level meter, timer, mic picker.
   Peaks come from an AudioWorklet while recording (no decoding later); audio from MediaRecorder. */
(() => {
  'use strict';
  const { $, P, toast } = SR, PPS = SRAudio.PPS, LIVE_S = 8;
  const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  let stream = null, mr = null, chunks = [], ctx = null, node = null, peaks = [], t0 = 0, acc = 0, paused = false, busy = false, level = 0, raf = 0;
  const state = () => (mr ? (paused ? 'paused' : 'rec') : 'idle');
  const elapsed = () => acc + (mr && !paused ? (performance.now() - t0) / 1000 : 0);
  const pickMime = () => (window.MediaRecorder && MediaRecorder.isTypeSupported ? MIMES.find((m) => MediaRecorder.isTypeSupported(m)) || '' : '');

  async function listMics() {
    try {
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId);
      const sel = $('mic');
      sel.innerHTML = all.map((d, i) => '<option value="' + SR.esc(d.deviceId) + '">' + SR.esc(d.label || 'Microphone ' + (i + 1)) + '</option>').join('');
      if (P.mic && all.some((d) => d.deviceId === P.mic)) sel.value = P.mic;
      $('mic-row').hidden = all.length < 2;
    } catch (_) { $('mic-row').hidden = true; }
  }

  async function start() {
    if (busy || mr) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast('Recording is not supported in this browser'); return; }
    busy = true;
    try {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: P.mic ? { deviceId: { exact: P.mic } } : true }); }
      catch (e) { if (!P.mic) throw e; stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    } catch (_) { busy = false; toast('Microphone not allowed'); return; }
    try {
      ctx = new AudioContext();
      await ctx.audioWorklet.addModule(SRAudio.workletURL());
      node = new AudioWorkletNode(ctx, 'sr-peaks', { numberOfInputs: 1, numberOfOutputs: 0, processorOptions: { bin: Math.round(ctx.sampleRate / PPS) } });
      peaks = [];
      node.port.onmessage = (e) => { if (paused || !mr) return; for (const v of e.data) { peaks.push(v); if (v > level) level = v; } };
      ctx.createMediaStreamSource(stream).connect(node);
      if (ctx.state === 'suspended') await ctx.resume();
      const mime = pickMime();
      mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      chunks = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = finish;
      mr.start(1000);
      t0 = performance.now(); acc = 0; paused = false;
      listMics();
    } catch (e) { cleanup(); toast('Could not start recording'); }
    busy = false; ui();
  }
  function pause() {
    if (!mr) return;
    if (!paused) { acc = elapsed(); paused = true; mr.pause(); } else { paused = false; t0 = performance.now(); mr.resume(); }
    ui();
  }
  let finalDur = 0;
  function stop() { if (!mr) return; finalDur = elapsed(); acc = finalDur; paused = true; mr.stop(); }
  async function finish() {
    const type = (mr && mr.mimeType) || pickMime() || 'audio/webm';
    const blob = new Blob(chunks, { type }), pk = Float32Array.from(peaks), dur = finalDur;
    cleanup();
    if (!blob.size) { toast('Nothing recorded'); return; }
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const rec = { id: 'r' + d.getTime().toString(36) + Math.random().toString(36).slice(2, 6), name: 'Recording ' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()),
      date: d.getTime(), dur, mime: type, size: blob.size, blob, peaks: pk, pps: PPS };
    try { await SRStore.put(rec); toast('Saved · ' + SR.fmt(dur)); SR.emit('changed', { added: rec.id }); }
    catch (_) { toast('Could not save (storage full?)'); }
  }
  function cleanup() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (ctx) ctx.close().catch(() => {});
    stream = null; ctx = null; node = null; mr = null; paused = false; acc = 0; level = 0;
    ui();
  }
  function ui() {
    const s = state();
    document.body.classList.toggle('recording', s === 'rec');
    $('r-state').textContent = s === 'rec' ? '● Recording' : s === 'paused' ? 'Paused' : 'Ready';
    $('r-rec').setAttribute('aria-label', s === 'idle' ? 'Record' : 'Recording');
    $('r-pause').disabled = s === 'idle'; $('r-stop').disabled = s === 'idle';
    $('r-pause').innerHTML = s === 'paused' ? '&#9679;' : '&#10074;&#10074;';
    $('r-pause').setAttribute('aria-label', s === 'paused' ? 'Resume' : 'Pause');
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function loop() {
    const T = elapsed();
    $('r-time').textContent = SR.fmt(T, true);
    if (SR.S.mode === 'rec') {
      const end = Math.max(LIVE_S, peaks.length / PPS);
      SRWave.draw($('r-wave'), peaks, PPS, end - LIVE_S, end, { playhead: mr ? peaks.length / PPS : null });
      const db = SRAudio.db(level);
      $('meter-bar').style.width = Math.max(0, Math.min(100, (db + 60) / 60 * 100)) + '%';
    }
    level *= 0.85;
    if (mr) raf = requestAnimationFrame(loop);
  }

  SR.on('init', () => {
    $('r-rec').onclick = () => { if (!mr) start(); else if (paused) pause(); };
    $('r-pause').onclick = pause;
    $('r-stop').onclick = stop;
    $('mic').onchange = () => { P.mic = $('mic').value; SR.saveP(); toast('Used for the next recording'); };
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', listMics);
    listMics(); ui();
  });
  SR.on('mode', () => ui());
  SR.on('settings', () => ui());
  SR.on('key', (e) => {
    if (SR.S.mode !== 'rec') return;
    const k = e.key.toLowerCase();
    if (k === 'r' || k === ' ') { e.preventDefault(); if (!mr) start(); else pause(); }
    else if (k === 'p') pause();
    else if (k === 's') stop();
  });
  addEventListener('beforeunload', (e) => { if (mr) { e.preventDefault(); e.returnValue = ''; } });
  SR.recorder = { state, elapsed };
})();
