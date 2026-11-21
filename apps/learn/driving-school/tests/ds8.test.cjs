/* DS-8: higher quality houses and town buildings (core/buildingmodel.js) and their use in the 3D scene. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const B = require('../core/buildingmodel.js');
const D = Object.assign({}, require('../core/physics.js'), require('../core/lessons.js'), require('../core/town.js'), require('../core/rules.js'),
  require('../core/roadgen.js'), require('../core/roadrules.js'), require('../core/exam.js'), require('../core/session.js'), require('../core/cockpit.js'),
  require('../core/carmodel.js'), require('../core/treemodel.js'), B);
const load = p => import(pathToFileURL(path.join(__dirname, p)).href);
const OLD_TRIS = 12;   // DS-7 and before: a plain box (three.js BoxGeometry, 12 triangles) for every house and building
const tris = a => a.position.length / 9;
const near = (a, b, tol) => Math.abs(a - b) <= tol;

test('DS-8: four house models fill the same unit box as the old cube', () => {
  assert.deepEqual(B.HOUSE_TYPES, ['house2', 'house3', 'house4', 'hut']);
  const counts = {};
  for (const k of B.HOUSE_TYPES) {
    const a = B.houseArrays(k), b = B.buildingBounds(a); counts[k] = a.triangles;
    assert.equal(a.triangles, tris(a)); assert.equal(a.normal.length, a.position.length); assert.equal(a.color.length, a.position.length);
    assert(a.triangles > OLD_TRIS && a.triangles <= 150, k + ' triangles ' + a.triangles);
    assert(a.position.every(Number.isFinite) && a.color.every(c => c >= 0 && c <= 1));
    assert.equal(b.min[1], 0, k + ' sits on y = 0'); assert(near(b.max[1], 1, 1e-6), k + ' full height');
    for (const ax of [0, 2]) { assert(near(b.min[ax], -.5, .01) && near(b.max[ax], .5, .01), k + ' footprint axis ' + ax + ': ' + b.min[ax] + '..' + b.max[ax]); }
  }
  assert.equal(B.houseArrays('house3').floors, 3); assert.equal(B.houseArrays('nope').kind, 'house2');
  console.log('# per house: before 1 box / ' + OLD_TRIS + ' triangles, after ' + Object.entries(counts).map(([k, v]) => k + ' ' + v).join(', '));
});
test('DS-8: house kind follows the existing house data (huts stay huts, floors by height)', () => {
  assert.equal(B.houseKind({ c: 4, ht: 3 }), 'hut');
  assert.equal(B.houseKind({ c: 0, ht: 6 }), 'house2'); assert.equal(B.houseKind({ c: 2, ht: 10 }), 'house3'); assert.equal(B.houseKind({ c: 3, ht: 14.9 }), 'house4');
  const seen = new Set();
  for (let r = 1; r <= 6; r++) { const road = D.createRoad(r); road.ensure(5000);
    for (let k = 0; k < 40; k++) for (const h of D.chunkScenery(road, k).houses) seen.add(B.houseKind(h)); }
  assert.deepEqual([...seen].sort(), ['house2', 'house3', 'house4', 'hut'], 'every model is used on real roads');
});
test('DS-8: house details: windows, doors, flat roof with parapet and tank; hut has mud walls and thatch', () => {
  const has = (a, hex) => { const c = D.hexToLinear(hex); for (let i = 0; i < a.color.length; i += 3) if (near(a.color[i], c[0], 1e-6) && near(a.color[i + 1], c[1], 1e-6) && near(a.color[i + 2], c[2], 1e-6)) return true; return false; };
  const K = B.BUILDING_COLOURS;
  for (const k of ['house2', 'house3', 'house4']) { const a = B.houseArrays(k); for (const c of [K.wall, K.glass, K.door, K.parapet, K.tank]) assert(has(a, c), k + ' ' + c); assert(!has(a, K.thatch)); }
  const hut = B.houseArrays('hut'); for (const c of [K.mud, K.thatch, K.door]) assert(has(hut, c)); assert(!has(hut, K.tank));
  // The walls are white so the instance colour (old house palette) paints them exactly as before.
  assert.deepEqual(Array.from(B.houseArrays('house2').color.slice(0, 3)), [1, 1, 1]);
  // Normals are unit length; the roof faces up.
  const a = B.houseArrays('house4');
  for (let i = 0; i < a.normal.length; i += 3) assert(near(Math.hypot(a.normal[i], a.normal[i + 1], a.normal[i + 2]), 1, 1e-5));
  assert(a.normal[1] > .99, 'first wall face is the top');
});
test('DS-8: town buildings keep their 22 x 15 m footprint, height and label; entrance faces the road', () => {
  const T = D.townLayout('left'), out = [];
  assert.deepEqual(T.buildings.map(b => b[2]), ['SCHOOL', 'PARK', 'SHOPS', 'CLINIC']);
  T.buildings.forEach(([x, y, name, color], i) => {
    const h = B.townBuildingHeight(i), front = B.frontFace(x, y, 22, 15, T.roads), a = B.townBuildingArrays(name, color, h, front), b = B.buildingBounds(a);
    assert.equal(h, 7 + (i % 3) * 3, 'same height as DS-7');
    assert.equal(b.min[1], 0); assert(b.max[1] <= h + 1.25 && b.max[1] >= h + .89, name + ' roof parapet / tank');
    // Walls exactly 22 x 15; only the entrance canopy and shop awnings reach out (at most 1.65 m) from the front.
    const axis = front[1] === 'x' ? 0 : 2, other = 2 - axis, half = axis === 0 ? 11 : 7.5, otherHalf = other === 0 ? 11 : 7.5;
    assert(near(b.min[other], -otherHalf, .1) && near(b.max[other], otherHalf, .1), name + ' side walls');
    const reach = front[0] === '+' ? b.max[axis] - half : -half - b.min[axis], back = front[0] === '+' ? -half - b.min[axis] : b.max[axis] - half;
    assert(reach > 1 && reach < 1.65, name + ' canopy ' + reach); assert(back < .1, name + ' back wall');
    assert(a.triangles > OLD_TRIS && a.triangles < 400, name + ' triangles ' + a.triangles);
    out.push(name + ' ' + a.triangles);
  });
  assert.deepEqual(T.buildings.map(([x, y]) => B.frontFace(x, y, 22, 15, T.roads)), ['-x', '+x', '+x', '-x'], 'faces the nearest road');
  const has = (a, hex) => { const c = D.hexToLinear(hex); for (let i = 0; i < a.color.length; i += 3) if (near(a.color[i], c[0], 1e-6) && near(a.color[i + 2], c[2], 1e-6) && near(a.color[i + 1], c[1], 1e-6)) return true; return false; };
  const K = B.BUILDING_COLOURS;
  assert(has(B.townBuildingArrays('SHOPS', '#718eb4', 13), K.awning[0]) && has(B.townBuildingArrays('SHOPS', '#718eb4', 13), K.shutter), 'shops: awnings and shutters');
  assert(has(B.townBuildingArrays('CLINIC', '#a589a9', 7), K.cross) && !has(B.townBuildingArrays('SCHOOL', '#c69172', 7), K.cross), 'clinic: green cross only');
  assert(has(B.townBuildingArrays('SCHOOL', '#c69172', 7), K.sign) && has(B.townBuildingArrays('SCHOOL', '#c69172', 7), '#c69172'), 'signboard + own colour');
  assert(has(B.townBuildingArrays('PARK', '#45765e', 10), K.hedge) && !has(B.townBuildingArrays('PARK', '#45765e', 10), K.tank), 'park: green trellis, no tank');
  console.log('# town buildings: before 1 box / ' + OLD_TRIS + ' triangles each, after ' + out.join(', '));
});
test('DS-8: scene: houses are one InstancedMesh per model (220 max), town buildings one mesh each at the same centres', async () => {
  const THREE = await load('../../common/vendor/three/three.module.min.js');
  const { createWorld } = await load('../ui/scene3d.js');
  const w = createWorld(THREE, D);
  // Town: 4 building meshes at the same centres as before (label sprites need a canvas, so not in Node).
  const s0 = D.session(D.roadLessons('left')[0], { side: 'left' }); w.update(s0, { side: 'left' }, 0);
  const bs = []; w.town.traverse(o => { if (o.name === 'building') bs.push(o); });
  assert.equal(bs.length, 4); assert(bs.every(m => m.material === bs[0].material && m.material.vertexColors && m.material.side === THREE.DoubleSide));
  const T = D.townLayout('left');
  T.buildings.forEach(([x, y], i) => { assert.equal(bs[i].position.x, x + 11); assert.equal(bs[i].position.z, y + 7.5); assert.equal(bs[i].position.y, 0); });
  // Open road: every placed house is drawn, by its model, with the old palette on the walls.
  const kinds = w.drive.houses; assert.deepEqual(Object.keys(kinds), B.HOUSE_TYPES);
  assert(Object.values(kinds).every(m => m.isInstancedMesh && m.instanceColor && m.material === kinds.house2.material));
  for (const route of [1, 3]) {
    const def = D.roadDefinitions('left', route).find(d => d.id === 'endless'), s = D.session(def, { side: 'left', auto: true });
    D.start(s.c); D.shift(s.c, 1); s.c.handbrake = false;
    let most = 0;
    for (let i = 0; i < 60 * 80; i++) {
      const at = s.w.at ? s.w.at.s : 12, p = D.pointAtS(s.w.road, at + 2), off = D.laneOffset(p.width, p.lanes, 'left');
      Object.assign(s.c, { x: p.x + Math.sin(p.dir) * off, y: p.y - Math.cos(p.dir) * off, heading: p.dir, v: 0 }); D.tick(s, {}, 1 / 60);
      if (i % 40) continue;
      w.update(s, { side: 'left' }, i / 60);
      const want = { house2: 0, house3: 0, house4: 0, hut: 0 }; let n = 0;
      for (const c of w.drive.chunkKeys) for (const h of D.chunkScenery(s.w.road, c).houses) { want[B.houseKind(h)]++; n++; }
      if (n <= 220) for (const k of B.HOUSE_TYPES) assert.equal(kinds[k].count, want[k], k);
      const total = B.HOUSE_TYPES.reduce((t, k) => t + kinds[k].count, 0); assert(total <= 220); most = Math.max(most, total);
    }
    assert(most > 5, 'houses drawn ' + most);
  }
  // A city house keeps the old unit-box transform: position, turn and (w, ht, d) scale.
  const m = Object.values(kinds).find(k => k !== kinds.hut && k.count), mat = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  m.getMatrixAt(0, mat); mat.decompose(pos, q, sc); assert(sc.x >= 8 && sc.x <= 14 && near(sc.z, 8, 1e-4) && sc.y >= 6 && sc.y <= 15, 'scale ' + sc.toArray());
});
