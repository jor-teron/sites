/* Turbo Lap — a simple road-following driver. Used for the circuit 00 attract mode (the player's car drives itself
   until you take over) and by the tests. It keeps to the centre line, brakes early enough for the bends ahead,
   and eases its speed up and down a little so it does not look like a robot.
   control(player, opts) -> { steer, gas, brake, nitro }
     opts.t      race time (drives the gentle speed variation)
     opts.cap    top speed as a fraction of max speed (default 1)
     opts.vary   size of the speed variation (default 0)
     opts.dodge  true: steer around cars just ahead
     opts.nitro  true: use nitro on straights
     opts.grip   share of full steering it is willing to rely on in a bend (default 0.88) */
window.TL = window.TL || {};
(() => {
  const CFG = TL.CFG, U = TL.util, road = TL.road;
  const GRIP = 0.88;                                   // default: never ask for more than this much steering to hold a bend

  TL.driver = {
    control(pl, opts) {
      opts = opts || {};
      const segL = CFG.segmentLength, pct = pl.speed / CFG.maxSpeed, cf = CFG.centrifugal;
      const here = road.findSegment(pl.p);
      // safe speed now = min over the road ahead of: what the bend there allows + what braking can shed on the way
      let allowed = 1, ahead = 0;
      for (let k = 0; k <= 45; k += 3) {
        const c = Math.abs(road.findSegment(pl.p + k * segL).curve);
        if (c > Math.abs(ahead)) ahead = c;
        const vmax = Math.min(1, (opts.grip || GRIP) / (cf * Math.max(c, 0.001)));
        const shed = 2 * k * segL * 0.6 / -CFG.braking;           // pct^2 gained by braking over k segments
        allowed = Math.min(allowed, Math.sqrt(vmax * vmax + shed));
      }
      let cap = opts.cap || 1;
      if (opts.vary) cap *= 1 - opts.vary * (0.5 + 0.5 * Math.sin((opts.t || 0) * 0.45)) - opts.vary * 0.3 * Math.sin((opts.t || 0) * 1.3);
      const target = Math.min(allowed, cap);

      const need = pct * here.curve * cf;                          // steering that holds the line in this bend
      let line = 0;
      if (opts.dodge) {
        for (const c of TL.game.ais) {
          const gap = U.mod(c.p - pl.p, road.trackLength);
          if (gap > 0 && gap < segL * 9 && Math.abs(c.x - pl.x) < 0.45) { line = c.x > 0 ? c.x - 0.6 : c.x + 0.6; break; }
        }
      }
      const steer = U.clamp(need + (line - pl.x) * 2.5, -1, 1);
      const gas = pct < target - 0.01, brake = pct > target + 0.03;
      return { steer, gas, brake, nitro: !!opts.nitro && ahead < 1 && target >= 1 && pl.nitro > 0.5 };
    }
  };
})();
