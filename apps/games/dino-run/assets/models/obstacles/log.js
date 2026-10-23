/** Standing log — a broken jungle stump with bark, a ringed top and moss. */
DR.registerObstacle({
  id: 'log',
  kind: 'ground',
  draw(ctx, o, env, th) {
    const gy = o.y + o.h, w = o.w + 6, x = o.x - 3, rx = w / 2;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#5b3a1e'); g.addColorStop(0.5, '#8a5a2b'); g.addColorStop(1, '#4a2e17');
    ctx.fillStyle = g;
    DRX.poly(ctx, [x, gy, x + 1, o.y + 4, x + w * 0.3, o.y + 1, x + w * 0.55, o.y + 5, x + w * 0.85, o.y, x + w - 1, o.y + 4, x + w, gy]); ctx.fill();
    ctx.strokeStyle = 'rgba(30,15,5,0.55)'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + w * i / 4, o.y + 6); ctx.lineTo(x + w * i / 4 + (i % 2 ? 1 : -1), gy); ctx.stroke(); }
    ctx.fillStyle = '#d6a566'; DRX.ell(ctx, x + rx, o.y + 4, rx - 1, 3); ctx.fill();
    ctx.strokeStyle = '#8a5a2b'; DRX.ell(ctx, x + rx, o.y + 4, rx * 0.5, 1.5); ctx.stroke();
    ctx.fillStyle = '#4ade80'; DRX.rr(ctx, x - 1, o.y + o.h * 0.5, w * 0.6, 5, 2.5); ctx.fill();   // moss
    ctx.fillStyle = '#22c55e'; DRX.rr(ctx, x + w * 0.45, o.y + o.h * 0.25, w * 0.5, 4, 2); ctx.fill();
    ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 1.5;                                               // vine
    ctx.beginPath(); ctx.moveTo(x + w * 0.7, o.y + 5); ctx.quadraticCurveTo(x + w + 4, o.y + o.h * 0.4, x + w * 0.6, o.y + o.h * 0.75); ctx.stroke();
  },
});
