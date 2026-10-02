/*
 * AR Theme Game — WebXR immersive-ar mode (ES module)
 * Hit-test reticle, tap-to-place, wander around the anchor on the detected
 * plane, and select-ray catching. DOM overlay keeps the HUD visible.
 */
import * as THREE from "three";
import { AR_GAME_CONFIG } from "../ar-game_config.js";
import { view, hitTestRay } from "./ar.js";

const X = AR_GAME_CONFIG.xr;

/** XR runtime state (module-scoped, not global). */
const xr = {
  session: null,
  hitSource: null,
  viewerSpace: null,
  reticle: null,
  placed: false,
  anchor: new THREE.Vector3(),
  lastHit: new THREE.Vector3(),
  hitVisible: false,
  holder: null,        // wrapper that positions/scales the theme root on the plane
  wanderTo: new THREE.Vector3(),
  idleT: 0,
  idleLimit: 1.5,
  controller: null,
  hooks: null,
};

const tmpMat = new THREE.Matrix4();
const rayOrigin = new THREE.Vector3();
const rayDir = new THREE.Vector3();

/** @returns {Promise<boolean>} */
export async function isArSupported() {
  try {
    if (!navigator.xr || !navigator.xr.isSessionSupported) return false;
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch (_) {
    return false;
  }
}

export function isPresenting() {
  return !!xr.session;
}

export function isPlaced() {
  return xr.placed;
}

function buildReticle() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(X.reticleInner, X.reticleOuter, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  ring.matrixAutoUpdate = false;
  ring.visible = false;
  return ring;
}

/**
 * Start an immersive-ar session.
 * @param {HTMLElement} overlayRoot dom-overlay root
 * @param {{ onStart: Function, onEnd: Function, onPlace: Function,
 *           onSelectHit: Function, getTheme: Function }} hooks
 */
export async function startAr(overlayRoot, hooks) {
  const renderer = view.renderer;
  const session = await navigator.xr.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["dom-overlay"],
    domOverlay: { root: overlayRoot },
  });
  xr.session = session;
  xr.hooks = hooks;
  xr.placed = false;

  renderer.xr.setReferenceSpaceType("local");
  await renderer.xr.setSession(session);

  xr.viewerSpace = await session.requestReferenceSpace("viewer");
  xr.hitSource = await session.requestHitTestSource({ space: xr.viewerSpace });

  xr.reticle = buildReticle();
  view.scene.add(xr.reticle);

  xr.controller = renderer.xr.getController(0);
  xr.controller.addEventListener("select", onSelect);
  view.scene.add(xr.controller);

  session.addEventListener("end", onSessionEnd);
  hooks.onStart();
}

export function endAr() {
  if (xr.session) xr.session.end();
}

function onSessionEnd() {
  if (xr.hitSource) xr.hitSource.cancel();
  xr.hitSource = null;
  xr.viewerSpace = null;
  if (xr.reticle) {
    view.scene.remove(xr.reticle);
    xr.reticle.geometry.dispose();
    xr.reticle.material.dispose();
    xr.reticle = null;
  }
  if (xr.controller) {
    xr.controller.removeEventListener("select", onSelect);
    view.scene.remove(xr.controller);
    xr.controller = null;
  }
  xr.holder = null;
  xr.placed = false;
  xr.session = null;
  const hooks = xr.hooks;
  xr.hooks = null;
  if (hooks) hooks.onEnd();
}

/**
 * Wrap a theme root in a holder scaled to real-world size.
 * @param {THREE.Object3D} themeRoot
 * @param {number} themeHeight nominal theme height in theme units
 * @returns {THREE.Group}
 */
export function wrapForAr(themeRoot, themeHeight) {
  const holder = new THREE.Group();
  holder.name = "ar-holder";
  const s = X.petHeightM / Math.max(0.01, themeHeight);
  holder.scale.setScalar(s);
  themeRoot.position.set(0, 0, 0);
  themeRoot.rotation.set(0, 0, 0);
  holder.add(themeRoot);
  holder.userData.themeRoot = themeRoot;
  holder.visible = xr.placed;
  if (xr.placed) {
    holder.position.copy(randomNear(xr.anchor, X.wanderRadiusM * 0.5));
    pickWanderTarget();
  }
  xr.holder = holder;
  return holder;
}

/** Respawn the current holder at a nearby spot on the surface. */
export function respawnNearby() {
  if (!xr.holder) return;
  xr.holder.position.copy(randomNear(xr.anchor, X.wanderRadiusM));
  pickWanderTarget();
}

function randomNear(center, radius) {
  const a = Math.random() * Math.PI * 2;
  const r = radius * (0.3 + Math.random() * 0.7);
  return new THREE.Vector3(center.x + Math.cos(a) * r, center.y, center.z + Math.sin(a) * r);
}

function pickWanderTarget() {
  xr.wanderTo.copy(randomNear(xr.anchor, X.wanderRadiusM));
  xr.idleT = 0;
  xr.idleLimit = 1 + Math.random() * 1.5;
}

function onSelect() {
  const hooks = xr.hooks;
  if (!hooks) return;
  if (!xr.placed) {
    if (!xr.hitVisible) return;
    xr.anchor.copy(xr.lastHit);
    xr.placed = true;
    if (xr.holder) {
      xr.holder.position.copy(xr.anchor);
      xr.holder.visible = true;
      pickWanderTarget();
    }
    hooks.onPlace();
    return;
  }
  // Ray from the XR input source (screen tap) through the scene
  const c = xr.controller;
  tmpMat.identity().extractRotation(c.matrixWorld);
  rayOrigin.setFromMatrixPosition(c.matrixWorld);
  rayDir.set(0, 0, -1).applyMatrix4(tmpMat).normalize();
  if (hitTestRay(rayOrigin, rayDir)) {
    hooks.onSelectHit();
  }
}

/**
 * Per-frame XR update: hit-test reticle + wander.
 * @param {XRFrame} frame
 * @param {number} dt
 * @param {object} theme active theme
 * @param {boolean} frozen true while a catch animation plays
 */
export function updateXr(frame, dt, theme, frozen) {
  const renderer = view.renderer;
  if (frame && xr.hitSource) {
    const results = frame.getHitTestResults(xr.hitSource);
    if (results.length) {
      const pose = results[0].getPose(renderer.xr.getReferenceSpace());
      if (pose) {
        xr.reticle.matrix.fromArray(pose.transform.matrix);
        xr.lastHit.setFromMatrixPosition(xr.reticle.matrix);
        xr.hitVisible = true;
        xr.reticle.visible = !xr.placed;
      }
    } else {
      xr.hitVisible = false;
      xr.reticle.visible = false;
    }
  }

  const holder = xr.holder;
  if (!holder || !xr.placed) return;
  const themeRoot = holder.userData.themeRoot;
  let moving = false;
  if (!frozen) {
    const dx = xr.wanderTo.x - holder.position.x;
    const dz = xr.wanderTo.z - holder.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.02) {
      const step = Math.min(dist, X.wanderSpeedM * dt);
      holder.position.x += (dx / dist) * step;
      holder.position.z += (dz / dist) * step;
      holder.position.y = xr.anchor.y;
      // Face travel direction (models face +Z)
      const heading = Math.atan2(dx, dz);
      holder.rotation.y += shortestAngle(holder.rotation.y, heading) * Math.min(1, dt * 8);
      moving = true;
    } else {
      xr.idleT += dt;
      if (xr.idleT > xr.idleLimit) pickWanderTarget();
    }
  }
  if (theme && typeof theme.animate === "function" && themeRoot) {
    theme.animate(themeRoot, dt, moving);
  }
}

function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
