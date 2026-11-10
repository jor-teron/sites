const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../core/foods.js');
const NP = require('../core/plate.js');

test('150 unique valid foods covering every group and diet', () => {
  assert.equal(F.foods.length, 150);
  assert.equal(new Set(F.foods.map(f => f.id)).size, 150);
  assert.equal(new Set(F.foods.map(f => f.name)).size, 150);
  F.foods.forEach(f => assert.equal(NP.validateFood(f), f));
  const groups = new Set(F.foods.map(f => f.group));
  assert.equal(groups.size, F.groups.length);
  F.groups.forEach(([id]) => assert(groups.has(id)));
  assert(F.foods.some(f => f.diet === 'v'));
  assert(F.foods.some(f => f.diet === 'e'));
  assert(F.foods.some(f => f.diet === 'n'));
  assert(F.foods.every(f => f.icon));
});

test('everyday staples are present with labelled portions', () => {
  ['roti', 'rice', 'dal_tadka', 'curd', 'paneer', 'boiled_egg', 'chicken_curry', 'banana', 'samosa', 'tea']
    .forEach(id => assert(F.byId[id], id));
  assert.match(F.byId.roti.portion, /roti/i);
  assert.match(F.byId.rice.portion, /katori/i);
  assert.match(F.byId.milk.portion, /cup/i);
  assert.match(F.byId.banana.portion, /medium|piece|katori/i);
});

test('filter by search, group and diet', () => {
  assert(NP.filterFoods('roti', 'all', 'all').some(f => f.id === 'roti'));
  assert(NP.filterFoods('', 'fruits', 'all').every(f => f.group === 'fruits'));
  assert(NP.filterFoods('', 'all', 'veg').every(f => f.diet === 'v'));
  assert(NP.filterFoods('', 'all', 'egg').every(f => f.diet === 'v' || f.diet === 'e'));
  assert.equal(NP.filterFoods('', 'all', 'nonveg').length, 150);
  assert(!NP.filterFoods('', 'all', 'veg').some(f => f.id === 'chicken_curry'));
  assert(NP.filterFoods('', 'all', 'egg').some(f => f.id === 'boiled_egg'));
  assert(!NP.filterFoods('', 'all', 'egg').some(f => f.id === 'fish_curry'));
});

test('plate totals equal the sum of portions', () => {
  const plate = NP.add(NP.add([], 'roti', 2), 'rice', 1);
  const t = NP.totals(plate), r = F.byId.roti, s = F.byId.rice;
  assert.equal(t.items, 2);
  assert.equal(t.portions, 3);
  assert.equal(t.g, r.g * 2 + s.g);
  assert.equal(t.kcal, Math.round(r.kcal * 2 + s.kcal));
  assert.equal(t.prot, Math.round((r.prot * 2 + s.prot) * 10) / 10);
  assert.equal(t.groups.grains.portions, 3);
});

test('quantity limits and unknown foods are rejected', () => {
  assert.throws(() => NP.add([], 'no-such-food'));
  let plate = NP.add([], 'roti', 1);
  plate = NP.setQty(plate, 'roti', 20);
  assert.equal(plate[0].qty, 20);
  assert.throws(() => NP.setQty(plate, 'roti', 21));
  assert.deepEqual(NP.setQty(plate, 'roti', 0), []);
  assert.deepEqual(NP.normalize([{ id: 'roti', qty: 0 }, { id: 'roti', qty: 2 }]), [{ id: 'roti', qty: 2 }]);
});

test('balanced-plate shares use food weight and sum to one', () => {
  const plate = NP.add(NP.add(NP.add([], 'roti', 2), 'dal_tadka', 1), 'salad', 2);
  const b = NP.balance(plate);
  const sum = b.shares.grains + b.shares.protein + b.shares.vegfruit;
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(b.ideal.vegfruit, 0.5);
  assert.ok(b.weight.grains > 0 && b.weight.protein > 0 && b.weight.vegfruit > 0);
  assert.deepEqual(NP.balance([]).shares, { grains: 0, protein: 0, vegfruit: 0 });
});
