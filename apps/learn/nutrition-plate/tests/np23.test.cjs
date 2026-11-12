/* NP2 + NP3: kitchen garden, leafy greens, named rice, condiments, pork, dry fish,
   broiler and local cooked fish. Pure model tests (no browser). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../core/foods.js');
const NP = require('../core/plate.js');
const Day = require('../core/day.js');

const NP2 = {
  grains: ['basmati_rice', 'joha_rice', 'bora_saul', 'red_rice'],
  vegetables: ['tomato', 'onion', 'cucumber', 'cauliflower', 'green_peas', 'capsicum', 'radish', 'carrot',
    'ridge_gourd', 'sponge_gourd', 'snake_gourd', 'potol', 'komora', 'kundru',
    'sweet_potato', 'kochu', 'ol', 'yam',
    'knol_khol', 'raw_papaya', 'green_jackfruit', 'raw_banana', 'koldil', 'posola', 'spring_onion', 'drumstick'],
  leafy: ['lai_xaak', 'khutora', 'sojina_paat', 'kolmou', 'morapat', 'kochu_xaak', 'pumpkin_leaves',
    'bathua', 'dhekia', 'radish_leaves', 'lettuce', 'coriander', 'mint']
};
const NP3 = {
  condiments: ['ginger', 'garlic', 'green_chilli', 'dry_red_chilli', 'turmeric', 'cumin', 'mustard_seed',
    'lemon', 'tamarind', 'outenga', 'pickle', 'kharisa', 'mustard_oil'],
  meat: ['pork_curry', 'smoked_pork', 'fried_pork', 'hukoti', 'namsing', 'dried_small_fish', 'dried_prawn',
    'broiler', 'broiler_fry', 'masor_tenga', 'small_fish_fry']
};
const all = obj => Object.values(obj).flat();
const KEPT = ['palak_sabzi', 'methi', 'sarson_saag', 'cabbage', 'lauki', 'kaddu', 'karela', 'oil', 'ghee',
  'chicken_curry', 'tandoori', 'chicken_tikka', 'chicken_soup', 'chicken_biryani', 'momos_chicken',
  'fish_curry', 'fish_fry', 'rohu', 'grilled_fish', 'prawn_curry', 'rice', 'brown_rice', 'jeera_rice'];

test('NP2 and NP3 add 67 valid foods with unique ids and names', () => {
  const ids = all(NP2).concat(all(NP3));
  assert.equal(all(NP2).length, 43);
  assert.equal(all(NP3).length, 24);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach(id => {
    const f = F.byId[id];
    assert(f, id + ' missing');
    assert.equal(NP.validateFood(f), f);
    assert(f.icon, id + ' icon');
    assert.match(f.portion, /\d/, id + ' portion should name an amount');
  });
  assert.equal(new Set(F.foods.map(f => f.id)).size, F.foods.length);
  assert.equal(new Set(F.foods.map(f => f.name)).size, F.foods.length);
});

test('every new food sits in its planned group', () => {
  Object.entries(NP2).forEach(([g, ids]) => ids.forEach(id => assert.equal(F.byId[id].group, g, id)));
  Object.entries(NP3).forEach(([g, ids]) => ids.forEach(id => assert.equal(F.byId[id].group, g, id)));
});

test('Leafy greens follows Vegetables; Condiments follows Fats, nuts and seeds', () => {
  const order = F.groups.map(g => g[0]);
  assert.equal(order[order.indexOf('vegetables') + 1], 'leafy');
  assert.equal(order[order.indexOf('fats') + 1], 'condiments');
  assert.equal(NP.groupLabel('leafy'), 'Leafy greens');
  assert.equal(NP.groupLabel('condiments'), 'Condiments');
  assert.deepEqual(NP.filterFoods('', 'leafy', 'all').map(f => f.id).sort(), NP2.leafy.slice().sort());
  assert.deepEqual(NP.filterFoods('', 'condiments', 'all').map(f => f.id).sort(), NP3.condiments.slice().sort());
});

test('existing foods are kept as they were', () => {
  KEPT.forEach(id => assert(F.byId[id], id));
  assert.equal(F.byId.palak_sabzi.group, 'vegetables');
  assert.equal(F.byId.sarson_saag.group, 'vegetables');
  assert.equal(F.byId.oil.group, 'fats');
  assert.equal(F.byId.rice.kcal, 175);
  assert.equal(F.byId.chicken_curry.kcal, 210);
});

test('vegetarian and egg filters hide pork, dry fish, broiler and local fish', () => {
  const nonveg = NP3.meat;
  nonveg.forEach(id => assert.equal(F.byId[id].diet, 'n', id));
  const veg = NP.filterFoods('', 'all', 'veg').map(f => f.id);
  const egg = NP.filterFoods('', 'all', 'egg').map(f => f.id);
  nonveg.forEach(id => { assert(!veg.includes(id), 'veg shows ' + id); assert(!egg.includes(id), 'egg shows ' + id); });
  all(NP2).concat(NP3.condiments).forEach(id => {
    assert.equal(F.byId[id].diet, 'v', id);
    assert(veg.includes(id), 'veg hides ' + id);
  });
  assert(NP.filterFoods('', 'all', 'nonveg').some(f => f.id === 'hukoti'));
});

test('search finds local and English names', () => {
  const find = (q, id, diet) => assert(NP.filterFoods(q, 'all', diet || 'all').some(f => f.id === id), q + ' -> ' + id);
  find('joha', 'joha_rice'); find('Basmati', 'basmati_rice'); find('bora saul', 'bora_saul');
  find('hukoti', 'hukoti'); find('sidol', 'namsing'); find('lai xaak', 'lai_xaak');
  find('sojina', 'drumstick'); find('sojina', 'sojina_paat'); find('potol', 'potol'); find('parwal', 'potol');
  find('komora', 'komora'); find('kochu', 'kochu'); find('kochu xaak', 'kochu_xaak'); find('koldil', 'koldil');
  find('posola', 'posola'); find('khutora', 'khutora'); find('kolmou', 'kolmou'); find('morapat', 'morapat');
  find('dhekia', 'dhekia'); find('ginger', 'ginger'); find('naharu', 'garlic'); find('nemu', 'lemon');
  find('outenga', 'outenga'); find('kharisa', 'kharisa'); find('pork', 'pork_curry'); find('pork', 'smoked_pork');
  find('broiler', 'broiler'); find('masor tenga', 'masor_tenga'); find('tomato', 'tomato'); find('mustard oil', 'mustard_oil');
  find('leafy', 'bathua'); find('condiments', 'turmeric');
  assert(!NP.filterFoods('pork', 'all', 'veg').length);
});

test('nutrient values stay in the same range as similar existing foods', () => {
  const b = F.byId;
  ['basmati_rice', 'joha_rice', 'bora_saul', 'red_rice'].forEach(id => {
    assert.equal(b[id].g, 140); assert(b[id].kcal >= 150 && b[id].kcal <= 200, id);
  });
  NP2.leafy.filter(id => b[id].g === 100).forEach(id => assert(b[id].kcal >= 40 && b[id].kcal <= 100, id));
  ['turmeric', 'cumin', 'mustard_seed', 'dry_red_chilli', 'ginger'].forEach(id => {
    assert(b[id].g <= 5, id + ' portion'); assert(b[id].kcal <= 20, id + ' kcal');
  });
  assert.equal(b.mustard_oil.kcal, b.oil.kcal);
  assert.equal(b.mustard_oil.g, 5);
  ['hukoti', 'namsing', 'dried_small_fish', 'dried_prawn'].forEach(id => assert(b[id].g <= 30 && b[id].prot >= 5, id));
  assert(b.pork_curry.fat > b.chicken_curry.fat);
  assert(b.broiler.prot > b.chicken_curry.prot && b.broiler.fat < b.broiler_fry.fat);
  assert(b.masor_tenga.kcal < b.fish_curry.kcal);
  assert(b.capsicum.vc > b.tomato.vc && b.khutora.ca > b.lettuce.ca);
});

test('leafy greens count as vegetables; condiments sit on the side', () => {
  const plate = NP.add(NP.add(NP.add([], 'joha_rice', 1), 'lai_xaak', 1), 'masoor_dal', 1);
  const b = NP.balance(plate);
  assert.equal(b.weight.vegfruit, F.byId.lai_xaak.g);
  const spiced = NP.add(NP.add(plate, 'turmeric', 1), 'mustard_oil', 1);
  const b2 = NP.balance(spiced);
  assert.equal(b2.core, b.core);
  assert.equal(b2.extras, b.extras);
  assert.equal(b2.weight.condiments, Math.round(F.byId.turmeric.g + F.byId.mustard_oil.g));
  const person = { age: 'adult', activity: 'moderate', diet: 'veg' };
  const greens = { breakfast: NP.add([], 'lai_xaak', 2), lunch: [], snack: [], dinner: [] };
  assert(!Day.tips(greens, person).some(t => /add vegetables/i.test(t)));
});

test('old saves with NP-1 foods still load next to new foods', () => {
  const state = Day.restore(JSON.stringify({ meals: { breakfast: [{ id: 'roti', qty: 2 }, { id: 'hukoti', qty: 1 }], lunch: [], snack: [], dinner: [] } }));
  assert.deepEqual(state.meals.breakfast, [{ id: 'roti', qty: 2 }, { id: 'hukoti', qty: 1 }]);
});
