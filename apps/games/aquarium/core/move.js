// Aquarium AQQ1d/AQQ1e: movement modes for non-fish animals (species set mode: 'walk'|'crawl'|'upright'|'pulse'|'snake'|'jet'|'octo'|'glide'|'cruise').
// Each mode sets f.vx/f.vy/f.x/f.y for one frame; behave.js states (rest, sleep, eat, flee) still drive what they aim for.
(function () {
  'use strict';
  var A = window.AQ, S = A.st, C = A.core, rnd = C.rng(17), clamp = C.clamp;
  function seek(f, tx, ty, spd, k, dt) {   // ease velocity toward a point, slowing on arrival
    var dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy) + .01, s = spd * Math.min(1, d / (30 * S.U)), e = Math.min(1, k * dt);
    f.vx += (dx / d * s - f.vx) * e; f.vy += (dy / d * s - f.vy) * e;
  }
  function go(f, b, dt) {   // integrate, stay inside the tank, turn to face travel, optional gentle tilt
    var y1 = Math.max(b.y0, b.y1);
    f.x = clamp(f.x + f.vx * dt, b.x0, b.x1); f.y = clamp(f.y + f.vy * dt, b.y0, y1);
    if (Math.abs(f.vx) > 3 * S.U) f.face += clamp((f.vx > 0 ? 1 : -1) - f.face, -dt * 4, dt * 4);
    f.pitch += ((f.sp.tilt || 0) * Math.atan2(f.vy, Math.abs(f.vx) + 1) - f.pitch) * Math.min(1, dt * 4);
  }
  function away(f, k) { var dx = f.x - f.fx, dy = f.y - f.fy, d = Math.hypot(dx, dy) + .01; return [f.x + dx / d * 300 * S.U, f.y + dy / d * 300 * S.U * k]; }
  function goal(f, b) {   // next wander point inside the species' depth band; hiders alternate a rock den and a short roam
    var sp = f.sp, y1 = Math.max(b.y0, b.y1), rx = S.rockX || [];
    f.gx = b.x0 + rnd() * (b.x1 - b.x0); f.gy = b.y0 + (y1 - b.y0) * (sp.band[0] + rnd() * (sp.band[1] - sp.band[0])); f.gt = 4 + rnd() * 6;
    if (sp.hide && (f.hide = !f.hide) && rx.length) { f.gx = clamp(rx[rnd() * rx.length | 0] + (rnd() - .5) * 30 * S.U, b.x0, b.x1); f.gy = y1 - 4 * S.U; f.gt = 8 + rnd() * 10; }
    if (sp.surface && rnd() < sp.surface) { f.gy = b.y0; f.gt = 20; }
  }
  // walk / crawl: along the sand only; scuttle to a spot, pause, repeat (crawlers pause much more)
  function walk(f, b, spd, tg, still, dt) {
    var sp = f.sp, gx = f.x;
    if (f.st === 'flee') { gx = f.x + (f.x > f.fx ? 1 : -1) * 200 * S.U; spd *= sp.flee.speed; }
    else if (tg) gx = tg.x;
    else if (!still) { if ((f.tm -= dt) <= 0) { f.go = rnd() > sp.pause; f.tm = 1 + rnd() * 3; f.gx = b.x0 + rnd() * (b.x1 - b.x0); } if (f.go) gx = f.gx; }
    f.vx += (clamp((gx - f.x) / (10 * S.U), -1, 1) * spd - f.vx) * Math.min(1, dt * 6); f.vy = 0;
    f.x = clamp(f.x + f.vx * dt, b.x0, b.x1); f.y = Math.max(b.y0, b.y1); f.pitch = 0;
  }
  // upright / snake: free drift toward a goal (rest spot, food, wander point, or away from a scare)
  function drift(f, b, spd, tg, still, dt) {
    var sp = f.sp, t, k = sp.k || 1.5;
    if (f.st === 'flee') { t = away(f, .5); spd *= sp.flee.speed; k = 4; }
    else if (tg) t = [tg.x, tg.y];
    else if (still) t = [f.rx, f.ry];
    else { if ((f.gt = (f.gt || 0) - dt) <= 0 || (!f.hide && Math.hypot(f.gx - f.x, f.gy - f.y) < 25 * S.U)) goal(f, b); t = [f.gx + (f.hide ? Math.sin(S.t * .6 + f.k * 9) * f.L * .4 : 0), f.gy]; }   // hiders peek in and out
    seek(f, t[0], t[1], spd, k, dt); if (sp.bob) f.vy += Math.sin(S.t * 1.3 + f.k * 7) * sp.bob * S.U * dt; go(f, b, dt);
  }
  // pulse: the bell contracts to push up, then the animal sinks slowly with tentacles trailing
  function pulse(f, b, spd, tg, still, dt) {
    var y1 = Math.max(b.y0, b.y1);
    f.pp = Math.max(0, (f.pp || 0) - dt * 2.5);
    if ((f.pt = (f.pt === undefined ? rnd() * 2 : f.pt) - dt) <= 0 || f.y >= y1 - 2) {
      f.pt = (still ? 4 : 2) + rnd() * 2; f.pp = 1; f.vy = -spd * (f.st === 'flee' ? 2.6 : 1.7) * (f.y < b.y0 + (y1 - b.y0) * .2 ? .2 : 1); f.vx += (rnd() - .5) * spd * .8;
    }
    if (f.st === 'flee') f.vx += (f.x > f.fx ? 1 : -1) * spd * dt * 2;
    f.vy += (spd * .25 - f.vy) * Math.min(1, dt * .8); f.vx *= 1 - dt * .5; go(f, b, dt);
  }
  function aim(f, b, still, tg) {   // where a free swimmer is heading this frame
    if (f.st === 'flee') return away(f, .5); if (tg) return [tg.x, tg.y]; if (still) return [f.rx, f.ry];
    if (!(f.gt > 0) || Math.hypot(f.gx - f.x, f.gy - f.y) < 25 * S.U) goal(f, b); return [f.gx, f.gy];
  }
  // jet (squid): coast with drag, then a quick squeeze-and-squirt burst toward the goal
  function jet(f, b, spd, tg, still, dt) {
    var t = aim(f, b, still, tg), dx = t[0] - f.x, dy = t[1] - f.y, d = Math.hypot(dx, dy) + .01;
    f.pp = Math.max(0, (f.pp || 0) - dt * 3); f.gt -= dt;
    if ((f.pt = (f.pt || 0) - dt) <= 0 && d > 15 * S.U) { var k = spd * (f.st === 'flee' ? 4 : 2.2); f.vx = dx / d * k; f.vy = dy / d * k; f.pp = 1; f.pt = (still ? 3 : 1.2) + rnd() * 1.5; }
    f.vx *= 1 - Math.min(1, dt * 1.6); f.vy *= 1 - Math.min(1, dt * 1.6); go(f, b, dt);
  }
  // octo: crawls the sand like a walker; a scare makes it jet up, then it sinks back down
  function octo(f, b, spd, tg, still, dt) {
    var y1 = Math.max(b.y0, b.y1);
    if (f.up === undefined) { f.up = 0; f.y = y1; }   // starts on the sand like the walkers
    f.hue = (f.hue || 0) + ((f.st === 'flee' ? 1 : .15 + .15 * Math.sin(S.t * .3 + f.k * 5)) - (f.hue || 0)) * Math.min(1, dt * 1.5);   // colour shifts a little, blushes when startled
    if (f.st === 'flee' && !(f.up > 0) && f.y > y1 - 5) { f.up = 1.2; f.vy = -spd * 7; f.vx = (f.x > f.fx ? 1 : -1) * spd * 2; f.pp = 1; }
    f.pp = Math.max(0, (f.pp || 0) - dt * 2);
    if (f.up > 0 || f.y < y1 - 2) { f.up -= dt; f.vy += spd * 3 * dt; f.vy = Math.min(f.vy, spd * 1.5); f.vx *= 1 - dt; go(f, b, dt); f.pitch = 0; return; }
    walk(f, b, spd, tg, still, dt);
  }
  // cruise (shark): a slow patrol; anything close by swims off (AQQ1b flee), nobody is ever eaten or hurt
  function cruise(f, b, spd, tg, still, dt) {
    drift(f, b, spd, null, still, dt);
    var R = (f.sp.scare || 130) * S.U;
    S.fish.forEach(function (o) { if (o !== f && o.sp.id !== f.sp.id && Math.hypot(o.x - f.x, o.y - f.y) < R) { o.fleeT = Math.max(o.fleeT || 0, .5); o.fx = f.x; o.fy = f.y; } });
  }
  A.move = { walk: walk, crawl: walk, upright: drift, snake: drift, pulse: pulse, drift: drift, glide: drift, jet: jet, octo: octo, cruise: cruise, seek: seek, go: go, away: away };
})();
