// H166: ?perf=1 debug overlay — static / Node checks, no browser.
// Run: node --test hub/tests/hub_perf_overlay.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const P = require('../core/hub_perf.js');

test('H166: hub_perf.js exists and exports wantPerf / fmtMs / StallRoll', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'hub/core/hub_perf.js')), true);
  assert.equal(P.wantPerf('?perf=1'), true);
  assert.equal(P.wantPerf('perf=1'), true);
  assert.equal(P.wantPerf('?foo=1&perf=1'), true);
  assert.equal(P.wantPerf('?perf=1&x=2'), true);
  assert.equal(P.wantPerf(''), false);
  assert.equal(P.wantPerf('?foo=1'), false);
  assert.equal(P.wantPerf('?perf=0'), false);
  assert.equal(P.wantPerf('?perf=11'), false);
  assert.equal(P.wantPerf('?perform=1'), false);
  assert.equal(P.fmtMs(null), '\u2014');
  assert.equal(P.fmtMs(42), '42 ms');
  assert.equal(P.fmtMs(3120), '3.12 s');
  assert.equal(P.STALL_MS, 50);
  assert.equal(P.ROLL_MS, 10000);
});

test('H166: StallRoll counts only frames over 50 ms in a rolling window', () => {
  const r = new P.StallRoll(1000, 50);
  r.frame(0, 16);
  r.frame(16, 16);
  r.frame(100, 80);
  r.frame(200, 51);
  assert.equal(r.count(200), 2);
  assert.equal(r.longest(200), 80);
  r.frame(1300, 16); // trims the 100/200 events (window is 1 s)
  assert.equal(r.count(1300), 0);
  assert.equal(r.longest(1300), 0);
  r.frame(1310, 90);
  assert.equal(r.count(1310), 1);
  assert.equal(r.longest(1310), 90);
});

test('H166: overlay is pointer-events none and is only loaded when perf=1', () => {
  const src = read('hub/core/hub_perf.js');
  const html = read('desktop/desktop.html');
  assert.match(src, /pointer-events:\s*none/);
  assert.match(src, /id:\s*'hub-perf'|id = 'hub-perf'/);
  // Lazy load: a tiny inline check, no always-on <script src="hub/core/hub_perf.js">
  assert.match(html, /\[\?&\]\)perf=1/);
  assert.match(html, /hub_perf\.js\?v=/);
  assert.match(html, /createElement\('script'\)/);
  assert.equal(/<script[^>]*\bsrc=["']hub\/core\/hub_perf\.js/.test(html), false, 'no static script tag');
  // The load is gated on the query string, not run unconditionally
  const inline = html.match(/<script>([^<]*hub_perf\.js[^<]*)<\/script>/);
  assert.ok(inline, 'inline loader is present');
  assert.match(inline[1], /location\.search/);
  assert.match(inline[1], /perf=1/);
});

test('H166: SW SHELL lists hub_perf.js so the overlay works offline', () => {
  const sw = read('hub/update/hub_sw.js');
  const i = sw.indexOf('const SHELL = [');
  const j = sw.indexOf('];', i);
  const shell = strip(sw.slice(i, j + 2));
  assert.match(shell, /'hub\/core\/hub_perf\.js'/);
  assert.match(sw, /H166/);
});

test('H166: app-open performance marks sit on the WM iframe open/load path', () => {
  const wm = read('desktop/wm/wm_windows.js');
  const live = strip(wm);
  assert.match(wm, /\/\/ \(before H166\).*hub-wm-frame-load/);
  assert.match(live, /performance\.mark\(\s*'hub-app-open-start-'\s*\+\s*w\.id\s*\)/);
  assert.match(live, /performance\.mark\(\s*'hub-app-open-end-'\s*\+\s*w\.id\s*\)/);
  assert.match(live, /performance\.measure\(\s*'hub-app-open'/);
  // start mark is just before the iframe URL is set; end mark is on load
  const startAt = live.indexOf("performance.mark('hub-app-open-start-'");
  const srcAt = live.indexOf('frame.src = o.url');
  const endAt = live.indexOf("performance.mark('hub-app-open-end-'");
  assert.ok(startAt > 0 && srcAt > startAt, 'start mark is before frame.src');
  assert.ok(endAt > 0, 'end mark is present');
});

test('H166: boot marks are recorded by splash / desktop-started (harmless when perf is off)', () => {
  const splash = read('hub/core/hub_splash.js');
  const hub = read('hub/core/hub.js');
  assert.match(strip(splash), /performance\.mark\(\s*'hub-boot-ready'\s*\)/);
  assert.match(strip(splash), /performance\.mark\(\s*'hub-boot-shown'\s*\)/);
  assert.match(strip(hub), /performance\.mark\(\s*'hub-desktop-started'\s*\)/);
  assert.match(hub, /hub-boot-shown/);
});

test('H166: bootLines notes the splash minimum when shown is later than ready', () => {
  const lines = P.bootLines({ boot: 3120, ready: 800, shown: 3120, started: 700, splashMin: 3000 });
  assert.equal(lines[0], 'boot  3.12 s');
  assert.match(lines[1], /ready 800 ms/);
  assert.match(lines[1], /splash min 3\.00 s/);
});

test('H166: requiring the module in Node does not start an overlay or attach listeners', () => {
  assert.equal(typeof document, 'undefined');
  assert.equal(typeof P.start, 'undefined'); // start is only attached in the browser branch
  // A fresh vm with no document also stays inert
  const ctx = vm.createContext({ module: { exports: {} }, exports: {}, console, performance: { now: () => 0, getEntriesByName: () => [] } });
  vm.runInContext(read('hub/core/hub_perf.js'), ctx, { filename: 'hub_perf.js' });
  assert.equal(ctx.module.exports.wantPerf('?perf=1'), true);
  assert.equal(ctx.window, undefined);
});
