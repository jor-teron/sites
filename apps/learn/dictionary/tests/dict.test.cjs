// Dictionary DC-1: pure logic tests (core/dict.js loaded as a classic script via vm) plus a data check on the shards.
// Run: node --test apps/learn/dictionary/tests/dict.test.cjs
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
// vm arrays come from another realm: copy results into this realm so deepStrictEqual works
const D = Object.fromEntries(Object.entries(C).map(([k, f]) => [k, typeof f === 'function' ? (...a) => { const r = f(...a); return Array.isArray(r) ? Array.from(r) : r; } : f]));
const data = n => JSON.parse(fs.readFileSync(path.join(APP, 'data', n + '.json'), 'utf8'));
const man = data('manifest');

test('norm cleans case, spaces, underscores and curly quotes', () => {
  assert.strictEqual(D.norm('  Apple  '), 'apple');
  assert.strictEqual(D.norm('ice_CREAM'), 'ice cream');
  assert.strictEqual(D.norm('rock  n\u2019 roll'), "rock n' roll");
  assert.strictEqual(D.norm(null), '');
});

test('shardKey follows the split prefixes', () => {
  const split = ['c', 'co', 's'];
  assert.strictEqual(D.shardKey('Apple', split), 'a');
  assert.strictEqual(D.shardKey('sun', split), 'su');
  assert.strictEqual(D.shardKey('s', split), 's_');
  assert.strictEqual(D.shardKey('cat', split), 'ca');
  assert.strictEqual(D.shardKey('cord', split), 'cor');
  assert.strictEqual(D.shardKey("co-op", split), 'co_');
  assert.strictEqual(D.shardKey('3d', split), '0');
});

test('prefix finds sorted matches and stops at max', () => {
  const list = ['ape', 'apple', 'apples', 'apply', 'apt', 'bat'];
  assert.deepStrictEqual(D.prefix(list, 'app', 8), ['apple', 'apples', 'apply']);
  assert.deepStrictEqual(D.prefix(list, 'AP', 2), ['ape', 'apple']);
  assert.deepStrictEqual(D.prefix(list, 'zz'), []);
  assert.deepStrictEqual(D.prefix(list, ''), []);
});

test('stems guess base words', () => {
  assert.ok(D.stems('dogs').includes('dog'));
  assert.ok(D.stems('cities').includes('city'));
  assert.ok(D.stems('running').includes('run'));
  assert.ok(D.stems('baked').includes('bake'));
  assert.ok(D.stems('wolves').includes('wolf'));
  assert.deepStrictEqual(D.stems('is'), []);
});

test('dist and suggest', () => {
  assert.strictEqual(D.dist('kitten', 'sitting', 5), 3);
  assert.ok(D.dist('abc', 'abcdefgh', 2) > 2);
  assert.deepStrictEqual(D.suggest('aple', ['able', 'apple', 'maple', 'zebra'], 6).slice(0, 3).sort(), ['able', 'apple', 'maple']);
  assert.deepStrictEqual(D.suggest('qqqqqq', ['apple'], 6), []);
  assert.deepStrictEqual(D.suggest('aple', ['able', 'ale', 'ample', 'ape', 'apple', 'apse', 'axle'], 3).sort(), ['ape', 'apple', 'apse']);   // same start (ap) first
});

test('wordOfDay is fixed for a date and changes day to day', () => {
  const list = Array.from({ length: 1000 }, (_, i) => 'w' + i);
  const a = D.wordOfDay(list, new Date(2026, 10, 18, 9)), b = D.wordOfDay(list, new Date(2026, 10, 18, 23));
  assert.strictEqual(a, b);
  const week = new Set([18, 19, 20, 21, 22, 23, 24].map(d => D.wordOfDay(list, new Date(2026, 10, d))));
  assert.strictEqual(week.size, 7);
  assert.strictEqual(D.wordOfDay([], new Date()), null);
});

test('addRecent keeps newest first, unique, max length', () => {
  let r = [];
  for (let i = 0; i < 25; i++) r = D.addRecent(r, 'w' + i, 20);
  assert.strictEqual(r.length, 20);
  assert.strictEqual(r[0], 'w24');
  r = D.addRecent(r, 'W10', 20);
  assert.strictEqual(r[0], 'w10');
  assert.strictEqual(r.filter(x => x === 'w10').length, 1);
  assert.deepStrictEqual(D.addRecent('bad', 'x'), ['x']);
});

test('group puts senses under part of speech names', () => {
  const g = D.group([['n', 'a'], ['v', 'b', ['ex']], ['n', 'c', [], ['s1'], ['o1']]]);
  assert.strictEqual(g.length, 2);
  assert.strictEqual(g[0].name, 'noun');
  assert.strictEqual(g[0].senses.length, 2);
  assert.deepStrictEqual(Array.from(g[0].senses[1].ant), ['o1']);
  assert.strictEqual(g[1].name, 'verb');
});

test('data: manifest, shards and index agree for sample words', () => {
  assert.ok(man.words > 100000);
  for (const w of ['apple', 'run', 'serendipity', 'good', 'dictionary']) {
    const sh = data('d_' + D.shardKey(w, man.split));
    assert.ok(Array.isArray(sh.w[w]) && sh.w[w].length, w);
    assert.ok(data('i_' + D.letter(w)).includes(w), w + ' in index');
  }
  const ran = data('d_' + D.shardKey('ran', man.split));
  assert.strictEqual(ran.f.ran, 'run');
  const files = fs.readdirSync(path.join(APP, 'data'));
  for (const f of files) assert.ok(fs.statSync(path.join(APP, 'data', f)).size < 620 * 1024, f + ' under 620 KB');
  const wod = data('wod');
  assert.ok(wod.length >= 500 && wod.every(x => x.length === 3 && x[2]));
});
