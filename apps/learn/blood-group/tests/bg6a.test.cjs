// Blood Group BG-6a — Health "know your numbers" data and hbBand (core/blood.js, no DOM).
// Run: node --test apps/learn/blood-group/tests/*.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../core/blood.js'), 'utf8'), ctx);
const B = ctx.window.BG;

function blobOf(item) {
  const lines = (item.lines || []).join(' ');
  return [item.title, item.unit, lines, item.seeDoctor].join(' ');
}

test('range data covers haemoglobin, blood pressure and blood sugar, each with a see-a-doctor line', () => {
  const ranges = B.health.ranges;
  assert.ok(ranges && typeof ranges.note === 'string');
  assert.match(ranges.note, /approximate|labs vary/i);
  const items = ranges.items;
  assert.ok(Array.isArray(items) && items.length === 3);
  const by = id => items.find(r => r.id === id);
  const hb = by('hb'), bp = by('bp'), sugar = by('sugar');
  assert.ok(hb && bp && sugar);

  assert.match(hb.title, /haemoglobin/i);
  assert.strictEqual(hb.unit, 'g/dL');
  const hbText = blobOf(hb);
  assert.match(hbText, /13\.5/);
  assert.match(hbText, /17\.5/);
  assert.match(hbText, /12\.0/);
  assert.match(hbText, /15\.5/);
  assert.match(hbText, /pregnan/i);
  assert.match(hbText, /11/);
  assert.match(hb.seeDoctor, /see a doctor/i);

  const bpText = blobOf(bp);
  assert.match(bp.title, /blood pressure/i);
  assert.match(bpText, /120\/80/);
  assert.match(bpText, /elevated/i);
  assert.match(bpText, /130\/80/);
  assert.match(bpText, /180\/120/);
  assert.match(bp.seeDoctor, /see a doctor/i);

  const sText = blobOf(sugar);
  assert.match(sugar.title, /blood sugar/i);
  assert.strictEqual(sugar.unit, 'mg/dL');
  assert.match(sText, /fasting/i);
  assert.match(sText, /100/);
  assert.match(sText, /125/);
  assert.match(sText, /126/);
  assert.match(sText, /140/);
  assert.match(sText, /199/);
  assert.match(sText, /200/);
  assert.match(sText, /prediabetes/i);
  assert.match(sugar.seeDoctor, /see a doctor/i);

  for (const r of items) {
    assert.ok(Array.isArray(r.lines) && r.lines.length > 0, r.id + ' lines');
    assert.ok(r.lines.every(ln => typeof ln === 'string' && ln.trim().length > 0), r.id + ' line text');
    assert.ok(typeof r.seeDoctor === 'string' && /see a doctor/i.test(r.seeDoctor), r.id + ' seeDoctor');
  }
});

test('CBC entries include Hb, RBC, WBC, platelets, hematocrit/PCV and MCV', () => {
  const cbc = B.health.cbc;
  assert.ok(cbc && typeof cbc.lead === 'string');
  assert.match(cbc.lead, /complete blood count|CBC/i);
  const items = cbc.items;
  assert.ok(Array.isArray(items) && items.length >= 4);
  const by = id => items.find(c => c.id === id);
  const hb = by('hb'), rbc = by('rbc'), wbc = by('wbc'), plt = by('plt'), hct = by('hct'), mcv = by('mcv');
  assert.ok(hb && rbc && wbc && plt && hct && mcv);
  assert.match(hb.name, /Hb/i);
  assert.match(hb.text, /oxygen/i);
  assert.match(rbc.text, /4\.5/);
  assert.match(rbc.text, /5\.9/);
  assert.match(rbc.text, /4\.1/);
  assert.match(rbc.text, /5\.1/);
  assert.match(wbc.text, /4,000|4000/);
  assert.match(wbc.text, /11,000|11000/);
  assert.match(plt.text, /150,000|150000/);
  assert.match(plt.text, /450,000|450000/);
  assert.match(hct.name, /hematocrit/i);
  assert.match(hct.name, /PCV/);
  assert.match(mcv.name, /MCV/);
  assert.match(mcv.text, /iron/i);
  assert.match(mcv.text, /B12|folate/i);
  for (const c of items) {
    assert.ok(typeof c.name === 'string' && c.name.trim().length > 0, c.id + ' name');
    assert.ok(typeof c.text === 'string' && c.text.trim().length > 8, c.id + ' text');
  }
});

test('hbBand boundaries for man, woman and pregnant', () => {
  // man: 13.5 to 17.5
  assert.strictEqual(B.hbBand(13.5, 'man'), 'normal');
  assert.strictEqual(B.hbBand(17.5, 'man'), 'normal');
  assert.strictEqual(B.hbBand(13.49, 'man'), 'low');
  assert.strictEqual(B.hbBand(17.51, 'man'), 'high');
  assert.strictEqual(B.hbBand(15, 'man'), 'normal');
  assert.strictEqual(B.hbBand(3, 'man'), 'low');
  assert.strictEqual(B.hbBand(25, 'man'), 'high');
  // woman: 12.0 to 15.5
  assert.strictEqual(B.hbBand(12, 'woman'), 'normal');
  assert.strictEqual(B.hbBand(12.0, 'woman'), 'normal');
  assert.strictEqual(B.hbBand('12.0', 'woman'), 'normal');
  assert.strictEqual(B.hbBand(15.5, 'woman'), 'normal');
  assert.strictEqual(B.hbBand(11.99, 'woman'), 'low');
  assert.strictEqual(B.hbBand(15.51, 'woman'), 'high');
  assert.strictEqual(B.hbBand('13.5', 'Woman'), 'normal');
  // pregnant: below 11 is anaemia; same 15.5 upper as women
  assert.strictEqual(B.hbBand(11, 'pregnant'), 'normal');
  assert.strictEqual(B.hbBand(11.0, 'pregnant'), 'normal');
  assert.strictEqual(B.hbBand(10.99, 'pregnant'), 'low');
  assert.strictEqual(B.hbBand(15.5, 'pregnant'), 'normal');
  assert.strictEqual(B.hbBand(15.51, 'pregnant'), 'high');
  assert.strictEqual(B.hbBand('10.5', 'Pregnant'), 'low');
  // 12 is low for a man, normal for a woman or in pregnancy
  assert.strictEqual(B.hbBand(12, 'man'), 'low');
  assert.strictEqual(B.hbBand(12, 'woman'), 'normal');
  assert.strictEqual(B.hbBand(12, 'pregnant'), 'normal');
});

test('hbBand rejects invalid input and unknown who', () => {
  const badVals = [null, undefined, '', '  ', 'abc', '13.5mg', '13,5', '1e2', '-4', 2.9, 25.1, 0, 30, 2.99, 25.01, NaN, Infinity, {}, [], true, false];
  for (const v of badVals) {
    assert.strictEqual(B.hbBand(v, 'man'), null, 'value ' + String(v));
  }
  assert.strictEqual(B.hbBand(' 13.5 ', 'man'), 'normal');
  assert.strictEqual(B.hbBand(13.5, ''), null);
  assert.strictEqual(B.hbBand(13.5, null), null);
  assert.strictEqual(B.hbBand(13.5, 'child'), null);
  assert.strictEqual(B.hbBand(13.5, 'men'), null);
  assert.ok(typeof B.health.disclaimer === 'string' && /not medical advice/i.test(B.health.disclaimer));
});
