/** Saguaro — a rounded cactus with bent arms and ribs. */
DR.registerObstacle({
  id: 'saguaro',
  kind: 'ground',
  draw(ctx, o, env, th) {
    const c = th.pal.cactus, dk = DRX.mix(c, '#000000', 0.28), cx = o.x + o.w / 2, gy = o.y + o.h;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const arm = (side, yy, up) => {                          // elbow arm: out, then up
      ctx.strokeStyle = c; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(cx, o.y + yy + 5);
      ctx.lineTo(cx + side * (o.w / 2 + 4), o.y + yy + 5); ctx.lineTo(cx + side * (o.w / 2 + 4), o.y + yy - up);
      ctx.stroke();
    };
    arm(-1, o.h * 0.42, 9); arm(1, o.h * 0.3, 11);
    ctx.fillStyle = c; DRX.rr(ctx, o.x, o.y, o.w, o.h, o.w / 2); ctx.fill();
    ctx.strokeStyle = dk; ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(cx + i * o.w * 0.25, o.y + 4); ctx.lineTo(cx + i * o.w * 0.25, gy - 1); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 4; i++) ctx.fillRect(cx - o.w * 0.5 + (i % 2) * o.w - 1, o.y + 8 + i * (o.h - 14) / 4, 2, 1.5);
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  },
});
