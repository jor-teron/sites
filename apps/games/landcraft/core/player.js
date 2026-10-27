// LandCraft player: an axis-aligned box (0.6 x 1.8 x 0.6) with gravity, jumping and block collision.
// Movement is split into small substeps and resolved one axis at a time, so the player never tunnels
// through blocks, slides along walls, and stands stably on block edges.
// LC3: input.autoJump (touch setting) hops up a 1-block step when walking into it on the ground.
// LC4: swimming. With the body in water: slower walking, slow sinking (fast falls are braked), holding jump
// swims up, and at the surface jumping (or auto-jump) into a bank hops out onto it.
import { solid } from './blocks.js';
import { isWater } from './water.js';

export const EYE = 1.62;
const HALF = 0.3, HEIGHT = 1.8, GRAVITY = 28, JUMP = 8.4, SPEED = 4.3, EPS = 1e-4;
// Water (per second): sink gravity, top sinking speed, swim-up acceleration and top speed, walk speed factor.
// W_SURF caps swim-up once the chest is out, so holding jump floats you at the surface instead of bouncing.
const W_GRAVITY = 5, W_SINK = 1.4, W_ACCEL = 14, W_UP = 3, W_SURF = 0.8, W_SPEED = 0.6;

export class Player {
  constructor(world, x, y, z) {
    this.world = world;
    this.spawn = { x: x, y: y, z: z };
    this.pos = { x: x, y: y, z: z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0; this.onGround = false;
    this.bumped = false; // walked into a wall this update (x or z blocked)
    this.swimming = false; // body (feet or chest) in water
  }
  // True if the block cell (x, y, z) would intersect the player's box.
  overlaps(x, y, z) {
    const p = this.pos;
    return x < p.x + HALF && x + 1 > p.x - HALF && y < p.y + HEIGHT && y + 1 > p.y && z < p.z + HALF && z + 1 > p.z - HALF;
  }
  collides() {
    const p = this.pos;
    for (let y = Math.floor(p.y); y <= Math.floor(p.y + HEIGHT - EPS); y++)
      for (let x = Math.floor(p.x - HALF); x <= Math.floor(p.x + HALF - EPS); x++)
        for (let z = Math.floor(p.z - HALF); z <= Math.floor(p.z + HALF - EPS); z++)
          if (solid(this.world.get(x, y, z))) return true;
    return false;
  }
  // Move along one axis; on contact, snap flush against the block face and stop on that axis.
  moveAxis(axis, d) {
    const p = this.pos;
    p[axis] += d;
    if (!this.collides()) return;
    if (axis === 'y') {
      if (d < 0) { p.y = Math.floor(p.y) + 1; this.onGround = true; }
      else p.y = Math.floor(p.y + HEIGHT) - HEIGHT - EPS;
    } else {
      this.bumped = true;
      p[axis] = d > 0 ? Math.floor(p[axis] + HALF) - HALF - EPS : Math.floor(p[axis] - HALF) + 1 + HALF + EPS;
    }
    this.vel[axis] = 0;
  }
  // True if the spot 0.45 ahead (dx, dz = walk direction) at height `atY` (default: one block above the block
  // we stand on) is free: a 1-high step, not a wall.
  stepFree(dx, dz, atY) {
    const l = Math.hypot(dx, dz) || 1, p = this.pos, x = p.x, y = p.y, z = p.z;
    p.x += dx / l * 0.45; p.z += dz / l * 0.45; p.y = atY !== undefined ? atY : Math.floor(y + 0.01) + 1.01;
    const free = !this.collides();
    p.x = x; p.y = y; p.z = z;
    return free;
  }
  // input: fwd and strafe in -1..1, jump and autoJump booleans. dt in seconds.
  update(dt, input) {
    let f = input.fwd, s = input.strafe;
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw), w = this.world, p = this.pos;
    const feetW = isWater(w, p.x, p.y + 0.1, p.z), chestW = isWater(w, p.x, p.y + 1.2, p.z);
    this.swimming = feetW || chestW;
    const speed = this.swimming ? SPEED * W_SPEED : SPEED;
    this.vel.x = (-sin * f + cos * s) * speed;
    this.vel.z = (-cos * f - sin * s) * speed;
    if (this.swimming) {
      const up = chestW ? W_UP : W_SURF;
      if (input.jump && this.vel.y < up) this.vel.y = Math.min(up, this.vel.y + W_ACCEL * dt); // swim up
      else if (this.vel.y > -W_SINK) this.vel.y = Math.max(-W_SINK, this.vel.y - W_GRAVITY * dt); // slow sink
      if (this.vel.y < -W_SINK) this.vel.y += (-W_SINK - this.vel.y) * Math.min(1, 10 * dt); // brake a dive
    } else {
      if (input.jump && this.onGround) this.vel.y = JUMP;
      this.vel.y = Math.max(-40, this.vel.y - GRAVITY * dt);
    }
    const v = this.vel, steps = Math.max(1, Math.ceil(Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt / 0.25));
    const h = dt / steps;
    const wasGround = this.onGround;
    this.onGround = false; this.bumped = false;
    for (let i = 0; i < steps; i++) { this.moveAxis('y', v.y * h); this.moveAxis('x', v.x * h); this.moveAxis('z', v.z * h); }
    const dx = -sin * f + cos * s, dz = -cos * f - sin * s;
    if (this.swimming) { // at the surface (chest out), pushing into a bank up to 2 blocks above the feet: hop out
      if ((input.jump || input.autoJump) && this.bumped && !chestW && (f || s)) {
        const base = Math.floor(p.y + 0.01);
        for (let top = base + 1; top <= base + 2; top++) {
          if (!this.stepFree(dx, dz, top + 0.01)) continue;
          this.vel.y = Math.min(11, Math.sqrt(2 * GRAVITY * (top - p.y + 0.2))); // just enough to land on it
          break;
        }
      }
    } else if (input.autoJump && this.bumped && (this.onGround || wasGround) && (f || s) && this.stepFree(dx, dz)) this.vel.y = JUMP;
    if (this.pos.y < -20) { Object.assign(this.pos, this.spawn); this.vel.y = 0; } // fell off the world edge
  }
}
