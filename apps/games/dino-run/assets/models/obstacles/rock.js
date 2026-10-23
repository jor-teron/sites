/** Rock — a jagged two-tone boulder (Mars). */
DR.registerObstacle({
  id: 'rock',
  kind: 'ground',
  draw(ctx, o, env, th) {
    const gy = o.y + o.h, c = th.pal.rock || '#9a3412', lt = DRX.mix(c, '#ffffff', 0.18), dk = DRX.mix(c, '#000000', 0.35);
    const pk = o.x + o.w * 0.45;
    ctx.fillStyle = c;
    DRX.poly(ctx, [o.x - 5, gy, o.x - 3, o.y + o.h * 0.5, o.x + o.w * 0.15, o.y + o.h * 0.18, pk, o.y, o.x + o.w + 1, o.y + o.h * 0.3, o.x + o.w + 5, o.y + o.h * 0.62, o.x + o.w + 6, gy]); ctx.fill();
    ctx.fillStyle = lt; DRX.poly(ctx, [o.x - 3, o.y + o.h * 0.5, o.x + o.w * 0.15, o.y + o.h * 0.18, pk, o.y, pk - 2, o.y + o.h * 0.5, o.x + 2, gy - 2]); ctx.fill();
    ctx.fillStyle = dk; DRX.poly(ctx, [pk, o.y, o.x + o.w + 1, o.y + o.h * 0.3, o.x + o.w + 6, gy, o.x + o.w * 0.5, gy, pk + 3, o.y + o.h * 0.45]); ctx.fill();
    ctx.strokeStyle = dk; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pk - 2, o.y + o.h * 0.5); ctx.lineTo(pk + 2, o.y + o.h * 0.7); ctx.lineTo(pk - 1, gy - 3); ctx.stroke();
  },
});
