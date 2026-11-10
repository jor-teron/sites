/*
 * Battleship — top-down ship drawings (SHIP-2a). No images: each class has its own silhouette.
 * Local coordinates: bow toward +x, starboard toward +y, in a box of (size × cell) by cell.
 * The renderer rotates that box onto the grid (across or down).
 */
const BSShips = (() => {
  function pal(name, dark, sunk) {
    const sets = {
      Carrier:    dark ? { hull: '#3f4c5a', deck: '#8b9098', edge: '#1f2933', paint: '#e8e2c8', mark: '#1e293b', accent: '#94a3b8', island: '#4b5563', glass: '#93c5fd' }
                       : { hull: '#3e4a56', deck: '#9aa1a9', edge: '#1f2933', paint: '#f4efe0', mark: '#1e293b', accent: '#cbd5e1', island: '#4b5563', glass: '#38bdf8' },
      Battleship: dark ? { hull: '#374151', deck: '#6b7280', edge: '#111827', paint: '#d1d5db', mark: '#111827', accent: '#9ca3af', island: '#4b5563', glass: '#93c5fd' }
                       : { hull: '#2f3a48', deck: '#6b7280', edge: '#111827', paint: '#e5e7eb', mark: '#111827', accent: '#9ca3af', island: '#4b5563', glass: '#7dd3fc' },
      Cruiser:    dark ? { hull: '#1e3a4c', deck: '#3d5a6c', edge: '#0b1c26', paint: '#cbd5e1', mark: '#0f172a', accent: '#64748b', island: '#334155', glass: '#67e8f9' }
                       : { hull: '#1e465a', deck: '#4a6b7c', edge: '#0b1c26', paint: '#e2e8f0', mark: '#0f172a', accent: '#64748b', island: '#334155', glass: '#22d3ee' },
      Submarine:  dark ? { hull: '#18181b', deck: '#27272a', edge: '#09090b', paint: '#a1a1aa', mark: '#09090b', accent: '#52525b', island: '#3f3f46', glass: '#86efac' }
                       : { hull: '#1c1917', deck: '#292524', edge: '#0c0a09', paint: '#d6d3d1', mark: '#0c0a09', accent: '#57534e', island: '#44403c', glass: '#4ade80' },
      Destroyer:  dark ? { hull: '#1e3a5f', deck: '#334e72', edge: '#0b1b33', paint: '#e2e8f0', mark: '#0f172a', accent: '#64748b', island: '#1e3a5f', glass: '#fde68a' }
                       : { hull: '#1e4a7a', deck: '#3b6ea5', edge: '#0b1b33', paint: '#f1f5f9', mark: '#0f172a', accent: '#64748b', island: '#1e3a5f', glass: '#fbbf24' },
    };
    const C = Object.assign({}, sets[name] || sets.Cruiser);
    if (sunk) {
      C.hull = dark ? '#4a1d1d' : '#7f1d1d';
      C.deck = dark ? '#6b2a2a' : '#9b2c2c';
      C.island = dark ? '#3f1717' : '#7f1d1d';
      C.paint = dark ? '#e8b4b4' : '#fecaca';
      C.accent = '#f87171';
      C.edge = '#1c0a0a';
    }
    return C;
  }

  /** Pointed hull. bow / stern are how much of the length tapers; fat is midships width (0–1). */
  function hull(g, L, W, bow, stern, fat) {
    const m = W * (1 - fat) / 2, mid = W / 2;
    g.beginPath();
    g.moveTo(L * 0.02, mid);
    g.quadraticCurveTo(L * bow * 0.45, m * 0.15, L * bow, m);
    g.lineTo(L * (1 - stern), m);
    g.quadraticCurveTo(L * (1 - stern * 0.35), m, L - 1, mid);
    g.quadraticCurveTo(L * (1 - stern * 0.35), W - m, L * (1 - stern), W - m);
    g.lineTo(L * bow, W - m);
    g.quadraticCurveTo(L * bow * 0.45, W - m * 0.15, L * 0.02, mid);
    g.closePath();
  }
  function fillStroke(g, C, lw) {
    g.fillStyle = C.deck; g.fill();
    g.lineWidth = lw; g.strokeStyle = C.edge; g.stroke();
  }
  function oval(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); }
  function rect(g, x, y, w, h, r) {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r);
    else g.rect(x, y, w, h);
  }
  /** Dual-barrel turret, centre at (x, y), guns pointing toward the bow (–x if back is false). */
  function turret(g, x, y, r, C, back) {
    oval(g, x, y, r, r * 0.92); g.fillStyle = C.island; g.fill(); g.strokeStyle = C.edge; g.lineWidth = Math.max(0.8, r * 0.12); g.stroke();
    oval(g, x, y, r * 0.55, r * 0.5); g.fillStyle = C.accent; g.fill();
    const dir = back ? 1 : -1, len = r * 2.1, w = r * 0.22, gap = r * 0.28;
    g.fillStyle = C.mark;
    for (const s of [-1, 1]) {
      g.fillRect(x + dir * r * 0.4, y + s * gap - w / 2, dir * len, w);
    }
  }
  function stack(g, x, y, w, h, C) {
    rect(g, x - w / 2, y - h / 2, w, h, 1);
    g.fillStyle = C.island; g.fill(); g.strokeStyle = C.edge; g.lineWidth = 1; g.stroke();
    g.fillStyle = C.mark; g.fillRect(x - w / 2, y - h / 2, w, h * 0.22);
  }

  function carrier(g, L, W, C) {
    hull(g, L, W, 0.1, 0.06, 0.92); fillStroke(g, C, Math.max(1, W * 0.04));
    // flight-deck edge
    g.fillStyle = C.hull;
    g.fillRect(L * 0.1, W * 0.08, L * 0.82, W * 0.05);
    g.fillRect(L * 0.1, W * 0.87, L * 0.82, W * 0.05);
    // runway centreline
    g.save(); g.strokeStyle = C.paint; g.setLineDash([W * 0.22, W * 0.14]); g.lineWidth = Math.max(1, W * 0.05);
    g.beginPath(); g.moveTo(L * 0.14, W * 0.42); g.lineTo(L * 0.9, W * 0.42); g.stroke(); g.restore();
    // landing chevrons near the stern
    g.fillStyle = C.paint;
    for (let i = 0; i < 4; i++) {
      const x = L * 0.72 + i * W * 0.22;
      g.beginPath(); g.moveTo(x, W * 0.22); g.lineTo(x + W * 0.1, W * 0.42); g.lineTo(x, W * 0.62); g.fill();
    }
    // aircraft elevators
    g.fillStyle = C.accent;
    rect(g, L * 0.28, W * 0.22, W * 0.42, W * 0.4, 1); g.fill();
    rect(g, L * 0.52, W * 0.22, W * 0.42, W * 0.4, 1); g.fill();
    // island on the starboard (lower) side
    const ix = L * 0.58, iw = W * 0.38, ih = W * 0.42, iy = W * 0.52;
    rect(g, ix, iy, iw, ih, 2); g.fillStyle = C.island; g.fill(); g.strokeStyle = C.edge; g.lineWidth = 1; g.stroke();
    rect(g, ix + iw * 0.15, iy + ih * 0.12, iw * 0.7, ih * 0.4, 1); g.fillStyle = C.glass; g.fill();
    stack(g, ix + iw * 0.7, iy + ih * 0.18, iw * 0.28, ih * 0.55, C);
  }

  function battleship(g, L, W, C) {
    hull(g, L, W, 0.16, 0.1, 0.82); fillStroke(g, C, Math.max(1, W * 0.05));
    g.fillStyle = C.hull; g.fillRect(L * 0.18, W * 0.12, L * 0.62, W * 0.08); g.fillRect(L * 0.18, W * 0.8, L * 0.62, W * 0.08);
    const r = W * 0.22;
    turret(g, L * 0.22, W / 2, r, C, false);
    turret(g, L * 0.42, W / 2, r * 0.92, C, false);
    // midships superstructure and mast
    rect(g, L * 0.52, W * 0.22, L * 0.16, W * 0.56, 2); g.fillStyle = C.island; g.fill(); g.strokeStyle = C.edge; g.stroke();
    rect(g, L * 0.54, W * 0.3, L * 0.12, W * 0.22, 1); g.fillStyle = C.glass; g.fill();
    stack(g, L * 0.6, W * 0.28, W * 0.16, W * 0.28, C);
    g.strokeStyle = C.mark; g.lineWidth = 1.2; g.beginPath(); g.moveTo(L * 0.6, W * 0.22); g.lineTo(L * 0.6, W * 0.08); g.stroke();
    turret(g, L * 0.78, W / 2, r * 0.95, C, true);
  }

  function cruiser(g, L, W, C) {
    hull(g, L, W, 0.2, 0.12, 0.7); fillStroke(g, C, Math.max(1, W * 0.05));
    const r = W * 0.18;
    turret(g, L * 0.26, W / 2, r, C, false);
    rect(g, L * 0.4, W * 0.26, L * 0.22, W * 0.48, 2); g.fillStyle = C.island; g.fill(); g.strokeStyle = C.edge; g.stroke();
    rect(g, L * 0.43, W * 0.32, L * 0.1, W * 0.2, 1); g.fillStyle = C.glass; g.fill();
    stack(g, L * 0.56, W * 0.3, W * 0.16, W * 0.3, C);
    turret(g, L * 0.74, W / 2, r * 0.9, C, true);
  }

  function sub(g, L, W, C) {
    // rounded teardrop hull
    g.beginPath();
    g.moveTo(L * 0.04, W / 2);
    g.quadraticCurveTo(L * 0.12, W * 0.12, L * 0.35, W * 0.16);
    g.lineTo(L * 0.78, W * 0.22);
    g.quadraticCurveTo(L * 0.98, W * 0.3, L - 1, W / 2);
    g.quadraticCurveTo(L * 0.98, W * 0.7, L * 0.78, W * 0.78);
    g.lineTo(L * 0.35, W * 0.84);
    g.quadraticCurveTo(L * 0.12, W * 0.88, L * 0.04, W / 2);
    g.closePath();
    g.fillStyle = C.deck; g.fill(); g.lineWidth = Math.max(1, W * 0.05); g.strokeStyle = C.edge; g.stroke();
    // bow planes
    g.fillStyle = C.accent;
    g.fillRect(L * 0.22, W * 0.05, L * 0.1, W * 0.12);
    g.fillRect(L * 0.22, W * 0.83, L * 0.1, W * 0.12);
    // conning tower
    rect(g, L * 0.42, W * 0.28, L * 0.2, W * 0.44, 3); g.fillStyle = C.island; g.fill(); g.strokeStyle = C.edge; g.stroke();
    rect(g, L * 0.46, W * 0.34, L * 0.1, W * 0.16, 1); g.fillStyle = C.glass; g.fill();
    g.strokeStyle = C.mark; g.lineWidth = 1.4; g.beginPath(); g.moveTo(L * 0.58, W * 0.28); g.lineTo(L * 0.58, W * 0.08); g.stroke();
    // propeller hint at the stern
    g.strokeStyle = C.accent; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(L * 0.92, W * 0.32); g.lineTo(L * 0.99, W * 0.2); g.moveTo(L * 0.92, W * 0.68); g.lineTo(L * 0.99, W * 0.8); g.stroke();
  }

  function destroyer(g, L, W, C) {
    hull(g, L, W, 0.28, 0.14, 0.62); fillStroke(g, C, Math.max(1, W * 0.06));
    turret(g, L * 0.34, W / 2, W * 0.16, C, false);
    rect(g, L * 0.48, W * 0.3, L * 0.16, W * 0.4, 1.5); g.fillStyle = C.island; g.fill(); g.strokeStyle = C.edge; g.stroke();
    stack(g, L * 0.62, W * 0.32, W * 0.14, W * 0.26, C);
    g.strokeStyle = C.mark; g.lineWidth = 1; g.beginPath(); g.moveTo(L * 0.56, W * 0.3); g.lineTo(L * 0.56, W * 0.12); g.stroke();
  }

  const DRAW = { Carrier: carrier, Battleship: battleship, Cruiser: cruiser, Submarine: sub, Destroyer: destroyer };

  /**
   * Draw a ship. opt = { cell, x, y, dark, sunk, selected, alpha, preview, ok }.
   * (x, y) is the top-left of the bow cell in canvas pixels.
   */
  function draw(g, sh, opt) {
    if (sh.x < 0 && !opt.loose) return;
    const cell = opt.cell, x = opt.x, y = opt.y;
    g.save();
    if (sh.o === 'h') g.translate(x, y);
    else { g.translate(x + cell, y); g.rotate(Math.PI / 2); }
    if (opt.alpha != null) g.globalAlpha *= opt.alpha;
    const L = sh.size * cell, W = cell, C = pal(sh.name, opt.dark, opt.sunk);
    (DRAW[sh.name] || cruiser)(g, L, W, C);
    if (opt.preview) {
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = 0.4;
      g.fillStyle = opt.ok ? 'rgba(22,163,74,1)' : 'rgba(220,38,38,1)';
      g.fillRect(0, 0, L, W);
    }
    if (opt.selected && !opt.preview) {
      g.globalCompositeOperation = 'source-over';
      hull(g, L, W, sh.name === 'Submarine' ? 0.2 : 0.16, 0.1, sh.name === 'Carrier' ? 0.92 : 0.75);
      g.strokeStyle = '#eab308'; g.lineWidth = Math.max(2, cell * 0.08); g.stroke();
    }
    g.restore();
  }

  return { draw, pal };
})();
