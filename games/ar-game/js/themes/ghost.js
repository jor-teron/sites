/*
 * AR Theme Game — Ghost theme stub (DLC). Pale fading sphere.
 */
import * as THREE from "three";
import { AR_GAME_CONFIG } from "../../ar-game_config.js";
import { disposeObject } from "../ar.js";

const C = AR_GAME_CONFIG.themes.ghost;

export const GhostTheme = {
  id: "ghost",
  label: C.label,

  height() {
    return C.radius * 2;
  },

  create() {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(C.radius, 20, 14),
      new THREE.MeshStandardMaterial({ color: C.color, transparent: true, opacity: C.opacity })
    );
    mesh.position.y = C.radius;
    root.add(mesh);
    root.userData.mesh = mesh;
    root.userData.t = 0;
    return root;
  },

  /** Overlay: drift and pulse (original behaviour). */
  update(root, dt) {
    const u = root.userData;
    u.t += dt;
    root.position.x = Math.sin(u.t * C.speedX) * C.rangeX;
    root.position.y = Math.cos(u.t * C.speedY) * C.rangeY - C.radius;
    u.mesh.material.opacity = C.fadeMin + Math.abs(Math.sin(u.t * C.fadeSpeed)) * C.fadeRange;
  },

  /** XR: hover above the surface and pulse. */
  animate(root, dt) {
    const u = root.userData;
    u.t += dt;
    u.mesh.position.y = C.radius * 2 + Math.sin(u.t * 2) * C.radius * 0.4;
    u.mesh.material.opacity = C.fadeMin + Math.abs(Math.sin(u.t * C.fadeSpeed)) * C.fadeRange;
  },

  onCatch() {
    return C.catchText;
  },

  dispose(root) {
    disposeObject(root);
  },
};
