/* SNK-T1: visual-only renderer. No simulation state, random calls or collision shapes.
 * Backgrounds are cached by size; food/wall stamps by cell size. Motion effects freeze
 * under prefers-reduced-motion. */
window.SnakeThemes = (() => {
  'use strict';
  const mono = '"Courier New", monospace', sans = 'system-ui, sans-serif';
  const definitions = [
    ['nokia', 'Classic Nokia', '#1c1e16', '#9ea82a', '#d8e08a', '#c6d24a', '#b8c46a', '#1a1f08', '#1a1f08', '#2a3210', '#1a1f08', '#2a2e20', mono, 'pixel', 'dark'],
    ['arcade', 'Retro Arcade', '#07080f', '#10121c', '#f4f7ff', '#39ff14', '#8a93b8', '#ffe14a', '#39ff14', '#148a3c', '#ff3b5c', '#33aaff', mono, 'pixel', 'dark'],
    ['gameboy', 'Game Boy', '#2c2c28', '#9bbc0f', '#d8e07a', '#0f380f', '#c6d66a', '#0f380f', '#306230', '#0f380f', '#0f380f', '#0f380f', mono, 'pixel', 'dark'],
    ['neon', 'Neon Synthwave', '#12081f', '#1a0b33', '#f6c8ff', '#54eeff', '#c9a0e8', '#ff5bce', '#7a5bff', '#31207a', '#ffe38a', '#ff5bce', sans, 'neon', 'dark'],
    ['garden', 'Garden Grass', '#d7ecf4', '#5fa04a', '#1d3b1a', '#3d7a28', '#3d5a30', '#f3f0c8', '#2f7a38', '#1e5a28', '#d62828', '#6b4226', sans, 'nature', 'light'],
    ['desert', 'Desert Sand', '#f3d9a4', '#edc878', '#5a2e12', '#c45c26', '#7a4a1c', '#8a3b14', '#c45c26', '#a86b32', '#e25822', '#8a5a28', sans, 'nature', 'light'],
    ['jungle', 'Jungle', '#08140c', '#14331a', '#d6f0c8', '#7dff6a', '#8fbf80', '#d6e05a', '#2f8a3a', '#145022', '#c44ac6', '#2a5a20', sans, 'nature', 'dark'],
    ['ocean', 'Ocean Reef', '#012033', '#045c7a', '#d8f6ff', '#6cdff1', '#9ad4e4', '#bafff0', '#1c8aa8', '#1a6a88', '#f4d578', '#e07a6a', sans, 'ocean', 'dark'],
    ['flat', 'Minimal Flat', '#f3f5fc', '#e6eaf6', '#394268', '#3d9a6a', '#5c6478', '#2f8a5a', '#5bb887', '#8fd4ad', '#e45a5a', '#c9d0e0', sans, 'flat', 'light'],
    ['paper', 'Paper Sketch', '#faf6e9', '#f7f1dc', '#3e4b59', '#3e4b59', '#6a7380', '#3e4b59', '#dfe6dc', '#eef0e6', '#b04a3a', '#3e4b59', '"Comic Sans MS", cursive', 'sketch', 'light']
  ];
  const themes = definitions.map(([id, name, bg, board, ink, accent, muted, head, body, tail, food, wall, font, style, scheme]) => ({
    id, name, bg, board, ink, accent, muted, head, body, tail, food, wall, font, style, scheme, glow: id === 'neon', cache: new Map()
  }));
  const get = id => themes.find(t => t.id === id) || themes[0];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const surface = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const bit = n => ((Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) ^ 0x27d4eb2d) >>> 0) / 4294967296;
  const mix = (a, b, t) => {
    const n = s => parseInt(s.slice(1), 16), A = n(a), B = n(b), ch = (s, i) => (s >> (16 - 8 * i)) & 255;
    const h = i => Math.round(ch(A, i) + (ch(B, i) - ch(A, i)) * t).toString(16).padStart(2, '0');
    return `#${h(0)}${h(1)}${h(2)}`;
  };
  function rr(c, x, y, w, h, r) {
    const rad = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath(); c.moveTo(x + rad, y);
    c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad);
    c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath();
  }
  function ellipse(c, x, y, rx, ry, fill = true) {
    c.beginPath(); c.ellipse(x, y, Math.max(.4, rx), Math.max(.4, ry), 0, 0, Math.PI * 2); fill ? c.fill() : c.stroke();
  }
  function line(c, pts) { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); }

  function decorate(c, t, W, H, ox, oy, bw, bh, cell) {
    if (t.id === 'nokia' || t.id === 'gameboy') {
      c.fillStyle = t.id === 'nokia' ? '#2a2e20' : '#3a3a34';
      c.fillRect(ox - 10, oy - 10, bw + 20, bh + 20);
      c.fillStyle = t.board; c.fillRect(ox, oy, bw, bh);
      c.strokeStyle = t.id === 'nokia' ? '#6d7420' : '#8bac0f'; c.lineWidth = 1;
      for (let x = 0; x <= bw; x += cell) line(c, [[ox + x + .5, oy], [ox + x + .5, oy + bh]]);
      for (let y = 0; y <= bh; y += cell) line(c, [[ox, oy + y + .5], [ox + bw, oy + y + .5]]);
    } else if (t.id === 'arcade') {
      c.fillStyle = '#39ff1408'; c.fillRect(ox, oy, bw, bh / 3);
      c.fillStyle = '#ffe14a08'; c.fillRect(ox, oy + bh / 3, bw, bh / 3);
      c.strokeStyle = '#39ff1422'; c.lineWidth = 1;
      for (let x = 0; x <= bw; x += cell) line(c, [[ox + x + .5, oy], [ox + x + .5, oy + bh]]);
      for (let y = 0; y <= bh; y += cell) line(c, [[ox, oy + y + .5], [ox + bw, oy + y + .5]]);
    } else if (t.id === 'neon') {
      const g = c.createLinearGradient(ox, oy, ox, oy + bh);
      g.addColorStop(0, '#2a1060'); g.addColorStop(1, t.board); c.fillStyle = g; c.fillRect(ox, oy, bw, bh);
      c.strokeStyle = '#ff5bce22'; c.lineWidth = 1;
      for (let x = 0; x <= bw; x += cell) line(c, [[ox + x + .5, oy], [ox + x + .5, oy + bh]]);
      for (let y = 0; y <= bh; y += cell) line(c, [[ox, oy + y + .5], [ox + bw, oy + y + .5]]);
    } else if (t.id === 'garden') {
      c.fillStyle = '#6aaf52';
      for (let i = 0; i < 90; i++) {
        const x = ox + bit(i * 19) * bw, y = oy + bit(i * 37 + 3) * bh, h = 4 + bit(i * 11) * 8;
        c.fillRect(x, y, 1.2, h); c.fillStyle = i % 3 ? '#6aaf52' : '#8bc86a';
      }
      c.fillStyle = '#e8d14a';
      for (let i = 0; i < 14; i++) ellipse(c, ox + bit(i * 53) * bw, oy + bit(i * 71 + 5) * bh, 2, 2);
    } else if (t.id === 'desert') {
      c.fillStyle = '#e8c56a';
      for (let i = 0; i < 5; i++) {
        const y = oy + bh * (0.2 + i * 0.16);
        c.beginPath(); c.moveTo(ox, y);
        for (let x = 0; x <= bw; x += 12) c.quadraticCurveTo(ox + x + 6, y - 8 - bit(i * 9 + x) * 8, ox + x + 12, y);
        c.strokeStyle = '#d4a44c88'; c.lineWidth = 2; c.stroke();
      }
      c.fillStyle = '#d4a44c';
      for (let i = 0; i < 40; i++) c.fillRect(ox + bit(i * 17) * bw, oy + bit(i * 29 + 2) * bh, 1.5, 1.5);
    } else if (t.id === 'jungle') {
      c.fillStyle = '#0c2412'; c.fillRect(ox, oy, bw, bh * .18);
      c.fillStyle = '#1c5a28aa';
      for (let i = 0; i < 24; i++) {
        const x = ox + bit(i * 13) * bw, y = oy + bit(i * 23) * bh * .6;
        c.beginPath(); c.ellipse(x, y, 10 + bit(i) * 14, 5 + bit(i + 2) * 8, bit(i + 4) * 2, 0, 7); c.fill();
      }
      c.strokeStyle = '#3a7a3088'; c.lineWidth = 2;
      for (let i = 0; i < 6; i++) line(c, [[ox + 8 + i * (bw / 6), oy], [ox + bit(i * 41) * bw, oy + bh]]);
    } else if (t.id === 'ocean') {
      const g = c.createLinearGradient(ox, oy, ox, oy + bh);
      g.addColorStop(0, '#1a8aad'); g.addColorStop(1, '#01314a'); c.fillStyle = g; c.fillRect(ox, oy, bw, bh);
      c.strokeStyle = '#83e8ff18'; c.lineWidth = 6;
      for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(ox + bw * bit(i * 8), oy + bh * bit(i * 15 + 1), 30 + i * 8, 10 + i * 3, 0, 0, 7); c.stroke(); }
    } else if (t.id === 'flat') {
      c.strokeStyle = '#dce1f1'; c.lineWidth = 1;
      for (let x = cell; x < bw; x += cell) for (let y = cell; y < bh; y += cell) { c.beginPath(); c.arc(ox + x, oy + y, .7, 0, 7); c.stroke(); }
    } else if (t.id === 'paper') {
      c.strokeStyle = '#b6cadd'; c.lineWidth = .7;
      for (let y = cell; y < bh; y += cell) line(c, [[ox, oy + y], [ox + bw, oy + y]]);
      c.strokeStyle = '#d49f9f'; line(c, [[ox + 10, oy], [ox + 10, oy + bh]]);
    }
  }

  function backdrop(t, W, H, ox, oy, bw, bh, cell) {
    const key = `bg:${W}x${H}:${ox},${oy},${cell}`;
    if (t.cache.has(key)) return t.cache.get(key);
    const image = surface(W, H), c = image.getContext('2d');
    c.fillStyle = t.bg; c.fillRect(0, 0, W, H);
    if (t.id === 'garden') {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#b8dcf0'); g.addColorStop(1, '#d7ecf4'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    } else if (t.id === 'desert') {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#f7c56a'); g.addColorStop(.45, '#f3d9a4'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      if (oy > 28) { const r = Math.min(22, oy * 0.35); c.fillStyle = '#f0b84a'; ellipse(c, 44, oy / 2, r, r); }
    } else if (t.id === 'neon') {
      const g = c.createRadialGradient(W / 2, H, 20, W / 2, H, H); g.addColorStop(0, '#ff5bce22'); g.addColorStop(1, t.bg); c.fillStyle = g; c.fillRect(0, 0, W, H);
    } else if (t.id === 'arcade') {
      c.fillStyle = '#000'; for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
    } else if (t.id === 'ocean') {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#02465f'); g.addColorStop(1, '#011018'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    } else if (t.id === 'jungle') {
      const g = c.createLinearGradient(0, 0, 0, 80); g.addColorStop(0, '#051008'); g.addColorStop(1, t.bg); c.fillStyle = g; c.fillRect(0, 0, W, 80);
    }
    c.fillStyle = t.board; c.fillRect(ox, oy, bw, bh);
    decorate(c, t, W, H, ox, oy, bw, bh, cell);
    t.cache.set(key, image); return image;
  }

  function walls(c, t, ox, oy, bw, bh, wrap) {
    const inset = 3; c.strokeStyle = t.wall; c.lineWidth = t.style === 'pixel' ? 3 : 4;
    c.setLineDash(wrap ? [6, 6] : []);
    if (t.style === 'sketch') { c.lineWidth = 1.4; c.strokeRect(ox + 2, oy + 2, bw - 4, bh - 4); c.strokeRect(ox + 4.5, oy + 3.5, bw - 8, bh - 8); }
    else { rr(c, ox - inset, oy - inset, bw + inset * 2, bh + inset * 2, t.style === 'flat' ? 8 : 2); c.stroke(); }
    c.setLineDash([]);
  }

  function foodAt(c, t, x, y, cell, time) {
    const pulse = motion.matches ? 1 : 1 + Math.sin(time / 280) * 0.06;
    const pad = cell * 0.18 / pulse, s = cell - pad * 2, cx = x + cell / 2, cy = y + cell / 2;
    if (t.glow) { c.shadowColor = t.food; c.shadowBlur = 8; }
    c.fillStyle = t.food; c.strokeStyle = t.style === 'sketch' ? t.ink : t.food;
    if (t.style === 'pixel') { c.fillRect(x + Math.round(pad), y + Math.round(pad), Math.round(s), Math.round(s)); }
    else if (t.id === 'arcade' || t.id === 'garden' || t.id === 'jungle' || t.style === 'sketch') {
      ellipse(c, cx, cy + 1, s * .36, s * .34, t.style !== 'sketch');
      if (t.style === 'sketch') { c.lineWidth = 1; ellipse(c, cx, cy + 1, s * .36, s * .34, false); }
      c.strokeStyle = t.id === 'jungle' ? '#7dff6a' : t.id === 'arcade' ? '#39ff14' : '#2f7a38';
      c.lineWidth = 1.4; line(c, [[cx, cy - s * .2], [cx + s * .16, cy - s * .42]]);
    } else if (t.id === 'desert') {
      c.beginPath(); c.moveTo(cx, y + pad); c.lineTo(x + s * .85 + pad, cy); c.lineTo(cx, y + cell - pad); c.lineTo(x + pad + s * .15, cy); c.closePath(); c.fill();
    } else if (t.id === 'ocean') {
      c.fillStyle = t.food; ellipse(c, cx - 1, cy, s * .38, s * .28);
      c.beginPath(); c.moveTo(cx + s * .28, cy); c.lineTo(cx + s * .52, cy - s * .22); c.lineTo(cx + s * .52, cy + s * .22); c.closePath(); c.fill();
      c.fillStyle = t.board; ellipse(c, cx - s * .1, cy - 1, 1.6, 1.6);
    } else { ellipse(c, cx, cy, s * .36, s * .36); }
    c.shadowBlur = 0;
  }

  function eyes(c, t, x, y, s, dir) {
    const px = dir === 'left' ? -s * .16 : dir === 'right' ? s * .16 : 0;
    const py = dir === 'up' ? -s * .16 : dir === 'down' ? s * .16 : 0;
    const sx = (dir === 'up' || dir === 'down') ? s * .18 : s * .12;
    const sy = (dir === 'left' || dir === 'right') ? s * .18 : s * .12;
    const white = t.id === 'nokia' || t.id === 'gameboy' ? t.board : '#fff';
    const pupil = t.id === 'nokia' || t.id === 'gameboy' ? t.head : '#142018';
    for (const side of [-1, 1]) {
      const ex = x + s / 2 + px + (dir === 'up' || dir === 'down' ? side * sx : 0);
      const ey = y + s / 2 + py + (dir === 'left' || dir === 'right' ? side * sy : 0);
      c.fillStyle = white; t.style === 'pixel' ? c.fillRect(ex - 1.4, ey - 1.4, 2.8, 2.8) : ellipse(c, ex, ey, Math.max(1.3, s * .1), Math.max(1.3, s * .1));
      c.fillStyle = pupil; t.style === 'pixel' ? c.fillRect(ex - .5 + px * .2, ey - .5 + py * .2, 1.4, 1.4) : ellipse(c, ex + px * .15, ey + py * .15, .7, .7);
    }
  }

  function segment(c, t, i, len, x, y, cell, dir) {
    const k = i / Math.max(1, len - 1), color = i === 0 ? t.head : mix(t.body, t.tail, k);
    const pad = (i === 0 ? 0.08 : 0.14) * cell, s = cell - pad * 2;
    if (t.glow && i === 0) { c.shadowColor = t.head; c.shadowBlur = 10; }
    c.fillStyle = color; c.strokeStyle = t.ink;
    if (t.style === 'pixel') c.fillRect(Math.round(x + pad), Math.round(y + pad), Math.round(s), Math.round(s));
    else if (t.style === 'sketch') { rr(c, x + pad, y + pad, s, s, 2); c.lineWidth = 1; c.fill(); c.stroke(); }
    else { rr(c, x + pad, y + pad, s, s, t.style === 'flat' ? s * .45 : 3); c.fill(); }
    c.shadowBlur = 0;
    if (i === 0) eyes(c, t, x + pad, y + pad, s, dir);
  }

  function bubbles(c, t, ox, oy, bw, bh, time) {
    if (t.id !== 'ocean') return;
    c.fillStyle = '#d8f6ff'; c.strokeStyle = '#d8f6ff';
    for (let i = 0; i < 16; i++) {
      const x = ox + bit(i * 21) * bw, r = 1.5 + (i % 3);
      const y = oy + ((bit(i * 47) * bh + (motion.matches ? 0 : time * (0.01 + i % 3 * 0.008))) % bh);
      c.globalAlpha = .35; ellipse(c, x, y, r, r, false);
    }
    c.globalAlpha = 1;
  }

  function frame(c, t, view, state) {
    const { W, H, cell, ox, oy } = view, { cols, rows, snake, food, dir, boost, wrap, time } = state;
    const bw = cell * cols, bh = cell * rows;
    c.imageSmoothingEnabled = t.style !== 'pixel';
    c.drawImage(backdrop(t, W, H, ox, oy, bw, bh, cell), 0, 0);
    bubbles(c, t, ox, oy, bw, bh, time);
    walls(c, t, ox, oy, bw, bh, wrap);
    if (food) foodAt(c, t, ox + food[0] * cell, oy + food[1] * cell, cell, time);
    if (snake) for (let i = snake.length - 1; i >= 0; i--) segment(c, t, i, snake.length, ox + snake[i][0] * cell, oy + snake[i][1] * cell, cell, dir);
    if (boost) { c.fillStyle = t.accent + '22'; c.fillRect(ox, oy, bw, bh); }
  }

  function preview(c, t, time) {
    c.save(); c.clearRect(0, 0, 240, 120);
    const cell = 16, ox = 8, oy = 4;
    frame(c, t, { W: 240, H: 120, cell, ox, oy }, {
      cols: 14, rows: 7, snake: [[9, 3], [8, 3], [7, 3], [6, 3], [5, 3], [4, 3]],
      food: [11, 2], dir: 'right', boost: false, wrap: false, time
    });
    c.restore();
  }
  return { themes, get, motion, frame, preview };
})();
