/* Metres, seconds and radians. A gentle longitudinal model plus bicycle steering.
   Training aid, not an accurate vehicle model or a substitute for an instructor. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else Object.assign(root.DS = root.DS || {}, api);
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const angle = a => Math.atan2(Math.sin(a), Math.cos(a));
  const ratios = { '-1': 3.3, 0: 0, 1: 3.5, 2: 2.1, 3: 1.4, 4: 1.05, 5: .82 };
  function car(options = {}) {
    return Object.assign({ x: 30, y: 100, heading: 0, v: 0, rpm: 0,
      engine: false, stalled: false, gear: 0, auto: false, handbrake: true,
      indicator: '', steer: 0, clutch: 1, distance: 0, acceleration: 0,
      elapsed: 0, shiftCount: 0, stalls: 0, message: 'Press Start engine.' }, options);
  }
  function start(c) {
    if (Math.abs(c.v) > .3 || (c.gear && c.clutch < .85 && !c.auto)) {
      c.message = 'Brake to a stop and hold the clutch before starting.';
      return false;
    }
    c.engine = true; c.stalled = false; c.rpm = 900;
    c.message = 'Engine running. Check mirrors and surroundings before moving.';
    return true;
  }
  function shift(c, gear) {
    gear = clamp(Math.round(gear), -1, 5);
    if (gear === c.gear) return true;
    if (c.clutch < .8 && !c.auto) { c.message = 'Hold clutch fully before changing gear.'; return false; }
    if ((gear < 0 || c.gear < 0) && Math.abs(c.v) > .4) {
      c.message = 'Stop completely before selecting or leaving reverse.'; return false;
    }
    c.gear = gear; c.shiftCount++; return true;
  }
  function step(c, input = {}, dt = 1 / 60) {
    dt = clamp(dt, 0, .05);
    const throttle = clamp(input.throttle || 0, 0, 1), brake = clamp(input.brake || 0, 0, 1);
    c.elapsed += dt;
    if (c.auto) {
      // Reverse remains an explicit selection; never select it by braking.
      if (c.gear > 0) c.gear = Math.abs(c.v) < 5 ? 1 : Math.abs(c.v) < 9 ? 2 : Math.abs(c.v) < 14 ? 3 : Math.abs(c.v) < 20 ? 4 : 5;
      c.clutch = c.engine && !c.handbrake && throttle > 0 ? 0 : Math.abs(c.v) < 2 ? 1 : 0;
    } else {
      const target = clamp(input.clutch || 0, 0, 1);
      // Pedal travel deliberately takes time, including a forgiving bite-point.
      c.clutch += clamp(target - c.clutch, -dt * 1.3, dt * 5);
    }
    c.steer += clamp(clamp(input.steer || 0, -1, 1) - c.steer, -dt * 3, dt * 3);
    const speed = Math.abs(c.v), coupling = 1 - c.clutch;
    const wheelRPM = speed * 30 * (ratios[c.gear] || 0) * 4.1;
    const freeRPM = 900 + throttle * 4200;
    let desired = c.gear ? freeRPM * (1 - coupling) + wheelRPM * coupling : freeRPM;
    // A slipping clutch can transfer enough torque to move off with modest throttle.
    if (throttle > .15) desired = Math.max(desired, 800 + throttle * 1800);
    if (c.auto) desired = Math.max(desired, 900);
    c.rpm = c.engine ? c.rpm + (desired - c.rpm) * Math.min(1, dt * 7) : 0;
    if (c.engine && !c.auto && c.gear && coupling > .8 && c.rpm < 650) {
      c.engine = false; c.stalled = true; c.rpm = 0; c.stalls++;
      c.message = 'Stalled: brake, clutch down, neutral, restart; add gentle throttle at the bite-point.';
    }
    const direction = Math.sign(c.gear), oldV = c.v;
    const maxSpeed = c.gear === -1 ? 5 : [0, 9, 16, 23, 31, 40][c.gear];
    const thrust = c.engine && c.gear && !c.handbrake ? direction * throttle * coupling * (c.gear <= 1 ? 3.3 : 2.5) * Math.max(0, 1 - speed / maxSpeed) : 0;
    const drag = speed > .01 ? .12 + speed * .025 : 0;
    const retard = brake * 6.5 + (c.handbrake ? 9 : 0) + drag;
    c.v += thrust * dt;
    c.v = Math.sign(c.v) * Math.max(0, Math.abs(c.v) - retard * dt);
    if (c.handbrake && speed < .2) c.v = 0;
    c.acceleration = dt ? (c.v - oldV) / dt : 0;
    // Reduce wheel lock at speed. Wheelbase = 2.6 m, lock at crawl = 32 degrees.
    const lock = .56 / (1 + speed * .025);
    c.heading = angle(c.heading + c.v / 2.6 * Math.tan(c.steer * lock) * dt);
    c.x += Math.cos(c.heading) * c.v * dt;
    c.y += Math.sin(c.heading) * c.v * dt;
    c.distance += Math.abs(c.v) * dt;
    c.rpm = clamp(c.rpm, 0, 6500);
    return c;
  }
  return { car, start, shift, step, clamp, angle };
});
