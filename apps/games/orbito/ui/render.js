/*
 * Orbito — canvas renderer (ORB-1). No game loop: draw() runs only when something changes
 * (tap, theme, resize) or while a short animation (ui/anim.js) is running.
 * Draws the board, the two ring tracks with counter-clockwise arrows, the 16 holes, the marbles,
 * the picked rival marble and where it may go, the last marble placed and the winning line.
 * During an animation: a marble sliding one square, or every marble moving one step round its ring.
 * Uses ORB_CONFIG + OrbRules.ROT + OB_SETTINGS.
 */
const OBRender = (() => {
  const C = ORB_CONFIG, N = C.n;
  let cv, cx, cell = 60, margin = 40, px = 300, dpr = 1;
  let st = { b: new Array(16).fill(0), sel: -1, targets: [], last: -1, line: null, moved: -1 };
  let anim = null; // { kind: 'turn', from: board, t } | { kind: 'slide', a, b, color, t }

  const colors = () => OB_SETTINGS.isDark()
    ? { board: '#3b3f4a', rim: '#23262e', track: '#5b6170', hole: '#1b1d23', arrow: '#9aa3b5', black: '#0b0b0c', white: '#ecebe6', sel: '#f59e0b', target: '#22c55e', line: '#f43f5e', last: '#60a5fa' }
    : { board: '#d9dee7', rim: '#9aa3b5', track: '#b6bfcd', hole: '#8a94a6', arrow: '#5b6577', black: '#111111', white: '#fbfaf6', sel: '#d97706', target: '#16a34a', line: '#e11d48', last: '#2563eb' };

  function init(canvas) { cv = canvas; cx = cv.getContext('2d'); }
  function resize(wrap) {
    if (!cv) return;
    const side = Math.max(140, Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight)));
    cell = side / (N + 0.6); margin = cell * 0.8; px = side;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = side + 'px'; cv.style.height = side + 'px';
    cv.width = Math.round(side * dpr); cv.height = Math.round(side * dpr);
    draw();
  }
  /** Square under client (x, y), or -1. */
  function cellAt(clientX, clientY) {
    const r = cv.getBoundingClientRect(), k = r.width / px;
    const fx = ((clientX - r.left) / k - margin) / cell + 0.5, fy = ((clientY - r.top) / k - margin) / cell + 0.5;
    const x = Math.floor(fx), y = Math.floor(fy);
    return x >= 0 && y >= 0 && x < N && y < N ? y * N + x : -1;
  }
  const X = (i) => margin + (i % N) * cell, Y = (i) => margin + ((i / N) | 0) * cell;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  function marble(x, y, c, col) {
    const r = cell * 0.36;
    const g = cx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    if (c === 1) { g.addColorStop(0, '#6b7280'); g.addColorStop(1, col.black); } else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, col.white === '#fbfaf6' ? '#d6d3cb' : '#c9c6bd'); }
    cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
    cx.lineWidth = 1; cx.strokeStyle = 'rgba(0,0,0,.45)'; cx.stroke();
  }
  function ringPath(ring) {
    cx.beginPath(); ring.forEach((sq, k) => (k ? cx.lineTo(X(sq), Y(sq)) : cx.moveTo(X(sq), Y(sq)))); cx.closePath();
  }
  function arrows(ring, col) {
    cx.fillStyle = col.arrow;
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k], b = ring[(k - 1 + ring.length) % ring.length];         // marble on a moves to b
      if (X(a) !== X(b) && Y(a) !== Y(b)) continue;
      const mx = (X(a) + X(b)) / 2, my = (Y(a) + Y(b)) / 2, ang = Math.atan2(Y(b) - Y(a), X(b) - X(a)), s = cell * 0.09;
      cx.save(); cx.translate(mx, my); cx.rotate(ang);
      cx.beginPath(); cx.moveTo(s, 0); cx.lineTo(-s, -s * 0.9); cx.lineTo(-s, s * 0.9); cx.closePath(); cx.fill(); cx.restore();
    }
  }
  function draw() {
    if (!cx) return;
    const col = colors();
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, px, px);
    const pad = cell * 0.1, rr = cell * 0.35;
    cx.fillStyle = col.board; cx.strokeStyle = col.rim; cx.lineWidth = 2;
    cx.beginPath(); cx.roundRect ? cx.roundRect(pad, pad, px - 2 * pad, px - 2 * pad, rr) : cx.rect(pad, pad, px - 2 * pad, px - 2 * pad); cx.fill(); cx.stroke();
    // ring tracks
    cx.lineJoin = 'round'; cx.strokeStyle = col.track; cx.lineWidth = cell * 0.2;
    ringPath(C.outer); cx.stroke(); ringPath(C.inner); cx.stroke();
    arrows(C.outer, col); arrows(C.inner, col);
    // holes, targets
    for (let i = 0; i < 16; i++) {
      cx.fillStyle = col.hole; cx.beginPath(); cx.arc(X(i), Y(i), cell * 0.28, 0, Math.PI * 2); cx.fill();
    }
    // winning line(s) under the marbles
    if (st.line && !anim) {
      cx.fillStyle = col.line;
      for (const i of st.line) { cx.globalAlpha = 0.35; cx.beginPath(); cx.arc(X(i), Y(i), cell * 0.46, 0, Math.PI * 2); cx.fill(); }
      cx.globalAlpha = 1;
    }
    // marbles
    if (anim && anim.kind === 'turn') {
      const e = ease(anim.t), R = OrbRules.ROT;
      for (let i = 0; i < 16; i++) if (anim.from[i]) {
        const j = R[i];
        marble(X(i) + (X(j) - X(i)) * e, Y(i) + (Y(j) - Y(i)) * e, anim.from[i], col);
      }
    } else {
      for (let i = 0; i < 16; i++) {
        if (!st.b[i]) continue;
        if (anim && anim.kind === 'slide' && i === anim.b) continue;
        marble(X(i), Y(i), st.b[i], col);
      }
      if (anim && anim.kind === 'slide') {
        const e = ease(anim.t); marble(X(anim.a) + (X(anim.b) - X(anim.a)) * e, Y(anim.a) + (Y(anim.b) - Y(anim.a)) * e, anim.color, col);
      }
      if (st.last >= 0 && st.b[st.last]) {
        cx.fillStyle = col.last; cx.beginPath(); cx.arc(X(st.last), Y(st.last), cell * 0.07, 0, Math.PI * 2); cx.fill();
      }
      if (st.moved >= 0 && st.b[st.moved]) {
        cx.strokeStyle = col.sel; cx.setLineDash([4, 4]); cx.lineWidth = 2;
        cx.beginPath(); cx.arc(X(st.moved), Y(st.moved), cell * 0.42, 0, Math.PI * 2); cx.stroke(); cx.setLineDash([]);
      }
      if (st.sel >= 0) {
        cx.strokeStyle = col.sel; cx.lineWidth = 3;
        cx.beginPath(); cx.arc(X(st.sel), Y(st.sel), cell * 0.43, 0, Math.PI * 2); cx.stroke();
        cx.fillStyle = col.target;
        for (const t of st.targets) { cx.beginPath(); cx.arc(X(t), Y(t), cell * 0.12, 0, Math.PI * 2); cx.fill(); }
      }
    }
  }
  function set(s) { st = Object.assign({}, st, s); draw(); }
  function setAnim(a) { anim = a; draw(); }
  return { init, resize, cellAt, draw, set, setAnim, center: (i) => ({ x: X(i), y: Y(i), px }) };
})();
