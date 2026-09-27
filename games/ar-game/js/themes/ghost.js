/*
 * AR Theme Game — Ghost theme stub (DLC)
 * Hidden / fade target. Find by tapping when visible.
 * Header: themes/ghost.js
 */

/**
 * Ghost theme definition.
 */
const GhostTheme = {
  /** Theme id used by the loader */
  id: "ghost",

  /** HUD label */
  label: "Ghost",

  /**
   * Pale sphere placeholder.
   * @returns {THREE.Mesh}
   */
  create: function () {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 20, 14),
      new THREE.MeshStandardMaterial({
        color: 0xecf0f1,
        transparent: true,
        opacity: 0.55
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
    mesh.position.x = Math.sin(mesh.userData.t * 0.7) * 2.0;
    mesh.position.y = Math.cos(mesh.userData.t * 0.5) * 1.0;
    mesh.material.opacity = 0.25 + Math.abs(Math.sin(mesh.userData.t * 2)) * 0.5;
  },

  /**
   * Called when the player taps the ghost.
   * @returns {string}
   */
  onCatch: function () {
    return "Ghost found!";
  }
};
