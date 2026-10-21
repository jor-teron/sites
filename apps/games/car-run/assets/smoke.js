/**
 * Car Run — car smoke and sparks. Tunables in CAR_RUN_CONFIG.smoke.
 * spawn(list, cfg, n) adds a burst; trail(list, cfg, tier) adds one puff for an HP tier;
 * spark(list, cfg) adds a spark; update(list, dt) ages them (returns live list);
 * draw(ctx, list, o) draws them, o.project(x, y, z) and o.origin {x, y, z} = player car.
 */
window.CAR_RUN_ASSETS = window.CAR_RUN_ASSETS || {};
window.CAR_RUN_ASSETS.smoke = {
  /** Smoke tier for an HP value (null = no smoke). */
  tierFor(M, hp) {
    for (const t of M.tiers) if (hp < t.below) return t;
    return null;
  },
  cap(list, M) {
    if (list.length > M.maxPuffs) list.splice(0, list.length - M.maxPuffs);
  },
  spawn(list, M, n) {
    const count = n || M.puffs;
    for (let i = 0; i < count; i++) {
      const life = M.life + Math.random() * M.lifeRandom;
      list.push({
        x: (Math.random() * 2 - 1) * M.spreadX,
        y: M.startY + Math.random() * 0.15,
        z: M.offsetZ + (Math.random() - 0.5) * 0.3,
        vx: (Math.random() * 2 - 1) * M.driftX,
        vy: M.riseSpeed * (0.7 + Math.random() * 0.6),
        t: 0, life,
        delay: i * 0.03,
      });
    }
    this.cap(list, M);
  },
  /** One trail puff: from the rear during play, from the hood on the CRASH screen; styled by the HP tier (defaults to plain trail). */
  trail(list, M, tier, crashed) {
    const tr = tier || {};
    if (!crashed && M.play) {
      const P = M.play;
      list.push({
        play: true,
        x: P.rearX + (Math.random() * 2 - 1) * 0.05,
        y: P.startY, z: P.rearZ,
        vx: (Math.random() * 2 - 1) * P.driftX,
        vy: P.sinkSpeed, vz: -P.backSpeed * (0.8 + Math.random() * 0.4),
        t: 0, life: P.life, delay: 0,
        scale: tr.scale || M.trailScale, color: tr.color, alpha: tr.alpha,
      });
      this.cap(list, M);
      return;
    }
    list.push({
      x: (Math.random() * 2 - 1) * M.spreadX * 0.4,
      y: M.startY,
      z: M.trailZ,
      vx: (Math.random() * 2 - 1) * M.driftX * 0.5,
      vy: M.riseSpeed * (0.6 + Math.random() * 0.4),
      t: 0, life: M.life * 0.8, delay: 0,
      scale: crashed && M.crashScale ? M.crashScale : (tr.scale || M.trailScale),
      color: tr.color, alpha: crashed && M.crashAlpha ? M.crashAlpha : tr.alpha,
    });
    this.cap(list, M);
  },
  /** A small spark that bursts out of the hood and falls. */
  spark(list, M, crashed) {
    const a = Math.random() * Math.PI;
    if (!crashed && M.play) {
      const P = M.play;
      list.push({
        spark: true, play: true,
        x: P.rearX, y: P.startY, z: P.rearZ,
        vx: Math.cos(a) * P.sparkSpeed, vy: Math.sin(a) * P.sparkSpeed * 0.5, vz: -P.backSpeed, g: 5,
        t: 0, life: M.sparkLife, delay: 0,
      });
      this.cap(list, M);
      return;
    }
    list.push({
      spark: true,
      x: (Math.random() - 0.5) * 0.2, y: M.startY * 0.8, z: M.trailZ,
      vx: Math.cos(a) * M.sparkSpeed, vy: Math.sin(a) * M.sparkSpeed, g: 5,
      t: 0, life: M.sparkLife, delay: 0,
    });
    this.cap(list, M);
  },
  update(list, dt) {
    for (const s of list) {
      if (s.delay > 0) { s.delay -= dt; continue; }
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.vz) s.z += s.vz * dt;
      if (s.play && s.y < 0) { s.y = 0; s.vy = 0; }
      if (s.g) s.vy -= s.g * dt;
    }
    return list.filter((s) => s.t < s.life);
  },
  draw(ctx, list, o) {
    const M = o.M, P = M.play || {};
    // Play-smoke limits: the car's on-screen width and its roof line (from the rear).
    let maxR = Infinity, roofY = -Infinity;
    if (o.carW && o.carH) {
      const rear = o.project(o.origin.x, 0, o.origin.z - o.carLen / 2);
      const top = o.project(o.origin.x, o.carH * (P.roofFrac || 1), o.origin.z - o.carLen / 2);
      if (rear && top) { maxR = rear.k * o.carW * (P.maxRadiusFrac || 1); roofY = top.y; }
    }
    for (const s of list) {
      if (s.delay > 0) continue;
      const p = o.project(o.origin.x + s.x, o.origin.y + s.y, o.origin.z + s.z);
      if (!p) continue;
      const f = s.t / s.life;
      if (s.play && p.y < roofY) continue;
      if (s.spark) {
        ctx.fillStyle = 'rgba(' + M.sparkColor + ',' + (1 - f).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, s.play ? P.sparkRadius : M.sparkRadius, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      let r = Math.max(M.minRadius, p.k * (M.radius + (s.play ? P.growth : M.growth) * s.t) * (s.scale || 1));
      if (s.play) r = Math.min(r, maxR, Math.max(0, p.y - roofY));
      if (r <= 0.5) continue;
      const a = s.alpha !== undefined ? s.alpha : M.alpha;
      ctx.fillStyle = 'rgba(' + (s.color || M.color) + ',' + (a * (1 - f)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};
