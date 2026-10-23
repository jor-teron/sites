/** Coral — a branching reef coral that sways in the current. */
DR.registerObstacle({
  id: 'coral',
  kind: 'ground',
  draw(ctx, o, env, th) {
    const gy = o.y + o.h, cx = o.x + o.w / 2, c = th.pal.coral || '#fb7185', dk = DRX.mix(c, '#000000', 0.25);
    ctx.lineCap = 'round';
    const br = (x0, y0, x1, y1, w, depth, ph) => {
      const sx = Math.sin(env.clock * 1.8 + ph) * (2 - depth * 0.4);
      ctx.strokeStyle = depth % 2 ? c : DRX.mix(c, '#ffffff', 0.12); ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 + sx, y1); ctx.stroke();
      ctx.fillStyle = dk; ctx.beginPath(); ctx.arc(x1 + sx, y1, w * 0.62, 0, DRX.PI2); ctx.fill();
      ctx.fillStyle = DRX.mix(c, '#ffffff', 0.4); ctx.beginPath(); ctx.arc(x1 + sx, y1, w * 0.3, 0, DRX.PI2); ctx.fill();
      return [x1 + sx, y1];
    };
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(5, o.w * 0.5);
    ctx.beginPath(); ctx.moveTo(cx, gy); ctx.lineTo(cx, gy - o.h * 0.5); ctx.stroke();
    const m = br(cx, gy - o.h * 0.4, cx, o.y + 3, Math.max(4, o.w * 0.4), 0, 0);
    const l = br(cx, gy - o.h * 0.45, cx - o.w * 0.75 - 3, o.y + o.h * 0.3, 4, 1, 1.7);
    const r = br(cx, gy - o.h * 0.3, cx + o.w * 0.75 + 3, o.y + o.h * 0.42, 4, 1, 3.1);
    br(l[0], l[1] + 2, l[0] - 5, o.y + o.h * 0.1, 3, 2, 0.4);
    br(r[0], r[1] + 2, r[0] + 5, o.y + o.h * 0.25, 3, 2, 2.2);
    ctx.lineCap = 'butt';
  },
});
