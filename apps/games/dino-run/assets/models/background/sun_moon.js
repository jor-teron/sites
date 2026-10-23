/** Sun / moon — celestial bodies placed in the upper sky. */
DR.bg.sunmoon = {
  draw(ctx, e, th) {
    const f = this.styles[th.sunStyle];
    if (f) f(ctx, e, th.pal, e.W * (th.sunX || 0.8), e.groundY * (th.sunY || 0.28));
  },
  styles: {
    crescent(ctx, e, P, x, y) {                                 // night crescent with a soft glow
      const g = ctx.createRadialGradient(x, y, 6, x, y, 70);
      g.addColorStop(0, 'rgba(254,243,199,0.35)'); g.addColorStop(1, 'rgba(254,243,199,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 70, y - 70, 140, 140);
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, 22, 0, DRX.PI2); ctx.clip();
      ctx.fillStyle = '#fef3c7'; ctx.fillRect(x - 22, y - 22, 44, 44);
      ctx.fillStyle = P.skyTop; ctx.beginPath(); ctx.arc(x + 11, y - 6, 20, 0, DRX.PI2); ctx.fill();
      ctx.restore();
    },
    pale(ctx, e, P, x, y) {                                     // low arctic sun with a halo
      const g = ctx.createRadialGradient(x, y, 4, x, y, 80);
      g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(0.3, 'rgba(255,244,214,0.35)'); g.addColorStop(1, 'rgba(255,244,214,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 80, y - 80, 160, 160);
      ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.arc(x, y, 13, 0, DRX.PI2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 36, 0, DRX.PI2); ctx.stroke();
    },
    sun(ctx, e, P, x, y) {                                      // warm sun with rays
      const g = ctx.createRadialGradient(x, y, 6, x, y, 90);
      g.addColorStop(0, DRX.alpha(P.sun || '#fde047', 0.55)); g.addColorStop(1, DRX.alpha(P.sun || '#fde047', 0));
      ctx.fillStyle = g; ctx.fillRect(x - 90, y - 90, 180, 180);
      ctx.strokeStyle = DRX.alpha(P.sun || '#fde047', 0.5); ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + e.clock * 0.1; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 24, y + Math.sin(a) * 24); ctx.lineTo(x + Math.cos(a) * 33, y + Math.sin(a) * 33); ctx.stroke(); }
      ctx.lineCap = 'butt';
      ctx.fillStyle = P.sun || '#fde047'; ctx.beginPath(); ctx.arc(x, y, 18, 0, DRX.PI2); ctx.fill();
    },
    moons2(ctx, e, P, x, y) {                                   // Mars: two lumpy moons
      const moon = (mx, my, r, c) => {
        ctx.fillStyle = c; DRX.ell(ctx, mx, my, r * 1.15, r, 0.3); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(mx - r * 0.3, my - r * 0.1, r * 0.28, 0, DRX.PI2); ctx.arc(mx + r * 0.35, my + r * 0.3, r * 0.2, 0, DRX.PI2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; DRX.ell(ctx, mx - r * 0.3, my - r * 0.45, r * 0.5, r * 0.18, -0.4); ctx.fill();
      };
      moon(x, y, 19, '#e2c7a6'); moon(x - 62, y + 26, 8, '#c9b49b');
    },
    candy(ctx, e, P, x, y) {                                    // a swirl-lollipop sun
      ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(x, y, 22, 0, DRX.PI2); ctx.fill();
      ctx.strokeStyle = '#fb7185'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath();
      for (let a = 0; a < 15; a += 0.4) { const r = a / 15 * 17, px = x + Math.cos(a + e.clock * 0.3) * r, py = y + Math.sin(a + e.clock * 0.3) * r; a ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke(); ctx.lineCap = 'butt';
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; DRX.ell(ctx, x - 8, y - 11, 6, 2.5, -0.6); ctx.fill();
    },
    ember(ctx, e, P, x, y) {                                    // a huge red sun smouldering through the ash
      const g = ctx.createRadialGradient(x, y, 10, x, y, 110);
      g.addColorStop(0, 'rgba(248,113,113,0.6)'); g.addColorStop(0.5, 'rgba(220,38,38,0.22)'); g.addColorStop(1, 'rgba(220,38,38,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 110, y - 110, 220, 220);
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(x, y, 26, 0, DRX.PI2); ctx.fill();
      ctx.fillStyle = 'rgba(80,10,10,0.45)'; for (let i = 0; i < 3; i++) { ctx.fillRect(x - 26, y - 4 + i * 8 + Math.sin(e.clock + i) * 1.5, 52, 3); }
    },
    synth(ctx, e, P, x, y) {                                    // synthwave sun: gradient disc cut by stripes
      ctx.save();
      ctx.shadowColor = P.gB; ctx.shadowBlur = 24;
      const g = ctx.createLinearGradient(0, y - 30, 0, y + 30);
      g.addColorStop(0, '#fde047'); g.addColorStop(0.5, P.gB); g.addColorStop(1, P.gA);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 30, 0, DRX.PI2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = P.skyBottom;
      for (let i = 0; i < 5; i++) ctx.fillRect(x - 31, y + 2 + i * 6, 62, 1 + i * 0.9);
    },
  },
};
