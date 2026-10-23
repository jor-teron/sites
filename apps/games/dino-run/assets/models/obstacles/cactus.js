/** Classic cactus — the original blocky cactus (body plus two stub arms). */
DR.registerObstacle({
  id: 'cactus',
  kind: 'ground',
  draw(ctx, o, env, th) {
    ctx.fillStyle = th.pal.cactus;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillRect(o.x - 6, o.y + o.h * 0.35, 6, 8);
    ctx.fillRect(o.x + o.w, o.y + o.h * 0.25, 6, 8);
  },
});
