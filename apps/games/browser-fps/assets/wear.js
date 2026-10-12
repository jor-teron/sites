/**
 * Small procedural textures shared by the HQ assets: subtle wear/noise for color + roughness maps.
 * Cached per key, drawn once into 128px canvases (cheap on weak phones).
 */
import * as THREE from 'three';

const cache = new Map();

/**
 * @param {string} key   cache key
 * @param {object} o     { base: 0..255 grey, noise, scratches, spots, edge }  (all optional)
 */
export function wearTexture(key, o = {}) {
  if (cache.has(key)) return cache.get(key);
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const base = o.base ?? 235, noise = o.noise ?? 18;
  const img = g.createImageData(S, S);
  let seed = 1234 + key.length * 77;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < S * S; i++) {
    const v = Math.max(0, Math.min(255, base + (rnd() - 0.5) * noise));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // light scratches / scuffs
  g.lineWidth = 1;
  for (let i = 0; i < (o.scratches ?? 10); i++) {
    g.strokeStyle = `rgba(255,255,255,${0.08 + rnd() * 0.12})`;
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI, l = 6 + rnd() * 26;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < (o.spots ?? 6); i++) {
    g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.08})`;
    g.beginPath(); g.arc(rnd() * S, rnd() * S, 3 + rnd() * 10, 0, Math.PI * 2); g.fill();
  }
  // worn edges: lighter border band (box faces are UV-mapped 0..1, so edges line up with mesh edges)
  if (o.edge) {
    g.strokeStyle = `rgba(255,255,255,${o.edge})`; g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, S - 3, S - 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = o.color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  cache.set(key, tex);
  return tex;
}

/** Capsule between two points (fingers, thumbs). */
export function capsule(a, b, r, mat, radial = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(0.0001, dir.length());
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 1, radial), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** Tapered cylinder between two points (wrists, sleeves). */
export function limb(a, b, r0, r1, mat, seg = 10) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, dir.length(), seg, 1, true), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}
