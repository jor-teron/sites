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
      return { isPlayer: true, name: 'YOU', color: CFG.playerColor, p, x: 0, speed: 0,
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

    // Bump any two racers that touch. Faster car behind loses speed, the one in front is jolted.
    collide(racers, dt) {
      const L = road.trackLength, segL = CFG.segmentLength, w = CFG.bump.carWidth, B = CFG.bump;
      racers.forEach(r => { r.bumpT = Math.max(0, (r.bumpT || 0) - dt); });
      for (let i = 0; i < racers.length; i++) {
        for (let j = 0; j < racers.length; j++) {
          if (i === j) continue;
          const a = racers[i], b = racers[j];                    // a behind b?
          let gap = U.mod(b.p - a.p, L);
          if (gap > L / 2) continue;
          if (gap > segL * 1.2 || a.speed <= b.speed) continue;
          if (!U.overlap(a.x, w, b.x, w)) continue;
          if (a.bumpT > 0 && b.bumpT > 0) continue;
          a.speed = b.speed * (a.isPlayer ? B.playerSlow : B.aiSlow);
          b.speed *= a.isPlayer ? B.aiSlow : 0.95;
          const side = Math.sign(a.x - b.x) || (Math.random() < 0.5 ? -1 : 1);
          if (Math.abs(a.x - b.x) > w * 0.35) { a.x += side * B.sideKick; b.x -= side * B.sideKick * 0.5; }
          a.bumpT = b.bumpT = 0.4;
          a.bumped = b.bumped = 0.25;                            // visual shake timer
          if (a.isPlayer || b.isPlayer) TL.cars.lastBump = performance.now();
        }
      }
      racers.forEach(r => { r.bumped = Math.max(0, (r.bumped || 0) - dt); });
    }
  };
})();
