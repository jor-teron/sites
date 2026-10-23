/** Lava rock — charcoal rock split by glowing, pulsing lava cracks. */
DR.registerObstacle({
  id: 'lava_rock',
  kind: 'ground',
  draw(ctx, o, env, th) {
    const gy = o.y + o.h, cx = o.x + o.w / 2, pulse = 0.65 + 0.35 * Math.sin(env.clock * 4 + o.v);
    const pts = [o.x - 4, gy, o.x - 2, o.y + o.h * 0.55, o.x + 3, o.y + o.h * 0.2, cx, o.y, o.x + o.w - 2, o.y + o.h * 0.25, o.x + o.w + 3, o.y + o.h * 0.6, o.x + o.w + 5, gy];
    const g = ctx.createLinearGradient(0, o.y, 0, gy);
    g.addColorStop(0, '#44403c'); g.addColorStop(1, '#1c1917');
    ctx.fillStyle = g; DRX.poly(ctx, pts); ctx.fill();
    ctx.save();
    DRX.poly(ctx, pts); ctx.clip();
    ctx.shadowColor = '#f97316'; ctx.shadowBlur = 6 * pulse;
    ctx.strokeStyle = DRX.alpha('#fb923c', 0.55 + 0.45 * pulse); ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 1, o.y + 2); ctx.lineTo(cx - 3, o.y + o.h * 0.35); ctx.lineTo(cx + 2, o.y + o.h * 0.55); ctx.lineTo(cx - 2, gy - 2);
    ctx.moveTo(cx - 3, o.y + o.h * 0.35); ctx.lineTo(o.x - 2, o.y + o.h * 0.5);
    ctx.moveTo(cx + 2, o.y + o.h * 0.55); ctx.lineTo(o.x + o.w + 3, o.y + o.h * 0.7); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(249,115,22,' + 0.25 * pulse + ')'; ctx.fillRect(o.x - 4, gy - 3, o.w + 9, 3);
  },
});
