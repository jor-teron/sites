/**
 * Car Run — PLAYER CAR model. Replace this file to swap the car.
 * Contract: register CAR_RUN_ASSETS.car = { draw(ctx, p, o) }.
 *  ctx: CanvasRenderingContext2D. p: projected point {x, y, k} on the ground under the car's centre.
 *  o.w / o.h: on-screen width/height in px (legacy). o.C / o.S: config colors/sizes.
 *  o.scene: { project, cam, nearZ } and o.world: { x, y, z } (car centre in world units),
 *  o.yaw / o.roll: lane-change turn and lean, o.nitro, o.braking: booleans.
 *  Drawn as a pseudo-3D box model (assets/car_model.js), seen from behind and above.
 */
window.CAR_RUN_ASSETS = window.CAR_RUN_ASSETS || {};
window.CAR_RUN_ASSETS.car = {
  draw(ctx, p, o) {
    const { C, S } = o;
    window.CAR_RUN_ASSETS.model.drawCar(ctx, o.scene, {
      x: o.world.x, y: o.world.y, z: o.world.z,
      w: S.playerW, h: S.playerH, len: S.playerLen,
      color: o.nitro ? C.playerNitro : C.player,
      yaw: o.yaw || 0, roll: o.roll || 0,
      braking: !!o.braking, nitro: !!o.nitro,
    });
  },
};
