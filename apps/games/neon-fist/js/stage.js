// Background: a rainy neon street in front of a small dojo. Static layer is cached per size.
(function () {
  const Dr = NF.draw;
  let cache = null, cw = 0, ch = 0;
  function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  function build(W, H, gy) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), r = rnd(7);
    const hz = H * 0.62;
    let g = x.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#07061a'); g.addColorStop(0.6, '#1b0f3a'); g.addColorStop(1, '#3a1450');
    x.fillStyle = g; x.fillRect(0, 0, W, hz);
    // far skyline
    for (let layer = 0; layer < 2; layer++) {
      let bx = -20;
      while (bx < W) {
        const bw = W * (0.04 + r() * 0.07), bh = H * (layer ? 0.18 + r() * 0.2 : 0.3 + r() * 0.25);
        x.fillStyle = layer ? '#1a1030' : '#100a22'; x.fillRect(bx, hz - bh, bw, bh);
        for (let wy = hz - bh + 8; wy < hz - 6; wy += 11) for (let wx = bx + 5; wx < bx + bw - 6; wx += 9)
          if (r() < 0.22) { x.fillStyle = r() < 0.5 ? 'rgba(255,190,90,0.5)' : 'rgba(120,200,255,0.4)'; x.fillRect(wx, wy, 4, 6); }
        bx += bw + 4;
      }
    }
    // dojo facade in the middle
    const dw = W * 0.5, dx = (W - dw) / 2, dtop = H * 0.2;
    x.fillStyle = '#1c1220'; x.fillRect(dx, dtop + H * 0.08, dw, hz - dtop - H * 0.08);
    x.fillStyle = '#2b1726';
    x.beginPath(); x.moveTo(dx - W * 0.05, dtop + H * 0.09); x.quadraticCurveTo(W / 2, dtop - H * 0.02, dx + dw + W * 0.05, dtop + H * 0.09); x.lineTo(dx + dw, dtop + H * 0.06); x.lineTo(dx, dtop + H * 0.06); x.fill();
    for (let i = 0; i < 6; i++) {   // shoji panels, warmly lit
      const px = dx + dw * (0.06 + i * 0.15), pw = dw * 0.12, py = dtop + H * 0.14, ph = hz - py - H * 0.02;
      g = x.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, 'rgba(255,170,90,0.28)'); g.addColorStop(1, 'rgba(255,120,60,0.12)');
      x.fillStyle = g; x.fillRect(px, py, pw, ph);
      x.strokeStyle = 'rgba(30,15,20,0.8)'; x.lineWidth = 2;
      for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo(px + pw * k / 4, py); x.lineTo(px + pw * k / 4, py + ph); x.stroke(); }
      for (let k = 1; k < 6; k++) { x.beginPath(); x.moveTo(px, py + ph * k / 6); x.lineTo(px + pw, py + ph * k / 6); x.stroke(); }
    }
    // lanterns
    for (const lx of [dx + dw * 0.03, dx + dw * 0.97]) {
      const ly = dtop + H * 0.16; const lg = x.createRadialGradient(lx, ly, 0, lx, ly, H * 0.08);
      lg.addColorStop(0, 'rgba(255,90,60,0.55)'); lg.addColorStop(1, 'rgba(255,60,40,0)'); x.fillStyle = lg; x.fillRect(lx - H * 0.1, ly - H * 0.1, H * 0.2, H * 0.2);
      x.fillStyle = '#e8402a'; x.beginPath(); x.ellipse(lx, ly, H * 0.018, H * 0.026, 0, 0, 7); x.fill();
    }
    // floor: wet asphalt with perspective lines
    g = x.createLinearGradient(0, hz, 0, H); g.addColorStop(0, '#1a1228'); g.addColorStop(1, '#07060d');
    x.fillStyle = g; x.fillRect(0, hz, W, H - hz);
    x.strokeStyle = 'rgba(160,120,255,0.08)'; x.lineWidth = 1;
    for (let i = -12; i <= 12; i++) { x.beginPath(); x.moveTo(W / 2 + i * W * 0.02, hz); x.lineTo(W / 2 + i * W * 0.16, H); x.stroke(); }
    for (let k = 0; k < 8; k++) { const y = hz + (H - hz) * Math.pow(k / 8, 1.8); x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
    // reflections of signs/lanterns
    for (const [rx, col] of [[W * 0.2, 'rgba(255,60,200,0.16)'], [W * 0.82, 'rgba(60,220,255,0.16)'], [dx + dw * 0.03, 'rgba(255,90,60,0.14)'], [dx + dw * 0.97, 'rgba(255,90,60,0.14)']]) {
      const rg = x.createLinearGradient(0, hz, 0, H); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = rg; x.fillRect(rx - W * 0.03, hz, W * 0.06, H - hz);
    }
    const fade = x.createLinearGradient(0, hz - 10, 0, hz + 30); fade.addColorStop(0, 'rgba(255,80,200,0.25)'); fade.addColorStop(1, 'rgba(255,80,200,0)');
    x.fillStyle = fade; x.fillRect(0, hz - 10, W, 40);
    return c;
  }
  function sign(x, text, sx, sy, size, col, flick) {
    x.save(); x.font = '900 ' + size + 'px system-ui, sans-serif'; x.textAlign = 'center';
    x.shadowColor = col; x.shadowBlur = size * 0.6 * flick; x.fillStyle = col; x.globalAlpha = 0.55 + 0.45 * flick;
    x.fillText(text, sx, sy); x.shadowBlur = 0; x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillText(text, sx, sy); x.restore();
  }
  function draw(ctx, W, H, gy, t) {
    if (!cache || cw !== W || ch !== H) { cache = build(W, H, gy); cw = W; ch = H; }
    ctx.drawImage(cache, 0, 0);
    const f1 = Math.sin(t * 40) > 0.95 ? 0.3 : 1, f2 = 0.85 + 0.15 * Math.sin(t * 3);
    sign(ctx, 'NEON', W * 0.2, H * 0.2, H * 0.07, '#ff3fd0', f1);
    sign(ctx, 'FIST', W * 0.2, H * 0.28, H * 0.07, '#ff3fd0', f1);
    sign(ctx, 'DOJO', W * 0.82, H * 0.2, H * 0.06, '#3fe6ff', f2);
    // drifting rain
    ctx.strokeStyle = 'rgba(180,200,255,0.12)'; ctx.lineWidth = 1;
    for (let i = 0; i < 70; i++) {
      const x = (i * 97.3 + t * 60) % W, y = ((i * 53.7) % H + t * H * 1.4) % H;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + H * 0.025); ctx.stroke();
    }
  }
  NF.stage = { draw };
})();
