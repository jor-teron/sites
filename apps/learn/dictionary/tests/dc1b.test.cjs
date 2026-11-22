// Dictionary DC-1b: Open English WordNet is the only source. No Princeton WordNet 3.0 dependency (no index.sense tag counts,
// no NLTK download) anywhere in the app, and meanings follow OEWN's own sense order within each part of speech.
// Run: node --test apps/learn/dictionary/tests/dc1b.test.cjs
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
const defs = (w, p) => senses(w).filter(s => s[0] === p).map(s => s[1]);
const read = f => fs.readFileSync(path.join(APP, f), 'utf8');

// every app file except the word data and this test itself
function files(dir) {
  return fs.readdirSync(path.join(APP, dir), { withFileTypes: true }).flatMap(e => {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) return f === 'data' || e.name === '__pycache__' ? [] : files(f);
    return /\.(js|cjs|py|html|css|txt|json)$/.test(e.name) && e.name !== 'dc1b.test.cjs' ? [f] : [];
  });
}

test('no Princeton WordNet dependency left in code, About or licence', () => {
  const list = files('.');
  assert.ok(list.includes('tools/build_data.py') && list.includes('ui/app.js') && list.includes('LICENSE-OEWN.txt'));
  for (const f of list) assert.doesNotMatch(read(f), /princeton|index\.sense|wordnet 3\.0|nltk|pwn/i, f);
  assert.ok(!fs.readdirSync(path.join(APP, 'tools')).some(f => /\.zip$|index\.sense|wordnet/i.test(f)), 'no vendored Princeton files');
});

test('the builder only downloads Open English WordNet', () => {
  const py = read('tools/build_data.py');
  const urls = py.match(/https?:\/\/[^\s'"]+/g) || [];
  assert.ok(urls.length >= 1);
  for (const u of urls) assert.match(u, /globalwordnet\/english-wordnet|en-word\.net/, u);
  assert.doesNotMatch(py, /zipfile|tag_counts|sense key/);
});

test('manifest and About credit Open English WordNet only', () => {
  assert.match(man.src, /^Open English WordNet \d{4} \(CC BY 4\.0\)$/);
  assert.match(man.v, /^oewn-/);
  const app = read('ui/app.js');
  assert.match(app, /Open English WordNet/);
  assert.match(app, /VER = 'DC1b'/);
  assert.match(read('dictionary.html'), /<title>Dictionary DC1b<\/title>/);
  assert.match(read('index.html'), /<title>Dictionary DC1b<\/title>/);
});

test('meanings follow OEWN order within a part of speech', () => {
  // bear (verb): OEWN lists "maintain (a theory...)" second; the old tag-count order put "cause to be born" second
  assert.strictEqual(defs('bear', 'v')[0], 'have');
  assert.match(defs('bear', 'v')[1], /^maintain \(a theory/);
  assert.match(defs('bear', 'v')[2], /cause to be born/);
  assert.match(defs('bank', 'n')[0], /sloping land/);
  assert.match(defs('bank', 'n')[1], /financial institution/);
  assert.match(defs('go', 'v')[0], /^change location/);
  assert.match(defs('light', 'n')[0], /electromagnetic radiation/);
});

test('each part of speech is one block, the one with the most senses first', () => {
  for (const w of ['run', 'set', 'play', 'take', 'make', 'bank', 'time', 'watch']) {
    const s = senses(w), order = [], n = {};
    s.forEach(r => { if (order[order.length - 1] !== r[0]) order.push(r[0]); n[r[0]] = (n[r[0]] || 0) + 1; });
    assert.strictEqual(new Set(order).size, order.length, w + ': parts of speech not interleaved');
    assert.ok(order.every((p, i) => i === 0 || n[order[i - 1]] >= n[p]), w + ': ' + order.join(''));
  }
  assert.strictEqual(senses('run')[0][0], 'v');
  assert.strictEqual(senses('place')[0][0], 'n');
});
