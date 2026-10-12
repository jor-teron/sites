/**
 * Browser FPS — asset registry / loader.
 *
 * loadAssets(CONFIG.assets) -> Promise<{ gun, arms, enemy, medkit }>  (each an asset module, see README.md)
 *
 * A slot value is either
 *   'guns/rifle_hq'                                  a built-in code model (assets/<id>.js, default export)
 *   { glb: 'assets/guns/m4.glb', fallback: 'guns/rifle_hq', scale: 1, position: [x,y,z], rotation: [x,y,z] }
 *       a glTF binary loaded with three's GLTFLoader and wrapped in the slot's interface, using the fallback
 *       code model for everything the .glb doesn't provide (anchors, hit zones, animation rig).
 * Any failure (missing file, bad module, network) logs a warning and falls back to the built-in default.
 */
const DEFAULTS = {
  gun: 'guns/rifle_hq',
  arms: 'characters/arms_hq',
  enemy: 'enemies/humanoid_basic',
  medkit: 'pickups/medkit_basic',
};
const KIND = { gun: 'gun', arms: 'arms', enemy: 'enemy', medkit: 'medkit' };
const BASE = new URL('./', import.meta.url);           // .../browser-fps/assets/
const GAME = new URL('../', import.meta.url);          // .../browser-fps/

export const loadLog = [];   // [{ slot, requested, used, error? }] for debugging / tests

async function loadModule(id) {
  if (!/^[\w-]+\/[\w-]+$/.test(id)) throw new Error(`bad asset id "${id}"`);
  const mod = await import(new URL(`${id}.js`, BASE).href);
  const a = mod.default;
  if (!a || typeof a !== 'object') throw new Error(`${id}.js has no default export`);
  return a;
}

let gltfLoader = null;
async function loadGlb(path) {
  if (!gltfLoader) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    gltfLoader = new GLTFLoader();
  }
  const gltf = await gltfLoader.loadAsync(new URL(path, GAME).href);
  return gltf.scene;
}

/** Wrap a loaded glTF scene in the slot interface, borrowing anchors/rig from the fallback module. */
function wrapGlb(slot, scene, fb, spec) {
  const fit = (o) => {
    if (spec.scale) o.scale.multiplyScalar(spec.scale);
    if (spec.position) o.position.fromArray(spec.position);
    if (spec.rotation) o.rotation.fromArray(spec.rotation);
    return o;
  };
  const named = (root, n) => root.getObjectByName(n);
  const name = `glb:${spec.glb}`;
  if (slot === 'gun') {
    return { kind: 'gun', name, build() {
      const base = fb.build();                       // anchors (+ mag) come from the code model…
      const model = fit(scene.clone(true));
      model.updateMatrixWorld(true);
      const anchor = (n, def) => { const o = named(model, n); return o ? o.getWorldPosition(def.clone()) : def; };
      const glbMag = named(model, 'mag');
      base.group.children.forEach((c) => { c.visible = false; });   // …but hide its meshes
      const group = new base.group.constructor();
      group.add(model);
      let mag = base.mag;
      if (glbMag) mag = glbMag; else mag.visible = false;
      return {
        group, mag,
        muzzle: anchor('muzzle', base.muzzle),
        sight: anchor('sight', base.sight),
        hands: { right: anchor('hand_R', base.hands.right), left: anchor('hand_L', base.hands.left) },
      };
    } };
  }
  if (slot === 'arms') {
    return { kind: 'arms', name, build(gun) {
      const model = fit(scene.clone(true));
      const r = named(model, 'arm_R'), l = named(model, 'arm_L');
      const right = r || model, left = l || new model.constructor();
      if (l) left.removeFromParent();
      if (r && r !== model) { r.removeFromParent(); }
      return { right, left };
    } };
  }
  if (slot === 'enemy') {
    return { ...fb, name, createTarget: (s, o = {}) => fb.createTarget(s, { ...o, visual: fit(scene.clone(true)) }) };
  }
  // medkit
  return { kind: 'medkit', name, build() {
    const b = fb.build();
    b.kit.clear();
    b.kit.add(fit(scene.clone(true)));
    return b;
  } };
}

async function loadSlot(slot, spec) {
  const def = DEFAULTS[slot];
  const req = spec || def;
  try {
    if (typeof req === 'string') {
      const a = await loadModule(req);
      if (a.kind !== KIND[slot]) throw new Error(`${req} is a "${a.kind}" asset, slot "${slot}" needs "${KIND[slot]}"`);
      loadLog.push({ slot, requested: req, used: a.name });
      return a;
    }
    if (req && req.glb) {
      let fb;
      try { fb = await loadModule(req.fallback || def); } catch { fb = await loadModule(def); }
      try {
        const scene = await loadGlb(req.glb);
        const a = wrapGlb(slot, scene, fb, req);
        loadLog.push({ slot, requested: req.glb, used: a.name });
        return a;
      } catch (e) {
        console.warn(`[assets] ${slot}: could not load ${req.glb} (${e.message || e}); using ${fb.name}`);
        loadLog.push({ slot, requested: req.glb, used: fb.name, error: String(e.message || e) });
        return fb;
      }
    }
    throw new Error('bad asset spec');
  } catch (e) {
    console.warn(`[assets] ${slot}: ${e.message || e}; using ${def}`);
    const a = await loadModule(def);
    loadLog.push({ slot, requested: JSON.stringify(req), used: a.name, error: String(e.message || e) });
    return a;
  }
}

export async function loadAssets(cfg = {}) {
  const slots = Object.keys(DEFAULTS);
  const mods = await Promise.all(slots.map((s) => loadSlot(s, cfg[s])));
  return Object.fromEntries(slots.map((s, i) => [s, mods[i]]));
}
