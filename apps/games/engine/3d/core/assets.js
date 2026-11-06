/**
 * HEX-2 local GLB/glTF asset manager (Three r170 WebGPU + vendored GLTFLoader).
 * Caches parsed scenes; returns cloned Object3D graphs for safe reuse.
 */
import { Box3, Vector3 } from './three.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';

export function createAssetManager() {
  const loader = new GLTFLoader();
  const cache = new Map(); // url -> Promise<Template>
  let lastError = null;
  let loading = 0;

  function cloneSkinned(src) {
    const map = new Map();
    src.traverse((n) => { if (n.isBone) map.set(n, n.clone()); });
    const clone = src.clone(true);
    // materials / shadows on meshes
    clone.traverse((n) => {
      if (n.isMesh) {
        if (Array.isArray(n.material)) n.material = n.material.map((m) => m.clone());
        else if (n.material) n.material = n.material.clone();
        n.castShadow = true;
        n.receiveShadow = true;
      }
      if (n.isSkinnedMesh && n.skeleton) {
        // keep shared skeleton bindings from clone() — OK for static props
      }
    });
    return clone;
  }

  function normalizeRoot(root, { normalize = true, targetSize = 2 } = {}) {
    root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(root);
    const size = new Vector3(); box.getSize(size);
    const center = new Vector3(); box.getCenter(center);
    if (normalize) {
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const s = targetSize / maxDim;
      root.scale.multiplyScalar(s);
      root.position.sub(center.multiplyScalar(s));
      // sit on y=0
      root.updateMatrixWorld(true);
      const box2 = new Box3().setFromObject(root);
      root.position.y -= box2.min.y;
    }
    root.updateMatrixWorld(true);
    const finalBox = new Box3().setFromObject(root);
    const finalSize = new Vector3(); finalBox.getSize(finalSize);
    return {
      size: finalSize,
      box: finalBox,
      height: finalSize.y
    };
  }

  async function loadTemplate(url) {
    if (cache.has(url)) return cache.get(url);
    const job = (async () => {
      loading++;
      lastError = null;
      try {
        const gltf = await loader.loadAsync(url);
        const root = gltf.scene || gltf.scenes[0];
        if (!root) throw new Error('GLB has no scene: ' + url);
        root.updateMatrixWorld(true);
        const box = new Box3().setFromObject(root);
        const size = new Vector3(); box.getSize(size);
        return { url, scene: root, animations: gltf.animations || [], box, size };
      } catch (e) {
        lastError = e;
        cache.delete(url);
        const err = new Error('Failed to load model: ' + url + ' — ' + (e && e.message ? e.message : e));
        err.cause = e;
        err.code = 'ASSET_LOAD';
        throw err;
      } finally {
        loading = Math.max(0, loading - 1);
      }
    })();
    cache.set(url, job);
    return job;
  }

  /**
   * @param {string} url relative or absolute URL to .glb/.gltf
   * @param {{ normalize?: boolean, targetSize?: number }} [opts]
   * @returns {Promise<{ root: Object3D, meta: { size, box, height, url }, dispose: Function }>}
   */
  async function loadModel(url, opts = {}) {
    const tpl = await loadTemplate(url);
    const root = cloneSkinned(tpl.scene);
    const metaExtra = normalizeRoot(root, opts);
    return {
      root,
      meta: { url, size: metaExtra.size, box: metaExtra.box, height: metaExtra.height, sourceSize: tpl.size.clone() },
      dispose() {
        root.traverse((n) => {
          if (n.isMesh) {
            n.geometry && n.geometry.dispose && n.geometry.dispose();
            const mats = Array.isArray(n.material) ? n.material : [n.material];
            for (const m of mats) m && m.dispose && m.dispose();
          }
        });
      }
    };
  }

  function clearCache() { cache.clear(); }

  return {
    loadModel,
    clearCache,
    get loading() { return loading > 0; },
    get lastError() { return lastError; },
    get cachedCount() { return cache.size; }
  };
}
