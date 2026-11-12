/* NP5: week planner — seven days, week totals, copy, week start, migration.
   Pure model tests (no browser). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../core/foods.js');
const NP = require('../core/plate.js');
const Day = require('../core/day.js');
const G = require('../core/games.js');
const T = require('../core/targets.js');

const roti = F.byId.roti;
const rice = F.byId.rice;
const THU = new Date('2026-11-12T12:00:00+05:30'); /* Thursday */
const WED = new Date('2026-11-11T12:00:00+05:30'); /* Wednesday */

test('a week has 7 days × 4 meals', () => {
  const week = Day.emptyWeek();
  assert.equal(Day.WEEKDAYS.length, 7);
  assert.deepEqual(Day.WEEKDAYS, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  assert.equal(Object.keys(week).length, 7);
  Day.WEEKDAYS.forEach(id => {
    assert.deepEqual(Object.keys(week[id]).sort(), ['breakfast', 'dinner', 'lunch', 'snack']);
    Day.MEALS.forEach(([meal]) => assert.deepEqual(week[id][meal], []));
  });
  const state = Day.fresh(THU);
  assert.equal(state.weekDay, 'thu');
  assert.equal(state.weekStart, 'mon');
  assert.equal(state.meals, state.week.thu);
});

test('week totals equal the sum of the days and are compared to 7× the daily target', () => {
  const person = { age: 'adult', activity: 'moderate', diet: 'all', sex: 'unspecified' };
  let state = Day.fresh(THU);
  state = Day.selectWeekDay(state, 'mon');
  state.meals.breakfast = NP.add([], 'roti', 2);
  state = Day.selectWeekDay(state, 'tue');
  state.meals.lunch = NP.add([], 'rice', 1);
  state = Day.selectWeekDay(state, 'sun');
  state.meals.dinner = NP.add([], 'dal_tadka', 1);
  const parts = Day.WEEKDAYS.map(id => Day.dayTotals(state.week[id]));
  const week = Day.weekTotals(state.week);
  const sum = NP.sumTotals(parts);
  assert.equal(week.kcal, sum.kcal);
  assert.equal(week.prot, sum.prot);
  assert.equal(week.g, sum.g);
  assert.equal(week.portions, 4);
  assert.equal(week.kcal, Math.round(roti.kcal * 2 + rice.kcal + F.byId.dal_tadka.kcal));
  const daily = T.targets(person.age, person.activity, person.sex);
  const target = Day.weekTargets(person);
  assert.equal(target.kcal, daily.kcal * 7);
  assert.equal(target.prot, daily.prot * 7);
  assert.equal(target.fe, daily.fe * 7);
  assert.equal(target.sugar, daily.sugar * 7);
  assert.equal(target.ca, daily.ca * 7);
  assert.ok(week.kcal < target.kcal);
});

test('copy a day onto another day; optional copy across weekdays; destination changes only after the action', () => {
  let state = Day.fresh(THU);
  state = Day.selectWeekDay(state, 'mon');
  const portions = NP.setPortion({}, 'roti', 50);
  state.meals.breakfast = NP.add([], 'roti', 2, portions);
  state.meals.lunch = NP.add([], 'rice', 1);
  const monG = state.meals.breakfast[0].g;
  assert.equal(monG, 100);
  /* Before the action, Tuesday is still empty. */
  assert.deepEqual(state.week.tue.breakfast, []);
  assert.deepEqual(state.week.fri.breakfast, []);
  state = Day.copyDay(state, 'mon', 'tue');
  assert.equal(state.week.tue.breakfast[0].id, 'roti');
  assert.equal(state.week.tue.breakfast[0].g, 100);
  assert.equal(state.week.tue.lunch[0].id, 'rice');
  assert.deepEqual(state.week.wed.breakfast, []);
  assert.deepEqual(state.week.fri.breakfast, []);
  /* Separate copy: later edits to Monday do not change the already-copied Tuesday grams. */
  state = Day.selectWeekDay(state, 'mon');
  state.meals.breakfast = NP.setItemGrams(state.meals.breakfast, 'roti', 75);
  assert.equal(state.week.mon.breakfast[0].g, 75);
  assert.equal(state.week.tue.breakfast[0].g, 100);
  const beforeFri = JSON.stringify(state.week.sat);
  state = Day.copyDay(state, 'tue', Day.WORKDAYS);
  Day.WORKDAYS.forEach(id => {
    assert.equal(state.week[id].breakfast[0].g, 100, id);
    assert.equal(state.week[id].lunch[0].id, 'rice', id);
  });
  /* Saturday and Sunday are not weekdays, so they stay as they were. */
  assert.equal(JSON.stringify(state.week.sat), beforeFri);
  assert.deepEqual(state.week.sun.breakfast, []);
  assert.throws(() => Day.copyDay(state, 'mon', 'nope'), /copy to/i);
  assert.throws(() => Day.copyDay(state, 'nope', 'tue'), /copy from/i);
});

test('week start defaults to Monday and can be changed; the seven days follow that start', () => {
  const state = Day.fresh(THU);
  assert.equal(state.weekStart, 'mon');
  assert.deepEqual(Day.weekOrder(), ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  assert.deepEqual(Day.weekOrder('mon'), Day.WEEKDAYS);
  const fromSun = Day.setWeekStart(state, 'sun');
  assert.equal(fromSun.weekStart, 'sun');
  assert.deepEqual(Day.weekOrder(fromSun.weekStart), ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
  const fromWed = Day.setWeekStart(state, 'wed');
  assert.deepEqual(Day.weekOrder(fromWed.weekStart), ['wed', 'thu', 'fri', 'sat', 'sun', 'mon', 'tue']);
  assert.equal(Day.setWeekStart(state, 'nope').weekStart, 'mon');
  assert.equal(Day.cleanWeekStart('fri'), 'fri');
  /* Changing the start does not move meals off their weekday. */
  let filled = Day.selectWeekDay(state, 'thu');
  filled.meals.breakfast = NP.add([], 'roti', 1);
  filled = Day.setWeekStart(filled, 'sun');
  assert.equal(filled.week.thu.breakfast[0].id, 'roti');
  assert.equal(filled.weekDay, 'thu');
});

test('the plate editor reads and writes one day of the week, including NP4 grams and portions', () => {
  const portions = NP.setPortion({}, 'roti', 50);
  let state = Day.fresh(THU);
  state.portions = portions;
  state = Day.selectWeekDay(state, 'wed');
  state.meals.breakfast = NP.add([], 'roti', 2, portions);
  state.meals.breakfast = NP.setItemGrams(state.meals.breakfast, 'roti', 75);
  assert.equal(state.week.wed.breakfast[0].g, 75);
  assert.equal(state.meals, state.week.wed);
  state = Day.selectWeekDay(state, 'thu');
  assert.deepEqual(state.meals.breakfast, []);
  assert.equal(state.week.wed.breakfast[0].g, 75);
  state.meals.lunch = NP.add([], 'rice', 1, portions);
  assert.equal(state.week.thu.lunch[0].g, rice.g);
  state = Day.selectWeekDay(state, 'wed');
  assert.equal(state.meals.breakfast[0].g, 75);
  assert.equal(NP.totals(state.meals.breakfast).kcal, Math.round(roti.kcal * (75 / roti.g)));
  assert.equal(NP.portionGrams('roti', state.portions), 50);
});

test("today's unsaved day migrates into the week and is not lost", () => {
  const raw = {
    person: { age: 'teen', activity: 'active', diet: 'egg' },
    meal: 'lunch',
    meals: {
      breakfast: [{ id: 'roti', qty: 2, g: 80 }],
      lunch: [{ id: 'idli', qty: 3 }],
      snack: [],
      dinner: []
    }
  };
  const state = Day.restore(JSON.stringify(raw), WED);
  assert.equal(Day.weekdayFromDate(WED), 'wed');
  assert.equal(state.weekDay, 'wed');
  assert.equal(state.meals, state.week.wed);
  assert.equal(state.meals.breakfast[0].id, 'roti');
  assert.equal(state.meals.breakfast[0].g, 80);
  assert.equal(state.meals.lunch[0].id, 'idli');
  assert.equal(state.meals.lunch[0].g, F.byId.idli.g * 3);
  assert.equal(state.meal, 'lunch');
  Day.WEEKDAYS.filter(id => id !== 'wed').forEach(id => {
    assert.deepEqual(state.week[id].breakfast, []);
  });
  /* A later restore of the migrated state keeps the day on Wednesday. */
  const again = Day.restore(JSON.stringify(state), THU);
  assert.equal(again.weekDay, 'wed');
  assert.equal(again.week.wed.breakfast[0].g, 80);
  assert.equal(again.meals, again.week.wed);
});

test('named snapshots, personal portions, and old qty-only saves still load', () => {
  let state = Day.fresh(THU);
  state.portions = NP.setPortion({}, 'roti', 50);
  state.person = Day.cleanPerson({ age: 'teen', activity: 'active', diet: 'egg', sex: 'female' });
  state.meals.breakfast = NP.add([], 'idli', 3);
  state = Day.savePlate(state, 'Idli breakfast');
  state = Day.saveDay(state, 'School day');
  const copy = Day.restore(JSON.stringify(state), THU);
  assert.equal(copy.person.age, 'teen');
  assert.equal(copy.portions.roti, 50);
  assert.equal(copy.plates[0].name, 'Idli breakfast');
  assert.equal(copy.days[0].name, 'School day');
  assert.equal(copy.days[0].meals.breakfast[0].qty, 3);
  const intoDinner = Day.loadPlate({ ...copy, meal: 'dinner' }, copy.plates[0].id);
  assert.deepEqual(intoDinner.meals.dinner, copy.plates[0].items);
  assert.equal(intoDinner.week[intoDinner.weekDay].dinner[0].id, 'idli');
  const day2 = Day.loadDay(copy, copy.days[0].id);
  assert.equal(day2.person.activity, 'active');
  assert.equal(day2.meals.breakfast.length, 1);
  const old = Day.restore(JSON.stringify({
    person: { age: 'teen', activity: 'active', diet: 'egg' },
    meals: { breakfast: [{ id: 'roti', qty: 2 }, { id: 'hukoti', qty: 1 }], lunch: [], snack: [], dinner: [] },
    plates: [{ id: 'p1', name: 'Old plate', items: [{ id: 'idli', qty: 3 }] }],
    days: [{ id: 'd1', name: 'Old day', person: { age: 'teen', activity: 'active', diet: 'egg' },
      meals: { breakfast: [{ id: 'idli', qty: 3 }], lunch: [], snack: [], dinner: [] } }],
    portions: { roti: 55 }
  }), THU);
  assert.equal(old.week.thu.breakfast[0].g, roti.g * 2);
  assert.equal(old.week.thu.breakfast[1].g, F.byId.hukoti.g);
  assert.equal(old.plates[0].items[0].g, F.byId.idli.g * 3);
  assert.equal(old.days[0].meals.breakfast[0].g, F.byId.idli.g * 3);
  assert.equal(old.portions.roti, 55);
  assert.equal(old.person.sex, 'unspecified');
});

test('changing a personal portion later does not rewrite already-saved week-day grams', () => {
  let state = Day.fresh(THU);
  const portions = NP.setPortion({}, 'roti', 50);
  state.portions = portions;
  state = Day.selectWeekDay(state, 'mon');
  state.meals.breakfast = NP.add([], 'roti', 2, portions);
  const savedG = state.week.mon.breakfast[0].g;
  const savedKcal = NP.totals(state.week.mon.breakfast).kcal;
  assert.equal(savedG, 100);
  state.portions = NP.setPortion(state.portions, 'roti', 80);
  assert.equal(state.week.mon.breakfast[0].g, savedG);
  assert.equal(NP.totals(state.week.mon.breakfast).kcal, savedKcal);
  const copy = Day.restore(JSON.stringify(state), THU);
  assert.equal(copy.week.mon.breakfast[0].g, 100);
  assert.equal(NP.totals(copy.week.mon.breakfast).kcal, savedKcal);
  assert.equal(NP.portionGrams('roti', copy.portions), 80);
});

test('games still use default portions', () => {
  const portions = NP.setPortion(NP.setPortion({}, 'roti', 80), 'rice', 300);
  const rng = G.rngFrom(42);
  const q = G.guessQuestion([], rng);
  assert.equal(q.kcal, F.byId[q.id].kcal);
  const ch = G.challenge('fried-lunch');
  const withDefaults = NP.totals(ch.start);
  const customRice = NP.totals(NP.add([], 'rice', 1, portions));
  assert.notEqual(customRice.g, F.byId.rice.g);
  assert.equal(withDefaults.g, F.byId.rice.g + F.byId.samosa.g * 2 + F.byId.cola.g);
  let plate = ch.start;
  ch.fix.forEach(step => { plate = G.applyFix(plate, step); });
  assert.equal(G.isBalanced(plate), true);
});
