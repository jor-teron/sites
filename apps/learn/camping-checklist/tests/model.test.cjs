const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../core/data.js'), M = require('../core/model.js');
test('69 unique items, ten categories, seven valid templates', () => {
  assert.equal(D.items.length, 69); assert.equal(D.categories.length, 10); assert.equal(D.templates.length, 7);
  assert.equal(new Set(D.items.map(i => i.id)).size, D.items.length);
  D.items.forEach(i => assert.deepEqual(M.validateItem(i), i));
  D.templates.forEach(t => assert.deepEqual(M.validateList(t), t));
});
test('quantity-aware total, packed and category weight', () => {
  const list = M.copy(D.templates[0]); list.items[0].packed = true;
  const t = M.totals(list.items);
  assert.equal(t.grams, list.items.reduce((sum, i) => sum + i.grams * i.qty, 0));
  assert.equal(t.packed, list.items[0].grams * list.items[0].qty);
  assert.equal(t.count, 1); assert.equal(t.categories.Tools.packed, 1000);
  assert.equal(t.missing, t.essential - 1);
  assert.equal(Object.values(t.categories).reduce((n, c) => n + c.grams, 0), t.grams);
});
test('duplicate is independent and resets packed ticks', () => {
  const list = M.copy(D.templates[0]); list.items[0].packed = true;
  const next = M.duplicate(list); next.items[0].grams = 8;
  assert.equal(next.template, false); assert.equal(next.items[0].packed, false);
  assert.equal(list.items[0].grams, 1000); assert.notEqual(next.id, list.id);
});
test('localStorage round-trip and missing default recovery', () => {
  const state = M.fresh(); const copy = M.duplicate(state.lists[0]); state.lists.push(copy); state.selected = copy.id;
  assert.deepEqual(M.restore(JSON.stringify(state)), state);
  state.lists.splice(1, 1); assert.equal(M.restore(JSON.stringify(state)).lists.length, 8);
});
test('validation rejects bad quantities and unbounded input', () => {
  for (const patch of [{ qty: 0 }, { qty: 1.5 }, { grams: -1 }, { grams: Infinity }, { category: 'bad' }, { name: '' }]) {
    assert.throws(() => M.validateItem({ ...D.items[0], ...patch }));
  }
  assert.throws(() => M.restore('oops'));
  assert.throws(() => M.validateList({ ...D.templates[0], items: [D.items[0], D.items[0]] }));
});
