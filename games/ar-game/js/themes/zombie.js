/*
 * AR Theme Game — Zombie theme stub (DLC)
 * Same engine, different placeholder + rules later.
 * Header: themes/zombie.js
 */

/**
 * Zombie theme definition.
 */
const ZombieTheme = (function () {
  const C = AR_GAME_CONFIG.themes.zombie;
  return {
  /** Theme id used by the loader */
  id: "zombie",

  /** HUD label */
  label: C.label,

  /**
   * Green box placeholder until a real model is added.
   * @returns {THREE.Mesh}
   */
  create: function () {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(C.size[0], C.size[1], C.size[2]),
      new THREE.MeshStandardMaterial({ color: C.color })
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
    mesh.position.x = Math.sin(mesh.userData.t * C.swaySpeed) * C.sway;
    mesh.position.y = C.y;
    mesh.rotation.y += dt * C.spin;
  },

  /**
   * Called when the player taps the zombie.
   * @returns {string}
   */
  onCatch: function () {
    return C.catchText;
  }
  };
})();
