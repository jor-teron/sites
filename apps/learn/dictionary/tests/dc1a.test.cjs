// Dictionary DC-1a layout (top senses + More meanings) and a data check on meaning order (DC-1b: Open English WordNet
// order, parts of speech with the most senses first). Run: node --test apps/learn/dictionary/tests/dc1a.test.cjs
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
const data = n => JSON.parse(fs.readFileSync(path.join(APP, 'data', n + '.json'), 'utf8'));
const man = data('manifest');
const senses = w => data('d_' + C.shardKey(w, man.split)).w[w];
const posOrder = list => list.reduce((a, s) => (a.includes(s[0]) ? a : a.concat(s[0])), []);
const rows = (p, n) => Array.from({ length: n }, (_, i) => [p, p + i]);

test('layout keeps first-seen part of speech order and shows 3 per part', () => {
  const g = C.layout(rows('v', 10).concat(rows('n', 5)), 3);
  assert.strictEqual(g.length, 2);
  assert.strictEqual(g[0].name, 'verb');
  assert.deepStrictEqual(Array.from(g[0].top, s => s.def), ['v0', 'v1', 'v2']);
  assert.strictEqual(g[0].more.length, 7);
  assert.strictEqual(g[0].more[0].def, 'v3');
  assert.strictEqual(g[1].name, 'noun');
  assert.strictEqual(g[1].top.length, 3);
  assert.strictEqual(g[1].more.length, 2);
});

test('layout does not hide a single extra sense and copes with empty input', () => {
  const g = C.layout(rows('n', 4), 3);
  assert.strictEqual(g[0].top.length, 4);
  assert.strictEqual(g[0].more.length, 0);
  assert.strictEqual(C.layout(rows('a', 2))[0].top.length, 2);   // default n = 3
  assert.strictEqual(C.layout([], 3).length, 0);
  assert.strictEqual(C.layout(null).length, 0);
});

test('layout interleaved parts of speech: every sense kept once, in order', () => {
  const list = [['v', 'a'], ['n', 'b'], ['v', 'c'], ['n', 'd'], ['v', 'e'], ['v', 'f'], ['v', 'g']];
  const g = C.layout(list, 3);
  assert.deepStrictEqual(Array.from(g, x => x.pos), ['v', 'n']);
  assert.deepStrictEqual(Array.from(g[0].top.concat(g[0].more), s => s.def), ['a', 'c', 'e', 'f', 'g']);
  assert.strictEqual(g[0].more.length, 2);
});

test('data: everyday meanings come first', () => {
  assert.deepStrictEqual(posOrder(senses('run')).slice(0, 2), ['v', 'n']);
  assert.match(senses('run')[0][1], /move fast by using one's feet/);
  assert.match(senses('book')[0][1], /written work/);   // not "the sacred writings" (capitalised Book)
  assert.match(senses('light').find(s => s[0] === 'n')[1], /electromagnetic radiation/);   // not the Quaker "Light"
  assert.strictEqual(senses('set')[0][0], 'v');
  assert.strictEqual(senses('well')[0][0], 'r');
  assert.strictEqual(senses('play')[0][0], 'v');
  assert.strictEqual(senses('fly')[0][0], 'v');
  assert.match(senses('kind').find(s => s[0] === 'n')[1], /category/);   // DC-1b: adjective (more senses) now shows first
});

test('data: within a part of speech the OEWN first sense stays first', () => {
  assert.match(senses('bank')[0][1], /sloping land/);
  assert.match(senses('bank')[1][1], /financial institution/);
  assert.match(senses('date')[0][1], /day of the month/);
  assert.match(senses('fine')[0][1], /satisfactory/);
});
