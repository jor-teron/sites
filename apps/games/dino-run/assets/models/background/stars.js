/** Stars — deterministic, twinkling, drifting slowly with the ground. */
DR.bg.stars = {
  draw(ctx, e, th) {
    const f = this.styles[th.starStyle];
    if (f) f(ctx, e, th.pal);
  },
  styles: {
    twinkle(ctx, e, P) {
      for (let i = 0; i < 70; i++) {
        const lay = 0.3 + DRX.hash(i + 600) * 0.7;
        const x = (((DRX.hash(i) * e.W - e.dist * 0.01 * lay) % e.W) + e.W) % e.W, y = DRX.hash(i + 200) * e.groundY * 0.8;
        const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(e.clock * (1.5 + DRX.hash(i + 9) * 2.5) + i * 1.7)), r = 0.7 + DRX.hash(i + 300) * 1.1;
        ctx.fillStyle = 'rgba(255,255,240,' + a + ')'; ctx.fillRect(x - r / 2, y - r / 2, r, r);
        if (r > 1.5 && a > 0.8) { ctx.fillRect(x - 3, y - 0.4, 6, 0.8); ctx.fillRect(x - 0.4, y - 3, 0.8, 6); }
      }
    },
    dots(ctx, e, P) {                                           // a few faint pinpricks
      ctx.fillStyle = 'rgba(255,230,210,0.5)';
      for (let i = 0; i < 24; i++) ctx.fillRect(DRX.hash(i + 11) * e.W, DRX.hash(i + 71) * e.groundY * 0.55, 1.2, 1.2);
    },
    sparkle(ctx, e, P) {                                        // neon four-point sparkles
      ctx.save(); ctx.shadowColor = P.gA; ctx.shadowBlur = 6;
      for (let i = 0; i < 26; i++) {
        const x = (((DRX.hash(i + 5) * e.W - e.dist * 0.015) % e.W) + e.W) % e.W, y = DRX.hash(i + 55) * e.groundY * 0.7;
        const a = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(e.clock * 2 + i * 2.3)), r = 2 + DRX.hash(i + 99) * 2.5;
        ctx.strokeStyle = DRX.alpha(i % 2 ? P.gA : P.gB, a); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
      }
      ctx.restore();
    },
  },
};
