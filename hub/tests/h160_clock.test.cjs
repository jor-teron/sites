// H160 Desktop analog clock: pure angle / position / size / pause helpers + wiring.
// Run: node --test hub/tests/h160_clock.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const C = require('../core/hub_clock.js');

function at(h, m, s) {
  return new Date(2026, 0, 1, h, m, s, 0);
}

test('H160: pref is off by default; only 1 turns it on', () => {
  assert.equal(C.prefEnabled(undefined), false);
  assert.equal(C.prefEnabled(null), false);
  assert.equal(C.prefEnabled(''), false);
  assert.equal(C.prefEnabled('0'), false);
  assert.equal(C.prefEnabled('1'), true);
  assert.equal(C.prefEnabled('yes'), false);
});

test('H160: shouldShow needs the pref and Desktop mode', () => {
  assert.equal(C.shouldShow({ pref: '1', isDesktop: true }), true);
  assert.equal(C.shouldShow({ pref: '1', isDesktop: false }), false);
  assert.equal(C.shouldShow({ pref: '', isDesktop: true }), false);
  assert.equal(C.shouldShow({ pref: '0', isDesktop: true }), false);
});

test('H160: size presets Small / Medium / Large, default Medium', () => {
  assert.equal(C.normalizeSize('s'), 's');
  assert.equal(C.normalizeSize('m'), 'm');
  assert.equal(C.normalizeSize('l'), 'l');
  assert.equal(C.normalizeSize(''), 'm');
  assert.equal(C.normalizeSize('xl'), 'm');
  assert.equal(C.normalizeSize(undefined), 'm');
  assert.equal(C.sizePx('s'), C.SIZES.s);
  assert.equal(C.sizePx('m'), C.SIZES.m);
  assert.equal(C.sizePx('l'), C.SIZES.l);
  assert.equal(C.sizePx(''), C.SIZES.m);
  assert.ok(C.SIZES.s < C.SIZES.m && C.SIZES.m < C.SIZES.l);
  assert.equal(C.sizePx('s'), 88);
  assert.equal(C.sizePx('m'), 128);
  assert.equal(C.sizePx('l'), 176);
});

test('H160: hand angles are clockwise from 12', () => {
  let a = C.handAngles(at(0, 0, 0));
  assert.equal(a.hour, 0);
  assert.equal(a.minute, 0);
  assert.equal(a.second, 0);
  a = C.handAngles(at(3, 0, 0));
  assert.equal(a.hour, 90);
  assert.equal(a.minute, 0);
  assert.equal(a.second, 0);
  a = C.handAngles(at(6, 0, 0));
  assert.equal(a.hour, 180);
  a = C.handAngles(at(9, 0, 0));
  assert.equal(a.hour, 270);
  a = C.handAngles(at(0, 30, 0));
  assert.equal(a.hour, 15);
  assert.equal(a.minute, 180);
  assert.equal(a.second, 0);
  a = C.handAngles(at(0, 0, 30));
  assert.equal(a.second, 180);
  assert.equal(a.minute, 3);
  a = C.handAngles(at(12, 0, 15));
  assert.equal(a.second, 90);
});

test('H160: next second delay aligns to the following second', () => {
  assert.equal(C.nextSecondDelay(0), 1000);
  assert.equal(C.nextSecondDelay(1000), 1000);
  assert.equal(C.nextSecondDelay(1000 + 250), 750);
  assert.equal(C.nextSecondDelay(1999), 1);
  assert.equal(C.nextSecondDelay(1999.9), 1);
  assert.ok(C.nextSecondDelay(Date.now()) <= 1000);
  assert.ok(C.nextSecondDelay(Date.now()) >= 1);
});

test('H160: parsePos / formatPos round-trip', () => {
  assert.equal(C.parsePos(''), null);
  assert.equal(C.parsePos(null), null);
  assert.equal(C.parsePos('nope'), null);
  assert.deepEqual(C.parsePos('10,20'), { x: 10, y: 20 });
  assert.deepEqual(C.parsePos('10.6, 21.2'), { x: 11, y: 21 });
  assert.deepEqual(C.parsePos('{"x":40,"y":8}'), { x: 40, y: 8 });
  assert.equal(C.parsePos('{not json'), null);
  assert.equal(C.formatPos(10.4, 20.6), '10,21');
  assert.deepEqual(C.parsePos(C.formatPos(3, 4)), { x: 3, y: 4 });
});

test('H160: default position is top-right, clear of the taskbar', () => {
  const d = C.defaultPos(1280, 720, 128, 16, 40, false);
  assert.deepEqual(d, { x: 1280 - 128 - 16, y: 16 });
  const top = C.defaultPos(1280, 720, 128, 16, 40, true);
  assert.deepEqual(top, { x: 1280 - 128 - 16, y: 40 + 16 });
});

test('H160: clampPos keeps the clock on the desk', () => {
  const c = C.clampPos(2000, 2000, 128, 1280, 720, 40, false);
  assert.deepEqual(c, { x: 1280 - 128, y: 720 - 40 - 128 });
  const n = C.clampPos(-40, -10, 128, 1280, 720, 40, false);
  assert.deepEqual(n, { x: 0, y: 0 });
  const t = C.clampPos(0, 0, 128, 1280, 720, 40, true);
  assert.deepEqual(t, { x: 0, y: 40 });
  const t2 = C.clampPos(0, 900, 128, 1280, 720, 40, true);
  assert.deepEqual(t2, { x: 0, y: 720 - 128 });
  const tight = C.clampPos(0, 0, 200, 100, 100, 40, false);
  assert.deepEqual(tight, { x: 0, y: 0 });
});

test('H160: shouldPause on hidden tab, lock, break, or a maximised window', () => {
  assert.equal(C.shouldPause({}), false);
  assert.equal(C.shouldPause({ hidden: true }), true);
  assert.equal(C.shouldPause({ locked: true }), true);
  assert.equal(C.shouldPause({ breakOn: true }), true);
  assert.equal(C.shouldPause({ maximised: true }), true);
  assert.equal(C.shouldPause({ hidden: false, locked: false, breakOn: false, maximised: false }), false);
});

test('H160: isMaximisedClass ignores minimised and other-workspace windows', () => {
  assert.equal(C.isMaximisedClass('wm-win wm-max'), true);
  assert.equal(C.isMaximisedClass('wm-win wm-max wm-active'), true);
  assert.equal(C.isMaximisedClass('wm-win wm-max wm-min'), false);
  assert.equal(C.isMaximisedClass('wm-win wm-max wm-off'), false);
  assert.equal(C.isMaximisedClass('wm-win'), false);
  assert.equal(C.isMaximisedClass(''), false);
});

test('H160: desktop.html loads the clock css and js (Desktop only)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'desktop/desktop.html'), 'utf8');
  assert.match(html, /hub\/core\/hub_clock\.css/);
  assert.match(html, /hub\/core\/hub_clock\.js/);
  const phone = fs.readFileSync(path.join(ROOT, 'phone.html'), 'utf8');
  assert.doesNotMatch(phone, /hub_clock/);
});

test('H160: clock files are on the SW shell list', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'hub/update/hub_sw.js'), 'utf8');
  assert.match(sw, /hub\/core\/hub_clock\.js/);
  assert.match(sw, /hub\/core\/hub_clock\.css/);
});

test('H160: Settings › Desktop has Show analog clock, default off, pref deskClock', () => {
  const desk = fs.readFileSync(path.join(ROOT, 'apps/system/settings/sec_desktop.js'), 'utf8');
  assert.match(desk, /Show analog clock on the desktop/);
  assert.match(desk, /desktop-desk-clock/);
  assert.match(desk, /S\.get\('deskClock'\) === '1'/);
  assert.match(desk, /S\.set\('deskClock', on \? '1' : ''\)/);
  const prefs = fs.readFileSync(path.join(ROOT, 'hub/core/hub_prefs.js'), 'utf8');
  assert.match(prefs, /sites-hub\.deskClock/);
  assert.match(prefs, /HubClock/);
});

test('H160: Search lists the desktop analog clock setting', () => {
  const src = fs.readFileSync(path.join(ROOT, 'apps/system/search/search_items.js'), 'utf8');
  assert.match(src, /Show analog clock on the desktop/);
  assert.match(src, /analog clock/);
  assert.match(src, /deskClock/);
});
