'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function realTags(html, re) {
  // tags that are not inside an HTML comment
  const out = [];
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
  let m;
  const r = new RegExp(re, 'g');
  while ((m = r.exec(stripped))) out.push(m[1] || m[0]);
  return out;
}

// test('H174: stage-1 CSS in desktop.html is only the taskbar / theme / splash / lock set', () => {
//   const allowed = [..., 'hub/core/hub_glass.css', 'hub/core/hub_xp.css', 'hub/core/hub_break.css', 'hub/core/hub_lock.css', ...];
// });   (before H175)
test('H174: stage-1 CSS in desktop.html is only the taskbar / splash set (H175: Glass / XP / lock / break are conditional)', () => {
  const html = read('desktop/desktop.html');
  const css = realTags(html, /<link\s+rel="stylesheet"\s+href="([^"?]+)(?:\?[^"]*)?"\s*\/>/);
  const allowed = [
    'hub/core/hub_main.css',
    'shared/style/no-scrollbar.css',
    'desktop/wm/wm.css',
    'hub/core/hub_splash.css'
  ];
  assert.deepEqual(css, allowed);
  for (const late of [
    'desktop/controller/hub_controller.css',
    'desktop/notify/hub_notification.css',
    'shared/link/link.css',
    'desktop/panels/hub_chat.css',
    'desktop/panels/hub_panels.css',
    'desktop/notify/hub_notifcenter.css',
    'desktop/menu/hub_flyout.css',
    'shared/dialog/dialog.css',
    'shared/ctxmenu/ctxmenu.css',
    'hub/update/hub_update.css',
    'hub/core/hub_clock.css'
  ]) {
    assert.equal(css.includes(late), false, late + ' is not a stage-1 stylesheet');
    assert.match(html, new RegExp('\\(before H174\\).*' + late.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

// test('H174: stage-1 scripts ... hub_eye.js, hub_break.js, hub_lock_core.js, hub_lock.js ...');   (before H175)
test('H174: stage-1 scripts in desktop.html are real tags (not document.write); later files are comments', () => {
  const html = read('desktop/desktop.html');
  const scripts = realTags(html, /<script\s+src="([^"?]+)(?:\?[^"]*)?"\s*>/);
  const allowed = [
    'hub/core/hub_splash.js',
    'hub/core/hub_config.js',
    'hub/core/hub_role.js',
    'hub/core/hub_daynight.js',
    'hub/core/hub_autotheme.js',
    'hub/core/hub_prefs.js',
    'desktop/wm/wm_mode.js',
    'desktop/wm/wm_windows.js',
    'desktop/wm/wm_taskbar.js',
    'hub/core/hub_loader.js'
  ];
  assert.deepEqual(scripts, allowed);
  assert.equal(html.includes('HubCore.load(') && !html.includes('<!-- (before H174) <script>HubCore.load('), false);
  assert.match(html, /\(before H174\) <script>HubCore\.load\('link'\);<\/script>/);
  assert.match(html, /\(before H174\) <script>HubCore\.load\('mesh'\);<\/script>/);
  assert.equal(scripts.includes('hub/core/hub.js'), false);
  assert.equal(scripts.includes('hub/core/hub_core.js'), false);
  assert.equal(scripts.includes('shared/vendor/qrcode.js'), false);
  assert.equal(scripts.includes('shared/wallpaper/wallpapers.js'), false);
  assert.equal(scripts.includes('hub/update/hub_update.js'), false);
  assert.equal(scripts.includes('desktop/controller/hub-controller.js'), false);
  assert.match(html, /\(before H174\) <script src="hub\/core\/hub\.js\?v=/);
  assert.match(html, /data-parts="boot"/); // kept as a comment of the old tag
});

test('H174: hub_loader.js batch order is menu → connect → wallpaper, then existing idle batches', () => {
  const src = read('hub/core/hub_loader.js');
  const names = [];
  const re = /^\s{4}(\w+):\s*\[/gm;
  let m;
  while ((m = re.exec(src))) names.push(m[1]);
  // first three staged batches, then the older ones; clock + update after wallpaper (idle)
  assert.equal(names[0], 'menu');
  assert.equal(names[1], 'connect');
  assert.equal(names[2], 'wallpaper');
  assert.ok(names.indexOf('drives') > names.indexOf('wallpaper'));
  assert.ok(names.indexOf('snap') > names.indexOf('drives'));
  assert.ok(names.indexOf('osk') > names.indexOf('snap'));
  assert.ok(names.indexOf('viewer') > names.indexOf('osk'));
  assert.ok(names.indexOf('saver') > names.indexOf('viewer'));
  assert.ok(names.includes('tray'));
  assert.ok(names.includes('clock'));
  assert.ok(names.includes('update'));
  // (before H178) assert.match(src, /load\('menu'\)\.then\(\(\) => load\('connect'\)\)\.then\(\(\) => load\('wallpaper'\)\)\.then\(afterWallpaper\)/);
  assert.match(src, /\(before H178\) load\('menu'\)\.then\(\(\) => load\('connect'\)\)\.then\(\(\) => load\('wallpaper'\)\)\.then\(afterWallpaper\)/);
  assert.match(src, /afterSplashAndRestore\(\)\.then\(\(\) => load\('connect'\)\)/);
  assert.match(src, /load\('wallpaper'\)\)\.then\(afterWallpaper\)/);
  assert.match(src, /afterWallpaper/);
  assert.match(src, /load\('drives'\)/);
  assert.match(src, /HubUpdate\.register/);
  assert.match(src, /startStaged\(\);/);
  // do not wait for window 'load' to start menu/connect/wallpaper
  assert.match(src, /do not wait for window 'load'/);
  assert.match(src, /\/\/ else window\.addEventListener\('load', start, \{ once: true \}\);/);
});

test('H174: connect batch lists link + mesh files and titlebar before gamebar; no document.write load', () => {
  const src = read('hub/core/hub_loader.js');
  const iConn = src.indexOf('connect:');
  const iWall = src.indexOf('wallpaper:');
  assert.ok(iConn !== -1 && iWall > iConn);
  const block = src.slice(iConn, iWall);
  const need = [
    'hub/core/hub_credentials.js', 'hub/core/hub_keys.js', 'hub/core/hub_providers.js',
    'hub/core/hub_embeddings.js', 'hub/core/hub_api.js', 'hub/core/hub_profile.js',
    'shared/link/link_core.js', 'shared/link/link_devices.js', 'shared/link/link_files.js',
    'shared/link/link_ui.js', 'shared/link/link_chat.js',
    'hub/link/hub_link.js', 'hub/link/hub_sync.js', 'shared/link/hub_mesh.js',
    'hub/link/hub_meshlog.js', 'hub/link/hub_meshlink.js', 'hub/link/hub_line.js',
    'hub/link/hub_trust.js', 'hub/link/hub_linkstate.js',
    'desktop/controller/hub-controller.js', 'shared/link/link_scan.js',
    'desktop/link/hub_remote.js', 'desktop/link/hub_pointer.js', 'desktop/link/hub_receive.js',
    'desktop/notify/hub_notify.js', 'hub/core/hub_dnd.js', 'hub/core/hub_attention.js',
    'hub/core/hub_titlebar.js', 'desktop/gamebar/hub-gamebar.js'
  ];
  for (const f of need) assert.ok(block.includes("'" + f + "'"), f + ' in connect batch');
  assert.ok(block.indexOf("'hub/core/hub_titlebar.js'") < block.indexOf("'desktop/gamebar/hub-gamebar.js'"));
  const live = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(live.includes('document.write'), false);
  assert.equal(live.includes('HubCore.load'), false);
});

test('H174: menu batch has hub.js, flyout, catalog; live wallpaper only for live: ids', () => {
  const src = read('hub/core/hub_loader.js');
  const iMenu = src.indexOf('menu:');
  const iConn = src.indexOf('connect:');
  const block = src.slice(iMenu, iConn);
  for (const f of [
    'hub/core/hub.js', 'desktop/menu/hub_flyout.js', 'hub/core/hub_catalog.js',
    'hub/core/hub_appindex.js', 'shared/vendor/qrcode.js', 'desktop/menu/hub_settings.js',
    'desktop/wm/wm_workspaces.js'
  ]) assert.ok(block.includes("'" + f + "'"), f + ' in menu batch');
  assert.match(src, /indexOf\('live:'\) === 0\) files\.push\('hub\/drives\/hub_live_wallpaper\.js'\)/);
  assert.match(src, /wallpaper: \['shared\/wallpaper\/wallpapers\.js', 'hub\/drives\/hub_wallpapers\.js'\]/);
  assert.equal(/wallpaper:\s*\[[^\]]*hub_live_wallpaper/.test(src), false, 'live engine is not always in the wallpaper batch');
});

test('H174: splash min is 5000 ms and isReady does not wait on restore', () => {
  const S = require('../core/hub_splash.js');
  assert.equal(S.SHOW_MIN_MS, 5000);
  // (before H178) isReady(coreReady, restored, total) was true as soon as coreReady was true:
  // assert.equal(S.isReady(false, 0, 0), false);
  // assert.equal(S.isReady(true, 0, 0), true);
  // assert.equal(S.isReady(true, 0, 5), true);
  // assert.equal(S.isReady(true, 2, 5), true);
  // H178: isReady(coreReady, menuReady, fallbackReady) — all three required; restore is not an argument.
  assert.equal(S.isReady(false, true, true), false);
  assert.equal(S.isReady(true, true, true), true);
  assert.equal(S.isReady(true, false, true), false);
  assert.equal(S.isReady(true, true, false), false);
  assert.equal(S.canDismiss(4999, true), false);
  assert.equal(S.canDismiss(5000, true), true);
  const src = read('hub/core/hub_splash.js');
  assert.match(src, /onStage1Ready/);
  assert.match(src, /onMenuReady/);
  assert.match(src, /\/\/ const SHOW_MIN_MS = 3000;/);
});

test('H174: service worker register is deferred (HubUpdate.register, not at parse)', () => {
  const src = read('hub/update/hub_update.js');
  assert.match(src, /function registerWorker\(/);
  assert.match(src, /register: registerWorker/);
  assert.match(src, /\/\/ \(before H174\) registered sw\.js at parse/);
  // the live register() call is inside registerWorker, not at parse
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // no bare register at top-level besides the function body and registerWorker itself
  assert.match(stripped, /navigator\.serviceWorker\.register\('sw\.js'/);
  assert.ok(stripped.indexOf("navigator.serviceWorker.register('sw.js'") > stripped.indexOf('function registerWorker'));
  const loader = read('hub/core/hub_loader.js');
  assert.match(loader, /HubUpdate\.register/);
  const html = read('desktop/desktop.html');
  const scripts = realTags(html, /<script\s+src="([^"?]+)(?:\?[^"]*)?"\s*>/);
  assert.equal(scripts.includes('hub/update/hub_update.js'), false);
});

test('H174: Start before the menu is in shows Loading menu… and calls HubLoader.need', () => {
  const src = read('desktop/wm/wm_taskbar.js');
  assert.match(src, /Loading menu\u2026|Loading menu…/);
  assert.match(src, /HubLoader\.need\('menu'\)/);
  assert.match(src, /showMenuLoading/);
  assert.match(src, /requestStart/);
  const hub = read('hub/core/hub.js');
  assert.match(hub, /window\.__hubOpenStartMenu/);
  assert.match(hub, /Do not start without HubStartList/);
});

test('H174: wallpaper photo is not painted in stage-1 apply(); applyWallpaper waits for the batch', () => {
  const prefs = read('hub/core/hub_prefs.js');
  assert.match(prefs, /function paintFallback\(/);
  assert.match(prefs, /function applyWallpaper\(/);
  assert.match(prefs, /NIGHT_BG/);
  assert.match(prefs, /if \(window\.hubWallpaper\) applyWallpaper\(\);\s*else paintFallback\(\);/s);
  assert.match(prefs, /applyWallpaper, BAR, barOn/);
  assert.match(prefs, /\(before H174\) if \(empty && window\.hubWallpaper\)/);
  const loader = read('hub/core/hub_loader.js');
  assert.match(loader, /HubPrefs\.applyWallpaper/);
});

test('H174: https catalog uses the inlined SITES_CSV first; no cache:no-cache on the critical path', () => {
  const src = read('desktop/menu/hub_flyout.js');
  const check = src.slice(src.indexOf('function check(cat)'), src.indexOf('function refreshCat('));
  const liveCheck = check.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(liveCheck, /built != null\) \? Promise\.resolve\(built\)/);
  assert.equal(liveCheck.includes("cache: 'no-cache'"), false);
  assert.equal(liveCheck.includes('cache:"no-cache"'), false);
  assert.match(src, /function refreshCat\(/);
  assert.match(src, /\(before H174\) https used fetch/);
  // background refresh may fetch, but check() itself does not use no-cache
  const html = read('desktop/desktop.html');
  assert.equal(realTags(html, /<script\s+src="([^"?]+)(?:\?[^"]*)?"\s*>/).includes('desktop/menu/hub_flyout.js'), false);
});
