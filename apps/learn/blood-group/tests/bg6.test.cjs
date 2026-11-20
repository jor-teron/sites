// Blood Group BG-6 — Health tab data (core/blood.js, no DOM). Run: node --test apps/learn/blood-group/tests/*.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../core/blood.js'), 'utf8'), ctx);
const B = ctx.window.BG, same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);

test('tab list includes Health (#health)', () => {
  const ids = B.views.map(t => t.id);
  const labels = B.views.map(t => t.label);
  same(ids, ['home', 'donate', 'family', 'myths', 'health']);
  same(labels, ['Groups', 'Donation', 'Family', 'Myths', 'Health']);
  const health = B.views.find(t => t.id === 'health');
  assert.ok(health);
  assert.strictEqual(health.hash, '#health');
  assert.ok(health.short && String(health.short).trim().length > 0);
  assert.ok(!B.views.some(t => /quiz/i.test(t.id + t.label + (t.hash || ''))));
});

test('nutrient list includes iron, B12, folate and vitamin C, each with foods', () => {
  const needs = B.health.needs;
  assert.ok(Array.isArray(needs) && needs.length >= 4);
  const by = id => needs.find(n => n.id === id);
  const iron = by('iron'), b12 = by('b12'), folate = by('folate'), vitc = by('vitc');
  assert.ok(iron && b12 && folate && vitc);
  assert.match(iron.name, /iron/i);
  assert.match(b12.name, /b12/i);
  assert.match(folate.name, /folate/i);
  assert.match(vitc.name, /vitamin c/i);
  for (const n of [iron, b12, folate, vitc]) {
    assert.ok(typeof n.job === 'string' && n.job.trim().length > 8, n.id + ' job');
    assert.ok(Array.isArray(n.foods) && n.foods.length > 0, n.id + ' foods');
    assert.ok(n.foods.every(f => typeof f === 'string' && f.trim().length > 0), n.id + ' food text');
  }
  const ironFoods = iron.foods.join(' ').toLowerCase();
  for (const bit of ['dal', 'palak', 'jaggery', 'chana']) assert.ok(ironFoods.includes(bit), 'iron covers ' + bit);
  const b12Foods = (b12.foods.join(' ') + ' ' + (b12.note || '')).toLowerCase();
  assert.ok(b12Foods.includes('curd') || b12Foods.includes('milk'));
  assert.match(b12.note || '', /vegetarian/i);
});

test('anaemia signs are non-empty', () => {
  const a = B.health.anaemia;
  assert.ok(a && typeof a.what === 'string' && a.what.trim().length > 8);
  assert.ok(Array.isArray(a.signs) && a.signs.length > 0);
  assert.ok(a.signs.every(s => typeof s === 'string' && s.trim().length > 0));
  assert.ok(typeof a.risk === 'string' && a.risk.trim().length > 8);
  assert.match(a.warning, /blood test/i);
  assert.match(a.warning, /iron/i);
});

test('disclaimer is present', () => {
  const d = B.health.disclaimer;
  assert.ok(typeof d === 'string' && d.trim().length > 16);
  assert.match(d, /not medical advice/i);
  assert.match(d, /doctor/i);
});
