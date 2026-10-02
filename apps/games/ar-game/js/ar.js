/*
 * AR Theme Game — Three.js renderer / scene (ES module)
 * One renderer for both modes: overlay (camera video behind a transparent
 * canvas) and WebXR immersive-ar (renderer.xr).
 */
import * as THREE from "three";
import { AR_GAME_CONFIG } from "../ar-game_config.js";

/** Shared render state (exported object instead of top-level globals). */
export const view = {
  /** @type {THREE.WebGLRenderer|null} */ renderer: null,
  /** @type {THREE.PerspectiveCamera|null} */ camera: null,
  /** @type {THREE.Scene|null} */ scene: null,
  /** @type {THREE.Clock|null} */ clock: null,
  /** Current target root (theme object, possibly wrapped by an AR holder) */
  /** @type {THREE.Object3D|null} */ target: null,
};

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

/**
 * Build renderer, camera, lights. Enables WebXR on the renderer.
 * @param {HTMLCanvasElement} canvas
 */
export function initRenderer(canvas) {
  const R = AR_GAME_CONFIG.render;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, R.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;

  const camera = new THREE.PerspectiveCamera(R.fov, window.innerWidth / window.innerHeight, R.near, R.far);
  camera.position.set(0, 0, R.cameraZ);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(R.lightSky, R.lightGround, R.lightIntensity));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(2, 4, 3);
  scene.add(dir);

  view.renderer = renderer;
  view.camera = camera;
  view.scene = scene;
  view.clock = new THREE.Clock();

  window.addEventListener("resize", onResize);
}

function onResize() {
  const { renderer, camera } = view;
  if (!renderer || !camera || renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Replace the current target; the caller disposes the old one via onRemove.
 * @param {THREE.Object3D|null} obj
 * @param {(old: THREE.Object3D) => void} [onRemove]
 */
export function setTarget(obj, onRemove) {
  const old = view.target;
  if (old) {
    if (old.parent) old.parent.remove(old);
    if (onRemove) onRemove(old);
  }
  view.target = obj;
  if (obj) view.scene.add(obj);
}

/**
 * Overlay-mode tap → ray → hit test against the target.
 * @param {number} clientX
 * @param {number} clientY
 */
export function hitTestScreen(clientX, clientY) {
  if (!view.target || !view.camera) return false;
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, view.camera);
  return raycaster.intersectObject(view.target, true).length > 0;
}

/**
 * XR-mode hit test with an arbitrary world-space ray.
 * @param {THREE.Vector3} origin
 * @param {THREE.Vector3} direction normalized
 */
export function hitTestRay(origin, direction) {
  if (!view.target) return false;
  raycaster.set(origin, direction);
  return raycaster.intersectObject(view.target, true).length > 0;
}

/**
 * Generic disposal for code-built theme meshes (zombie/ghost).
 * Skips subtrees marked userData.sharedAssets.
 * @param {THREE.Object3D} root
 */
export function disposeObject(root) {
  const seen = new Set();
  const once = (res) => {
    if (res && !seen.has(res) && typeof res.dispose === "function") {
      seen.add(res);
      res.dispose();
    }
  };
  (function walk(obj) {
    if (obj.userData && obj.userData.sharedAssets) return;
    if (obj.geometry) once(obj.geometry);
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        Object.keys(mat).forEach((k) => {
          const v = mat[k];
          if (v && v.isTexture) once(v);
        });
        once(mat);
      });
    }
    obj.children.forEach(walk);
  })(root);
}
