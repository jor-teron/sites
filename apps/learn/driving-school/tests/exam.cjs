const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const E = require('../core/exam.js');
test('mock route combines stop, crossing, signal, roundabout and final parking on both sides', () => {
  for (const side of ['left','right']) {
    const d = E.mockDefinition(side); assert(d.town && d.mock); assert(d.gates.length >= 22);
    assert(d.parking); assert(d.gates.some(p => p[0] > 190 && p[1] > 160));
    assert.equal(d.gates[0][0], side === 'left' ? 63.5 : 56.5);
  }
});
test('mock pass requires completed route, zero serious and at most ten minor faults', () => {
  assert(E.testReport([], true, 123.4).pass);
  assert(!E.testReport([], false, 20).pass);
  const minor = { code:'speeding', reason:'Slow down', severity:'minor', time:10 };
  assert(E.testReport(Array(10).fill(minor),true,200).pass);
  assert(!E.testReport(Array(11).fill(minor),true,200).pass);
  const r = E.testReport([{ code:'red_light', severity:'serious', reason:'Red', time:15 }],true,200);
  assert(!r.pass); assert.equal(r.serious,1); assert.equal(r.faults[0].reason,'Red');
});
test('reports preserve all faults and do not mutate source; score is bounded', () => {
  const faults = Array.from({ length:50 }, () => ({ severity:'serious', reason:'Fault' }));
  const r = E.testReport(faults,false,4); assert.equal(faults.length,50); assert.equal(r.faults.length,51); assert.equal(r.score,0);
});
test('quiz reuses exactly 20 different procedural Indian signs with four distinct answers', () => {
  const sandbox = { window: {} }; vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../../road-safety/core/signs.js'),'utf8'), sandbox);
  const quiz = E.signQuiz(sandbox.window.RS.signs, () => .42);
  assert.equal(quiz.length,20); assert.equal(new Set(quiz.map(q => q.sign.id)).size,20);
  for (const q of quiz) { assert.equal(new Set(q.choices).size,4); assert(q.choices.includes(q.answer)); assert(q.sign.svg.includes('<')); assert(q.sign.meaning.length > 10); }
});
