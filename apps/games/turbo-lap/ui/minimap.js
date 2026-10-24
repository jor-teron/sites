/* Turbo Lap — circuit preview (TLQ1f): draws a circuit's route outline from the same track data and bend integration
   the race minimap uses (TL.road.curvesOf + TL.road.mapOf), so a preview always matches the real track. No image files.
   TL.minimap.url(n) returns a cached PNG data URL (one per circuit) for the Circuits grid and the title screen. */
window.TL = window.TL || {};
(() => {
  const W = 200, H = 150, cache = {}, pts = {};
  const M = TL.minimap = {
    points(n) { return pts[n] || (pts[n] = TL.road.mapOf(TL.road.curvesOf(TL.circuits.get(n)))); },
    // draw circuit n into a 2-D context, fitted into w x h with padding
    draw(ctx, n, w, h) {
      const p = M.points(n), N = p.length, pad = Math.max(8, Math.min(w, h) * 0.12);
      let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
      p.forEach(q => { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); });
      const k = Math.min((w - 2 * pad) / ((x1 - x0) || 1), (h - 2 * pad) / ((y1 - y0) || 1));
      const ox = (w - (x1 - x0) * k) / 2 - x0 * k, oy = (h - (y1 - y0) * k) / 2 - y0 * k;
      const X = q => ox + q.x * k, Y = q => oy + q.y * k, lw = Math.max(2, Math.min(w, h) * 0.035);
      ctx.save(); ctx.lineJoin = ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= N; i += 3) { const q = p[i % N]; i ? ctx.lineTo(X(q), Y(q)) : ctx.moveTo(X(q), Y(q)); }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(8,10,24,0.85)'; ctx.lineWidth = lw * 2.2; ctx.stroke();      // soft road edge
      ctx.strokeStyle = '#cfd8ff'; ctx.lineWidth = lw; ctx.stroke();
      // start mark (yellow bar across the road) and a direction arrow a little after it
      const a = p[0], b = p[Math.min(N - 1, Math.round(N * 0.03))], ang = Math.atan2(Y(b) - Y(a), X(b) - X(a));
      ctx.translate(X(a), Y(a)); ctx.rotate(ang);
      ctx.fillStyle = '#ffd400'; ctx.fillRect(-lw * 0.7, -lw * 2, lw * 1.4, lw * 4);
      const s = lw * 1.9, d = lw * 3.4;
      ctx.beginPath(); ctx.moveTo(d + s, 0); ctx.lineTo(d - s * 0.4, -s); ctx.lineTo(d - s * 0.4, s); ctx.closePath();
      ctx.fillStyle = '#7fd8ff'; ctx.strokeStyle = 'rgba(8,10,24,0.9)'; ctx.lineWidth = Math.max(1, lw * 0.4); ctx.fill(); ctx.stroke();
      ctx.restore();
    },
    url(n) {
      if (cache[n]) return cache[n];
      const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
      const x = c.getContext('2d'); x.scale(2, 2); M.draw(x, n, W, H);
      return (cache[n] = c.toDataURL('image/png'));
    }
  };
})();
