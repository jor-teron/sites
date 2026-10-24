/* Body look: black hole — soft amber/violet glow, a thin bright photon ring, and a pure black core. No label. */
window.GS = window.GS || {}; GS.BODIES = GS.BODIES || {};
GS.BODIES.hole = {
  trail: '#a6f', label: false,
  draw(cx, b, r, z) {
    const g = cx.createRadialGradient(b.x, b.y, r, b.x, b.y, r * 2.6);
    g.addColorStop(0, 'rgba(255,205,150,0.55)'); g.addColorStop(0.25, 'rgba(190,140,255,0.22)'); g.addColorStop(1, 'rgba(120,90,200,0)');
    cx.fillStyle = g; cx.beginPath(); cx.arc(b.x, b.y, r * 2.6, 0, 7); cx.fill();
    cx.strokeStyle = 'rgba(255,222,180,0.8)'; cx.lineWidth = Math.max(1, r * 0.12 * z) / z; cx.beginPath(); cx.arc(b.x, b.y, r * 1.12, 0, 7); cx.stroke();
    cx.fillStyle = '#000'; cx.beginPath(); cx.arc(b.x, b.y, r, 0, 7); cx.fill();
  }
};
