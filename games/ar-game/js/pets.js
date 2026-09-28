/*
 * Pet roster: GLB loading (cached), SkeletonUtils cloning, AnimationMixer,
 * and a procedural cartoon pet used as the default "Ours" slot and as the
 * loading / failure fallback for every GLB pet.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { AR_GAME_CONFIG } from "../ar-game_config.js";

const loader = new GLTFLoader();

/** @type {Map<string, {scene: THREE.Object3D, clips: THREE.AnimationClip[], height: number}>} */
const glbCache = new Map();

/** Paths we already know are missing (404) — skip refetching. */
const missingGlb = new Set();

const IDLE_NAMES = ["idle", "idle_2", "idle_2_headlow", "idle_headlow", "frog_idle"];
const WALK_NAMES = ["walk", "run", "gallop"];
const JUMP_NAMES = ["jump", "jump_loop", "jump_start", "gallop_jump", "jump_toidle", "frog_jump"];

/**
 * Match a clip by short name (after last '|'), case-insensitive.
 * @param {THREE.AnimationClip[]} clips
 * @param {string[]} candidates
 * @returns {THREE.AnimationClip|null}
 */
function findClip(clips, candidates) {
  const lower = candidates.map((c) => c.toLowerCase());
  for (const want of lower) {
    const hit = clips.find((clip) => {
      const short = clip.name.split("|").pop().toLowerCase();
      return short === want;
    });
    if (hit) return hit;
  }
  // Fuzzy: name contains the candidate
  for (const want of lower) {
    const hit = clips.find((clip) => {
      const short = clip.name.split("|").pop().toLowerCase();
      return short.includes(want);
    });
    if (hit) return hit;
  }
  return null;
}

/**
 * Precise world-space bounds (applies bone transforms for skinned meshes).
 * @param {THREE.Object3D} obj
 */
function preciseBox(obj) {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj, true);
}

/**
 * Bounding-box height of an object (precise, skinning-aware).
 * @param {THREE.Object3D} obj
 */
function measureHeight(obj) {
  const box = preciseBox(obj);
  if (box.isEmpty()) return 1;
  return Math.max(0.001, box.max.y - box.min.y);
}

/**
 * Scale an object so its height matches `targetHeight`, centre it on x/z
 * and sit its feet on y=0 (in its parent's space).
 * @param {THREE.Object3D} obj  (not yet parented)
 * @param {number} targetHeight
 */
function fitHeight(obj, targetHeight) {
  obj.position.set(0, 0, 0);
  obj.scale.setScalar(1);
  const h = measureHeight(obj);
  obj.scale.setScalar(targetHeight / h);
  const box = preciseBox(obj);
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  obj.position.set(-cx, -box.min.y, -cz);
}

/**
 * Build the procedural cartoon pet (body, head, eyes with blink, ears,
 * wagging tail). Used for "Ours" and as a GLB loading/failure fallback.
 * @returns {THREE.Group}
 */
export function createProceduralPet() {
  const root = new THREE.Group();
  root.name = "procedural-pet";
  root.userData.ownedAssets = true; // safe to dispose geometries/materials

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.4 });
  const earMat = new THREE.MeshStandardMaterial({ color: 0xd35400 });
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const eyePupil = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const noseMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 16), bodyMat);
  body.position.y = 0.45;
  body.name = "body";
  root.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), bodyMat);
  head.position.set(0, 0.95, 0.15);
  head.name = "head";
  root.add(head);

  const earGeo = new THREE.ConeGeometry(0.12, 0.28, 8);
  const earL = new THREE.Mesh(earGeo, earMat);
  earL.position.set(-0.18, 1.18, 0.05);
  earL.rotation.z = 0.35;
  root.add(earL);
  const earR = new THREE.Mesh(earGeo, earMat);
  earR.position.set(0.18, 1.18, 0.05);
  earR.rotation.z = -0.35;
  root.add(earR);

  function makeEye(x) {
    const g = new THREE.Group();
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), eyeWhite);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), eyePupil);
    pupil.position.z = 0.05;
    g.add(white, pupil);
    g.position.set(x, 0.98, 0.38);
    g.userData.white = white;
    return g;
  }
  const eyeL = makeEye(-0.1);
  const eyeR = makeEye(0.1);
  root.add(eyeL, eyeR);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), noseMat);
  nose.position.set(0, 0.9, 0.42);
  root.add(nose);

  // Tail: a few spheres in a chain for a wag
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xd35400 });
  const tail = new THREE.Group();
  tail.position.set(0, 0.5, -0.4);
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(0.07 - i * 0.01, 10, 8), tailMat);
    seg.position.set(0, 0.05 * i, -0.12 * (i + 1));
    tail.add(seg);
  }
  root.add(tail);

  root.userData.procedural = {
    body,
    head,
    eyeL,
    eyeR,
    tail,
    blinkT: 0,
    nextBlink: 2 + Math.random() * 3,
  };

  // Feet on y=0 already (body centre at 0.45, radius 0.45)
  return root;
}

/**
 * Drive the procedural pet's blink / wag / hop.
 * @param {THREE.Object3D} root
 * @param {number} dt
 * @param {"idle"|"walk"|"jump"} state
 */
function updateProcedural(root, dt, state) {
  const p = root.userData.procedural;
  if (!p) return;
  p.blinkT += dt;
  if (p.blinkT > p.nextBlink) {
    // Quick blink
    const phase = Math.min(1, (p.blinkT - p.nextBlink) / 0.12);
    const scaleY = phase < 0.5 ? 1 - phase * 2 : (phase - 0.5) * 2;
    p.eyeL.scale.y = Math.max(0.05, scaleY);
    p.eyeR.scale.y = Math.max(0.05, scaleY);
    if (phase >= 1) {
      p.blinkT = 0;
      p.nextBlink = 2 + Math.random() * 3;
      p.eyeL.scale.y = 1;
      p.eyeR.scale.y = 1;
    }
  }
  // Wag
  p.tail.rotation.y = Math.sin(performance.now() * 0.012) * 0.6;
  // Squash / hop while walking
  const t = performance.now() * 0.001;
  if (state === "walk") {
    const hop = Math.abs(Math.sin(t * 8));
    p.body.scale.set(1 + hop * 0.05, 1 - hop * 0.08, 1 + hop * 0.05);
    root.position.y = (root.userData.baseY || 0) + hop * 0.08 * root.scale.y;
  } else if (state === "jump") {
    const hop = Math.abs(Math.sin(t * 10));
    p.body.scale.set(1 - hop * 0.1, 1 + hop * 0.2, 1 - hop * 0.1);
    root.position.y = (root.userData.baseY || 0) + hop * 0.25 * root.scale.y;
  } else {
    p.body.scale.set(1, 1, 1);
    root.position.y = root.userData.baseY || 0;
    // gentle breathe
    p.head.position.y = 0.95 + Math.sin(t * 2) * 0.02;
  }
}

/**
 * Fetch + parse a GLB once. Returns null on failure (404 / parse).
 * @param {string} url
 */
async function loadGlb(url) {
  if (missingGlb.has(url)) return null;
  if (glbCache.has(url)) return glbCache.get(url);
  try {
    // Probe first so a missing optional file (ours/pet.glb) does not log a
    // Three.js / network error — we fall back to the procedural pet quietly.
    let head = await fetch(url, { method: "HEAD" });
    if (head.status === 405 || head.status === 501) head = await fetch(url, { method: "GET" });
    if (!head.ok) {
      missingGlb.add(url);
      return null;
    }
    const gltf = await loader.loadAsync(url);
    const height = measureHeight(gltf.scene);
    const entry = { scene: gltf.scene, clips: gltf.animations || [], height };
    glbCache.set(url, entry);
    return entry;
  } catch (err) {
    console.warn("[ar-game] GLB load failed:", url, err && err.message ? err.message : err);
    missingGlb.add(url);
    return null;
  }
}

/**
 * Prefetch every pet GLB that has a path (fire-and-forget).
 * "ours/pet.glb" may 404 — that is expected until the user adds one.
 */
export function prefetchPets() {
  const pets = AR_GAME_CONFIG.pets;
  Object.values(pets).forEach((p) => {
    // "ours" is optional (user-supplied) — load lazily only when chosen
    if (p.glb && p.id !== "ours") loadGlb(p.glb);
  });
}

/**
 * Create a live pet instance for the given pet id.
 * Returns immediately with a procedural stand-in; swaps in the GLB when ready.
 *
 * The returned Group carries:
 *   userData.petId, userData.mixer, userData.actions, userData.animState,
 *   userData.ownedAssets (true for procedural parts), userData.sharedAssets
 *
 * @param {string} petId
 * @param {{ height?: number }} [opts]  target height in world units
 * @returns {THREE.Group}
 */
export function createPetInstance(petId, opts = {}) {
  const def = AR_GAME_CONFIG.pets[petId] || AR_GAME_CONFIG.pets.ours;
  const targetH = opts.height != null ? opts.height : def.preferredHeight;

  const root = new THREE.Group();
  root.name = "pet:" + def.id;
  root.userData.petId = def.id;
  root.userData.animState = "idle";
  root.userData.mixer = null;
  root.userData.actions = null;
  root.userData.baseY = 0;
  root.userData.vx = (Math.random() > 0.5 ? 1 : -1) * AR_GAME_CONFIG.overlay.petSpeed;
  root.userData.vz = (Math.random() > 0.5 ? 1 : -1) * AR_GAME_CONFIG.overlay.petSpeed * 0.7;

  // Always start with procedural so something is visible while GLB loads
  const standIn = createProceduralPet();
  fitHeight(standIn, targetH);
  standIn.userData.baseY = standIn.position.y;
  root.add(standIn);
  root.userData.standIn = standIn;

  // Kick off GLB load when a path is configured
  if (def.glb) {
    loadGlb(def.glb).then((entry) => {
      if (!entry) return; // keep procedural
      if (root.userData.petId !== def.id) return; // pet switched away
      swapInGlb(root, entry, targetH);
    });
  }

  return root;
}

/**
 * Replace the procedural stand-in with a skinned clone of the cached GLB.
 * @param {THREE.Group} root
 * @param {{scene: THREE.Object3D, clips: THREE.AnimationClip[], height: number}} entry
 * @param {number} targetH
 */
function swapInGlb(root, entry, targetH) {
  // Remove + dispose procedural stand-in
  if (root.userData.standIn) {
    root.remove(root.userData.standIn);
    disposeOwned(root.userData.standIn);
    root.userData.standIn = null;
  }

  const model = cloneSkinned(entry.scene);
  model.userData.sharedAssets = true; // geometries/materials shared with cache — do NOT dispose
  fitHeight(model, targetH);
  // Quaternius animals face +Z (toward the overlay camera); heading is set on root.
  root.add(model);
  root.userData.model = model;

  if (entry.clips.length) {
    const mixer = new THREE.AnimationMixer(model);
    const idle = findClip(entry.clips, IDLE_NAMES);
    const walk = findClip(entry.clips, WALK_NAMES);
    const jump = findClip(entry.clips, JUMP_NAMES);
    const actions = {
      idle: idle ? mixer.clipAction(idle) : null,
      walk: walk ? mixer.clipAction(walk) : null,
      jump: jump ? mixer.clipAction(jump) : null,
    };
    root.userData.mixer = mixer;
    root.userData.actions = actions;
    playAnim(root, root.userData.animState || "idle"); // keep current state (walk/idle/jump)
  }
}

/**
 * Cross-fade to an animation state on a pet instance.
 * @param {THREE.Object3D} root
 * @param {"idle"|"walk"|"jump"} state
 */
export function playAnim(root, state) {
  root.userData.animState = state;
  const actions = root.userData.actions;
  if (!actions) return;
  const next = actions[state] || actions.idle;
  if (!next) return;
  Object.keys(actions).forEach((k) => {
    const a = actions[k];
    if (!a || a === next) return;
    if (a.isRunning()) a.fadeOut(0.2);
  });
  next.reset().setEffectiveWeight(1).fadeIn(0.2).play();
  if (state === "jump") {
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
  } else {
    next.setLoop(THREE.LoopRepeat, Infinity);
  }
}

/**
 * Per-frame update for a pet instance (mixer + procedural motion).
 * @param {THREE.Object3D} root
 * @param {number} dt
 */
export function updatePet(root, dt) {
  if (root.userData.mixer) {
    root.userData.mixer.update(dt);
  }
  if (root.userData.standIn) {
    updateProcedural(root.userData.standIn, dt, root.userData.animState || "idle");
  }
}

/**
 * Dispose geometries/materials only when we own them (procedural).
 * Shared GLB assets are left alone so the cache stays valid.
 * Always stops the mixer.
 * @param {THREE.Object3D} root
 */
export function disposePetInstance(root) {
  if (root.userData.mixer) {
    root.userData.mixer.stopAllAction();
    root.userData.mixer.uncacheRoot(root.userData.model || root);
    root.userData.mixer = null;
  }
  // Each SkeletonUtils clone owns a new Skeleton whose bone texture the renderer
  // creates on demand; free it (geometry/materials stay shared with the cache).
  if (root.userData.model) {
    root.userData.model.traverse((obj) => {
      if (obj.isSkinnedMesh && obj.skeleton) obj.skeleton.dispose();
    });
  }
  disposeOwned(root); // skips subtrees marked sharedAssets (cached GLB clone)
  root.userData.standIn = null;
  root.userData.model = null;
  root.userData.actions = null;
}

/**
 * Free GPU resources for an object we created in code.
 * @param {THREE.Object3D} root
 */
function disposeOwned(root) {
  const seen = new Set();
  function once(res) {
    if (res && !seen.has(res) && typeof res.dispose === "function") {
      seen.add(res);
      res.dispose();
    }
  }
  (function walk(obj) {
    // Cached GLB clones share geometry/materials/textures with the cache: skip whole subtree
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

/**
 * Read the last-chosen pet id from localStorage (fallback: default).
 */
export function loadSavedPetId() {
  try {
    const id = localStorage.getItem(AR_GAME_CONFIG.petStorageKey);
    if (id && AR_GAME_CONFIG.pets[id]) return id;
  } catch (_) { /* ignore */ }
  return AR_GAME_CONFIG.defaultPetId;
}

/**
 * Persist the chosen pet id.
 * @param {string} id
 */
export function savePetId(id) {
  try {
    localStorage.setItem(AR_GAME_CONFIG.petStorageKey, id);
  } catch (_) { /* ignore */ }
}
