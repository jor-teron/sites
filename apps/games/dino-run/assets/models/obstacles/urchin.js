/** Sea urchin — a purple spiny ball with long spines fanning upward. */
DR.registerObstacle({
  id: 'urchin',
  kind: 'ground',
  draw(ctx, o, env, th) {
    const gy = o.y + o.h, cx = o.x + o.w / 2, r = o.w / 2 + 4, cy = gy - r;
    ctx.lineCap = 'round';
    const n = 17;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * 0.95 + (Math.PI * 0.9) * i / (n - 1) + Math.PI * 0.025, mid = 1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
      const len = r + 3 + (o.h - r * 2) * Math.pow(mid, 1.6) * 0.9 + (i % 2) * 2;
      const sw = Math.sin(env.clock * 2 + i) * 0.03;
      ctx.strokeStyle = i % 2 ? '#7c3aed' : '#a78bfa'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6);
      ctx.lineTo(cx + Math.cos(a + sw) * (r + len * 0.6 + 4), cy + Math.sin(a + sw) * (r + len * 0.6 + 4)); ctx.stroke();
      if (mid > 0.6) { ctx.strokeStyle = '#4c1d95'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6); ctx.lineTo(cx + Math.cos(a) * (r + len * 0.35), cy + Math.sin(a) * (r + len * 0.35)); ctx.stroke(); }
    }
    ctx.lineCap = 'butt';
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 1, cx, cy, r);
    g.addColorStop(0, '#8b5cf6'); g.addColorStop(1, '#3b0764');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, DRX.PI2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; DRX.ell(ctx, cx - r * 0.35, cy - r * 0.4, r * 0.28, r * 0.16, -0.6); ctx.fill();
  },
});
