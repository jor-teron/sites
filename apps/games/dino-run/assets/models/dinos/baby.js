/** Baby Dino — small and round, oversized head, tiny hop, eggshell on its head. */
DR.registerDino({
  id: 'baby',
  name: 'Baby Dino',
  eye(d) { return d.pose === 'duck' ? [40, 12] : [30, 22]; },
  draw(ctx, d) {
    const dead = d.pose === 'dead', duck = d.pose === 'duck';
    const hop = d.pose === 'run' ? Math.abs(Math.sin(d.phase * Math.PI)) * 4.5 : 0;
    const G1 = '#bef264', G2 = '#d9f99d', SP = '#84cc16', SHELL = '#fef3c7';
    ctx.save();
    ctx.translate(d.x, d.y);
    const shell = (cx, cy, rx, rot) => {                    // eggshell cap with a zig-zag edge
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      ctx.fillStyle = SHELL; ctx.strokeStyle = '#d6c28a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, rx * 0.8, 0, Math.PI, DRX.PI2);
      for (let i = 0; i <= 6; i++) ctx.lineTo(rx - i * rx / 3, (i % 2 ? -1 : 3.5));
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e7d9a8'; ctx.beginPath(); ctx.arc(-rx * 0.3, -rx * 0.45, 1.3, 0, DRX.PI2); ctx.arc(rx * 0.25, -rx * 0.5, 1, 0, DRX.PI2); ctx.fill();
      ctx.restore();
    };
    const face = (ex, ey) => {
      if (dead) { DRX.deadEye(ctx, ex, ey, 2.6, '#365314'); return; }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 5.2, 0, DRX.PI2); ctx.fill();
      ctx.fillStyle = '#1a2e05'; ctx.beginPath(); ctx.arc(ex + 1.2, ey + 0.6, 3.1, 0, DRX.PI2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 2.3, ey - 0.8, 1.1, 0, DRX.PI2); ctx.fill();
      ctx.strokeStyle = '#365314'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(ex + 4.5, ey + 7, 2.6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.fillStyle = 'rgba(251,113,133,0.6)'; DRX.ell(ctx, ex - 3.5, ey + 5.8, 2.6, 1.7); ctx.fill();
    };
    if (duck) {
      const sq = d.pose === 'duck' ? Math.sin(d.phase * Math.PI * 2) * 0.6 : 0;
      ctx.fillStyle = '#65a30d'; DRX.rr(ctx, 12 + sq, 22, 7, 6, 3); ctx.fill(); DRX.rr(ctx, 26 - sq, 22, 7, 6, 3); ctx.fill();
      ctx.fillStyle = G1; DRX.ell(ctx, 18, 16, 19, 10.5); ctx.fill();
      DRX.poly(ctx, [1, 14, -4, 19, 3, 20]); ctx.fill();
      ctx.fillStyle = G2; DRX.ell(ctx, 38, 12, 11, 10.5); ctx.fill();
      ctx.fillStyle = SP; ctx.beginPath(); ctx.arc(10, 12, 2, 0, DRX.PI2); ctx.arc(20, 10, 1.7, 0, DRX.PI2); ctx.fill();
      face(40, 12);
      shell(38, 4, 8, 0.2);
    } else {
      ctx.translate(0, -hop);
      const a = d.pose === 'run' ? Math.sin(d.phase * Math.PI) : 0;
      ctx.fillStyle = '#65a30d';
      DRX.rr(ctx, 11 + a * 1.5, 43 + hop * 0.5, 8, 5.5 - hop * 0.5, 3); ctx.fill();
      DRX.rr(ctx, 21 - a * 1.5, 43 + hop * 0.5, 8, 5.5 - hop * 0.5, 3); ctx.fill();
      ctx.fillStyle = G1; DRX.poly(ctx, [8, 38, -3, 42 + (dead ? 3 : 0), 10, 45]); ctx.fill();
      DRX.ell(ctx, 20, 38, 12.5, 9.5); ctx.fill();                                  // round little body
      ctx.fillStyle = '#ecfccb'; DRX.ell(ctx, 22, 40, 7, 6); ctx.fill();
      ctx.fillStyle = G1; DRX.rr(ctx, 25, 37, 5, 3, 1.5); ctx.fill();               // arm
      ctx.fillStyle = G2; ctx.beginPath(); ctx.arc(24, 19.5, 15.5, 0, DRX.PI2); ctx.fill(); // big head
      ctx.fillStyle = SP; ctx.beginPath(); ctx.arc(14, 24, 2, 0, DRX.PI2); ctx.arc(19, 28, 1.5, 0, DRX.PI2); ctx.fill();
      face(30, 21);
      if (dead) { shell(40, 46 + hop, 8, 0.9); } else shell(24, 8, 12, 0);
    }
    ctx.restore();
  },
});
