/* Body look: star — warm glow halo plus a bright disc. Looks: draw(cx, b, r, z) in world space (r = on-screen-safe radius). */
window.GS = window.GS || {}; GS.BODIES = GS.BODIES || {};
GS.BODIES.star = {
  draw(cx, b, r) {
    const g = cx.createRadialGradient(b.x, b.y, r * 0.3, b.x, b.y, r * 3);
    g.addColorStop(0, b.col); g.addColorStop(1, 'rgba(255,200,80,0)'); cx.fillStyle = g;
    cx.beginPath(); cx.arc(b.x, b.y, r * 3, 0, 7); cx.fill();
    cx.fillStyle = b.col; cx.beginPath(); cx.arc(b.x, b.y, r, 0, 7); cx.fill();
  }
};
