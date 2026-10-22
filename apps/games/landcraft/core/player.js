// LandCraft player: an axis-aligned box (0.6 x 1.8 x 0.6) with gravity, jumping and block collision.
// Movement is split into small substeps and resolved one axis at a time, so the player never tunnels
// through blocks, slides along walls, and stands stably on block edges.
import { solid } from './blocks.js';

export const EYE = 1.62;
const HALF = 0.3, HEIGHT = 1.8, GRAVITY = 28, JUMP = 8.4, SPEED = 4.3, EPS = 1e-4;

export class Player {
  constructor(world, x, y, z) {
    this.world = world;
    this.spawn = { x: x, y: y, z: z };
    this.pos = { x: x, y: y, z: z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0; this.onGround = false;
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
      p[axis] = d > 0 ? Math.floor(p[axis] + HALF) - HALF - EPS : Math.floor(p[axis] - HALF) + 1 + HALF + EPS;
    }
    this.vel[axis] = 0;
  }
  // input: fwd and strafe in -1..1, jump boolean. dt in seconds.
  update(dt, input) {
    let f = input.fwd, s = input.strafe;
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    this.vel.x = (-sin * f + cos * s) * SPEED;
    this.vel.z = (-cos * f - sin * s) * SPEED;
    if (input.jump && this.onGround) this.vel.y = JUMP;
    this.vel.y = Math.max(-40, this.vel.y - GRAVITY * dt);
    const v = this.vel, steps = Math.max(1, Math.ceil(Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt / 0.25));
    const h = dt / steps;
    this.onGround = false;
    for (let i = 0; i < steps; i++) { this.moveAxis('y', v.y * h); this.moveAxis('x', v.x * h); this.moveAxis('z', v.z * h); }
    if (this.pos.y < -20) { Object.assign(this.pos, this.spawn); this.vel.y = 0; } // fell off the world edge
  }
}
