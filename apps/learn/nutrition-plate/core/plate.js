/* NP-1a: plate totals, filters and a balanced-plate guide. Pure logic for UI and tests.
   NP2: Leafy greens count with vegetables. NP3: Condiments sit on the side.
   NP4: personal portion sizes, typed grams, and nutrients scaled from per-gram values. */
(function (root, factory) {
  const foods = typeof module === 'object' && module.exports ? require('./foods.js') : root.NPFoods;
  const model = factory(foods);
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.NP = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';
  const NUTRIENTS = ['kcal', 'prot', 'carb', 'fat', 'fibre', 'sugar', 'fe', 'ca', 'vc'];
  const MAX_QTY = 20, MAX_ITEMS = 40;
  /* Personal / one-off grams: at least 1 g, at most 2000 g for a usual portion.
     A plate item may hold up to 20 of those portions. */
  const MIN_G = 1, MAX_PORTION_G = 2000, MAX_ITEM_G = MAX_QTY * MAX_PORTION_G;
  const DIETS = { all: 'all', veg: 'v', egg: 'e', nonveg: 'n' };
  const LABELS = {
    kcal: 'Calories (kcal)', prot: 'Protein (g)', carb: 'Carbohydrate (g)', fat: 'Fat (g)',
    fibre: 'Fibre (g)', sugar: 'Sugar (g)', fe: 'Iron (mg)', ca: 'Calcium (mg)', vc: 'Vitamin C (mg)'
  };
  function emptyTotals() {
    const t = { items: 0, portions: 0, g: 0, groups: {} };
    NUTRIENTS.forEach(k => { t[k] = 0; });
    D.groups.forEach(([id]) => { t.groups[id] = { g: 0, kcal: 0, portions: 0 }; });
    return t;
  }
  function validateFood(food) {
    if (!food || typeof food.id !== 'string' || !/^[a-z0-9_]{2,40}$/.test(food.id)) throw new Error('Bad food id');
    if (!food.name || food.name.length > 80) throw new Error('Bad food name');
    if (!D.groups.some(([id]) => id === food.group)) throw new Error('Bad group: ' + food.group);
    if (!'ven'.includes(food.diet)) throw new Error('Bad diet');
    if (!food.portion || food.g <= 0 || food.g > 400) throw new Error('Bad portion');
    NUTRIENTS.forEach(k => {
      if (typeof food[k] !== 'number' || !Number.isFinite(food[k]) || food[k] < 0) throw new Error('Bad ' + k);
    });
    if (food.kcal > 600) throw new Error('Energy out of range');
    return food;
  }
  function allowed(food, diet) {
    if (!diet || diet === 'all') return true;
    if (diet === 'veg') return food.diet === 'v';
    if (diet === 'egg') return food.diet === 'v' || food.diet === 'e';
    if (diet === 'nonveg') return true;
    return true;
  }
  function filterFoods(query, group, diet) {
    const q = (query || '').trim().toLowerCase();
    return D.foods.filter(f => allowed(f, diet) && (!group || group === 'all' || f.group === group) &&
      (!q || f.name.toLowerCase().includes(q) || f.portion.toLowerCase().includes(q) || f.group.includes(q)));
  }
  function food(id) { return D.byId[id] || null; }
  function defaultGrams(id) {
    const item = food(id);
    return item ? item.g : 0;
  }
  function parseGrams(value, opts) {
    const allowBlank = !!(opts && opts.allowBlank);
    const max = opts && opts.max != null ? opts.max : MAX_PORTION_G;
    if (value == null) {
      if (allowBlank) return null;
      throw new Error('Enter an amount in grams.');
    }
    const text = String(value).trim();
    if (text === '') {
      if (allowBlank) return null;
      throw new Error('Enter an amount in grams.');
    }
    const n = Number(text);
    if (Number.isNaN(n) || !Number.isFinite(n) || n <= 0) throw new Error('Grams must be a positive number.');
    if (n < MIN_G) throw new Error('Grams must be at least ' + MIN_G + '.');
    if (n > max) throw new Error('Grams must be ' + max + ' or less.');
    return Math.round(n * 10) / 10;
  }
  function portionGrams(id, portions) {
    const item = food(id);
    if (!item) return 0;
    if (!portions || portions[id] == null || portions[id] === '') return item.g;
    try { return parseGrams(portions[id], { max: MAX_PORTION_G }); }
    catch (_) { return item.g; }
  }
  function cleanPortions(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
    const out = {};
    Object.keys(map).forEach(id => {
      if (!food(id)) return;
      try { out[id] = parseGrams(map[id], { max: MAX_PORTION_G }); }
      catch (_) { /* drop invalid or blank entries */ }
    });
    return out;
  }
  function setPortion(portions, id, value) {
    if (!food(id)) throw new Error('Unknown food');
    const next = Object.assign({}, cleanPortions(portions));
    const g = parseGrams(value, { allowBlank: true, max: MAX_PORTION_G });
    if (g == null) delete next[id];
    else next[id] = g;
    return next;
  }
  function resetPortion(portions, id) {
    const next = Object.assign({}, cleanPortions(portions));
    delete next[id];
    return next;
  }
  function resetAllPortions() { return {}; }
  function scaleNutrient(item, key, grams) {
    if (!item || !item.g) return 0;
    return item[key] * (grams / item.g);
  }
  function itemGrams(row, item) {
    if (!item) return 0;
    const qty = row && Number(row.qty);
    const fallback = item.g * (Number.isInteger(qty) && qty > 0 ? qty : 0);
    if (row == null || row.g == null || row.g === '') return fallback;
    const g = Number(row.g);
    if (!Number.isFinite(g) || g <= 0 || g > MAX_ITEM_G) return fallback;
    return Math.round(g * 10) / 10;
  }
  function normalize(plate) {
    if (!Array.isArray(plate)) return [];
    const seen = new Set(), out = [];
    plate.forEach(row => {
      const id = row && row.id, item = food(id);
      const qty = row && Number(row.qty);
      if (!item || seen.has(id) || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return;
      /* Missing grams (old qty-only saves) migrate to qty × the default household portion. */
      seen.add(id); out.push({ id, qty, g: itemGrams(row, item) });
    });
    return out.slice(0, MAX_ITEMS);
  }
  function add(plate, id, qty, portions) {
    const item = food(id); if (!item) throw new Error('Unknown food');
    const n = Number.isInteger(qty) && qty > 0 ? qty : 1;
    const next = normalize(plate), row = next.find(r => r.id === id);
    const unit = portionGrams(id, portions);
    if (row) {
      row.qty = Math.min(MAX_QTY, row.qty + n);
      row.g = Math.round(row.qty * unit * 10) / 10;
    } else {
      if (next.length >= MAX_ITEMS) throw new Error('The plate is full (40 foods).');
      const q = Math.min(MAX_QTY, n);
      next.push({ id, qty: q, g: Math.round(q * unit * 10) / 10 });
    }
    return next;
  }
  function setQty(plate, id, qty, portions) {
    if (!Number.isInteger(qty) || qty < 0 || qty > MAX_QTY) throw new Error('Quantity must be 0–20.');
    const next = normalize(plate);
    if (qty === 0) return next.filter(r => r.id !== id);
    const unit = portionGrams(id, portions);
    const row = next.find(r => r.id === id);
    if (row) {
      row.qty = qty;
      row.g = Math.round(qty * unit * 10) / 10;
    } else return add(next, id, qty, portions);
    return next;
  }
  function setItemGrams(plate, id, grams) {
    const g = parseGrams(grams, { max: MAX_ITEM_G });
    const next = normalize(plate);
    const row = next.find(r => r.id === id);
    if (!row) throw new Error('That food is not on the plate.');
    row.g = g;
    return next;
  }
  function addUp(rows) {
    const t = emptyTotals();
    rows.forEach(row => {
      const f = food(row.id); if (!f || !row.qty) return;
      /* (before NP4) t.items += 1; t.portions += row.qty; t.g += f.g * row.qty;
         NUTRIENTS.forEach(k => { t[k] += f[k] * row.qty; });
         const g = t.groups[f.group]; g.g += f.g * row.qty; g.kcal += f.kcal * row.qty; g.portions += row.qty; */
      const grams = itemGrams(row, f);
      t.items += 1; t.portions += row.qty; t.g += grams;
      NUTRIENTS.forEach(k => { t[k] += scaleNutrient(f, k, grams); });
      const g = t.groups[f.group]; g.g += grams; g.kcal += scaleNutrient(f, 'kcal', grams); g.portions += row.qty;
    });
    NUTRIENTS.forEach(k => { t[k] = Math.round(t[k] * 10) / 10; });
    t.g = Math.round(t.g);
    t.kcal = Math.round(t.kcal);
    Object.values(t.groups).forEach(g => { g.kcal = Math.round(g.kcal * 10) / 10; g.g = Math.round(g.g); });
    return t;
  }
  function totals(plate) { return addUp(normalize(plate)); }
  function sumTotals(parts) {
    const t = emptyTotals();
    parts.forEach(part => {
      t.items += part.items; t.portions += part.portions; t.g += part.g;
      NUTRIENTS.forEach(k => { t[k] += part[k]; });
      Object.keys(t.groups).forEach(id => {
        t.groups[id].g += part.groups[id].g;
        t.groups[id].kcal += part.groups[id].kcal;
        t.groups[id].portions += part.groups[id].portions;
      });
    });
    NUTRIENTS.forEach(k => { t[k] = Math.round(t[k] * 10) / 10; });
    t.g = Math.round(t.g); t.kcal = Math.round(t.kcal);
    Object.values(t.groups).forEach(g => { g.kcal = Math.round(g.kcal * 10) / 10; g.g = Math.round(g.g); });
    return t;
  }
  /* Ideal meal (educational): about 1/4 grains, 1/4 protein, 1/2 veg+fruit, dairy on the side.
     Shares use cooked-food weight, not calories, so vegetables are visible. Drinks except milk
     and fats/snacks/sweets are shown separately and are not part of the four plate quarters. */
  function plateWeight(groups) {
    /* Dairy sits on the side; pulses, eggs and meat fill the protein quarter. */
    return {
      grains: groups.grains?.g || 0,
      protein: (groups.pulses?.g || 0) + (groups.eggs?.g || 0) + (groups.meat?.g || 0),
      /* (before NP2) vegfruit: (groups.vegetables?.g || 0) + (groups.fruits?.g || 0), */
      vegfruit: (groups.vegetables?.g || 0) + (groups.leafy?.g || 0) + (groups.fruits?.g || 0),
      dairy: groups.dairy?.g || 0,
      extras: (groups.fats?.g || 0) + (groups.snacks?.g || 0) + (groups.sweets?.g || 0),
      /* (before NP3) drinks: groups.drinks?.g || 0 */
      drinks: groups.drinks?.g || 0,
      /* NP3: condiments (spices, pickle, mustard oil) sit on the side, outside the four quarters. */
      condiments: groups.condiments?.g || 0
    };
  }
  const IDEAL = { grains: 0.25, protein: 0.25, vegfruit: 0.50 };
  function balance(plate) {
    const t = totals(plate), w = plateWeight(t.groups);
    const core = w.grains + w.protein + w.vegfruit;
    const share = key => core ? w[key] / core : 0;
    return {
      totals: t, weight: w, core,
      shares: { grains: share('grains'), protein: share('protein'), vegfruit: share('vegfruit') },
      ideal: IDEAL,
      dairy: w.dairy, extras: w.extras, drinks: w.drinks
    };
  }
  function groupLabel(id) {
    const row = D.groups.find(g => g[0] === id);
    return row ? row[1] : id;
  }
  return { NUTRIENTS, LABELS, MAX_QTY, MAX_ITEMS, MIN_G, MAX_PORTION_G, MAX_ITEM_G, DIETS,
    validateFood, allowed, filterFoods, food, defaultGrams, parseGrams, portionGrams,
    cleanPortions, setPortion, resetPortion, resetAllPortions, scaleNutrient, itemGrams,
    normalize, add, setQty, setItemGrams, addUp, totals, sumTotals, balance, plateWeight,
    IDEAL, groupLabel, foods: D };
});
