/** Car Run — coin pickup. draw(ctx, p, o); radius from o.S.coinRadius x p.k. */
window.CAR_RUN_ASSETS = window.CAR_RUN_ASSETS || {};
window.CAR_RUN_ASSETS.coin = {
  draw(ctx, p, o) {
    const { C, S } = o;
    const r = Math.max(S.coinMinRadius, p.k * S.coinRadius);
    ctx.fillStyle = C.coin;
    ctx.beginPath();
    ctx.arc(p.x, p.y - r, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.coinInner;
    ctx.beginPath();
    ctx.arc(p.x, p.y - r, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  },
};
