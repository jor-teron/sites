/*
  File: features.js
  Project: devbench
  Role: Feature checklist (moved from Browser Bench). Fast checks only, no heavy work.
  Exposes window.DevbenchFeatures.detect() -> { key: true/false } and .labels.
*/

var DEVBENCH_FEATURE_LABELS = {
  webgl1: "WebGL 1", webgl2: "WebGL 2", webgpu: "WebGPU", wasm: "WebAssembly", wasmSIMD: "WASM SIMD",
  webWorkers: "Web Workers", sharedArrayBuffer: "SharedArrayBuffer", offscreenCanvas: "OffscreenCanvas",
  webxrAR: "WebXR AR", webxrVR: "WebXR VR", deviceOrientation: "Device orientation", gyroscopeSensor: "Gyroscope sensor API",
  camera: "Camera", webAudio: "Web Audio", webCodecs: "WebCodecs", opfs: "Private file storage (OPFS)",
  indexedDB: "IndexedDB", gamepad: "Gamepad", pointerLock: "Pointer lock", fullscreen: "Fullscreen",
  vibration: "Vibration", wakeLock: "Screen wake lock",
  textureETC: "Texture ETC2", textureASTC: "Texture ASTC", textureS3TC: "Texture S3TC/DXT"
};

/* Some browsers never settle these promises; cap the wait. */
function devbenchFeatWithin(p, ms, fallback) {
  return Promise.race([p, new Promise(function (r) { setTimeout(function () { r(fallback); }, ms); })]);
}

async function devbenchDetectFeatures() {
  var f = {};
  var c1 = document.createElement("canvas").getContext("webgl");
  var c2 = document.createElement("canvas").getContext("webgl2");
  f.webgl1 = !!c1; f.webgl2 = !!c2;
  var gl = c2 || c1;
  var has = function () { for (var i = 0; i < arguments.length; i++) { if (gl && gl.getExtension(arguments[i])) { return true; } } return false; };
  f.textureETC = has("WEBGL_compressed_texture_etc");
  f.textureASTC = has("WEBGL_compressed_texture_astc");
  f.textureS3TC = has("WEBGL_compressed_texture_s3tc", "WEBKIT_WEBGL_compressed_texture_s3tc");
  [c1, c2].forEach(function (g) { var x = g && g.getExtension("WEBGL_lose_context"); if (x) { x.loseContext(); } });
  f.webgpu = false;
  if (navigator.gpu) { try { f.webgpu = !!(await devbenchFeatWithin(navigator.gpu.requestAdapter(), 2000, null)); } catch (e) { /* no */ } }
  f.wasm = typeof WebAssembly === "object";
  f.wasmSIMD = false;
  try { /* minimal module using one v128 instruction */
    f.wasmSIMD = WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]));
  } catch (e) { /* no */ }
  f.webWorkers = "Worker" in window;
  f.sharedArrayBuffer = typeof SharedArrayBuffer === "function" && !!window.crossOriginIsolated;
  f.offscreenCanvas = "OffscreenCanvas" in window;
  f.webxrAR = false; f.webxrVR = false;
  if (navigator.xr) {
    try { f.webxrAR = !!(await devbenchFeatWithin(navigator.xr.isSessionSupported("immersive-ar"), 2000, false)); } catch (e) { /* no */ }
    try { f.webxrVR = !!(await devbenchFeatWithin(navigator.xr.isSessionSupported("immersive-vr"), 2000, false)); } catch (e) { /* no */ }
  }
  f.deviceOrientation = "DeviceOrientationEvent" in window;
  f.gyroscopeSensor = "Gyroscope" in window;
  f.camera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  f.webAudio = !!(window.AudioContext || window.webkitAudioContext);
  f.webCodecs = "VideoEncoder" in window;
  f.opfs = !!(navigator.storage && navigator.storage.getDirectory);
  f.indexedDB = "indexedDB" in window;
  f.gamepad = "getGamepads" in navigator;
  f.pointerLock = "requestPointerLock" in Element.prototype;
  f.fullscreen = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  f.vibration = "vibrate" in navigator;
  f.wakeLock = "wakeLock" in navigator;
  return f;
}

window.DevbenchFeatures = { detect: devbenchDetectFeatures, labels: DEVBENCH_FEATURE_LABELS };
