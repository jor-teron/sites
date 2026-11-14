/* Node tests for Expense Tracker EXT1 (ex_core.js).
   Run: node test_ex_core.js
   No DOM, no jsdom, no browser. */
'use strict';

var Ex = require('./ex_core.js');
var fails = [];

function eq(name, a, b) {
  var sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) fails.push(name + ' got ' + sa + ' expected ' + sb);
  else console.log('ok', name);
}

function ok(name, cond, detail) {
  if (cond) console.log('ok', name);
  else fails.push(name + (detail ? (' ' + detail) : ''));
}

function close(name, a, b) {
  ok(name, Math.abs(a - b) < 0.001, 'got ' + a + ' expected ' + b);
}

// ---- Indian number format ----
eq('format 0', Ex.formatINR(0), '0.00');
eq('format 1', Ex.formatINR(1), '1.00');
eq('format 12.5', Ex.formatINR(12.5), '12.50');
eq('format 999', Ex.formatINR(999), '999.00');
eq('format 1000', Ex.formatINR(1000), '1,000.00');
eq('format 12345.6', Ex.formatINR(12345.6), '12,345.60');
eq('format 100000', Ex.formatINR(100000), '1,00,000.00');
eq('format 123456.00', Ex.formatINR(123456), '1,23,456.00');
eq('format 1234567.8', Ex.formatINR(1234567.8), '12,34,567.80');
eq('format 12345678', Ex.formatINR(12345678), '1,23,45,678.00');
eq('format negative', Ex.formatINR(-250.5), '-250.50');
eq('format NaN as 0', Ex.formatINR('nope'), '0.00');
eq('rupee positive', Ex.rupee(1234), '₹1,234.00');
eq('rupee negative', Ex.rupee(-250), '-₹250.00');

// ---- parseAmount ----
eq('parse 250', Ex.parseAmount('250'), 250);
eq('parse 250.5', Ex.parseAmount('250.5'), 250.5);
eq('parse Indian commas', Ex.parseAmount('1,23,456.00'), 123456);
eq('parse western commas', Ex.parseAmount('1,234.50'), 1234.5);
eq('parse rupee sign', Ex.parseAmount('₹250'), 250);
eq('parse spaced', Ex.parseAmount('  ₹ 1,000.00 '), 1000);
eq('parse negative', Ex.parseAmount('-12.5'), -12.5);
eq('parse parens', Ex.parseAmount('(12.50)'), -12.5);
eq('parse number', Ex.parseAmount(99.1), 99.1);
eq('parse empty', Ex.parseAmount(''), null);
eq('parse junk', Ex.parseAmount('abc'), null);
eq('parse two dots', Ex.parseAmount('1.2.3'), null);

// ---- dates ----
ok('iso 2026-11-10', Ex.isValidISODate('2026-11-10'));
ok('reject 2026-02-30', !Ex.isValidISODate('2026-02-30'));
ok('reject 2026-13-01', !Ex.isValidISODate('2026-13-01'));
ok('leap 2024-02-29', Ex.isValidISODate('2024-02-29'));
ok('reject 2025-02-29', !Ex.isValidISODate('2025-02-29'));
ok('reject slash', !Ex.isValidISODate('10/11/2026'));
eq('monthKey', Ex.monthKey('2026-11-10'), '2026-11');
eq('days Nov', Ex.daysInMonth(2026, 11), 30);
eq('days Feb 2026', Ex.daysInMonth(2026, 2), 28);
eq('days Feb 2024', Ex.daysInMonth(2024, 2), 29);
eq('occurrence 31 Jan', Ex.occurrenceDate(2026, 1, 31), '2026-01-31');
eq('occurrence 31 Feb 2026', Ex.occurrenceDate(2026, 2, 31), '2026-02-28');
eq('occurrence 31 Feb 2024', Ex.occurrenceDate(2024, 2, 31), '2024-02-29');
eq('occurrence 31 Apr', Ex.occurrenceDate(2026, 4, 31), '2026-04-30');
eq('shift month back', Ex.shiftMonth('2026-01', -1), '2025-12');
eq('shift month fwd', Ex.shiftMonth('2026-11', 2), '2027-01');
eq('month label', Ex.monthLabel('2026-11'), 'November 2026');
eq('todayISO fixed', Ex.todayISO(new Date(2026, 10, 10, 18, 30)), '2026-11-10');

// ---- month totals ----
var cats = Ex.DEFAULT_CATEGORIES;
var entries = [
  { id: '1', type: 'expense', amount: 250, categoryId: 'food', date: '2026-11-10', note: 'Lunch', mode: 'UPI' },
  { id: '2', type: 'expense', amount: 80.5, categoryId: 'transport', date: '2026-11-10', note: 'Bus', mode: 'Cash' },
  { id: '3', type: 'expense', amount: 15000, categoryId: 'rent', date: '2026-11-01', note: 'Rent', mode: 'Bank' },
  { id: '4', type: 'income', amount: 40000, categoryId: 'salary', date: '2026-11-01', note: 'Salary', mode: 'Bank' },
  { id: '5', type: 'expense', amount: 999, categoryId: 'food', date: '2026-10-31', note: 'other month', mode: 'Card' }
];
var t = Ex.monthTotals(entries, '2026-11');
close('income Nov', t.income, 40000);
close('spent Nov', t.spent, 250 + 80.5 + 15000);
close('balance Nov', t.balance, 40000 - (250 + 80.5 + 15000));
eq('count Nov', t.count, 4);
close('food spent', t.byCategory.food.spent, 250);
close('day 10 spent', t.byDay['10'].spent, 330.5);
close('day 01 income', t.byDay['01'].income, 40000);
eq('days in byDay', Object.keys(t.byDay).length, 30);
ok('Oct not in Nov', !t.byCategory.food || t.byCategory.food.count === 1);
var tOct = Ex.monthTotals(entries, '2026-10');
close('oct spent', tOct.spent, 999);
eq('empty month count', Ex.monthTotals(entries, '2026-01').count, 0);

// ---- budget math ----
var bud = Ex.budgetStatus(t, 15000, { food: 200, rent: 15000 }, cats);
ok('overall present', !!bud.overall);
close('overall budget', bud.overall.budget, 15000);
ok('overall over', bud.overall.over === true);
ok('overall ratio > 1', bud.overall.ratio > 1);
var foodB = bud.categories.filter(function (c) { return c.id === 'food'; })[0];
var rentB = bud.categories.filter(function (c) { return c.id === 'rent'; })[0];
ok('food over', foodB.over === true);
close('food spent', foodB.spent, 250);
ok('rent exact not over', rentB.over === false);
close('rent remaining 0', rentB.remaining, 0);
var budNone = Ex.budgetStatus(t, 0, {}, cats);
ok('no overall when 0', budNone.overall === null);
eq('no cat budgets', budNone.categories.length, 0);
var under = Ex.budgetStatus(t, 50000, { food: 1000 }, cats);
ok('under budget', under.overall.over === false);
close('remaining', under.overall.remaining, 50000 - t.spent);
ok('food under', under.categories[0].over === false);

// ---- recurring expansion ----
var recs = [{
  id: 'rent1',
  type: 'expense',
  amount: 15000,
  categoryId: 'rent',
  note: 'House rent',
  mode: 'Bank',
  start: '2026-01-01',
  day: 1,
  active: true
}];
var exp = Ex.expandRecurring(recs, [], [], '2026-11-10');
eq('rent months Jan-Nov', exp.added.length, 11);
eq('first rent date', exp.added[0].date, '2026-01-01');
eq('last rent date', exp.added[10].date, '2026-11-01');
eq('recurringId set', exp.added[0].recurringId, 'rent1');
eq('amount copied', exp.added[0].amount, 15000);
ok('not added after today (Dec)', exp.added.every(function (e) { return e.date <= '2026-11-10'; }));

/* start mid-month after the day: first occurrence is next month */
var rec2 = [{
  id: 'bill',
  type: 'expense',
  amount: 800,
  categoryId: 'bills',
  note: 'Wi-Fi',
  mode: 'UPI',
  start: '2026-01-15',
  day: 1,
  active: true
}];
var exp2 = Ex.expandRecurring(rec2, [], [], '2026-03-01');
eq('start after day -> Feb and Mar', exp2.added.map(function (e) { return e.date; }), ['2026-02-01', '2026-03-01']);

/* start mid-month before the day: include that month */
var rec3 = [{
  id: 'bill2',
  type: 'expense',
  amount: 500,
  categoryId: 'bills',
  note: '',
  mode: 'UPI',
  start: '2026-01-10',
  day: 15,
  active: true
}];
var exp3 = Ex.expandRecurring(rec3, [], [], '2026-02-20');
eq('include start month', exp3.added.map(function (e) { return e.date; }), ['2026-01-15', '2026-02-15']);

/* do not add a future day this month */
var rec4 = [{
  id: 'late',
  type: 'expense',
  amount: 100,
  categoryId: 'bills',
  note: '',
  mode: 'Cash',
  start: '2026-11-01',
  day: 20,
  active: true
}];
var exp4 = Ex.expandRecurring(rec4, [], [], '2026-11-10');
eq('future day this month not added', exp4.added.length, 0);
var exp4b = Ex.expandRecurring(rec4, [], [], '2026-11-20');
eq('added on the day', exp4b.added.length, 1);
eq('added date is 20', exp4b.added[0].date, '2026-11-20');

/* already present is not duplicated */
var existing = [{ id: 'x', type: 'expense', amount: 15000, categoryId: 'rent', date: '2026-11-01', note: '', mode: 'Bank', recurringId: 'rent1' }];
var exp5 = Ex.expandRecurring(recs, existing, [], '2026-11-10');
eq('10 new + 1 existing months', exp5.added.length, 10);
ok('nov not in added', exp5.added.every(function (e) { return e.date !== '2026-11-01'; }));

/* cancelled (user deleted) is not re-added */
var exp6 = Ex.expandRecurring(recs, [], [Ex.recKey('rent1', '2026-11-01')], '2026-11-10');
eq('cancelled skipped', exp6.added.length, 10);
ok('nov cancelled', exp6.added.every(function (e) { return e.date !== '2026-11-01'; }));

/* inactive skipped */
var recOff = [Object.assign({}, recs[0], { active: false })];
eq('inactive none', Ex.expandRecurring(recOff, [], [], '2026-11-10').added.length, 0);

/* until date */
var recUntil = [Object.assign({}, recs[0], { until: '2026-03-01' })];
var expU = Ex.expandRecurring(recUntil, [], [], '2026-11-10');
eq('until March = 3 months', expU.added.length, 3);
eq('last is March', expU.added[2].date, '2026-03-01');

/* 31st clamps in shorter months, from Jan to Apr 2026 */
var rec31 = [{
  id: 'emi',
  type: 'expense',
  amount: 2000,
  categoryId: 'bills',
  note: 'EMI',
  mode: 'Bank',
  start: '2026-01-31',
  day: 31,
  active: true
}];
var exp31 = Ex.expandRecurring(rec31, [], [], '2026-04-30');
eq('31st dates', exp31.added.map(function (e) { return e.date; }),
  ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);

/* income recurrence */
var recIn = [{
  id: 'sal',
  type: 'income',
  amount: 40000,
  categoryId: 'salary',
  note: 'Pay',
  mode: 'Bank',
  start: '2026-11-01',
  day: 1,
  active: true
}];
eq('income type kept', Ex.expandRecurring(recIn, [], [], '2026-11-10').added[0].type, 'income');

// ---- CSV export / parse ----
var csv = Ex.entriesToCsv(entries.slice(0, 4), cats);
ok('csv BOM', csv.charCodeAt(0) === 0xFEFF);
ok('csv header', csv.indexOf('Date,Type,Amount,Category,Note,Mode') !== -1);
ok('csv has Lunch', csv.indexOf('Lunch') !== -1);
ok('csv amount plain', /250\.00/.test(csv));
ok('csv no indian commas in amount', !csv.replace('1,00', '').match(/\d,\d{2},/));

var parsed = Ex.parseCsv(csv, cats, function (i) { return 'p' + i; });
eq('csv round-trip count', parsed.added.length, 4);
eq('csv skipped 0', parsed.skipped, 0);
var lunch = parsed.added.filter(function (e) { return e.note === 'Lunch'; })[0];
ok('lunch found', !!lunch);
eq('lunch amount', lunch.amount, 250);
eq('lunch cat', lunch.categoryId, 'food');
eq('lunch mode', lunch.mode, 'UPI');
eq('lunch type', lunch.type, 'expense');
var sal = parsed.added.filter(function (e) { return e.note === 'Salary'; })[0];
eq('salary type', sal.type, 'income');
eq('salary cat', sal.categoryId, 'salary');

/* quoted comma in note */
var messy = 'Date,Type,Amount,Category,Note,Mode\n2026-11-10,expense,99.50,Food,"Tea, toast",Cash\n';
var p2 = Ex.parseCsv(messy, cats);
eq('quoted note', p2.added[0].note, 'Tea, toast');
close('99.50', p2.added[0].amount, 99.5);

/* unknown category goes to Other and is mentioned in the note */
var p3 = Ex.parseCsv('Date,Type,Amount,Category,Note,Mode\n2026-11-10,expense,10,Snacks,Evening,UPI\n', cats);
eq('unknown -> other', p3.added[0].categoryId, 'other');
ok('unknown name kept', p3.added[0].note.indexOf('Snacks') !== -1);

/* Indian date and Indian amount */
var p4 = Ex.parseCsv('Date,Type,Amount,Category,Note,Mode\n10/11/2026,expense,"1,234.50",Fuel,Petrol,Card\n', cats);
eq('DMY date', p4.added[0].date, '2026-11-10');
close('indian amount', p4.added[0].amount, 1234.5);
eq('fuel cat', p4.added[0].categoryId, 'fuel');

/* bad rows skipped */
var p5 = Ex.parseCsv('Date,Type,Amount,Category,Note,Mode\nbad,expense,10,Food,x,Cash\n2026-11-10,expense,0,Food,z,Cash\n2026-11-10,expense,20,Food,ok,Cash\n', cats);
eq('one good row', p5.added.length, 1);
eq('two skipped', p5.skipped, 2);
eq('ok note', p5.added[0].note, 'ok');

/* empty */
ok('empty file error', Ex.parseCsv('', cats).errors.length > 0);

/* splitCsvLine escaped quotes */
eq('split quotes', Ex.splitCsvLine('a,"b,""c""",d'), ['a', 'b,"c"', 'd']);

// ---- filter / group ----
var f = Ex.filterEntries(entries, { month: '2026-11', categoryId: 'food' });
eq('filter food nov', f.length, 1);
var f2 = Ex.filterEntries(entries, { month: '2026-11', query: 'bus', categories: cats });
eq('search bus', f2.length, 1);
var f3 = Ex.filterEntries(entries, { month: '2026-11', mode: 'Bank' });
eq('filter bank', f3.length, 2);
var f4 = Ex.filterEntries(entries, { month: '2026-11', query: '40,000', categories: cats });
eq('search formatted amount', f4.length, 1);
var g = Ex.groupByDay(Ex.filterEntries(entries, { month: '2026-11' }));
eq('two days', g.length, 2);
eq('latest day first', g[0].date, '2026-11-10');
close('day spent', g[0].spent, 330.5);
ok('day head', Ex.formatDayHead('2026-11-10').indexOf('10 Nov 2026') !== -1);
ok('day head weekday', Ex.formatDayHead('2026-11-10').indexOf('Tuesday') !== -1);

// ---- backup ----
var st = Ex.normalizeState({
  theme: 'dark',
  entries: entries,
  overallBudget: 30000,
  categoryBudgets: { food: 200 }
});
eq('theme kept', st.theme, 'dark');
eq('entries kept', st.entries.length, 5);
var wrap = Ex.backupWrap(st, 'EXT1');
eq('backup type', wrap.type, 'hub-expense-tracker-backup');
eq('backup format', wrap.format, 1);
eq('backup release', wrap.released, 'EXT1');
var back = Ex.parseBackup(wrap);
eq('restore entries', back.state.entries.length, 5);
eq('restore theme', back.state.theme, 'dark');
close('restore budget', back.state.overallBudget, 30000);
ok('reject other type', !!Ex.parseBackup({ type: 'nope', data: {} }).error);

// ---- defaults ----
ok('default expense cats', Ex.DEFAULT_CATEGORIES.filter(function (c) { return c.kind === 'expense'; }).length >= 11);
ok('has Food', !!Ex.categoryByName(Ex.DEFAULT_CATEGORIES, 'Food'));
ok('has Groceries', !!Ex.categoryByName(Ex.DEFAULT_CATEGORIES, 'Groceries'));
ok('has Rent', !!Ex.categoryByName(Ex.DEFAULT_CATEGORIES, 'Rent'));
eq('norm mode upi', Ex.normMode('upi'), 'UPI');
eq('norm mode junk -> Cash', Ex.normMode('cheque'), 'Cash');

if (fails.length) {
  console.error('\nFAILED ' + fails.length);
  fails.forEach(function (f) { console.error(' - ' + f); });
  process.exit(1);
}
console.log('\nAll ' + (process.stdout.isTTY ? '' : '') + 'tests passed.');
