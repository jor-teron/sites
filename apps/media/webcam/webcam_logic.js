// webcam_logic.js — settings and text come from WEBCAM_CONFIG (webcam_config.js)

document.addEventListener('DOMContentLoaded', () => {
  const CFG = WEBCAM_CONFIG;
  const TXT = CFG.text;

  const webcamFeed = document.getElementById('webcamFeed');
  const photoCanvas = document.getElementById('photoCanvas');
  const captureButton = document.getElementById('captureButton');
  const downloadLink = document.getElementById('downloadLink');
  const messageDiv = document.getElementById('message');
  const themeBtn = document.getElementById('themeBtn');
  const flipBtn = document.getElementById('flipBtn');
  const ctx = photoCanvas.getContext('2d');

  let stream = null;
  let facing = 'user';           // toggled by Flip when a second camera exists
  let canFlip = false;

  function displayMessage(msg, type) {
    messageDiv.textContent = msg || '';
    messageDiv.className = CFG.classes.messageBase;
    if (!msg) return;
    const extra = type === 'error' ? CFG.classes.messageError
      : type === 'success' ? CFG.classes.messageSuccess
      : CFG.classes.messageInfo;
    messageDiv.classList.add(...extra);
  }

  function applyTheme(name) {
    const t = name === 'light' ? 'light' : 'dark';
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add('theme-' + t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'light' ? '#e8eaed' : '#0b0d10';
    try { localStorage.setItem(CFG.theme.storageKey, t); } catch (_) { /* ignore */ }
  }
  function loadTheme() {
    let t = CFG.theme.default;
    try { t = localStorage.getItem(CFG.theme.storageKey) || t; } catch (_) { /* ignore */ }
    applyTheme(t);
  }
  themeBtn.addEventListener('click', () => {
    applyTheme(document.body.classList.contains('theme-light') ? 'dark' : 'light');
  });

  function stopStream() {
    if (!stream) return;
    stream.getTracks().forEach((tr) => { try { tr.stop(); } catch (_) { /* ignore */ } });
    stream = null;
  }

  async function startCamera() {
    displayMessage(TXT.requesting, 'info');
    captureButton.disabled = true;
    stopStream();
    const constraints = {
      audio: false,
      video: Object.assign({}, (CFG.mediaConstraints && CFG.mediaConstraints.video) || true, {
        facingMode: facing,
      }),
    };
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      webcamFeed.srcObject = stream;
      await webcamFeed.play().catch(() => {});
      displayMessage(TXT.active, 'info');
      captureButton.disabled = false;
      await refreshFlip();
    } catch (err) {
      console.error(TXT.consoleError, err);
      if (CFG.errorNames.denied.includes(err.name)) displayMessage(TXT.denied, 'error');
      else if (CFG.errorNames.notFound.includes(err.name)) displayMessage(TXT.notFound, 'error');
      else displayMessage(TXT.errorPrefix + (err.message || err.name), 'error');
      captureButton.disabled = true;
    }
  }

  async function refreshFlip() {
    canFlip = false;
    flipBtn.hidden = true;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      canFlip = cams.length > 1;
      flipBtn.hidden = !canFlip;
    } catch (_) { /* ignore */ }
  }

  flipBtn.addEventListener('click', () => {
    if (!canFlip) return;
    facing = facing === 'user' ? 'environment' : 'user';
    // hide a previous capture when switching cameras
    photoCanvas.classList.add(CFG.classes.hidden);
    downloadLink.classList.add(CFG.classes.hidden);
    startCamera();
  });

  function capturePhoto() {
    if (!stream) { displayMessage(TXT.notActive, 'error'); return; }
    photoCanvas.width = webcamFeed.videoWidth;
    photoCanvas.height = webcamFeed.videoHeight;
    ctx.drawImage(webcamFeed, 0, 0, photoCanvas.width, photoCanvas.height);
    const imageDataURL = photoCanvas.toDataURL(CFG.photo.mimeType);
    photoCanvas.classList.remove(CFG.classes.hidden);
    downloadLink.classList.remove(CFG.classes.hidden);
    downloadLink.href = imageDataURL;
    downloadLink.textContent = TXT.downloadLabel;
    displayMessage(TXT.captured, 'success');
  }

  downloadLink.download = CFG.photo.downloadName;
  captureButton.addEventListener('click', capturePhoto);

  loadTheme();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    displayMessage(TXT.notFound, 'error');
  } else {
    startCamera();
  }
});
