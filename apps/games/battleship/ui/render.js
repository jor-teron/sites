/*
 * Battleship — canvas renderer (SHIP-2a). A view is the big grid or the small one.
 * Draws a naval-chart frame, animated water, column letters and row numbers, the five
 * distinct ships (ui/ships.js), a drag/place ghost, misses, hits and the last-shot ring.
 * Water motion uses a shared rAF tick and pauses when the device asks for reduced motion.
 */
const BSRender = (() => {
  const R = BSRules, N = R.N;
  const views = [];
  let phase = 0, raf = 0, reduced = false;

  function colors() {
    return BS_SETTINGS.isDark()
      ? { paper: '#0b1622', ink: '#8fb4d4', frame: '#3d5a73', frame2: '#1e3346', water: '#0c2a45', water2: '#0e3554', deep: '#081e32', foam: 'rgba(147,197,253,.18)', caustic: 'rgba(125,211,252,.1)', miss: '#cbd5e1', hit: '#f87171', scorch: '#1c0a0a', ring: '#facc15', dim: 'rgba(0,0,0,.4)', compass: '#93c5fd' }
      : { paper: '#d8c9a6', ink: '#1e3a5f', frame: '#8a6d3b', frame2: '#c4a574', water: '#2f7da6', water2: '#3b8db8', deep: '#1f6488', foam: 'rgba(255,255,255,.22)', caustic: 'rgba(191,234,255,.28)', miss: '#1e3a8a', hit: '#dc2626', scorch: '#3f0d0d', ring: '#ca8a04', dim: 'rgba(255,255,255,.4)', compass: '#1e3a5f' };
  }
  function readMotion() {
    reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function tick(now) {
    phase = now / 1000;
    views.forEach((v) => v.draw());
    raf = reduced ? 0 : requestAnimationFrame(tick);
  }
  function kick() {
    readMotion();
    if (!raf && !reduced) raf = requestAnimationFrame(tick);
  }

  function view(cv, wrap) {
    const g = cv.getContext('2d');
    let px = 200, cell = 18, lab = 14, dpr = 1, st = null, pad = 4;

    function resize(size) {
      const cap = wrap.querySelector('.cap');
      const capH = cap ? cap.offsetHeight + 2 : 0;
      let box;
      if (size) box = size;
      else {
        const w = wrap.clientWidth, h = wrap.clientHeight - capH;
        if (w <= 0 || h <= 0) return;
        box = Math.max(120, Math.floor(Math.min(w, h)));
      }
      px = box; cell = (px - 4) / (N + 1.05); lab = cell * 0.95; pad = 2;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.style.width = px + 'px'; cv.style.height = px + 'px';
      cv.width = Math.round(px * dpr); cv.height = Math.round(px * dpr);
      wrap.style.width = px + 'px';
      draw();
    }
    const ox = () => pad + lab, cx = (x) => ox() + x * cell, cy = (y) => ox() + y * cell;
    const gridPx = () => N * cell;

    function cellAt(clientX, clientY) {
      const r = cv.getBoundingClientRect(), k = r.width / px;
      const x = Math.floor(((clientX - r.left) / k - ox()) / cell), y = Math.floor(((clientY - r.top) / k - ox()) / cell);
      return x >= 0 && y >= 0 && x < N && y < N ? R.idx(x, y) : -1;
    }
    function cellAtAllowEdge(clientX, clientY) {
      const r = cv.getBoundingClientRect(), k = r.width / px;
      let x = Math.floor(((clientX - r.left) / k - ox()) / cell), y = Math.floor(((clientY - r.top) / k - ox()) / cell);
      if (x < -1 || y < -1 || x > N || y > N) return -1;
      x = Math.max(0, Math.min(N - 1, x)); y = Math.max(0, Math.min(N - 1, y));
      return R.idx(x, y);
    }

    function paper(C) {
      g.fillStyle = C.paper; g.fillRect(0, 0, px, px);
      // faint chart grain
      g.save(); g.globalAlpha = 0.08; g.fillStyle = C.ink;
      for (let i = 0; i < 80; i++) {
        const s = (i * 47 + 13) % (px * px);
        g.fillRect(s % px, Math.floor(s / px) % px, 1.2, 1.2);
      }
      g.restore();
    }
    function frame(C) {
      const x = ox() - 3, y = ox() - 3, s = gridPx() + 6;
      g.strokeStyle = C.frame; g.lineWidth = 2.4; g.strokeRect(x, y, s, s);
      g.strokeStyle = C.frame2; g.lineWidth = 1; g.strokeRect(x + 3.5, y + 3.5, s - 7, s - 7);
      // corner ticks
      const t = 7;
      g.strokeStyle = C.frame; g.lineWidth = 1.6;
      [[x, y], [x + s, y], [x, y + s], [x + s, y + s]].forEach(([cx0, cy0], i) => {
        const sx = i % 2 ? -1 : 1, sy = i < 2 ? 1 : -1;
        g.beginPath(); g.moveTo(cx0, cy0 + sy * t); g.lineTo(cx0, cy0); g.lineTo(cx0 + sx * t, cy0); g.stroke();
      });
      // compass rose in the top-left margin
      const cr = lab * 0.32, rx = pad + lab * 0.45, ry = pad + lab * 0.45;
      g.save(); g.translate(rx, ry);
      g.strokeStyle = C.compass; g.fillStyle = C.compass; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(0, -cr); g.lineTo(cr * 0.22, 0); g.lineTo(0, cr); g.lineTo(-cr * 0.22, 0); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(0, -cr); g.lineTo(cr * 0.18, 0); g.lineTo(0, 0); g.closePath(); g.fill();
      g.font = '600 ' + Math.max(6, Math.round(lab * 0.32)) + 'px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('N', 0, -cr - 1);
      g.restore();
    }
    function water(C) {
      const t = reduced ? 0 : phase;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const px0 = cx(x), py0 = cy(y);
        const wobble = 0.5 + 0.5 * Math.sin(x * 0.7 + y * 0.5 + t * 1.4) * Math.cos(y * 0.55 - t * 1.1);
        g.fillStyle = wobble > 0.55 ? C.water2 : C.water;
        g.fillRect(px0 + 0.4, py0 + 0.4, cell - 0.8, cell - 0.8);
      }
      // caustic streaks
      g.save(); g.globalAlpha = reduced ? 0.25 : 0.45; g.strokeStyle = C.caustic; g.lineWidth = 1.1;
      for (let k = 0; k < 5; k++) {
        const yy = ox() + ((k * 2.15 + t * 0.35) % N) * cell + cell * 0.4;
        g.beginPath();
        for (let x = 0; x <= N; x++) {
          const px0 = cx(Math.min(x, N - 1)) + (x === N ? cell : 0);
          const wy = yy + Math.sin(x * 0.9 + t * 1.6 + k) * cell * 0.18;
          if (x === 0) g.moveTo(cx(0), wy); else g.lineTo(px0, wy);
        }
        g.stroke();
      }
      g.restore();
      // grid lines, chart-like
      g.strokeStyle = C.foam; g.lineWidth = 0.6;
      g.beginPath();
      for (let i = 0; i <= N; i++) {
        g.moveTo(cx(0), cy(0) + i * cell); g.lineTo(cx(N), cy(0) + i * cell);
        g.moveTo(cx(0) + i * cell, cy(0)); g.lineTo(cx(0) + i * cell, cy(N));
      }
      g.stroke();
    }
    function labels(C) {
      g.fillStyle = C.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '600 ' + Math.max(8, Math.round(lab * 0.55)) + 'px "Palatino Linotype", Palatino, "Times New Roman", serif';
      for (let i = 0; i < N; i++) {
        g.fillText('ABCDEFGHIJ'[i], cx(i) + cell / 2, pad + lab * 0.42);
        g.fillText(String(i + 1), pad + lab * 0.42, cy(i) + cell / 2);
      }
    }
    function shipAt(sh) { return { x: cx(sh.x), y: cy(sh.y) }; }

    function draw() {
      if (!st || !st.board) return;
      const C = colors(), b = st.board, dark = BS_SETTINGS.isDark();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      paper(C); water(C); labels(C); frame(C);
      const ghost = st.ghost;
      b.ships.forEach((sh, j) => {
        if (sh.x < 0) return;
        const sunk = R.isSunk(b, j);
        if (!sunk && !st.showShips) return;
        BSShips.draw(g, sh, { cell, x: cx(sh.x), y: cy(sh.y), dark, sunk, selected: j === st.sel });
      });
      if (ghost && ghost.ship) {
        BSShips.draw(g, ghost.ship, { cell, x: cx(ghost.ship.x), y: cy(ghost.ship.y), dark, sunk: false, selected: false, alpha: 0.95, preview: true, ok: ghost.ok, loose: true });
      } else if (ghost && ghost.cells) {
        ghost.cells.forEach((c) => { g.fillStyle = ghost.ok ? 'rgba(22,163,74,.45)' : 'rgba(220,38,38,.45)'; g.fillRect(cx(c % N) + 1, cy(Math.floor(c / N)) + 1, cell - 2, cell - 2); });
      }
      for (let c = 0; c < N * N; c++) {
        const v = b.shots[c]; if (!v) continue;
        const x = cx(c % N) + cell / 2, y = cy(Math.floor(c / N)) + cell / 2;
        if (v === 1) {
          g.fillStyle = C.miss; g.beginPath(); g.arc(x, y, cell * 0.11, 0, 7); g.fill();
          g.strokeStyle = C.foam; g.lineWidth = 1; g.beginPath(); g.arc(x, y, cell * 0.2, 0, 7); g.stroke();
        } else {
          // scorch on the deck, plus a crisp hit mark
          g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(x, y, cell * 0.22, 0, 7); g.fill();
          const r = cell * 0.2; g.strokeStyle = C.hit; g.lineWidth = Math.max(2, cell * 0.1); g.lineCap = 'round';
          g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
        }
      }
      if (st.last >= 0) {
        g.strokeStyle = C.ring; g.lineWidth = Math.max(2, cell * 0.08);
        const c = st.last;
        g.strokeRect(cx(c % N) + 1.5, cy(Math.floor(c / N)) + 1.5, cell - 3, cell - 3);
      }
      if (st.dim) { g.fillStyle = C.dim; g.fillRect(0, 0, px, px); }
    }
    /** st = { board, showShips, sel, ghost: { ship, ok } | { cells, ok } | null, last, dim } */
    const set = (s) => { st = s; draw(); };
    const api = { resize, draw, set, cellAt, cellAtAllowEdge, cellPx: () => cell, size: () => px };
    views.push(api);
    kick();
    return api;
  }

  /** Mini ship for the tray / fleet list. */
  function thumb(cv, name, size, o, sunk) {
    const g = cv.getContext('2d'), w = cv.width, h = cv.height;
    g.clearRect(0, 0, w, h);
    const hor = o !== 'v';
    const cell = hor ? Math.min(h, (w - 2) / size) : Math.min(w, (h - 2) / size);
    const sh = { name, size, x: 0, y: 0, o: hor ? 'h' : 'v' };
    const x = hor ? (w - size * cell) / 2 : (w - cell) / 2;
    const y = hor ? (h - cell) / 2 : (h - size * cell) / 2;
    BSShips.draw(g, sh, { cell, x, y, dark: BS_SETTINGS.isDark(), sunk: !!sunk, loose: true });
  }

  if (window.matchMedia) {
    try { matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { readMotion(); if (!reduced) kick(); }); } catch (_) {}
  }
  return { view, thumb, kick, colors };
})();
