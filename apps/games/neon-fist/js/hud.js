// Semi-transparent mock fight HUD for the versus preview (health, timer, round pips, meters).
(function () {
  const C = NF.config;
  function bar(ctx, x, y, w, h, frac, col, rev) {
    ctx.fillStyle = 'rgba(10,8,22,0.85)'; ctx.fillRect(x, y, w, h);
    const fw = w * frac, g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g; ctx.fillRect(rev ? x + w - fw : x, y, fw, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  }
  function draw(ctx, W, H, a, b, t) {
    ctx.save(); ctx.globalAlpha = C.uiAlpha;
    const m = W * 0.03, bw = W * 0.38, bh = H * 0.035, y = H * 0.04;
    bar(ctx, m, y, bw, bh, 0.82, '#ffd23a', true);
    bar(ctx, W - m - bw, y, bw, bh, 0.64, '#ffd23a', false);
    ctx.font = '900 ' + Math.round(H * 0.03) + 'px system-ui, sans-serif'; ctx.fillStyle = '#fff';
    ctx.textAlign = 'left'; ctx.fillText(a.name, m, y + bh + H * 0.035);
    ctx.textAlign = 'right'; ctx.fillText(b.name, W - m, y + bh + H * 0.035);
    ctx.textAlign = 'center'; ctx.font = '900 ' + Math.round(H * 0.07) + 'px system-ui, sans-serif';
    ctx.fillText(String(60 - Math.floor(t % 60)).padStart(2, '0'), W / 2, y + H * 0.06);
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = i === 0 ? '#ff3fd0' : 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(W / 2 - H * 0.06 - i * H * 0.03, y + H * 0.09, H * 0.01, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(W / 2 + H * 0.06 + i * H * 0.03, y + H * 0.09, H * 0.01, 0, 7); ctx.fill();
    }
    const mw = W * 0.2, mh = H * 0.018, my = H * 0.94;
    bar(ctx, m, my, mw, mh, 0.55 + 0.1 * Math.sin(t), a.accent, false);
    bar(ctx, W - m - mw, my, mw, mh, 0.3, b.accent, true);
    ctx.restore();
  }
  NF.hud = { draw };
})();
