/** Car Run — road barrier (obstacle). draw(ctx, p, o) with o.w/o.h in px. */
window.CAR_RUN_ASSETS = window.CAR_RUN_ASSETS || {};
window.CAR_RUN_ASSETS.barrier = {
  draw(ctx, p, o) {
    const { C, w, h } = o;
    ctx.fillStyle = C.barrier;
    ctx.fillRect(p.x - w / 2, p.y - h, w, h);
    ctx.fillStyle = C.barrierStripe;
    ctx.fillRect(p.x - w / 2, p.y - h * 0.55, w, h * 0.18);
  },
};
