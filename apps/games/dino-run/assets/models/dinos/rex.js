/** Rex King — big golden dino with a crown and a cape, regal stride, ducks with a bow. */
DR.registerDino({
  id: 'rex',
  name: 'Rex King',
  eye(d) { return d.pose === 'duck' ? [47, 9] : [37, 11]; },
  draw(ctx, d) {
    const dead = d.pose === 'dead', duck = d.pose === 'duck', t = d.t;
    const GOLD = '#fbbf24', GD = '#b45309', RED = '#b91c1c', RED2 = '#dc2626';
    const gy = duck ? 28 : 48;
    const stride = d.pose === 'run' ? Math.sin(d.phase * Math.PI * 0.7) : 0;     // slow, regal
    ctx.save();
    ctx.translate(d.x + 22, d.y + gy); ctx.scale(1.1, 1.1); ctx.translate(-22, -gy);
    const wv = (k) => (dead ? 0 : Math.sin(t * 6 + k) * 2.2);
    const crown = (cx, cy, rot, fall) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      ctx.fillStyle = '#facc15'; ctx.strokeStyle = GD; ctx.lineWidth = 1;
      DRX.poly(ctx, [-8, 0, -8, -8, -4, -4, 0, -10, 4, -4, 8, -8, 8, 0]); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(0, -3, 1.6, 0, DRX.PI2); ctx.fill();
      ctx.fillStyle = '#38bdf8'; ctx.fillRect(-6, -2.5, 2, 2); ctx.fillRect(4, -2.5, 2, 2);
      ctx.restore();
    };
    const body = ctx.createLinearGradient(0, 0, 0, gy);
    body.addColorStop(0, '#fde68a'); body.addColorStop(0.5, GOLD); body.addColorStop(1, '#d97706');
    if (duck) {
      // cape lifted over the back as it bows
      ctx.fillStyle = RED; DRX.poly(ctx, [10, 8, -10, 2 + wv(0), -12, 10, 8, 24]); ctx.fill();
      ctx.fillStyle = RED2; DRX.poly(ctx, [10, 8, -6, 4 + wv(1), -9, 9, 8, 18]); ctx.fill();
      const a = Math.sin(d.phase * Math.PI * 0.7) * 2;
      ctx.fillStyle = GD; ctx.fillRect(9 + a, 22, 7, 6); ctx.fillRect(28 - a, 22, 7, 6);
      ctx.fillStyle = body; DRX.rr(ctx, 4, 7, 40, 19, 8); ctx.fill();
      DRX.rr(ctx, 33, 4, 23, 17, 6); ctx.fill();                               // head lowered
      ctx.fillStyle = '#fff'; DRX.rr(ctx, 29, 8, 7, 14, 3); ctx.fill();        // ermine collar
      ctx.fillStyle = '#111'; ctx.fillRect(31, 11, 1.5, 2); ctx.fillRect(33, 16, 1.5, 2);
      ctx.fillStyle = GD; ctx.fillRect(46, 17, 9, 2);
      crown(46, 5, 0.55, 0);                                                    // crown tips forward in the bow
    } else {
      const sw = stride;
      // cape
      ctx.fillStyle = RED;
      ctx.beginPath(); ctx.moveTo(17, 14); ctx.quadraticCurveTo(0, 18 + wv(0), -14 + wv(2), 42 + (dead ? 4 : 0));
      ctx.lineTo(-6 + wv(3), 46); ctx.lineTo(8, 43); ctx.quadraticCurveTo(14, 30, 24, 26); ctx.closePath(); ctx.fill();
      ctx.fillStyle = RED2;
      ctx.beginPath(); ctx.moveTo(17, 14); ctx.quadraticCurveTo(4, 19 + wv(1), -4 + wv(2), 36); ctx.lineTo(10, 34); ctx.quadraticCurveTo(14, 24, 22, 22); ctx.closePath(); ctx.fill();
      // legs: long, slow strides
      ctx.fillStyle = GD;
      ctx.fillRect(10 + sw * 3, 38, 8, 9 - Math.max(0, -sw) * 5); ctx.fillRect(9 + sw * 3, 45 - Math.max(0, -sw) * 5, 11, 3);
      ctx.fillRect(22 - sw * 3, 38, 8, 9 - Math.max(0, sw) * 5); ctx.fillRect(21 - sw * 3, 45 - Math.max(0, sw) * 5, 11, 3);
      ctx.fillStyle = body;
      DRX.poly(ctx, [9, 24, -1, 33 + (dead ? 4 : 0), 12, 36]); ctx.fill();
      DRX.rr(ctx, 6, 13, 26, 29, 9); ctx.fill();
      ctx.fillStyle = '#fef3c7'; DRX.rr(ctx, 15, 22, 15, 18, 6); ctx.fill();
      ctx.fillStyle = GD; ctx.fillRect(14, 24, 8, 3);
      const hb = dead ? 2 : Math.sin(d.phase * Math.PI * 1.4) * 0.8;
      ctx.translate(0, hb);
      ctx.fillStyle = body; DRX.rr(ctx, 20, 3, 25, 19, 7); ctx.fill();
      ctx.fillStyle = '#fff'; DRX.rr(ctx, 17, 17, 12, 6, 3); ctx.fill();         // ermine collar
      ctx.fillStyle = '#111'; ctx.fillRect(20, 19, 1.5, 2); ctx.fillRect(25, 20, 1.5, 2);
      ctx.fillStyle = GD; ctx.fillRect(37, 16, 8, 2);
      if (dead) crown(50, 45 - hb, 0.9, 1); else crown(31, 4.5, 0.05 + sw * 0.03, 0);
    }
    // face
    const ex = duck ? 47 : 37, ey = duck ? 9 : 11;
    if (dead) DRX.deadEye(ctx, ex, ey, 2.2, '#451a03');
    else {
      ctx.fillStyle = '#fff'; DRX.ell(ctx, ex, ey, 3.4, 2.8); ctx.fill();
      ctx.fillStyle = '#451a03'; ctx.beginPath(); ctx.arc(ex + 0.8, ey + 0.2, 1.7, 0, DRX.PI2); ctx.fill();
      ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.6;                                   // stern brow
      ctx.beginPath(); ctx.moveTo(ex - 3, ey - 4); ctx.lineTo(ex + 4, ey - 2); ctx.stroke();
    }
    ctx.restore();
  },
});
