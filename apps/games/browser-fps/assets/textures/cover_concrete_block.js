/**
 * Browser FPS asset (texture): cover_concrete_block — cast concrete barrier blocks: light grey panels with
 * recessed seams, bolt holes, chips and stains, plus a bump map. One repeat = 1 x 1 world unit
 * (2 x 2 blocks of 0.5). The per-cover colour from the config tints it lightly.
 */
import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function make(renderer) {
  const S = 256, n = 2, bs = S / n;
  const c = document.createElement('canvas'), b = document.createElement('canvas');
  c.width = c.height = b.width = b.height = S;
  const g = c.getContext('2d'), h = b.getContext('2d');
  const rand = rng(777);
  g.fillStyle = '#b9b6ad'; g.fillRect(0, 0, S, S);
  h.fillStyle = '#c8c8c8'; h.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) { const v = (rand() - 0.5) * 26; img.data[i] += v; img.data[i + 1] += v; img.data[i + 2] += v; }
  g.putImageData(img, 0, 0);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = i * bs, y = j * bs, t = (rand() - 0.5) * 20;
    g.fillStyle = `rgba(${t > 0 ? 255 : 0},${t > 0 ? 255 : 0},${t > 0 ? 255 : 0},${Math.abs(t) / 255})`;
    g.fillRect(x, y, bs, bs);
    // bolt / lifting holes
    for (const [u, v] of [[0.25, 0.25], [0.75, 0.75]]) {
      g.fillStyle = 'rgba(40,40,38,0.7)'; g.beginPath(); g.arc(x + u * bs, y + v * bs, 4, 0, 7); g.fill();
      h.fillStyle = '#303030'; h.beginPath(); h.arc(x + u * bs, y + v * bs, 4, 0, 7); h.fill();
    }
    // chips + stains
    for (let k = 0; k < 6; k++) {
      const px = x + rand() * bs, py = y + rand() * bs, r = 2 + rand() * 6;
      g.fillStyle = 'rgba(90,88,80,0.4)'; g.beginPath(); g.arc(px, py, r, 0, 7); g.fill();
      h.fillStyle = 'rgba(60,60,60,0.6)'; h.beginPath(); h.arc(px, py, r, 0, 7); h.fill();
    }
  }
  // recessed seams (on tile edges so it wraps)
  g.strokeStyle = 'rgba(55,55,50,0.85)'; h.strokeStyle = '#101010'; g.lineWidth = h.lineWidth = 4;
  for (let i = 0; i <= n; i++) {
    const p = i * bs;
    for (const ctx of [g, h]) { ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke(); }
  }
  const prep = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return t;
  };
  return { map: prep(c, true), bumpMap: prep(b, false), bumpScale: 2, tile: [1, 1], roughness: 0.92, tint: 0.4 };
}

export default { kind: 'texture', name: 'cover_concrete_block', make };
