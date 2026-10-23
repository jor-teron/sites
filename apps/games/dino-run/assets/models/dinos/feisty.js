/** Feisty Dino — orange and red, angry eyebrows, spiky back, quick stompy run. */
DR.registerDino({
  id: 'feisty',
  name: 'Feisty Dino',
  eye(d) { return d.pose === 'duck' ? [47, 7] : [36, 8]; },
  draw(ctx, d) {
    const O = '#f97316', D = '#c2410c', R = '#dc2626', B = '#fdba74', dead = d.pose === 'dead';
    const run = d.pose === 'run';
    const s = Math.sin(d.phase * Math.PI * 1.7);            // quick cycle
    const hit = run ? Math.abs(s) : 0;                       // 1 at mid-swing, 0 when a foot lands
    ctx.save();
    ctx.translate(d.x, d.y);
    const spikes = (x0, y0, n, step, hgt) => {              // red spikes along the back
      ctx.fillStyle = R;
      for (let i = 0; i < n; i++) {
        const sx = x0 + i * step, k = dead ? 0.45 : 1;
        DRX.poly(ctx, [sx, y0 + i * 0.4, sx + step / 2, y0 - hgt * k + i * 0.4, sx + step, y0 + i * 0.4 + 0.5]);
        ctx.fill();
      }
    };
    const face = (hx, hy) => {                               // eye + angry brow + teeth
      ctx.fillStyle = '#fff'; DRX.rr(ctx, hx, hy, 7, 6, 2); ctx.fill();
      if (dead) { DRX.deadEye(ctx, hx + 3.5, hy + 3, 2, '#1f2937'); }
      else {
        ctx.fillStyle = '#7f1d1d'; ctx.fillRect(hx + 3.5, hy + 1.5, 3, 3.5);
        ctx.strokeStyle = '#3b0d0d'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx - 3, hy - 3.5); ctx.lineTo(hx + 8, hy + 0.5); ctx.stroke(); ctx.lineCap = 'butt';
      }
    };
    if (d.pose === 'duck') {
      const bob = Math.sin(d.phase * Math.PI * 1.7) * 0.8;
      ctx.translate(0, bob);
      spikes(5, 8, 6, 7, 6);
      ctx.fillStyle = O; DRX.rr(ctx, 0, 6, 46, 20, 7); ctx.fill();
      ctx.fillStyle = B; DRX.rr(ctx, 6, 18, 34, 6, 3); ctx.fill();
      ctx.fillStyle = O; DRX.rr(ctx, 34, 1, 22, 16, 5); ctx.fill();
      ctx.fillStyle = D; ctx.fillRect(46, 14, 10, 2);
      face(43, 5);
      ctx.fillStyle = D;
      const l = Math.sin(d.phase * Math.PI * 1.7) * 3;
      ctx.fillRect(10 + l, 24, 7, 4); ctx.fillRect(28 - l, 24, 7, 4);
    } else {
      const lift = (p) => Math.max(0, p) * 8;
      const bob = run ? -hit * 2.6 : 0, tilt = run ? s * 0.03 : 0;
      ctx.translate(0, bob);
      ctx.save(); ctx.translate(14, 40); ctx.rotate(tilt); ctx.translate(-14, -40);
      // tail + spikes
      ctx.fillStyle = D; DRX.poly(ctx, [10, 22, -3, 30 + (dead ? 4 : 0), 12, 31]); ctx.fill();
      spikes(6, 17, 6, 6.2, 8);
      // body
      ctx.fillStyle = O; DRX.rr(ctx, 5, 14, 27, 27, 8); ctx.fill();
      ctx.fillStyle = B; DRX.rr(ctx, 15, 22, 15, 17, 6); ctx.fill();
      ctx.fillStyle = D; ctx.fillRect(14, 24, 8, 4); ctx.fillRect(21, 22, 3, 7); // arm + claw
      // head
      ctx.fillStyle = O; DRX.rr(ctx, 20, 0, 24, 19, 6); ctx.fill();
      ctx.fillStyle = D; ctx.fillRect(36, 13, 8, 2);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) { DRX.poly(ctx, [37 + i * 2.4, 14.5, 38.6 + i * 2.4, 14.5, 38 + i * 2.4, 17.5]); ctx.fill(); }
      face(31, 5);
      if (dead) { ctx.fillStyle = '#fb7185'; DRX.rr(ctx, 38, 15, 3.5, 7, 1.5); ctx.fill(); }
      ctx.restore();
      // thick legs with toes
      const air = !d.onGround || d.pose !== 'run';
      const a = air ? 0 : lift(s), b = air ? 0 : lift(-s);
      ctx.fillStyle = D;
      const leg = (lx, up) => {
        ctx.fillRect(lx, 38, 8, 9 - up * 0.4); ctx.fillRect(lx - 1, 47 - up, 11, 4);
        ctx.fillStyle = '#fff'; ctx.fillRect(lx + 7, 48 - up, 3, 2); ctx.fillStyle = D;
      };
      leg(9, a); leg(21, b);
      if (run && hit < 0.12) { ctx.fillStyle = 'rgba(255,200,150,0.45)'; DRX.ell(ctx, 8, 51, 6, 2); ctx.fill(); DRX.ell(ctx, 30, 51, 6, 2); ctx.fill(); }
    }
    ctx.restore();
  },
});
