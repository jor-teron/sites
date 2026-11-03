/*
 * Go — canvas renderer (GO-1). No animation loop: draw() runs only when something changes
 * (move, hover, theme, resize), so it costs nothing while you think. Light on weak phones.
 * Draws the wooden board, lines, star points, stones, last-move marker, a ghost / pending stone,
 * and in the counting step: dead stones (faded with a cross) and area marks.
 * Uses GO_CONFIG + GO_SETTINGS.
 */
const GoRender = (() => {
  const CFG = GO_CONFIG;
  let cv, cx, n = 9, cell = 30, margin = 20, px = 300, dpr = 1;
  let state = null; // { b, n, last, ghost, pending, toPlay, phase, dead, owner }

  const colors = () => GO_SETTINGS.isDark()
    ? { wood: '#a77b3f', line: '#2b1d0e', star: '#2b1d0e', black: '#0b0b0c', white: '#e9e6df', mark: '#ef4444' }
    : { wood: '#dcb36b', line: '#3b2a14', star: '#3b2a14', black: '#111111', white: '#fbfaf6', mark: '#dc2626' };

  function init(canvas) { cv = canvas; cx = cv.getContext('2d'); }

  /** Fit the largest square board into the wrapper box. */
  function resize(wrap) {
    if (!cv) return;
    const side = Math.max(120, Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight)));
    cell = side / (n + 0.4); margin = cell * 0.7; px = side;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = side + 'px'; cv.style.height = side + 'px';
    cv.width = Math.round(side * dpr); cv.height = Math.round(side * dpr);
    draw();
  }

  /** Board point under client (x, y), or -1 when off the board. */
  function pointAt(clientX, clientY) {
    const r = cv.getBoundingClientRect(), k = r.width / px;
    const x = Math.round(((clientX - r.left) / k - margin) / cell), y = Math.round(((clientY - r.top) / k - margin) / cell);
    return x >= 0 && y >= 0 && x < n && y < n ? y * n + x : -1;
  }

  const X = (i) => margin + (i % n) * cell, Y = (i) => margin + ((i / n) | 0) * cell;

  function stone(x, y, c, k, alpha) {
    const rad = cell * 0.47;
    cx.globalAlpha = alpha;
    cx.beginPath(); cx.arc(x, y, rad, 0, Math.PI * 2);
    cx.fillStyle = c === 1 ? k.black : k.white; cx.fill();
    if (c === 2) { cx.lineWidth = Math.max(1, cell * 0.04); cx.strokeStyle = 'rgba(0,0,0,.45)'; cx.stroke(); }
    if (cell >= 14) { // small shine, flat colour (no gradients: cheap on weak phones)
      cx.beginPath(); cx.arc(x - rad * 0.35, y - rad * 0.35, rad * 0.22, 0, Math.PI * 2);
      cx.fillStyle = c === 1 ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.9)'; cx.fill();
    }
    cx.globalAlpha = 1;
  }

  function draw() {
    if (!cx || !state) return;
    const k = colors(), b = state.b;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.fillStyle = k.wood; cx.fillRect(0, 0, px, px);
    // grid
    cx.strokeStyle = k.line; cx.lineWidth = Math.max(1, cell * 0.035);
    cx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = margin + i * cell;
      cx.moveTo(margin, p); cx.lineTo(margin + (n - 1) * cell, p);
      cx.moveTo(p, margin); cx.lineTo(p, margin + (n - 1) * cell);
    }
    cx.stroke();
    cx.fillStyle = k.star;
    for (const [sx, sy] of CFG.stars[n] || []) { cx.beginPath(); cx.arc(margin + sx * cell, margin + sy * cell, Math.max(2, cell * 0.1), 0, Math.PI * 2); cx.fill(); }
    const counting = state.phase === 'mark' || state.phase === 'over';
    // stones
    for (let i = 0; i < n * n; i++) {
      if (!b[i]) continue;
      const dead = counting && state.dead && state.dead[i];
      stone(X(i), Y(i), b[i], k, dead ? 0.4 : 1);
      if (dead) {
        const d = cell * 0.22; cx.strokeStyle = k.mark; cx.lineWidth = Math.max(1.5, cell * 0.07);
        cx.beginPath(); cx.moveTo(X(i) - d, Y(i) - d); cx.lineTo(X(i) + d, Y(i) + d); cx.moveTo(X(i) + d, Y(i) - d); cx.lineTo(X(i) - d, Y(i) + d); cx.stroke();
      }
    }
    // area marks while counting
    if (counting && state.owner) {
      const q = cell * 0.17;
      for (let i = 0; i < n * n; i++) {
        const o = state.owner[i]; if (!o || (b[i] && !(state.dead && state.dead[i]))) continue;
        cx.fillStyle = o === 1 ? k.black : k.white; cx.fillRect(X(i) - q, Y(i) - q, q * 2, q * 2);
        if (o === 2) { cx.lineWidth = 1; cx.strokeStyle = 'rgba(0,0,0,.5)'; cx.strokeRect(X(i) - q, Y(i) - q, q * 2, q * 2); }
      }
    }
    // last-move marker
    if (state.last >= 0 && b[state.last] && !counting) {
      const i = state.last; cx.beginPath(); cx.arc(X(i), Y(i), cell * 0.2, 0, Math.PI * 2);
      cx.lineWidth = Math.max(1.5, cell * 0.07); cx.strokeStyle = b[i] === 1 ? '#ffffff' : '#111111'; cx.stroke();
    }
    // pending (confirm tap) or hover ghost
    if (!counting) {
      if (state.pending >= 0) {
        stone(X(state.pending), Y(state.pending), state.toPlay, k, 0.6);
        cx.beginPath(); cx.arc(X(state.pending), Y(state.pending), cell * 0.5, 0, Math.PI * 2);
        cx.lineWidth = Math.max(2, cell * 0.08); cx.strokeStyle = k.mark; cx.stroke();
      } else if (state.ghost >= 0 && !b[state.ghost]) stone(X(state.ghost), Y(state.ghost), state.toPlay, k, 0.35);
    }
  }

  function setState(s) { if (s.n !== n) { n = s.n; state = s; const w = cv && cv.parentElement; if (w) resize(w); } state = s; draw(); }
  const cellPx = () => cell;
  return { init, resize, pointAt, draw, setState, cellPx };
})();
