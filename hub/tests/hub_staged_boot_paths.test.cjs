'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function realTags(html, re) {
  const out = [];
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
  let m;
  const r = new RegExp(re, 'g');
  while ((m = r.exec(stripped))) out.push(m[1] || m[0]);
  return out;
}

test('H175: Glass / XP CSS are not always-on stage-1 tags; the early script reads the same prefs keys', () => {
  const html = read('desktop/desktop.html');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  const css = realTags(html, /<link\s+rel="stylesheet"\s+href="([^"?]+)(?:\?[^"]*)?"\s*\/>/);
  assert.equal(css.includes('hub/core/hub_glass.css'), false);
  assert.equal(css.includes('hub/core/hub_xp.css'), false);
  assert.match(html, /\(before H175\) <link rel="stylesheet" href="hub\/core\/hub_glass\.css"/);
  assert.match(html, /\(before H175\) <link rel="stylesheet" href="hub\/core\/hub_xp\.css"/);
  assert.match(live, /sites-hub\.theme/);
  assert.match(live, /sites-hub\.xp/);
  assert.match(live, /sites-hub\.glass/);
  assert.match(live, /document\.write\('<link rel="stylesheet"/);
  assert.match(live, /hub\/core\/hub_xp\.css/);
  assert.match(live, /hub\/core\/hub_glass\.css/);
  const loader = read('hub/core/hub_loader.js');
  assert.match(loader, /glass:\s*\['hub\/core\/hub_glass\.css'\]/);
  assert.match(loader, /xp:\s*\['hub\/core\/hub_xp\.css'\]/);
  assert.match(loader, /function ensure\(/);
  const prefs = read('hub/core/hub_prefs.js');
  assert.match(prefs, /HubLoader\.ensure\('xp'\)/);
  assert.match(prefs, /HubLoader\.ensure\('glass'\)/);
});

test('H175: lock CSS/JS load only when enabled; lock-on still hides the desk before first paint', () => {
  const html = read('desktop/desktop.html');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  const css = realTags(html, /<link\s+rel="stylesheet"\s+href="([^"?]+)(?:\?[^"]*)?"\s*\/>/);
  const scripts = realTags(html, /<script\s+src="([^"?]+)(?:\?[^"]*)?"\s*>/);
  assert.equal(css.includes('hub/core/hub_lock.css'), false);
  assert.equal(scripts.includes('hub/core/hub_lock.js'), false);
  assert.equal(scripts.includes('hub/core/hub_lock_core.js'), false);
  assert.match(live, /html\.hub-locked>body(?:,html\.hub-break-pending>body)?\{visibility:hidden!important\}/);
  assert.match(live, /hub-lock\.on/);
  assert.match(live, /hub-lock\.pin/);
  assert.match(live, /__hubLockBoot/);
  assert.match(live, /hub\/core\/hub_lock\.css/);
  assert.match(live, /js\('hub\/core\/hub_lock_core\.js'\)/);
  assert.match(live, /js\('hub\/core\/hub_lock\.js'\)/);
  const loader = read('hub/core/hub_loader.js');
  assert.match(loader, /lock:\s*\[[^\]]*'hub\/core\/hub_lock\.css'/s);
  assert.match(loader, /ensure\('lock'\)/);
  const lock = read('hub/core/hub_lock.js');
  assert.match(lock, /__hubLockBoot/);
  assert.match(lock, /\/\/ \(before H175\) if \(store\.isOn\(\)\) lock\(\);/);
});

test('H175: break and eye files load only when those off-by-default features are on', () => {
  const html = read('desktop/desktop.html');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  const css = realTags(html, /<link\s+rel="stylesheet"\s+href="([^"?]+)(?:\?[^"]*)?"\s*\/>/);
  const scripts = realTags(html, /<script\s+src="([^"?]+)(?:\?[^"]*)?"\s*>/);
  assert.equal(css.includes('hub/core/hub_break.css'), false);
  assert.equal(scripts.includes('hub/core/hub_break.js'), false);
  assert.equal(scripts.includes('hub/core/hub_eye.js'), false);
  assert.match(html, /\(before H175\) <script src="hub\/core\/hub_break\.js"/);
  assert.match(html, /\(before H175\) <script src="hub\/core\/hub_eye\.js"/);
  assert.match(live, /sites-hub\.breakOn/);
  assert.match(live, /hub-break\.breakEnd/);
  assert.match(live, /hub-break-pending/);
  assert.match(live, /sites-hub\.eyeMode/);
  const loader = read('hub/core/hub_loader.js');
  assert.match(loader, /break:\s*\['hub\/core\/hub_break\.css', 'hub\/core\/hub_break\.js'\]/);
  assert.match(loader, /eye:\s*\['hub\/core\/hub_eye\.js'\]/);
  const prefs = read('hub/core/hub_prefs.js');
  assert.match(prefs, /HubLoader\.ensure\('eye'\)/);
  assert.match(prefs, /HubLoader\.ensure\('break'\)/);
  const br = read('hub/core/hub_break.js');
  assert.match(br, /hub-break-pending/);
});

test('H175: live: wallpaper paints a static colour first; the engine stays in the last batch and only for live ids', () => {
  const prefs = read('hub/core/hub_prefs.js');
  assert.match(prefs, /LIVE_STATIC/);
  assert.match(prefs, /function liveStaticOf\(/);
  assert.match(prefs, /'live:aurora'/);
  assert.match(prefs, /paintFallback/);
  assert.match(prefs, /isLive && !window\.HubLiveWallpaper/);
  const loader = read('hub/core/hub_loader.js');
  assert.match(loader, /indexOf\('live:'\) === 0\) files\.push\('hub\/drives\/hub_live_wallpaper\.js'\)/);
  assert.equal(/wallpaper:\s*\[[^\]]*hub_live_wallpaper/.test(loader), false);
});

test('H175: Start menu icons use data-src until Start is opened the first time', () => {
  const src = read('hub/core/hub.js');
  assert.match(src, /function menuIcon\(/);
  assert.match(src, /function fillMenuIcons\(/);
  assert.match(src, /data-src/);
  assert.match(src, /fillMenuIcons\(\)/);
  assert.match(src, /\/\/ \(before H175\) cimg\.src = iconPathFor\(CAT_PAGES\[cat\]\);/);
  assert.match(src, /\/\/ \(before H175\) img\.src = iconFor\(app\);/);
  assert.match(src, /menuIcon\(cimg,/);
  assert.match(src, /menuIcon\(img,/);
});

test('H175: hub_perf.js splash fallback is 5000 ms (old 3000 kept as a comment)', () => {
  const src = read('hub/core/hub_perf.js');
  assert.match(src, /\|\| 5000/);
  assert.match(src, /\/\/ const splashMin = \(global\.HubSplash && global\.HubSplash\.SHOW_MIN_MS\) \|\| 3000; {3}\(before H175\)/);
  const live = src.replace(/^\s*\/\/.*$/gm, '');
  assert.equal(live.includes('|| 3000'), false);
});
