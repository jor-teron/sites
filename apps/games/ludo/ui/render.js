/*
 * Ludo — canvas renderer (LUDO-1a; LUDO-1c: sliding token, blocks). No loop of its own: draw() runs when
 * something changes, and ui/anim.js calls setState() for each frame of a short slide.
 * Draws the 15 x 15 cross board (yards, track, coloured start squares and home columns, stars on the
 * safe squares, the centre triangles), the tokens (shared squares split into small tokens), the glowing
 * tokens that may move and a dot where each would land. Also draws the die face on its own small canvas.
 * setState({ s, moves, anim: { color, k, x, y } (a token mid-slide, grid units), hold: [{ color, k, p }] (a
 * captured token still drawn where it was until the slide ends) }). With the blocks house rule a block gets a ring.
 */
const LDRender = (() => {
  const C = LD_CONFIG, B = LDBoard, G = 15;
  let cv, g, px = 300, cell = 20, dpr = 1, st = null, spots = [];

  const theme = () => LD_SETTINGS.isDark()
    ? { bg: '#111827', sq: '#374151', line: '#1f2937', star: '#e5e7eb', yardIn: '#1f2937', ring: '#ffffff', ink: '#f9fafb', glow: '#fde047' }
    : { bg: '#f8fafc', sq: '#ffffff', line: '#94a3b8', star: '#64748b', yardIn: '#ffffff', ring: '#111827', ink: '#111827', glow: '#f59e0b' };

  function init(canvas) { cv = canvas; g = cv.getContext('2d'); }
  function resize(wrap) {
    if (!cv) return;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (w <= 0 || h <= 0) return;
    px = Math.max(150, Math.floor(Math.min(w, h))); cell = px / G;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = px + 'px'; cv.style.height = px + 'px';
    cv.width = Math.round(px * dpr); cv.height = Math.round(px * dpr);
    draw();
  }

  function star(x, y, r, color) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath(); g.lineWidth = Math.max(1, cell * 0.06); g.strokeStyle = color; g.stroke();
  }
  function square(x, y, fill, T) { g.fillStyle = fill; g.fillRect(x * cell, y * cell, cell, cell); g.strokeStyle = T.line; g.lineWidth = 1; g.strokeRect(x * cell + 0.5, y * cell + 0.5, cell - 1, cell - 1); }

  function drawBoard(T) {
    g.fillStyle = T.bg; g.fillRect(0, 0, px, px);
    for (const c of C.colors) {                 // yards
      const [ox, oy] = B.YARD_ORIGIN[c];
      g.fillStyle = C.hex[c]; g.fillRect(ox * cell, oy * cell, 6 * cell, 6 * cell);
      g.fillStyle = T.yardIn; g.beginPath();
      g.roundRect ? g.roundRect((ox + 0.9) * cell, (oy + 0.9) * cell, 4.2 * cell, 4.2 * cell, cell * 0.5) : g.rect((ox + 0.9) * cell, (oy + 0.9) * cell, 4.2 * cell, 4.2 * cell);
      g.fill();
      for (const [sx, sy] of B.YARD[c]) { g.beginPath(); g.arc(sx * cell, sy * cell, cell * 0.55, 0, 7); g.fillStyle = C.light[c]; g.fill(); g.strokeStyle = C.hex[c]; g.lineWidth = Math.max(1, cell * 0.06); g.stroke(); }
    }
    B.TRACK.forEach(([x, y], i) => {
      const startOf = C.colors.find((c) => C.start[c] === i);
      square(x, y, startOf ? C.hex[startOf] : T.sq, T);
      if (B.isSafe(i)) star((x + 0.5) * cell, (y + 0.5) * cell, cell * 0.36, startOf ? '#ffffff' : T.star);
    });
    for (const c of C.colors) B.HOME[c].forEach(([x, y]) => square(x, y, C.hex[c], T));
    // centre: four triangles pointing in, one per colour
    const [cx0, cy0] = B.CENTRE, x0 = cx0 * cell, y0 = cy0 * cell, s3 = 3 * cell, mx = x0 + s3 / 2, my = y0 + s3 / 2;
    const tri = { red: [[x0, y0], [x0, y0 + s3]], green: [[x0, y0], [x0 + s3, y0]], yellow: [[x0 + s3, y0], [x0 + s3, y0 + s3]], blue: [[x0, y0 + s3], [x0 + s3, y0 + s3]] };
    for (const c of C.colors) { const [a, b] = tri[c]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(mx, my); g.closePath(); g.fillStyle = C.hex[c]; g.fill(); }
  }

  function token(x, y, r, color, T, glow) {
    if (glow) { g.beginPath(); g.arc(x, y, r + cell * 0.14, 0, 7); g.fillStyle = T.glow; g.fill(); }
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = C.hex[color]; g.fill();
    g.lineWidth = Math.max(1.2, r * 0.18); g.strokeStyle = T.ring; g.stroke();
    g.beginPath(); g.arc(x, y, r * 0.42, 0, 7); g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
  }

  /** Where every token is drawn (pixels), shared squares split into a 2 x 2 group. Used for taps too. */
  function layout(s, anim, hold) {
    const groups = new Map(), out = [];
    for (const c of s.players) s.tokens[c].forEach((p, k) => {
      if (anim && anim.color === c && anim.k === k) return;                 // drawn on top, below
      const h = hold && hold.find((o) => o.color === c && o.k === k); if (h) p = h.p;
      const [x, y] = B.cellOf(c, p, k), key = p < 0 ? c + 'y' + k : x + ',' + y;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ color: c, k, p, x, y });
    });
    for (const list of groups.values()) {
      const n = list.length, home = list[0].p === C.goal;
      list.forEach((t, i) => {
        let dx = 0, dy = 0, r = cell * (home ? 0.24 : 0.36);
        if (n > 1) { r = cell * (home ? 0.2 : 0.25); const q = i % 4; dx = (q % 2 ? 0.22 : -0.22) * (n === 2 ? 1 : 1); dy = n === 2 ? 0 : (q < 2 ? -0.22 : 0.22); if (home) { dx *= 0.8; dy *= 0.8; } }
        out.push({ color: t.color, k: t.k, p: t.p, x: (t.x + dx) * cell, y: (t.y + dy) * cell, r, extra: n > 4 && i === 3 ? n - 3 : 0 });
      });
    }
    if (anim) out.push({ color: anim.color, k: anim.k, p: -2, x: anim.x * cell, y: anim.y * cell, r: cell * 0.38, extra: 0 });
    return out;
  }
  /** Blocks house rule: a ring round every square holding 2+ tokens of one colour. */
  function drawBlocks(s, T) {
    if (!(s.rules && s.rules.blocks)) return;
    for (const c of s.players) {
      const n = {};
      s.tokens[c].forEach((p) => { const i = B.abs(c, p); if (i >= 0) n[i] = (n[i] || 0) + 1; });
      for (const i in n) if (n[i] >= 2) {
        const [x, y] = B.TRACK[i];
        g.lineWidth = Math.max(2, cell * 0.12); g.strokeStyle = C.hex[c];
        g.strokeRect(x * cell + g.lineWidth / 2, y * cell + g.lineWidth / 2, cell - g.lineWidth, cell - g.lineWidth);
      }
    }
  }

  function draw() {
    if (!g || !st) return;
    const T = theme(), s = st.s;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBoard(T);
    const legal = new Map((st.moves || []).map((m) => [m.k, m]));
    // landing dots
    for (const m of legal.values()) {
      const [x, y] = B.cellOf(s.turn, m.to, m.k);
      g.beginPath(); g.arc(x * cell, y * cell, cell * 0.16, 0, 7); g.fillStyle = T.ink; g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1;
    }
    drawBlocks(s, T);
    spots = layout(s, st.anim, st.hold);
    for (const t of spots) {
      const glow = t.color === s.turn && legal.has(t.k);
      token(t.x, t.y, t.r, t.color, T, glow);
      if (t.extra) { g.fillStyle = T.ink; g.font = 'bold ' + Math.round(cell * 0.32) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('+' + t.extra, t.x, t.y); }
    }
  }
  /** The movable token (of the current player) nearest a tap, or null. Generous: anywhere on its square. */
  function tokenAt(clientX, clientY) {
    if (!st) return null;
    const r = cv.getBoundingClientRect(), k = r.width / px, x = (clientX - r.left) / k, y = (clientY - r.top) / k;
    const legal = new Set((st.moves || []).map((m) => m.k));
    let best = null, bd = cell * 0.85;
    for (const t of spots) {
      if (t.color !== st.s.turn || !legal.has(t.k)) continue;
      const d = Math.hypot(t.x - x, t.y - y); if (d < bd) { bd = d; best = t; }
    }
    if (!best) {   // tap on a landing dot also moves that token
      for (const m of st.moves || []) { const [lx, ly] = B.cellOf(st.s.turn, m.to, m.k); const d = Math.hypot(lx * cell - x, ly * cell - y); if (d < cell * 0.6) return { color: st.s.turn, k: m.k }; }
    }
    return best ? { color: best.color, k: best.k } : null;
  }
  /** st = { s: rules state, moves: legal moves (glow + landing dots) } */
  const setState = (x) => { st = x; draw(); };
  const tokenPx = (color, k) => { const t = spots.find((q) => q.color === color && q.k === k); if (!t) return null; const r = cv.getBoundingClientRect(), z = r.width / px; return { x: r.left + t.x * z, y: r.top + t.y * z }; };

  // ---- die ----
  const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
  function drawDie(dc, v, color, active) {
    const d = dc.getContext('2d'), sz = dc.clientWidth || 56, r = Math.min(window.devicePixelRatio || 1, 2);
    if (dc.width !== Math.round(sz * r)) { dc.width = Math.round(sz * r); dc.height = Math.round(sz * r); }
    d.setTransform(r, 0, 0, r, 0, 0); d.clearRect(0, 0, sz, sz);
    const m = 3;
    d.beginPath(); d.roundRect ? d.roundRect(m, m, sz - 2 * m, sz - 2 * m, sz * 0.18) : d.rect(m, m, sz - 2 * m, sz - 2 * m);
    d.fillStyle = '#ffffff'; d.fill(); d.lineWidth = active ? 4 : 2; d.strokeStyle = C.hex[color] || '#64748b'; d.stroke();
    if (!v) { d.fillStyle = C.hex[color] || '#64748b'; d.font = 'bold ' + Math.round(sz * 0.2) + 'px sans-serif'; d.textAlign = 'center'; d.textBaseline = 'middle'; d.fillText('ROLL', sz / 2, sz / 2); return; }
    d.fillStyle = '#111827';
    const step = (sz - 2 * m) / 4;
    for (const [a, b] of PIPS[v]) { d.beginPath(); d.arc(m + step * (a + 1), m + step * (b + 1), sz * 0.075, 0, 7); d.fill(); }
  }
  return { init, resize, draw, setState, tokenAt, tokenPx, drawDie };
})();
