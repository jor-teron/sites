/** Antenna — a lattice mast with a dish and a blinking red light (Mars). */
DR.registerObstacle({
  id: 'antenna',
  kind: 'ground',
  draw(ctx, o, env, th) {
    const gy = o.y + o.h, cx = o.x + o.w / 2, top = o.y + 6;
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - o.w * 0.45, gy); ctx.lineTo(cx - 1, top); ctx.moveTo(cx + o.w * 0.45, gy); ctx.lineTo(cx + 1, top); ctx.stroke();
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1;
    const n = 5;                                                       // cross bracing
    for (let i = 0; i < n; i++) {
      const y0 = gy - (gy - top) * i / n, y1 = gy - (gy - top) * (i + 1) / n, w0 = o.w * 0.45 * (1 - i / n), w1 = o.w * 0.45 * (1 - (i + 1) / n);
      ctx.beginPath(); ctx.moveTo(cx - w0, y0); ctx.lineTo(cx + w1, y1); ctx.moveTo(cx + w0, y0); ctx.lineTo(cx - w1, y1); ctx.stroke();
    }
    ctx.fillStyle = '#e2e8f0'; ctx.strokeStyle = '#94a3b8';                  // dish
    ctx.beginPath(); ctx.ellipse(cx - 2, top + 4, 9, 4, -0.5, 0.2, Math.PI + 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#e2e8f0'; ctx.beginPath(); ctx.moveTo(cx - 2, top + 4); ctx.lineTo(cx + 3, top - 4); ctx.stroke();
    ctx.fillStyle = Math.sin(env.clock * 6) > 0 ? '#f87171' : '#7f1d1d';
    ctx.beginPath(); ctx.arc(cx, o.y + 1, 2.2, 0, DRX.PI2); ctx.fill();
    if (Math.sin(env.clock * 6) > 0) { ctx.fillStyle = 'rgba(248,113,113,0.3)'; ctx.beginPath(); ctx.arc(cx, o.y + 1, 5, 0, DRX.PI2); ctx.fill(); }
  },
});
