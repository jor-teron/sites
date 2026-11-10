/* Ant Farm core tests. Run: node apps/games/ant-farm/test/colony.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const ctx = {
  window: {}, console: console,
  Uint8Array: Uint8Array, Float32Array: Float32Array,
  Int16Array: Int16Array, Int32Array: Int32Array, Math: Math
};
ctx.window = ctx;
vm.createContext(ctx);
function load(rel) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx, { filename: rel });
}
load('core/world.js');
load('core/colony.js');
const AF = ctx.AF;
if (!AF || !AF.newWorld) throw new Error('AF failed to load');

function snap(w) {
  var i, ph = 0, wet = 0;
  for (i = 0; i < w.ph.length; i++) { if (w.ph[i] > 0.01) ph++; if (w.wet[i] > 0.01) wet++; }
  return {
    ants: w.ants.length, dug: w.dug, stored: +w.stored.toFixed(4),
    brood: w.brood.length, rooms: w.rooms.length, t: +w.t.toFixed(4),
    food: w.food.map(function (f) { return f.x + ':' + f.amt; }).join(','),
    roles: w.ants.map(function (a) { return a.role; }).join(''),
    pos: w.ants.map(function (a) { return a.cx + ',' + a.cy; }).join(';'),
    ph: ph, wet: wet, tips: w.tips.length
  };
}
function run(seed, seconds) {
  var w = AF.newWorld(seed);
  AF.seedColony(w);
  var dt = 1 / 30;
  for (var t = 0; t < seconds; t += dt) AF.step(w, dt);
  return w;
}

var fail = 0;
function eq(name, a, b) {
  var sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) { console.log('FAIL', name, '\n A', sa, '\n B', sb); fail++; }
  else console.log('ok  ', name);
}
function ok(name, cond, extra) {
  if (!cond) { console.log('FAIL', name, extra || ''); fail++; }
  else console.log('ok  ', name);
}

var a = run(11111, 0), b = run(11111, 0);
eq('same seed, same start', snap(a), snap(b));
ok('start has 12 ants', a.ants.length === 12, a.ants.length);
ok('queen and brood rooms exist', a.rooms.some(function (r) { return r.kind === 'queen'; }) && a.rooms.some(function (r) { return r.kind === 'brood'; }));

a = run(11111, 30); b = run(11111, 30);
eq('same seed, same after 30s', snap(a), snap(b));

a = run(22222, 30); b = run(11111, 30);
ok('different seeds diverge', JSON.stringify(snap(a)) !== JSON.stringify(snap(b)));

var c = run(11111, 5);
ok('clock advanced', c.t >= 5 && c.t < 5.1, c.t);
ok('dayPhase is in [0,1)', AF.dayPhase(c) >= 0 && AF.dayPhase(c) < 1, AF.dayPhase(c));

// AF-4b: wet soil dries; splash ticks down
var wet = run(11111, 1);
AF.dropWater(wet, 80);
for (var tw = 0; tw < 2 && !(wet.splash && wet.splash.t > 0); tw += 1 / 30) AF.step(wet, 1 / 30);
ok('splash starts after a drop', !!(wet.splash && wet.splash.t > 0.3), wet.splash);
var soaked = 0, i;
for (i = 0; i < wet.wet.length; i++) if (wet.wet[i] > 0.05) soaked++;
ok('water soaks the soil', soaked > 10, soaked);
var sum0 = 0, sum1 = 0;
for (i = 0; i < wet.wet.length; i++) sum0 += wet.wet[i];
for (var t2 = 0; t2 < 80; t2 += 1 / 30) AF.step(wet, 1 / 30);
for (i = 0; i < wet.wet.length; i++) sum1 += wet.wet[i];
ok('wet soil dries over time', sum1 < sum0 * 0.7, 'before=' + sum0.toFixed(2) + ' after=' + sum1.toFixed(2));
ok('splash expires', !wet.splash, wet.splash);

var d1 = run(11111, 90), d2 = run(11111, 90);
eq('same seed, same after 90s (with drying)', snap(d1), snap(d2));

if (fail) { console.log('\n' + fail + ' failed'); process.exit(1); }
console.log('\nAll checks passed.');
