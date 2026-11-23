// Desktop analog clock: Web_OS identical clock widget tests.
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

test('H160: Web_OS analog clock geometry (250px)', () => {
  assert.equal(C.SIZE, 250);
  assert.equal(C.sizePx(), 250);
});

test('H160: hand angles are clockwise from 12 (Web_OS formula)', () => {
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
  assert.equal(a.minute, 0);
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

// test('H160: desktop.html loads the clock css and js (Desktop only)', () => {
//   const html = fs.readFileSync(path.join(ROOT, 'desktop/desktop.html'), 'utf8');
//   assert.match(html, /hub\/core\/hub_clock\.css/);
//   assert.match(html, /hub\/core\/hub_clock\.js/);
//   ...
// });   (before H174)
test('H160: clock css and js load on Desktop only (H174: clock batch in hub_loader.js)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'desktop/desktop.html'), 'utf8');
  // H174: not a blocking tag; kept as a (before H174) comment and loaded by the clock batch
  assert.match(html, /hub\/core\/hub_clock\.css/);
  assert.match(html, /hub\/core\/hub_clock\.js/);
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.equal(/<link rel="stylesheet" href="hub\/core\/hub_clock\.css/.test(live), false);
  assert.equal(/<script src="hub\/core\/hub_clock\.js/.test(live), false);
  const loader = fs.readFileSync(path.join(ROOT, 'hub/core/hub_loader.js'), 'utf8');
  assert.match(loader, /clock:\s*\[[^\]]*'hub\/core\/hub_clock\.css'/s);
  assert.match(loader, /clock:\s*\[[^\]]*'hub\/core\/hub_clock\.js'/s);
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

test('H160: CSS matches Web_OS classes and styling', () => {
  const css = fs.readFileSync(path.join(ROOT, 'hub/core/hub_clock.css'), 'utf8');
  assert.match(css, /\.analog-clock/);
  assert.match(css, /\.analog-face/);
  assert.match(css, /\.analog-dot/);
  assert.match(css, /\.hand\.hour/);
  assert.match(css, /\.hand\.minute/);
  assert.match(css, /\.hand\.second/);
  assert.match(css, /250px/);
  assert.match(css, /pointer-events:\s*none/);
});
