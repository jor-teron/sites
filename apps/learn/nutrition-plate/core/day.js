/* NP-1b: a day's meals, tips, and localStorage save/load.
   NP4: personal portions on this device; saved meals store actual grams.
   NP5: a week of days, week totals, copy, and a Monday start the user can change.
   NP7: "Every day" template. Each weekday meal slot that has no food shows Every day's
   meal for that slot (live, slot by slot). A slot with food is custom and is never
   overwritten. Editing an inherited slot makes a custom copy (copy-on-write).
   Copy this day / Copy to Mon–Fri are gone. */
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
  const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  /* (before NP7) const WORKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri']; */
  /* NP7: the Every day template is selected with this id; it is not a calendar day. */
  const EVERY = 'every';
  const WEEKDAY_LABELS = {
    mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
    fri: 'Friday', sat: 'Saturday', sun: 'Sunday'
  };
  const WEEKDAY_SHORT = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  const JS_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const uid = () => 'np-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const copy = v => JSON.parse(JSON.stringify(v));
  function emptyMeals() { return { breakfast: [], lunch: [], snack: [], dinner: [] }; }
  function emptyWeek() {
    const week = {};
    WEEKDAYS.forEach(id => { week[id] = emptyMeals(); });
    return week;
  }
  function weekdayFromDate(now) {
    const d = now instanceof Date ? now : (now != null && now !== '' ? new Date(now) : new Date());
    if (Number.isNaN(d.getTime())) return JS_DAYS[new Date().getDay()];
    return JS_DAYS[d.getDay()];
  }
  function cleanWeekStart(id) { return WEEKDAYS.includes(id) ? id : 'mon'; }
  function weekOrder(start) {
    const id = cleanWeekStart(start);
    const i = WEEKDAYS.indexOf(id);
    return WEEKDAYS.slice(i).concat(WEEKDAYS.slice(0, i));
  }
  function weekdayLabel(id, short) {
    if (id === EVERY) return 'Every day';
    return (short ? WEEKDAY_SHORT[id] : WEEKDAY_LABELS[id]) || id;
  }
  function cleanMeals(meals) {
    const out = emptyMeals();
    mealIds.forEach(id => { out[id] = NP.normalize(meals && meals[id]); });
    return out;
  }
  function cleanWeek(raw) {
    const week = emptyWeek();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return week;
    WEEKDAYS.forEach(id => { week[id] = cleanMeals(raw[id]); });
    return week;
  }
  function fresh(now) {
    const week = emptyWeek();
    const weekDay = weekdayFromDate(now);
    return { version: 1, person: { age: 'adult', activity: 'moderate', diet: 'all', sex: 'unspecified' },
      /* meals is the plate editor: one day of the week (same object as week[weekDay]). */
      meals: week[weekDay], meal: 'breakfast', week, weekDay, weekStart: 'mon', everyDay: emptyMeals(),
      plates: [], days: [], scores: { guess: 0, plate: 0, swaps: 0 },
      portions: {} };
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
    return { id: row.id.slice(0, 80), name, person: cleanPerson(row.person), meals: cleanMeals(row.meals) };
  }
  function hasWeek(raw) {
    return !!(raw && raw.week && typeof raw.week === 'object' && !Array.isArray(raw.week));
  }
  function restore(text, now) {
    let raw; try { raw = JSON.parse(text); } catch (e) { throw new Error('Saved data could not be read.'); }
    if (!raw || typeof raw !== 'object') throw new Error('Saved data could not be read.');
    const state = fresh(now);
    state.person = cleanPerson(raw.person);
    state.meal = mealIds.includes(raw.meal) ? raw.meal : 'breakfast';
    state.weekStart = cleanWeekStart(raw.weekStart);
    const todayId = weekdayFromDate(now);
    /* Today's unsaved day (pre-NP5 `meals`) migrates into this week on today's weekday.
       If a week is already stored, it is the source of truth and is not wiped. */
    /* NP7: old saves have no Every day — it starts empty; weekday meals stay custom. */
    state.everyDay = cleanMeals(raw.everyDay);
    if (hasWeek(raw)) {
      state.week = cleanWeek(raw.week);
      /* (before NP7) state.weekDay = WEEKDAYS.includes(raw.weekDay) ? raw.weekDay : todayId; */
      state.weekDay = WEEKDAYS.includes(raw.weekDay) || raw.weekDay === EVERY ? raw.weekDay : todayId;
    } else {
      state.week = emptyWeek();
      /* (before NP5) mealIds.forEach(id => { state.meals[id] = cleanMeal(raw.meals && raw.meals[id]); }); */
      state.week[todayId] = cleanMeals(raw.meals);
      state.weekDay = todayId;
    }
    /* (before NP7) state.meals = state.week[state.weekDay]; */
    state.meals = state.weekDay === EVERY ? state.everyDay : state.week[state.weekDay];
    state.plates = Array.isArray(raw.plates) ? raw.plates.map(cleanSavedPlate).filter(Boolean).slice(0, MAX_SAVED) : [];
    state.days = Array.isArray(raw.days) ? raw.days.map(cleanSavedDay).filter(Boolean).slice(0, MAX_SAVED) : [];
    const sc = raw.scores && typeof raw.scores === 'object' ? raw.scores : {};
    state.scores = {
      guess: Number.isInteger(sc.guess) && sc.guess >= 0 ? Math.min(8, sc.guess) : 0,
      plate: Number.isInteger(sc.plate) && sc.plate >= 0 ? Math.min(20, sc.plate) : 0,
      swaps: Number.isInteger(sc.swaps) && sc.swaps >= 0 ? Math.min(8, sc.swaps) : 0
    };
    /* Personal portion sizes stay on this device. Blank or missing = the food's default grams.
       Saved meals already went through cleanMeal / NP.normalize, which stores actual grams
       (old qty-only rows become qty × the default household portion). */
    state.portions = NP.cleanPortions(raw.portions);
    return state;
  }
  function dayTotals(meals) {
    return NP.sumTotals(mealIds.map(id => NP.totals(meals[id] || [])));
  }
  /* (before NP7) function weekTotals(week) {
    const w = cleanWeek(week);
    return NP.sumTotals(WEEKDAYS.map(id => dayTotals(w[id])));
  } */
  /* NP7: a slot inherits Every day's meal when it has no food of its own. */
  function resolveMeals(dayMeals, everyDay) {
    const day = cleanMeals(dayMeals), every = cleanMeals(everyDay), out = emptyMeals();
    mealIds.forEach(id => { out[id] = day[id].length ? day[id] : every[id]; });
    return out;
  }
  function inherits(dayMeals, everyDay, slot) {
    const day = dayMeals && Array.isArray(dayMeals[slot]) ? dayMeals[slot] : [];
    const every = everyDay && Array.isArray(everyDay[slot]) ? everyDay[slot] : [];
    return !day.length && every.length > 0;
  }
  /* The meals the plate editor shows for the selected day (Every day shows the template itself). */
  function shownMeals(state) {
    if (state.weekDay === EVERY) return cleanMeals(state.meals);
    return resolveMeals(state.meals, state.everyDay);
  }
  function resolvedWeek(week, everyDay) {
    const w = cleanWeek(week), out = {};
    WEEKDAYS.forEach(id => { out[id] = resolveMeals(w[id], everyDay); });
    return out;
  }
  /* Seven calendar days only; Every day counts on the days that inherit it, never as an 8th day. */
  function weekTotals(week, everyDay) {
    const w = resolvedWeek(week, everyDay);
    return NP.sumTotals(WEEKDAYS.map(id => dayTotals(w[id])));
  }
  function weekTargets(person) {
    const p = cleanPerson(person);
    const g = T.targets(p.age, p.activity, p.sex);
    const out = { age: g.age, activity: g.activity, sex: g.sex };
    ['kcal', 'prot', 'fat', 'carb', 'fibre', 'sugar', 'fe', 'ca', 'vc'].forEach(k => { out[k] = g[k] * 7; });
    return out;
  }
  /* (before NP7) function commitCurrent(state) {
    const week = cleanWeek(state && state.week);
    const day = WEEKDAYS.includes(state && state.weekDay) ? state.weekDay : weekdayFromDate();
    week[day] = cleanMeals(state && state.meals);
    return { week, weekDay: day };
  }
  function selectWeekDay(state, id) {
    if (!WEEKDAYS.includes(id)) throw new Error('Pick a day of the week.');
    const committed = commitCurrent(state);
    return Object.assign({}, state, { week: committed.week, weekDay: id, meals: committed.week[id] });
  } */
  function commitCurrent(state) {
    const week = cleanWeek(state && state.week);
    let everyDay = cleanMeals(state && state.everyDay);
    const sel = state && state.weekDay;
    const day = WEEKDAYS.includes(sel) || sel === EVERY ? sel : weekdayFromDate();
    if (day === EVERY) everyDay = cleanMeals(state && state.meals);
    else week[day] = cleanMeals(state && state.meals);
    return { week, everyDay, weekDay: day, meals: day === EVERY ? everyDay : week[day] };
  }
  function selectWeekDay(state, id) {
    if (!WEEKDAYS.includes(id) && id !== EVERY) throw new Error('Pick a day of the week.');
    const c = commitCurrent(state);
    return Object.assign({}, state, { week: c.week, everyDay: c.everyDay, weekDay: id,
      meals: id === EVERY ? c.everyDay : c.week[id] });
  }
  /* Write one meal slot of the selected day. On a weekday showing Every day's meal, the
     caller passes the edited copy of what was showing, so only this slot becomes custom.
     An empty list clears the slot, and it inherits Every day again. */
  function setSlot(state, slot, items) {
    if (!mealIds.includes(slot)) throw new Error('Pick a meal.');
    const c = commitCurrent(state);
    c.meals[slot] = NP.normalize(items);
    return Object.assign({}, state, { week: c.week, everyDay: c.everyDay, weekDay: c.weekDay, meals: c.meals });
  }
  function setWeekStart(state, start) {
    return Object.assign({}, state, { weekStart: cleanWeekStart(start) });
  }
  /* (before NP7) Copy this day / Copy to Mon–Fri were replaced by Every day.
  function copyDay(state, fromId, toIds) {
    const from = WEEKDAYS.includes(fromId) ? fromId : null;
    if (!from) throw new Error('Pick a day to copy from.');
    const dest = (Array.isArray(toIds) ? toIds : [toIds]).filter(id => WEEKDAYS.includes(id));
    if (!dest.length) throw new Error('Pick a day to copy to.');
    const committed = commitCurrent(state);
    const week = committed.week;
    const source = copy(cleanMeals(week[from]));
    dest.forEach(id => { week[id] = copy(source); });
    return Object.assign({}, state, { week, weekDay: committed.weekDay, meals: week[committed.weekDay] });
  } */
  function mergedRows(meals) {
    const map = {};
    mealIds.forEach(id => {
      (meals[id] || []).forEach(row => {
        if (!map[row.id]) map[row.id] = { id: row.id, qty: 0, g: 0 };
        map[row.id].qty += row.qty;
        map[row.id].g += row.g || 0;
      });
    });
    return Object.keys(map).map(id => map[id]);
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
    return Object.assign({}, state, { plates: state.plates.concat(row) });
  }
  /* (before NP7) function loadPlate(state, id) {
    const row = state.plates.find(p => p.id === id); if (!row) throw new Error('That plate was not found.');
    const committed = commitCurrent(state);
    const meals = copy(committed.week[committed.weekDay]);
    meals[state.meal] = copy(row.items);
    committed.week[committed.weekDay] = meals;
    return Object.assign({}, state, { week: committed.week, weekDay: committed.weekDay, meals });
  } */
  function loadPlate(state, id) {
    const row = state.plates.find(p => p.id === id); if (!row) throw new Error('That plate was not found.');
    return setSlot(state, state.meal, copy(row.items));
  }
  function deletePlate(state, id) { return Object.assign({}, state, { plates: state.plates.filter(p => p.id !== id) }); }
  function saveDay(state, name) {
    if (state.days.length >= MAX_SAVED) throw new Error('Maximum 20 saved days. Delete one first.');
    const text = (name || '').trim().slice(0, 80); if (!text) throw new Error('Give this day a name.');
    /* (before NP7) const row = { id: uid(), name: text, person: copy(state.person), meals: copy(cleanMeals(state.meals)) }; */
    /* NP7: a saved day keeps what the day shows, including meals it takes from Every day. */
    const row = { id: uid(), name: text, person: copy(state.person), meals: copy(shownMeals(state)) };
    return Object.assign({}, state, { days: state.days.concat(row) });
  }
  function loadDay(state, id) {
    const row = state.days.find(d => d.id === id); if (!row) throw new Error('That day was not found.');
    /* (before NP7) const committed = commitCurrent(state);
    committed.week[committed.weekDay] = copy(cleanMeals(row.meals));
    return Object.assign({}, state, { person: copy(row.person), week: committed.week, weekDay: committed.weekDay,
      meals: committed.week[committed.weekDay] }); */
    const c = commitCurrent(state);
    const meals = copy(cleanMeals(row.meals));
    if (c.weekDay === EVERY) c.everyDay = meals; else c.week[c.weekDay] = meals;
    return Object.assign({}, state, { person: copy(row.person), week: c.week, everyDay: c.everyDay, weekDay: c.weekDay,
      meals });
  }
  function deleteDay(state, id) { return Object.assign({}, state, { days: state.days.filter(d => d.id !== id) }); }
  /* (before NP7) return { KEY, MEALS, MAX_SAVED, WEEKDAYS, WORKDAYS, WEEKDAY_LABELS, WEEKDAY_SHORT, uid, fresh, restore,
    cleanPerson, cleanMeals, cleanWeek, cleanWeekStart, emptyMeals, emptyWeek, weekdayFromDate, weekOrder,
    weekdayLabel, dayTotals, weekTotals, weekTargets, mealTotals, mergedRows, tips, selectWeekDay, setWeekStart,
    copyDay, savePlate, loadPlate, deletePlate, saveDay, loadDay, deleteDay, targets: T }; */
  return { KEY, MEALS, MAX_SAVED, WEEKDAYS, EVERY, WEEKDAY_LABELS, WEEKDAY_SHORT, uid, fresh, restore,
    cleanPerson, cleanMeals, cleanWeek, cleanWeekStart, emptyMeals, emptyWeek, weekdayFromDate, weekOrder,
    weekdayLabel, dayTotals, weekTotals, weekTargets, mealTotals, mergedRows, tips, selectWeekDay, setWeekStart,
    resolveMeals, resolvedWeek, inherits, shownMeals, setSlot,
    savePlate, loadPlate, deletePlate, saveDay, loadDay, deleteDay, targets: T };
});
