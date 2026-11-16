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

test('DS-4: engine button is grey Engine OFF or green Engine ON', () => {
  assert.deepEqual(M.engineChrome({ engine: false }), { text: 'Engine OFF', running: false });
  assert.deepEqual(M.engineChrome({ engine: true }), { text: 'Engine ON', running: true });
  assert.deepEqual(M.engineChrome(null), { text: 'Engine OFF', running: false });
});
test('DS-4: mini-map is off by default and only an explicit true turns it on', () => {
  assert.equal(M.settingsFrom(undefined).minimap, false);
  assert.equal(M.settingsFrom({}).minimap, false);
  assert.equal(M.settingsFrom({ auto: false, side: 'left', muted: false, route: 1 }).minimap, false);
  assert.equal(M.settingsFrom({ minimap: true, auto: true }).minimap, true);
  assert.equal(M.settingsFrom({ minimap: 'on' }).minimap, false);
  assert.equal(M.settingsFrom({ minimap: true }).auto, false, 'other defaults remain');
  assert.equal(M.showMinimap({ minimap: false }, false), false);
  assert.equal(M.showMinimap({ minimap: false }, true), true, 'map fallback always shows the full map');
  assert.equal(M.showMinimap({ minimap: true }, false), true);
});
test('DS-4: lesson note fades after 5 seconds and a reshow starts the timer again', () => {
  assert.equal(M.NOTE_FADE_MS, 5000);
  assert.equal(M.noteFaded(0, 4999, false), false);
  assert.equal(M.noteFaded(0, 5000, false), true);
  assert.equal(M.noteFaded(0, 8000, true), false, 'held / tapped note stays visible');
  assert.equal(M.noteFaded(6000, 7000, false), false);
});

test('DS-4a: odometers accumulate metres as km, persist-shape, and trip can reset', () => {
  assert.deepEqual(M.odometersFrom(undefined), { total: 0, trip: 0 });
  assert.deepEqual(M.odometersFrom({}), { total: 0, trip: 0 });
  assert.deepEqual(M.odometersFrom({ total: -5, trip: 'nope' }), { total: 0, trip: 0 });
  assert.deepEqual(M.odometersFrom({ total: 12340, trip: 400 }), { total: 12340, trip: 400 });
  let o = M.odometersFrom({});
  o = M.addDistance(o, 1000);
  assert.deepEqual(o, { total: 1000, trip: 1000 });
  o = M.addDistance(o, 250);
  assert.deepEqual(o, { total: 1250, trip: 1250 });
  const kept = o;
  o = M.resetTrip(o);
  assert.deepEqual(o, { total: 1250, trip: 0 });
  assert.deepEqual(kept, { total: 1250, trip: 1250 }, 'resetTrip does not mutate the previous object');
  o = M.addDistance(o, 100);
  assert.deepEqual(o, { total: 1350, trip: 100 });
  o = M.addDistance(o, 0);
  o = M.addDistance(o, -10);
  o = M.addDistance(o, NaN);
  assert.deepEqual(o, { total: 1350, trip: 100 }, 'non-positive deltas are ignored');
  assert.equal(M.formatKm(12340), '12.3 km');
  assert.equal(M.formatKm(0), '0.0 km');
  assert.equal(M.formatKm(-5), '0.0 km');
  assert.deepEqual(M.takeDelta(0, 10), { delta: 10, at: 10 });
  assert.deepEqual(M.takeDelta(10, 25), { delta: 15, at: 25 });
  assert.deepEqual(M.takeDelta(25, 0), { delta: 0, at: 0 }, 'session reset does not subtract');
  assert.equal(M.shouldSaveOdo(0, 3999, false), false);
  assert.equal(M.shouldSaveOdo(0, 4000, false), true);
  assert.equal(M.shouldSaveOdo(0, 100, true), true);
  assert.equal(M.ODO_SAVE_MS, 4000);
  assert.equal(M.FAULT_BEEP_MS, 800);
  assert.equal(M.faultBeepDue(0, 16), true, 'first beep is always due');
  assert.equal(M.faultBeepDue(32, 48), false);
  assert.equal(M.faultBeepDue(32, 832), true);
});
test('DS-4a: distance comes from abs speed * dt, including reverse', () => {
  const c = D.car({ v: -10, handbrake: false }), before = c.distance;
  D.step(c, {}, .2);
  assert(c.v < 0); assert(c.distance > before, 'reverse still adds distance');
  const o = M.addDistance(M.odometersFrom({}), M.takeDelta(before, c.distance).delta);
  assert(o.total > 0 && o.trip > 0);
});

test('DS-4b: trip reset hit target is 44 px', () => {
  assert.equal(M.TRIP_RESET_HIT_PX, 44);
});
