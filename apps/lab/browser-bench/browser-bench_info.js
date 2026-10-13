// browser-bench_info.js: device info and feature detection (no heavy work).

function browserName(ua) {
  const m = [[/Edg\/([\d.]+)/, 'Edge'], [/OPR\/([\d.]+)/, 'Opera'], [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
    [/Firefox\/([\d.]+)/, 'Firefox'], [/Chrome\/([\d.]+)/, 'Chrome'], [/Version\/([\d.]+).*Safari/, 'Safari']];
  for (const [re, n] of m) { const r = ua.match(re); if (r) return n + ' ' + r[1]; }
  return 'Unknown';
}

export function deviceInfo() {
  const ua = navigator.userAgent;
  const info = {
    browser: browserName(ua), userAgent: ua,
    platform: navigator.userAgentData?.platform || navigator.platform || '?',
    mobile: navigator.userAgentData?.mobile ?? /Mobi|Android/i.test(ua),
    screen: `${screen.width}×${screen.height}`, viewport: `${innerWidth}×${innerHeight}`,
    devicePixelRatio: devicePixelRatio, cpuCores: navigator.hardwareConcurrency || null,
    deviceMemoryGB: navigator.deviceMemory ?? null, gpuVendor: null, gpuRenderer: null, maxTextureSize: null,
  };
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      info.gpuVendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      info.gpuRenderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      info.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch (e) { /* ignore */ }
  return info;
}

// Some browsers never settle these promises; cap the wait.
const within = (p, ms, fb) => Promise.race([p, new Promise((r) => setTimeout(() => r(fb), ms))]);

export async function features() {
  const f = {};
  const c1 = document.createElement('canvas').getContext('webgl');
  f.webgl1 = !!c1;
  const c2 = document.createElement('canvas').getContext('webgl2');
  f.webgl2 = !!c2;
  const gl = c2 || c1;
  if (gl) {
    const has = (...n) => n.some((x) => gl.getExtension(x));
    f.textureS3TC = has('WEBGL_compressed_texture_s3tc', 'WEBKIT_WEBGL_compressed_texture_s3tc');
    f.textureETC = has('WEBGL_compressed_texture_etc');
    f.textureETC1 = has('WEBGL_compressed_texture_etc1');
    f.textureASTC = has('WEBGL_compressed_texture_astc');
    f.textureBPTC = has('EXT_texture_compression_bptc');
  }
  [c1, c2].forEach((g) => g?.getExtension('WEBGL_lose_context')?.loseContext());
  f.webgpu = false;
  if (navigator.gpu) { try { f.webgpu = !!(await within(navigator.gpu.requestAdapter(), 2000, null)); } catch { /* no */ } }
  f.webxrAR = false; f.webxrVR = false;
  if (navigator.xr) {
    try { f.webxrAR = await within(navigator.xr.isSessionSupported('immersive-ar'), 2000, false); } catch { /* no */ }
    try { f.webxrVR = await within(navigator.xr.isSessionSupported('immersive-vr'), 2000, false); } catch { /* no */ }
  }
  f.deviceOrientation = 'DeviceOrientationEvent' in window;
  f.gyroscopeSensor = 'Gyroscope' in window;
  f.camera = !!navigator.mediaDevices?.getUserMedia;
  f.webAudio = !!(window.AudioContext || window.webkitAudioContext);
  f.offscreenCanvas = 'OffscreenCanvas' in window;
  f.wasm = typeof WebAssembly === 'object';
  f.wasmSIMD = false;
  try { // minimal module using a v128 instruction
    f.wasmSIMD = WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]));
  } catch { /* no */ }
  f.webWorkers = 'Worker' in window;
  f.sharedArrayBuffer = typeof SharedArrayBuffer === 'function' && !!window.crossOriginIsolated;
  f.indexedDB = 'indexedDB' in window;
  f.gamepad = 'getGamepads' in navigator;
  f.pointerLock = 'requestPointerLock' in Element.prototype;
  f.fullscreen = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  f.vibration = 'vibrate' in navigator;
  f.wakeLock = 'wakeLock' in navigator;
  return f;
}
