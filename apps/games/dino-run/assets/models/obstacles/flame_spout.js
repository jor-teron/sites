/** Flame spout — a vent that shoots a flickering column of fire. */
DR.registerObstacle({
  id: 'flame_spout',
  kind: 'ground',
  draw(ctx, o, env, th) {
    const gy = o.y + o.h, cx = o.x + o.w / 2, t = env.clock * 13 + o.v * 1.7, hw = o.w / 2 + 3;
    ctx.fillStyle = '#292524'; DRX.poly(ctx, [cx - hw - 3, gy, cx - hw + 1, gy - 8, cx + hw - 1, gy - 8, cx + hw + 3, gy]); ctx.fill();
    ctx.fillStyle = '#f97316'; ctx.fillRect(cx - hw + 2, gy - 8, hw * 2 - 4, 2);
    const tongue = (k, c0, c1, w, hgt, ph) => {
      const sw = Math.sin(t + ph) * 3 * k, top = gy - 8 - (o.h - 8) * hgt * (0.93 + 0.07 * Math.sin(t * 1.3 + ph));
      const g = ctx.createLinearGradient(0, top, 0, gy - 8);
      g.addColorStop(0, c1); g.addColorStop(1, c0);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx - w, gy - 8);
      ctx.bezierCurveTo(cx - w * 1.3 + sw * 0.4, gy - 8 - (gy - 8 - top) * 0.45, cx - w * 0.5 + sw, top + (gy - top) * 0.25, cx + sw, top);
      ctx.bezierCurveTo(cx + w * 0.5 + sw, top + (gy - top) * 0.25, cx + w * 1.3 + sw * 0.4, gy - 8 - (gy - 8 - top) * 0.45, cx + w, gy - 8);
      ctx.closePath(); ctx.fill();
    };
    ctx.save(); ctx.shadowColor = '#f97316'; ctx.shadowBlur = 10;
    tongue(1, '#dc2626', 'rgba(239,68,68,0.15)', hw, 1, 0);
    ctx.restore();
    tongue(0.8, '#f97316', 'rgba(251,146,60,0.2)', hw * 0.72, 0.8, 1.7);
    tongue(0.6, '#fde047', 'rgba(254,240,138,0.2)', hw * 0.4, 0.55, 3.1);
  },
});
