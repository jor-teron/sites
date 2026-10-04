/*
  File: color-pointer.js
  Project: color-pointer
  Purpose: Track a single bright color in the webcam and drive an on-page cursor.
  Flow: getUserMedia -> draw frame -> user samples a pixel -> HSV blob centroid
  -> smoothed screen point -> dwell click on the element under the cursor.
  Air-mouse (phone gyro) is out of scope for this file.
*/

/* Visible preview element. The browser paints the live camera here. */
const preview = document.getElementById("preview");

/* Offscreen canvas used only for pixel reads. Size is fixed for speed. */
const frame = document.getElementById("frame");

/* 2D context for the processing canvas. */
const ctx = frame.getContext("2d", { willReadFrequently: true });

/* On-page cursor dot. Not the OS pointer. */
const cursor = document.getElementById("cursor");

/* Status line inside the camera dock. */
const statusEl = document.getElementById("status");

/* Last action line on the stage. */
const logEl = document.getElementById("log");

/* Color chip showing the locked sticker color. */
const swatch = document.getElementById("swatch");

/* Processing width. Height follows the video aspect. */
const FRAME_W = 160;

/* Hue tolerance in degrees. Wider catches tape under indoor light. */
const HUE_TOL = 18;

/* Minimum saturation and value so skin and grey walls are ignored. */
const MIN_S = 0.45;
const MIN_V = 0.35;

/* Exponential smoothing. Lower is steadier, higher is snappier. */
const SMOOTH = 0.35;

/* How long the marker must stay inside the click radius before a click. */
const DWELL_MS = 600;

/* Movement beyond this many pixels resets the dwell timer. */
const DWELL_RADIUS = 28;

/* Locked target in HSV. Null until the user samples the preview. */
let target = null;

/* Smoothed normalized position, 0..1 across the page. */
let smoothX = 0.5;
let smoothY = 0.5;

/* True after the first tracked frame, so smoothing does not jump from center. */
let hasPoint = false;

/* Mirror flag. On makes the preview and the pointer match a facing camera. */
let mirror = true;

/* Dwell bookkeeping. */
let dwellStart = 0;
let dwellX = 0;
let dwellY = 0;
let dwellArmed = false;

/* Animation handle so stop can cancel the loop later if needed. */
let loopId = 0;

/* Live stream so a retry can release the camera before opening it again. */
let stream = null;

/* Camera dropdown. Empty until permission is granted and labels are available. */
const camSelect = document.getElementById("cams");

/**
 * Convert one RGB pixel to HSV.
 * h is 0..360, s and v are 0..1.
 */
function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h: h, s: s, v: max };
}

/**
 * Circular hue distance in degrees. Red wraps across 0 and 360.
 */
function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Stop any open stream so a second start does not leave the camera busy.
 */
function stopStream() {
  if (!stream) return;
  stream.getTracks().forEach(function (track) { track.stop(); });
  stream = null;
  preview.srcObject = null;
}

/**
 * Fill the camera list. Labels stay blank until permission was granted once.
 */
async function fillCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videos = devices.filter(function (d) { return d.kind === "videoinput"; });
  const current = camSelect.value;
  camSelect.innerHTML = "";
  videos.forEach(function (d, i) {
    const opt = document.createElement("option");
    opt.value = d.deviceId;
    opt.textContent = d.label || ("Camera " + (i + 1));
    camSelect.appendChild(opt);
  });
  if (current) camSelect.value = current;
}

/**
 * Open a camera. No required facingMode — that constraint fails on many USB webcams
 * and surfaces as "Could not start video source".
 * Tries the picked device, then any camera with no size constraint.
 */
async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusEl.textContent = "No camera API. Use Chrome or Edge on http://localhost.";
    return;
  }
  if (location.protocol === "file:") {
    statusEl.textContent = "Blocked on file://. Run: python3 -m http.server 8080";
    return;
  }
  statusEl.textContent = "Requesting camera…";
  stopStream();
  const attempts = [];
  if (camSelect.value) {
    attempts.push({ video: { deviceId: { exact: camSelect.value } }, audio: false });
  }
  attempts.push({ video: true, audio: false });
  let lastErr = null;
  for (let i = 0; i < attempts.length; i++) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(attempts[i]);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) {
    statusEl.textContent = cameraErrorText(lastErr);
    return;
  }
  preview.srcObject = stream;
  await preview.play();
  await fillCameras();
  const track = stream.getVideoTracks()[0];
  statusEl.textContent = "On: " + (track.label || "camera") + ". Click the sticker to lock color.";
  cancelAnimationFrame(loopId);
  loopId = requestAnimationFrame(tick);
}

/**
 * Plain reason for the common getUserMedia failures.
 */
function cameraErrorText(err) {
  const name = err && err.name ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Permission denied. Allow camera in the address bar, then Start again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera found. Plug in a webcam, then Start again.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Camera busy. Close Zoom, Meet, or another tab using it, then Start again.";
  }
  if (name === "OverconstrainedError") {
    return "This camera rejected the request. Pick another camera and Start again.";
  }
  return "Camera blocked: " + (err.message || name);
}

/**
 * Sample the sticker color from a click on the preview video.
 * Maps the click into the processing frame, then stores HSV.
 */
function sampleFromPreview(event) {
  if (!preview.videoWidth) return;
  const rect = preview.getBoundingClientRect();
  const px = (event.clientX - rect.left) / rect.width;
  const py = (event.clientY - rect.top) / rect.height;
  drawFrame();
  const x = Math.min(frame.width - 1, Math.max(0, Math.floor(px * frame.width)));
  const y = Math.min(frame.height - 1, Math.max(0, Math.floor(py * frame.height)));
  const p = ctx.getImageData(x, y, 1, 1).data;
  target = rgbToHsv(p[0], p[1], p[2]);
  swatch.style.background = "rgb(" + p[0] + "," + p[1] + "," + p[2] + ")";
  statusEl.textContent = "Color locked. Point the sticker at the page.";
  hasPoint = false;
}

/**
 * Copy the current video frame into the small processing canvas.
 * Mirror is applied here so tracking and preview agree.
 */
function drawFrame() {
  const vw = preview.videoWidth;
  const vh = preview.videoHeight;
  if (!vw) return;
  const fh = Math.max(1, Math.round(FRAME_W * (vh / vw)));
  if (frame.width !== FRAME_W || frame.height !== fh) {
    frame.width = FRAME_W;
    frame.height = fh;
  }
  ctx.save();
  if (mirror) {
    ctx.translate(frame.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(preview, 0, 0, frame.width, frame.height);
  ctx.restore();
}

/**
 * Find the centroid of pixels close to the locked color.
 * Returns normalized x,y in 0..1, or null if the sticker is missing.
 */
function findBlob() {
  const img = ctx.getImageData(0, 0, frame.width, frame.height);
  const data = img.data;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  const step = 2;
  for (let y = 0; y < frame.height; y += step) {
    for (let x = 0; x < frame.width; x += step) {
      const i = (y * frame.width + x) * 4;
      const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);
      if (hsv.s < MIN_S || hsv.v < MIN_V) continue;
      if (hueDist(hsv.h, target.h) > HUE_TOL) continue;
      sumX += x;
      sumY += y;
      count += 1;
    }
  }
  /* Ignore tiny noise. A sticker should cover more than a few samples. */
  if (count < 8) return null;
  return {
    x: sumX / count / frame.width,
    y: sumY / count / frame.height
  };
}

/**
 * Move the on-page cursor and fire a dwell click when the point holds still.
 */
function placeCursor(nx, ny) {
  const x = nx * window.innerWidth;
  const y = ny * window.innerHeight;
  cursor.style.display = "block";
  cursor.style.left = x + "px";
  cursor.style.top = y + "px";

  const moved = Math.hypot(x - dwellX, y - dwellY);
  if (!dwellArmed || moved > DWELL_RADIUS) {
    dwellArmed = true;
    dwellStart = performance.now();
    dwellX = x;
    dwellY = y;
    cursor.classList.remove("click");
    return;
  }
  if (performance.now() - dwellStart >= DWELL_MS) {
    cursor.classList.add("click");
    fireClick(x, y);
    dwellStart = performance.now() + 500;
  }
}

/**
 * Click the topmost element under the cursor, skipping the cursor itself.
 * Tiles get a short highlight so the hit is visible.
 */
function fireClick(x, y) {
  cursor.style.display = "none";
  const el = document.elementFromPoint(x, y);
  cursor.style.display = "block";
  if (!el || el.closest("#dock")) return;
  const tile = el.closest(".tile");
  if (tile) {
    tile.classList.add("hit");
    setTimeout(function () { tile.classList.remove("hit"); }, 280);
    logEl.textContent = "Clicked: " + tile.dataset.name;
  } else {
    logEl.textContent = "Clicked page at " + Math.round(x) + ", " + Math.round(y);
  }
}

/**
 * One tracking frame. Draws, finds the blob, smooths, places the cursor.
 */
function tick() {
  loopId = requestAnimationFrame(tick);
  if (!preview.videoWidth || !target) return;
  drawFrame();
  const blob = findBlob();
  if (!blob) {
    statusEl.textContent = "Sticker not in frame.";
    return;
  }
  statusEl.textContent = "Tracking.";
  if (!hasPoint) {
    smoothX = blob.x;
    smoothY = blob.y;
    hasPoint = true;
  } else {
    smoothX += (blob.x - smoothX) * SMOOTH;
    smoothY += (blob.y - smoothY) * SMOOTH;
  }
  placeCursor(smoothX, smoothY);
}

/* Start button. Camera permission is requested only after this click. */
document.getElementById("start").addEventListener("click", function () {
  startCamera();
});

/* Switching the dropdown reopens that device. */
camSelect.addEventListener("change", function () {
  if (stream) startCamera();
});

/* Mirror toggle. Class marks the on state. */
document.getElementById("mirror").addEventListener("click", function (ev) {
  mirror = !mirror;
  ev.currentTarget.classList.toggle("on", mirror);
});

/* Sample the sticker by clicking the live preview. */
preview.addEventListener("click", sampleFromPreview);
