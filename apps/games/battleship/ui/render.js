/*
 * Battleship — canvas renderer (SHIP-1). No animation loop: a view is drawn only when something changes.
 * BSRender.view(canvas, wrap) makes one grid view (the big one: your shots, or your fleet while placing;
 * the small one: your fleet with the other side's shots). Draws column letters A–J and row numbers 1–10,
 * water, ships (only when they may be seen, plus every sunk ship), misses (dots), hits (red X),
 * the last shot (ring), the selected ship and the placing preview (green ok / red blocked).
 */
const BSRender = (() => {
  const R = BSRules, N = R.N;
  const colors = () => BS_SETTINGS.isDark()
    ? { bg: '#0b1b33', lab: '#93c5fd', water: '#1e3a5f', water2: '#22446e', ship: '#94a3b8', sunk: '#7f1d1d', miss: '#cbd5e1', hit: '#f87171', ring: '#facc15', sel: '#facc15', ok: 'rgba(34,197,94,.55)', bad: 'rgba(239,68,68,.55)', dim: 'rgba(0,0,0,.35)' }
    : { bg: '#e0f2fe', lab: '#1e3a8a', water: '#93c5fd', water2: '#a5cdfd', ship: '#475569', sunk: '#991b1b', miss: '#1e3a8a', hit: '#dc2626', ring: '#ca8a04', sel: '#eab308', ok: 'rgba(22,163,74,.55)', bad: 'rgba(220,38,38,.55)', dim: 'rgba(255,255,255,.45)' };

  function view(cv, wrap) {
    const g = cv.getContext('2d');
    let px = 200, cell = 18, lab = 11, dpr = 1, st = null;

    function resize() {
      const cap = wrap.querySelector('.cap');
      const w = wrap.clientWidth, h = wrap.clientHeight - (cap ? cap.offsetHeight + 2 : 0);
      if (w <= 0 || h <= 0) return;
      px = Math.max(120, Math.floor(Math.min(w, h)));
      cell = (px - 4) / (N + 0.7); lab = cell * 0.7;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.style.width = px + 'px'; cv.style.height = px + 'px';
      cv.width = Math.round(px * dpr); cv.height = Math.round(px * dpr);
      draw();
    }
    const ox = () => 2 + lab, cx = (x) => ox() + x * cell, cy = (y) => ox() + y * cell;

    function cellAt(clientX, clientY) {
      const r = cv.getBoundingClientRect(), k = r.width / px;
      const x = Math.floor(((clientX - r.left) / k - ox()) / cell), y = Math.floor(((clientY - r.top) / k - ox()) / cell);
      return x >= 0 && y >= 0 && x < N && y < N ? R.idx(x, y) : -1;
    }

    function shipShape(sh, fill, stroke) {
      const p = cell * 0.12, x = cx(sh.x) + p, y = cy(sh.y) + p;
      const w = (sh.o === 'h' ? sh.size : 1) * cell - 2 * p, h = (sh.o === 'v' ? sh.size : 1) * cell - 2 * p;
      g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, cell * 0.38) : g.rect(x, y, w, h);
      g.fillStyle = fill; g.fill();
      if (stroke) { g.lineWidth = Math.max(2, cell * 0.1); g.strokeStyle = stroke; g.stroke(); }
    }

    function draw() {
      if (!st || !st.board) return;
      const C = colors(), b = st.board;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = C.bg; g.fillRect(0, 0, px, px);
      g.fillStyle = C.lab; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '600 ' + Math.max(8, Math.round(lab * 0.72)) + 'px sans-serif';
      for (let i = 0; i < N; i++) {
        g.fillText('ABCDEFGHIJ'[i], cx(i) + cell / 2, 2 + lab / 2);
        g.fillText(String(i + 1), 2 + lab / 2, cy(i) + cell / 2);
      }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        g.fillStyle = (x + y) % 2 ? C.water2 : C.water;
        g.fillRect(cx(x) + 0.5, cy(y) + 0.5, cell - 1, cell - 1);
      }
      b.ships.forEach((sh, j) => {
        if (sh.x < 0) return;
        const sunk = R.isSunk(b, j);
        if (sunk) shipShape(sh, C.sunk);
        else if (st.showShips) shipShape(sh, C.ship, j === st.sel ? C.sel : null);
      });
      if (st.ghost) st.ghost.cells.forEach((c) => { g.fillStyle = st.ghost.ok ? C.ok : C.bad; g.fillRect(cx(c % N) + 1, cy(Math.floor(c / N)) + 1, cell - 2, cell - 2); });
      for (let c = 0; c < N * N; c++) {
        const v = b.shots[c]; if (!v) continue;
        const x = cx(c % N) + cell / 2, y = cy(Math.floor(c / N)) + cell / 2;
        if (v === 1) { g.fillStyle = C.miss; g.beginPath(); g.arc(x, y, cell * 0.13, 0, 7); g.fill(); }
        else {
          const r = cell * 0.28; g.strokeStyle = C.hit; g.lineWidth = Math.max(2, cell * 0.13); g.lineCap = 'round';
          g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
        }
      }
      if (st.last >= 0) {
        g.strokeStyle = C.ring; g.lineWidth = Math.max(2, cell * 0.09);
        g.strokeRect(cx(st.last % N) + 1.5, cy(Math.floor(st.last / N)) + 1.5, cell - 3, cell - 3);
      }
      if (st.dim) { g.fillStyle = C.dim; g.fillRect(0, 0, px, px); }
    }
    /** st = { board, showShips, sel, ghost: { cells, ok } | null, last: cell | -1, dim } */
    const set = (s) => { st = s; draw(); };
    return { resize, draw, set, cellAt, cellPx: () => cell };
  }
  return { view };
})();
