const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../core/data.js'), M = require('../core/model.js');
test('69 unique items, ten categories, seven valid templates', () => {
  assert.equal(D.items.length, 69); assert.equal(D.categories.length, 10); assert.equal(D.templates.length, 7);
  assert.equal(new Set(D.items.map(i => i.id)).size, D.items.length);
  D.items.forEach(i => assert.deepEqual(M.validateItem(i), i));
  D.templates.forEach(t => assert.deepEqual(M.validateList(t), t));
});
test('quantity-aware total, packed and category weight', () => {
  const list = M.copy(D.templates[0]); list.items[0].packed = true;
  const t = M.totals(list.items);
  assert.equal(t.grams, list.items.reduce((sum, i) => sum + i.grams * i.qty, 0));
  assert.equal(t.packed, list.items[0].grams * list.items[0].qty);
  assert.equal(t.count, 1); assert.equal(t.categories.Tools.packed, 1000);
  assert.equal(t.missing, t.essential - 1);
  assert.equal(Object.values(t.categories).reduce((n, c) => n + c.grams, 0), t.grams);
});
test('duplicate is independent and resets packed ticks', () => {
  const list = M.copy(D.templates[0]); list.items[0].packed = true;
  const next = M.duplicate(list); next.items[0].grams = 8;
  assert.equal(next.template, false); assert.equal(next.items[0].packed, false);
  assert.equal(list.items[0].grams, 1000); assert.notEqual(next.id, list.id);
});
test('localStorage round-trip and missing default recovery', () => {
  const state = M.fresh(); const copy = M.duplicate(state.lists[0]); state.lists.push(copy); state.selected = copy.id;
  assert.deepEqual(M.restore(JSON.stringify(state)), state);
  state.lists.splice(1, 1); assert.equal(M.restore(JSON.stringify(state)).lists.length, 8);
});
test('validation rejects bad quantities and unbounded input', () => {
  for (const patch of [{ qty: 0 }, { qty: 1.5 }, { grams: -1 }, { grams: Infinity }, { category: 'bad' }, { name: '' }]) {
    assert.throws(() => M.validateItem({ ...D.items[0], ...patch }));
  }
  assert.throws(() => M.restore('oops'));
  assert.throws(() => M.validateList({ ...D.templates[0], items: [D.items[0], D.items[0]] }));
});
const L = require('../core/learning.js');
test('every gear item has why and care notes; seven principles and departure checks', () => {
  D.items.forEach(i => { assert.equal(L.tips[i.id].length, 2); L.tips[i.id].forEach(t => assert(t.length > 10)); });
  assert.equal(L.lnt.length, 7); assert.equal(L.before.length, 7);
});
const plan = { days: 3, people: 3, weather: 'hot', activities: ['trekking', 'cooking'] };
const byId = (list, id) => list.items.find(i => i.id === id);
test('planner scales per-person, per-day and shared gear separately', () => {
  const list = M.planner(plan);
  assert.equal(byId(list, 'food').qty, 9); assert.equal(byId(list, 'water').qty, 36);
  assert.equal(byId(list, 'bottle').qty, 12); assert.equal(byId(list, 'tent').qty, 2); assert.equal(byId(list, 'ground').qty, 2);
  assert.equal(byId(list, 'mat').qty, 3); assert.equal(byId(list, 'pot').qty, 1);
  assert.equal(byId(list, 'fuel').qty, 3); assert.equal(byId(list, 'socks').qty, 9);
  assert.deepEqual(M.guidance(plan), { liters: 4, totalWater: 36, kcalLow: 22500, kcalHigh: 31500 });
});
test('planner adapts all weather and activities, including no-cook trips', () => {
  const noCook = M.planner({ ...plan, days: 1, weather: 'mild', activities: [] });
  assert(!byId(noCook, 'tent')); assert(!byId(noCook, 'stove'));
  assert(byId(noCook, 'food').name.startsWith('No-cook')); assert.equal(byId(noCook, 'water').qty, 9);
  const rain = M.planner({ ...plan, weather: 'rain' }); assert(byId(rain, 'gaiters')); assert(byId(rain, 'rainpants'));
  const snow = M.planner({ ...plan, weather: 'snow', activities: M.activities });
  ['snow','thermal','gloves','swim','pfd','helmet','cycle','fishing','camera'].forEach(id => assert(byId(snow, id)));
  assert.equal(byId(snow, 'bag').grams, 1700);
});
test('600 planner combinations have valid bounded schema and correct weights', () => {
  let count = 0;
  for (const days of [1,2,7,30]) for (const people of [1,2,3,10,20]) for (const weather of M.weather) {
    for (const activity of M.activities) {
      const list = M.planner({ days, people, weather, activities: [activity] });
      assert.deepEqual(M.validateList(list), list);
      const t = M.totals(list.items);
      assert.equal(t.grams, list.items.reduce((n, i) => n + i.grams * i.qty, 0));
      assert.equal(t.packed, 0); count++;
    }
  }
  assert.equal(count, 600);
});
test('invalid plans cannot create unsafe or unbounded counts', () => {
  for (const patch of [{ days: 0 }, { days: 31 }, { people: 0 }, { people: 21 }, { weather: 'storm' },
    { days: 1.5 }, { activities: ['climbing'] }, { activities: null }]) assert.throws(() => M.planner({ ...plan, ...patch }));
});
test('JSON import/export preserves plan, ticks, quantities, custom notes and departure checks', () => {
  const list = M.planner(plan); list.items[0].packed = true; list.items[0].tip = 'User note'; list.before[2] = true;
  const imported = M.importJSON(M.exportJSON(list));
  assert.notEqual(imported.id, list.id); assert.equal(imported.template, false);
  assert.deepEqual({ ...imported, id: list.id }, list);
  const state = M.fresh(); state.lists.push(list); state.selected = list.id;
  assert.deepEqual(M.restore(JSON.stringify(state)), state);
});
test('imports reject wrong format, oversize, duplicates, invalid notes and invalid departure state', () => {
  const list = M.planner(plan);
  const wrap = l => JSON.stringify({ format: 'camping-checklist', version: 1, list: l });
  for (const text of ['null', '{}', 'x'.repeat(1000001), wrap({ ...list, items: [list.items[0],list.items[0]] }),
    wrap({ ...list, before: ['yes'] }), wrap({ ...list, plan: { ...plan, people: 10000 } }),
    wrap({ ...list, items: [{ ...list.items[0], tip: {} }] })]) assert.throws(() => M.importJSON(text));
});
test('text export includes quantities, weights, guidance, learning and matching checks', () => {
  const list = M.planner(plan); list.before[0] = true;
  const text = M.exportText(list, L);
  ['36 L', '2500–3500', '[x] Weather', 'Why:', 'Care:', 'Leave No Trace', '112', 'Total:'].forEach(s => assert(text.includes(s), s));
  assert(!text.includes('undefined'));
});
