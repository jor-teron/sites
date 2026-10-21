/**
 * Car Run — traffic cone cluster (obstacle). draw(ctx, p, o); o.scene / o.world as in assets/car.js.
 * Three cones across the lane. o.hitT (seconds since hit) or undefined: once hit,
 * each cone flies off along its own path (o.scatter) and fades out.
 */
window.CAR_RUN_ASSETS = window.CAR_RUN_ASSETS || {};
window.CAR_RUN_ASSETS.cones = {
  // Cone offsets inside the cluster (fraction of half width / half length)
  layout: [[-0.75, 0.3], [0, -0.4], [0.75, 0.2]],
  /** Random fly-off velocities, one per cone (called once at the hit). */
  scatter() {
    return this.layout.map(([fx]) => ({
      vx: fx * 1.6 + (Math.random() - 0.5) * 1.2,
      vy: 2.2 + Math.random() * 1.2,
      vz: 2.5 + Math.random() * 2,
      spin: (Math.random() - 0.5) * 14,
    }));
  },
  draw(ctx, p, o) {
    const { C, S } = o;
    const sc = o.scene;
    const t = o.hitT;
    const g = 6; // gravity for flying cones (units / s^2)
    this.layout.forEach(([fx, fz], i) => {
      let x = o.world.x + fx * S.conesW / 2;
      let y = 0;
      let z = o.world.z + fz * S.conesLen / 2;
      let ang = 0, alpha = 1;
      if (t !== undefined && o.scatter) {
        const v = o.scatter[i];
        x += v.vx * t; z += v.vz * t;
        y = Math.max(0, v.vy * t - g * t * t / 2);
        ang = v.spin * t;
        alpha = Math.max(0, 1 - t / 1.2);
        if (alpha <= 0) return;
      }
      const b = sc.project(x, y, z);
      if (!b) return;
      const h = b.k * S.coneH, w = b.k * S.coneBase;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      ctx.fillStyle = C.coneBase;
      ctx.fillRect(-w * 0.65, -h * 0.08, w * 1.3, h * 0.1);
      ctx.fillStyle = C.cone;
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(w / 2, 0);
      ctx.lineTo(w * 0.1, -h);
      ctx.lineTo(-w * 0.1, -h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.coneStripe;
      ctx.beginPath();
      ctx.moveTo(-w * 0.34, -h * 0.35);
      ctx.lineTo(w * 0.34, -h * 0.35);
      ctx.lineTo(w * 0.26, -h * 0.55);
      ctx.lineTo(-w * 0.26, -h * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  },
};
