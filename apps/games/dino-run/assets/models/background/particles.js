/** Ambient particles (snow, embers, bubbles, fireflies, dust, sprinkles) — pure functions of the clock. */
DR.bg.particles = {
  draw(ctx, e, th) {
    const f = this.styles[th.fxStyle];
    if (f) f(ctx, e, th.pal);
  },
  styles: {
    flakes(ctx, e, P) {
      for (let i = 0; i < 46; i++) {
        const u = DRX.hash(i + 1), v = DRX.hash(i + 101), w = DRX.hash(i + 201), fall = e.groundY + 16;
        const x = (((u * e.W + Math.sin(e.clock * (0.6 + w) + i) * 14 - e.dist * 0.12 * (0.4 + v)) % e.W) + e.W) % e.W;
        const y = (v * fall + e.clock * (24 + w * 46)) % fall, r = 0.9 + w * 1.9;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.55 + w * 0.4) + ')'; ctx.beginPath(); ctx.arc(x, y, r, 0, DRX.PI2); ctx.fill();
      }
    },
    embers(ctx, e, P) {
      for (let i = 0; i < 34; i++) {
        const u = DRX.hash(i + 3), v = DRX.hash(i + 103), w = DRX.hash(i + 203), span = e.groundY * 0.95;
        const rise = ((v * span + e.clock * (18 + w * 40)) % span), k = rise / span;
        const x = (((u * e.W + Math.sin(e.clock * 2 + i * 1.3) * 10 - e.dist * 0.2 * (0.4 + w)) % e.W) + e.W) % e.W, y = e.groundY - rise;
        ctx.fillStyle = DRX.alpha(w > 0.5 ? '#fb923c' : '#fde047', (1 - k) * 0.9); const r = 1 + w * 1.6; ctx.fillRect(x - r / 2, y - r / 2, r, r);
      }
    },
    bubbles(ctx, e, P) {
      ctx.lineWidth = 1;
      for (let i = 0; i < 28; i++) {
        const u = DRX.hash(i + 7), v = DRX.hash(i + 107), w = DRX.hash(i + 207), span = e.H + 20;
        const rise = (v * span + e.clock * (14 + w * 30)) % span, x = (((u * e.W + Math.sin(e.clock * 1.4 + i) * 8 - e.dist * 0.08) % e.W) + e.W) % e.W, r = 1.8 + w * 4.2;
        ctx.strokeStyle = 'rgba(207,250,254,' + (0.35 + 0.35 * w) + ')'; ctx.beginPath(); ctx.arc(x, e.H - rise, r, 0, DRX.PI2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x - r * 0.5, e.H - rise - r * 0.5, 1.2, 1.2);
      }
    },
    fireflies(ctx, e, P) {
      for (let i = 0; i < 16; i++) {
        const u = DRX.hash(i + 13), v = DRX.hash(i + 113), x = (((u * e.W + Math.sin(e.clock * 0.7 + i * 3) * 20 - e.dist * 0.05) % e.W) + e.W) % e.W;
        const y = e.groundY - 20 - v * e.groundY * 0.6 + Math.cos(e.clock * 0.9 + i) * 8, a = Math.max(0, Math.sin(e.clock * 1.6 + i * 2.1));
        const g = ctx.createRadialGradient(x, y, 0, x, y, 7); g.addColorStop(0, 'rgba(253,224,71,' + a + ')'); g.addColorStop(1, 'rgba(253,224,71,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 7, y - 7, 14, 14);
      }
    },
    dust(ctx, e, P) {
      ctx.fillStyle = 'rgba(253,186,116,0.35)';
      for (let i = 0; i < 24; i++) {
        const u = DRX.hash(i + 17), v = DRX.hash(i + 117), w = DRX.hash(i + 217), x = (((u * e.W * 1.2 - e.clock * (40 + w * 90) - e.dist * 0.4) % (e.W * 1.2)) + e.W * 1.2) % (e.W * 1.2);
        ctx.fillRect(x, e.groundY * 0.2 + v * (e.H - e.groundY * 0.2), 2 + w * 5, 1);
      }
    },
    sprinkles(ctx, e, P) {
      const cols = ['#fb7185', '#38bdf8', '#facc15', '#a78bfa', '#34d399'], fall = e.groundY + 10;
      for (let i = 0; i < 24; i++) {
        const u = DRX.hash(i + 19), v = DRX.hash(i + 119), w = DRX.hash(i + 219);
        const x = (((u * e.W + Math.sin(e.clock + i) * 10 - e.dist * 0.1) % e.W) + e.W) % e.W, y = (v * fall + e.clock * (18 + w * 26)) % fall;
        ctx.save(); ctx.translate(x, y); ctx.rotate(e.clock * (0.5 + w) + i); ctx.fillStyle = cols[i % 5]; DRX.rr(ctx, -3, -1, 6, 2.2, 1.1); ctx.fill(); ctx.restore();
      }
    },
  },
};
