/** Jellyfish — a glowing, pulsing bell with trailing tentacles. */
DR.registerObstacle({
  id: 'jellyfish',
  kind: 'air',
  draw(ctx, o, env) {
    const cx = o.x + o.w / 2, p = (Math.sin(o.flap * 0.9) + 1) / 2;       // pulse 0..1
    const bw = 17 - p * 3, bh = 13 + p * 2.5, by = o.y + 3 + bh;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {                                           // tentacles
      const x0 = cx - bw + 4 + i * (bw * 2 - 8) / 5;
      ctx.strokeStyle = DRX.alpha(i % 2 ? '#f0abfc' : '#a5f3fc', 0.8); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x0, by - 1);
      for (let k = 1; k <= 5; k++) ctx.lineTo(x0 + Math.sin(env.clock * 5 + i + k * 0.9) * 2.2, by - 1 + k * (o.y + o.h + 6 - by) / 5 * (0.85 + (i % 2) * 0.25));
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 10;
    const g = ctx.createRadialGradient(cx, by - bh * 0.6, 2, cx, by - bh * 0.4, bw + 4);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.6, 'rgba(244,114,182,0.75)'); g.addColorStop(1, 'rgba(103,232,249,0.65)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(cx - bw, by);
    ctx.bezierCurveTo(cx - bw, by - bh * 1.5, cx + bw, by - bh * 1.5, cx + bw, by);
    for (let i = 0; i < 5; i++) ctx.quadraticCurveTo(cx + bw - (i + 0.5) * bw * 0.4, by + 3.5, cx + bw - (i + 1) * bw * 0.4, by);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; DRX.ell(ctx, cx - bw * 0.35, by - bh * 0.8, 4, 2, -0.5); ctx.fill();
    ctx.fillStyle = '#4c1d95'; ctx.beginPath(); ctx.arc(cx - 4, by - 5, 1.3, 0, DRX.PI2); ctx.arc(cx + 4, by - 5, 1.3, 0, DRX.PI2); ctx.fill();
    ctx.restore();
  },
});
