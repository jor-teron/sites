/* NP4: personal portions, typed grams on a plate item, save/load migration,
   nutrients scaled from per-gram values. Games keep using default portions.
   Pure model tests (no browser). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../core/foods.js');
const NP = require('../core/plate.js');
const Day = require('../core/day.js');
const G = require('../core/games.js');

const roti = F.byId.roti;
const rice = F.byId.rice;

test('217 foods and NP2/NP3 behaviour still hold', () => {
  assert.equal(F.foods.length, 217);
  assert.equal(new Set(F.foods.map(f => f.id)).size, 217);
  F.foods.forEach(f => assert.equal(NP.validateFood(f), f));
  assert.equal(NP.groupLabel('leafy'), 'Leafy greens');
  assert.equal(NP.groupLabel('condiments'), 'Condiments');
  const greens = NP.add(NP.add([], 'joha_rice', 1), 'lai_xaak', 1);
  assert.equal(NP.balance(greens).weight.vegfruit, F.byId.lai_xaak.g);
  const spiced = NP.add(greens, 'mustard_oil', 1);
  assert.equal(NP.balance(spiced).core, NP.balance(greens).core);
  assert(!NP.filterFoods('', 'all', 'veg').some(f => f.id === 'hukoti'));
  assert(NP.filterFoods('lai xaak', 'all', 'all').some(f => f.id === 'lai_xaak'));
});

test('blank personal portion falls back to default grams', () => {
  assert.equal(NP.portionGrams('roti'), roti.g);
  assert.equal(NP.portionGrams('roti', {}), roti.g);
  assert.equal(NP.portionGrams('roti', { roti: '' }), roti.g);
  assert.equal(NP.defaultGrams('roti'), roti.g);
  const afterBlank = NP.setPortion({ roti: 55 }, 'roti', '  ');
  assert.equal(afterBlank.roti, undefined);
  assert.equal(NP.portionGrams('roti', afterBlank), roti.g);
  const plate = NP.add([], 'roti', 2);
  assert.equal(plate[0].g, roti.g * 2);
  const t = NP.totals(plate);
  assert.equal(t.g, roti.g * 2);
  assert.equal(t.kcal, Math.round(roti.kcal * 2));
});

test('set personal portion; plate +/− uses it; nutrients scale from per-gram values', () => {
  const portions = NP.setPortion({}, 'roti', 50);
  assert.equal(NP.portionGrams('roti', portions), 50);
  let plate = NP.add([], 'roti', 1, portions);
  assert.equal(plate[0].qty, 1);
  assert.equal(plate[0].g, 50);
  plate = NP.add(plate, 'roti', 1, portions);
  assert.equal(plate[0].qty, 2);
  assert.equal(plate[0].g, 100);
  plate = NP.setQty(plate, 'roti', 3, portions);
  assert.equal(plate[0].qty, 3);
  assert.equal(plate[0].g, 150);
  const t = NP.totals(plate);
  assert.equal(t.g, 150);
  const expectedKcal = Math.round(roti.kcal * (150 / roti.g));
  const expectedProt = Math.round(roti.prot * (150 / roti.g) * 10) / 10;
  assert.equal(t.kcal, expectedKcal);
  assert.equal(t.prot, expectedProt);
  const unit = NP.add([], 'rice', 1, NP.setPortion({}, 'rice', 200));
  const riceT = NP.totals(unit);
  assert.equal(riceT.g, 200);
  assert.equal(riceT.kcal, Math.round(rice.kcal * (200 / rice.g)));
});

test('Reset one food and Reset all restore defaults', () => {
  let portions = NP.setPortion({}, 'roti', 50);
  portions = NP.setPortion(portions, 'rice', 200);
  assert.equal(NP.portionGrams('roti', portions), 50);
  portions = NP.resetPortion(portions, 'roti');
  assert.equal(NP.portionGrams('roti', portions), roti.g);
  assert.equal(NP.portionGrams('rice', portions), 200);
  portions = NP.resetAllPortions();
  assert.deepEqual(portions, {});
  assert.equal(NP.portionGrams('rice', portions), rice.g);
  const plate = NP.add([], 'roti', 2, portions);
  assert.equal(plate[0].g, roti.g * 2);
});

test('one-off typed grams on a plate item do not change the saved personal portion', () => {
  const portions = NP.setPortion({}, 'roti', 50);
  let plate = NP.add([], 'roti', 2, portions);
  assert.equal(plate[0].g, 100);
  plate = NP.setItemGrams(plate, 'roti', 75);
  assert.equal(plate[0].qty, 2);
  assert.equal(plate[0].g, 75);
  assert.equal(NP.portionGrams('roti', portions), 50);
  const t = NP.totals(plate);
  assert.equal(t.g, 75);
  assert.equal(t.kcal, Math.round(roti.kcal * (75 / roti.g)));
  /* +/− uses the user's portion, not the one-off grams. */
  plate = NP.setQty(plate, 'roti', 3, portions);
  assert.equal(plate[0].g, 150);
  assert.equal(NP.portionGrams('roti', portions), 50);
});

test('saved meals store actual grams; changing a personal portion afterwards does not rewrite them', () => {
  let state = Day.fresh();
  const portions = NP.setPortion({}, 'roti', 50);
  state.portions = portions;
  state.meals.breakfast = NP.add([], 'roti', 2, portions);
  state = Day.savePlate(state, 'Two rotis');
  state = Day.saveDay(state, 'My day');
  const savedG = state.plates[0].items[0].g;
  const savedKcal = NP.totals(state.plates[0].items).kcal;
  assert.equal(savedG, 100);
  assert.equal(state.days[0].meals.breakfast[0].g, 100);
  state.portions = NP.setPortion(state.portions, 'roti', 80);
  assert.equal(state.plates[0].items[0].g, savedG);
  assert.equal(state.days[0].meals.breakfast[0].g, 100);
  assert.equal(NP.totals(state.plates[0].items).kcal, savedKcal);
  const copy = Day.restore(JSON.stringify(state));
  assert.equal(copy.plates[0].items[0].g, 100);
  assert.equal(copy.days[0].meals.breakfast[0].g, 100);
  assert.equal(NP.totals(copy.plates[0].items).kcal, savedKcal);
  assert.equal(NP.portionGrams('roti', copy.portions), 80);
  const loaded = Day.loadPlate(copy, copy.plates[0].id);
  assert.equal(loaded.meals.breakfast[0].g, 100);
  assert.equal(NP.totals(loaded.meals.breakfast).kcal, savedKcal);
});

test('old saves (qty only, no grams) migrate to qty × default grams and still load', () => {
  const state = Day.restore(JSON.stringify({
    person: { age: 'teen', activity: 'active', diet: 'egg' },
    meal: 'lunch',
    meals: {
      breakfast: [{ id: 'roti', qty: 2 }, { id: 'hukoti', qty: 1 }],
      lunch: [{ id: 'rice', qty: 1 }],
      snack: [],
      dinner: []
    },
    plates: [{ id: 'p1', name: 'Old plate', items: [{ id: 'idli', qty: 3 }] }],
    days: [{ id: 'd1', name: 'Old day', person: { age: 'teen', activity: 'active', diet: 'egg' },
      meals: { breakfast: [{ id: 'idli', qty: 3 }], lunch: [], snack: [], dinner: [] } }]
  }));
  assert.equal(state.meals.breakfast[0].id, 'roti');
  assert.equal(state.meals.breakfast[0].qty, 2);
  assert.equal(state.meals.breakfast[0].g, roti.g * 2);
  assert.equal(state.meals.breakfast[1].g, F.byId.hukoti.g);
  assert.equal(state.meals.lunch[0].g, rice.g);
  assert.equal(state.plates[0].items[0].g, F.byId.idli.g * 3);
  assert.equal(state.days[0].meals.breakfast[0].g, F.byId.idli.g * 3);
  const t = NP.totals(state.meals.breakfast);
  assert.equal(t.g, roti.g * 2 + F.byId.hukoti.g);
  assert.equal(t.kcal, Math.round(roti.kcal * 2 + F.byId.hukoti.kcal));
  assert.deepEqual(state.portions, {});
});

test('games still use default portions and ignore user Portions', () => {
  const portions = NP.setPortion(NP.setPortion({}, 'roti', 80), 'rice', 300);
  const rng = G.rngFrom(42);
  const q = G.guessQuestion([], rng);
  const food = F.byId[q.id];
  assert.equal(q.kcal, food.kcal);
  assert.equal(q.portion, food.portion);
  const ch = G.challenge('fried-lunch');
  const withDefaults = NP.totals(ch.start);
  const tRice = NP.totals(NP.add([], 'rice', 1, portions));
  assert.notEqual(tRice.g, F.byId.rice.g);
  assert.equal(withDefaults.g, F.byId.rice.g + F.byId.samosa.g * 2 + F.byId.cola.g);
  assert.equal(withDefaults.kcal, Math.round(F.byId.rice.kcal + F.byId.samosa.kcal * 2 + F.byId.cola.kcal));
  let plate = ch.start;
  ch.fix.forEach(step => { plate = G.applyFix(plate, step); });
  assert.equal(G.isBalanced(plate), true);
  plate.forEach(row => {
    assert.equal(row.g, F.byId[row.id].g * row.qty);
  });
});

test('invalid grams are rejected (0, negative, NaN)', () => {
  assert.throws(() => NP.parseGrams(0), /positive/i);
  assert.throws(() => NP.parseGrams(-10), /positive/i);
  assert.throws(() => NP.parseGrams(NaN), /positive/i);
  assert.throws(() => NP.parseGrams('nope'), /positive/i);
  assert.throws(() => NP.parseGrams(''), /enter an amount/i);
  assert.throws(() => NP.parseGrams(Infinity), /positive/i);
  assert.throws(() => NP.setPortion({}, 'roti', 0), /positive/i);
  assert.throws(() => NP.setPortion({}, 'roti', -5), /positive/i);
  assert.throws(() => NP.setPortion({}, 'roti', Number.NaN), /positive/i);
  const kept = NP.setPortion({}, 'roti', 50);
  assert.throws(() => NP.setPortion(kept, 'roti', 0), /positive/i);
  assert.equal(NP.portionGrams('roti', kept), 50);
  const plate = NP.add([], 'roti', 1);
  assert.throws(() => NP.setItemGrams(plate, 'roti', 0), /positive/i);
  assert.throws(() => NP.setItemGrams(plate, 'roti', -1), /positive/i);
  assert.throws(() => NP.setItemGrams(plate, 'roti', NaN), /positive/i);
  assert.equal(plate[0].g, roti.g);
  assert.throws(() => NP.parseGrams(NP.MAX_PORTION_G + 1), /or less/i);
  const dropped = NP.cleanPortions({ roti: 0, rice: -2, banana: 'nope', idli: 45, nope: 10 });
  assert.equal(dropped.roti, undefined);
  assert.equal(dropped.rice, undefined);
  assert.equal(dropped.banana, undefined);
  assert.equal(dropped.nope, undefined);
  assert.equal(dropped.idli, 45);
});
