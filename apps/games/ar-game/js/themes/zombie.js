/*
 * AR Theme Game — Zombie theme stub (DLC). Primitive box placeholder.
 */
import * as THREE from "three";
import { AR_GAME_CONFIG } from "../../ar-game_config.js";
import { disposeObject } from "../ar.js";

const C = AR_GAME_CONFIG.themes.zombie;

export const ZombieTheme = {
  id: "zombie",
  label: C.label,

  height() {
    return C.size[1];
  },

  create() {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(C.size[0], C.size[1], C.size[2]),
      new THREE.MeshStandardMaterial({ color: C.color })
    );
    mesh.position.y = C.size[1] / 2; // feet on y=0 (for AR)
    root.add(mesh);
    root.userData.mesh = mesh;
    root.userData.t = 0;
    return root;
  },

  /** Overlay: sway side to side (original behaviour). */
  update(root, dt) {
    const u = root.userData;
    u.t += dt;
    root.position.x = Math.sin(u.t * C.swaySpeed) * C.sway;
    root.position.y = C.y - C.size[1] / 2;
    u.mesh.rotation.y += dt * C.spin;
  },

  /** XR: shamble (rock) while the wanderer moves it. */
  animate(root, dt) {
    const u = root.userData;
    u.t += dt;
    u.mesh.rotation.z = Math.sin(u.t * 4) * 0.08;
  },

  onCatch() {
    return C.catchText;
  },

  dispose(root) {
    disposeObject(root);
  },
};
