/** Lollipop cactus — a candy-striped trunk with swirl lollipops for the top and arm. */
DR.registerObstacle({
  id: 'lollipop',
  kind: 'ground',
  draw(ctx, o, env, th) {
    const gy = o.y + o.h, cx = o.x + o.w / 2, tw = Math.max(5, o.w * 0.45);
    const swirl = (x, y, r, c1, c2) => {
      ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(x, y, r, 0, DRX.PI2); ctx.fill();
      ctx.strokeStyle = c2; ctx.lineWidth = Math.max(1.4, r * 0.28); ctx.lineCap = 'round';
      ctx.beginPath();
      for (let a = 0; a < 11; a += 0.4) { const rr = (a / 11) * (r - 1.6); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; a ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke(); ctx.lineCap = 'butt';
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; DRX.ell(ctx, x - r * 0.35, y - r * 0.4, r * 0.25, r * 0.15, -0.6); ctx.fill();
    };
    const stick = (x, y0, y1, w) => {
      ctx.save(); DRX.rr(ctx, x - w / 2, y0, w, y1 - y0, w / 2); ctx.clip();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - w / 2, y0, w, y1 - y0);
      ctx.fillStyle = '#34d399';
      for (let y = y0 - w; y < y1; y += 8) { DRX.poly(ctx, [x - w / 2, y + 4, x + w / 2, y, x + w / 2, y + 4, x - w / 2, y + 8]); ctx.fill(); }
      ctx.restore();
    };
    const r = Math.min(11, o.h * 0.26);
    stick(cx - o.w * 0.9 - 1, o.y + o.h * 0.45, gy - o.h * 0.25, 3.5);        // small side lollipop
    swirl(cx - o.w * 0.9 - 1, o.y + o.h * 0.42, 5, '#fda4af', '#ffffff');
    stick(cx, o.y + r, gy, tw);
    swirl(cx, o.y + r, r, '#f472b6', '#ffffff');
    stick(cx + o.w * 0.9 + 1, o.y + o.h * 0.6, gy - o.h * 0.1, 3.5);
    swirl(cx + o.w * 0.9 + 1, o.y + o.h * 0.57, 4.5, '#a78bfa', '#ffffff');
  },
});
