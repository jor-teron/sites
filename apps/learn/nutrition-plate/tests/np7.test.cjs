/* NP7: Every day template — slot-level inheritance, copy-on-write, week totals, migration.
   Pure model tests (no browser). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../core/foods.js');
const NP = require('../core/plate.js');
const Day = require('../core/day.js');

const THU = new Date('2026-11-12T12:00:00+05:30'); /* Thursday */
const kcal = (id, n) => NP.totals(NP.add([], id, n || 1)).kcal;

function withEveryDay() {
  let s = Day.fresh(THU);
  s = Day.selectWeekDay(s, Day.EVERY);
  s = Day.setSlot(s, 'breakfast', NP.add([], 'idli', 2));
  s = Day.setSlot(s, 'lunch', NP.add([], 'rice', 1));
  s = Day.setSlot(s, 'dinner', NP.add([], 'roti', 2));
  return s;
}

test('Every day is a template, not a weekday; Copy helpers are gone', () => {
  const s = Day.fresh(THU);
  assert.equal(Day.EVERY, 'every');
  assert.equal(Day.WEEKDAYS.length, 7);
  assert.ok(!Day.WEEKDAYS.includes(Day.EVERY));
  assert.deepEqual(s.everyDay, Day.emptyMeals());
  assert.equal(Day.weekdayLabel(Day.EVERY), 'Every day');
  assert.equal(Day.copyDay, undefined);
  assert.equal(Day.WORKDAYS, undefined);
  const e = Day.selectWeekDay(s, Day.EVERY);
  assert.equal(e.weekDay, 'every');
  assert.equal(e.meals, e.everyDay);
});

test('Every day fills empty days and slots; custom slots are not overwritten', () => {
  let s = withEveryDay();
  s = Day.selectWeekDay(s, 'sat');
  s = Day.setSlot(s, 'dinner', NP.add([], 'chicken_curry', 1));
  Day.WEEKDAYS.forEach(id => {
    const r = Day.resolveMeals(s.week[id], s.everyDay);
    assert.equal(r.breakfast[0].id, 'idli', id);
    assert.equal(r.lunch[0].id, 'rice', id);
    assert.equal(r.dinner[0].id, id === 'sat' ? 'chicken_curry' : 'roti', id);
  });
  /* Live template: changing Every day updates inheriting slots, never Saturday's custom dinner. */
  s = Day.selectWeekDay(s, Day.EVERY);
  s = Day.setSlot(s, 'dinner', NP.add([], 'dal_tadka', 1));
  s = Day.setSlot(s, 'breakfast', NP.add([], 'poha', 1));
  const sat = Day.resolveMeals(s.week.sat, s.everyDay), mon = Day.resolveMeals(s.week.mon, s.everyDay);
  assert.equal(sat.dinner[0].id, 'chicken_curry');
  assert.equal(sat.dinner.length, 1);
  assert.equal(sat.breakfast[0].id, 'poha');
  assert.equal(mon.dinner[0].id, 'dal_tadka');
  assert.equal(mon.breakfast[0].id, 'poha');
  /* Weekday storage still holds only custom slots. */
  assert.deepEqual(s.week.mon.breakfast, []);
});

test('meal slots are independent (Sat dinner custom, Sat breakfast inherits)', () => {
  let s = withEveryDay();
  s = Day.selectWeekDay(s, 'sat');
  s = Day.setSlot(s, 'dinner', NP.add([], 'fish_curry', 1));
  assert.equal(Day.inherits(s.week.sat, s.everyDay, 'breakfast'), true);
  assert.equal(Day.inherits(s.week.sat, s.everyDay, 'dinner'), false);
  assert.equal(Day.inherits(s.week.sat, s.everyDay, 'snack'), false); /* both empty: nothing to inherit */
  const shown = Day.shownMeals(s);
  assert.equal(shown.breakfast[0].id, 'idli');
  assert.equal(shown.dinner[0].id, 'fish_curry');
  assert.deepEqual(shown.snack, []);
});

test('copy-on-write: editing an inherited slot customizes only that slot', () => {
  let s = withEveryDay();
  s = Day.selectWeekDay(s, 'mon');
  const showing = Day.shownMeals(s).breakfast;
  /* + on the inherited idli, then typed grams. */
  s = Day.setSlot(s, 'breakfast', NP.setQty(showing, 'idli', 3));
  assert.equal(s.week.mon.breakfast[0].qty, 3);
  s = Day.setSlot(s, 'breakfast', NP.setItemGrams(Day.shownMeals(s).breakfast, 'idli', 120));
  assert.equal(s.week.mon.breakfast[0].g, 120);
  /* Adding a food to an inherited slot keeps what was showing plus the new food. */
  s = Day.setSlot(s, 'lunch', NP.add(Day.shownMeals(s).lunch, 'dal_tadka', 1));
  assert.deepEqual(s.week.mon.lunch.map(r => r.id), ['rice', 'dal_tadka']);
  /* Every day is unchanged; other days still follow it. */
  assert.equal(s.everyDay.breakfast[0].qty, 2);
  assert.deepEqual(s.everyDay.lunch.map(r => r.id), ['rice']);
  assert.equal(Day.resolveMeals(s.week.tue, s.everyDay).breakfast[0].qty, 2);
  assert.deepEqual(s.week.mon.dinner, []); /* Monday dinner still inherits */
  assert.equal(s.meals, s.week.mon);
});

test('clearing a custom slot inherits Every day again', () => {
  let s = withEveryDay();
  s = Day.selectWeekDay(s, 'wed');
  s = Day.setSlot(s, 'lunch', NP.add([], 'poha', 1));
  assert.equal(Day.inherits(s.week.wed, s.everyDay, 'lunch'), false);
  const only = s.week.wed.lunch[0].id;
  s = Day.setSlot(s, 'lunch', NP.setQty(s.week.wed.lunch, only, 0));
  assert.deepEqual(s.week.wed.lunch, []);
  assert.equal(Day.inherits(s.week.wed, s.everyDay, 'lunch'), true);
  assert.equal(Day.shownMeals(s).lunch[0].id, 'rice');
});

test('week totals use 7 resolved days, not 8', () => {
  let s = Day.fresh(THU);
  s = Day.selectWeekDay(s, Day.EVERY);
  s = Day.setSlot(s, 'breakfast', NP.add([], 'roti', 1));
  /* Only Every day: counts on all 7 days, not 8. */
  assert.equal(Day.weekTotals(s.week, s.everyDay).kcal, Math.round(kcal('roti') * 7));
  assert.equal(Day.weekTotals(s.week, s.everyDay).portions, 7);
  /* Saturday breakfast custom: 6 × roti + 1 × rice. */
  s = Day.selectWeekDay(s, 'sat');
  s = Day.setSlot(s, 'breakfast', NP.add([], 'rice', 1));
  const w = Day.weekTotals(s.week, s.everyDay);
  assert.equal(w.portions, 7);
  assert.equal(Math.round(w.kcal), Math.round(kcal('roti') * 6 + kcal('rice')));
  /* Without an everyDay argument it is the plain NP5 sum of custom slots. */
  assert.equal(Day.weekTotals(s.week).portions, 1);
  /* The selected day's resolved meals drive day totals. */
  assert.equal(Day.dayTotals(Day.resolveMeals(s.week.mon, s.everyDay)).kcal, kcal('roti'));
});

test('migration: an NP5 save without everyDay loads with meals kept and Every day empty', () => {
  const raw = {
    person: { age: 'adult', activity: 'moderate', diet: 'all', sex: 'female' },
    week: { mon: { breakfast: [{ id: 'roti', qty: 2, g: 100 }], lunch: [], snack: [], dinner: [] },
      sat: { breakfast: [], lunch: [], snack: [], dinner: [{ id: 'rice', qty: 1 }] } },
    weekDay: 'mon', weekStart: 'sun', portions: { roti: 50 }, scores: { guess: 3, plate: 2, swaps: 1 },
    days: [{ id: 'd1', name: 'Old', person: {}, meals: { breakfast: [{ id: 'idli', qty: 3 }] } }]
  };
  const s = Day.restore(JSON.stringify(raw), THU);
  assert.deepEqual(s.everyDay, Day.emptyMeals());
  assert.equal(s.week.mon.breakfast[0].g, 100);
  assert.equal(s.week.sat.dinner[0].id, 'rice');
  assert.deepEqual(s.week.tue.breakfast, []); /* nothing auto-moved from Monday */
  assert.equal(s.weekDay, 'mon');
  assert.equal(s.weekStart, 'sun');
  assert.equal(s.portions.roti, 50);
  assert.equal(s.scores.guess, 3);
  assert.equal(s.days[0].name, 'Old');
  /* Pre-NP5 save (single day) still migrates too. */
  const old = Day.restore(JSON.stringify({ meals: { breakfast: [{ id: 'roti', qty: 1 }] } }), THU);
  assert.equal(old.week.thu.breakfast[0].id, 'roti');
  assert.deepEqual(old.everyDay, Day.emptyMeals());
});

test('saved state keeps Every day; week start change keeps meals and Every day', () => {
  let s = withEveryDay();
  s = Day.selectWeekDay(s, 'fri');
  s = Day.setSlot(s, 'dinner', NP.add([], 'paneer', 1));
  s = Day.setWeekStart(s, 'sun');
  assert.deepEqual(Day.weekOrder(s.weekStart), ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
  assert.equal(s.week.fri.dinner[0].id, 'paneer');
  assert.equal(s.everyDay.breakfast[0].id, 'idli');
  const back = Day.restore(JSON.stringify(s), THU);
  assert.equal(back.everyDay.breakfast[0].id, 'idli');
  assert.equal(back.everyDay.dinner[0].id, 'roti');
  assert.equal(back.week.fri.dinner[0].id, 'paneer');
  assert.equal(back.weekStart, 'sun');
  /* Every day selected survives a reload. */
  const onEvery = Day.restore(JSON.stringify(Day.selectWeekDay(s, Day.EVERY)), THU);
  assert.equal(onEvery.weekDay, 'every');
  assert.equal(onEvery.meals, onEvery.everyDay);
  assert.equal(onEvery.meals.breakfast[0].id, 'idli');
});

test('saved days store what the day shows; plates load into one slot', () => {
  let s = withEveryDay();
  s = Day.selectWeekDay(s, 'tue');
  s = Day.saveDay(s, 'Usual Tuesday');
  assert.equal(s.days[0].meals.breakfast[0].id, 'idli'); /* inherited meals are kept in the snapshot */
  s = Day.selectWeekDay(s, 'sat');
  s = Day.loadDay(s, s.days[0].id);
  assert.equal(s.week.sat.breakfast[0].id, 'idli');
  assert.equal(s.everyDay.lunch[0].id, 'rice'); /* Every day not changed by loading a day */
  s = Day.selectWeekDay(s, 'wed');
  s.meal = 'snack';
  s = Day.setSlot(s, 'snack', NP.add([], 'banana', 1));
  s = Day.savePlate(s, 'Fruit');
  s = Day.setSlot(s, 'snack', []);
  s.meal = 'dinner';
  s = Day.loadPlate(s, s.plates[0].id);
  assert.equal(s.week.wed.dinner[0].id, 'banana');
  assert.deepEqual(s.week.wed.breakfast, []); /* still inherits */
  assert.deepEqual(s.everyDay.dinner.map(r => r.id), ['roti']);
});
