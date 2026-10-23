/** Ninja Dino — black, sleek, red headband whose tails flutter; ducks as a roll. */
DR.registerDino({
  id: 'ninja',
  name: 'Ninja Dino',
  eye(d) { return d.pose === 'duck' ? [22, 14] : [37, 8.5]; },
  draw(ctx, d) {
    const dead = d.pose === 'dead', t = d.t, duck = d.pose === 'duck';
    const K = '#111827', K2 = '#1f2937', R = '#dc2626';
    const flutter = (x, y, len, ph, amp) => {                // headband tails
      ctx.strokeStyle = R; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let i = 1; i <= 6; i++) {
        const u = i / 6;
        ctx.lineTo(x - u * len, y + (dead ? u * u * 14 : Math.sin(t * 17 + ph + u * 4) * amp * u + u * 2));
      }
      ctx.stroke(); ctx.lineCap = 'butt';
    };
    ctx.save();
    ctx.translate(d.x, d.y);
    if (duck) {                                              // roll: a spinning ball
      const ang = d.phase * Math.PI * 1.3;
      flutter(10, 8, 14, 0, 2.5);
      ctx.save(); ctx.translate(22, 14); ctx.rotate(ang);
      ctx.fillStyle = K; ctx.beginPath(); ctx.arc(0, 0, 13.5, 0, DRX.PI2); ctx.fill();
      ctx.fillStyle = K2; ctx.beginPath(); ctx.arc(-2, 2, 9, 0.3, 3.8); ctx.fill();
      ctx.fillStyle = K; DRX.rr(ctx, 3, -12, 14, 12, 5); ctx.fill();         // head tucked in
      ctx.fillStyle = R; ctx.fillRect(4, -10, 12, 3);
      ctx.fillStyle = '#f1f5f9'; DRX.rr(ctx, 8, -6, 8, 3, 1.5); ctx.fill();
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(7, 9); ctx.stroke(); // sword
      ctx.restore();
      ctx.restore();
      return;
    }
    const run = d.pose === 'run';
    const lean = d.pose === 'dead' ? -0.12 : (run ? 0.09 : 0.14);
    ctx.translate(22, 48); ctx.rotate(lean); ctx.translate(-22, -48 + (run ? -Math.abs(Math.sin(d.phase * Math.PI)) * 1.5 : 0));
    // headband tails (behind)
    flutter(22, 6.5, 19, 0, 3.2); flutter(22, 8.5, 15, 2, 3);
    ctx.fillStyle = K2; DRX.poly(ctx, [10, 22, -6, 30, 12, 33]); ctx.fill();          // tail
    ctx.fillStyle = K; DRX.rr(ctx, 8, 14, 22, 27, 8); ctx.fill();                      // body
    ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.6;                                  // sword on the back
    ctx.beginPath(); ctx.moveTo(10, 38); ctx.lineTo(28, 15); ctx.stroke();
    ctx.strokeStyle = R; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(26, 12.5); ctx.lineTo(30, 17.5); ctx.stroke();
    ctx.fillStyle = K; DRX.rr(ctx, 20, 1, 23, 18, 7); ctx.fill();                      // head
    ctx.fillStyle = R; ctx.fillRect(20, 3.5, 23, 4);                                   // headband
    ctx.fillStyle = '#0b1220'; ctx.fillRect(34, 4, 2, 3.5);
    ctx.fillStyle = '#f1f5f9'; DRX.rr(ctx, 29, 8, 14, 5, 2); ctx.fill();               // eye slit
    if (dead) DRX.deadEye(ctx, 37, 10.5, 1.8, K);
    else { ctx.fillStyle = '#7f1d1d'; ctx.fillRect(36, 9, 3, 3); ctx.fillStyle = '#fff'; ctx.fillRect(38, 9, 1, 1); }
    ctx.fillStyle = K2; ctx.fillRect(15, 24, 9, 3);                                    // arm
    // sleek legs
    const a = run ? Math.sin(d.phase * Math.PI * 1.2) : 0;
    ctx.fillStyle = K;
    ctx.fillRect(11 + a * 4, 38, 6, 9 - Math.max(0, -a) * 4); ctx.fillRect(22 - a * 4, 38, 6, 9 - Math.max(0, a) * 4);
    ctx.fillStyle = R; ctx.fillRect(11 + a * 4, 43 - Math.max(0, -a) * 4, 6, 1.5); ctx.fillRect(22 - a * 4, 43 - Math.max(0, a) * 4, 6, 1.5);
    ctx.restore();
  },
});
