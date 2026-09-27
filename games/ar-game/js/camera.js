/*
 * AR Theme Game — Camera module
 * Starts the phone rear camera and paints it as the page background.
 * Header: camera.js
 * Default facingMode is environment (rear camera).
 */

/**
 * Video element that shows the live camera feed.
 * Set from app.js after DOM is ready.
 */
let cameraEl = null;

/**
 * Start rear camera and attach the stream to the video tag.
 * @param {HTMLVideoElement} el - Target video element
 * @returns {Promise<MediaStream>}
 */
async function startCamera(el) {
  // Keep a reference for later stop/restart
  cameraEl = el;

  // Ask for the back camera when the phone has one
  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: AR_GAME_CONFIG.camera.facingMode },
      width: { ideal: AR_GAME_CONFIG.camera.width },
      height: { ideal: AR_GAME_CONFIG.camera.height }
    }
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  el.srcObject = stream;
  await el.play();
  return stream;
}

/**
 * Stop all camera tracks if the page unloads.
 */
function stopCamera() {
  if (!cameraEl || !cameraEl.srcObject) {
    return;
  }
  cameraEl.srcObject.getTracks().forEach(function (track) {
    track.stop();
  });
}
