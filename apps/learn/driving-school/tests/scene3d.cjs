/* DS-2a: non-browser smoke test of the three.js scene (no WebGL renderer, no DOM).
   Builds the practice lot, town and mock scenes from real sessions and updates them. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const D = Object.assign({}, require('../core/physics.js'), require('../core/lessons.js'), require('../core/town.js'),
  require('../core/rules.js'), require('../core/exam.js'), require('../core/session.js'), require('../core/cockpit.js'));
const load = p => import(pathToFileURL(path.join(__dirname, p)).href);

test('three.js r170 copy in learn/common/vendor loads', async () => {
  const THREE = await load('../../common/vendor/three/three.module.min.js');
  assert.equal(THREE.REVISION, '170');
});
test('scene builds and updates for lot lessons, town lessons and the mock test', async () => {
  const THREE = await load('../../common/vendor/three/three.module.min.js');
  const { createWorld, poseCamera } = await load('../ui/scene3d.js');
  for (const side of ['left', 'right']) {
    const w = createWorld(THREE, D), prefs = { side, auto: false };
    const defs = D.basics.concat(D.roadLessons(side), [D.mockDefinition(side)]);
    for (const def of defs) {
      const s = D.session(def, prefs); D.start(s.c);
      for (let i = 0; i < 30; i++) D.tick(s, { throttle: .5 }, 1 / 30);
      w.update(s, prefs, 1.5);
      assert.equal(w.markerCount, def.gates.length, def.id);
      assert.equal(w.lot.visible, !def.town); assert.equal(w.town.visible, !!def.town);
    }
    let meshes = 0; w.scene.traverse(o => { if (o.isMesh) meshes++; }); assert(meshes > 50 && meshes < 400, 'low geometry: ' + meshes);
    w.scene.traverse(o => { if (o.isMesh && o.material) assert.equal(o.material.side, THREE.DoubleSide, 'mirrors need double-sided materials'); });
  }
  const c = D.car({ x: 30, y: 100, heading: 0 }), cam = new THREE.PerspectiveCamera(38, 3, .3, 200);
  poseCamera(cam, D.rearMirrorCamera(c), 3);
  assert(cam.projectionMatrix.elements[0] < 0, 'mirror is left-right flipped');
  const ahead = new THREE.Vector3(); cam.getWorldDirection(ahead); assert(ahead.x < -.9, 'rear mirror looks back');
  poseCamera(cam, D.rearMirrorCamera(c), 2.5); assert(cam.projectionMatrix.elements[0] < 0, 'still flipped after resize');
  const eye = new THREE.PerspectiveCamera(); const p = D.driverCamera(c, 'left');
  poseCamera(eye, Object.assign({}, p, { flip: false }), 2); eye.getWorldDirection(ahead); assert(ahead.x > .9);
  // A point on the ring ahead is in front of the driver and on screen.
  const ring = new THREE.Vector3(78, 0, 100).project(eye); assert(ring.z < 1 && Math.abs(ring.x) < 1);
});
