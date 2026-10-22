/* Solar System preset. Distances compressed: r = 90*ln(1+2.2*AU) (log scale; keeps order, fits screen).
   Speeds are circular for that radius, so periods follow Kepler at the compressed distances;
   period ratios are shown compressed too. All orbits counter-clockwise (as seen from north). */
window.GS = window.GS || {};
GS.PRESETS = GS.PRESETS || {};
GS.PRESETS.solar = {
  label: 'Solar System — distances on a log scale, masses boosted so the Moon holds, sizes not to scale',
  dt: 0.02,
  build(P) {
    const SUN = 20000;
    P.add({ name: 'Sun', m: SUN, r: 16, col: '#ffd34d', star: true });
    const pl = [
      ['Mercury', 0.39, '#a9a9a9', 2.2, 0.05], ['Venus', 0.72, '#e8c27a', 3.4, 0.4], ['Earth', 1.0, '#4a90ff', 2.4, 10],
      ['Mars', 1.52, '#d0573a', 2.8, 0.1], ['Jupiter', 5.2, '#d9a066', 8, 6], ['Saturn', 9.54, '#e3cf8f', 7, 2, true],
      ['Uranus', 19.2, '#8fe0e8', 5, 0.3], ['Neptune', 30.1, '#4f6fff', 5, 0.3]
    ];
    let earth;
    pl.forEach(([name, au, col, r, m, ring], i) => {
      const d = 90 * Math.log(1 + 2.2 * au), a = i * 2.1, v = P.circV(SUN, d);
      const b = P.add({ name, m, r, col, ring: !!ring,
        x: Math.cos(a) * d, y: Math.sin(a) * d, vx: -Math.sin(a) * v, vy: Math.cos(a) * v });
      if (name === 'Earth') earth = b;
    });
    const md = 2.6, mv = P.circV(earth.m, md), ex = earth.x / Math.hypot(earth.x, earth.y), ey = earth.y / Math.hypot(earth.x, earth.y);
    P.add({ name: 'Moon', m: 0.005, r: 0.8, col: '#ddd', x: earth.x + ex * md, y: earth.y + ey * md,
      vx: earth.vx - ey * mv, vy: earth.vy + ex * mv });
    // zero total momentum so the Sun stays put
    let px = 0, py = 0, M = 0; for (const b of P.bodies) { px += b.m * b.vx; py += b.m * b.vy; M += b.m; }
    for (const b of P.bodies) { b.vx -= px / M; b.vy -= py / M; }
  }
};
