/** Car Run — traffic car (obstacle). Same draw(ctx, p, o) contract as assets/car.js. */
window.CAR_RUN_ASSETS = window.CAR_RUN_ASSETS || {};
window.CAR_RUN_ASSETS.trafficCar = {
  draw(ctx, p, o) {
    const { C, w, h } = o;
    ctx.fillStyle = C.car;
    ctx.fillRect(p.x - w / 2, p.y - h, w, h * 0.7);
    ctx.fillStyle = C.carGlass;
    ctx.fillRect(p.x - w * 0.35, p.y - h * 0.85, w * 0.7, h * 0.25);
    ctx.fillStyle = C.carWheel;
    ctx.fillRect(p.x - w * 0.4, p.y - h * 0.15, w * 0.25, h * 0.15);
    ctx.fillRect(p.x + w * 0.15, p.y - h * 0.15, w * 0.25, h * 0.15);
  },
};
