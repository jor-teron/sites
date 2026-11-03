/*
 * Star Pinball — physics (PIN-1a; drop targets, spinner, ramp, hole PIN-1b; nudge, leaning ramp entry PIN-1c). No page code: a world
 * object stepped in fixed sub-steps.
 * Ball: position, velocity and spin (a rolling disc: friction at a contact turns slide into spin and back).
 * Each sub-step: move the flippers and plunger, add gravity, move the ball, then push it out of every
 * wall segment, arc, bumper, post, flipper and the plunger, bouncing with restitution e plus friction.
 * Moving parts (flippers, plunger) hit with their own surface speed (ω × r), so a flip really throws.
 * Speed is capped (PB_CONFIG.vmax) and a sub-step is 1/1440 s, so the ball moves < 3 units per sub-step
 * against a 15-unit radius: it cannot tunnel through anything.
 * PIN-1b: the ball has a mode: 'table' (on the playfield), 'ramp' (on the raised ramp: it moves along
 * the ramp path with gravity on the climb and leaves the playfield layer, so it cannot hit or pass
 * anything there) or 'hole' (held in the saucer, then kicked out).
 * Drop targets are solid segments while up; the bank pops back up once all are down (when the ball
 * is clear of it). The spinner is a flap the ball passes through: it spins with the crossing speed.
 * PIN-1c: nudge(world, dx, dy) gives a ball on the table a small push (tilt rules live in core/game.js).
 * The ramp entry channel leans to the right (PB_CONFIG.rampEntry) and the ball goes onto the ramp once it
 * is past the `on` line inside it, moving up the channel; its speed up the channel carries it.
 * world.step(input) → events [{ type: 'bumper' | 'sling' | 'sensor' | 'drop' | 'dropsClear' |
 *   'dropsReset' | 'spin' | 'rampIn' | 'ramp' | 'rampBack' | 'hole' | 'kick' | 'drain' | 'escape', id }]
 */
const PBPhysics = (() => {
  const C = PB_CONFIG, T = PB_TABLE, r = C.ballR, h = C.step, I = 0.4; // I = 2/5 (m = 1, per r²)

  function create() {
    const w = {
      ball: null, t: 0,
      flippers: T.flippers.map((f) => ({ ...f, a: f.rest, w: 0 })),
      plunger: { y: T.plunger.rest, v: 0, pull: 0, firing: 0 },
      cool: {}, inSensor: {},
      drops: Object.fromEntries(T.drops.map((d) => [d.id, true])), dropsAt: 0,   // up = true; time to pop back up
      spinner: { a: 0, w: 0 }, ramp: null, holeT: 0,
    };
    w.step = (input) => step(w, input || {});
    return w;
  }
  function newBall(w) { w.ball = { x: T.plunger.laneX, y: w.plunger.y - r - 0.5, vx: 0, vy: 0, w: 0, ang: 0, live: true, mode: 'table' }; w.inSensor = {}; w.ramp = null; return w.ball; }
  const tipOf = (f) => [f.p[0] + f.len * Math.cos(f.a), f.p[1] + f.len * Math.sin(f.a)];

  /** Closest point on segment ab to p, and the parameter s 0..1. */
  function closestSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    let s = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0; s = s < 0 ? 0 : s > 1 ? 1 : s;
    return [a[0] + dx * s, a[1] + dy * s, s];
  }
  function closestArc(p, A) {
    const vx = p[0] - A.c[0], vy = p[1] - A.c[1], d = Math.hypot(vx, vy) || 1e-9;
    let ang = Math.atan2(vy, vx); if (ang < A.a0) ang += 2 * Math.PI; if (ang > A.a1 + 1e-9) ang -= 2 * Math.PI;
    if (ang >= A.a0 && ang <= A.a1) return [A.c[0] + vx / d * A.R, A.c[1] + vy / d * A.R];
    const e0 = [A.c[0] + Math.cos(A.a0) * A.R, A.c[1] + Math.sin(A.a0) * A.R], e1 = [A.c[0] + Math.cos(A.a1) * A.R, A.c[1] + Math.sin(A.a1) * A.R];
    return Math.hypot(p[0] - e0[0], p[1] - e0[1]) < Math.hypot(p[0] - e1[0], p[1] - e1[1]) ? e0 : e1;
  }

  // ramp path: cumulative length and height per point
  const RP = T.ramp.path, RS = [0];
  for (let i = 1; i < RP.length; i++) RS.push(RS[i - 1] + Math.hypot(RP[i][0] - RP[i - 1][0], RP[i][1] - RP[i - 1][1]));
  const RL = RS[RS.length - 1];
  /** Point, tangent and slope (dh/ds) on the ramp at distance s. */
  function rampAt(s) {
    let i = 1; while (i < RP.length - 1 && RS[i] < s) i++;
    const L = RS[i] - RS[i - 1], u = Math.max(0, Math.min(1, (s - RS[i - 1]) / L));
    const a = RP[i - 1], b = RP[i], tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L;
    return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, tx, ty, slope: (T.ramp.hgt[i] - T.ramp.hgt[i - 1]) / L };
  }

  /**
   * Resolve contact: q = closest surface point (surface radius R around it), surface velocity (sx, sy).
   * Returns the approach speed (> 0 when the ball was hitting it), or -1 when not touching.
   */
  function contact(b, qx, qy, R, sx, sy, e, mu) {
    let nx = b.x - qx, ny = b.y - qy; const d = Math.hypot(nx, ny), pen = r + R - d;
    if (pen <= 0) return -1;
    if (d < 1e-9) { nx = 0; ny = -1; } else { nx /= d; ny /= d; }
    b.x += nx * pen; b.y += ny * pen;
    const rx = b.vx - sx, ry = b.vy - sy, vn = rx * nx + ry * ny;
    if (vn >= 0) return 0;
    const jn = -(1 + e) * vn;
    b.vx += nx * jn; b.vy += ny * jn;
    // friction: slip of the contact point along the tangent t = (-ny, nx)
    const tx = -ny, ty = nx, slip = rx * tx + ry * ty - r * b.w;
    let jt = -slip / (1 + 1 / I); const lim = mu * jn; jt = jt > lim ? lim : jt < -lim ? -lim : jt;
    b.vx += tx * jt; b.vy += ty * jt; b.w += -jt / (I * r);
    return -vn;
  }

  function moveParts(w, input) {
    const P = C.plunger;
    for (const f of w.flippers) {
      const on = f.side === 'L' ? !!input.left : !!input.right;
      const target = on ? f.up : f.rest, speed = on ? C.flipper.wUp : C.flipper.wDown;
      const da = target - f.a;
      if (Math.abs(da) < 1e-6) { f.w = 0; continue; }
      const stepA = Math.sign(da) * Math.min(Math.abs(da), speed * h);
      f.a += stepA; f.w = stepA / h;
      if (Math.abs(target - f.a) < 1e-6) { f.a = target; }
    }
    const pl = w.plunger, rest = T.plunger.rest;
    if (input.plunger && !pl.firing) {
      pl.pull = Math.min(1, pl.pull + h / P.pullTime);
      const ny = rest + pl.pull * P.travel; pl.v = (ny - pl.y) / h; pl.y = ny;
    } else if (pl.pull > 0 && !pl.firing) {
      pl.firing = P.minSpeed + pl.pull * (P.maxSpeed - P.minSpeed); pl.pull = 0;
    } else pl.v = 0;
    if (pl.firing) {
      pl.y -= pl.firing * h; pl.v = -pl.firing;
      if (pl.y <= rest) { pl.y = rest; pl.firing = 0; pl.v = 0; }
    }
  }

  function stepSpinner(w, ev) {
    const sp = w.spinner; if (!sp.w) return;
    const before = Math.floor(sp.a / Math.PI);
    sp.a += sp.w * h; sp.w *= 1 - C.spinner.decay * h;
    if (Math.floor(sp.a / Math.PI) !== before) ev.push({ type: 'spin' });
    if (sp.w < 0.6) { sp.w = 0; sp.a = Math.round(sp.a / Math.PI) * Math.PI; }
  }
  function stepDrops(w, ev) {
    if (!w.dropsAt || w.t < w.dropsAt) return;
    const b = w.ball;
    if (b && b.live && b.mode === 'table' && b.x < 34 + r + 12 && b.y > 400 && b.y < 610) { w.dropsAt = w.t + 0.1; return; }  // wait until the ball is clear
    for (const d of T.drops) w.drops[d.id] = true;
    w.dropsAt = 0; ev.push({ type: 'dropsReset' });
  }
  /** On the ramp: move along the path; gravity on the climb, a little drag. */
  function stepRamp(w, ev) {
    const b = w.ball, R = w.ramp, RC = C.ramp;
    let at = rampAt(R.s);
    R.v += -RC.g * at.slope * h - RC.drag * R.v * h;
    R.s += R.v * h;
    if (R.s <= 0) {                                         // too slow: rolls back out of the entry
      const p = rampAt(0), v = Math.min(Math.abs(R.v), 600) + 30;
      Object.assign(b, { x: p.x, y: p.y, vx: -p.tx * v, vy: -p.ty * v, mode: 'table' }); w.ramp = null;
      ev.push({ type: 'rampBack' }); return;
    }
    if (R.s >= RL) {                                        // made it: drop into the left inlane
      const p = rampAt(RL), v = Math.max(RC.exitMin, Math.min(RC.exitMax, R.v));
      Object.assign(b, { x: p.x, y: p.y, vx: p.tx * v, vy: p.ty * v, mode: 'table' }); w.ramp = null;
      ev.push({ type: 'ramp' }); return;
    }
    at = rampAt(R.s); b.x = at.x; b.y = at.y; b.vx = at.tx * R.v; b.vy = at.ty * R.v; b.ang += R.v / r * h;
  }

  function step(w, input) {
    const ev = [], b = w.ball;
    w.t += h;
    moveParts(w, input);
    stepSpinner(w, ev); stepDrops(w, ev);
    if (!b || !b.live) return ev;
    if (b.mode === 'ramp') { stepRamp(w, ev); return ev; }
    if (b.mode === 'hole') {
      w.holeT -= h;
      if (w.holeT <= 0) {
        const HC = C.hole, kx = 0.2, ky = 1, L = Math.hypot(kx, ky);
        Object.assign(b, { x: T.hole.c[0], y: T.hole.c[1], vx: kx / L * HC.kick, vy: ky / L * HC.kick, mode: 'table' });
        w.cool.hole = w.t + HC.cool; ev.push({ type: 'kick' });
      }
      return ev;
    }
    const py0 = b.y;
    b.vy += C.gravity * h;
    const dk = 1 - C.drag * h; b.vx *= dk; b.vy *= dk; b.w *= 1 - C.spinDecay * h;
    b.x += b.vx * h; b.y += b.vy * h; b.ang += b.w * h;
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < T.walls.length; i++) {
        const s = T.walls[i];
        if (s.kind === 'gate') {
          const side = (b.x - s.a[0]) * s.n[0] + (b.y - s.a[1]) * s.n[1];
          if (side <= 0 || b.vx * s.n[0] + b.vy * s.n[1] >= 0) continue;
        }
        const q = closestSeg([b.x, b.y], s.a, s.b), hit = contact(b, q[0], q[1], 0, 0, 0, s.e, s.mu);
        if (s.kind === 'sling' && hit > C.slingMinHit && !(w.cool['s' + i] > w.t)) {
          const dx = s.b[1] - s.a[1], dy = -(s.b[0] - s.a[0]), L = Math.hypot(dx, dy);
          const sgn = (b.x - s.a[0]) * dx + (b.y - s.a[1]) * dy > 0 ? 1 : -1;
          b.vx += sgn * dx / L * C.slingKick; b.vy += sgn * dy / L * C.slingKick;
          w.cool['s' + i] = w.t + C.slingCooldown; ev.push({ type: 'sling', id: i });
        }
      }
      for (const d of T.drops) {
        if (!w.drops[d.id]) continue;
        for (const sg of d.segs) {
          const q = closestSeg([b.x, b.y], sg[0], sg[1]), hit = contact(b, q[0], q[1], 0, 0, 0, C.wallE, C.wallMu);
          if (hit > C.drop.minHit && w.drops[d.id]) {
            w.drops[d.id] = false; ev.push({ type: 'drop', id: d.id });
            if (T.drops.every((x) => !w.drops[x.id])) { w.dropsAt = w.t + C.drop.resetDelay; ev.push({ type: 'dropsClear' }); }
          }
        }
      }
      for (const A of T.arcs) { const q = closestArc([b.x, b.y], A); contact(b, q[0], q[1], 0, 0, 0, C.wallE, C.wallMu); }
      for (const c of T.circles) {
        const dx = b.x - c.c[0], dy = b.y - c.c[1], d = Math.hypot(dx, dy) || 1e-9;
        if (d >= r + c.R) continue;
        const qx = c.c[0] + dx / d * c.R, qy = c.c[1] + dy / d * c.R;
        const hit = contact(b, qx, qy, 0, 0, 0, c.kind === 'bumper' ? 0.6 : C.postE, C.wallMu);
        if (c.kind === 'bumper' && hit >= 0 && !(w.cool[c.id] > w.t)) {
          b.vx += dx / d * C.bumperKick; b.vy += dy / d * C.bumperKick;
          w.cool[c.id] = w.t + C.bumperCooldown; ev.push({ type: 'bumper', id: c.id });
        }
      }
      for (const f of w.flippers) {
        const tip = tipOf(f), q = closestSeg([b.x, b.y], f.p, tip), R = f.rp + (f.rt - f.rp) * q[2];
        const dx = b.x - q[0], dy = b.y - q[1], d = Math.hypot(dx, dy) || 1e-9;
        if (d >= r + R) continue;
        const cx = q[0] + dx / d * R - f.p[0], cy = q[1] + dy / d * R - f.p[1];   // contact point from the pivot
        contact(b, q[0], q[1], R, -f.w * cy, f.w * cx, C.flipper.e, C.flipper.mu);
      }
      const pl = w.plunger, P = T.plunger;
      if (b.x > P.x0 - r && b.x < P.x1 + r) {
        const q = closestSeg([b.x, b.y], [P.x0, pl.y], [P.x1, pl.y]);
        if (b.y < pl.y + 1) contact(b, q[0], q[1], 0, 0, pl.v < 0 ? pl.v : 0, 0, 0.1);
      }
    }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > C.vmax) { b.vx *= C.vmax / sp; b.vy *= C.vmax / sp; }
    for (const s of T.sensors) {
      const inside = Math.hypot(b.x - s.c[0], b.y - s.c[1]) < s.R;
      if (inside && !w.inSensor[s.id]) ev.push({ type: 'sensor', id: s.id, kind: s.kind });
      w.inSensor[s.id] = inside;
    }
    // spinner: the ball crossing its line spins it
    const SP = T.spinner;
    if (b.x > SP.a[0] && b.x < SP.b[0] && (py0 - SP.a[1]) * (b.y - SP.a[1]) < 0) w.spinner.w = Math.min(90, w.spinner.w + Math.abs(b.vy) * C.spinner.kick);
    // ramp entry: moving up the covered channel past its `on` line
    const E = T.ramp.entry, ex = b.x - E.base[0], ey = b.y - E.base[1], along = ex * E.ax[0] + ey * E.ax[1];
    if (along > E.on && along < E.len && Math.abs(ex * E.px[0] + ey * E.px[1]) < E.w / 2) {
      const v = b.vx * E.ax[0] + b.vy * E.ax[1];
      if (v > 0) { w.ramp = { s: 0, v }; b.mode = 'ramp'; ev.push({ type: 'rampIn' }); return ev; }
    }
    // hole: a slow enough ball over it is caught
    const hx = b.x - T.hole.c[0], hy = b.y - T.hole.c[1];
    if (hx * hx + hy * hy < C.hole.R * C.hole.R && sp < C.hole.maxSpeed && !(w.cool.hole > w.t)) {
      Object.assign(b, { x: T.hole.c[0], y: T.hole.c[1], vx: 0, vy: 0, w: 0, mode: 'hole' }); w.holeT = C.hole.hold;
      ev.push({ type: 'hole' }); return ev;
    }
    if (b.y > T.drainY && b.x < T.playMaxX) { b.live = false; ev.push({ type: 'drain' }); }
    else if (b.x < 0 || b.x > C.W || b.y < -40 || b.y > C.H + 60) { b.live = false; ev.push({ type: 'escape' }); }
    return ev;
  }
  /** Distance from p to the nearest solid surface minus the ball radius (< 0 = overlapping). For tests and spawning. */
  function clearance(w, x, y) {
    let m = Infinity; const p = [x, y];
    for (const s of T.walls) { if (s.kind === 'gate') continue; const q = closestSeg(p, s.a, s.b); m = Math.min(m, Math.hypot(x - q[0], y - q[1])); }
    for (const A of T.arcs) { const q = closestArc(p, A); m = Math.min(m, Math.hypot(x - q[0], y - q[1])); }
    for (const c of T.circles) m = Math.min(m, Math.hypot(x - c.c[0], y - c.c[1]) - c.R);
    for (const d of T.drops) if (w.drops[d.id]) for (const sg of d.segs) { const q = closestSeg(p, sg[0], sg[1]); m = Math.min(m, Math.hypot(x - q[0], y - q[1])); }
    for (const f of w.flippers) { const q = closestSeg(p, f.p, tipOf(f)); m = Math.min(m, Math.hypot(x - q[0], y - q[1]) - (f.rp + (f.rt - f.rp) * q[2])); }
    return m - r;
  }
  /** Nudge (PIN-1c): a small push to a ball on the table (not on the ramp or in the hole). */
  function nudge(w, dx, dy) {
    const b = w.ball;
    if (!b || !b.live || b.mode !== 'table') return false;
    b.vx += dx; b.vy += dy;
    const s = Math.hypot(b.vx, b.vy); if (s > C.vmax) { b.vx *= C.vmax / s; b.vy *= C.vmax / s; }
    return true;
  }
  return { nudge, create, newBall, tipOf, closestSeg, closestArc, clearance, rampAt, rampLength: RL };
})();
