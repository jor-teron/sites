/**
 * Car Run — crash smoke puffs. Tunables in CAR_RUN_CONFIG.smoke.
 * spawn(list, cfg) adds puffs; update(list, dt) ages them (returns live list);
 * draw(ctx, list, o) draws them, o.project(x, y, z) and o.origin {x, y, z} = player car.
 */
window.CAR_RUN_ASSETS = window.CAR_RUN_ASSETS || {};
window.CAR_RUN_ASSETS.smoke = {
  spawn(list, M) {
    for (let i = 0; i < M.puffs; i++) {
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
    if (list.length > M.maxPuffs) list.splice(0, list.length - M.maxPuffs);
  },
  /** One small trail puff from the hood (continuous smoke after the first crash). */
  trail(list, M) {
    list.push({
      x: (Math.random() * 2 - 1) * M.spreadX * 0.4,
      y: M.startY,
      z: M.trailZ,
      vx: (Math.random() * 2 - 1) * M.driftX * 0.5,
      vy: M.riseSpeed * (0.6 + Math.random() * 0.4),
      t: 0, life: M.life * 0.8, delay: 0, scale: M.trailScale,
    });
    if (list.length > M.maxPuffs) list.splice(0, list.length - M.maxPuffs);
  },
  update(list, dt) {
    for (const s of list) {
      if (s.delay > 0) { s.delay -= dt; continue; }
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt;
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
      const r = Math.max(M.minRadius, p.k * (M.radius + M.growth * s.t) * (s.scale || 1));
      ctx.fillStyle = 'rgba(' + M.color + ',' + (M.alpha * (1 - f)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};
