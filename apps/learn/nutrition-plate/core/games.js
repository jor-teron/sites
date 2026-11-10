/* NP-1c: guess-the-calories, fix-this-plate and healthier-swaps logic. Pure, testable. */
(function (root, factory) {
  const NP = typeof module === 'object' && module.exports ? require('./plate.js') : root.NP;
  const F = typeof module === 'object' && module.exports ? require('./foods.js') : root.NPFoods;
  const model = factory(NP, F);
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.NPGames = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (NP, F) {
  'use strict';
  const GUESS_N = 8, SWAP_N = 8;
  const GUESS_FOODS = ['roti', 'rice', 'dal_tadka', 'samosa', 'banana', 'curd', 'chicken_curry',
    'cola', 'idli', 'aloo_paratha', 'salad', 'gulab_jamun', 'milk', 'poha', 'mixed_sabzi', 'puri'];
  function rngFrom(seed) {
    let s = (Number(seed) >>> 0) || 1;
    return function () {
      s = Math.imul(s ^ s >>> 15, s | 1);
      s ^= s + Math.imul(s ^ s >>> 7, s | 61);
      return ((s ^ s >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function nearbyChoices(kcal, rng) {
    const set = new Set([kcal]);
    const deltas = shuffle([25, 40, 55, 70, 90, 120, 150, 180, 220, 280], rng);
    for (const d of deltas) {
      for (const sign of shuffle([1, -1], rng)) {
        const v = Math.max(5, Math.round((kcal + sign * d) / 5) * 5);
        if (v !== kcal && v < 900) set.add(v);
        if (set.size === 4) return shuffle([...set], rng);
      }
    }
    return shuffle([...set], rng);
  }
  function guessQuestion(used, rng) {
    const pool = GUESS_FOODS.filter(id => F.byId[id] && !(used || []).includes(id));
    const list = pool.length ? pool : GUESS_FOODS.filter(id => F.byId[id]);
    const id = list[Math.floor(rng() * list.length)];
    const food = F.byId[id];
    return { id, name: food.name, portion: food.portion, icon: food.icon, kcal: food.kcal,
      choices: nearbyChoices(food.kcal, rng) };
  }
  function gradeGuess(question, pick) {
    const n = Number(pick);
    return { correct: n === question.kcal, answer: question.kcal };
  }

  function issues(plate) {
    const b = NP.balance(plate), out = [];
    if (!b.core) {
      out.push('This plate has no grains, protein, vegetables or fruit yet.');
      return out;
    }
    if (b.core < 180) out.push('This is a very small plate — add a vegetable and a staple or protein.');
    if (b.shares.vegfruit < 0.35) out.push('Add vegetables or fruit — they should make up about half the plate.');
    if (b.shares.vegfruit > 0.70) out.push('Add a grain or a protein so vegetables are not almost the whole plate.');
    if (b.shares.grains < 0.12) out.push('Add a grain such as roti or rice.');
    if (b.shares.grains > 0.42) out.push('There is more grain than the guide — try a smaller serving or add vegetables.');
    if (b.shares.protein < 0.12) out.push('Add a protein — dal, paneer, eggs, fish, meat or sprouts.');
    if (b.shares.protein > 0.42) out.push('Protein is crowding the plate — add vegetables.');
    if (b.extras > Math.max(40, b.core * 0.30)) out.push('Oils, snacks or sweets are taking up a lot of the plate — swap or remove some.');
    return out;
  }
  function isBalanced(plate) { return issues(plate).length === 0; }
  function applyFix(plate, step) {
    if (step.remove) return NP.setQty(plate, step.remove, (NP.normalize(plate).find(r => r.id === step.remove) || { qty: 1 }).qty - 1);
    if (step.add) return NP.add(plate, step.add, 1);
    return NP.normalize(plate);
  }
  const CHALLENGES = [
    { id: 'fried-lunch', title: 'A fried-food lunch',
      blurb: 'Rice, two samosas and a cola. Cut the extras and fill the plate with dal and vegetables.',
      start: [{ id: 'rice', qty: 1 }, { id: 'samosa', qty: 2 }, { id: 'cola', qty: 1 }],
      bank: ['salad', 'mixed_sabzi', 'dal_tadka', 'curd', 'water', 'sprouts', 'pakora'],
      fix: [{ remove: 'samosa' }, { remove: 'samosa' }, { remove: 'cola' }, { add: 'dal_tadka' }, { add: 'mixed_sabzi' }, { add: 'salad' }] },
    { id: 'no-veg', title: 'Rice and chicken only',
      blurb: 'A staple and a protein, but nothing green. Add vegetables until they are about half the plate.',
      start: [{ id: 'rice', qty: 1 }, { id: 'chicken_curry', qty: 1 }],
      bank: ['mixed_sabzi', 'salad', 'palak_sabzi', 'samosa', 'roti', 'curd'],
      fix: [{ add: 'mixed_sabzi' }, { add: 'salad' }] },
    { id: 'no-protein', title: 'Roti and sabzi, no dal',
      blurb: 'Grains and vegetables are here, but the protein quarter is empty.',
      start: [{ id: 'roti', qty: 3 }, { id: 'mixed_sabzi', qty: 1 }, { id: 'salad', qty: 1 }],
      bank: ['dal_tadka', 'sprouts', 'curd', 'samosa', 'rice', 'palak_sabzi'],
      fix: [{ add: 'dal_tadka' }] },
    { id: 'biscuit-breakfast', title: 'A biscuit breakfast',
      blurb: 'Biscuits and tea are not a balanced meal. Build a plate with a grain, a protein and vegetables or fruit.',
      start: [{ id: 'biscuit', qty: 3 }, { id: 'tea', qty: 1 }],
      bank: ['roti', 'sprouts', 'salad', 'banana', 'curd', 'samosa', 'idli'],
      fix: [{ remove: 'biscuit' }, { remove: 'biscuit' }, { remove: 'biscuit' }, { add: 'roti' }, { add: 'roti' }, { add: 'sprouts' }, { add: 'salad' }, { add: 'banana' }] },
    { id: 'heavy-paratha', title: 'Too many parathas',
      blurb: 'Three parathas fill the plate with grain and fat. Scale back and add dal and vegetables.',
      start: [{ id: 'paratha', qty: 3 }, { id: 'tea', qty: 1 }],
      bank: ['dal_tadka', 'palak_sabzi', 'salad', 'roti', 'curd', 'aloo_paratha'],
      fix: [{ remove: 'paratha' }, { remove: 'paratha' }, { add: 'dal_tadka' }, { add: 'palak_sabzi' }, { add: 'salad' }] }
  ];
  function challenge(id) {
    const row = CHALLENGES.find(c => c.id === id) || CHALLENGES[0];
    return { ...row, start: row.start.map(r => ({ ...r })), bank: row.bank.slice() };
  }

  const SWAPS = [
    { id: 'cola-water', from: 'cola', choices: ['water', 'nimbu_pani', 'mango_juice'], answer: 'water',
      why: 'Water has no sugar. Sweet drinks and juices add up quickly.' },
    { id: 'samosa-sprouts', from: 'samosa', choices: ['sprouts', 'pakora', 'namkeen'], answer: 'sprouts',
      why: 'Sprouts are a lighter, protein-rich snack compared with deep-fried samosa or pakora.' },
    { id: 'rice-brown', from: 'rice', choices: ['brown_rice', 'jeera_rice', 'veg_pulao'], answer: 'brown_rice',
      why: 'Brown rice keeps more fibre than polished or fried rice dishes.' },
    { id: 'biscuit-fruit', from: 'biscuit', choices: ['banana', 'peda', 'ladoo'], answer: 'banana',
      why: 'Fruit gives fibre with less added sugar and fat than biscuits or sweets.' },
    { id: 'bread-brown', from: 'bread', choices: ['brown_bread', 'naan', 'pav'], answer: 'brown_bread',
      why: 'Brown bread usually has more fibre than white pav or naan.' },
    { id: 'ice-curd', from: 'ice_cream', choices: ['curd', 'kheer', 'peda'], answer: 'curd',
      why: 'Plain curd is a protein and calcium source with far less sugar than ice cream or mithai.' },
    { id: 'pakora-salad', from: 'pakora', choices: ['salad', 'samosa', 'aloo_tikki'], answer: 'salad',
      why: 'A salad is much lighter than fried pakora or tikki.' },
    { id: 'sugarcane-coconut', from: 'sugarcane', choices: ['coconut_water', 'mango_juice', 'nimbu_pani'], answer: 'coconut_water',
      why: 'Coconut water is a lighter drink than sweet juices.' },
    { id: 'paratha-roti', from: 'paratha', choices: ['roti', 'aloo_paratha', 'puri'], answer: 'roti',
      why: 'A plain roti is cooked with little or no fat, unlike paratha or puri.' },
    { id: 'maggi-poha', from: 'maggi', choices: ['poha', 'samosa', 'namkeen'], answer: 'poha',
      why: 'Poha is a lighter grain snack than instant noodles or fried namkeen.' }
  ];
  function swapQuestion(used, rng) {
    const pool = SWAPS.filter(s => F.byId[s.from] && s.choices.every(id => F.byId[id]) && !(used || []).includes(s.id));
    const list = pool.length ? pool : SWAPS.filter(s => F.byId[s.from]);
    const row = list[Math.floor(rng() * list.length)];
    return { id: row.id, from: row.from, name: F.byId[row.from].name, portion: F.byId[row.from].portion,
      icon: F.byId[row.from].icon, choices: shuffle(row.choices, rng), answer: row.answer, why: row.why };
  }
  function gradeSwap(question, pick) {
    return { correct: pick === question.answer, answer: question.answer, why: question.why };
  }

  return { GUESS_N, SWAP_N, GUESS_FOODS, SWAPS, CHALLENGES, rngFrom, guessQuestion, gradeGuess,
    issues, isBalanced, applyFix, challenge, swapQuestion, gradeSwap };
});
