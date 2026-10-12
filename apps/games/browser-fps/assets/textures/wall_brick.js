/**
 * Browser FPS asset (texture): wall_brick — reddish-brown staggered bricks, grey mortar,
 * per-brick colour variation + wear, with a matching bump map so light catches the mortar joints.
 * One repeat = 8 rows x 4 bricks = 2 x 2 world units (bricks 0.5 x 0.25), so walls never stretch.
 */
import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function make(renderer) {
  const S = 512, rows = 8, cols = 4, bw = S / cols, bh = S / rows, m = 5;   // mortar px
  const c = document.createElement('canvas'), b = document.createElement('canvas');
  c.width = c.height = b.width = b.height = S;
  const g = c.getContext('2d'), h = b.getContext('2d');
  const rand = rng(4242);
  g.fillStyle = '#8b8a85'; g.fillRect(0, 0, S, S);          // mortar
  h.fillStyle = '#202020'; h.fillRect(0, 0, S, S);          // mortar = low in the bump map
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * bw / 2;
    for (let k = -1; k < cols; k++) {
      const x = k * bw + off + m / 2, y = r * bh + m / 2, w = bw - m, hh = bh - m;
      const hue = 8 + rand() * 14, sat = 38 + rand() * 22, lit = 30 + rand() * 14;
      g.fillStyle = `hsl(${hue},${sat}%,${lit}%)`;
      g.fillRect(x, y, w, hh);
      // darker lower edge / lighter top edge for a little depth
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, y + hh - 3, w, 3);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, y, w, 2);
      const bv = 190 + rand() * 50;
      h.fillStyle = `rgb(${bv},${bv},${bv})`; h.fillRect(x, y, w, hh);
      // wear: chips + speckles
      for (let i = 0; i < 14; i++) {
        const px = x + rand() * w, py = y + rand() * hh, s = 1 + rand() * 3;
        const dark = rand() < 0.6;
        g.fillStyle = dark ? 'rgba(30,15,10,0.35)' : 'rgba(220,180,150,0.18)';
        g.fillRect(px, py, s, s);
        h.fillStyle = dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.3)';
        h.fillRect(px, py, s, s);
      }
      if (rand() < 0.25) {      // chipped corner
        const cx = rand() < 0.5 ? x : x + w - 8, cy = rand() < 0.5 ? y : y + hh - 6;
        g.fillStyle = '#7d7a74'; g.fillRect(cx, cy, 8, 6);
        h.fillStyle = '#404040'; h.fillRect(cx, cy, 8, 6);
      }
    }
  }
  // grime streaks
  for (let i = 0; i < 18; i++) {
    const x = rand() * S, grd = g.createLinearGradient(0, S * 0.6, 0, S);
    grd.addColorStop(0, 'rgba(20,18,15,0)'); grd.addColorStop(1, 'rgba(20,18,15,0.12)');
    g.fillStyle = grd; g.fillRect(x, S * 0.6, 6 + rand() * 20, S * 0.4);
  }
  const prep = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  };
  return { map: prep(c, true), bumpMap: prep(b, false), bumpScale: 3, tile: [2, 2], roughness: 0.9 };
}

export default { kind: 'texture', name: 'wall_brick', make };
