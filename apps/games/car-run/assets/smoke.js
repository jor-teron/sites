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
  /** One trail puff from the hood, styled by the HP tier (defaults to plain trail). */
  trail(list, M, tier) {
    const tr = tier || {};
    list.push({
      x: (Math.random() * 2 - 1) * M.spreadX * 0.4,
      y: M.startY,
      z: M.trailZ,
      vx: (Math.random() * 2 - 1) * M.driftX * 0.5,
      vy: M.riseSpeed * (0.6 + Math.random() * 0.4),
      t: 0, life: M.life * 0.8, delay: 0,
      scale: tr.scale || M.trailScale,
      color: tr.color, alpha: tr.alpha,
    });
    this.cap(list, M);
  },
  /** A small spark that bursts out of the hood and falls. */
  spark(list, M) {
    const a = Math.random() * Math.PI;
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
      if (s.g) s.vy -= s.g * dt;
    }
    return list.filter((s) => s.t < s.life);
  },
  draw(ctx, list, o) {
    const M = o.M;
    for (const s of list) {
      if (s.delay > 0) continue;
      const p = o.project(o.origin.x + s.x, o.origin.y + s.y, o.origin.z + s.z);
      if (!p) continue;
      const f = s.t / s.life;
      if (s.spark) {
        ctx.fillStyle = 'rgba(' + M.sparkColor + ',' + (1 - f).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, M.sparkRadius, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const r = Math.max(M.minRadius, p.k * (M.radius + M.growth * s.t) * (s.scale || 1));
      const a = s.alpha !== undefined ? s.alpha : M.alpha;
      ctx.fillStyle = 'rgba(' + (s.color || M.color) + ',' + (a * (1 - f)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};
