/*
 * Camera — slow motion (R3). Used by camera_logic.js.
 * Step 1: the camera runs at 60–120 fps and MediaRecorder records it as it is
 *         (no sound, at most CAMERA_CONFIG.slowmo.maxSeconds).
 * Step 2 (Processing…): that clip is played back muted at 1/factor speed
 *         (factor = camera fps / 30, e.g. 4× at 120 fps, 2× at 60 fps) and drawn
 *         onto a canvas, which is recorded again at 30 fps. Mirroring is applied
 *         here. Nothing is held in memory but the two recorded files.
 */
const CameraSlowmo = (() => {
  'use strict';
  const cfg = () => CAMERA_CONFIG.slowmo;

  /* Highest frame rate the camera offers (0 when unknown). */
  function maxFps(track) {
    try {
      const c = track && track.getCapabilities ? track.getCapabilities() : null;
      return (c && c.frameRate && c.frameRate.max) || 0;
    } catch (_) { return 0; }
  }
  const supported = (track) => maxFps(track) >= cfg().minFps;

  /* Constraint to add to the video request when slow motion is on. */
  const constraint = () => ({ ideal: cfg().idealFps, min: cfg().minFps });

  /* Slowdown factor from the frame rate the camera really gives. */
  function factor(track) {
    const st = track && track.getSettings ? track.getSettings() : {};
    const fps = st.frameRate || maxFps(track) || cfg().outFps;
    return Math.max(1, Math.round(fps / cfg().outFps));
  }

  /* Record the camera picture only. Returns { stop(), done: Promise<Blob> }. */
  function capture(stream, mime) {
    const s = new MediaStream(stream.getVideoTracks());
    const chunks = [];
    const rec = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: cfg().bitrate });
    const done = new Promise((res) => {
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => res(new Blob(chunks, { type: mime.split(';')[0] }));
    });
    rec.start(1000);
    return { stop: () => { if (rec.state !== 'inactive') rec.stop(); }, done };
  }

  /* Play `blob` at 1/k speed into a 30 fps canvas recording. onProgress(0..1). */
  function slowDown(blob, k, mirror, mime, onProgress) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true;
      const url = URL.createObjectURL(blob);
      v.src = url;
      const fail = (e) => { URL.revokeObjectURL(url); reject(e); };
      v.onerror = () => fail(new Error('decode'));
      v.onloadedmetadata = () => {
        const c = document.createElement('canvas');
        c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
        const g = c.getContext('2d');
        if (mirror) { g.translate(c.width, 0); g.scale(-1, 1); }
        const out = c.captureStream(cfg().outFps);
        const chunks = [];
        const rec = new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: cfg().bitrate });
        rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = () => { URL.revokeObjectURL(url); resolve(new Blob(chunks, { type: mime.split(';')[0] })); };
        let live = true;
        const draw = () => {
          if (!live) return;
          g.drawImage(v, 0, 0, c.width, c.height);
          if (onProgress && isFinite(v.duration) && v.duration) onProgress(v.currentTime / v.duration);
          if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(draw); else requestAnimationFrame(draw);
        };
        v.onended = () => { live = false; g.drawImage(v, 0, 0, c.width, c.height); setTimeout(() => rec.stop(), 100); };
        v.playbackRate = 1 / k;
        rec.start(1000);
        v.play().then(draw, fail);
      };
    });
  }

  return { maxFps, supported, constraint, factor, capture, slowDown };
})();
