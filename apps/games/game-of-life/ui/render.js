/*
 * Game of Life — canvas renderer + view (zoom / pan) (LIFE-1).
 * The grid is drawn with one fillRect per live cell plus thin grid lines when cells are big enough.
 * View: cell size = fit * zoom, offset (ox, oy) in CSS px. Wrapping is drawn only once (no tiling).
 */
const LifeRender = (() => {
  const CFG = LIFE_CONFIG;
  let cv, cx, dpr = 1, W = 0, H = 0, fit = 1;
  const view = { zoom: 1, ox: 0, oy: 0 };

  const colors = () => LIFE_SETTINGS.isDark()
    ? { bg: '#0b1220', cell: '#34d399', grid: 'rgba(255,255,255,.07)', edge: '#334155' }
    : { bg: '#ffffff', cell: '#0f766e', grid: 'rgba(0,0,0,.08)', edge: '#cbd5e1' };

  function init(canvas) { cv = canvas; cx = cv.getContext('2d', { alpha: false }); }
  const size = () => fit * view.zoom;

  /** Fit the canvas to its wrapper; the grid fills the shorter side at zoom 1. */
  function resize(wrap, world) {
    W = wrap.clientWidth; H = wrap.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    fit = Math.min(W / world.cols, H / world.rows);
    resetView(world);
  }
  function resetView(world) {
    view.zoom = 1;
    view.ox = (W - world.cols * fit) / 2; view.oy = (H - world.rows * fit) / 2;
  }
  /** Keep at least part of the grid on screen. */
  function clampPan(world) {
    const s = size(), gw = world.cols * s, gh = world.rows * s, m = 40;
    view.ox = Math.min(W - m, Math.max(m - gw, view.ox));
    view.oy = Math.min(H - m, Math.max(m - gh, view.oy));
  }
  /** Zoom by factor f around screen point (px, py). */
  function zoomAt(world, f, px, py) {
    const z = Math.min(CFG.zoom.max, Math.max(CFG.zoom.min, view.zoom * f));
    const k = z / view.zoom; view.zoom = z;
    view.ox = px - (px - view.ox) * k; view.oy = py - (py - view.oy) * k;
    clampPan(world);
  }
  function pan(world, dx, dy) { view.ox += dx; view.oy += dy; clampPan(world); }

  /** Screen (canvas-relative CSS px) → cell, or null when outside the grid. */
  function cellAt(world, px, py) {
    const s = size(), x = Math.floor((px - view.ox) / s), y = Math.floor((py - view.oy) / s);
    return x >= 0 && y >= 0 && x < world.cols && y < world.rows ? [x, y] : null;
  }

  function draw(world) {
    if (!cx) return;
    const k = colors(), s = size(), { cols, rows } = world, c = world.cells;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.fillStyle = k.edge; cx.fillRect(0, 0, W, H);
    cx.fillStyle = k.bg; cx.fillRect(view.ox, view.oy, cols * s, rows * s);
    // visible cell range only (cheap when zoomed in)
    const x0 = Math.max(0, Math.floor(-view.ox / s)), x1 = Math.min(cols, Math.ceil((W - view.ox) / s));
    const y0 = Math.max(0, Math.floor(-view.oy / s)), y1 = Math.min(rows, Math.ceil((H - view.oy) / s));
    const gap = s >= 6 ? 1 : 0;
    cx.fillStyle = k.cell;
    for (let y = y0; y < y1; y++) {
      const row = y * cols, py = view.oy + y * s;
      for (let x = x0; x < x1; x++) if (c[row + x]) cx.fillRect(view.ox + x * s, py, s - gap, s - gap);
    }
    if (s >= 6) {                         // grid lines only when they are readable
      cx.strokeStyle = k.grid; cx.lineWidth = 1; cx.beginPath();
      for (let x = x0; x <= x1; x++) { const px = Math.round(view.ox + x * s) + 0.5; cx.moveTo(px, view.oy + y0 * s); cx.lineTo(px, view.oy + y1 * s); }
      for (let y = y0; y <= y1; y++) { const py = Math.round(view.oy + y * s) + 0.5; cx.moveTo(view.ox + x0 * s, py); cx.lineTo(view.ox + x1 * s, py); }
      cx.stroke();
    }
  }
  return { init, resize, resetView, zoomAt, pan, cellAt, draw, view };
})();
