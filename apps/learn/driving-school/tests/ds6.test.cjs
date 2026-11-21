/* DS-6: higher quality traffic cars (core/carmodel.js) and their use in the 3D scene. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const C = require('../core/carmodel.js');
const D = Object.assign({}, require('../core/physics.js'), require('../core/lessons.js'), require('../core/town.js'), require('../core/rules.js'),
  require('../core/roadgen.js'), require('../core/roadrules.js'), require('../core/exam.js'), require('../core/session.js'), require('../core/cockpit.js'), require('../core/treemodel.js'), require('../core/buildingmodel.js'), C);
const load = p => import(pathToFileURL(path.join(__dirname, p)).href);
const OLD_TRIS = 36, OLD_MESHES = 3;   // DS-5 car: three boxes, three meshes

test('DS-6: three body shapes, each a merged low-poly model with the expected parts', () => {
  assert.deepEqual(Object.keys(C.CAR_VARIANTS), ['hatch', 'sedan', 'suv']);
  for (const v of Object.keys(C.CAR_VARIANTS)) {
    const parts = C.carParts(v), a = C.buildCarArrays('#e3b85f', v);
    assert.equal(parts.filter(p => p.kind === 'wheel').length, 4, v + ' wheels'); assert.equal(parts.filter(p => p.color === C.CAR_PARTS.hub).length, 4, v + ' hub caps');
    assert.equal(parts.filter(p => p.color === C.CAR_PARTS.head).length, 2, v + ' headlights');
    assert.equal(parts.filter(p => p.color === C.CAR_PARTS.tail).length, 2, v + ' tail lights');
    assert.equal(parts.filter(p => p.color === C.CAR_PARTS.trim).length, 2, v + ' bumpers');
    assert(parts.some(p => p.color === 'glass') && parts.filter(p => p.color === 'body').length >= 3, v + ' windows, roof, body');
    assert.equal(a.triangles, C.carTriangles(parts)); assert.equal(a.position.length, a.triangles * 9);
    assert.equal(a.normal.length, a.position.length); assert.equal(a.color.length, a.position.length);
    assert(a.triangles > OLD_TRIS && a.triangles <= 340, v + ' triangles ' + a.triangles);
    assert(a.position.every(Number.isFinite) && a.normal.every(Number.isFinite));
  }
  assert.equal(C.carVariantOf(0), 'hatch'); assert.equal(C.carVariantOf(4), 'sedan'); assert.equal(C.carVariantOf(-1), 'suv');
  assert.equal(C.buildCarArrays('#ffffff', 'nope').variant, 'sedan', 'unknown shape falls back to a sedan');
});
test('DS-6: car sits on the ground, faces +x and keeps a real car size', () => {
  for (const v of Object.keys(C.CAR_VARIANTS)) {
    const a = C.buildCarArrays('#a8abd9', v), b = C.carBounds(a);
    assert(b.min[1] >= 0 && b.min[1] < .05, v + ' tyres touch the road');
    assert(b.size[0] > 3.6 && b.size[0] < 4.6, v + ' length ' + b.size[0]);
    assert(b.size[2] > 1.6 && b.size[2] < 2.1, v + ' width incl. mirrors ' + b.size[2]);
    assert(b.size[1] > 1.3 && b.size[1] < 1.9, v + ' height ' + b.size[1]);
    assert(Math.abs(b.min[2] + b.max[2]) < 1e-6, v + ' symmetric across the car');
    const parts = C.carParts(v), x = p => (p.x0 + p.x1) / 2;
    assert(parts.filter(p => p.color === C.CAR_PARTS.head).every(p => x(p) > 1.5), 'headlights at the front');
    assert(parts.filter(p => p.color === C.CAR_PARTS.tail).every(p => x(p) < -1.5), 'tail lights at the back');
  }
});
test('DS-6: normals are unit length and point away from each part (correct lighting)', () => {
  const a = C.buildCarArrays('#df798b', 'suv');
  for (let i = 0; i < a.normal.length; i += 3) assert(Math.abs(Math.hypot(a.normal[i], a.normal[i + 1], a.normal[i + 2]) - 1) < 1e-5);
  // The lower body is the first part (12 triangles): every face normal points out of the body centre.
  const body = C.carParts('suv')[0], cx = (body.x0 + body.x1) / 2, cy = (body.y0 + body.y1) / 2;
  for (let t = 0; t < 12; t++) {
    let mx = 0, my = 0, mz = 0; for (let k = 0; k < 3; k++) { const o = t * 9 + k * 3; mx += a.position[o] / 3; my += a.position[o + 1] / 3; mz += a.position[o + 2] / 3; }
    assert((mx - cx) * a.normal[t * 9] + (my - cy) * a.normal[t * 9 + 1] + mz * a.normal[t * 9 + 2] > 0, 'body face ' + t);
  }
});
test('DS-6: colours are linear 0-1, the body takes the paint and parts keep their own colour', () => {
  assert.deepEqual(C.hexToLinear('#000000'), [0, 0, 0]); assert.deepEqual(C.hexToLinear('#ffffff'), [1, 1, 1]);
  assert(Math.abs(C.hexToLinear('#808080')[0] - .2158605) < 1e-5, 'sRGB to linear');
  const red = C.buildCarArrays('#c95f4a', 'hatch'), blue = C.buildCarArrays('#6fa8c9', 'hatch'), paint = C.hexToLinear('#c95f4a');
  assert(Math.abs(red.color[0] - paint[0]) < 1e-6 && Math.abs(red.color[2] - paint[2]) < 1e-6, 'first part is painted');
  assert.notDeepEqual(red.color.slice(0, 3), blue.color.slice(0, 3));
  assert.deepEqual(red.color.slice(-3), blue.color.slice(-3), 'tyres stay tyre-coloured');
  assert(red.color.every(c => c >= 0 && c <= 1));
  assert.equal(new Set(C.CAR_PALETTE).size, 8);
});
test('DS-6: scene cars are one mesh each with a shared double-sided vertex-colour material', async () => {
  const THREE = await load('../../common/vendor/three/three.module.min.js');
  const { createWorld } = await load('../ui/scene3d.js');
  const w = createWorld(THREE, D), prefs = { side: 'left', auto: false };
  const def = D.roadLessons('left')[0], s = D.session(def, prefs); w.update(s, prefs, 0);
  const town = []; w.town.traverse(o => { if (o.isMesh && !o.isInstancedMesh && o.name !== 'building' && o.material.vertexColors) town.push(o); });
  const road = []; w.drive.group.traverse(o => { if (o.isMesh && !o.isInstancedMesh && o.material.vertexColors) road.push(o); });
  assert.equal(town.length, 4, 'town AI cars'); assert.equal(road.length, 4, 'open-road car pool');
  const all = town.concat(road);
  assert(all.every(m => m.children.length === 0 && m.material === all[0].material), 'one mesh per car, one material');
  assert(all[0].material.isMeshLambertMaterial && all[0].material.side === THREE.DoubleSide);
  assert(new Set(all.map(m => m.geometry.attributes.position.count / 3)).size === 1, 'same triangle budget per car');
  assert.equal(all[0].geometry.attributes.position.count / 3, C.buildCarArrays('#e3b85f', 'hatch').triangles);
  // The town's cars use three shapes, and drawing a lesson keeps them visible on the road.
  assert(new Set(town.map(m => m.geometry.attributes.position.array.length + ':' + m.geometry.boundingSphere.radius.toFixed(3))).size >= 3);
  console.log('# per car: before ' + OLD_MESHES + ' meshes / ' + OLD_TRIS + ' triangles, after 1 mesh / ' + all[0].geometry.attributes.position.count / 3 + ' triangles');
});
