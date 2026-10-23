/** Ghost Dino — translucent, wispy, floats instead of running; dies by puffing into smoke. */
DR.registerDino({
  id: 'ghost',
  name: 'Ghost Dino',
  eye(d) { return d.pose === 'duck' ? [47, 9] : [36, 9]; },
  draw(ctx, d) {
    const dead = d.pose === 'dead', duck = d.pose === 'duck', t = d.t;
    const gy = duck ? 28 : 48;
    const fade = dead ? Math.max(0, 1 - d.deadT / 0.45) : 1;     // the body puffs away…
    ctx.save();
    ctx.translate(d.x, d.y);
    if (fade > 0) {
      const fl = dead ? 0 : (Math.sin(t * 5) * 2.4 - 3.5);
      // ground shadow
      ctx.fillStyle = 'rgba(0,0,0,' + 0.18 * fade + ')'; DRX.ell(ctx, 22, gy + 1, 15 + fl * 0.4, 2.5); ctx.fill();
      ctx.translate(0, fl);
      ctx.globalAlpha = fade * 0.78;
      const wob = (x, i) => Math.sin(t * 8 + x * 0.6 + i) * 2.6;
      const hem = gy - 2;
      // wispy trail
      ctx.strokeStyle = 'rgba(199,210,254,0.55)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(6, hem - 18 - i * 6);
        ctx.bezierCurveTo(-6, hem - 18 - i * 6 + wob(0, i), -14, hem - 24 - i * 7 + wob(3, i), -24 - i * 3, hem - 20 - i * 6 + wob(6, i));
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      const g = ctx.createRadialGradient(24, gy * 0.35, 3, 22, gy * 0.5, 30);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c7d2fe');
      ctx.fillStyle = g; ctx.strokeStyle = 'rgba(129,140,248,0.9)'; ctx.lineWidth = 1.3;
      ctx.beginPath();
      if (duck) {
        ctx.moveTo(4, hem - 6); ctx.quadraticCurveTo(-2, 4, 12, 4); ctx.lineTo(38, 3);
        ctx.quadraticCurveTo(56, 0, 56, 12); ctx.lineTo(52, 17); ctx.lineTo(42, 18); ctx.lineTo(42, hem - 4);
      } else {
        ctx.moveTo(4, hem - 8); ctx.quadraticCurveTo(0, 16, 12, 14); ctx.lineTo(18, 14);
        ctx.quadraticCurveTo(18, 0, 31, 0); ctx.quadraticCurveTo(45, 0, 45, 10); ctx.lineTo(45, 17);
        ctx.lineTo(34, 21); ctx.lineTo(34, hem - 8);
      }
      const x0 = duck ? 42 : 34, x1 = 4;
      for (let i = 0; i <= 6; i++) {                              // wavy hem
        const x = x0 + (x1 - x0) * i / 6;
        ctx.lineTo(x, hem + wob(x, 0) * (i % 2 ? 1 : 0.5) + (i % 2 ? 1 : -2));
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // little wisp arms
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(duck ? 20 : 22, duck ? 14 : 26); ctx.quadraticCurveTo(duck ? 26 : 29, (duck ? 18 : 31) + Math.sin(t * 7) * 2, duck ? 31 : 33, duck ? 15 : 28);
      ctx.stroke(); ctx.lineCap = 'butt';
      // hollow face
      const ex = duck ? 47 : 36, ey = duck ? 9 : 9;
      if (dead) DRX.deadEye(ctx, ex, ey, 2.5, '#312e81');
      else {
        ctx.fillStyle = '#312e81'; DRX.ell(ctx, ex, ey, 2.7, 3.7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(ex + 0.8, ey - 1.2, 0.9, 0, DRX.PI2); ctx.fill();
        ctx.fillStyle = '#312e81'; DRX.ell(ctx, ex + 3, ey + 8.2, 1.8, 2.3); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // …into smoke
    if (dead && d.deadT < 2.2) {
      const u = d.deadT;
      for (let i = 0; i < 9; i++) {
        const a = DRX.hash(i + 3) * DRX.PI2, dist = (8 + DRX.hash(i + 20) * 20) * Math.min(1, u * 1.4);
        const r = 5 + DRX.hash(i + 7) * 5 + u * 7;
        const al = Math.max(0, 0.6 - u * 0.28) * (i % 3 ? 1 : 0.7);
        ctx.fillStyle = 'rgba(226,232,240,' + al + ')';
        DRX.ell(ctx, 22 + Math.cos(a) * dist, gy * 0.45 + Math.sin(a) * dist * 0.7 - u * 16 * (0.5 + DRX.hash(i)), r, r * 0.85);
        ctx.fill();
      }
    }
    ctx.restore();
  },
});
