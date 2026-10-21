/**
 * Car Run — pothole (obstacle) drawn flat on the road surface.
 * draw(ctx, p, o); o.scene / o.world as in assets/car.js. Jumping clears it.
 */
window.CAR_RUN_ASSETS = window.CAR_RUN_ASSETS || {};
window.CAR_RUN_ASSETS.pothole = {
  draw(ctx, p, o) {
    const { C, S } = o;
    const sc = o.scene;
    const near = sc.project(o.world.x, 0.002, o.world.z - S.potholeLen / 2);
    const far = sc.project(o.world.x, 0.002, o.world.z + S.potholeLen / 2);
    if (!near || !far) return;
    const cx = (near.x + far.x) / 2, cy = (near.y + far.y) / 2;
    const rx = (near.k + far.k) / 2 * S.potholeW / 2;
    const ry = Math.max(1, (near.y - far.y) / 2);
    // jagged rim
    ctx.fillStyle = C.potholeRim;
    ctx.beginPath();
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const j = 1.12 + ((i * 7) % 3) * 0.06;
      const px = cx + Math.cos(a) * rx * j, py = cy + Math.sin(a) * ry * j;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.pothole;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // lit far inner wall
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.lineWidth = Math.max(1, ry * 0.25);
    ctx.beginPath();
    ctx.ellipse(cx, cy + ry * 0.1, rx * 0.85, ry * 0.8, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  },
};
