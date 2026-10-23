/** Fern — a fan of curved fronds with leaflets. */
DR.registerObstacle({
  id: 'fern',
  kind: 'ground',
  draw(ctx, o, env, th) {
    const gy = o.y + o.h, cx = o.x + o.w / 2;
    ctx.lineCap = 'round';
    const fronds = [-62, -36, -14, 0, 16, 38, 64];
    fronds.forEach((deg, i) => {
      const a = deg * Math.PI / 180, len = o.h * (0.62 + 0.38 * Math.cos(a * 1.1)), sw = Math.sin(env.clock * 2.2 + i) * 1.2;
      const tx = cx + Math.sin(a) * len * 0.75 + sw, ty = gy - Math.cos(a) * len;
      const mx = cx + Math.sin(a) * len * 0.2, my = gy - len * 0.7;
      ctx.strokeStyle = i % 2 ? '#15803d' : '#22c55e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, gy); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
      ctx.lineWidth = 1.4;
      for (let k = 1; k <= 4; k++) {                           // leaflets
        const u = k / 5, px = (1 - u) * (1 - u) * cx + 2 * u * (1 - u) * mx + u * u * tx, py = (1 - u) * (1 - u) * gy + 2 * u * (1 - u) * my + u * u * ty;
        const ll = 6 * (1 - u * 0.5);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - ll, py + ll * 0.3); ctx.moveTo(px, py); ctx.lineTo(px + ll, py + ll * 0.3); ctx.stroke();
      }
    });
    ctx.lineCap = 'butt';
  },
});
