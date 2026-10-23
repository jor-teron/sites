/** Smooth Dino — rounded glossy teal, gradient belly, big friendly eyes, gentle bounce. */
DR.registerDino({
  id: 'smooth',
  name: 'Smooth Dino',
  eye(d) { return d.pose === 'duck' ? [47, 8] : [34, 9]; },
  draw(ctx, d) {
    const dead = d.pose === 'dead', duck = d.pose === 'duck';
    const bounce = d.pose === 'run' ? Math.abs(Math.sin(d.phase * Math.PI * 0.9)) : 0;
    const gy = duck ? 28 : 48;
    ctx.save();
    ctx.translate(d.x + 22, d.y + gy);                       // squash & stretch about the feet
    ctx.scale(1 - bounce * 0.015, 1 + bounce * 0.05 - (dead ? 0.06 : 0));
    ctx.translate(-22, -gy - bounce * 2.5);
    const body = ctx.createLinearGradient(0, 0, 0, gy);
    body.addColorStop(0, '#5eead4'); body.addColorStop(0.6, '#14b8a6'); body.addColorStop(1, '#0f766e');
    const belly = ctx.createLinearGradient(0, 18, 0, 44);
    belly.addColorStop(0, '#ccfbf1'); belly.addColorStop(1, '#5eead4');
    // legs (rounded nubs)
    const a = d.pose === 'run' ? Math.sin(d.phase * Math.PI) : 0;
    ctx.fillStyle = '#0f766e';
    if (!duck) {
      DRX.rr(ctx, 9 + a * 3, 38, 9, 11 - Math.max(0, -a) * 4, 4.5); ctx.fill();
      DRX.rr(ctx, 22 - a * 3, 38, 9, 11 - Math.max(0, a) * 4, 4.5); ctx.fill();
    } else {
      DRX.rr(ctx, 10 + a * 3, 21, 9, 7, 3.5); ctx.fill();
      DRX.rr(ctx, 28 - a * 3, 21, 9, 7, 3.5); ctx.fill();
    }
    ctx.fillStyle = body;
    if (duck) {
      DRX.rr(ctx, 0, 5, 46, 22, 11); ctx.fill();
      DRX.rr(ctx, 32, 0, 24, 19, 9.5); ctx.fill();
      ctx.fillStyle = belly; DRX.ell(ctx, 22, 21, 15, 4.5); ctx.fill();
    } else {
      DRX.poly(ctx, [9, 26, -1, 35, 12, 38]); ctx.fill();    // tail
      ctx.beginPath(); ctx.arc(-1, 35, 1.8, 0, DRX.PI2); ctx.fill();
      DRX.rr(ctx, 4, 14, 29, 30, 13); ctx.fill();
      DRX.rr(ctx, 17, 0, 27, 23, 11); ctx.fill();
      ctx.fillStyle = belly; DRX.ell(ctx, 21, 32, 8.5, 10.5); ctx.fill();
      ctx.fillStyle = body; DRX.rr(ctx, 15, 25, 7, 4, 2); ctx.fill();   // little arm
    }
    // gloss
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    if (duck) { DRX.ell(ctx, 16, 9, 9, 2.2, -0.05); ctx.fill(); DRX.ell(ctx, 41, 4, 5, 1.7, -0.2); ctx.fill(); }
    else { DRX.ell(ctx, 11, 22, 2.6, 6.5, 0.15); ctx.fill(); DRX.ell(ctx, 27, 4.5, 6, 2, -0.15); ctx.fill(); }
    // face
    const ex = duck ? 46 : 34, ey = duck ? 8 : 9;
    if (dead) {
      DRX.deadEye(ctx, ex, ey, 3, '#134e4a');
      ctx.fillStyle = '#fb7185'; DRX.rr(ctx, ex - 1, ey + 5, 5, 6, 2.5); ctx.fill();
    } else {
      ctx.fillStyle = '#fff'; DRX.ell(ctx, ex, ey, 5.4, 6); ctx.fill();
      ctx.fillStyle = '#134e4a'; DRX.ell(ctx, ex + 1.4, ey + 0.8, 3.2, 3.8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 2.6, ey - 0.8, 1.2, 0, DRX.PI2); ctx.fill();
      ctx.strokeStyle = '#134e4a'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(ex + 2.5, ey + 9, 4.5, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.fillStyle = 'rgba(251,113,133,0.55)'; DRX.ell(ctx, ex - 5.5, ey + 6, 2.8, 1.8); ctx.fill();
    }
    ctx.restore();
  },
});
