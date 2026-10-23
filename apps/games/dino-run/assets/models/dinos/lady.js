/** Lady Dino — pink-purple, long lashes, a bow on the head, a little sway. */
DR.registerDino({
  id: 'lady',
  name: 'Lady Dino',
  eye(d) { return d.pose === 'duck' ? [46, 8] : [35, 9]; },
  draw(ctx, d) {
    const dead = d.pose === 'dead', duck = d.pose === 'duck', t = d.t;
    const gy = duck ? 28 : 48;
    const sway = dead ? 0 : Math.sin(t * 4.2) * 0.045;
    const bob = d.pose === 'run' ? Math.abs(Math.sin(d.phase * Math.PI)) * -1.5 : 0;
    ctx.save();
    ctx.translate(d.x + 22, d.y + gy); ctx.rotate(sway); ctx.translate(-22, -gy + bob);
    const g = ctx.createLinearGradient(0, 0, 0, gy);
    g.addColorStop(0, '#f0abfc'); g.addColorStop(1, '#a855f7');
    const dark = '#7e22ce', pink = '#ec4899';
    const a = d.pose === 'run' ? Math.sin(d.phase * Math.PI) : 0;
    // legs with little heels
    if (!duck) {
      ctx.fillStyle = '#c084fc';
      ctx.fillRect(12 + a * 2.5, 38, 5, 8 - Math.max(0, -a) * 3); ctx.fillRect(23 - a * 2.5, 38, 5, 8 - Math.max(0, a) * 3);
      ctx.fillStyle = pink;
      DRX.rr(ctx, 10 + a * 2.5, 45 - Math.max(0, -a) * 3, 10, 4, 2); ctx.fill();
      DRX.rr(ctx, 21 - a * 2.5, 45 - Math.max(0, a) * 3, 10, 4, 2); ctx.fill();
    } else {
      ctx.fillStyle = pink; DRX.rr(ctx, 10 + a * 3, 23, 8, 5, 2); ctx.fill(); DRX.rr(ctx, 28 - a * 3, 23, 8, 5, 2); ctx.fill();
    }
    ctx.fillStyle = g;
    if (duck) {
      DRX.rr(ctx, 0, 6, 46, 20, 9); ctx.fill();
      DRX.rr(ctx, 33, 0, 23, 18, 8); ctx.fill();
    } else {
      DRX.poly(ctx, [9, 24, -2, 29, 11, 36]); ctx.fill();
      DRX.rr(ctx, 6, 14, 26, 27, 10); ctx.fill();
      // swaying skirt
      const k = Math.sin(t * 4.2 + 1) * 2;
      ctx.fillStyle = pink; DRX.poly(ctx, [8, 34, 31, 34, 35 + k, 43, 4 + k, 43]); ctx.fill();
      ctx.fillStyle = '#f9a8d4'; ctx.fillRect(8, 34, 23, 2);
      ctx.fillStyle = g; DRX.rr(ctx, 19, 0, 25, 21, 9); ctx.fill();
      ctx.fillStyle = dark; ctx.fillRect(14, 24, 8, 3);
    }
    // bow
    const bx = duck ? 40 : 28, by = duck ? 0 : -1, tilt = dead ? 0.7 : 0;
    ctx.save(); ctx.translate(bx, by + (dead ? 3 : 0)); ctx.rotate(tilt);
    ctx.fillStyle = '#db2777';
    DRX.poly(ctx, [0, 0, -9, -5, -9, 4]); ctx.fill(); DRX.poly(ctx, [0, 0, 9, -5, 9, 4]); ctx.fill();
    ctx.fillStyle = '#f472b6'; ctx.beginPath(); ctx.arc(0, 0, 2.7, 0, DRX.PI2); ctx.fill();
    ctx.restore();
    // face
    const ex = duck ? 46 : 35, ey = duck ? 8 : 9;
    if (dead) DRX.deadEye(ctx, ex, ey, 2.4, '#4a044e');
    else {
      ctx.fillStyle = '#fff'; DRX.ell(ctx, ex, ey, 3.6, 3.4); ctx.fill();
      ctx.fillStyle = '#4a044e'; ctx.beginPath(); ctx.arc(ex + 1, ey + 0.4, 2.1, 0, DRX.PI2); ctx.fill();
    }
    ctx.strokeStyle = '#4a044e'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';   // long lashes
    ctx.beginPath();
    ctx.moveTo(ex + 3, ey - 2); ctx.lineTo(ex + 7.5, ey - 5);
    ctx.moveTo(ex + 3.6, ey - 0.4); ctx.lineTo(ex + 8.4, ey - 2);
    ctx.moveTo(ex + 1.5, ey - 3.2); ctx.lineTo(ex + 4, ey - 7);
    ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = '#e11d48'; DRX.rr(ctx, ex + 3, ey + 6, 5, 2.4, 1.2); ctx.fill();            // lips
    ctx.fillStyle = 'rgba(244,114,182,0.6)'; DRX.ell(ctx, ex - 3.5, ey + 5, 2.6, 1.7); ctx.fill(); // blush
    ctx.restore();
  },
});
