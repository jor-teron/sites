/** Robo Dino — metal plates, glowing visor, piston legs, sparks when it dies. */
DR.registerDino({
  id: 'robo',
  name: 'Robo Dino',
  eye(d) { return d.pose === 'duck' ? [48, 8] : [37, 8.5]; },
  draw(ctx, d) {
    const dead = d.pose === 'dead', duck = d.pose === 'duck', t = d.t;
    const M1 = '#94a3b8', M2 = '#64748b', M3 = '#cbd5e1', DK = '#1e293b', glow = dead ? '#7f1d1d' : '#22d3ee';
    ctx.save();
    ctx.translate(d.x, d.y);
    const rivet = (x, y) => { ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.arc(x, y, 0.9, 0, DRX.PI2); ctx.fill(); };
    const visor = (x, y, w, h) => {
      ctx.fillStyle = DK; DRX.rr(ctx, x, y, w, h, 2.5); ctx.fill();
      ctx.save();
      if (!dead) { ctx.shadowColor = glow; ctx.shadowBlur = 8; }
      ctx.fillStyle = glow; DRX.rr(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 1.5); ctx.fill();
      ctx.restore();
      if (!dead) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x + 2.5, y + 2, w * 0.4, 1.2); }
      else DRX.deadEye(ctx, x + w * 0.65, y + h / 2, 1.8, '#fecaca');
    };
    const air = !d.onGround || d.pose !== 'run';
    const ph = d.phase * Math.PI;
    if (!duck) {
      // piston legs: fixed cylinder + sliding rod + foot plate
      [[10, 0], [23, Math.PI]].forEach((p) => {
        const e = air ? 0.35 : (1 + Math.sin(ph + p[1])) / 2;
        const ext = 2 + e * 5, lift = air ? 0 : (1 - e) * 3;
        ctx.fillStyle = M2; DRX.rr(ctx, p[0], 36, 8, 7, 2); ctx.fill();
        ctx.fillStyle = '#e2e8f0'; ctx.fillRect(p[0] + 3, 40, 2, ext);
        ctx.fillStyle = DK; DRX.rr(ctx, p[0] - 1, 42 + ext - lift - 1, 10, 4, 1.5); ctx.fill();
      });
      ctx.fillStyle = M2; DRX.poly(ctx, [8, 21, -3, 30, 9, 34]); ctx.fill();               // tail plates
      ctx.fillStyle = M1; DRX.poly(ctx, [8, 21, 2, 25, 9, 28]); ctx.fill();
      ctx.fillStyle = M1; DRX.rr(ctx, 6, 14, 27, 26, 4); ctx.fill();                       // body
      ctx.fillStyle = M2; ctx.fillRect(6, 25, 27, 2); ctx.fillRect(19, 14, 2, 11);
      rivet(9, 17); rivet(30, 17); rivet(9, 37); rivet(30, 37);
      ctx.fillStyle = DK; DRX.rr(ctx, 12, 29, 10, 7, 1.5); ctx.fill();                    // chest panel
      ctx.fillStyle = dead ? '#450a0a' : (Math.sin(t * 6) > 0 ? '#4ade80' : '#166534'); ctx.fillRect(14, 31, 6, 3);
      ctx.fillStyle = M3; DRX.rr(ctx, 14, 21, 9, 4, 1.5); ctx.fill();                      // arm
      ctx.fillStyle = M3; DRX.rr(ctx, 20, 0, 24, 19, 4); ctx.fill();                       // head
      ctx.fillStyle = M2; ctx.fillRect(20, 14, 24, 2); ctx.fillRect(36, 15, 8, 4);
      rivet(23, 3); rivet(41, 3);
      visor(28, 4, 15, 8);
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.5;                                      // antenna
      ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(26, -5); ctx.stroke();
      ctx.fillStyle = dead ? '#7f1d1d' : (Math.sin(t * 8) > 0 ? '#f87171' : '#7f1d1d'); ctx.beginPath(); ctx.arc(26, -6, 1.8, 0, DRX.PI2); ctx.fill();
    } else {
      [[10, 0], [30, Math.PI]].forEach((p) => {
        const e = (1 + Math.sin(ph + p[1])) / 2;
        ctx.fillStyle = DK; DRX.rr(ctx, p[0], 22 + e * 0, 9, 6, 2); ctx.fill();
      });
      ctx.fillStyle = M1; DRX.rr(ctx, 0, 6, 46, 19, 5); ctx.fill();
      ctx.fillStyle = M2; ctx.fillRect(14, 6, 2, 19); ctx.fillRect(30, 6, 2, 19);
      rivet(4, 10); rivet(42, 10); rivet(4, 21);
      ctx.fillStyle = M3; DRX.rr(ctx, 33, 1, 23, 16, 4); ctx.fill();
      visor(40, 4, 15, 8);
    }
    // death: a burst of sparks, then the odd flicker
    if (dead) {
      const cx = duck ? 22 : 22, cy = duck ? 14 : 24;
      for (let i = 0; i < 12; i++) {
        const a = DRX.hash(i + 1) * DRX.PI2, v = 30 + DRX.hash(i + 40) * 55, u = d.deadT - DRX.hash(i + 9) * 0.1;
        if (u < 0 || u > 0.7) continue;
        const x = cx + Math.cos(a) * v * u, y = cy + Math.sin(a) * v * u - 20 * u + 160 * u * u;
        ctx.strokeStyle = DRX.alpha(i % 2 ? '#fde047' : '#fb923c', 1 - u / 0.7); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(a) * 4, y - Math.sin(a) * 4 + 2); ctx.stroke();
      }
      if (d.deadT > 0.4 && (d.deadT * 2.5) % 1 < 0.22) {
        ctx.strokeStyle = '#fde047'; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(30, 2); ctx.lineTo(34, -3); ctx.lineTo(32, 0); ctx.lineTo(37, -5); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(100,116,139,' + Math.max(0, 0.5 - d.deadT * 0.2) + ')';
      DRX.ell(ctx, 28, 2 - d.deadT * 8, 4 + d.deadT * 4, 3 + d.deadT * 3); ctx.fill();
    }
    ctx.restore();
  },
});
