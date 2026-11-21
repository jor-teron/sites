// Dictionary DC-4: word families and phrases. Pure logic (related, cap) plus a data check on the shards.
// Run: node --test apps/learn/dictionary/tests/dc4.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(APP, 'core/dict.js'), 'utf8'), ctx);
const C = ctx.DictCore;
const arr = x => Array.from(x);   // vm arrays come from another realm
const data = n => JSON.parse(fs.readFileSync(path.join(APP, 'data', n + '.json'), 'utf8'));
const man = data('manifest');
const shard = w => data('d_' + C.shardKey(w, man.split));
const rel = w => { const r = C.related(shard(w), w); return { family: arr(r.family), phrases: arr(r.phrases), forms: arr(r.forms) }; };

test('related reads family, phrases and forms for a word', () => {
  const sh = { r: { happy: [['unhappy', 'happiness'], ['happy hour']], bank: [['banker']] }, g: { happy: ['happier', 'happiest'] } };
  const r = C.related(sh, ' Happy ');
  assert.deepStrictEqual(arr(r.family), ['unhappy', 'happiness']);
  assert.deepStrictEqual(arr(r.phrases), ['happy hour']);
  assert.deepStrictEqual(arr(r.forms), ['happier', 'happiest']);
  const b = C.related(sh, 'bank');
  assert.deepStrictEqual(arr(b.phrases), []);
  assert.deepStrictEqual(arr(b.forms), []);
});

test('related copes with missing or odd data and drops the word itself and repeats', () => {
  for (const sh of [null, {}, { r: {} }, { r: { x: 'bad' } }, { r: { x: [null, 5] }, g: { x: 'no' } }]) {
    const r = C.related(sh, 'x');
    assert.strictEqual(r.family.length + r.phrases.length + r.forms.length, 0);
  }
  const r = C.related({ r: { run: [['run', 'Runner', 'runner', '']] } }, 'run');
  assert.deepStrictEqual(arr(r.family), ['runner']);
});

test('cap shows the first n and folds the rest, never hiding a single extra', () => {
  const list = Array.from({ length: 12 }, (_, i) => 'p' + i);
  let c = C.cap(list, 8);
  assert.deepStrictEqual(arr(c.top), list.slice(0, 8));
  assert.deepStrictEqual(arr(c.more), list.slice(8));
  c = C.cap(list.slice(0, 9), 8);
  assert.strictEqual(c.top.length, 9);
  assert.strictEqual(c.more.length, 0);
  assert.strictEqual(C.cap(list).top.length, 8);   // default 8
  assert.strictEqual(C.cap(null, 8).top.length, 0);
});

test('data: word families', () => {
  const happy = rel('happy').family;
  for (const w of ['happiness', 'happily', 'unhappy']) assert.ok(happy.includes(w), 'happy -> ' + w);
  for (const w of ['runner', 'running']) assert.ok(rel('run').family.includes(w), 'run -> ' + w);
  assert.ok(rel('decide').family.includes('decision'));
  assert.ok(rel('bank').family.includes('banker'));
  assert.ok(!rel('happy').family.includes('sad'));   // opposites only when they share the word
});

test('data: phrases contain the word, common first, capped', () => {
  const run = rel('run').phrases;
  for (const p of ['run out', 'run into']) assert.ok(run.includes(p), 'run -> ' + p);
  assert.ok(run.length <= 16);
  assert.ok(run.every(p => p.split(/[ -]+/).includes('run')));
  assert.ok(rel('bank').phrases.includes('bank account'));
  assert.ok(rel('light').phrases.includes('light year'));
  assert.ok(rel('light').phrases.indexOf('light bulb') < rel('light').phrases.indexOf('zodiacal light'));
});

test('data: irregular forms, every linked word exists, shard names as before', () => {
  assert.ok(rel('go').forms.includes('went'));
  assert.ok(rel('run').forms.includes('ran'));
  for (const w of ['happy', 'run', 'light', 'bank', 'decide']) {
    const r = rel(w);
    for (const x of r.family.concat(r.phrases)) assert.ok((shard(x).w || {})[x], w + ' -> ' + x + ' is an entry');
  }
  assert.deepStrictEqual(man.split, ['a', 'b', 'c', 'co', 'd', 'e', 'f', 'g', 'h', 'i', 'l', 'm', 'p', 'r', 's', 't', 'w']);
});
