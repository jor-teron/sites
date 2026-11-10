'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const SC = require('../core/sim.js');
const D = SC.D;
function finite(v) { if (typeof v === 'number') assert.ok(Number.isFinite(v)); if (v && typeof v === 'object') Object.values(v).forEach(finite); }
test('seeded map; 3 settlers; physical initial stock', () => {
  const a = SC.create(7), b = SC.create(7); assert.deepEqual(a, b);
  assert.equal(a.terrain.length, 1536); assert.equal(a.colonists.length, 3); assert.equal(SC.totals(a).ore, 100);
  for (const k of ['rock', 'ice', 'ore', 'regolith']) assert.ok(a.terrain.includes(k));
});
test('A* avoids obstacles and reports an unreachable target', () => {
  const s = SC.create(); s.terrain.fill('regolith'); s.terrain[3 * s.w + 3] = 'rock';
  const p = SC.findPath(s, { x: 2, y: 3 }, { x: 4, y: 3 }); assert.equal(p.length, 4);
  assert.ok(p.every(n => s.terrain[n.y * s.w + n.x] !== 'rock'));
  assert.equal(SC.findPath(s, { x: 2, y: 3 }, { x: 3, y: 3 }), null);
});
test('solar only by day; batteries discharge by night; disconnected loads unpowered', () => {
  const s = SC.create(); SC.networks(s, 1); assert.equal(s.power.made, 32);
  const b = SC.addBuilding(s, 'farm', 3, 3, true); SC.networks(s, 1); assert.equal(b.powered, false);
  s.time = D.DAY * .8; const before = s.buildings.find(b => b.type === 'battery').charge;
  SC.networks(s, 1); assert.equal(s.power.made, 0); assert.ok(s.buildings.find(b => b.type === 'battery').charge < before);
});
test('oxygen needs a connected powered generator and stored water', () => {
  const s = SC.create(), dome = s.buildings.find(b => b.type === 'dome'); dome.oxygen = 20;
  SC.networks(s, 1); assert.ok(dome.oxygen > 20);
  s.buildings.filter(b => b.type === 'storage').forEach(b => { b.stock.water = 0; });
  const before = dome.oxygen; SC.networks(s, 1); assert.ok(dome.oxygen < before);
  const isolated = SC.addBuilding(s, 'dome', 2, 2, true); isolated.oxygen = 20;
  SC.networks(s, 1); assert.ok(isolated.oxygen < 20);
});
test('jobs physically haul before construction, and output gets hauled into storage', () => {
  const s = SC.create(), start = SC.totals(s).ore;
  const b = SC.place(s, 'solar', 17, 15); assert.equal(b.ready, false); assert.equal(SC.totals(s).ore, start);
  SC.advance(s, 100); assert.equal(b.ready, true); assert.equal(b.delivered, true); assert.ok(s.stats.built >= 1); assert.ok(s.stats.water > 0);
  assert.ok(s.colonists.some(c => c.x !== 18 || c.y !== 15)); finite(s);
});
test('placement constraints and invalid inputs', () => {
  const s = SC.create(); assert.equal(typeof SC.place(s, 'drill', 17, 15), 'string');
  assert.equal(typeof SC.place(s, 'dome', -1, 0), 'string'); assert.equal(typeof SC.place(s, 'nope', 4, 4), 'string');
  assert.equal(typeof SC.place(s, 'solar', 18, 15), 'string');
});
test('needs recover in a dome; missing oxygen and food eventually kills settlers', () => {
  const s = SC.create(), c = s.colonists[0]; c.air = 15; c.rest = 15;
  SC.advance(s, 50); assert.ok(c.air > 70); assert.ok(c.rest > 70);
  const doomed = SC.create(); doomed.buildings = []; doomed.colonists.forEach(c => { c.air = 0; c.food = 0; });
  SC.advance(doomed, 150); assert.equal(doomed.over, true); assert.equal(doomed.stats.lost, 3);
});
test('save/load round trip and deterministic continuation; malformed saves rejected', () => {
  const s = SC.create(); SC.advance(s, 12); const copy = SC.load(SC.save(s)); assert.deepEqual(copy, s);
  SC.advance(copy, 100); SC.advance(s, 100); assert.deepEqual(copy, s);
  assert.throws(() => SC.load('{}')); assert.throws(() => SC.load('null'));
});
test('20-day steady-state endurance: no NaN, deaths, stalls or unbounded jobs', () => {
  const s = SC.create(); SC.place(s, 'solar', 17, 15);
  for (let day = 0; day < 20; day++) {
    SC.advance(s, D.DAY); finite(s); assert.equal(s.colonists.length, 3, 'day ' + (day + 1));
    assert.ok(SC.totals(s).food > 0); assert.ok(SC.totals(s).water > 0); assert.ok(s.jobs.length < 30);
  }
  assert.equal(s.time, D.DAY * 20); assert.ok(s.stats.food > 150); assert.ok(s.stats.built > 0);
  console.log('SC-1a endurance:', JSON.stringify({ days: s.time / D.DAY, settlers: s.colonists.length, resources: SC.totals(s), jobs: s.jobs.length, production: s.stats }));
});
