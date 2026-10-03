/*
 * File Drop — filedrop_scan.js
 * Live camera on the pair screen, looking for a File Drop QR (BarcodeDetector when the browser
 * has it, else vendored jsQR — same approach as controller_logic.js). A found link is handed to
 * FD.pair.joinLink. Camera denied / missing / file:// → a message; the code box still works.
 */
(function (FD) {
  'use strict';
  const P = FD.proto;
  const C = () => FD.config;
  const SCAN = FD.scan = {};
  let failed = false, video = null, msg = null, canvas = null, ctx = null, stream = null, timer = 0, on = false, detector = null, lastBad = 0;

  function say(text, bad) { if (msg) { msg.textContent = text; msg.classList.toggle('bad', !!bad); msg.hidden = !text; } }
  function stopTracks() { if (stream) stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) { /* ignore */ } }); stream = null; }

  SCAN.init = (videoEl, msgEl) => { video = videoEl; msg = msgEl; canvas = document.createElement('canvas'); ctx = canvas.getContext('2d', { willReadFrequently: true }); };

  // force: retry after an earlier failure (tap on the camera box, page shown again)
  SCAN.start = async (force) => {
    if (on || !video || (failed && !force)) return;
    failed = false;
    if (!C().camera) { say('Camera scanning is off.'); return; }
    on = true;
    if (location.protocol === 'file:' || !window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      say('Camera needs https. Enter the code below instead.', true); on = false; failed = true; return;
    }
    say('Starting camera…');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 960 } }, audio: false });
      if (!on) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      video.srcObject = s;
      try { await video.play(); } catch (_) { /* autoplay attribute covers it */ }
      say('Point at the other device\u2019s QR');
      clearTimeout(timer);
      timer = setTimeout(frame, C().scanEveryMs);
    } catch (err) {
      on = false; failed = true;
      const n = err && err.name;
      if (n === 'NotAllowedError' || n === 'SecurityError') say('Camera blocked. Allow it, or enter the code below.', true);
      else if (n === 'NotFoundError' || n === 'OverconstrainedError') say('No camera found. Enter the code below.', true);
      else say('Camera unavailable. Enter the code below.', true);
    }
  };

  SCAN.stop = () => {
    on = false;
    clearTimeout(timer);
    stopTracks();
    if (video) { try { video.pause(); } catch (_) { /* ignore */ } video.srcObject = null; }
  };
  SCAN.running = () => on;

  async function frame() {
    if (!on) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (video.readyState >= 2 && vw && vh && document.visibilityState === 'visible') {
      const w = Math.min(C().scanWidth, vw), h = Math.round(vh * w / vw);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      let text = null;
      if ('BarcodeDetector' in window) {
        try {
          detector = detector || new window.BarcodeDetector({ formats: ['qr_code'] });
          const found = await detector.detect(canvas);
          if (found && found[0]) text = found[0].rawValue;
        } catch (_) { detector = null; }
      }
      if (text == null && typeof jsQR === 'function') {
        const img = ctx.getImageData(0, 0, w, h);
        const r = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (r) text = r.data;
      }
      if (!on) return;
      if (text != null) {
        const target = P.parseLink(text, C());
        if (target && target.id !== (FD.pair.me() || {}).id) {
          say('Found — connecting…');
          if (navigator.vibrate && C().vibrate) { try { navigator.vibrate(20); } catch (_) { /* ignore */ } }
          SCAN.stop();
          FD.pair.joinLink(target);
          return;
        }
        if (Date.now() - lastBad > 2500) { lastBad = Date.now(); say(target ? 'That is this device\u2019s own QR.' : 'Not a File Drop QR', true); }
      }
    }
    timer = setTimeout(frame, C().scanEveryMs);
  }
})(window.FD);
