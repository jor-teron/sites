/* NP-1b: a day's meals, tips, and localStorage save/load. */
(function (root, factory) {
  const NP = typeof module === 'object' && module.exports ? require('./plate.js') : root.NP;
  const T = typeof module === 'object' && module.exports ? require('./targets.js') : root.NPTargets;
  const model = factory(NP, T);
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.NPDay = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (NP, T) {
  'use strict';
  const KEY = 'learn.nutrition-plate.v1', MAX_SAVED = 20;
  const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['snack', 'Snacks'], ['dinner', 'Dinner']];
  const mealIds = MEALS.map(m => m[0]);
  const uid = () => 'np-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const copy = v => JSON.parse(JSON.stringify(v));
  function emptyMeals() { return { breakfast: [], lunch: [], snack: [], dinner: [] }; }
  function fresh() {
    return { version: 1, person: { age: 'adult', activity: 'moderate', diet: 'all', sex: 'unspecified' },
      meals: emptyMeals(), meal: 'breakfast', plates: [], days: [], scores: { guess: 0, plate: 0, swaps: 0 } };
  }
  function cleanMeal(list) { return NP.normalize(list); }
  function cleanPerson(p) {
    const age = T.ages.some(a => a.id === (p && p.age)) ? p.age : 'adult';
    const activity = T.activities.some(a => a.id === (p && p.activity)) ? p.activity : 'moderate';
    const diet = T.diets.some(d => d.id === (p && p.diet)) ? p.diet : 'all';
    const sex = T.sexes.some(s => s.id === (p && p.sex)) ? p.sex : 'unspecified';
    return { age, activity, diet, sex };
  }
  function cleanSavedPlate(row) {
    if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') return null;
    const name = row.name.trim().slice(0, 80); if (!name) return null;
    return { id: row.id.slice(0, 80), name, items: cleanMeal(row.items) };
  }
  function cleanSavedDay(row) {
    if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') return null;
    const name = row.name.trim().slice(0, 80); if (!name) return null;
    const meals = emptyMeals();
    mealIds.forEach(id => { meals[id] = cleanMeal(row.meals && row.meals[id]); });
    return { id: row.id.slice(0, 80), name, person: cleanPerson(row.person), meals };
  }
  function restore(text) {
    let raw; try { raw = JSON.parse(text); } catch (e) { throw new Error('Saved data could not be read.'); }
    if (!raw || typeof raw !== 'object') throw new Error('Saved data could not be read.');
    const state = fresh();
    state.person = cleanPerson(raw.person);
    state.meal = mealIds.includes(raw.meal) ? raw.meal : 'breakfast';
    mealIds.forEach(id => { state.meals[id] = cleanMeal(raw.meals && raw.meals[id]); });
    state.plates = Array.isArray(raw.plates) ? raw.plates.map(cleanSavedPlate).filter(Boolean).slice(0, MAX_SAVED) : [];
    state.days = Array.isArray(raw.days) ? raw.days.map(cleanSavedDay).filter(Boolean).slice(0, MAX_SAVED) : [];
    const sc = raw.scores && typeof raw.scores === 'object' ? raw.scores : {};
    state.scores = {
      guess: Number.isInteger(sc.guess) && sc.guess >= 0 ? Math.min(8, sc.guess) : 0,
      plate: Number.isInteger(sc.plate) && sc.plate >= 0 ? Math.min(20, sc.plate) : 0,
      swaps: Number.isInteger(sc.swaps) && sc.swaps >= 0 ? Math.min(8, sc.swaps) : 0
    };
    return state;
  }
  function dayTotals(meals) {
    return NP.sumTotals(mealIds.map(id => NP.totals(meals[id] || [])));
  }
  function mergedRows(meals) {
    const map = {};
    mealIds.forEach(id => { (meals[id] || []).forEach(row => { map[row.id] = (map[row.id] || 0) + row.qty; }); });
    return Object.keys(map).map(id => ({ id, qty: map[id] }));
  }
  function mealTotals(meals) {
    const out = {};
    mealIds.forEach(id => { out[id] = NP.totals(meals[id] || []); });
    return out;
  }
  function tips(meals, person) {
    const t = dayTotals(meals), g = T.targets(person.age, person.activity, person.sex);
    const out = [];
    if (!t.portions) out.push('Start a meal — add foods from the library to breakfast, lunch, snacks or dinner.');
    else {
      if (t.prot < g.prot * 0.7) out.push('Add a protein — dal, curd, paneer, eggs, fish or meat.');
      /* (before NP2) if ((t.groups.vegetables.portions || 0) < 2) out.push('Add vegetables — try to fill about half of each plate.'); */
      if (((t.groups.vegetables.portions || 0) + (t.groups.leafy?.portions || 0)) < 2) out.push('Add vegetables — try to fill about half of each plate.');
      if (t.sugar > g.sugar) out.push('Too much sugar — sweet drinks, juice and desserts add up quickly.');
      if (t.fibre < g.fibre * 0.6 && t.portions) out.push('Add fibre — vegetables, fruit, whole grains and dals help.');
      if (t.kcal > g.kcal * 1.15) out.push('Energy is above the rough daily target — check portions and fried snacks.');
      else if (t.kcal < g.kcal * 0.6 && t.portions) out.push('Energy is well below the rough target — add a staple such as roti or rice if this is a full day.');
      if (t.ca < g.ca * 0.5) out.push('Add a calcium source — milk, curd, paneer or ragi.');
      if (t.fe < g.fe * 0.5) out.push('Add an iron-rich food — greens, dals, ragi, eggs or meat. Vitamin C helps the body use it.');
    }
    return out.slice(0, 4);
  }
  function savePlate(state, name) {
    if (state.plates.length >= MAX_SAVED) throw new Error('Maximum 20 saved plates. Delete one first.');
    const text = (name || '').trim().slice(0, 80); if (!text) throw new Error('Give this plate a name.');
    const row = { id: uid(), name: text, items: copy(cleanMeal(state.meals[state.meal])) };
    return { ...state, plates: state.plates.concat(row) };
  }
  function loadPlate(state, id) {
    const row = state.plates.find(p => p.id === id); if (!row) throw new Error('That plate was not found.');
    const meals = copy(state.meals); meals[state.meal] = copy(row.items);
    return { ...state, meals };
  }
  function deletePlate(state, id) { return { ...state, plates: state.plates.filter(p => p.id !== id) }; }
  function saveDay(state, name) {
    if (state.days.length >= MAX_SAVED) throw new Error('Maximum 20 saved days. Delete one first.');
    const text = (name || '').trim().slice(0, 80); if (!text) throw new Error('Give this day a name.');
    const row = { id: uid(), name: text, person: copy(state.person), meals: copy(state.meals) };
    return { ...state, days: state.days.concat(row) };
  }
  function loadDay(state, id) {
    const row = state.days.find(d => d.id === id); if (!row) throw new Error('That day was not found.');
    return { ...state, person: copy(row.person), meals: copy(row.meals) };
  }
  function deleteDay(state, id) { return { ...state, days: state.days.filter(d => d.id !== id) }; }
  return { KEY, MEALS, MAX_SAVED, uid, fresh, restore, cleanPerson, dayTotals, mealTotals, mergedRows, tips,
    savePlate, loadPlate, deletePlate, saveDay, loadDay, deleteDay, targets: T };
});
