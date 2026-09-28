/*
 * AR Theme Game — Pet theme (default). Multi-pet: Dog / Cat / Chicken /
 * Bunny (CC0 GLBs) + "Ours" (procedural, or assets/models/pet/ours/pet.glb).
 */
import { AR_GAME_CONFIG } from "../../ar-game_config.js";
import { createPetInstance, updatePet, playAnim, disposePetInstance } from "../pets.js";
import { view } from "../ar.js";

/** Half-width of the visible play plane (z=0) minus a margin, capped by config. */
function boundX() {
  const cam = view.camera;
  if (!cam) return O.boundX;
  const halfH = Math.tan((cam.fov * Math.PI) / 360) * cam.position.z;
  return Math.max(0.3, Math.min(O.boundX, halfH * cam.aspect - 0.6));
}

const O = AR_GAME_CONFIG.overlay;
let currentPetId = AR_GAME_CONFIG.defaultPetId;

export const PetTheme = {
  id: "pet",
  label: AR_GAME_CONFIG.themes.pet.label,

  /** Select which pet the next create() builds. */
  setPetId(id) {
    if (AR_GAME_CONFIG.pets[id]) currentPetId = id;
  },
  getPetId() {
    return currentPetId;
  },

  /** Nominal height in theme units (AR scales this to ~25 cm). */
  height() {
    return AR_GAME_CONFIG.pets[currentPetId].preferredHeight;
  },

  create() {
    const root = createPetInstance(currentPetId);
    root.userData.pause = 0;
    root.userData.walkT = 1.5 + Math.random() * 2;
    playAnim(root, "walk");
    // Start off-centre so the first tap isn't free
    root.position.set((Math.random() - 0.5) * boundX(), (Math.random() - 0.5) * O.boundY - 0.5, 0);
    return root;
  },

  /** Overlay mode: bounce around a 2D play plane, pausing now and then. */
  update(root, dt) {
    const u = root.userData;
    if (u.caught) {
      updatePet(root, dt);
      return;
    }
    if (u.pause > 0) {
      u.pause -= dt;
      if (u.pause <= 0) {
        u.walkT = 1.5 + Math.random() * 2.5;
        playAnim(root, "walk");
      }
    } else {
      root.position.x += u.vx * dt;
      root.position.y += u.vz * 0.6 * dt;
      const bx = boundX();
      if (Math.abs(root.position.x) > bx) {
        u.vx = -Math.sign(root.position.x) * Math.abs(u.vx);
        root.position.x = Math.sign(root.position.x) * bx;
      }
      const minY = -O.boundY - 0.5;
      const maxY = O.boundY - 0.8;
      if (root.position.y < minY || root.position.y > maxY) {
        u.vz *= -1;
        root.position.y = Math.min(maxY, Math.max(minY, root.position.y));
      }
      // 3/4 view toward camera, facing travel direction
      root.rotation.y = u.vx > 0 ? Math.PI * 0.3 : -Math.PI * 0.3;
      u.walkT -= dt;
      if (u.walkT <= 0) {
        u.pause = 0.8 + Math.random() * 1.2;
        playAnim(root, "idle");
      }
    }
    updatePet(root, dt);
  },

  /** XR mode: position/heading handled by the XR wanderer; just animate. */
  animate(root, dt, moving) {
    const u = root.userData;
    if (!u.caught) {
      const want = moving ? "walk" : "idle";
      if (u.animState !== want) playAnim(root, want);
    }
    updatePet(root, dt);
  },

  onCatch(root) {
    root.userData.caught = true;
    playAnim(root, "jump");
    if (currentPetId === "ours") return "Caught your pet!";
    return "Caught the " + AR_GAME_CONFIG.pets[currentPetId].label.toLowerCase() + "!";
  },

  dispose(root) {
    disposePetInstance(root);
  },
};
