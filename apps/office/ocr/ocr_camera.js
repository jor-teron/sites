/*
 * OCR — ocr_camera.js
 * "Camera 📷": live camera overlay via getUserMedia (same on PC webcams and phones).
 * Capture freezes the frame → Use / Retake. Use hands the photo to the normal file path
 * (exactly like a dropped image → OCR starts). All tracks are stopped on close / Use.
 * Phones prefer the back camera; a switch button appears when there is more than one camera.
 * Without getUserMedia (old browser, plain-http LAN page) the old file input with
 * capture=environment is used instead. Keys in the overlay: Space capture, Enter use,
 * R / Backspace retake, Esc close. Settings: OCR.config.camera.
 */
(function (OCR) {
  'use strict';

  const CAM = OCR.camera = {};
  const cfg = () => OCR.config.camera;
  const T = () => OCR.config.camera.text;
  const $ = (id) => document.getElementById(id);

  let stream = null, devices = [], frozen = false, opening = 0;

  const coarse = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  CAM.isOpen = () => !$('cam').hidden;
  CAM.stream = () => stream;          // (tests)

  function msg(text) { const el = $('cam-msg'); el.textContent = text || ''; el.hidden = !text; }

  function stopTracks() {
    const s = stream;
    stream = null;
    if (s) for (const t of s.getTracks()) { try { t.stop(); } catch (_) { /* ignore */ } }
    const v = $('cam-video');
    try { v.pause(); } catch (_) { /* ignore */ }
    v.srcObject = null;
  }

  function showLive() {
    frozen = false;
    $('cam-video').hidden = false;
    $('cam-shot').hidden = true;
    $('cam-capture').hidden = false;
    $('cam-capture').disabled = !stream;
    $('cam-use').hidden = true;
    $('cam-retake').hidden = true;
  }

  function errorText(err) {
    const n = err && err.name;
    if (location.protocol === 'file:' && (n === 'NotAllowedError' || n === 'SecurityError' || n === 'NotSupportedError')) return T().insecure;
    if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError') return T().denied;
    if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') return T().none;
    if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return T().inUse;
    return T().failed + (n ? ' (' + n + ')' : '');
  }

  function constraints(deviceId) {
    const c = cfg();
    const v = { width: { ideal: c.idealWidth }, height: { ideal: c.idealHeight } };
    if (deviceId) v.deviceId = { exact: deviceId };
    else if (coarse()) v.facingMode = { ideal: c.phoneFacing };
    return { audio: false, video: v };
  }

  async function start(deviceId) {
    const my = ++opening;
    stopTracks();
    showLive();
    $('cam-capture').disabled = true;
    msg(T().starting);
    let s;
    try { s = await navigator.mediaDevices.getUserMedia(constraints(deviceId)); }
    catch (err) {
      if (my !== opening || !CAM.isOpen()) return;
      CAM.close();
      OCR.status(errorText(err), 'err');
      return;
    }
    if (my !== opening || !CAM.isOpen()) { for (const t of s.getTracks()) t.stop(); return; }
    stream = s;
    const v = $('cam-video');
    v.srcObject = s;
    try { await v.play(); } catch (_) { /* autoplay of a muted stream is allowed; ignore */ }
    msg('');
    showLive();
    const track = s.getVideoTracks()[0];
    if (track) track.addEventListener('ended', () => { if (stream === s) { CAM.close(); OCR.status(T().lost, 'err'); } });
    try {
      devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    } catch (_) { devices = []; }
    if (my === opening) $('cam-switch').hidden = devices.length < 2;
  }

  CAM.open = () => {
    const S = OCR.state;
    if (S.busy) { OCR.status(OCR.config.text.status.busy, 'err'); return; }
    if (CAM.isOpen()) return;
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) {
      // no live camera here: the photo picker / phone camera app instead
      if (!window.isSecureContext || location.protocol === 'file:') OCR.status(T().insecure, 'err');
      OCR.io.camera();
      return;
    }
    if (OCR.ui && OCR.ui.closeKey) OCR.ui.closeKey();
    if (OCR.send && OCR.send.isQrOpen && OCR.send.isQrOpen()) OCR.send.closeQr();
    $('cam').hidden = false;
    $('cam').focus({ preventScroll: true });   // Space / Enter must not press the toolbar button behind
    $('cam-switch').hidden = true;
    start('');
  };

  CAM.close = () => {
    opening++;
    stopTracks();
    $('cam').hidden = true;
    const c = $('cam-shot'); c.width = 0; c.height = 0;
    frozen = false;
  };

  CAM.capture = () => {
    const v = $('cam-video');
    if (!stream || frozen || !v.videoWidth) return;
    const c = $('cam-shot');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    frozen = true;
    try { v.pause(); } catch (_) { /* ignore */ }
    v.hidden = true; c.hidden = false;
    $('cam-capture').hidden = true;
    $('cam-use').hidden = false;
    $('cam-retake').hidden = false;
  };

  CAM.retake = () => {
    if (!frozen) return;
    const v = $('cam-video');
    showLive();
    try { v.play(); } catch (_) { /* ignore */ }
  };

  CAM.use = async () => {
    if (!frozen) return;
    if (OCR.state.busy) { OCR.status(OCR.config.text.status.busy, 'err'); return; }
    const c = $('cam-shot');
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', cfg().jpegQuality));
    if (!blob || !CAM.isOpen()) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    const file = new File([blob], 'camera-' + stamp + '.jpg', { type: 'image/jpeg' });
    CAM.close();
    OCR.io.add([file]);
  };

  CAM.switch = () => {
    if (devices.length < 2 || !stream) return;
    const tr = stream.getVideoTracks()[0];
    const cur = tr && tr.getSettings ? tr.getSettings().deviceId : '';
    const i = devices.findIndex((d) => d.deviceId === cur);
    const next = devices[(i + 1) % devices.length];
    if (next && next.deviceId) start(next.deviceId);
  };

  CAM.init = () => {
    const tap = OCR.ui.onTap;
    tap($('camera-btn'), () => CAM.open());
    tap($('cam-close'), () => CAM.close());
    tap($('cam-capture'), () => CAM.capture());
    tap($('cam-retake'), () => CAM.retake());
    tap($('cam-use'), () => CAM.use());
    tap($('cam-switch'), () => CAM.switch());
    window.addEventListener('keydown', (e) => {
      if (!CAM.isOpen()) return;
      const k = e.key;
      if (k === 'Escape') CAM.close();
      else if (k === ' ' || k === 'Spacebar') { if (frozen) CAM.retake(); else CAM.capture(); }
      else if (k === 'Enter') { if (frozen) CAM.use(); else CAM.capture(); }
      else if ((k === 'r' || k === 'R' || k === 'Backspace') && frozen) CAM.retake();
      else return;
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
    window.addEventListener('pagehide', () => { if (CAM.isOpen()) CAM.close(); });
  };
})(window.OCR);
