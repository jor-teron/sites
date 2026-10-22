/* Other presets: binary stars, figure-eight 3-body (Chenciner–Montgomery), random cluster, empty. */
GS.PRESETS.binary = {
  label: 'Binary stars with a circumbinary planet', dt: 0.02,
  build(P) {
    const m = 1000, d = 40, v = Math.sqrt(P.G * m / (4 * d));
    P.add({ name: 'Star A', m, r: 12, col: '#ffd34d', star: true, x: -d, vy: -v });
    P.add({ name: 'Star B', m, r: 10, col: '#7fb4ff', star: true, x: d, vy: v });
    const R = 220, vp = P.circV(2 * m, R);
    P.add({ name: 'Planet', m: 1, r: 4, col: '#6c6', y: R, vx: -vp });
  }
};
GS.PRESETS.figure8 = {
  label: 'Figure-eight: three equal masses chasing on one path', dt: 0.01,
  build(P) {
    const s = 120, m = 400, vs = Math.sqrt(P.G * m / s);
    const p = [[0.97000436, -0.24308753], [-0.97000436, 0.24308753], [0, 0]];
    const v3 = [-0.93240737, -0.86473146], v = [[-v3[0] / 2, -v3[1] / 2], [-v3[0] / 2, -v3[1] / 2], v3];
    const cols = ['#ff6b6b', '#6bff9b', '#6bb6ff'];
    p.forEach((q, i) => P.add({ name: 'Body ' + (i + 1), m, r: 7, col: cols[i], star: true,
      x: q[0] * s, y: q[1] * s, vx: v[i][0] * vs, vy: v[i][1] * vs }));
  },
  soft: 0.01
};
GS.PRESETS.cluster = {
  label: 'Random cluster — watch it collapse and merge', dt: 0.02,
  build(P) {
    let seed = (Date.now() & 0xffff) || 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    P.add({ name: 'Core', m: 3000, r: 12, col: '#ffd34d', star: true });
    for (let i = 0; i < 150; i++) {
      const d = 60 + rnd() * 400, a = rnd() * Math.PI * 2, v = P.circV(3000 + i * 2, d) * (0.8 + rnd() * 0.3);
      const m = 0.2 + rnd() * 3;
      P.add({ m, r: 1.5 + Math.cbrt(m) * 1.5, col: `hsl(${(rnd() * 360) | 0},60%,65%)`,
        x: Math.cos(a) * d, y: Math.sin(a) * d, vx: -Math.sin(a) * v, vy: Math.cos(a) * v });
    }
  }
};
GS.PRESETS.empty = { label: 'Empty — drag to fling bodies in', dt: 0.02, build() {} };
