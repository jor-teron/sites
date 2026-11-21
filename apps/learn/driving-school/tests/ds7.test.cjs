/* DS-7: higher quality trees (core/treemodel.js) and their use in the 3D scene. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const T = require('../core/treemodel.js');
const D = Object.assign({}, require('../core/physics.js'), require('../core/lessons.js'), require('../core/town.js'), require('../core/rules.js'),
  require('../core/roadgen.js'), require('../core/roadrules.js'), require('../core/exam.js'), require('../core/session.js'), require('../core/cockpit.js'),
  require('../core/carmodel.js'), require('../core/buildingmodel.js'), T);
const load = p => import(pathToFileURL(path.join(__dirname, p)).href);
const OLD_TRIS = 12;   // DS-6 and before: three.js ConeGeometry(r, 1, 6) = 6 side + 6 base triangles

test('DS-7: three tree types, each a merged model under 100 triangles', () => {
  assert.deepEqual(T.TREE_TYPES, ['conifer', 'broadleaf', 'palm']);
  const tris = {};
  for (const t of T.TREE_TYPES) {
    const parts = T.treeParts(t), a = T.buildTreeArrays(t); tris[t] = a.triangles;
    assert.equal(a.triangles, T.treeTriangles(parts)); assert.equal(a.position.length, a.triangles * 9);
    assert.equal(a.normal.length, a.position.length); assert.equal(a.color.length, a.position.length);
    assert(a.triangles >= OLD_TRIS && a.triangles < 100, t + ' triangles ' + a.triangles);
    assert(a.position.every(Number.isFinite) && a.normal.every(Number.isFinite));
    assert(parts[0].kind === 'prism' && parts[0].y0 === 0 && parts[0].r1 > 0, t + ' starts with a trunk');
  }
  assert.equal(T.treeParts('conifer').filter(p => p.kind === 'prism' && p.r1 === 0).length, 3, 'conifer: three stacked cones');
  assert.equal(T.treeParts('broadleaf').filter(p => p.kind === 'blob').length, 2, 'broadleaf: two round canopies');
  assert(T.treeParts('palm').filter(p => p.kind === 'blade').length >= 6, 'palm: fronds');
  assert.equal(T.buildTreeArrays('nope').type, 'broadleaf', 'unknown type falls back');
  console.log('# per tree: before 1 cone / ' + OLD_TRIS + ' triangles, after ' + Object.entries(tris).map(([k, v]) => k + ' ' + v).join(', ') + ' triangles');
});
test('DS-7: unit height, base on the ground, canopy wide and centred, trunk under it', () => {
  for (const t of T.TREE_TYPES) {
    const b = T.treeBounds(T.buildTreeArrays(t));
    assert.equal(b.min[1], 0, t + ' base at y = 0'); assert(b.max[1] > .9 && b.max[1] <= 1.0001, t + ' height ~1 (scaled per tree)');
    for (const a of [0, 2]) { assert(b.max[a] > 1.4 && b.max[a] < 2.6, t + ' crown radius ' + b.max[a]); assert(Math.abs(b.max[a] + b.min[a]) < 1.2, t + ' roughly centred'); }
    assert(T.treeParts(t)[0].r0 < .3, t + ' slim trunk');
  }
});
test('DS-7: normals are unit length; foliage faces outward and cone undersides face down', () => {
  const a = T.buildTreeArrays('conifer');
  for (let i = 0; i < a.normal.length; i += 3) assert(Math.abs(Math.hypot(a.normal[i], a.normal[i + 1], a.normal[i + 2]) - 1) < 1e-5);
  // Bottom cone: 6 sides then 4 cap triangles, after the 10 trunk triangles.
  for (let t = 10; t < 16; t++) { const o = t * 9, mx = (a.position[o] + a.position[o + 3] + a.position[o + 6]) / 3, mz = (a.position[o + 2] + a.position[o + 5] + a.position[o + 8]) / 3; assert(mx * a.normal[o] + mz * a.normal[o + 2] > 0, 'side ' + t); }
  for (let t = 16; t < 20; t++) assert(a.normal[t * 9 + 1] < -.99, 'cap ' + t + ' faces down');
  const p = T.buildTreeArrays('palm'), last = (p.triangles - 1) * 9; assert(p.normal[last + 1] > 0, 'fronds face up');
});
test('DS-7: tree type follows the road type and is the same every time', () => {
  const count = road => { const n = { conifer: 0, broadleaf: 0, palm: 0 }; for (let i = 0; i < 4000; i++) n[T.treeKind(i * 3.7 - 900, (i % 97) * 11.3, road)]++; return n; };
  const ghat = count('ghat'), village = count('village'), highway = count('highway'), town = count('town');
  assert(ghat.conifer > ghat.broadleaf && ghat.palm === 0, 'ghat: mostly conifers, no palms');
  assert(village.palm > village.conifer && village.palm > 1000, 'village: palms common');
  assert(highway.broadleaf > highway.conifer && highway.broadleaf > highway.palm, 'highway: mostly broadleaf');
  assert(town.palm === 0 && town.conifer > 1500 && town.broadleaf > 1500);
  assert.equal(T.treeKind(12.3, -45.6, 'village'), T.treeKind(12.3, -45.6, 'village'));
  assert.equal(T.treeKind(1, 2, 'unknown'), T.treeKind(1, 2, 'town'));
  for (let i = 0; i < 500; i++) {
    const x = i * 1.9 - 300, y = i * .7, k = T.treeSpread(x, y), c = T.treeTint(x, y);
    assert(k >= .85 && k <= 1.15); assert(c.every(v => v >= .8 && v <= 1)); assert(T.treeHash(x, y) >= 0 && T.treeHash(x, y) < 1);
  }
  const out = [0, 0, 0]; assert.equal(T.treeTint(1, 2, out), out, 'tint fills the given array (no allocation)');
});
test('DS-7: road scenery trees carry their road type; placement is seeded and unchanged by it', () => {
  for (const mode of ['endless', 'loop']) {
    const r1 = D.createRoad(3, mode), r2 = D.createRoad(3, mode); r1.ensure(3000); r2.ensure(3000);
    let n = 0;
    for (let k = 0; k < 12; k++) {
      const a = D.chunkScenery(r1, k), b = D.chunkScenery(r2, k); assert.deepEqual(a, b);
      for (const t of a.trees) { n++; assert(['highway', 'ghat', 'village'].includes(t.road), 'road ' + t.road); assert(t.ht >= 4 && t.ht <= 12); }
    }
    assert(n > 50, mode + ' trees ' + n);
  }
});
test('DS-7: scene trees are one InstancedMesh per type with a shared vertex-colour material, 600 at most', async () => {
  const THREE = await load('../../common/vendor/three/three.module.min.js');
  const { createWorld } = await load('../ui/scene3d.js');
  const w = createWorld(THREE, D), prefs = { side: 'left', auto: true };
  const ring = []; w.scene.traverse(o => { if (o.isInstancedMesh && o.material.vertexColors && o.parent !== w.drive.group && o.parent !== w.town) ring.push(o); });
  assert.equal(ring.length, 2, 'town ring: conifer + broadleaf'); assert.equal(ring.reduce((n, m) => n + m.count, 0), 44, 'same 44 ring trees');
  assert(ring.every(m => m.instanceColor), 'ring trees tinted');
  const kinds = Object.values(w.drive.trees); assert.equal(kinds.length, 3);
  assert(kinds.every(m => m.material === kinds[0].material && m.material.isMeshLambertMaterial && m.material.side === THREE.DoubleSide && m.instanceColor));
  for (const id of ['endless', 'loop']) {
    const def = D.roadDefinitions('left', 2).find(d => d.id === id), s = D.session(def, prefs);
    D.start(s.c); D.shift(s.c, 1); s.c.handbrake = false;
    let most = 0, seen = new Set();
    for (let i = 0; i < 60 * 60; i++) {
      const at = s.w.at ? s.w.at.s : 12, p = D.pointAtS(s.w.road, at + 2), off = D.laneOffset(p.width, p.lanes, 'left');
      Object.assign(s.c, { x: p.x + Math.sin(p.dir) * off, y: p.y - Math.cos(p.dir) * off, heading: p.dir, v: 0 }); D.tick(s, {}, 1 / 60);
      if (i % 30 === 0) {
        w.update(s, prefs, i / 60);
        const total = kinds.reduce((n, m) => n + m.count, 0); most = Math.max(most, total); assert(total <= 600);
        let want = 0; for (const c of w.drive.chunkKeys) want += D.chunkScenery(s.w.road, c).trees.length;
        assert.equal(total, Math.min(600, want), 'every placed tree is drawn');
        kinds.forEach((m, j) => { if (m.count) seen.add(j); });
      }
    }
    assert(most > 20, id + ' trees drawn ' + most); assert(seen.size >= 2, id + ' types seen ' + seen.size);
  }
});
