/*
 * AR Theme Game — Zombie theme stub (DLC)
 * Same engine, different placeholder + rules later.
 * Header: themes/zombie.js
 */

/**
 * Zombie theme definition.
 */
const ZombieTheme = {
  /** Theme id used by the loader */
  id: "zombie",

  /** HUD label */
  label: "Zombie",

  /**
   * Green box placeholder until a real model is added.
   * @returns {THREE.Mesh}
   */
  create: function () {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.1, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x27ae60 })
    );
    mesh.userData.t = 0;
    return mesh;
  },

  /**
   * Slow walk toward the center.
   * @param {THREE.Object3D} mesh
   * @param {number} dt
   */
  update: function (mesh, dt) {
    mesh.userData.t += dt;
    mesh.position.x = Math.sin(mesh.userData.t * 0.8) * 1.8;
    mesh.position.y = -0.4;
    mesh.rotation.y += dt * 0.6;
  },

  /**
   * Called when the player taps the zombie.
   * @returns {string}
   */
  onCatch: function () {
    return "Zombie down!";
  }
};
