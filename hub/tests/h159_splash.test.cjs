// H159 Boot splash: pure state machine + desktop / settings / shell wiring.
// Run: node --test hub/tests/h159_splash.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const S = require('../core/hub_splash.js');

test('H159: splash is on by default and off only for pref 0', () => {
  assert.equal(S.prefEnabled(undefined), true);
  assert.equal(S.prefEnabled(null), true);
  assert.equal(S.prefEnabled(''), true);
  assert.equal(S.prefEnabled('1'), true);
  assert.equal(S.prefEnabled('0'), false);
});

test('H159: shouldShow is false for Join links, iframes, or a turned-off pref', () => {
  assert.equal(S.shouldShow({ pref: '', isJoin: false, isTop: true }), true);
  assert.equal(S.shouldShow({ pref: '0', isJoin: false, isTop: true }), false);
  assert.equal(S.shouldShow({ pref: '', isJoin: true, isTop: true }), false);
  assert.equal(S.shouldShow({ pref: '', isJoin: false, isTop: false }), false);
});

/* (before H159a)
test('H159: canDismiss — ready fades even before 10s; not ready needs 10s (no auto)', () => {
  assert.equal(S.canDismiss(0, true), true);
  assert.equal(S.canDismiss(5000, true), true);
  assert.equal(S.canDismiss(0, false), false);
  assert.equal(S.canDismiss(9999, false), false);
  assert.equal(S.canDismiss(10000, false), true);
  assert.equal(S.canDismiss(15000, false), true);
  assert.equal(S.canDismiss(500, false, 400), true);
  assert.equal(S.canDismiss(100, false, 400), false);
});
*/
test('H159a: canDismiss — ready waits 3 s; not ready needs 10 s (no auto, no skip before 10 s)', () => {
  assert.equal(S.SHOW_MIN_MS, 3000);
  assert.equal(S.canDismiss(0, true), false);
  assert.equal(S.canDismiss(2999, true), false);
  assert.equal(S.canDismiss(3000, true), true);
  assert.equal(S.canDismiss(5000, true), true);
  assert.equal(S.canDismiss(0, false), false);
  assert.equal(S.canDismiss(9999, false), false);
  assert.equal(S.canDismiss(10000, false), true);
  assert.equal(S.canDismiss(15000, false), true);
  assert.equal(S.canDismiss(500, false, 400), true);
  assert.equal(S.canDismiss(100, false, 400), false);
  assert.equal(S.canDismiss(200, true, 10000, 400), false);
  assert.equal(S.canDismiss(400, true, 10000, 400), true);
});

test('H159a: about:blank is not an app document; cross-origin load is', () => {
  assert.equal(S.isAppDocument('about:blank', false), false);
  assert.equal(S.isAppDocument('about:blank#', false), false);
  assert.equal(S.isAppDocument('about:srcdoc', false), false);
  assert.equal(S.isAppDocument('', false), false);
  assert.equal(S.isAppDocument(null, false), false);
  assert.equal(S.isAppDocument('http://127.0.0.1/apps/system/settings/', false), true);
  assert.equal(S.isAppDocument('', true), true);
  assert.equal(S.isAppDocument('about:blank', true), true);
});

test('H159: still-loading hint only after 10s while not ready', () => {
  assert.equal(S.showStillLoading(0, false), false);
  assert.equal(S.showStillLoading(9999, false), false);
  assert.equal(S.showStillLoading(10000, false), true);
  assert.equal(S.showStillLoading(20000, true), false);
  assert.equal(S.showStillLoading(0, true), false);
  assert.equal(S.STILL_MSG.includes('Still loading'), true);
  assert.equal(S.MIN_MS, 10000);
  assert.equal(S.SHOW_MIN_MS, 3000);
});

test('H159: progress fraction is core ready plus N of M windows', () => {
  assert.equal(S.progressFraction(false, 0, 0), 0);
  assert.equal(S.progressFraction(true, 0, 0), 1);
  assert.equal(S.progressFraction(false, 0, 4), 0);
  assert.equal(S.progressFraction(true, 0, 4), 1 / 5);
  assert.equal(S.progressFraction(true, 2, 4), 3 / 5);
  assert.equal(S.progressFraction(true, 4, 4), 1);
  assert.equal(S.progressFraction(true, 9, 4), 1); // clamp
  assert.equal(S.progressFraction(false, -1, -3), 0);
});

test('H159: isReady — no windows means shell ready; otherwise all windows restored', () => {
  assert.equal(S.isReady(false, 0, 0), false);
  assert.equal(S.isReady(true, 0, 0), true);
  assert.equal(S.isReady(true, 3, 3), true);
  assert.equal(S.isReady(true, 2, 3), false);
  assert.equal(S.isReady(false, 3, 3), false);
});

test('H159: sessionTotal counts saved window keys only', () => {
  assert.equal(S.sessionTotal(null), 0);
  assert.equal(S.sessionTotal({}), 0);
  assert.equal(S.sessionTotal({ wins: [] }), 0);
  assert.equal(S.sessionTotal({ wins: [{ key: 'apps/system/settings/' }, { key: 'apps/system/files/' }, {}, { name: 'x' }] }), 2);
});

test('H159: desktop.html has the pre-paint boot script and includes the splash files', () => {
  const html = fs.readFileSync(path.join(ROOT, 'desktop/desktop.html'), 'utf8');
  assert.match(html, /hub-splash/);
  assert.match(html, /sites-hub\.bootSplash/);
  assert.match(html, /hub\/core\/hub_splash\.css/);
  assert.match(html, /hub\/core\/hub_splash\.js/);
  assert.match(html, /bootSplash'\)\s*!==\s*'0'/);
  assert.match(html, /join=/);
});

test('H159: splash files are on the SW shell list', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'hub/update/hub_sw.js'), 'utf8');
  assert.match(sw, /hub\/core\/hub_splash\.js/);
  assert.match(sw, /hub\/core\/hub_splash\.css/);
});

test('H159: Settings › Look has Show boot splash, default on, pref bootSplash', () => {
  const look = fs.readFileSync(path.join(ROOT, 'apps/system/settings/sec_look.js'), 'utf8');
  assert.match(look, /Show boot splash/);
  assert.match(look, /look-boot-splash/);
  assert.match(look, /S\.get\('bootSplash'\) !== '0'/);
  assert.match(look, /S\.set\('bootSplash', on \? '' : '0'\)/);
  const prefs = fs.readFileSync(path.join(ROOT, 'hub/core/hub_prefs.js'), 'utf8');
  assert.match(prefs, /sites-hub\.bootSplash/);
});

test('H159: restore hooks fire desktop-started / session-restored / frame-load', () => {
  const hub = fs.readFileSync(path.join(ROOT, 'hub/core/hub.js'), 'utf8');
  assert.match(hub, /hub-desktop-started/);
  assert.match(hub, /HubSplash\.onDesktopStarted/);
  const wm = fs.readFileSync(path.join(ROOT, 'desktop/wm/wm_windows.js'), 'utf8');
  assert.match(wm, /hub-wm-session-restored/);
  assert.match(wm, /hub-wm-frame-load/);
});

test('H159: Search lists the boot splash setting', () => {
  const src = fs.readFileSync(path.join(ROOT, 'apps/system/search/search_items.js'), 'utf8');
  assert.match(src, /Show boot splash/);
  assert.match(src, /boot splash/);
  assert.match(src, /before H159/);
});
