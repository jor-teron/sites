/* Body look: planet (also moons and gas giants) — disc, soft night-side shadow, optional ring (b.ring). */
window.GS = window.GS || {}; GS.BODIES = GS.BODIES || {};
GS.BODIES.planet = {
  draw(cx, b, r, z) {
    cx.fillStyle = b.col; cx.beginPath(); cx.arc(b.x, b.y, r, 0, 7); cx.fill();
    if (r * z > 3) { cx.fillStyle = 'rgba(0,0,0,.35)'; cx.beginPath(); cx.arc(b.x + r * 0.35, b.y + r * 0.35, r * 0.85, 0, 7); cx.fill(); }
    if (b.ring) { cx.strokeStyle = 'rgba(230,210,150,.7)'; cx.lineWidth = 1.2 / z; cx.beginPath(); cx.ellipse(b.x, b.y, r * 1.9, r * 0.6, -0.4, 0, 7); cx.stroke(); }
  }
};
