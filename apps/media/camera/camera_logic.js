/*
 * Camera — logic. Reads CAMERA_CONFIG, saves through CameraSave.save(blob, name).
 * Preview: getUserMedia stream in <video>. Photo: one frame drawn to a canvas
 * (mirrored when Mirror is on) and encoded JPG / PNG. Video: MediaRecorder with
 * sound; when Mirror is on the picture goes through a mirrored canvas stream so
 * the saved file matches the preview. Tracks stop when the page is hidden.
 */
(() => {
  'use strict';
  const C = CAMERA_CONFIG;
  const $ = (id) => document.getElementById(id);
  const el = {
    video: $('preview'), grid: $('grid'), countdown: $('countdown'), flash: $('flash'),
    recBadge: $('rec-badge'), recTime: $('rec-time'), message: $('message'), messageText: $('message-text'),
    retry: $('retry-btn'), toast: $('toast'), shutter: $('shutter'), mode: $('mode-btn'), pause: $('pause-btn'),
    flip: $('flip-btn'), thumb: $('thumb'), thumbImg: $('thumb-img'), settingsBtn: $('settings-btn'),
    settings: $('settings'), device: $('device-select'), resSeg: $('res-seg'), formatSeg: $('format-seg'),
    timerSeg: $('timer-seg'), gridCheck: $('grid-check'), mirrorCheck: $('mirror-check'), info: $('info'),
  };

  // ---------------------------------------------------------------- settings
  const S = Object.assign({}, C.defaults);
  try { Object.assign(S, JSON.parse(localStorage.getItem(C.storageKey) || '{}')); } catch (_) { /* ignore */ }
  if (!C.resolutions[S.resolution]) S.resolution = C.defaults.resolution;
  if (!C.photoFormats[S.format]) S.format = C.defaults.format;
  if (C.timers.indexOf(+S.timer) < 0) S.timer = 0;
  function persist() { try { localStorage.setItem(C.storageKey, JSON.stringify(S)); } catch (_) { /* ignore */ } }

  // ---------------------------------------------------------------- state
  let stream = null;
  let starting = null;
  let facingNow = S.facing;      // what the open camera reports
  let recorder = null;
  let recChunks = [];
  let recType = null;
  let recStart = 0, recPausedAt = 0, recPausedTotal = 0, recTimer = 0;
  let mirrorCanvasLoop = 0;
  let countdownTimer = 0;
  let lastUrl = '';
  let toastTimer = 0;

  const mirrored = () => (S.mirror == null ? facingNow === 'user' : !!S.mirror);

  function toast(text) {
    el.toast.textContent = text;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), C.toastMs);
  }

  function showMessage(text) {
    el.messageText.textContent = text;
    el.message.hidden = false;
    el.shutter.disabled = true;
  }
  function hideMessage() { el.message.hidden = true; el.shutter.disabled = false; }

  // ---------------------------------------------------------------- camera
  function stopStream() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    el.video.srcObject = null;
  }

  function constraints(withAudio) {
    const r = C.resolutions[S.resolution];
    const video = { width: { ideal: r.width }, height: { ideal: r.height } };
    if (S.deviceId) video.deviceId = { exact: S.deviceId };
    else video.facingMode = { ideal: S.facing };
    return { video, audio: withAudio };
  }

  /* Open the camera (and the microphone in video mode). Falls back to picture only. */
  async function start() {
    if (starting) return starting;
    starting = (async () => {
      stopStream();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showMessage(C.text.unsupported); return; }
      el.messageText.textContent = C.text.starting;
      const wantAudio = S.mode === 'video';
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints(wantAudio));
        } catch (err) {
          if (S.deviceId && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
            S.deviceId = ''; persist();
            stream = await navigator.mediaDevices.getUserMedia(constraints(wantAudio));
          } else if (wantAudio && err.name !== 'NotAllowedError') {
            stream = await navigator.mediaDevices.getUserMedia(constraints(false));
            toast(C.text.noAudio);
          } else if (wantAudio && err.name === 'NotAllowedError') {
            // maybe only the microphone was refused
            stream = await navigator.mediaDevices.getUserMedia(constraints(false));
            toast(C.text.noAudio);
          } else throw err;
        }
      } catch (err) {
        stopStream();
        const n = err && err.name;
        showMessage(n === 'NotAllowedError' || n === 'SecurityError' ? C.text.denied
          : n === 'NotFoundError' || n === 'OverconstrainedError' ? C.text.noCamera
          : n === 'NotReadableError' ? C.text.busy : C.text.failed);
        return;
      }
      const track = stream.getVideoTracks()[0];
      const st = track && track.getSettings ? track.getSettings() : {};
      if (st.facingMode) facingNow = st.facingMode === 'environment' ? 'environment' : 'user';
      else facingNow = S.facing;
      el.video.srcObject = stream;
      try { await el.video.play(); } catch (_) { /* autoplay muted: fine */ }
      hideMessage();
      applyMirror();
      await fillDevices(st.deviceId);
      updateInfo();
    })();
    try { await starting; } finally { starting = null; }
  }

  async function fillDevices(currentId) {
    let list = [];
    try { list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); } catch (_) { /* ignore */ }
    el.device.textContent = '';
    list.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || ('Camera ' + (i + 1));
      el.device.appendChild(o);
    });
    if (currentId) el.device.value = currentId;
    el.flip.disabled = list.length < 2;
  }

  function updateInfo() {
    const v = el.video;
    const t = recordType();
    el.info.textContent = (v.videoWidth ? v.videoWidth + ' × ' + v.videoHeight : '') +
      (t ? ' · video ' + t.ext.toUpperCase() : '');
    layoutGrid();
  }

  // ---------------------------------------------------------------- view
  function applyMirror() {
    el.video.classList.toggle('mirrored', mirrored());
    el.mirrorCheck.checked = mirrored();
  }

  /* Put the grid exactly over the visible picture (object-fit: contain). */
  function layoutGrid() {
    el.grid.hidden = !S.grid;
    el.gridCheck.checked = !!S.grid;
    const v = el.video;
    const W = v.clientWidth, H = v.clientHeight;
    const vw = v.videoWidth || 16, vh = v.videoHeight || 9;
    const k = Math.min(W / vw, H / vh);
    const w = vw * k, h = vh * k;
    Object.assign(el.grid.style, { width: w + 'px', height: h + 'px', left: (W - w) / 2 + 'px', top: (H - h) / 2 + 'px' });
  }

  function seg(container, items, current, onPick) {
    container.textContent = '';
    items.forEach((it) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = it.label;
      b.dataset.value = String(it.value);
      b.classList.toggle('active', String(it.value) === String(current));
      b.addEventListener('click', () => {
        container.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        onPick(it.value);
      });
      container.appendChild(b);
    });
  }

  function buildSettings() {
    seg(el.resSeg, C.resolutionOrder.map((k) => ({ value: k, label: C.resolutions[k].label })), S.resolution, (v) => {
      S.resolution = v; persist(); if (!recorder) start();
    });
    seg(el.formatSeg, Object.keys(C.photoFormats).map((k) => ({ value: k, label: C.photoFormats[k].label })), S.format, (v) => {
      S.format = v; persist();
    });
    seg(el.timerSeg, C.timers.map((t) => ({ value: t, label: t ? t + 's' : 'Off' })), S.timer, (v) => {
      S.timer = +v; persist();
    });
  }

  function setMode(mode) {
    if (recorder) return;
    S.mode = mode; persist();
    document.body.classList.toggle('mode-video', mode === 'video');
    el.shutter.title = mode === 'video' ? 'Start / stop recording (Space)' : 'Take photo (Space)';
    el.shutter.setAttribute('aria-label', mode === 'video' ? 'Start recording' : 'Take photo');
    el.mode.setAttribute('aria-label', mode === 'video' ? 'Switch to photo' : 'Switch to video');
    // the microphone is only opened in video mode
    const hasAudio = stream && stream.getAudioTracks().length > 0;
    if (stream && (mode === 'video') !== hasAudio) start();
  }

  function setThumb(blob, isVideo) {
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    el.thumb.disabled = false;
    el.thumb.dataset.url = lastUrl;
    if (!isVideo) { el.thumbImg.src = lastUrl; return; }
    // video: a frame of the live preview stands in as the picture
    const c = frameCanvas(160);
    if (c) el.thumbImg.src = c.toDataURL('image/jpeg', 0.7);
  }

  /* Current frame on a canvas (mirrored when Mirror is on). maxSide limits the size. */
  function frameCanvas(maxSide) {
    const v = el.video;
    if (!v.videoWidth) return null;
    const k = maxSide ? Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight)) : 1;
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * k);
    c.height = Math.round(v.videoHeight * k);
    const g = c.getContext('2d');
    if (mirrored()) { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(v, 0, 0, c.width, c.height);
    return c;
  }

  // ---------------------------------------------------------------- photo
  function takePhoto() {
    const c = frameCanvas(0);
    if (!c) return;
    const f = C.photoFormats[S.format];
    el.flash.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => el.flash.classList.remove('on')));
    c.toBlob((blob) => {
      if (!blob) { toast(C.text.failed); return; }
      const name = CameraSave.fileName(C.filePrefix.photo, f.ext);
      setThumb(blob, false);
      CameraSave.save(blob, name).then((n) => toast(C.text.saved + n));
    }, f.mime, f.quality);
  }

  /* Run fn now, or after the self-timer countdown. Pressing again cancels. */
  function withTimer(fn) {
    if (countdownTimer) { cancelCountdown(); return; }
    if (!S.timer) { fn(); return; }
    let left = S.timer;
    el.countdown.textContent = String(left);
    el.countdown.hidden = false;
    countdownTimer = setInterval(() => {
      left -= 1;
      if (left > 0) { el.countdown.textContent = String(left); return; }
      cancelCountdown();
      fn();
    }, 1000);
  }
  function cancelCountdown() {
    clearInterval(countdownTimer);
    countdownTimer = 0;
    el.countdown.hidden = true;
  }

  // ---------------------------------------------------------------- video
  function recordType() {
    if (typeof MediaRecorder === 'undefined') return null;
    for (const t of C.videoTypes) if (MediaRecorder.isTypeSupported(t.mime)) return t;
    return null;
  }

  /* The stream to record: mirrored canvas picture + original sound when Mirror is on. */
  function recordStream() {
    if (!mirrored()) return stream;
    const v = el.video;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext('2d');
    g.translate(c.width, 0); g.scale(-1, 1);
    const draw = () => { g.drawImage(v, 0, 0, c.width, c.height); mirrorCanvasLoop = requestAnimationFrame(draw); };
    draw();
    const s = c.captureStream(30);
    stream.getAudioTracks().forEach((t) => s.addTrack(t));
    return s;
  }

  function startRecording() {
    recType = recordType();
    if (!recType || !stream) { toast(C.text.noRecorder); return; }
    recChunks = [];
    try {
      recorder = new MediaRecorder(recordStream(), { mimeType: recType.mime });
    } catch (_) {
      recorder = null; cancelAnimationFrame(mirrorCanvasLoop); toast(C.text.noRecorder); return;
    }
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
    recorder.onstop = finishRecording;
    recorder.start(C.recorderSliceMs);
    recStart = performance.now(); recPausedTotal = 0; recPausedAt = 0;
    document.body.classList.add('recording');
    document.body.classList.remove('paused');
    el.recBadge.hidden = false; el.recBadge.classList.remove('paused');
    el.pause.hidden = false;
    el.mode.disabled = el.flip.disabled = true;
    el.shutter.setAttribute('aria-label', 'Stop recording');
    tick();
    recTimer = setInterval(tick, 250);
  }

  function elapsedMs() {
    const now = recPausedAt || performance.now();
    return now - recStart - recPausedTotal;
  }
  function tick() {
    const s = Math.floor(elapsedMs() / 1000);
    el.recTime.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function togglePause() {
    if (!recorder) return;
    if (recorder.state === 'recording') {
      recorder.pause(); recPausedAt = performance.now();
      document.body.classList.add('paused'); el.recBadge.classList.add('paused');
      el.pause.setAttribute('aria-label', 'Resume recording');
    } else if (recorder.state === 'paused') {
      recorder.resume(); recPausedTotal += performance.now() - recPausedAt; recPausedAt = 0;
      document.body.classList.remove('paused'); el.recBadge.classList.remove('paused');
      el.pause.setAttribute('aria-label', 'Pause recording');
    }
    tick();
  }

  function stopRecording() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  function finishRecording() {
    clearInterval(recTimer);
    cancelAnimationFrame(mirrorCanvasLoop);
    const type = recType;
    const blob = new Blob(recChunks, { type: type.mime.split(';')[0] });
    recorder = null; recChunks = [];
    document.body.classList.remove('recording', 'paused');
    el.recBadge.hidden = true; el.pause.hidden = true;
    el.mode.disabled = false;
    fillDevices(el.device.value);
    el.shutter.setAttribute('aria-label', 'Start recording');
    if (!blob.size) return;
    setThumb(blob, true);
    CameraSave.save(blob, CameraSave.fileName(C.filePrefix.video, type.ext)).then((n) => toast(C.text.saved + n));
  }

  // ---------------------------------------------------------------- actions
  function shutter() {
    if (el.shutter.disabled) return;
    if (S.mode === 'photo') { withTimer(takePhoto); return; }
    if (recorder) { stopRecording(); return; }
    withTimer(startRecording);
  }

  function flip() {
    if (recorder) return;
    S.facing = facingNow === 'user' ? 'environment' : 'user';
    // with a named camera picked, flip moves to the next one in the list
    const opts = Array.from(el.device.options).map((o) => o.value);
    if (opts.length > 1) {
      const i = opts.indexOf(el.device.value);
      S.deviceId = opts[(i + 1) % opts.length];
    } else S.deviceId = '';
    S.mirror = null;   // back to automatic for the new camera
    persist();
    start();
  }

  function toggleSettings(show) {
    const open = typeof show === 'boolean' ? show : el.settings.hidden;
    el.settings.hidden = !open;
    el.settingsBtn.classList.toggle('active', open);
    el.settingsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  // ---------------------------------------------------------------- wiring
  el.shutter.addEventListener('click', shutter);
  el.mode.addEventListener('click', () => setMode(S.mode === 'video' ? 'photo' : 'video'));
  el.pause.addEventListener('click', togglePause);
  el.flip.addEventListener('click', flip);
  el.retry.addEventListener('click', start);
  el.settingsBtn.addEventListener('click', () => toggleSettings());
  el.thumb.addEventListener('click', () => { if (el.thumb.dataset.url) window.open(el.thumb.dataset.url, '_blank'); });
  el.device.addEventListener('change', () => { S.deviceId = el.device.value; S.mirror = null; persist(); if (!recorder) start(); });
  el.gridCheck.addEventListener('change', () => { S.grid = el.gridCheck.checked; persist(); layoutGrid(); });
  el.mirrorCheck.addEventListener('change', () => { S.mirror = el.mirrorCheck.checked; persist(); applyMirror(); });
  el.video.addEventListener('loadedmetadata', updateInfo);
  el.video.addEventListener('resize', updateInfo);
  window.addEventListener('resize', layoutGrid);
  document.addEventListener('pointerdown', (e) => {
    if (!el.settings.hidden && !el.settings.contains(e.target) && !el.settingsBtn.contains(e.target)) toggleSettings(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'SELECT' || tag === 'INPUT') { if (e.key === 'Escape') toggleSettings(false); return; }
    if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); shutter(); }
    else if (e.key === 'v' || e.key === 'V') setMode(S.mode === 'video' ? 'photo' : 'video');
    else if (e.key === 'p' || e.key === 'P') togglePause();
    else if (e.key === 'f' || e.key === 'F') flip();
    else if (e.key === 'g' || e.key === 'G') { S.grid = !S.grid; persist(); layoutGrid(); }
    else if (e.key === 'Escape') { cancelCountdown(); toggleSettings(false); }
  });

  /* Hidden tab: finish any recording, stop the camera. Visible again: reopen it. */
  function sleep() {
    cancelCountdown();
    if (recorder) stopRecording();
    stopStream();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sleep();
    else if (!stream && el.message.hidden) start();
  });
  window.addEventListener('pagehide', sleep);
  window.addEventListener('pageshow', (e) => { if (e.persisted && !stream) start(); });
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => fillDevices(el.device.value));
  }

  buildSettings();
  document.body.classList.toggle('mode-video', S.mode === 'video');
  setMode(S.mode);
  layoutGrid();
  start();
})();
