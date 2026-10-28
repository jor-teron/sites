/* Human Body Explorer HBE3 — art upgrade, all drawn in code: replaces the blocky outline with one smooth body path
   (Catmull-Rom curve through ~45 points, mirrored), and gives key Inside parts real shapes: chambered heart, lobed lungs,
   folded brain, J-shaped stomach, looped intestines, bone-shaped long bones, spindle muscles (fibre texture added in body.js).
   Same 200 x 420 coordinates as parts.js, so every other part still lines up. Runs once at load; no animation. */
window.HB = window.HB || {};
(() => {
  const H = window.HB, f1 = n => Math.round(n * 10) / 10;
  // closed smooth curve through points (Catmull-Rom -> cubic Bezier)
  const smooth = pts => {
    const n = pts.length, P = i => pts[(i + n) % n];
    let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
    for (let i = 0; i < n; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      d += ` C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
    }
    return d + ' Z';
  };
  // the viewer's left half, from the crotch down the inner leg, round the foot, up the side, down and round the arm, to the neck
  const half = [[100, 256], [97.5, 272], [95.5, 302], [93.6, 336], [93.4, 352], [92.2, 374], [91, 394], [94, 402], [95, 409], [88, 412.6], [74, 412.6],
    [67, 410], [68.6, 402], [72, 394], [68.4, 372], [66.6, 356], [68, 338], [63, 302], [60.4, 266], [60.6, 244], [63.6, 214], [63, 186], [59.6, 156],
    [58, 128], [51.8, 146], [48.8, 170], [46.6, 200], [45, 228], [45.8, 238], [45.4, 250], [44, 258.6], [40.4, 263], [35, 263], [31, 256.8], [28.6, 250],
    [29.6, 240], [33.2, 230], [35.2, 204], [37.8, 172], [41.4, 140], [45, 114], [51, 100], [64, 92.6], [84.6, 87.4], [89.4, 80], [90, 70]];
  const outline = smooth(half.concat(half.slice().reverse().map(([x, y]) => [200 - x, y])).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]));
  const head = 'M100 13 C117 13 126.5 25 126.5 41 C126.5 57 117 74.5 100 74.5 C83 74.5 73.5 57 73.5 41 C73.5 25 83 13 100 13 Z';
  H.body = [['path', { d: outline }], ['path', { d: head }]];   // head last, so the chin sits over the neck
  H.bodyHead = head; H.bodyOutline = outline;

  // ---- shape helpers ----
  const D = (d, more) => ['path', Object.assign({ d }, more || {})];
  const deco = (d, w, more) => ['path', Object.assign({ d, class: 'hb-deco', fill: 'none', stroke: 'rgba(60,10,20,.38)', 'stroke-width': w || 1 }, more || {})];
  const circ = (x, y, r) => `M${f1(x - r)} ${f1(y)} a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0 a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0`;
  // long bone from (x1,y1) to (x2,y2): shaft of half-width hw with two round knobs at each end, drawn as one path
  const bone = (x1, y1, x2, y2, hw) => {
    const L = Math.hypot(x2 - x1, y2 - y1), dx = (x2 - x1) / L, dy = (y2 - y1) / L, nx = -dy, ny = dx, k = hw * 1.15, o = hw * 0.8;
    const at = (x, y, a, b) => [x + nx * a + dx * b, y + ny * a + dy * b];
    const q = [at(x1, y1, hw, k * .6), at(x2, y2, hw, -k * .6), at(x2, y2, -hw, -k * .6), at(x1, y1, -hw, k * .6)];
    let d = `M${q.map(p => f1(p[0]) + ' ' + f1(p[1])).join(' L')} Z`;
    [[x1, y1, 1], [x2, y2, -1]].forEach(([x, y, s]) => { [o, -o].forEach(a => { const c = at(x, y, a, s * k * .25); d += ' ' + circ(c[0], c[1], k); }); });
    return ['path', { d, 'data-ol': 1, 'data-a': f1(L * hw * 2) }];
  };
  const spindle = (cx, cy, rx, ry, tr) => D(`M${cx} ${cy - ry} C${cx + rx * 1.25} ${cy - ry * .55} ${cx + rx * 1.25} ${cy + ry * .55} ${cx} ${cy + ry} C${cx - rx * 1.25} ${cy + ry * .55} ${cx - rx * 1.25} ${cy - ry * .55} ${cx} ${cy - ry} Z`, tr ? { transform: tr } : {});
  const mxs = (x, s) => s === 1 ? x : 200 - x;
  const set = (id, shapes) => { if (H.byId[id]) H.byId[id].shapes = shapes; };

  const brainShape = D('M100 18.5 C87 17.5 76.5 25 77 36.5 C77.4 45.5 84 50.5 92 50.4 L108 50.4 C116 50.5 122.6 45.5 123 36.5 C123.5 25 113 17.5 100 18.5 Z');
  const folds = deco('M100 19.5 V50 M81 29 q3 -4 7 -1 t7 1 M79.5 37 q4 -4 7.5 0 t8 0 M83 45 q4 -3.5 7 0 t6 0 M86 22.6 q3 2.6 7 0 M105 29 q4 -3 7 0 t7 -1 M104.5 37 q4 -4 8 0 t7.5 0 M104 45 q3 -3.5 7 0 t6 0 M107 22.6 q4 2.6 7 0', 1.1);
  set('brain', [brainShape, folds]);
  set('cerebrum', [D('M100 17.6 C87 17 76.4 24 77 34.6 C77.6 42.4 84 45.6 91 45.4 L109 45.4 C116 45.6 122.4 42.4 123 34.6 C123.6 24 113 17 100 17.6 Z'),
    deco('M100 18.5 V45 M81 28 q3 -4 7 -1 t7 1 M79.5 36 q4 -4 7.5 0 t8 0 M86 22 q3 2.6 7 0 M105 28 q4 -3 7 0 t7 -1 M104.5 36 q4 -4 8 0 t7.5 0 M107 22 q4 2.6 7 0', 1.1)]);
  set('heart', [D('M101.6 123.4 C93.4 120.6 88.6 128 91.2 136.4 C94 145.6 104 152.4 114 157.6 C120.4 148.6 125.4 138.6 123.6 129.4 C122 121.6 113.6 118.4 107.4 122.4 Z'),
    D('M101.4 124 C99.6 113.6 107.6 107.6 116 110.4 C121.4 112.4 121.8 118.4 118.6 121.4 L115.6 119.8 C116.6 116 112 114 108.4 116.2 C106.4 117.6 106 120.4 106.6 123 Z'),
    deco('M106.8 123.6 Q104 139 113.4 157 M92.4 134.4 Q106 140.4 123.8 132', 1), deco('M95.4 127.6 q3 -3.4 6.6 -1.6', 1.4, { stroke: 'rgba(255,255,255,.5)' }),
    deco('M103 121.6 C101 115 96 113 92.6 114.6', 2.6, { stroke: 'rgba(90,120,220,.7)' })]);
  set('lungs', [D('M95.6 104 C84 99.4 71.6 108 67.8 124 C64 140 64 156 68.2 166 C78 170.4 88 168.6 96 160.6 L96 116 Z'),
    D('M104.4 104 C116 99.4 128.4 108 132.2 124 C136 140 136 156 131.8 166 C122 170.4 112.4 168.8 106 163 C112.4 156 112.6 146 106 140 Z'),
    deco('M69.6 137 Q82 132.6 95.4 126 M68.2 152.6 Q82 146.4 95.4 148.4 M132.4 141 Q118.6 137.6 106.6 124', 1),
    deco('M100 96 V112 M100 112 Q94 115 89.6 124 M100 112 Q106 115 110.4 124', 2.2, { stroke: 'rgba(120,40,50,.45)' })]);
  set('stomach', [D('M112.6 163.6 C118.6 159.6 129 161.6 133.6 170 C138.6 180.4 134.4 192.4 124 195.4 C115.6 197.6 107.4 192.6 105.4 185.8 C111.6 186.4 118 182.6 118.2 176 C118.4 170.6 114.6 168.2 110.6 168.4 Z'),
    deco('M114 172 Q124 170 128 180 M112 186 Q122 190 130 184', 1)]);
  set('liver', [D('M60.4 171 C63.6 160.6 86 160.4 106.4 168.4 C108.6 172.4 106.6 176.4 102.2 178.4 C90.4 186 74 192.4 64.4 186.6 C60.4 183 59.4 177 60.4 171 Z'), deco('M88 166 Q86 176 79 189', 1)]);
  const coils = 'M86 207 c5 -5 9 5 14 0 s9 -5 14 0 M84.6 215.6 c5 5 10 -5 15 0 s10 5 15 0 M86 224.4 c5 -5 9 5 14 0 s9 -5 14 0 M88 231 c4 3 8 -3 12 0 s8 3 12 0';
  set('intestines', [D('M80.6 201 Q80 197.6 84 197.4 L116 197.4 Q120 197.6 119.4 201 L120 234 Q120 238 116 238 L84 238 Q80 238 80 234 Z'),
    deco(coils, 1.6, { stroke: 'rgba(150,80,30,.55)' }), deco('M83 236 V201 H117 V236', 3.4, { stroke: 'rgba(180,90,60,.45)' })]);
  set('smallint', [D('M84.6 205 Q84 202 88 202 L112 202 Q116 202 115.6 205 L116 231 Q116 234.6 112 234.6 L88 234.6 Q84 234.6 84 231 Z'), deco(coils, 1.6, { stroke: 'rgba(150,80,30,.55)' })]);
  // bones (Expert skeleton): real bone shapes instead of plain lines
  set('humerus', [bone(48, 106, 44, 167, 2.6), bone(152, 106, 156, 167, 2.6)]);
  set('radiusulna', [bone(40.6, 175, 36, 228, 1.4), bone(46.6, 175, 43, 228, 1.4), bone(159.4, 175, 164, 228, 1.4), bone(153.4, 175, 157, 228, 1.4)]);
  set('femur', [bone(80, 258, 82, 336, 3.4), bone(120, 258, 118, 336, 3.4)]);
  set('tibiafibula', [bone(81.4, 356, 81.4, 397, 2.2), bone(89.6, 358, 88.8, 395, 1.3), bone(118.6, 356, 118.6, 397, 2.2), bone(110.4, 358, 111.2, 395, 1.3)]);
  set('collarbone', [bone(60, 96.6, 94, 92.4, 1.6), bone(140, 96.6, 106, 92.4, 1.6)]);
  // muscles: spindle (belly-shaped) instead of ellipses; body.js lays a fibre texture over them
  H.parts.filter(p => p.sys === 'muscles').forEach(p => {
    p.shapes = p.shapes.map(s => s[0] === 'ellipse' ? spindle(+s[1].cx, +s[1].cy, +s[1].rx, +s[1].ry, s[1].transform) : s);
  });
  set('pectorals', [1, -1].map(s => D(`M${mxs(98, s)} 106 C${mxs(84, s)} 102 ${mxs(70, s)} 104 ${mxs(64, s)} 112 C${mxs(66, s)} 124 ${mxs(80, s)} 128 ${mxs(98, s)} 126 Z`)));
  // skin parts follow the new outline
  set('skin', H.body.map(s => [s[0], Object.assign({}, s[1])]));
  if (H.byId['e-skin']) { H.byId['e-skin'].shapes = H.body.map(s => [s[0], Object.assign({}, s[1])]); H.byId['e-skin'].bshapes = H.byId['e-skin'].shapes; }
})();
