/** Clouds — drawn at the game's scrolling cloud positions ({x, y, s}). 'puff' is the original. */
DR.bg.clouds = {
  draw(ctx, env, th) {
    const f = this.styles[th.cloudStyle];
    if (f) f(ctx, env, th.pal);
  },
  styles: {
    puff(ctx, e, P) {
      ctx.fillStyle = P.cloud;
      for (const c of e.clouds) {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 28 * c.s, 10 * c.s, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x + 18 * c.s, c.y + 2, 20 * c.s, 8 * c.s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    gummy(ctx, e, P) {                                          // plump candy clouds with a highlight
      for (const c of e.clouds) {
        const s = c.s * 1.15;
        ctx.fillStyle = P.cloud;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 11 * s, 0, DRX.PI2); ctx.arc(c.x + 14 * s, c.y - 6 * s, 14 * s, 0, DRX.PI2); ctx.arc(c.x + 30 * s, c.y, 11 * s, 0, DRX.PI2);
        ctx.rect(c.x, c.y, 30 * s, 11 * s); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; DRX.ell(ctx, c.x + 9 * s, c.y - 8 * s, 6 * s, 2.5 * s, -0.5); ctx.fill();
      }
    },
    soft(ctx, e, P) {                                           // big soft three-lobed clouds
      ctx.fillStyle = P.cloud;
      for (const c of e.clouds) {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 30 * c.s, 9 * c.s, 0, 0, DRX.PI2); ctx.ellipse(c.x + 16 * c.s, c.y - 5 * c.s, 20 * c.s, 10 * c.s, 0, 0, DRX.PI2); ctx.ellipse(c.x + 34 * c.s, c.y + 1, 22 * c.s, 8 * c.s, 0, 0, DRX.PI2);
        ctx.fill();
      }
    },
    dust(ctx, e, P) {                                           // wispy dust streaks
      for (const c of e.clouds) {
        const g = ctx.createLinearGradient(c.x - 40 * c.s, 0, c.x + 60 * c.s, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, P.cloud); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; DRX.ell(ctx, c.x + 10 * c.s, c.y, 50 * c.s, 4 * c.s); ctx.fill(); DRX.ell(ctx, c.x + 24 * c.s, c.y + 7 * c.s, 34 * c.s, 3 * c.s); ctx.fill();
      }
    },
    smoke(ctx, e, P) {                                          // dark smoke puffs
      ctx.fillStyle = P.cloud;
      for (const c of e.clouds) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 10 * c.s, 0, DRX.PI2); ctx.arc(c.x + 12 * c.s, c.y - 5 * c.s, 13 * c.s, 0, DRX.PI2); ctx.arc(c.x + 26 * c.s, c.y - 1, 10 * c.s, 0, DRX.PI2); ctx.arc(c.x + 38 * c.s, c.y + 2, 7 * c.s, 0, DRX.PI2);
        ctx.fill();
      }
    },
    outline(ctx, e, P) {                                        // glowing wireframe clouds (neon)
      ctx.save(); ctx.shadowColor = P.gA; ctx.shadowBlur = 8; ctx.strokeStyle = P.cloud; ctx.lineWidth = 1.6;
      for (const c of e.clouds) {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 28 * c.s, 10 * c.s, 0, Math.PI * 0.85, Math.PI * 2.15);
        ctx.ellipse(c.x + 18 * c.s, c.y + 2, 20 * c.s, 8 * c.s, 0, Math.PI * 1.2, Math.PI * 2.4);
        ctx.stroke();
      }
      ctx.restore();
    },
    rays(ctx, e, P) {                                           // slow light shafts from the surface (ocean)
      ctx.fillStyle = P.cloud;
      for (let i = 0; i < 5; i++) {
        const x = ((DRX.hash(i + 2) * e.W * 1.2 + e.clock * 6 * (1 + i * 0.2) + e.dist * 0.03) % (e.W * 1.2)) - e.W * 0.1, w = 16 + DRX.hash(i + 8) * 26;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w * 2.4 - 30, e.groundY); ctx.lineTo(x - 30, e.groundY); ctx.closePath(); ctx.fill();
      }
    },
  },
};
