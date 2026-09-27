/*
 * AR Theme Game — Pet theme (default)
 * Chase a bouncing placeholder animal. Tap it to score.
 * Header: themes/pet.js
 */

/**
 * Pet theme definition used by the engine.
 */
const PetTheme = {
  /** Theme id used by the loader */
  id: "pet",

  /** HUD label */
  label: "Pet",

  /**
   * Build the placeholder pet mesh (orange sphere + ears).
   * @returns {THREE.Group}
   */
  create: function () {
    const group = new THREE.Group();

    // Body
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xe67e22 })
    );
    group.add(body);

    // Left ear
    const earGeo = new THREE.ConeGeometry(0.18, 0.35, 8);
    const earMat = new THREE.MeshStandardMaterial({ color: 0xd35400 });
    const earL = new THREE.Mesh(earGeo, earMat);
    earL.position.set(-0.28, 0.55, 0);
    group.add(earL);

    // Right ear
    const earR = new THREE.Mesh(earGeo, earMat);
    earR.position.set(0.28, 0.55, 0);
    group.add(earR);

    // Start slightly off-center
    group.position.set(0, 0, 0);

    // Motion state stored on the group
    group.userData.vx = 1.4;
    group.userData.vy = 1.1;
    return group;
  },

  /**
   * Bounce the pet inside a 2D plane in front of the camera.
   * @param {THREE.Object3D} mesh
   * @param {number} dt
   */
  update: function (mesh, dt) {
    // Horizontal / vertical speed
    mesh.position.x += mesh.userData.vx * dt;
    mesh.position.y += mesh.userData.vy * dt;

    // Bounce off invisible walls
    if (Math.abs(mesh.position.x) > 2.4) {
      mesh.userData.vx *= -1;
      mesh.position.x = Math.sign(mesh.position.x) * 2.4;
    }
    if (Math.abs(mesh.position.y) > 1.6) {
      mesh.userData.vy *= -1;
      mesh.position.y = Math.sign(mesh.position.y) * 1.6;
    }

    // Small spin so it feels alive
    mesh.rotation.y += dt * 2;
  },

  /**
   * Called when the player taps the pet.
   * @returns {string} short HUD flash text
   */
  onCatch: function () {
    return "Caught the pet!";
  }
};
