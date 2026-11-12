const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../core/foods.js');
const NP = require('../core/plate.js');

// (before NP2) test('150 unique valid foods covering every group and diet', () => {
test('217 unique valid foods covering every group and diet (150 + NP2 43 + NP3 24)', () => {
  // (before NP2) assert.equal(F.foods.length, 150);
  assert.equal(F.foods.length, 217);
  // (before NP2) assert.equal(new Set(F.foods.map(f => f.id)).size, 150);
  assert.equal(new Set(F.foods.map(f => f.id)).size, 217);
  // (before NP2) assert.equal(new Set(F.foods.map(f => f.name)).size, 150);
  assert.equal(new Set(F.foods.map(f => f.name)).size, 217);
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
  // (before NP2) assert.equal(NP.filterFoods('', 'all', 'nonveg').length, 150);
  assert.equal(NP.filterFoods('', 'all', 'nonveg').length, 217);
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
  // (before NP4) assert.deepEqual(NP.normalize([{ id: 'roti', qty: 0 }, { id: 'roti', qty: 2 }]), [{ id: 'roti', qty: 2 }]);
  assert.deepEqual(NP.normalize([{ id: 'roti', qty: 0 }, { id: 'roti', qty: 2 }]), [{ id: 'roti', qty: 2, g: F.byId.roti.g * 2 }]);
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
    assert.ok(g.kcal >= 1300 && g.kcal <= 3400);
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

test('targets are sex-specific and unspecified uses the mid-point', () => {
  const f = T.targets('adult', 'moderate', 'female');
  const m = T.targets('adult', 'moderate', 'male');
  const u = T.targets('adult', 'moderate', 'unspecified');
  const two = T.targets('adult', 'moderate');
  assert.equal(f.fe, 29);
  assert.equal(m.fe, 19);
  assert.equal(u.fe, 24);
  assert.equal(u.kcal, 2300);
  assert.equal(u.kcal, Math.round((f.kcal + m.kcal) / 2));
  assert.equal(u.fe, Math.round((f.fe + m.fe) / 2));
  assert.equal(two.sex, 'unspecified');
  assert.ok(m.kcal > f.kcal);
  assert.equal(T.targets('preteen', 'moderate', 'female').fe, 28);
  assert.equal(T.targets('preteen', 'moderate', 'male').fe, 16);
  assert.equal(T.targets('older', 'moderate', 'female').fe, T.targets('older', 'moderate', 'male').fe);
  assert.equal(T.targets('teen', 'active', 'unspecified').kcal, 3000);
});

test('old saves without sex still load, with mid-point targets', () => {
  const recovered = Day.restore(JSON.stringify({
    person: { age: 'teen', activity: 'active', diet: 'egg' },
    meal: 'lunch',
    meals: { breakfast: [{ id: 'idli', qty: 2 }], lunch: [], snack: [], dinner: [] }
  }));
  assert.equal(recovered.person.sex, 'unspecified');
  assert.equal(recovered.person.age, 'teen');
  assert.equal(recovered.meals.breakfast[0].id, 'idli');
  assert.equal(recovered.scores.guess, 0);
  const g = T.targets(recovered.person.age, recovered.person.activity, recovered.person.sex);
  assert.equal(g.kcal, 3000);
  assert.equal(g.sex, 'unspecified');
});

const G = require('../core/games.js');

test('guess-the-calories offers four unique choices including the true value', () => {
  const rng = G.rngFrom(42);
  const used = [];
  for (let i = 0; i < G.GUESS_N; i++) {
    const q = G.guessQuestion(used, rng);
    used.push(q.id);
    assert.equal(q.choices.length, 4);
    assert.equal(new Set(q.choices).size, 4);
    assert(q.choices.includes(q.kcal), q.id + ' missing ' + q.kcal);
    assert.equal(G.gradeGuess(q, q.kcal).correct, true);
    const wrong = q.choices.find(n => n !== q.kcal);
    assert.equal(G.gradeGuess(q, wrong).correct, false);
    assert.equal(G.gradeGuess(q, wrong).answer, q.kcal);
  }
  assert.equal(new Set(used).size, G.GUESS_N);
});

test('each fix-this-plate start is unbalanced and its documented fix balances it', () => {
  const good = NP.add(NP.add(NP.add(NP.add([], 'roti', 2), 'dal_tadka', 1), 'mixed_sabzi', 1), 'salad', 1);
  assert.equal(G.isBalanced(good), true);
  assert.equal(G.issues([]).length > 0, true);
  assert.equal(G.CHALLENGES.length, 5);
  G.CHALLENGES.forEach(row => {
    const ch = G.challenge(row.id);
    assert.equal(G.isBalanced(ch.start), false);
    assert(G.issues(ch.start).length > 0, row.id + ' should list issues');
    ch.bank.forEach(id => assert(F.byId[id], row.id + ' bank ' + id));
    let plate = ch.start;
    ch.fix.forEach(step => { plate = G.applyFix(plate, step); });
    assert.equal(G.isBalanced(plate), true, row.id + ' fix: ' + G.issues(plate).join('; '));
  });
});

test('healthier-swaps answers are in the choices and grade correctly', () => {
  G.SWAPS.forEach(row => {
    assert(F.byId[row.from], row.from);
    assert(row.choices.includes(row.answer));
    row.choices.forEach(id => assert(F.byId[id], id));
    const from = F.byId[row.from], ans = F.byId[row.answer];
    assert(ans.kcal < from.kcal || ans.sugar < from.sugar || ans.fibre > from.fibre, row.id + ' should look healthier');
  });
  const rng = G.rngFrom(7);
  const used = [];
  for (let i = 0; i < G.SWAP_N; i++) {
    const q = G.swapQuestion(used, rng);
    used.push(q.id);
    assert.equal(G.gradeSwap(q, q.answer).correct, true);
    const wrong = q.choices.find(id => id !== q.answer);
    const grade = G.gradeSwap(q, wrong);
    assert.equal(grade.correct, false);
    assert.equal(grade.answer, q.answer);
    assert(grade.why);
  }
});
