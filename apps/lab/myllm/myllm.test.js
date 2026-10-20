/*
 * myllm.test.js — dependency-free checks for the char-level LM.
 * Run: node myllm.test.js
 */
'use strict';

const assert = require('assert');
const {
  TinyLM,
  buildVocab,
  vocabSize,
  encodeText,
  countUnknown,
  clampNumber,
  makeConfig,
  countParams,
  lrAt,
} = require('./myllm.js');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Vocab is code points. A surrogate pair is one character, not two UTF-16 units.
{
  const text = 'a😀b';
  const vocab = buildVocab(text);
  const units = new Set();
  for (let i = 0; i < text.length; i++) units.add(text[i]);
  assert.strictEqual(text.length, 4);
  assert.strictEqual(vocab.size, 3);
  assert.strictEqual(vocabSize(text), vocab.size);
  assert.ok(units.size > vocab.size);
  assert.ok(vocab.chars.includes('😀'));
  assert.strictEqual(encodeText(text, vocab).length, 3);
  const cfg = makeConfig(10000, vocab.size, 6);
  assert.strictEqual(cfg.V, vocab.size);
  assert.notStrictEqual(cfg.V, units.size);
}

// Number inputs: blank falls back, then min/max apply. Negatives must not pass through.
assert.strictEqual(clampNumber(-5, 2, 12, 6, true), 2);
assert.strictEqual(clampNumber(1e12, 2, 12, 6, true), 12);
assert.strictEqual(clampNumber('', 100, 50000, 3000, true), 3000);
assert.strictEqual(clampNumber('   ', 1000, 300000, 10000, true), 10000);
assert.strictEqual(clampNumber('0', 10, 2000, 300, true), 10);
assert.strictEqual(clampNumber('nope', 1000, 300000, 10000, true), 10000);
assert.strictEqual(clampNumber('6.4', 2, 12, 6, true), 6);
assert.strictEqual(clampNumber(0, 0.1, 2, 0.8, false), 0.1);

{
  const context = clampNumber(-1, 2, 12, 6, true);
  const vocab = buildVocab('abababababab');
  const cfg = makeConfig(2000, vocab.size, context);
  assert.strictEqual(cfg.C, 2);
  const model = new TinyLM(cfg);
  const data = encodeText('abababababab', vocab);
  const loss = model.trainStep(data, 4, 0.01);
  assert.ok(Number.isFinite(loss));
  assert.ok(countParams(cfg) > 0);
}

// Prompt characters missing from the vocab are counted as code points.
{
  const vocab = buildVocab('hello ');
  assert.strictEqual(countUnknown(vocab, 'hello'), 0);
  assert.strictEqual(countUnknown(vocab, 'hello 😀!'), 2);
  assert.strictEqual([... '😀!'].length, 2);
}

// On a small repeating text, training loss falls below chance (ln V).
{
  Math.random = mulberry32(1);
  const text = 'the cat sat on the mat. the cat sat on the mat. the cat sat on the mat. ';
  const vocab = buildVocab(text);
  const cfg = makeConfig(4000, vocab.size, 6);
  assert.strictEqual(cfg.V, vocab.size);
  const model = new TinyLM(cfg);
  const data = encodeText(text, vocab);
  const before = model.evalLoss(data);
  const steps = 400;
  for (let s = 0; s < steps; s++) {
    model.trainStep(data, 16, lrAt(s, steps, 0.05));
  }
  const after = model.evalLoss(data);
  const chance = Math.log(vocab.size);
  assert.ok(Number.isFinite(before) && Number.isFinite(after));
  assert.ok(after < before, `expected loss to drop (${before} -> ${after})`);
  assert.ok(after < chance, `expected loss ${after} < ln(V)=${chance}`);

  const run = model.startGeneration(vocab, 'the 😀', 30, 0.8);
  assert.strictEqual(run.unknown, 1);
  let sample = '';
  while (!run.done) sample += run.take(7).text;
  assert.strictEqual(sample.length, 30);
  assert.strictEqual(model.generate(vocab, 'the ', 12, 0.5).length, 12);
  model.evalLossAsync(data).then((asyncLoss) => {
    assert.strictEqual(asyncLoss, after);
    console.log(`loss ${before.toFixed(3)} -> ${after.toFixed(3)} (chance ${chance.toFixed(3)}, params ${countParams(cfg)})`);
    console.log('myllm.test.js: ok');
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
