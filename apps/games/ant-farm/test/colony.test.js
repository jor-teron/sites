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
load('core/save.js');
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

// AF-4c save / resume, dig tool, and economy growth
var g1 = run(11111, 40);
var midDig = g1.ants.filter(function (a) { return a.tip; }).length;
var data = AF.serialize(g1);
var g2 = AF.deserialize(JSON.parse(JSON.stringify(data)));
ok('deserialize restores ants and clock', g2 && g2.ants.length === g1.ants.length && Math.abs(g2.t - g1.t) < 0.05, g2 && [g2.ants.length, g2.t]);
ok('deserialize restores stored food and grid', g2 && Math.abs(g2.stored - g1.stored) < 0.05 && g2.g.length === g1.g.length);
if (midDig) {
  ok('mid-dig tip is re-linked to the live job', g2.ants.some(function (a) { return a.tip && g2.tips.indexOf(a.tip) >= 0; }), midDig);
}
var busy = g1.tips.filter(function (t) { return t.busy; }).length;
eq('busy dig jobs restored', busy, g2.tips.filter(function (t) { return t.busy; }).length);
// fields() is rebuilt on load; recompute the live copy so both continue from the same distances
AF.fields(g1); g1.needField = false;
for (var ts = 0; ts < 60; ts += 1 / 30) { AF.step(g1, 1 / 30); AF.step(g2, 1 / 30); }
eq('saved colony continues identically', snap(g1), snap(g2));

var dug0 = g1.dug, nextTo = null, x, y, isolated = false;
for (y = AF.SURF; y < AF.H - 1 && !nextTo; y++) for (x = 1; x < AF.W - 1 && !nextTo; x++) {
  if (g1.g[y * AF.W + x] === 1 && (AF.walk(g1, x - 1, y) || AF.walk(g1, x + 1, y) || AF.walk(g1, x, y - 1) || AF.walk(g1, x, y + 1))) nextTo = [x, y];
}
ok('player can dig soil next to a tunnel', !!(nextTo && AF.playerDig(g1, nextTo[0], nextTo[1]) && g1.dug === dug0 + 1 && g1.g[nextTo[1] * AF.W + nextTo[0]] === 0), nextTo);
for (y = AF.H - 8; y < AF.H - 1 && !isolated; y++) for (x = 2; x < AF.W - 2 && !isolated; x++) {
  if (g1.g[y * AF.W + x] === 1 && !AF.walk(g1, x - 1, y) && !AF.walk(g1, x + 1, y) && !AF.walk(g1, x, y - 1) && !AF.walk(g1, x, y + 1)) isolated = AF.playerDig(g1, x, y) === false;
}
ok('player cannot dig soil that is not next to a tunnel', isolated);

function mark(seed) {
  var w = AF.newWorld(seed); AF.seedColony(w); var dt = 1 / 30, out = {}, m, t;
  for (t = 0; t < 1800; t += dt) {
    AF.step(w, dt);
    for (m of [180, 600, 1800]) if (!out[m] && w.t >= m) out[m] = { ants: w.ants.length, stored: +w.stored.toFixed(1), brood: w.brood.length };
  }
  return out;
}
var growth = mark(11111);
console.log('growth seed 11111', JSON.stringify(growth));
ok('population rises 3 -> 10 min', growth[180].ants < growth[600].ants, growth);
ok('population rises 10 -> 30 min', growth[600].ants < growth[1800].ants, growth);
ok('colony is growing toward the cap at 30 min', growth[1800].ants >= 180 && growth[1800].ants <= 300, growth[1800]);
ok('stored food is not empty at 10 min', growth[600].stored > 0, growth[600]);

if (fail) { console.log('\n' + fail + ' failed'); process.exit(1); }
console.log('\nAll checks passed.');
