/**
 * Dino Run — small drawing helpers shared by the models (plain script, global DRX).
 * Everything is deterministic (no Math.random) so a frame is a pure function of the game state.
 */
const DRX = {
  PI2: Math.PI * 2,
  /** Rounded-rectangle path (same arcTo form the original game used). */
  rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },
  /** Ellipse path. */
  ell(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2);
  },
  /** Closed polygon path from [x, y, x, y, ...]. */
  poly(ctx, p) {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.closePath();
  },
  /** Deterministic pseudo-random 0..1 from an integer. */
  hash(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  },
  clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },
  lerp(a, b, t) { return a + (b - a) * t; },
  /** '#rrggbb' -> [r, g, b]. */
  rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },
  /** Mix two '#rrggbb' colours (t = 0..1) -> '#rrggbb'. */
  mix(a, b, t) {
    const A = DRX.rgb(a), B = DRX.rgb(b);
    const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  },
  /** '#rrggbb' + alpha -> 'rgba(...)'. */
  alpha(hex, a) {
    const c = DRX.rgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  },
  /** Run-cycle helpers from d.phase: step is 0/1 (original alternating legs), sw is a smooth -1..1 swing. */
  step(d) { return Math.floor(d.phase) % 2; },
  sw(d, k) { return d.pose === 'run' ? Math.sin(d.phase * Math.PI * (k || 1)) : 0; },
  /** Linear vertical gradient helper. */
  vgrad(ctx, y0, y1, stops) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
    return g;
  },
  /** Draws a small X (dead eye) centred on x, y. */
  deadEye(ctx, x, y, r, color) {
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.2, r * 0.45); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
    ctx.stroke();
    ctx.lineCap = 'butt';
  },
  /** Shield ring around the dino (same look in every theme). */
  shield(ctx, d, rgb, blink) {
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.4 + 0.4 * Math.sin(blink * 20)) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(d.x + d.w / 2, d.y + d.h / 2, Math.max(d.w, d.h) * 0.7, 0, Math.PI * 2);
    ctx.stroke();
  },
};
