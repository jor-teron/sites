/**
 * Car Run — traffic car (obstacle). Same draw(ctx, p, o) contract as assets/car.js.
 * o.color: body colour picked at spawn from CFG.colors.trafficPalette.
 * Traffic always shows its tail lights lit a little (o.braking false = dim lights).
 */
window.CAR_RUN_ASSETS = window.CAR_RUN_ASSETS || {};
window.CAR_RUN_ASSETS.trafficCar = {
  draw(ctx, p, o) {
    const { C, S } = o;
    window.CAR_RUN_ASSETS.model.drawCar(ctx, o.scene, {
      x: o.world.x, y: 0, z: o.world.z,
      w: S.carW, h: S.carH, len: S.carLen,
      color: o.color || C.car,
      yaw: 0, roll: 0, braking: !!o.braking, nitro: false,
    });
  },
};
