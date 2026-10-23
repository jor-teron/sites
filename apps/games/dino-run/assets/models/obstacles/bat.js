/** Fire bat — a dark bat with ember-lit wing edges and glowing eyes. */
DR.registerObstacle({
  id: 'bat',
  kind: 'air',
  draw(ctx, o, env) {
    const s = Math.sin(o.flap), cx = o.x + o.w / 2, cy = o.y + 15;
    const tip = s * 12;                                            // wing tip swings up/down
    ctx.save();
    ctx.translate(cx, cy);
    const wing = (k) => {
      ctx.fillStyle = '#2b1233';
      ctx.beginPath(); ctx.moveTo(k * 4, -2);
      ctx.quadraticCurveTo(k * 14, -12 - tip, k * 24, -6 - tip * 1.4);
      ctx.lineTo(k * 19, 0 - tip * 0.5); ctx.lineTo(k * 17, 5 - tip * 0.3); ctx.lineTo(k * 12, 2); ctx.lineTo(k * 8, 8); ctx.lineTo(k * 4, 5);
      ctx.closePath(); ctx.fill();
      ctx.save(); ctx.shadowColor = '#f97316'; ctx.shadowBlur = 6;
      ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(k * 4, -2); ctx.quadraticCurveTo(k * 14, -12 - tip, k * 24, -6 - tip * 1.4); ctx.lineTo(k * 19, 0 - tip * 0.5); ctx.lineTo(k * 17, 5 - tip * 0.3); ctx.stroke();
      ctx.restore();
    };
    wing(-1); wing(1);
    ctx.fillStyle = '#3b1a45'; DRX.ell(ctx, 0, 1, 6.5, 8); ctx.fill();                          // body
    DRX.poly(ctx, [-5, -6, -4, -13, -1, -7]); ctx.fill(); DRX.poly(ctx, [5, -6, 4, -13, 1, -7]); ctx.fill();  // ears
    ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(-2.4, -2, 1.5, 0, DRX.PI2); ctx.arc(2.4, -2, 1.5, 0, DRX.PI2); ctx.fill();
    ctx.fillStyle = '#fff'; DRX.poly(ctx, [-1.5, 2, -0.6, 4, 0.2, 2]); ctx.fill(); DRX.poly(ctx, [0.5, 2, 1.4, 4, 2.2, 2]); ctx.fill();
    ctx.fillStyle = 'rgba(249,115,22,0.55)';                                                     // little flame trail
    DRX.ell(ctx, 0, 11 + Math.sin(env.clock * 20) * 1.2, 2.6, 4.5); ctx.fill();
    ctx.restore();
  },
});
