/**
 * Car Run — PLAYER CAR model. Replace this file to swap the car.
 * Contract: register CAR_RUN_ASSETS.car = { draw(ctx, p, o) }.
 *  ctx: CanvasRenderingContext2D. p: projected point {x, y, k}; (p.x, p.y) = screen
 *  point on the ground under the car's centre (draw upward from there).
 *  o.w / o.h: on-screen width/height in px (from sizes.playerW/H x p.k).
 *  o.shadow: projected ground point (or null). o.nitro: boolean. o.C / o.S: config colors/sizes.
 *  View: car seen from behind, driving away from the camera (into the screen).
 */
window.CAR_RUN_ASSETS = window.CAR_RUN_ASSETS || {};
window.CAR_RUN_ASSETS.car = {
  draw(ctx, p, o) {
    const { C, S, w, h } = o;
    ctx.fillStyle = C.playerShadow;
    const sh = o.shadow;
    if (sh) {
      ctx.beginPath();
      ctx.ellipse(sh.x, sh.y, w * 0.45, Math.max(3, h * 0.12), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const body = o.nitro ? C.playerNitro : C.player;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - h);
    ctx.lineTo(p.x + w / 2, p.y - h * 0.35);
    ctx.lineTo(p.x + w * 0.42, p.y);
    ctx.lineTo(p.x - w * 0.42, p.y);
    ctx.lineTo(p.x - w / 2, p.y - h * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.playerOutline;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = C.playerGlass;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - h * 0.88);
    ctx.lineTo(p.x + w * 0.28, p.y - h * 0.5);
    ctx.lineTo(p.x - w * 0.28, p.y - h * 0.5);
    ctx.closePath();
    ctx.fill();
    if (o.nitro) {
      ctx.fillStyle = C.nitroFlame;
      ctx.beginPath();
      ctx.moveTo(p.x - w * 0.15, p.y);
      ctx.lineTo(p.x, p.y + h * (0.45 + Math.random() * S.nitroFlame));
      ctx.lineTo(p.x + w * 0.15, p.y);
      ctx.fill();
    }
  },
};
