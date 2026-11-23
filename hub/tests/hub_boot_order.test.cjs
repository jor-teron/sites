'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const S = require('../core/hub_splash.js');

test('H178: splash isReady requires stage 1 + menu + fallback, not restored windows', () => {
  assert.equal(S.SHOW_MIN_MS, 5000);
  assert.equal(S.MIN_MS, 10000);
  assert.equal(S.isReady(false, true, true), false);
  assert.equal(S.isReady(true, false, true), false);
  assert.equal(S.isReady(true, true, false), false);
  assert.equal(S.isReady(true, true, true), true);
  assert.equal(S.isReady(true, 0, 0), false);
  assert.equal(S.isReady(1, 1, 1), true);
  // 5 s min when ready; 10 s skip only when not ready (same canDismiss as H174)
  assert.equal(S.canDismiss(4999, true), false);
  assert.equal(S.canDismiss(5000, true), true);
  assert.equal(S.canDismiss(9999, false), false);
  assert.equal(S.canDismiss(10000, false), true);
  assert.equal(S.showStillLoading(9999, false), false);
  assert.equal(S.showStillLoading(10000, false), true);
  assert.equal(S.showStillLoading(10000, true), false);
});

test('H178: hub_splash.js wires onMenuReady / onFallbackReady and hub-splash-gone', () => {
  const src = read('hub/core/hub_splash.js');
  assert.match(src, /function onMenuReady\(/);
  assert.match(src, /function onFallbackReady\(/);
  assert.match(src, /api\.onMenuReady = onMenuReady/);
  assert.match(src, /api\.onFallbackReady = onFallbackReady/);
  assert.match(src, /hub-menu-ready/);
  assert.match(src, /hub-fallback-ready/);
  assert.match(src, /hub-splash-gone/);
  assert.match(src, /menuPending/);
  assert.match(src, /fallbackPending/);
  assert.match(src, /__hubFallbackReady/);
  // readyNow no longer uses restoredCount for isReady
  assert.match(src, /isReady\(coreReady, menuReady, fallbackReady\)/);
  assert.match(src, /\(before H178\) function readyNow\(\) \{ return isReady\(coreReady, restoredCount\(\), total\); \}/);
  // 10 s still-loading hint kept
  assert.match(src, /Still loading/);
  assert.match(src, /STILL_MSG/);
});

test('H178: paintFallback signals that the static fallback wallpaper is ready', () => {
  const src = read('hub/core/hub_prefs.js');
  assert.match(src, /function paintFallback\(/);
  assert.match(src, /window\.__hubFallbackReady = true/);
  assert.match(src, /HubSplash\.onFallbackReady/);
  assert.match(src, /hub-fallback-ready/);
  // signal is inside paintFallback, not only in applyWallpaper
  const iPaint = src.indexOf('function paintFallback(');
  const iApplyW = src.indexOf('function applyWallpaper(');
  const iFlag = src.indexOf('window.__hubFallbackReady = true');
  assert.ok(iPaint >= 0 && iApplyW > iPaint && iFlag > iPaint && iFlag < iApplyW);
});

test('H178: connect is gated after splash gone + restored / opened windows, with a 15 s cap; wallpaper last', () => {
  const src = read('hub/core/hub_loader.js');
  assert.match(src, /const CONNECT_WAIT_MS = 15000/);
  assert.match(src, /function signalMenuReady\(/);
  assert.match(src, /function waitSplashGone\(/);
  assert.match(src, /function waitForAppWindows\(/);
  assert.match(src, /function afterSplashAndRestore\(/);
  assert.match(src, /hub-splash-gone/);
  assert.match(src, /hub-wm-frame-load/);
  assert.match(src, /hub-wm-session-restored/);
  assert.match(src, /hub-wm-change/);
  // old immediate menu→connect chain kept as a comment
  assert.match(src, /\(before H178\) load\('menu'\)\.then\(\(\) => load\('connect'\)\)\.then\(\(\) => load\('wallpaper'\)\)\.then\(afterWallpaper\)/);
  // live path: menu, then afterSplashAndRestore, then connect, then wallpaper
  assert.match(src, /load\('menu'\)\.then\(\(\) => \{/);
  assert.match(src, /afterSplashAndRestore\(\)\.then\(\(\) => load\('connect'\)\)/);
  assert.match(src, /load\('wallpaper'\)\)\.then\(afterWallpaper\)/);
  // afterWallpaper still starts idle batches + SW register
  const live = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const iConnect = live.search(/afterSplashAndRestore\(\)\.then\(\(\) => load\('connect'\)\)/);
  const iWall = live.search(/load\('wallpaper'\)\)\.then\(afterWallpaper\)/);
  const iAfter = live.indexOf('function afterWallpaper()');
  const iDrives = live.indexOf("load('drives')");
  const iReg = live.indexOf('HubUpdate.register');
  assert.ok(iConnect >= 0 && iWall > iConnect, 'wallpaper follows connect in startStaged');
  assert.ok(iDrives > iAfter && iReg > iAfter, 'idle batches stay in afterWallpaper');
  // cap is used in waitForAppWindows
  assert.match(src, /now\(\) - started >= CONNECT_WAIT_MS/);
  assert.match(src, /setTimeout\(done, CONNECT_WAIT_MS\)/);
});

test('H178: menu-ready is signaled when the menu batch finishes (staged or need)', () => {
  const src = read('hub/core/hub_loader.js');
  // load() itself signals, so an early Start click (need('menu')) also tells the splash
  assert.match(src, /if \(name === 'menu'\) signalMenuReady\(\)/);
  assert.match(src, /if \(done\.menu\) signalMenuReady\(\)/);
  assert.match(src, /HubSplash\.onMenuReady/);
  assert.match(src, /hub-menu-ready/);
  // need('menu') on early Start is still there
  assert.match(src, /need\('menu'\)/);
});

test('H178: batch list order is unchanged (menu, connect, wallpaper, then idle)', () => {
  const src = read('hub/core/hub_loader.js');
  const names = [];
  const re = /^\s{4}(\w+):\s*\[/gm;
  let m;
  while ((m = re.exec(src))) names.push(m[1]);
  assert.equal(names[0], 'menu');
  assert.equal(names[1], 'connect');
  assert.equal(names[2], 'wallpaper');
  assert.ok(names.indexOf('drives') > names.indexOf('wallpaper'));
  assert.ok(names.includes('clock'));
  assert.ok(names.includes('update'));
});

test('H178: H175 conditional loading and HubLoader.ensure are still in place', () => {
  const html = read('desktop/desktop.html');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.match(live, /sites-hub\.theme/);
  assert.match(read('hub/core/hub_loader.js'), /function ensure\(/);
  assert.match(read('hub/core/hub_loader.js'), /HubLoader = \{ load, need, ensure/);
  assert.match(read('hub/core/hub_prefs.js'), /HubLoader\.ensure\('xp'\)/);
  assert.match(read('hub/core/hub_prefs.js'), /HubLoader\.ensure\('glass'\)/);
});
