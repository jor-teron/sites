/*
 * AR Theme Game — Camera module (ES module)
 * Rear camera → <video> background for the non-XR overlay mode.
 */
import { AR_GAME_CONFIG } from "../ar-game_config.js";

let cameraEl = null;

/**
 * Start rear camera and attach the stream to the video tag.
 * @param {HTMLVideoElement} el
 * @returns {Promise<MediaStream>}
 */
export async function startCamera(el) {
  cameraEl = el;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("getUserMedia unavailable (needs HTTPS or localhost)");
  }
  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: AR_GAME_CONFIG.camera.facingMode },
      width: { ideal: AR_GAME_CONFIG.camera.width },
      height: { ideal: AR_GAME_CONFIG.camera.height },
    },
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  el.srcObject = stream;
  await el.play();
  return stream;
}

/** Stop all camera tracks (page hide / entering WebXR). */
export function stopCamera() {
  if (!cameraEl || !cameraEl.srcObject) return;
  cameraEl.srcObject.getTracks().forEach((track) => track.stop());
  cameraEl.srcObject = null;
}

/** True if a stream is currently attached. */
export function isCameraRunning() {
  return !!(cameraEl && cameraEl.srcObject);
}
