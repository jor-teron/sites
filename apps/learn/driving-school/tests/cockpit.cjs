/* DS-2a: pure cockpit maths (no DOM, no three.js). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../core/cockpit.js');
const D = Object.assign({}, require('../core/physics.js'), require('../core/lessons.js'), require('../core/town.js'), require('../core/exam.js'));
const near = (a, b, e = 1e-6) => assert(Math.abs(a - b) < e, a + ' vs ' + b);

test('steering wheel angle follows steering input and clamps', () => {
  assert.equal(M.wheelAngle(0), 0); assert.equal(M.wheelAngle(1), M.WHEEL_MAX_DEG); assert.equal(M.wheelAngle(-1), -M.WHEEL_MAX_DEG);
  assert.equal(M.wheelAngle(3), M.WHEEL_MAX_DEG); near(M.wheelAngle(.5), M.WHEEL_MAX_DEG / 2);
});
test('dragging the wheel round: clockwise steers right, works across 180 degrees', () => {
  near(M.pointerAngle(0, 0, 0, -10), 0); near(M.pointerAngle(0, 0, 10, 0), 90); near(M.pointerAngle(0, 0, -10, 0), -90);
  near(M.angleDelta(-170, 170), 20); near(M.angleDelta(170, -170), -20);
  let st = { steer: 0, lastDeg: 0 };
  st = M.dragSteer(st, 75); near(st.steer, 75 / M.WHEEL_MAX_DEG);
  st = M.dragSteer(st, 150); st = M.dragSteer(st, -170); assert.equal(st.steer, 1);   // passes 180 and clamps
  st = M.dragSteer({ steer: 0, lastDeg: 0 }, -60); assert(st.steer < 0);
  assert(M.nearHub(0, 0, 3, 3, 100)); assert(!M.nearHub(0, 0, 60, 0, 100));
});
test('dial needles sweep 240 degrees and clamp', () => {
  assert.equal(M.needleAngle(0, 100), -120); assert.equal(M.needleAngle(100, 100), 120); assert.equal(M.needleAngle(50, 100), 0);
  assert.equal(M.needleAngle(500, 100), 120); assert.equal(M.needleAngle(-5, 100), -120);
  assert.equal(M.speedKmh({ v: -2.5 }), 9);
});
test('gear labels and gear lever slots for manual and automatic', () => {
  assert.equal(M.gearLabel({ gear: -1 }), 'R'); assert.equal(M.gearLabel({ gear: 0 }), 'N'); assert.equal(M.gearLabel({ gear: 3 }), '3');
  assert.equal(M.gearLabel({ gear: 3, auto: true }), 'D');
  const man = M.gateSlots(false); assert.deepEqual(man.map(g => g.gear).sort(), [-1, 0, 1, 2, 3, 4, 5].sort());
  assert.equal(new Set(man.map(g => g.col + ',' + g.row)).size, 7);
  assert.deepEqual(M.gateSlots(true).map(g => g.label), ['R', 'N', 'D']);
  assert.equal(M.gateSlotFor({ gear: 4, auto: true }).label, 'D'); assert.equal(M.gateSlotFor({ gear: 2 }).label, '2');
});
test('driver sits on the right for India (RHD) and on the left for right-hand traffic', () => {
  const c = D.car({ x: 50, y: 100, heading: 0 });
  const rhd = M.driverCamera(c, 'left'), lhd = M.driverCamera(c, 'right');
  assert(rhd.position.z > 100 && lhd.position.z < 100, 'facing east, right of the car is +z (south)');
  assert(rhd.target.x > rhd.position.x); near(rhd.position.y, 1.18);
  const north = M.driverCamera(D.car({ x: 0, y: 0, heading: -Math.PI / 2 }), 'left');
  assert(north.position.x > 0 && north.target.z < north.position.z, 'facing north, the right side is east');
});
test('mirror cameras look backwards; door mirrors sit outside each side', () => {
  const c = D.car({ x: 50, y: 100, heading: 0 }), rear = M.rearMirrorCamera(c);
  assert(rear.target.x < rear.position.x); assert(rear.flip); near(rear.position.z, 100);
  const l = M.sideMirrorCamera(c, 'left'), r = M.sideMirrorCamera(c, 'right');
  assert(l.position.z < 100 && r.position.z > 100); assert(l.target.x < l.position.x && r.target.x < r.position.x);
  assert(l.target.z < l.position.z && r.target.z > r.position.z, 'angled outwards');
});
test('camera frame puts the horizon above the dashboard and viewport maths is bottom-left', () => {
  const f = M.cameraFrame(800, 400, .4);
  near(f.offsetY + f.height, f.fullHeight); near(f.fullHeight / 2 - f.offsetY, 160);
  assert(f.fov > 35 && f.fov < 105);
  const v = M.viewportFromRect({ left: 110, top: 20, width: 200, height: 60 }, { left: 10, top: 10, width: 800, height: 400 });
  assert.deepEqual(v, { x: 100, y: 330, w: 200, h: 60, visible: true });
  assert.equal(M.viewportFromRect({ left: 0, top: 0, width: 4, height: 4 }, { left: 0, top: 0, width: 100, height: 100 }).visible, false);
  assert.equal(M.renderPixelRatio(3, 800), 1.5); assert.equal(M.renderPixelRatio(2, 1800), 1); assert.equal(M.renderPixelRatio(undefined, 500), 1);
  assert(M.isPortrait(390, 844)); assert(!M.isPortrait(844, 390));
});
test('lesson markers: one arch per ring, travel direction, finish and parking boxes', () => {
  for (const def of D.basics) {
    const k = M.lessonMarkers(def); assert.equal(k.rings.length, def.gates.length); assert.equal(k.path.length, def.gates.length + 1);
    assert.equal(!!k.box, !!def.finish);
  }
  near(M.lessonMarkers(D.basics[0]).rings[0].heading, 0);
  const rev = M.lessonMarkers(D.basics[4]); near(Math.abs(rev.rings[0].heading), Math.PI);
  for (const side of ['left', 'right']) {
    const park = M.lessonMarkers(D.roadLessons(side).find(d => d.id === 'parallel')); assert.deepEqual([park.park.w, park.park.d], [12, 3]);
    const mock = M.lessonMarkers(D.mockDefinition(side)); assert(mock.rings.length > 20); assert(mock.park);
  }
  assert.equal(M.lotLayout().cones.length, 32); assert.equal(M.townLayout('left').o, -3.5); assert.equal(M.townLayout('right').o, 3.5);
  assert.equal(M.nextHint('Next: Brake'), 'Next: Brake'); assert.equal(M.nextHint('Brake'), 'Next: Brake');
});
