/**
 * Car Run — road barrier (obstacle). draw(ctx, p, o); o.scene / o.world as in assets/car.js.
 * Pseudo-3D: two legs and a striped board (assets/car_model.js).
 */
window.CAR_RUN_ASSETS = window.CAR_RUN_ASSETS || {};
window.CAR_RUN_ASSETS.barrier = {
  draw(ctx, p, o) {
    const { C, S } = o;
    window.CAR_RUN_ASSETS.model.drawBarrier(ctx, o.scene, {
      x: o.world.x, z: o.world.z,
      w: S.barrierW, h: S.barrierH, len: S.barrierLen,
      color: C.barrier, stripe: C.barrierStripe,
    });
  },
};
