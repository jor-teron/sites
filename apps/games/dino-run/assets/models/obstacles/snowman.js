/** Snowman — three snowballs, coal eyes, carrot nose and a red scarf. */
DR.registerObstacle({
  id: 'snowman',
  kind: 'ground',
  draw(ctx, o, env, th) {
    const gy = o.y + o.h, cx = o.x + o.w / 2, k = o.h / 54;
    const r1 = 14 * k, r2 = 10.5 * k, r3 = 7.8 * k;
    const y1 = gy - r1, y2 = y1 - r1 * 0.75 - r2 * 0.7, y3 = y2 - r2 * 0.75 - r3 * 0.7;
    const ball = (x, y, r) => {
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c7e3f7');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, DRX.PI2); ctx.fill();
    };
    ctx.strokeStyle = '#7c4a21'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';               // stick arms
    ctx.beginPath(); ctx.moveTo(cx - r2 * 0.8, y2); ctx.lineTo(cx - r1 - 3, y2 - 5); ctx.moveTo(cx + r2 * 0.8, y2); ctx.lineTo(cx + r1 + 3, y2 - 6); ctx.stroke();
    ctx.lineCap = 'butt';
    ball(cx, y1, r1); ball(cx, y2, r2); ball(cx, y3, r3);
    ctx.fillStyle = '#dc2626'; DRX.rr(ctx, cx - r3 * 0.95, y3 + r3 * 0.7, r3 * 1.9, 3 * k + 1, 1.5); ctx.fill();
    ctx.fillRect(cx + r3 * 0.3, y3 + r3 * 0.7, 3, 6 * k + 2);
    ctx.fillStyle = '#1e293b';
    ctx.beginPath(); ctx.arc(cx - r3 * 0.35, y3 - r3 * 0.2, 1.3, 0, DRX.PI2); ctx.arc(cx + r3 * 0.3, y3 - r3 * 0.2, 1.3, 0, DRX.PI2);
    ctx.arc(cx, y2 - r2 * 0.1, 1.1, 0, DRX.PI2); ctx.arc(cx, y2 + r2 * 0.35, 1.1, 0, DRX.PI2); ctx.fill();
    ctx.fillStyle = '#f97316'; DRX.poly(ctx, [cx - 1, y3 + 1, cx - 7 * k - 3, y3 + 2.5, cx - 1, y3 + 3.4]); ctx.fill();
    ctx.fillStyle = '#1e293b'; ctx.fillRect(cx - r3 * 0.9, y3 - r3 * 0.85, r3 * 1.8, 2); DRX.rr(ctx, cx - r3 * 0.55, y3 - r3 * 1.6, r3 * 1.1, r3 * 0.8, 1); ctx.fill();
  },
});
