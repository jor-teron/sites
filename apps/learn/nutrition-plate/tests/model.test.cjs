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

const T = require('../core/targets.js');
const Day = require('../core/day.js');

test('targets rise with activity and stay within a plausible range', () => {
  const sed = T.targets('adult', 'sedentary'), act = T.targets('adult', 'active');
  assert.ok(act.kcal > sed.kcal);
  assert.ok(act.sugar > sed.sugar);
  assert.equal(sed.prot, act.prot);
  T.ages.forEach(age => T.activities.forEach(actn => {
    const g = T.targets(age.id, actn.id);
    assert.ok(g.kcal >= 1400 && g.kcal <= 3000);
    assert.ok(g.prot >= 20 && g.fibre >= 15 && g.ca >= 600);
    assert.equal(g.sugar, Math.round(0.10 * g.kcal / 4));
  }));
  assert.deepEqual(T.targets('nope', 'nope').age, 'adult');
});

test('day totals are the sum of the four meals', () => {
  const meals = { breakfast: NP.add([], 'roti', 2), lunch: NP.add([], 'rice', 1), snack: NP.add([], 'banana', 1), dinner: NP.add([], 'dal_tadka', 1) };
  const t = Day.dayTotals(meals), parts = Day.mealTotals(meals);
  assert.equal(t.kcal, parts.breakfast.kcal + parts.lunch.kcal + parts.snack.kcal + parts.dinner.kcal);
  assert.equal(t.prot, Math.round((parts.breakfast.prot + parts.lunch.prot + parts.snack.prot + parts.dinner.prot) * 10) / 10);
  const twice = { breakfast: NP.add([], 'roti', 1), lunch: NP.add([], 'roti', 1), snack: [], dinner: [] };
  assert.equal(Day.dayTotals(twice).kcal, F.byId.roti.kcal * 2);
});

test('tips flag missing protein, vegetables and too much sugar', () => {
  const person = { age: 'adult', activity: 'moderate', diet: 'veg' };
  assert(Day.tips(Day.fresh().meals, person).some(t => /start a meal/i.test(t)));
  const sweet = { breakfast: NP.add([], 'cola', 3), lunch: [], snack: [], dinner: [] };
  const sug = Day.tips(sweet, person).join(' ');
  assert.match(sug, /too much sugar/i);
  assert.match(sug, /add vegetables/i);
  const rich = { breakfast: NP.add(NP.add(NP.add([], 'roti', 2), 'dal_tadka', 2), 'palak_sabzi', 2), lunch: NP.add(NP.add([], 'rice', 1), 'curd', 1), snack: NP.add([], 'banana', 1), dinner: NP.add(NP.add([], 'mixed_sabzi', 2), 'roti', 2) };
  const ok = Day.tips(rich, person).join(' ');
  assert.doesNotMatch(ok, /too much sugar/i);
  assert.doesNotMatch(ok, /add a protein/i);
});

test('plates and days persist through a localStorage-style round trip', () => {
  let state = Day.fresh();
  state.person = Day.cleanPerson({ age: 'teen', activity: 'active', diet: 'egg' });
  state.meals.breakfast = NP.add([], 'idli', 3);
  state.meals.lunch = NP.add(NP.add([], 'rice', 1), 'sambar', 1);
  state = Day.savePlate(state, 'Idli breakfast');
  state = Day.saveDay(state, 'School day');
  const copy = Day.restore(JSON.stringify(state));
  assert.equal(copy.person.age, 'teen');
  assert.equal(copy.meals.breakfast[0].qty, 3);
  assert.equal(copy.plates[0].name, 'Idli breakfast');
  assert.equal(copy.days[0].name, 'School day');
  const loaded = Day.loadPlate(copy, copy.plates[0].id);
  loaded.meal = 'dinner';
  const intoDinner = Day.loadPlate({ ...loaded, meal: 'dinner' }, copy.plates[0].id);
  assert.deepEqual(intoDinner.meals.dinner, copy.plates[0].items);
  const day2 = Day.loadDay(copy, copy.days[0].id);
  assert.equal(day2.person.activity, 'active');
  assert.equal(day2.meals.lunch.length, 2);
});

test('restore recovers missing fields and rejects bad JSON; saves need names', () => {
  const recovered = Day.restore('{}');
  assert.equal(recovered.person.age, 'adult');
  assert.deepEqual(recovered.meals.breakfast, []);
  assert.throws(() => Day.restore('nope'));
  assert.throws(() => Day.savePlate(Day.fresh(), '  '));
  assert.throws(() => Day.saveDay(Day.fresh(), ''));
  let state = Day.fresh();
  for (let i = 0; i < 20; i++) state = Day.savePlate(state, 'P' + i);
  assert.throws(() => Day.savePlate(state, 'one more'));
});
