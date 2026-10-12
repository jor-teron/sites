/**
 * Browser FPS asset (texture): island_ground — neutral grain / speckle detail, multiplied over the terrain's
 * vertex colours (sand, wet sand, grass, forest floor). Texture interface: see floor_concrete.js.
 */
import * as THREE from 'three';
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function make(renderer, o = {}) {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), r = rng(7);
  g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 2600; i++) {            // grains / pebbles
    const v = 170 + Math.floor(r() * 85), s = 1 + r() * 2.2;
    g.fillStyle = `rgba(${v},${v},${v},${0.35 + r() * 0.4})`;
    g.fillRect(r() * N, r() * N, s, s);
  }
  for (let i = 0; i < 260; i++) {             // grass blades / twigs
    const x = r() * N, y = r() * N, a = r() * 6.28, l = 3 + r() * 6;
    g.strokeStyle = `rgba(150,150,150,${0.25 + r() * 0.3})`; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return { map, tile: [3, 3], roughness: 0.95 };
}
export default { kind: 'texture', name: 'island_ground', make };
