'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const SC = require('../core/sim.js'), G = require('../core/growth.js');
const root = path.resolve(__dirname, '../../../..');
test('night power conserves battery energy and never exceeds capacity', () => {
  const s = SC.create(); s.time = SC.D.DAY * .8;
  s.buildings.filter(b => b.type === 'battery').forEach(b => { b.charge = 500; });
  SC.networks(s, 1); assert.equal(s.power.charge, 1000 - s.power.served);
  s.time = 0; for (let i = 0; i < 200; i++) SC.networks(s, 1);
  assert.equal(s.power.charge, s.power.capacity);
});
test('construction cost is paid once even with competing settlers', () => {
  const s = SC.create(); s.buildings = s.buildings.filter(b => !['mine', 'drill', 'farm'].includes(b.type));
  const before = SC.totals(s).ore, b = SC.place(s, 'solar', 17, 15); SC.advance(s, 100);
  assert.equal(b.ready, true); assert.equal(SC.totals(s).ore, before - SC.D.buildings.solar.cost.ore);
});
test('save validation rejects malformed stocks, paths, needs and research', () => {
  const mutations = [s => { s.buildings[0].stock.water = 'nan'; }, s => { s.colonists[0].air = null; },
    s => { s.colonists[0].path = [{ x: -1, y: 0 }]; }, s => { s.research.active = 'missing'; },
    s => { s.buildings[0].oxygen = 1000; }, s => { s.terrain[0] = 'void'; }];
  for (const mutate of mutations) { const s = SC.create(); mutate(s); assert.throws(() => SC.load(SC.save(s))); }
});
test('save/load preserves cargo in flight and pending repairs', () => {
  const s = SC.create(); SC.place(s, 'dome', 17, 15);
  for (let i = 0; i < 80 && !s.colonists.some(c => c.cargo); i++) SC.step(s);
  assert.ok(s.colonists.some(c => c.cargo)); G.trigger(s, 'meteor');
  const copy = SC.load(SC.save(s)); SC.advance(s, 150); SC.advance(copy, 150); assert.deepEqual(copy, s);
});
test('all four events occur through the seeded event scheduler', () => {
  const s = require('./autoplay.cjs').run(30, 21);
  const text = s.alerts.map(a => a.text).join(' ');
  assert.ok(s.stats.lost === 0); assert.ok(text.includes('Dust front')); assert.ok(text.includes('Meteor impact'));
  assert.ok(text.includes('equipment fault')); assert.ok(text.includes('spore illness'));
});
test('catalog uses six columns, short description, Windowed and 128px icon', () => {
  const csv = fs.readFileSync(path.join(root, 'apps/games/games-apps.csv'), 'utf8');
  const row = csv.split('\n').find(l => l.startsWith('Star Colony,')); const cells = row.split(',').map(s => s.trim());
  assert.equal(cells.length, 6); assert.ok(cells[5].length < 90); assert.equal(cells[3], '');
  const png = fs.readFileSync(path.join(__dirname, '../star-colony_icon.png')); assert.equal(png.readUInt32BE(16), 128); assert.equal(png.readUInt32BE(20), 128);
  const repo = root;
  const context = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(repo, 'hub/core/hub_appindex.js'), 'utf8'), context);
  assert.equal(context.window.HUB_APP_INDEX['star-colony'][4], 0);
  vm.runInNewContext(fs.readFileSync(path.join(repo, 'hub/core/hub_catalog.js'), 'utf8'), context);
  assert.ok(context.window.SITES_CSV.Games.includes(row));
});
