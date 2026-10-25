/* Turbo Lap — player physics and car-to-car bumps.
   Every racer stores `p` = race progress in world units (negative on the grid, lap n starts at (n-1)*trackLength),
   `x` = lateral offset in road half-widths (0 = centre, ±1 = road edge), `speed` in world units/s. */
window.TL = window.TL || {};
(() => {
  const CFG = TL.CFG, U = TL.util, road = TL.road;
  const SPRITE_W = { tree: 0.45, bush: 0.3, lamp: 0.08, signL: 0.14, signR: 0.14 };

  TL.cars = {
    SPRITE_W,

    createPlayer(p) {
      return { isPlayer: true, name: 'YOU', color: TL.carSet.color(), p, x: 0, speed: 0,
               nitro: 1, nitroOn: false, steer: 0, braking: false, bumpT: 0, hitT: 0,
               finished: false, finishTime: null, lap: 0, lapTimes: [], lapStart: 0 };
    },

    // input: {steer:-1..1, gas:bool, brake:bool, nitro:bool}; control=false => coast/brake to a stop
    updatePlayer(pl, input, dt, control) {
      const seg = road.findSegment(pl.p);
      const gas = control && input.gas, brake = control && input.brake;
      const steer = control ? input.steer : 0;
      const pct = pl.speed / CFG.maxSpeed;
      const dx = dt * CFG.steerRate * Math.min(pct, 1);

      pl.steer = steer;
      pl.braking = brake || !control;
      pl.x += dx * steer;
      pl.x -= dx * pct * seg.curve * CFG.centrifugal;           // drift out of the bend

      // nitro
      const N = CFG.nitro;
      const want = control && input.nitro && pl.speed > 0;
      if (want && (pl.nitroOn ? pl.nitro > 0 : pl.nitro >= N.minToStart)) {
        pl.nitroOn = true;
        pl.nitro = Math.max(0, pl.nitro - N.burnRate * dt);
      } else {
        pl.nitroOn = false;
        pl.nitro = Math.min(1, pl.nitro + N.rechargeRate * dt);
      }
      const top = CFG.maxSpeed * (pl.nitroOn ? N.boost : 1);

      if (gas) pl.speed += CFG.accel * (pl.nitroOn ? N.accelBoost : 1) * dt;
      else if (brake || !control) pl.speed += CFG.braking * (control ? 1 : 0.4) * dt;
      else pl.speed += CFG.decel * dt;
      if (pl.nitroOn && !gas) pl.speed += CFG.accel * N.accelBoost * dt;
      if (pl.speed > top) pl.speed = Math.max(top, pl.speed + CFG.decel * dt);   // bleed off after nitro

      // off road: grass drag and roadside objects
      if (Math.abs(pl.x) > 1) {
        if (pl.speed > CFG.offRoadLimit) pl.speed += CFG.offRoadDecel * dt;
        pl.hitT = Math.max(0, pl.hitT - dt);
        if (pl.hitT === 0) {
          for (const s of seg.sprites) {
            const w = SPRITE_W[s.type];
            if (w && U.overlap(pl.x, CFG.bump.carWidth, s.offset, w)) {
              pl.speed *= CFG.bump.sprite;
              pl.x -= Math.sign(s.offset) * 0.15;
              pl.hitT = 0.5;
              pl.hitFlash = 0.3;
              break;
            }
          }
        }
      }
      pl.hitFlash = Math.max(0, (pl.hitFlash || 0) - dt);
      pl.x = U.clamp(pl.x, -CFG.maxOffset, CFG.maxOffset);
      pl.speed = U.clamp(pl.speed, 0, top);
      pl.p += pl.speed * dt;
    },

    // Car-to-car contact, run once per frame after everyone has moved.
    //  1. Rear-end: a faster car closing on one just ahead (within carLength) is slowed to the front car's pace,
    //     the front car is jolted, and if they only overlap at the edge they are pushed apart sideways.
    //  2. Side-by-side: two cars level with each other (gap < carLength) that overlap sideways are pushed apart
    //     so they never drive through each other (before, equal-speed cars could ghost through one another).
    // Each unordered pair is checked once; which car is "behind" is worked out from the lap-wrapped gap.
    // The side to push toward is deterministic (lane, then race order) so replays and tests behave the same.
    collide(racers, dt) {
      const L = road.trackLength, w = CFG.bump.carWidth, B = CFG.bump;
      const len = CFG.segmentLength * (B.carLength || 1.2);
      racers.forEach(r => { r.bumpT = Math.max(0, (r.bumpT || 0) - dt); });
      for (let i = 0; i < racers.length; i++) {
        for (let j = i + 1; j < racers.length; j++) {
          let a = racers[i], b = racers[j];
          let gap = U.mod(b.p - a.p, L);                          // b ahead of a by gap...
          if (gap > L / 2) { [a, b] = [b, a]; gap = L - gap; }    // ...or the other way round
          if (gap > len || !U.overlap(a.x, w, b.x, w)) continue;
          const side = Math.sign(a.x - b.x) || (i % 2 ? 1 : -1);  // a moves this way, b the other

          // side-by-side: separate them by the overlap, shared equally (no speed change)
          const push = Math.min(w - Math.abs(a.x - b.x), w) * 0.5 * Math.min(1, dt * (B.sideSpring || 12));
          a.x += side * push; b.x -= side * push;

          // rear-end: only when the back car is faster and no fresh bump is cooling down
          if (a.speed <= b.speed || (a.bumpT > 0 && b.bumpT > 0)) continue;
          a.speed = b.speed * (a.isPlayer ? B.playerSlow : B.aiSlow);
          b.speed *= a.isPlayer ? B.aiSlow : 0.95;
          if (Math.abs(a.x - b.x) > w * 0.35) { a.x += side * B.sideKick; b.x -= side * B.sideKick * 0.5; }
          a.bumpT = b.bumpT = 0.4;
          a.bumped = b.bumped = 0.25;                            // visual shake timer
          if (a.isPlayer || b.isPlayer) TL.cars.lastBump = performance.now();
        }
      }
      racers.forEach(r => {
        r.bumped = Math.max(0, (r.bumped || 0) - dt);
        r.x = U.clamp(r.x, -CFG.maxOffset, CFG.maxOffset);      // a push never throws a car off the world
      });
    }
  };
})();
