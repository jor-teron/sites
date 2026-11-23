'use strict';
// H176: first-install SHELL is the Desktop shell only; dropped files cache on first open via hub-rt-1.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function liveShell(sw) {
  const i = sw.indexOf('const SHELL = [');
  const j = sw.indexOf('];', i);
  assert.ok(i !== -1 && j > i, 'SHELL array is present');
  const block = sw.slice(i, j + 2).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return Array.from(block.matchAll(/'([^']+)'/g), (m) => m[1]);
}

const SHELL_GZIP_CAP = 800 * 1024;   // measured ~715 KB gzip-6 after the H176 cut; leave headroom

test('H176: every live SHELL entry exists, with no duplicates, under the gzip cap', () => {
  const sw = read('hub/update/hub_sw.js');
  const listed = liveShell(sw);
  assert.ok(listed.length >= 1);
  assert.equal(new Set(listed).size, listed.length, 'no duplicate SHELL entries');
  let raw = 0, gz = 0;
  for (const p of listed) {
    const fp = path.join(ROOT, p);
    assert.equal(fs.existsSync(fp), true, p + ' exists');
    const st = fs.statSync(fp);
    const data = st.isFile() ? fs.readFileSync(fp) : Buffer.alloc(0);
    raw += data.length;
    gz += zlib.gzipSync(data, { level: 6, mtime: 0 }).length;
  }
  assert.ok(gz <= SHELL_GZIP_CAP, 'SHELL gzip-6 ' + gz + ' must be <= cap ' + SHELL_GZIP_CAP);
});

test('H176: first-install SHELL excludes Terminal wasm, jsQR copies, Phone, Learn shells, wallpaper photos', () => {
  const listed = liveShell(read('hub/update/hub_sw.js'));
  const set = new Set(listed);
  const banned = [
    'apps/system/terminal/bin/busybox.wasm',
    'apps/system/terminal/bin/busybox.js',
    'hub/controller/vendor/jsQR.js',
    'phone/vendor/jsQR.js',
    'phone.html',
    'phone/',
    'apps/learn/dictionary/index.html',
    'apps/learn/dictionary/dictionary.html',
    'apps/learn/blood-group/index.html',
    'apps/learn/blood-group/blood-group.html',
    'shared/wallpaper/hub_hills.jpg',
    'shared/wallpaper/thumbs/hub_hills.webp'
  ];
  for (const p of banned) assert.equal(set.has(p), false, p + ' must not be in live SHELL');
  assert.equal(listed.some((p) => p === 'phone.html' || p.startsWith('phone/')), false, 'no phone/ tree in SHELL');
  assert.equal(listed.some((p) => p.includes('busybox')), false, 'no busybox in SHELL');
  assert.equal(listed.some((p) => /jsQR/.test(p)), false, 'no jsQR in SHELL');
  assert.equal(listed.some((p) => p.startsWith('apps/learn/dictionary/') && !p.endsWith('_icon.png')), false);
  assert.equal(listed.some((p) => p.startsWith('apps/learn/blood-group/') && !p.endsWith('_icon.png')), false);
  assert.equal(listed.some((p) => /hub_hills/.test(p)), false);
  // Start icons for those apps remain
  assert.ok(set.has('apps/learn/dictionary/dictionary_icon.png'));
  assert.ok(set.has('apps/learn/blood-group/blood-group_icon.png'));
});

test('H176: PeerJS is the local vendor file, in SHELL, with unpkg kept as a comment / fallback', () => {
  const core = read('shared/link/link_core.js');
  const live = core.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(core, /\/\/ \(before H176\) var PEERJS_URL = 'https:\/\/unpkg\.com\/peerjs@1\.5\.4\/dist\/peerjs\.min\.js';/);
  assert.match(live, /shared\/vendor\/peerjs\.min\.js/);
  assert.match(live, /PEERJS_UNPKG/);
  assert.match(live, /unpkg\.com\/peerjs@1\.5\.4/);
  assert.equal(/var PEERJS_URL = 'https:\/\/unpkg\.com/.test(live), false, 'live PEERJS_URL is not the CDN');
  const pj = read('shared/vendor/peerjs.min.js');
  assert.ok(pj.includes('"version":"1.5.4"'));
  const listed = liveShell(read('hub/update/hub_sw.js'));
  assert.ok(listed.includes('shared/vendor/peerjs.min.js'), 'connect-stage PeerJS is in SHELL');
  assert.ok(listed.includes('hub/core/hub_titlebar.js'), 'connect-batch titlebar is in SHELL');
});

test('H176: install no longer forces cache:reload; dropped same-origin GETs still go to hub-rt-1; Dictionary data stays on hub-dict-1', () => {
  const sw = read('hub/update/hub_sw.js');
  const i = sw.indexOf('function fetchShell');
  const j = sw.indexOf('function retryFailed');
  const fetchShell = sw.slice(i, j).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(fetchShell.includes("cache: 'reload'"), false, 'install fetchShell does not use cache:reload');
  assert.match(sw, /\/\/ \(before H176\) return fetch\(new Request\(abs\(p\), \{ cache: 'reload' \}\)\)/);
  // daily refresh may still bypass the HTTP cache
  const r0 = sw.indexOf('async function refreshShell');
  const refresh = sw.slice(r0, sw.indexOf('self.addEventListener(\'message\''));
  const liveRefresh = refresh.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(liveRefresh, /cache: 'reload'/);
  assert.match(sw, /const RUNTIME = 'hub-rt-1'/);
  assert.match(sw, /const DICT = 'hub-dict-1'/);
  const dict = sw.slice(sw.indexOf("path.includes('/apps/learn/dictionary/data/')"));
  const liveDict = dict.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(liveDict, /caches\.open\(DICT\)/);
  assert.match(liveDict, /put\(DICT, bare, res\)/);
  // general apps / html / js path still stores in RUNTIME
  assert.match(sw, /networkFirst\(req, RUNTIME, bare, nav\)/);
});
