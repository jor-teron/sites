/**
 * Ground — the line, fill and scrolling detail under the dino. Each style is drawn from the theme palette
 * (groundLine, ground, groundTick, plus gA/gB accents). 'ticks' is the original look.
 */
DR.bg.ground = {
  draw(ctx, env, th) { (this.styles[th.groundStyle] || this.styles.ticks)(ctx, env, th.pal); },
  styles: {
    ticks(ctx, e, P) {
      ctx.strokeStyle = P.groundLine;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, e.groundY + 0.5);
      ctx.lineTo(e.W, e.groundY + 0.5);
      ctx.stroke();
      ctx.fillStyle = P.ground;
      ctx.fillRect(0, e.groundY, e.W, e.H - e.groundY);
      ctx.strokeStyle = P.groundTick;
      const off = (e.dist * 0.5) % 40;
      for (let x = -off; x < e.W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, e.groundY + 6);
        ctx.lineTo(x + 12, e.groundY + 6);
        ctx.stroke();
      }
    },
    snow(ctx, e, P) {                                           // snow drifts + ice sparkles
      ctx.fillStyle = P.ground; ctx.fillRect(0, e.groundY, e.W, e.H - e.groundY);
      const off = e.dist * 0.5;
      ctx.fillStyle = P.gA;
      ctx.beginPath(); ctx.moveTo(0, e.groundY + 14);
      for (let x = 0; x <= e.W + 8; x += 8) ctx.lineTo(x, e.groundY + 6 + Math.sin((x + off) * 0.035) * 3 + Math.sin((x + off) * 0.011) * 3);
      ctx.lineTo(e.W, e.groundY + 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = P.groundLine;                                // bright crust, drifts bumping up over it
      ctx.beginPath(); ctx.moveTo(0, e.groundY + 2);
      for (let x = 0; x <= e.W + 8; x += 8) ctx.lineTo(x, e.groundY - 1 - Math.max(0, Math.sin((x + off * 1.1) * 0.02 + 1.3) * 3.5));
      ctx.lineTo(e.W, e.groundY + 3); ctx.lineTo(0, e.groundY + 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = P.groundTick;
      const o2 = off % 60;
      for (let x = -o2; x < e.W; x += 60) { ctx.fillRect(x, e.groundY + 22, 14, 2); ctx.fillRect(x + 30, e.groundY + 36, 9, 2); }
      for (let i = 0; i < 14; i++) { const sx = ((DRX.hash(i) * e.W - off * 0.7) % e.W + e.W) % e.W; if (Math.sin(e.clock * 3 + i * 2) > 0.6) { ctx.fillStyle = '#fff'; ctx.fillRect(sx - 1, e.groundY + 10 + DRX.hash(i + 5) * 40, 3, 1); ctx.fillRect(sx, e.groundY + 9 + DRX.hash(i + 5) * 40, 1, 3); } }
    },
    grid(ctx, e, P) {                                           // neon perspective grid
      const gy = e.groundY, H = e.H, W = e.W;
      ctx.fillStyle = P.ground; ctx.fillRect(0, gy, W, H - gy);
      ctx.save();
      ctx.shadowColor = P.gB; ctx.shadowBlur = 10;
      ctx.strokeStyle = P.gB; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, gy + 0.5); ctx.lineTo(W, gy + 0.5); ctx.stroke();
      ctx.shadowColor = P.gA; ctx.shadowBlur = 5; ctx.strokeStyle = DRX.alpha(P.gA, 0.7); ctx.lineWidth = 1;
      const n = 9;
      for (let k = 1; k <= n; k++) { const y = gy + (H - gy) * Math.pow((k - ((e.dist * 0.012) % 1)) / n, 2); if (y > gy + 1) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } }
      const sp = 90, ox = (e.dist * 0.7) % sp;
      for (let i = -Math.ceil(W / sp) - 2; i <= Math.ceil(W / sp) + 2; i++) {
        const xb = W / 2 + i * sp - ox;
        ctx.beginPath(); ctx.moveTo(W / 2 + (xb - W / 2) * 0.12, gy); ctx.lineTo(xb, H); ctx.stroke();
      }
      ctx.restore();
    },
    jungle(ctx, e, P) {                                         // dark soil with grass blades
      ctx.fillStyle = P.ground; ctx.fillRect(0, e.groundY, e.W, e.H - e.groundY);
      const off = e.dist * 0.5, st = 7;
      ctx.fillStyle = P.groundLine;
      ctx.beginPath(); ctx.moveTo(0, e.groundY + 1);
      for (let x = -st; x <= e.W + st; x += st) {
        const i = Math.floor((x + off) / st), h = 3 + DRX.hash(i) * 7;
        ctx.lineTo(x, e.groundY + 1); ctx.lineTo(x + st * 0.35, e.groundY - h); ctx.lineTo(x + st * 0.7, e.groundY + 1);
      }
      ctx.lineTo(e.W + st, e.groundY + 3); ctx.lineTo(0, e.groundY + 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = P.groundTick;
      const o2 = off % 50;
      for (let x = -o2; x < e.W; x += 50) { DRX.ell(ctx, x + 12, e.groundY + 16, 7, 2); ctx.fill(); ctx.fillRect(x + 30, e.groundY + 30, 10, 2); }
      ctx.fillStyle = P.gA;
      for (let x = -(off % 90); x < e.W; x += 90) { ctx.beginPath(); ctx.arc(x + 40, e.groundY + 8, 2, 0, DRX.PI2); ctx.fill(); }
    },
    mars(ctx, e, P) {                                           // rust dust with pebbles and craters
      ctx.fillStyle = P.ground; ctx.fillRect(0, e.groundY, e.W, e.H - e.groundY);
      ctx.fillStyle = P.groundLine; ctx.fillRect(0, e.groundY - 1, e.W, 3);
      const off = e.dist * 0.5;
      for (let i = 0; i < 26; i++) {
        const x = (((DRX.hash(i) * e.W * 1.5 - off) % (e.W * 1.5)) + e.W * 1.5) % (e.W * 1.5) - 30;
        const y = e.groundY + 8 + DRX.hash(i + 31) * (e.H - e.groundY - 14), r = 1.5 + DRX.hash(i + 7) * 3.5;
        ctx.fillStyle = i % 3 ? P.groundTick : P.gA; DRX.ell(ctx, x, y, r * 1.6, r); ctx.fill();
        if (i % 6 === 0) { ctx.strokeStyle = P.groundTick; ctx.lineWidth = 1; DRX.ell(ctx, x + 40, y, r * 6, r * 2); ctx.stroke(); }
      }
    },
    lava(ctx, e, P) {                                           // dark rock, glowing lava cracks
      ctx.fillStyle = P.ground; ctx.fillRect(0, e.groundY, e.W, e.H - e.groundY);
      const glow = ctx.createLinearGradient(0, e.groundY - 4, 0, e.groundY + 26);
      glow.addColorStop(0, 'rgba(249,115,22,0.55)'); glow.addColorStop(1, 'rgba(249,115,22,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, e.groundY - 4, e.W, 30);
      ctx.fillStyle = P.groundLine; ctx.fillRect(0, e.groundY - 1, e.W, 3);
      const off = e.dist * 0.5, st = 70, pulse = 0.7 + 0.3 * Math.sin(e.clock * 3);
      ctx.save(); ctx.shadowColor = '#f97316'; ctx.shadowBlur = 6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (let x = -st; x < e.W + st; x += st) {
        const i = Math.floor((x + off) / st), bx = x - ((off) % st), sy = e.groundY + 5 + DRX.hash(i) * 12;
        ctx.strokeStyle = DRX.alpha('#fb923c', pulse); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx + 5, e.groundY + 3);
        let px = bx + 5, py = sy;
        ctx.lineTo(px, py);
        for (let k = 0; k < 4; k++) { px += 8 + DRX.hash(i + k * 3) * 10; py += (DRX.hash(i + k + 11) - 0.35) * 16; ctx.lineTo(px, Math.min(e.H - 2, py)); }
        ctx.stroke();
        ctx.strokeStyle = DRX.alpha('#fde047', pulse * 0.8); ctx.lineWidth = 0.8; ctx.stroke();
      }
      ctx.restore();
    },
    candy(ctx, e, P) {                                          // pink frosting with drips and sprinkles
      ctx.fillStyle = P.ground; ctx.fillRect(0, e.groundY, e.W, e.H - e.groundY);
      const off = e.dist * 0.5;
      ctx.fillStyle = P.gA;
      ctx.beginPath(); ctx.moveTo(0, e.groundY);
      for (let x = 0; x <= e.W + 6; x += 6) ctx.lineTo(x, e.groundY + 5 + Math.max(0, Math.sin((x + off) * 0.06)) * 7 + Math.max(0, Math.sin((x + off) * 0.021 + 2)) * 5);
      ctx.lineTo(e.W, e.groundY); ctx.closePath(); ctx.fill();
      ctx.fillStyle = P.groundLine; ctx.fillRect(0, e.groundY - 2, e.W, 3);
      const cols = ['#fb7185', '#38bdf8', '#facc15', '#a78bfa', '#34d399'];
      for (let i = 0; i < 40; i++) {
        const x = (((DRX.hash(i) * e.W * 1.3 - off) % (e.W * 1.3)) + e.W * 1.3) % (e.W * 1.3) - 20, y = e.groundY + 20 + DRX.hash(i + 9) * (e.H - e.groundY - 26);
        ctx.save(); ctx.translate(x, y); ctx.rotate(DRX.hash(i + 3) * 3); ctx.fillStyle = cols[i % 5]; DRX.rr(ctx, -3, -1, 6, 2.4, 1.2); ctx.fill(); ctx.restore();
      }
    },
    seabed(ctx, e, P) {                                         // sand with ripples and shells
      ctx.fillStyle = P.ground; ctx.fillRect(0, e.groundY, e.W, e.H - e.groundY);
      const off = e.dist * 0.5;
      ctx.fillStyle = P.groundLine;
      ctx.beginPath(); ctx.moveTo(0, e.groundY + 4);
      for (let x = 0; x <= e.W + 8; x += 8) ctx.lineTo(x, e.groundY - 1 - Math.max(0, Math.sin((x + off) * 0.03)) * 2.2);
      ctx.lineTo(e.W, e.groundY + 4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = P.groundTick; ctx.lineWidth = 1.4;
      const o2 = off % 46;
      for (let x = -o2; x < e.W; x += 46) { ctx.beginPath(); ctx.arc(x + 14, e.groundY + 12, 9, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 34, e.groundY + 28, 7, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      for (let i = 0; i < 9; i++) {
        const x = (((DRX.hash(i + 50) * e.W * 1.4 - off) % (e.W * 1.4)) + e.W * 1.4) % (e.W * 1.4) - 20, y = e.groundY + 14 + DRX.hash(i + 70) * (e.H - e.groundY - 24);
        ctx.fillStyle = i % 2 ? '#fecdd3' : '#fde68a'; ctx.beginPath(); ctx.arc(x, y, 2.6, Math.PI, 0); ctx.fill();
      }
    },
    tiles(ctx, e, P) {                                          // blocky brick ground (pixel theme)
      ctx.fillStyle = P.ground; ctx.fillRect(0, e.groundY, e.W, e.H - e.groundY);
      ctx.fillStyle = P.groundLine; ctx.fillRect(0, e.groundY, e.W, 3);
      ctx.fillStyle = P.groundTick;
      const off = e.dist * 0.5, bw = 30, bh = 12;
      for (let r = 0, y = e.groundY + 6; y < e.H; r++, y += bh) {
        ctx.fillRect(0, y, e.W, 1.5);
        const o = (off + (r % 2) * bw / 2) % bw;
        for (let x = -o; x < e.W; x += bw) ctx.fillRect(x, y, 1.5, bh);
      }
    },
  },
};
