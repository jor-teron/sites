/*
  Project: sites (shared)
  File: shared/link/link_scan.js
  Role: SharedLinkScan (release 4). One "join the Hub" dialog: 4-digit code entry
  + Scan QR (BarcodeDetector when available, else window.jsQR from the app's own
  vendor/jsQR.js). ask({title}) → Promise<code | null>. parse(text) pulls the code
  out of a Hub QR url (#code=1234, ?hub=1234, code=…) or a bare code.
  Big tap targets; Esc / Cancel closes; camera stops on close.
*/
(function () {
  'use strict';

  function parse(text) {
    text = String(text || '').trim();
    var m = text.match(/[#?&](?:code|hub|c|pin)=([A-Za-z0-9]{4,6})\b/) || text.match(/^([A-Za-z0-9]{4,6})$/);
    return m ? m[1].toUpperCase() : '';
  }

  var BTN = 'min-height:48px;padding:0 16px;font-size:16px;border:0;border-radius:12px;cursor:pointer;';

  function ask(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var stream = null, raf = 0, detector = null, done = false;
      var box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:12px';
      var card = document.createElement('div');
      card.style.cssText = 'background:#16202e;color:#eef;padding:16px;border-radius:16px;display:grid;gap:10px;width:min(360px,100%);font:16px system-ui,sans-serif';
      var h = document.createElement('b'); h.textContent = opts.title || 'Join the Hub';
      var hint = document.createElement('small'); hint.textContent = 'Type the 4-digit code under the Hub QR, or scan it.';
      var input = document.createElement('input');
      input.inputMode = 'numeric'; input.maxLength = 6; input.placeholder = '1234'; input.autocomplete = 'off';
      input.style.cssText = 'min-height:52px;font-size:28px;text-align:center;letter-spacing:.3em;border-radius:12px;border:2px solid #2b7cff;background:#0f1419;color:#fff';
      var video = document.createElement('video');
      video.playsInline = true; video.muted = true; video.hidden = true;
      video.style.cssText = 'width:100%;border-radius:12px;background:#000';
      var msg = document.createElement('small');
      var row = document.createElement('div'); row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px';
      var join = document.createElement('button'); join.type = 'button'; join.textContent = 'Join'; join.style.cssText = BTN + 'background:#2b7cff;color:#fff';
      var scan = document.createElement('button'); scan.type = 'button'; scan.textContent = '📷 Scan QR'; scan.style.cssText = BTN + 'background:#ffb22e;color:#3a2200';
      var cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.style.cssText = BTN + 'background:#243044;color:#dde';
      row.append(join, scan);
      card.append(h, hint, input, video, msg, row, cancel);
      box.append(card);
      document.body.append(box);
      setTimeout(function () { input.focus(); }, 50);

      function close(code) {
        if (done) return; done = true;
        cancelAnimationFrame(raf);
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        document.removeEventListener('keydown', onKey, true);
        box.remove();
        resolve(code || null);
      }
      function onKey(e) { if (e.key === 'Escape') close(null); else if (e.key === 'Enter' && document.activeElement === input) submit(); }
      function submit() { var c = parse(input.value); if (c) close(c); else msg.textContent = 'Enter the 4-digit code.'; }
      document.addEventListener('keydown', onKey, true);
      join.addEventListener('click', submit);
      cancel.addEventListener('click', function () { close(null); });
      box.addEventListener('click', function (e) { if (e.target === box) close(null); });

      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      function tick() {
        if (done) return;
        if (video.readyState >= 2) {
          if (detector) {
            detector.detect(video).then(function (r) { var c = r && r[0] && parse(r[0].rawValue); if (c) close(c); }).catch(function () {});
          } else if (window.jsQR) {
            var w = canvas.width = Math.min(640, video.videoWidth), hh = canvas.height = Math.round(w * video.videoHeight / video.videoWidth);
            ctx.drawImage(video, 0, 0, w, hh);
            var q = window.jsQR(ctx.getImageData(0, 0, w, hh).data, w, hh);
            var c = q && parse(q.data); if (c) return close(c);
          }
        }
        raf = requestAnimationFrame(tick);
      }
      scan.addEventListener('click', function () {
        if (stream) return;
        try { if ('BarcodeDetector' in window) detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (_) { detector = null; }
        if (!detector && !window.jsQR) { msg.textContent = 'No QR reader here — type the code.'; return; }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = 'Camera needs https.'; return; }
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (s) {
          if (done) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
          stream = s; video.srcObject = s; video.hidden = false; video.play(); msg.textContent = 'Point at the Hub QR…'; tick();
        }).catch(function () { msg.textContent = 'Camera blocked — type the code.'; });
      });
    });
  }

  window.SharedLinkScan = { ask: ask, parse: parse };
})();
