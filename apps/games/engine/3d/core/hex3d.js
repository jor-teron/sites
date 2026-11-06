/**
 * Thin HEX 3D helper over Three.js WebGPURenderer (HEX-2 lighting).
 * Feature-detects navigator.gpu; no WebGL fallback.
 */
import {
  WebGPURenderer, Scene, PerspectiveCamera, Color, Fog,
  AmbientLight, DirectionalLight, HemisphereLight, Object3D, Group
} from './three.js';

export { WebGPURenderer, Scene, PerspectiveCamera, Color, Fog, AmbientLight, DirectionalLight, HemisphereLight, Object3D, Group };
export * from './three.js';

export function supportsWebGPU() {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

/**
 * @returns {Promise<{ renderer, scene, camera, root, setSize, render, dispose, lost: boolean }>}
 */
export async function createHex3D(canvas, {
  clear = 0x8ec6e6,
  fov = 70,
  near = 0.1,
  far = 400,
  fogNear = 55,
  fogFar = 155,
  maxPixelRatio = 1.5
} = {}) {
  if (!supportsWebGPU()) {
    const err = new Error('WebGPU is not available in this browser.');
    err.code = 'NO_WEBGPU';
    throw err;
  }
  const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(new Color(clear), 1);
  await renderer.init();
  try {
    if (renderer.shadowMap) {
      renderer.shadowMap.enabled = true;
    }
  } catch (_) { /* WebGPU shadow path optional */ }

  const scene = new Scene();
  scene.background = new Color(clear);
  scene.fog = new Fog(0x9fc9e8, fogNear, fogFar);

  const camera = new PerspectiveCamera(fov, 1, near, far);
  camera.position.set(0, 2, 8);

  const root = new Group();
  scene.add(root);

  const hemi = new HemisphereLight(0xd8ecff, 0x3a4a28, 0.55);
  const ambient = new AmbientLight(0xb8d4ff, 0.28);
  const sun = new DirectionalLight(0xfff1d0, 1.35);
  sun.position.set(45, 70, 25);
  sun.castShadow = true;
  try {
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
  } catch (_) {}
  scene.add(hemi, ambient, sun);

  let lost = false;
  if (renderer.backend && renderer.backend.device) {
    try {
      renderer.backend.device.lost.then?.(() => { lost = true; });
    } catch (_) { /* older */ }
  }

  function setSize(w, h) {
    const pr = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  function render() {
    if (lost) return { ok: false, lost: true };
    renderer.render(scene, camera);
    return { ok: true, lost: false };
  }

  function dispose() {
    try { renderer.dispose(); } catch (_) {}
  }

  return {
    renderer, scene, camera, root, ambient, sun, hemi,
    setSize, render, dispose, get lost() { return lost; }
  };
}

export function showOverlay(host, title, body) {
  let el = host.querySelector('.hex-overlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'hex-overlay';
    el.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(6,12,18,.82);color:#e8f4ff;z-index:20;padding:24px;text-align:center;font:15px/1.45 system-ui,sans-serif';
    host.appendChild(el);
  }
  el.innerHTML = `<div style="max-width:420px"><h2 style="margin:0 0 8px;font-size:1.25rem;color:#9ef0e0">${title}</h2><p style="margin:0;opacity:.9">${body}</p></div>`;
  return el;
}
