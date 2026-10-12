/*
  Project: print
  File: print_scan.js
  Role: In-page QR scanner for the sender join screen (print-send.html).
  Opens the rear camera into a <video>, reads frames into a small canvas
  and decodes them with the browser BarcodeDetector when it exists, else
  the vendored jsQR (vendor/jsQR.js). Text is turned into a 4-digit code
  with parseCode(); on a hit the camera stops and onCode(code) runs.
  Camera blocked, missing or plain http shows a message; the code box still works.
  API: PrintScan.start(video, msg, onCode), PrintScan.stop(), PrintScan.running().
*/

/* Time between decode attempts (ms). */
const SCAN_EVERY_MS = 180;

/* Frames are scaled down to this width before decoding. */
const SCAN_WIDTH = 640;

const PrintScan = (function () {
  let video = null;
  let msg = null;
  let onCode = null;
  let stream = null;
  let timer = 0;
  let on = false;
  let detector = null;
  let lastBad = 0;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  /* Message line under the video. */
  function say(text, bad) {
    if (!msg) {
      return;
    }
    msg.textContent = text;
    msg.classList.toggle('bad', !!bad);
  }

  /* Stop all camera tracks. */
  function stopTracks() {
    if (!stream) {
      return;
    }
    stream.getTracks().forEach(function (track) {
      try {
        track.stop();
      } catch (err) {
        /* Already stopped. */
      }
    });
    stream = null;
  }

  /* Stop scanning and release the camera. Safe to call any time. */
  function stop() {
    on = false;
    clearTimeout(timer);
    stopTracks();
    if (video) {
      try {
        video.pause();
      } catch (err) {
        /* Not playing. */
      }
      video.srcObject = null;
    }
  }

  /* Decode the current frame. Detector first, then jsQR on a miss. Returns the text or null. */
  async function decodeFrame(w, h) {
    if ('BarcodeDetector' in window) {
      try {
        detector = detector || new window.BarcodeDetector({ formats: ['qr_code'] });
        const found = await detector.detect(canvas);
        if (found && found[0]) {
          return found[0].rawValue;
        }
      } catch (err) {
        /* Detector unsupported for qr_code on this device. Fall back to jsQR. */
        detector = null;
      }
    }
    if (typeof jsQR === 'function') {
      const img = ctx.getImageData(0, 0, w, h);
      const hit = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
      return hit ? hit.data : null;
    }
    return null;
  }

  /* One scan tick. Schedules the next one unless a code was found. */
  async function frame() {
    if (!on) {
      return;
    }
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (video.readyState >= 2 && vw && vh) {
      const w = Math.min(SCAN_WIDTH, vw);
      const h = Math.round((vh * w) / vw);
      if (canvas.width !== w) {
        canvas.width = w;
      }
      if (canvas.height !== h) {
        canvas.height = h;
      }
      ctx.drawImage(video, 0, 0, w, h);
      const text = await decodeFrame(w, h);
      if (!on) {
        return;
      }
      if (text != null) {
        const code = parseCode(text);
        if (code) {
          say('Found ' + code + ', connecting…');
          if (navigator.vibrate) {
            try {
              navigator.vibrate(20);
            } catch (err) {
              /* No vibration. */
            }
          }
          const done = onCode;
          stop();
          if (done) {
            done(code);
          }
          return;
        }
        if (Date.now() - lastBad > 2500) {
          lastBad = Date.now();
          say('Not a print station QR', true);
        }
      }
    }
    timer = setTimeout(frame, SCAN_EVERY_MS);
  }

  /* Open the rear camera and start scanning. */
  async function start(videoEl, msgEl, codeCallback) {
    stop();
    video = videoEl;
    msg = msgEl;
    onCode = codeCallback;
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      say('Camera needs https. Type the code instead.', true);
      return false;
    }
    on = true;
    say('Starting camera…');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 960 } },
        audio: false
      });
      if (!on) {
        s.getTracks().forEach(function (track) {
          track.stop();
        });
        return false;
      }
      stream = s;
      video.srcObject = s;
      try {
        await video.play();
      } catch (err) {
        /* autoplay attribute covers it. */
      }
      say('Point at the QR on the print station');
      timer = setTimeout(frame, SCAN_EVERY_MS);
      return true;
    } catch (err) {
      on = false;
      const name = err && err.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        say('Camera blocked. Allow it, or type the code.', true);
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        say('No camera found. Type the code.', true);
      } else {
        say('Camera unavailable. Type the code.', true);
      }
      return false;
    }
  }

  return {
    start: start,
    stop: stop,
    running: function () {
      return on;
    }
  };
})();
