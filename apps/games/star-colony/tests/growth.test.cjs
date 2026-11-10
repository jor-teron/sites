'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const SC = require('../core/sim.js'), G = require('../core/growth.js'), D = SC.D;
function finite(v) { if (typeof v === 'number') assert.ok(Number.isFinite(v)); if (v && typeof v === 'object') Object.values(v).forEach(finite); }
test('warn before events; storm reduces solar; meteor and failure queue repairs', () => {
  const s = SC.create(); G.warn(s, 'storm'); assert.ok(s.events.warning.at > s.time); assert.equal(s.events.stormUntil, 0);
  SC.advance(s, 19); assert.ok(s.events.stormUntil > s.time); assert.ok(s.power.made < 32);
  G.trigger(s, 'meteor'); G.trigger(s, 'failure'); SC.advance(s, 1); assert.ok(s.jobs.some(j => j.kind === 'repair'));
  SC.advance(s, 150); assert.ok(s.buildings.every(b => b.health > 0)); finite(s);
});
test('illness slows work; powered medical care cures illness and improves health', () => {
  const s = SC.create(), c = s.colonists[0]; c.illness = 200; c.health = 60;
  assert.ok(G.workSpeed(s, c, 'build') < 1);
  const med = SC.addBuilding(s, 'medbay', 17, 15, true); SC.networks(s, D.STEP); assert.ok(med.powered);
  SC.advance(s, 40); assert.equal(c.illness, 0); assert.ok(c.health > 60);
});
test('skills grow through use and improve speed', () => {
  const s = SC.create(), c = s.colonists[0]; const before = G.workSpeed(s, c, 'build');
  G.skill(c, 'build', 100); assert.ok(G.workSpeed(s, c, 'build') > before);
  SC.place(s, 'solar', 17, 15); SC.advance(s, 80); assert.ok(s.colonists.some(c => c.skills.build > 0));
});
test('research prerequisites, powered Lab work and solar upgrade', () => {
  const s = SC.create(); assert.equal(G.selectResearch(s, 'medbay'), false); assert.ok(G.selectResearch(s, 'solar'));
  SC.addBuilding(s, 'lab', 17, 15, true); SC.advance(s, 130);
  assert.ok(s.research.done.includes('solar')); assert.equal(G.solar(s), 1.35); assert.ok(G.selectResearch(s, 'recycle'));
  assert.equal(typeof SC.place(s, 'medbay', 17, 16), 'string');
});
test('supply ship choice and housing capacity; cannot claim twice', () => {
  const s = SC.create(); s.ship.waiting = true; const ore = SC.totals(s).ore;
  assert.ok(G.chooseSupply(s, 'materials')); assert.equal(s.colonists.length, 5); assert.equal(SC.totals(s).ore, ore + 55);
  assert.equal(G.chooseSupply(s, 'materials'), false);
  s.ship.waiting = true; G.chooseSupply(s, 'water'); assert.equal(s.colonists.length, 5);
});
test('drone physically hauls buffered production', () => {
  const s = SC.create(); const port = SC.addBuilding(s, 'droneport', 17, 15, true);
  s.colonists.forEach(c => { c.rest = 1; c.air = 1; });
  const mine = s.buildings.find(b => b.type === 'mine'); mine.output.ore = 11;
  const before = SC.totals(s).ore; SC.advance(s, 15);
  assert.equal(s.drones.length, 1); assert.equal(s.drones[0].port, port.id); assert.ok(SC.totals(s).ore >= before + 11);
});
test('event/research/skills/ship state round-trips deterministically', () => {
  const s = SC.create(); G.warn(s, 'meteor'); G.selectResearch(s, 'solar'); SC.advance(s, 10);
  const b = SC.load(SC.save(s)); SC.advance(s, 30); SC.advance(b, 30); assert.deepEqual(s, b);
});
test('old SC-1a saves upgrade safely', () => {
  const s = SC.create(); delete s.research; delete s.events; delete s.ship; delete s.goals; delete s.drones;
  const loaded = SC.load(SC.save(s)); assert.deepEqual(loaded.research.done, []); SC.advance(loaded, 1); finite(loaded);
});
test('all-research milestone and full-colony loss summary data', () => {
  const s = SC.create(); s.research.done = Object.keys(G.tree); SC.step(s); assert.equal(s.goals.research, true);
  s.buildings = []; s.colonists.forEach(c => { c.air = 0; c.food = 0; c.health = 1; }); SC.advance(s, 10);
  assert.equal(s.over, true); assert.equal(s.stats.lost, 3); assert.ok(s.alerts.some(a => a.type === 'danger'));
});

test('30-day legal build order: 21 settlers, all research, milestones and no deaths', () => {
  const s = require('./autoplay.cjs').run(30);
  assert.equal(s.time, D.DAY * 30); assert.equal(s.stats.lost, 0); assert.equal(s.colonists.length, 21);
  assert.equal(s.research.done.length, 5); assert.ok(s.goals.ten && s.goals.twenty && s.goals.sufficient && s.goals.research);
  assert.ok(s.jobs.length < 40); assert.ok(s.drones.length > 0); finite(s);
  console.log('SC-1b endurance: 30 days / 21 settlers / 0 deaths / 5 discoveries / 4 milestones / finite state');
});
