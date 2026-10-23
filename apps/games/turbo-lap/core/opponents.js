/* Turbo Lap — computer drivers. Each follows a racing line (inside of bends, scaled by skill) with its own
   bias and wobble, slows for bends less the better it is, steers around cars ahead, and is gently
   rubber-banded toward the player so races stay close but winnable. */
window.TL = window.TL || {};
(() => {
  const CFG = TL.CFG, U = TL.util, road = TL.road;

  TL.opponents = {
    create(list) {
      const rnd = U.rng(42);
      return list.map(o => ({
        isPlayer: false, name: o.name, color: o.color, speedF: o.speed, skill: o.skill, rubber: o.rubber,
        p: o.p, x: o.x, speed: 0, targetX: o.x, steerVis: 0, braking: false,
        bias: (rnd() - 0.5) * 0.3, wobbleF: 0.3 + rnd() * 0.5, phase: rnd() * 6.28, launch: 0.85 + rnd() * 0.25,
        finished: false, lap: 0, lapTimes: [], lapStart: 0
      }));
    },

    update(ais, racers, player, dt) {
      const A = CFG.ai, segL = CFG.segmentLength, L = road.trackLength, w = CFG.bump.carWidth;
      const t = TL.game.raceTime;
      for (const c of ais) {
        // look at the road ahead
        let curve = 0;
        for (let k = 2; k < 14; k += 3) {
          const cv = road.findSegment(c.p + k * segL).curve;
          if (Math.abs(cv) > Math.abs(curve)) curve = cv;
        }
        // target speed
        let target = CFG.maxSpeed * c.speedF * (1 - A.curveSlow * Math.abs(curve) * (1 - c.skill * 0.6));
        if (!c.finished) {
          const gap = player.p - c.p;                                  // >0: player ahead
          target *= 1 + U.clamp(gap / (L * 0.15), -1, 1) * (c.rubber != null ? c.rubber : A.rubberBand);
        } else target *= 0.75;
        if (Math.abs(c.x) > 1) target = Math.min(target, CFG.offRoadLimit * 1.5);

        // racing line
        let tx = -Math.sign(curve) * 0.5 * c.skill * Math.min(1, Math.abs(curve) / 4)
          + c.bias + 0.18 * Math.sin(t * c.wobbleF + c.phase);

        // avoid cars ahead
        let blocker = null;
        for (const o of racers) {
          if (o === c) continue;
          const gap = U.mod(o.p - c.p, L);
          if (gap > A.lookAhead * segL || gap <= 0) continue;
          if (o.speed > c.speed * 1.02 && gap > segL * 3) continue;
          if (Math.abs(o.x - tx) < w * 1.6 || Math.abs(o.x - c.x) < w * 1.2) {
            if (!blocker || gap < blocker.gap) blocker = { car: o, gap };
          }
        }
        if (blocker) {
          const o = blocker.car;
          const left = o.x - w * 2, right = o.x + w * 2;
          tx = (Math.abs(left - c.x) < Math.abs(right - c.x) && left > -0.9) || right > 0.9 ? left : right;
          if (blocker.gap < segL * 2 && Math.abs(o.x - c.x) < w) target = Math.min(target, o.speed * 0.98);
        }
        c.targetX = U.clamp(tx, -0.85, 0.85);

        // steer
        const d = c.targetX - c.x, step = A.steerRate * dt;
        c.x += U.clamp(d, -step, step);
        c.steerVis = U.clamp(d * 4, -1, 1);

        // throttle
        const acc = CFG.accel * (c.speed < CFG.maxSpeed * 0.5 ? c.launch : 1);
        c.braking = target < c.speed - 300;
        if (c.speed < target) c.speed = Math.min(target, c.speed + acc * dt);
        else c.speed = Math.max(target, c.speed + CFG.braking * 0.5 * dt);
        c.p += c.speed * dt;
      }
    }
  };
})();
