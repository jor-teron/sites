/** Fiery Dino — flame-coloured scales, flickering fire tail, ember trail, a flame puff on jump. */
DR.registerDino({
  id: 'fiery',
  name: 'Fiery Dino',
  eye(d) { return d.pose === 'duck' ? [47, 6] : [36, 7]; },
  draw(ctx, d) {
    const dead = d.pose === 'dead', t = d.t;
    const flame = (x, y, len, wid, ang, k) => {             // one flame tongue, tip toward ang
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, '#fde047'); g.addColorStop(0.5, '#f97316'); g.addColorStop(1, 'rgba(220,38,38,0)');
      ctx.fillStyle = g; ctx.globalAlpha = k;
      ctx.beginPath(); ctx.moveTo(0, -wid); ctx.quadraticCurveTo(len * 0.55, -wid * 1.1, len, 0);
      ctx.quadraticCurveTo(len * 0.55, wid * 1.1, 0, wid); ctx.closePath(); ctx.fill();
      ctx.restore();
    };
    ctx.save();
    ctx.translate(d.x, d.y);
    const duck = d.pose === 'duck', gy = duck ? 28 : 48;
    // ember trail (behind the dino) — a pure function of time
    if (!dead && d.pose !== 'jump') {
      for (let k = 0; k < 7; k++) {
        const u = ((t * 2.2 + k / 7) % 1);
        const ex = -2 - u * 46, ey = gy - 12 - Math.sin(t * 9 + k * 2.3) * 4 - u * 12;
        ctx.fillStyle = DRX.alpha(k % 2 ? '#fb923c' : '#fde047', (1 - u) * 0.9);
        ctx.fillRect(ex, ey, 2.6 * (1 - u * 0.5), 2.6 * (1 - u * 0.5));
      }
    }
    // flame puff on take-off
    if (d.airT < 0.45 && !dead && d.pose === 'jump') {
      const p = d.airT / 0.45;
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (0.15 + i * 0.14), r = 5 + p * 15;
        ctx.fillStyle = DRX.alpha(i % 2 ? '#facc15' : '#f97316', (1 - p) * 0.85);
        DRX.ell(ctx, 22 + Math.cos(a) * r * 1.3, 52 + Math.sin(a) * r * 0.7 + p * 6, 3 + p * 5, 3 + p * 4);
        ctx.fill();
      }
    }
    // fire tail
    const wob = (i) => Math.sin(t * 16 + i * 2.1) * 0.22;
    const tx = duck ? 4 : 5, ty = duck ? 15 : 25;
    if (dead) {
      ctx.fillStyle = '#7f1d1d'; DRX.poly(ctx, [tx + 4, ty - 4, -4, ty + 5, tx + 6, ty + 5]); ctx.fill();
      ctx.fillStyle = 'rgba(80,80,80,0.5)'; DRX.ell(ctx, -5, ty - 6 - (d.deadT * 12) % 14, 3, 3); ctx.fill();
    } else {
      flame(tx, ty, 22, 6, Math.PI + wob(0) - 0.15, 0.95);
      flame(tx, ty, 17, 4.5, Math.PI + wob(1) + 0.3, 0.9);
      flame(tx, ty, 14, 3.5, Math.PI + wob(2) - 0.5, 0.85);
    }
    // scale body
    const bg = ctx.createLinearGradient(0, 0, 0, gy);
    bg.addColorStop(0, '#fbbf24'); bg.addColorStop(0.45, '#f97316'); bg.addColorStop(1, '#b91c1c');
    ctx.fillStyle = bg;
    if (duck) {
      DRX.rr(ctx, 0, 6, 46, 20, 8); ctx.fill();
      DRX.rr(ctx, 34, 1, 22, 16, 6); ctx.fill();
    } else {
      DRX.rr(ctx, 6, 14, 26, 27, 9); ctx.fill();
      DRX.rr(ctx, 20, 0, 24, 19, 7); ctx.fill();
      DRX.poly(ctx, [7, 27, 0, 33, 10, 35]); ctx.fill();
    }
    // scales
    ctx.strokeStyle = 'rgba(127,29,29,0.55)'; ctx.lineWidth = 1;
    const sc = duck ? [[8, 12], [16, 15], [24, 12], [32, 15], [12, 20], [26, 20]] : [[12, 20], [20, 20], [27, 24], [14, 28], [22, 29], [12, 36], [21, 36], [28, 31]];
    sc.forEach((p) => { ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0.1, Math.PI - 0.1); ctx.stroke(); });
    // crest of flame spikes
    ctx.fillStyle = '#fde047';
    for (let i = 0; i < 4; i++) { const sx = (duck ? 6 : 10) + i * 6, sy = duck ? 7 : 15; DRX.poly(ctx, [sx, sy, sx + 3, sy - 5 - Math.sin(t * 14 + i) * 1.5, sx + 6, sy + 1]); ctx.fill(); }
    // eye
    const ex = duck ? 47 : 36, ey = duck ? 6 : 7;
    if (dead) DRX.deadEye(ctx, ex, ey, 2.2, '#450a0a');
    else {
      ctx.fillStyle = '#fef3c7'; DRX.ell(ctx, ex, ey, 3.6, 2.6, -0.2); ctx.fill();
      ctx.fillStyle = '#7c2d12'; ctx.fillRect(ex + 0.3, ey - 2, 1.6, 4);
    }
    // legs
    if (!duck) {
      const a = d.pose === 'run' ? Math.sin(d.phase * Math.PI) : 0;
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(10 + a * 2, 39, 7, 8 + (a > 0 ? 0 : -3)); ctx.fillRect(22 - a * 2, 39, 7, 8 + (a > 0 ? -3 : 0));
      ctx.fillStyle = '#7f1d1d'; ctx.fillRect(9 + a * 2, 46 + (a > 0 ? 0 : -3), 10, 3); ctx.fillRect(21 - a * 2, 46 + (a > 0 ? -3 : 0), 10, 3);
    } else {
      const a = Math.sin(d.phase * Math.PI);
      ctx.fillStyle = '#7f1d1d'; ctx.fillRect(10 + a * 3, 24, 7, 4); ctx.fillRect(28 - a * 3, 24, 7, 4);
    }
    ctx.restore();
  },
});
