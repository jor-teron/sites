// Blood Group BG-3b — 4x4 ABO table, picker reason, and a stub-DOM check that chips show full group names (not only +/-).
// Run: node --test apps/learn/blood-group/tests/*.cjs apps/learn/shared/learn-hubbar.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx0 = { window: {} }; vm.createContext(ctx0);
vm.runInContext(fs.readFileSync(path.join(root, 'core/blood.js'), 'utf8'), ctx0);
const B = ctx0.window.BG, same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
const at = (mum, dad) => {
  const t = B.aboTable();
  return t.cells[t.rows.indexOf(mum)][t.cols.indexOf(dad)];
};
const letters = t => t.replace(/\u2212/g, '-');

test('aboTable is 4x4 with Mum and Dad in A, B, AB, O order', () => {
  const t = B.aboTable();
  same(t.rows, ['A', 'B', 'AB', 'O']);
  same(t.cols, ['A', 'B', 'AB', 'O']);
  assert.strictEqual(t.cells.length, 4);
  t.cells.forEach(row => assert.strictEqual(row.length, 4));
});

test('aboTable known results: O x O, A x B, AB x O, AB x AB', () => {
  same(at('O', 'O'), ['O']);
  same(at('A', 'B'), ['A', 'B', 'AB', 'O']);
  same(at('B', 'A'), ['A', 'B', 'AB', 'O']);
  same(at('AB', 'O'), ['A', 'B']);
  same(at('O', 'AB'), ['A', 'B']);
  same(at('AB', 'AB'), ['A', 'B', 'AB']);
  same(at('A', 'A'), ['A', 'O']);
  same(at('A', 'O'), ['A', 'O']);
  same(at('B', 'B'), ['B', 'O']);
  same(at('AB', 'A'), ['A', 'B', 'AB']);
});

test('picker child results: childGroups and canHaveChild for the new picker', () => {
  same(B.childGroups('A+', 'B+'), ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']); // all 8 are possible
  same(B.childGroups('O-', 'O-'), ['O-']);
  same(B.childGroups('O+', 'O+'), ['O-', 'O+']);
  same(B.childGroups('AB-', 'O+'), ['A-', 'A+', 'B-', 'B+']);
  same(B.childGroups('AB+', 'AB+'), ['A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']);
  assert.ok(B.canHaveChild('A+', 'B+', 'O-'));
  assert.ok(B.canHaveChild('A+', 'B+', 'AB+'));
  assert.ok(!B.canHaveChild('O-', 'O-', 'O+'));
  assert.ok(!B.canHaveChild('AB+', 'O+', 'O+'));
  assert.ok(!B.canHaveChild('AB+', 'O+', 'AB-'));
  assert.ok(B.canHaveChild('A-', 'A-', 'O-'));
  assert.ok(!B.canHaveChild('A-', 'A-', 'B-'));
});

test('pickerWhy is a plain-English reason, empty on bad input', () => {
  const ab = B.pickerWhy('A+', 'B+');
  assert.match(letters(ab), /Mum A gives A or O/);
  assert.match(letters(ab), /Dad B gives B or O/);
  assert.match(letters(ab), /child can be A, B, AB or O/);
  assert.match(letters(ab), /Rh: both \+ can give \+ or -/);
  const oo = letters(B.pickerWhy('O-', 'O-'));
  assert.match(oo, /Mum O gives only O/);
  assert.match(oo, /child can be O/);
  assert.match(oo, /both - give only -/);
  const abo = letters(B.pickerWhy('AB+', 'O-'));
  assert.match(abo, /Mum AB gives A or B/);
  assert.match(abo, /Dad O gives only O/);
  assert.match(abo, /child can be A or B/);
  assert.match(abo, /\+ and - can give either/);
  assert.strictEqual(B.pickerWhy('A', 'B+'), '');
  assert.strictEqual(B.pickerWhy('X+', 'O+'), '');
  assert.strictEqual(B.pickerWhy('', ''), '');
});

// ---- stub DOM: prove the picker renders full group names, not only + / - ----
class El {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attrs = {};
    this.listeners = {};
    this.hidden = false;
    this.nodeType = 1;
    this._text = '';
    const set = new Set();
    this.classList = {
      toggle: (c, on) => { on = on === undefined ? !set.has(c) : !!on; on ? set.add(c) : set.delete(c); return on; },
      add: (...cs) => cs.forEach(c => set.add(c)),
      remove: (...cs) => cs.forEach(c => set.delete(c)),
      contains: c => set.has(c)
    };
    Object.defineProperty(this, 'className', {
      get: () => [...set].join(' '),
      set: v => { set.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach(c => set.add(c)); }
    });
  }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  setAttribute(k, v) {
    const val = v == null ? '' : String(v);
    this.attrs[k] = val;
    if (k === 'class') this.className = val;
    if (k === 'hidden') this.hidden = true;
    if (k === 'id') this.id = val;
    if (k.startsWith('data-')) {
      const name = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[name] = val;
    }
  }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  append(...kids) {
    for (let c of kids) {
      if (c == null) continue;
      if (typeof c === 'string' || typeof c === 'number') c = { nodeType: 3, textContent: String(c), children: [] };
      this.children.push(c);
    }
  }
  appendChild(c) { this.append(c); return c; }
  replaceChildren(...c) { this.children = []; this.append(...c); }
  click() {
    const ev = { type: 'click', preventDefault() {}, target: this };
    (this.listeners.click || []).forEach(f => f(ev));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) { return walk(this).filter(el => el !== this && match(el, sel)); }
  get textContent() {
    if (!this.children.length) return this._text;
    return this.children.map(c => c.textContent || '').join('');
  }
  set textContent(v) { this.children = []; this._text = String(v == null ? '' : v); }
}
function walk(el, acc) {
  acc = acc || [];
  if (!el || el.nodeType === 3) return acc;
  acc.push(el);
  (el.children || []).forEach(c => walk(c, acc));
  return acc;
}
function match(el, sel) {
  if (!el || el.nodeType === 3) return false;
  return String(sel).split(',').map(s => s.trim()).some(s => matchOne(el, s));
}
function matchOne(el, sel) {
  // tag, #id, .class, [attr], [attr="val"] — in any combination, left to right
  let rest = sel, tag = '*';
  const mTag = /^([a-z][\w-]*)/i.exec(rest);
  if (mTag) { tag = mTag[1].toUpperCase(); rest = rest.slice(mTag[1].length); }
  if (tag !== '*' && el.tagName !== tag) return false;
  const bits = rest.match(/#[\w-]+|\.[\w-]+|\[(?:[^\]]+)\]/g) || [];
  if (!bits.length && !mTag) return false;
  return bits.every(b => {
    if (b[0] === '#') return el.id === b.slice(1);
    if (b[0] === '.') return el.classList.contains(b.slice(1));
    const a = /^\[([^=\]]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]$/.exec(b);
    if (!a) return false;
    const key = a[1], want = a[2] ?? a[3] ?? a[4];
    const got = key === 'class' ? el.className : (el.attrs[key] ?? (key in el ? String(el[key]) : null));
    return want == null ? got != null : got === want;
  });
}
function boot(seed) {
  const store = new Map(Object.entries(seed || {}));
  const ids = {};
  const document = {
    getElementById: id => ids[id] || (ids[id] = new El('div')),
    createElement: t => new El(t),
    createElementNS: (_, t) => new El(t),
    title: '',
    addEventListener() {}
  };
  document.getElementById('app').id = 'app';
  const ctx = {
    document, console, JSON, Object, Array, Set, Map, Number, String, Math,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    location: { hash: '#family' },
    addEventListener() {},
    LearnHubBar: undefined
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, '../common/core/state.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'core/blood.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'ui/app.js'), 'utf8'), ctx);
  return { ctx, app: document.getElementById('app'), store };
}
function labels(els) { return els.map(e => letters(e.textContent).trim()); }
function hasAbo(name) { return /^(A|B|AB|O)[+-]$/.test(name); }

test('family picker DOM shows full group names, not only + or -', () => {
  const { app } = boot();
  const family = walk(app).find(el => el.id === 'bg-family' || el.attrs['data-view'] === 'family');
  assert.ok(family, 'family view is in the DOM');
  const mumChips = walk(family).filter(el => el.tagName === 'BUTTON' && el.classList.contains('bg-chip') && String(el.attrs['aria-label'] || '').startsWith('Mum '));
  const dadChips = walk(family).filter(el => el.tagName === 'BUTTON' && el.classList.contains('bg-chip') && String(el.attrs['aria-label'] || '').startsWith('Dad '));
  const childChips = walk(family).filter(el => el.classList.contains('bg-childchip'));
  assert.strictEqual(mumChips.length, 8, 'Mum has 8 chips');
  assert.strictEqual(dadChips.length, 8, 'Dad has 8 chips');
  assert.strictEqual(childChips.length, 8, 'Child has 8 chips');
  const expect = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  assert.deepStrictEqual(labels(mumChips), expect);
  assert.deepStrictEqual(labels(dadChips), expect);
  assert.deepStrictEqual(labels(childChips), expect);
  for (const name of [...labels(mumChips), ...labels(dadChips), ...labels(childChips)]) {
    assert.ok(hasAbo(name), 'chip must be a full group, got ' + JSON.stringify(name));
    assert.ok(name.length > 1, 'must not be only + or -');
  }
  // The old 8-column drop row is gone from the family view (home page may still use drops).
  const famDrops = walk(family).filter(el => el.classList.contains('bg-drops') && !walk(el).some(c => c.classList.contains('bg-pair') || String(c.attrs && c.attrs['aria-label'] || '').includes('Mum ')));
  // Guess (in More) still uses a drop for the child; the picker itself must not be a .bg-drops grid of parent chips.
  const picker = walk(family).find(el => el.classList.contains('bg-picker'));
  assert.ok(picker, 'left-right picker is present');
  assert.ok(!walk(picker).some(el => el.classList.contains('bg-drops') || el.classList.contains('bg-dropt')), 'picker is chips, not drops');
});

test('default picker is Mum A+ and Dad B+, and child results light the right groups', () => {
  const { app, store } = boot();
  const family = walk(app).find(el => el.attrs['data-view'] === 'family');
  const pressed = (side) => walk(family).filter(el => el.classList.contains('bg-chip') && el.attrs['aria-pressed'] === 'true' && String(el.attrs['aria-label'] || '').startsWith(side + ' ')).map(e => letters(e.textContent).trim());
  assert.deepStrictEqual(pressed('Mum'), ['A+']);
  assert.deepStrictEqual(pressed('Dad'), ['B+']);
  const child = walk(family).filter(el => el.classList.contains('bg-childchip'));
  assert.ok(child.every(c => c.classList.contains('bg-on')), 'A+ x B+ can have all 8 groups');
  const why = letters(walk(family).find(el => el.classList.contains('bg-whyline')).textContent);
  assert.match(why, /Mum A gives A or O/);
  assert.match(why, /child can be A, B, AB or O/);

  const mumO = walk(family).find(el => el.classList.contains('bg-chip') && el.dataset.g === 'O-' && String(el.attrs['aria-label'] || '').startsWith('Mum '));
  const dadO = walk(family).find(el => el.classList.contains('bg-chip') && el.dataset.g === 'O-' && String(el.attrs['aria-label'] || '').startsWith('Dad '));
  mumO.click(); dadO.click();
  assert.deepStrictEqual(pressed('Mum'), ['O-']);
  assert.deepStrictEqual(pressed('Dad'), ['O-']);
  const after = walk(family).filter(el => el.classList.contains('bg-childchip'));
  const on = after.filter(c => c.classList.contains('bg-on')).map(c => letters(c.textContent).trim());
  const off = after.filter(c => c.classList.contains('bg-off')).map(c => letters(c.textContent).trim());
  assert.deepStrictEqual(on, ['O-']);
  assert.strictEqual(off.length, 7);
  assert.ok(!off.includes('O-'));
  const why2 = letters(walk(family).find(el => el.classList.contains('bg-whyline')).textContent);
  assert.match(why2, /child can be O/);
  assert.match(why2, /both - give only -/);
  const saved = JSON.parse(store.get('learn.blood-group.family'));
  assert.strictEqual(saved.mum, 'O-');
  assert.strictEqual(saved.dad, 'O-');
});

test('tapping an ABO table cell sets the picker and keeps Rh', () => {
  const { app } = boot(); // defaults A+ / B+
  const family = walk(app).find(el => el.attrs['data-view'] === 'family');
  const cell = walk(family).find(el => el.tagName === 'TD' && el.dataset.mum === 'AB' && el.dataset.dad === 'O');
  assert.ok(cell, 'AB x O cell');
  assert.strictEqual(letters(cell.textContent).trim(), 'A, B');
  const oo = walk(family).find(el => el.tagName === 'TD' && el.dataset.mum === 'O' && el.dataset.dad === 'O');
  assert.strictEqual(letters(oo.textContent).trim(), 'O');
  const abab = walk(family).find(el => el.tagName === 'TD' && el.dataset.mum === 'AB' && el.dataset.dad === 'AB');
  assert.strictEqual(letters(abab.textContent).trim(), 'A, B, AB');
  const ab = walk(family).find(el => el.tagName === 'TD' && el.dataset.mum === 'A' && el.dataset.dad === 'B');
  assert.strictEqual(letters(ab.textContent).trim(), 'A, B, AB, O');
  cell.click(); // Mum AB+, Dad O+ (Rh kept from A+ / B+)
  const pressed = (side) => walk(family).filter(el => el.classList.contains('bg-chip') && el.attrs['aria-pressed'] === 'true' && String(el.attrs['aria-label'] || '').startsWith(side + ' ')).map(e => letters(e.textContent).trim());
  assert.deepStrictEqual(pressed('Mum'), ['AB+']);
  assert.deepStrictEqual(pressed('Dad'), ['O+']);
  const on = walk(family).filter(el => el.classList.contains('bg-childchip') && el.classList.contains('bg-on')).map(c => letters(c.textContent).trim());
  assert.deepStrictEqual(on, ['A+', 'A-', 'B+', 'B-']);
});

test('family page keeps the lab-test note, a short alleles line, and a collapsed More section', () => {
  const src = fs.readFileSync(path.join(root, 'ui/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'ui/blood.css'), 'utf8');
  assert.match(src, /Rare variants \(like Bombay group\) exist\. Real family questions need a lab test\./);
  assert.match(src, /h\('details'/);
  assert.match(src, /More: guess and gene pairs/);
  assert.match(css, /white-space:\s*nowrap/);
  assert.match(css, /\.bg-picker/);
  assert.match(css, /min-height:\s*44px/);
  const { app } = boot();
  const family = walk(app).find(el => el.attrs['data-view'] === 'family');
  const more = walk(family).find(el => el.tagName === 'DETAILS' && el.classList.contains('bg-more'));
  assert.ok(more, 'More is a details element');
  assert.ok(!more.open, 'More starts collapsed (default details)');
  const note = walk(family).find(el => /lab test/.test(el.textContent || ''));
  assert.ok(note, 'lab-test note is visible');
});
