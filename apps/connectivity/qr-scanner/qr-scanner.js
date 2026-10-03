/*
  File: qr-scanner.js
  Project: qr-scanner
  Purpose: Full-screen multi-format scanner.
  Camera fills the viewport. Decode region is the fixed 90% width frame.
  Torch and image tiles at the bottom. Pinch zoom only. One centered result. No storage.
  Decoder: ZXingWASM.readBarcodes from zxing-wasm 2.2.4 (loaded by the HTML).
*/

/* Live camera element. */
const cameraEl = document.getElementById("camera");
/* Fixed scan frame. Visual only; crop math uses the same 90vw square. */
const frameEl = document.getElementById("frame");
/* Stage used for pinch tracking. */
const stageEl = document.getElementById("stage");
/* Torch button. */
const torchBtn = document.getElementById("torchBtn");
/* Image fallback button. */
const imageBtn = document.getElementById("imageBtn");
/* Hidden file input. */
const fileInput = document.getElementById("fileInput");
/* Result card. Hidden until a scan. */
const resultEl = document.getElementById("result");
/* Format and time line. */
const resultMetaEl = document.getElementById("resultMeta");
/* Payload line. */
const resultTextEl = document.getElementById("resultText");
/* Copy button. */
const copyBtn = document.getElementById("copyBtn");
/* Close button. */
const closeBtn = document.getElementById("closeBtn");
/* Status line for camera or decoder errors. */
const statusEl = document.getElementById("status");

/* Offscreen canvas used to crop the frame region before decode. */
const cropCanvas = document.createElement("canvas");
/* 2D context for the crop canvas. */
const cropCtx = cropCanvas.getContext("2d", { willReadFrequently: true });

/* Active camera stream. Null until permission is granted. */
let mediaStream = null;
/* Active video track. Used for torch and hardware zoom. */
let videoTrack = null;
/* True while the decode loop should run. */
let scanning = false;
/* Last decoded text. Same text is ignored during the cooldown. */
let lastText = "";
/* Timestamp of the last accepted scan. */
let lastScanAt = 0;
/* Cooldown so one code is not replaced repeatedly. Milliseconds. */
const SCAN_COOLDOWN_MS = 1500;
/* Current zoom factor. 1 is native. */
let zoomValue = 1;
/* Minimum zoom. */
const ZOOM_MIN = 1;
/* Maximum zoom when the camera does not report a range. */
const ZOOM_MAX_FALLBACK = 5;
/* Frame width as a fraction of the viewport width. Matches the CSS frame. */
const FRAME_WIDTH_RATIO = 0.9;
/* True when the track exposes a real zoom capability. */
let hardwareZoom = false;
/* Hardware zoom range from the track, if any. */
let zoomRange = { min: 1, max: 1, step: 0.1 };
/* True when torch is on. */
let torchOn = false;
/* Pinch start distance in CSS pixels. */
let pinchStartDistance = 0;
/* Zoom value at the start of a pinch. */
let pinchStartZoom = 1;
/* Reader options. Empty formats means every symbology the build supports. */
const readerOptions = {
  tryHarder: true,
  maxNumberOfSymbols: 1
};

/**
 * Show a short status line. Pass an empty string to hide it.
 * @param {string} message Status text.
 */
function setStatus(message) {
  if (!message) {
    statusEl.hidden = true;
    statusEl.textContent = "";
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = message;
}

/**
 * Format a Date as local date plus time, for example 03 Oct 2026, 19:03.
 * @param {Date} date Scan time.
 * @returns {string} Display string.
 */
function formatStamp(date) {
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * True when the payload can be opened as a link.
 * @param {string} text Decoded text.
 * @returns {boolean} Whether the text is an openable URL, mail, or phone link.
 */
function isOpenable(text) {
  return /^(https?:\/\/|mailto:|tel:)/i.test(text);
}

/**
 * Show the single result card. A new scan replaces the previous card.
 * Nothing is written to storage. Reload clears it.
 * @param {string} text Decoded payload.
 * @param {string} format Symbology name from the decoder.
 */
function showResult(text, format) {
  const stamp = formatStamp(new Date());
  resultMetaEl.textContent = format + " · " + stamp;
  resultTextEl.textContent = "";
  if (isOpenable(text)) {
    const link = document.createElement("a");
    link.href = text;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = text;
    resultTextEl.appendChild(link);
  } else {
    resultTextEl.textContent = text;
  }
  resultEl.hidden = false;
  resultEl.dataset.text = text;
}

/**
 * Hide the result card. Camera and controls stay.
 */
function closeResult() {
  resultEl.hidden = true;
  resultTextEl.textContent = "";
  resultEl.dataset.text = "";
}

/**
 * Copy the current payload. Uses the clipboard API, then a selection fallback.
 */
async function copyResult() {
  const text = resultEl.dataset.text || "";
  if (!text) {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "Copied";
  } catch (err) {
    const range = document.createRange();
    range.selectNodeContents(resultTextEl);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    copyBtn.textContent = "Select";
  }
  setTimeout(function () {
    copyBtn.textContent = "Copy";
  }, 1200);
}

/**
 * Map the fixed on-screen frame back to video pixels under object-fit: cover.
 * CSS zoom fallback shrinks the sampled region so the frame still matches the view.
 * @returns {{sx:number, sy:number, sw:number, sh:number}|null} Source crop, or null if video is not ready.
 */
function frameCrop() {
  const videoWidth = cameraEl.videoWidth;
  const videoHeight = cameraEl.videoHeight;
  if (!videoWidth || !videoHeight) {
    return null;
  }
  const viewWidth = cameraEl.clientWidth;
  const viewHeight = cameraEl.clientHeight;
  const coverScale = Math.max(viewWidth / videoWidth, viewHeight / videoHeight);
  const displayedWidth = videoWidth * coverScale;
  const displayedHeight = videoHeight * coverScale;
  const offsetX = (displayedWidth - viewWidth) / 2;
  const offsetY = (displayedHeight - viewHeight) / 2;
  const frameSize = viewWidth * FRAME_WIDTH_RATIO;
  const frameLeft = (viewWidth - frameSize) / 2;
  const frameTop = (viewHeight - frameSize) / 2;
  /* CSS scale is only used when the camera has no hardware zoom. */
  const visualScale = hardwareZoom ? 1 : zoomValue;
  const centerX = frameLeft + frameSize / 2;
  const centerY = frameTop + frameSize / 2;
  const sampled = frameSize / visualScale;
  const sx = (centerX - sampled / 2 + offsetX) / coverScale;
  const sy = (centerY - sampled / 2 + offsetY) / coverScale;
  const sw = sampled / coverScale;
  const sh = sampled / coverScale;
  return { sx: sx, sy: sy, sw: sw, sh: sh };
}

/**
 * Draw the frame region and decode it. Returns the first symbol, or null.
 * @returns {Promise<{text:string, format:string}|null>} First symbol, if any.
 */
async function decodeFrame() {
  const crop = frameCrop();
  if (!crop || !cropCtx || !window.ZXingWASM) {
    return null;
  }
  const dest = 480;
  cropCanvas.width = dest;
  cropCanvas.height = dest;
  cropCtx.drawImage(cameraEl, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dest, dest);
  const imageData = cropCtx.getImageData(0, 0, dest, dest);
  const hits = await ZXingWASM.readBarcodes(imageData, readerOptions);
  if (!hits || !hits.length || !hits[0].text) {
    return null;
  }
  return { text: hits[0].text, format: hits[0].format || "Code" };
}

/**
 * Decode loop. Skips the same text during the cooldown. A different code replaces the card.
 */
async function scanTick() {
  if (!scanning) {
    return;
  }
  try {
    const hit = await decodeFrame();
    const now = Date.now();
    if (hit && (hit.text !== lastText || now - lastScanAt > SCAN_COOLDOWN_MS)) {
      lastText = hit.text;
      lastScanAt = now;
      showResult(hit.text, hit.format);
    }
  } catch (err) {
    /* Decoder errors are ignored so a bad frame does not stop the camera. */
  }
  if (scanning) {
    setTimeout(scanTick, 280);
  }
}

/**
 * Apply zoom. Hardware zoom when the track supports it, otherwise CSS scale.
 * @param {number} next Requested zoom factor.
 */
async function setZoom(next) {
  const maxZoom = hardwareZoom ? zoomRange.max : ZOOM_MAX_FALLBACK;
  const minZoom = hardwareZoom ? zoomRange.min : ZOOM_MIN;
  zoomValue = Math.min(maxZoom, Math.max(minZoom, next));
  if (hardwareZoom && videoTrack) {
    try {
      await videoTrack.applyConstraints({ advanced: [{ zoom: zoomValue }] });
      cameraEl.style.transform = "none";
      return;
    } catch (err) {
      hardwareZoom = false;
    }
  }
  cameraEl.style.transform = "scale(" + zoomValue + ")";
}

/**
 * Read zoom and torch support from the current track.
 */
function readTrackCaps() {
  hardwareZoom = false;
  torchBtn.hidden = true;
  if (!videoTrack || !videoTrack.getCapabilities) {
    return;
  }
  const caps = videoTrack.getCapabilities();
  if (caps.zoom) {
    hardwareZoom = true;
    zoomRange = {
      min: caps.zoom.min || 1,
      max: caps.zoom.max || ZOOM_MAX_FALLBACK,
      step: caps.zoom.step || 0.1
    };
  }
  if (caps.torch) {
    torchBtn.hidden = false;
  }
}

/**
 * Toggle the camera torch. No effect if the track has no torch.
 */
async function toggleTorch() {
  if (!videoTrack) {
    return;
  }
  torchOn = !torchOn;
  try {
    await videoTrack.applyConstraints({ advanced: [{ torch: torchOn }] });
    torchBtn.setAttribute("aria-pressed", torchOn ? "true" : "false");
  } catch (err) {
    torchOn = false;
    torchBtn.setAttribute("aria-pressed", "false");
    setStatus("Light is not available on this camera.");
  }
}

/**
 * Start the rear camera, then the decode loop.
 * Resets zoom to 1. Needs HTTPS or localhost.
 */
async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("This browser has no camera API. Use Image.");
    return;
  }
  setStatus("Starting camera…");
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    cameraEl.srcObject = mediaStream;
    videoTrack = mediaStream.getVideoTracks()[0];
    await cameraEl.play();
    readTrackCaps();
    zoomValue = 1;
    await setZoom(1);
    scanning = true;
    setStatus("");
    scanTick();
  } catch (err) {
    setStatus("Camera blocked. Allow camera, or use Image.");
  }
}

/**
 * Decode an uploaded image with the same reader. Shows one result card.
 * @param {File} file Image chosen by the user.
 */
async function decodeFile(file) {
  if (!file || !window.ZXingWASM) {
    setStatus("Decoder is not ready.");
    return;
  }
  setStatus("Reading image…");
  try {
    const hits = await ZXingWASM.readBarcodes(file, readerOptions);
    if (!hits || !hits.length || !hits[0].text) {
      setStatus("No code found in that image.");
      return;
    }
    lastText = hits[0].text;
    lastScanAt = Date.now();
    showResult(hits[0].text, hits[0].format || "Code");
    setStatus("");
  } catch (err) {
    setStatus("Could not read that image.");
  }
}

/**
 * Distance between the first two touch points.
 * @param {TouchList} touches Active touches.
 * @returns {number} Pixel distance.
 */
function touchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

/**
 * Begin a pinch. Stores the starting distance and zoom.
 * @param {TouchEvent} event Touch start event.
 */
function onTouchStart(event) {
  if (event.touches.length === 2) {
    pinchStartDistance = touchDistance(event.touches);
    pinchStartZoom = zoomValue;
  }
}

/**
 * Pinch zoom. Scales from the zoom at touch start.
 * @param {TouchEvent} event Touch move event.
 */
function onTouchMove(event) {
  if (event.touches.length !== 2 || !pinchStartDistance) {
    return;
  }
  event.preventDefault();
  const ratio = touchDistance(event.touches) / pinchStartDistance;
  setZoom(pinchStartZoom * ratio);
}

/* Torch control. Missing buttons must not block the camera. */
if (torchBtn) {
  torchBtn.addEventListener("click", toggleTorch);
}
/* Image control opens the file picker. */
if (imageBtn && fileInput) {
  imageBtn.addEventListener("click", function () {
    fileInput.click();
  });
}
/* File picker result. */
if (fileInput) {
  fileInput.addEventListener("change", function () {
    const file = fileInput.files && fileInput.files[0];
    if (file) {
      decodeFile(file);
    }
    fileInput.value = "";
  });
}
/* Result actions. */
if (copyBtn) {
  copyBtn.addEventListener("click", copyResult);
}
if (closeBtn) {
  closeBtn.addEventListener("click", closeResult);
}
/* Pinch on the stage. Passive false so preventDefault can block page scroll. */
if (stageEl) {
  stageEl.addEventListener("touchstart", onTouchStart, { passive: true });
  stageEl.addEventListener("touchmove", onTouchMove, { passive: false });
}

/* Camera starts even if a control failed to bind. */
startCamera();
