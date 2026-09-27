/*
 * AR Theme Game — Ghost theme stub (DLC)
 * Hidden / fade target. Find by tapping when visible.
 * Header: themes/ghost.js
 */

/**
 * Ghost theme definition.
 */
const GhostTheme = (function () {
  const C = AR_GAME_CONFIG.themes.ghost;
  return {
  /** Theme id used by the loader */
  id: "ghost",

  /** HUD label */
  label: C.label,

  /**
   * Pale sphere placeholder.
   * @returns {THREE.Mesh}
   */
  create: function () {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(C.radius, 20, 14),
      new THREE.MeshStandardMaterial({
        color: C.color,
        transparent: true,
        opacity: C.opacity
      })
    );
    mesh.userData.t = 0;
    return mesh;
  },

  /**
   * Drift and pulse opacity so it feels hidden.
   * @param {THREE.Object3D} mesh
   * @param {number} dt
   */
  update: function (mesh, dt) {
    mesh.userData.t += dt;
    mesh.position.x = Math.sin(mesh.userData.t * C.speedX) * C.rangeX;
    mesh.position.y = Math.cos(mesh.userData.t * C.speedY) * C.rangeY;
    mesh.material.opacity = C.fadeMin + Math.abs(Math.sin(mesh.userData.t * C.fadeSpeed)) * C.fadeRange;
  },

  /**
   * Called when the player taps the ghost.
   * @returns {string}
   */
  onCatch: function () {
    return C.catchText;
  }
  };
})();
