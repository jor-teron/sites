// Matter body factories shared by the game (entities.js) and the level tests.
import { Bodies, Body, WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y, MAT } from './config.js';

export function makeGround() {
  return Bodies.rectangle(WORLD_WIDTH / 2, GROUND_Y + 60, WORLD_WIDTH * 2, 120,
    { isStatic: true, friction: 0.9, restitution: 0.05 });
}
// Invisible wall on the left so nothing flies out weirdly
export function makeLeftWall() {
  return Bodies.rectangle(-30, WORLD_HEIGHT / 2, 60, WORLD_HEIGHT * 2, { isStatic: true });
}
export function makeBlockBody(b) {
  const mat = MAT[b.material];
  const opts = { friction: mat.friction, restitution: mat.restitution, density: mat.density };
  const body = b.r ? Bodies.circle(b.x, b.y, b.r, opts) : Bodies.rectangle(b.x, b.y, b.w, b.h, opts);
  if (b.angle) Body.setAngle(body, b.angle);
  return body;
}
export function makePigBody(p) {
  return Bodies.circle(p.x, p.y, p.r, { friction: 0.5, restitution: 0.3, density: 0.0008 });
}
// Static rock: hills (pedestals standing on the ground) and floating ledges
export function makePlatformBody(pl) {
  return Bodies.rectangle(pl.x, pl.y, pl.w, pl.h, { isStatic: true, friction: 0.9, restitution: 0.05 });
}
