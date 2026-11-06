/** HEX-7a jump step — pure (Node-smokeable). Impulse 6, gravity 18. */
export const JUMP_SPEED = 6;
export const GRAVITY = 18;

/**
 * @param {{ y:number, vy:number, grounded:boolean, terrainY:number, jumpPulse:boolean, dt:number }} s
 * @returns {{ y:number, vy:number, grounded:boolean }}
 */
export function stepJump(s) {
  let { y, vy, grounded, terrainY, jumpPulse } = s;
  let dt = s.dt;
  if (dt > 0.05) dt = 0.05;

  if (grounded && jumpPulse) {
    vy = JUMP_SPEED;
    grounded = false;
  }

  if (!grounded) {
    vy -= GRAVITY * dt;
    y += vy * dt;
    if (y <= terrainY) {
      y = terrainY;
      vy = 0;
      grounded = true;
    }
  } else {
    // feet on (possibly smoothed) ground height supplied as y; never sink below terrain
    if (y < terrainY) y = terrainY;
    vy = 0;
  }
  return { y, vy, grounded };
}
