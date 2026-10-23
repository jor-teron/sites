/** Classic bird — the original blocky bird, wings flapping. */
DR.registerObstacle({
  id: 'bird',
  kind: 'air',
  draw(ctx, o, env, th) {
    ctx.fillStyle = th.pal.bird;
    ctx.fillRect(o.x, o.y + 8, o.w, 12);
    ctx.fillRect(o.x + 28, o.y + 4, 12, 10);
    ctx.fillStyle = th.pal.birdWing;
    if (Math.sin(o.flap) > 0) ctx.fillRect(o.x + 8, o.y, 16, 8);
    else ctx.fillRect(o.x + 8, o.y + 14, 16, 8);
  },
});
