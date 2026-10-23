/** Ice spikes — a cluster of jagged ice crystals. */
DR.registerObstacle({
  id: 'ice_spike',
  kind: 'ground',
  draw(ctx, o, env, th) {
    const gy = o.y + o.h, cx = o.x + o.w / 2;
    const spike = (x, hw, hh, c0, c1) => {
      const g = ctx.createLinearGradient(x - hw, gy - hh, x + hw, gy);
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      ctx.fillStyle = g; DRX.poly(ctx, [x - hw, gy, x - hw * 0.25, gy - hh * 0.8, x, gy - hh, x + hw * 0.4, gy - hh * 0.75, x + hw, gy]); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; DRX.poly(ctx, [x - hw * 0.4, gy, x, gy - hh, x + hw * 0.05, gy]); ctx.fill();
    };
    spike(cx - o.w * 0.55, o.w * 0.45 + 2, o.h * 0.6, '#e0f7ff', '#7dd3fc');
    spike(cx + o.w * 0.6, o.w * 0.4 + 2, o.h * 0.5, '#e0f7ff', '#7dd3fc');
    spike(cx, o.w * 0.55 + 3, o.h, '#f0fbff', '#38bdf8');
    ctx.strokeStyle = 'rgba(14,116,144,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - 2, gy - o.h * 0.3); ctx.lineTo(cx + 1, gy - o.h * 0.55); ctx.stroke();
  },
});
