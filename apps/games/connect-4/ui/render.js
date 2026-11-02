/*
 * Connect 4 — canvas renderer + drop animation (C4-1).
 * The loop runs only while a disc is falling, capped at 30fps (or lower fpsLimit),
 * and the fall uses real elapsed time (gravity in px/s²), so speed is the same at any fps.
 */
const C4Render = (() => {
  const B = C4Board, CFG = C4_CONFIG;
  let cv, cx, cell = 40, pad = 6, dpr = 1;
  let anim = null;            // { c, r, p, y, v, targetY, done }
  let state = null;           // { grid, win: [[r,c]...] | null, hoverCol }
  let raf = 0, last = 0, acc = 0;

  const colors = () => C4_SETTINGS.isDark()
    ? { board: '#1d4ed8', hole: '#0f172a', red: '#ef4444', yellow: '#facc15', ring: '#ffffff', hover: 'rgba(255,255,255,.12)' }
    : { board: '#2563eb', hole: '#f8fafc', red: '#dc2626', yellow: '#eab308', ring: '#111827', hover: 'rgba(0,0,0,.08)' };

  function init(canvas) { cv = canvas; cx = cv.getContext('2d'); }

  /** Fit the largest 7:6 board into the wrapper box. */
  function resize(wrap) {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    cell = Math.max(16, Math.floor(Math.min(w / B.COLS, h / B.ROWS)));
    pad = Math.max(2, Math.round(cell * 0.1));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = cell * B.COLS + 'px'; cv.style.height = cell * B.ROWS + 'px';
    cv.width = cell * B.COLS * dpr; cv.height = cell * B.ROWS * dpr;
    draw();
  }

  /** Column under a client x coordinate, or -1. */
  function colAt(clientX) {
    const r = cv.getBoundingClientRect();
    const c = Math.floor((clientX - r.left) / (r.width / B.COLS));
    return c >= 0 && c < B.COLS ? c : -1;
  }

  function disc(x, y, rad, fill, ring) {
    cx.beginPath(); cx.arc(x, y, rad, 0, Math.PI * 2); cx.fillStyle = fill; cx.fill();
    if (ring) { cx.lineWidth = Math.max(2, rad * 0.18); cx.strokeStyle = ring; cx.stroke(); }
  }

  function draw() {
    if (!cx || !state) return;
    const k = colors(), rad = cell / 2 - pad;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, cell * B.COLS, cell * B.ROWS);
    cx.fillStyle = k.board; cx.fillRect(0, 0, cell * B.COLS, cell * B.ROWS);
    if (state.hoverCol >= 0 && !anim) { cx.fillStyle = k.hover; cx.fillRect(state.hoverCol * cell, 0, cell, cell * B.ROWS); }
    const winSet = new Set((state.win || []).map(([r, c]) => r * 10 + c));
    for (let r = 0; r < B.ROWS; r++) for (let c = 0; c < B.COLS; c++) {
      const p = state.grid[r][c];
      const hidden = anim && anim.r === r && anim.c === c;   // drawn by the animation instead
      const fill = !p || hidden ? k.hole : p === 1 ? k.red : k.yellow;
      disc(c * cell + cell / 2, r * cell + cell / 2, rad, fill, winSet.has(r * 10 + c) ? k.ring : null);
    }
    if (anim) disc(anim.c * cell + cell / 2, anim.y, rad, anim.p === 1 ? k.red : k.yellow);
  }

  function frameMs() {
    const f = Math.min(CFG.maxFps, Number(C4_SETTINGS.get('fpsLimit')) || 30);
    return 1000 / f;
  }

  function tick(now) {
    raf = 0; if (!anim) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt * 1000;
    if (acc >= frameMs() - 1) {               // 30fps cap: physics + draw only on frame steps
      const step = acc / 1000; acc = 0;
      anim.v += CFG.dropGravity * (cell / 60) * step;
      anim.y += anim.v * step;
      if (anim.y >= anim.targetY) { anim.y = anim.targetY; const a = anim; anim = null; draw(); a.done(); return; }
      draw();
    }
    raf = requestAnimationFrame(tick);
  }

  /** Animate a disc of player p falling into (r,c); calls done() at landing. */
  function drop(c, r, p, done) {
    anim = { c, r, p, y: -cell / 2, v: 0, targetY: r * cell + cell / 2, done };
    last = performance.now(); acc = 0;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  const setState = (s) => { state = s; draw(); };
  const busy = () => !!anim;
  return { init, resize, colAt, draw, drop, setState, busy };
})();
