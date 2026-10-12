/**
 * Browser FPS asset (texture): floor_concrete — 512px concrete tiles with subtle noise, grout lines and wear.
 * Texture interface: default export { kind: 'texture', name, make(renderer, o) -> { map, bumpMap?, bumpScale?, tile: [w, h] } }
 * (tile = world units covered by one texture repeat; see assets/README.md).
 */
import * as THREE from 'three';

/** Small deterministic PRNG so the texture looks the same every load. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * @param {THREE.WebGLRenderer} renderer  used for max anisotropy
 * @param {{size?:number, tiles?:number, base?:string, grout?:string, seed?:number}} [o]
 */
export function makeFloorTexture(renderer, o = {}) {
  const size = o.size || 512;
  const tiles = o.tiles || 4;                 // tiles per texture edge
  const rand = rng(o.seed || 1337);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');

  // Base concrete
  g.fillStyle = o.base || '#8d948a';
  g.fillRect(0, 0, size, size);

  // Per-tile tint variation
  const ts = size / tiles;
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const v = (rand() - 0.5) * 18;
      g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
      g.fillRect(tx * ts, ty * ts, ts, ts);
    }
  }

  // Fine noise (speckles)
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 22;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  // Soft stains / wear blotches
  for (let i = 0; i < 40; i++) {
    const x = rand() * size, y = rand() * size, r = 8 + rand() * 40;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.04 + rand() * 0.06;
    grd.addColorStop(0, `rgba(40,40,35,${a})`);
    grd.addColorStop(1, 'rgba(40,40,35,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Grout lines (drawn on tile edges so the texture wraps seamlessly)
  g.strokeStyle = o.grout || 'rgba(45,48,44,0.85)';
  g.lineWidth = 3;
  for (let i = 0; i <= tiles; i++) {
    const p = Math.round(i * ts);
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
  }
  // Bevel highlight just inside each tile
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 1;
  for (let i = 0; i < tiles; i++) {
    const p = Math.round(i * ts) + 2.5;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

/** o.tileSize = world size of one floor tile (4 tiles per texture repeat). */
export function make(renderer, o = {}) {
  const t = (o.tileSize || 2) * 4;
  return { map: makeFloorTexture(renderer), tile: [t, t], roughness: 0.95 };
}

export default { kind: 'texture', name: 'floor_concrete', make };
