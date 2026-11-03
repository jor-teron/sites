/*
 * Blockade — canvas renderer (BLKD-1). No animation loop: draw() runs only when something changes.
 * Draws squares, home squares (ringed in each player's colour), pawns, legal-move dots,
 * placed walls (green = vertical, blue = horizontal) and the wall preview (red when it can't go there).
 * Uses BK_CONFIG, BKRules and BK_SETTINGS.
 */
const BKRender = (() => {
  const R = BKRules, W = R.W, H = R.H;
  let cv, cx, cell = 30, m = 8, pw = 300, ph = 400, dpr = 1;
  let st = null; // { s, sel, targets, preview: { cx, cy, o, ok } | null, last: [from, to] | null }

  const colors = () => BK_SETTINGS.isDark()
    ? { board: '#3b2f22', sq: '#8a6a45', groove: '#2a2118', p1: '#fb923c', p2: '#a78bfa', v: '#22c55e', h: '#3b82f6', dot: 'rgba(255,255,255,.75)', bad: '#ef4444', last: 'rgba(255,255,255,.25)' }
    : { board: '#7c5a36', sq: '#e8cf9f', groove: '#5b4128', p1: '#ea580c', p2: '#7c3aed', v: '#16a34a', h: '#2563eb', dot: 'rgba(0,0,0,.55)', bad: '#dc2626', last: 'rgba(0,0,0,.12)' };

  function init(canvas) { cv = canvas; cx = cv.getContext('2d'); }

  /** Fit the largest 11:14 board into the wrapper box. */
  function resize(wrap) {
    if (!cv) return;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    cell = Math.max(14, Math.min((w - 8) / W, (h - 8) / H)); m = Math.max(3, cell * 0.12);
    pw = Math.floor(cell * W + 2 * m); ph = Math.floor(cell * H + 2 * m);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = pw + 'px'; cv.style.height = ph + 'px';
    cv.width = Math.round(pw * dpr); cv.height = Math.round(ph * dpr);
    draw();
  }

  function local(clientX, clientY) { const r = cv.getBoundingClientRect(), k = r.width / pw; return [(clientX - r.left) / k - m, (clientY - r.top) / k - m]; }
  /** Square under the point, or -1. */
  function squareAt(clientX, clientY) {
    const [x, y] = local(clientX, clientY), X = Math.floor(x / cell), Y = Math.floor(y / cell);
    return X >= 0 && Y >= 0 && X < W && Y < H ? Y * W + X : -1;
  }
  /** Nearest inner corner (wall anchor) to the point: [cx, cy]. */
  function cornerAt(clientX, clientY) {
    const [x, y] = local(clientX, clientY);
    return [Math.min(W - 1, Math.max(1, Math.round(x / cell))), Math.min(H - 1, Math.max(1, Math.round(y / cell)))];
  }

  function wallRect(c, wx, wy, o, color, alpha) {
    const g = Math.max(3, cell * 0.2), L = cell * 2 - g * 0.4;
    cx.globalAlpha = alpha; cx.fillStyle = color;
    const X = m + wx * cell, Y = m + wy * cell;
    if (o === 'h') cx.fillRect(X - L / 2, Y - g / 2, L, g); else cx.fillRect(X - g / 2, Y - L / 2, g, L);
    cx.globalAlpha = 1;
  }

  function pawn(i, k) {
    const q = st.s.pawns[i], X = m + (q % W + 0.5) * cell, Y = m + (((q / W) | 0) + 0.5) * cell, r = cell * 0.34;
    cx.beginPath(); cx.arc(X, Y, r, 0, Math.PI * 2); cx.fillStyle = i < 2 ? k.p1 : k.p2; cx.fill();
    cx.lineWidth = Math.max(1.5, cell * 0.06); cx.strokeStyle = st.sel === i ? '#ffffff' : 'rgba(0,0,0,.45)'; cx.stroke();
    if (st.sel === i) { cx.beginPath(); cx.arc(X, Y, r + cell * 0.1, 0, Math.PI * 2); cx.strokeStyle = '#facc15'; cx.lineWidth = Math.max(2, cell * 0.08); cx.stroke(); }
  }

  function draw() {
    if (!cx || !st) return;
    const k = colors(), s = st.s, g = Math.max(2, cell * 0.1);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.fillStyle = k.board; cx.fillRect(0, 0, pw, ph);
    for (let i = 0; i < W * H; i++) {
      const X = m + (i % W) * cell, Y = m + ((i / W) | 0) * cell;
      cx.fillStyle = k.sq; cx.fillRect(X + g / 2, Y + g / 2, cell - g, cell - g);
      if (st.last && (st.last[0] === i || st.last[1] === i)) { cx.fillStyle = k.last; cx.fillRect(X + g / 2, Y + g / 2, cell - g, cell - g); }
    }
    for (const p of [1, 2]) for (const h of R.HOME[p]) {
      const X = m + (h % W) * cell, Y = m + ((h / W) | 0) * cell;
      cx.lineWidth = Math.max(2, cell * 0.09); cx.strokeStyle = p === 1 ? k.p1 : k.p2;
      cx.strokeRect(X + g, Y + g, cell - 2 * g, cell - 2 * g);
    }
    for (const [wx, wy, o] of s.walls) wallRect(cx, wx, wy, o, o === 'h' ? k.h : k.v, 1);
    for (let i = 0; i < 4; i++) pawn(i, k);
    if (st.targets) for (const q of st.targets) {
      const X = m + (q % W + 0.5) * cell, Y = m + (((q / W) | 0) + 0.5) * cell;
      cx.beginPath(); cx.arc(X, Y, cell * 0.14, 0, Math.PI * 2); cx.fillStyle = k.dot; cx.fill();
    }
    const pv = st.preview;
    if (pv) wallRect(cx, pv.cx, pv.cy, pv.o, pv.ok ? (pv.o === 'h' ? k.h : k.v) : k.bad, 0.6);
  }

  const setState = (v) => { st = v; draw(); };
  return { init, resize, squareAt, cornerAt, draw, setState, cellPx: () => cell };
})();
