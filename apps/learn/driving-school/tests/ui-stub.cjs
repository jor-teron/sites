/* DS-2a: non-browser smoke test of the classic UI scripts (app.js, dash.js, render.js)
   in a Node vm with a tiny stub DOM. Catches wiring errors; it is not a layout test. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const dir = path.join(__dirname, '..');
const noop = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : noop, apply: () => noop, set: () => true });
class El {
  constructor(tag, id) {
    Object.assign(this, { tag, id: id || '', children: [], dataset: {}, attrs: {}, listeners: {}, textContent: '', hidden: false, value: '', open: false, disabled: false,
      offsetWidth: 200, clientWidth: 800, offsetParent: {} });
    const set = new Set(); this.classList = { toggle: (c, on) => { on = on === undefined ? !set.has(c) : !!on; on ? set.add(c) : set.delete(c); return on; }, add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c) };
    const style = {}; style.setProperty = (k, v) => { style[k] = v; }; this.style = style;
  }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  dispatch(type, e = {}) { const ev = Object.assign({ preventDefault() {}, pointerId: 1, clientX: 0, clientY: 0, target: this }, e); (this.listeners[type] || []).forEach(f => f(ev)); if (this['on' + type]) this['on' + type](ev); }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; }
  appendChild(c) { this.children.push(c); return c; } replaceChildren(...c) { this.children = c; }
  querySelector() { return this._q || (this._q = new El('svg')); } querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 }; }
  setPointerCapture() {} showModal() { this.open = true; } close() { this.open = false; this.dispatch('close'); }
  click() { this.dispatch('click'); }
  matches() { return false; } closest() { return null; } getContext() { return noop; } remove() {}
}
function boot(search = '?test') {
  const ids = {}, rafs = [], winListeners = {};
  const pedals = ['clutch', 'brake', 'throttle'].map(h => { const e = new El('button'); e.dataset.hold = h; return e; });
  const store = new Map();
  const document = { getElementById: id => ids[id] || (ids[id] = new El('div', id)), createElement: t => new El(t), createElementNS: (_, t) => new El(t),
    querySelector: sel => sel.startsWith('[data-hold="') ? pedals.find(p => sel.includes('"' + p.dataset.hold + '"')) : document.getElementById('q:' + sel),
    querySelectorAll: sel => sel === '[data-hold]' ? pedals : [], addEventListener() {}, documentElement: new El('html'), body: new El('body'), hidden: false };
  const ctx = { document, console, URLSearchParams, Math, JSON, Object, Array, Set, Map, Number, String, Event: class { constructor(t) { this.type = t; } },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    matchMedia: () => ({ matches: false, addEventListener() {} }), HubTheme: { own: () => 'system', onChange() {}, setOwn() {} },
    requestAnimationFrame: f => rafs.push(f), performance: { now: () => 0 }, location: { search, protocol: 'http:' },
    devicePixelRatio: 2, innerWidth: 844, innerHeight: 390, navigator: {}, setTimeout: () => 0,
    addEventListener: (t, f) => (winListeners[t] = winListeners[t] || []).push(f), dispatchEvent: e => (winListeners[e.type] || []).forEach(f => f(e)) };
  document.getElementById('screen').classList.add('flat');   // as in the HTML
  ctx.window = ctx; ctx.globalThis = ctx; ctx.parent = ctx; vm.createContext(ctx);
  const html = fs.readFileSync(path.join(dir, 'driving-school.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]).filter(s => !s.includes('hub_theme'));
  for (const s of scripts) vm.runInContext(fs.readFileSync(path.join(dir, s), 'utf8'), ctx, { filename: s });
  const frame = t => { const f = rafs.shift(); f(t); };
  return { ctx, ids, rafs, frame, pedals, win: winListeners };
}
test('page loads the classic scripts, ES module last, and the Hub bar gets its buttons', () => {
  const html = fs.readFileSync(path.join(dir, 'driving-school.html'), 'utf8');
  assert.match(html, /<script type="module" src="ui\/view3d.js"><\/script>\s*<\/body>/);
  assert(fs.readFileSync(path.join(dir, 'ui/app.js'), 'utf8').includes("{ buttons: '#quiz,#help,#mute,#settings' }"));
  assert.match(fs.readFileSync(path.join(dir, 'ui/view3d.js'), 'utf8'), /from '\.\.\/\.\.\/common\/vendor\/three\/three\.module\.min\.js'/);
  for (const id of ['view3d', 'road', 'mirror', 'mirror-l', 'mirror-r', 'hint', 'wheel', 'horn', 'speedo', 'tacho', 'gate', 'park', 'engine', 'left', 'right', 'look', 'cockpit', 'lessons', 'end-test'])
    assert.match(html, new RegExp('id="' + id + '"'), id);
});
test('map fallback runs; manual by default; dashboard follows the car', () => {
  const { ctx, ids, frame } = boot();
  const t = ctx.drivingTest; assert(t); assert.equal(t.view3d, false); assert(ids.screen.classList.contains('flat'));
  assert.equal(t.s.c.auto, false, 'manual is the default');
  frame(16); frame(32);
  assert.equal(ids.gate.children.length, 7, 'H-pattern gear lever'); assert.equal(ids.gear.textContent, 'N');
  assert.match(ids.hint.textContent, /^Next: /);
  ids.engine.click(); ids.gate.children.find(b => String(b.dataset.gear) === '1').click();   // clutch is down at rest
  assert.equal(t.s.c.gear, 1); frame(48); assert.equal(ids.gear.textContent, '1');
  ids.park.click(); assert.equal(t.s.c.handbrake, false);
  t.s.c.steer = .5; frame(64); assert(t.s.c.steer > .4);
  assert.equal(ids.wheel.style.transform, 'rotate(' + (t.s.c.steer * 150).toFixed(1) + 'deg)', 'wheel turns with the steering');
  ids.left.click(); assert.equal(t.s.c.indicator, 'left');
});
test('3D view takes over when the module registers, mirrors are passed in', () => {
  const { ctx, ids, frame } = boot();
  let calls = 0, frames = null;
  ctx.DS.view3dFactory = () => ({ render(s, prefs, f) { calls++; frames = f; } });
  ctx.dispatchEvent(new ctx.Event('ds-view3d'));
  assert.equal(ctx.drivingTest.view3d, true); assert(!ids.screen.classList.contains('flat'));
  frame(16); assert.equal(calls, 1); assert.equal(frames.rear, ids.mirror); assert.equal(frames.sides, true);
  ctx.DS.view3dFactory = () => ({ render() { throw new Error('boom'); } });
});
test('a failing 3D view falls back to the map instead of freezing', () => {
  const { ctx, ids, frame, rafs } = boot();
  const err = console.error; console.error = () => {};
  ctx.DS.view3dFactory = () => ({ render() { throw new Error('lost'); } }); ctx.dispatchEvent(new ctx.Event('ds-view3d'));
  frame(16); console.error = err;
  assert.equal(ctx.drivingTest.view3d, false); assert(ids.screen.classList.contains('flat')); assert.equal(rafs.length, 1, 'loop continues');
});
test('automatic gear lever shows R N D; wheel drag steers; town and mock lessons run', () => {
  const { ctx, ids, frame, pedals } = boot();
  ids.transmission.value = 'auto'; ids.transmission.onchange({ target: ids.transmission });
  ctx.drivingTest.s.paused = false; frame(16);
  assert.deepEqual(ids.gate.children.map(b => b.textContent), ['R', 'N', 'D']); assert(ids.cockpit.classList.contains('auto'));
  const wheel = ids.wheel; wheel.dispatch('pointerdown', { clientX: 400, clientY: 100 }); wheel.dispatch('pointermove', { clientX: 500, clientY: 200 });
  assert(ctx.drivingTest.input().steer > 0, 'clockwise drag steers right'); wheel.dispatch('pointerup'); assert.equal(ctx.drivingTest.input().steer, 0);
  pedals[2].onpointerdown({ preventDefault() {}, pointerId: 2 }); assert.equal(ctx.drivingTest.input().throttle, 1); pedals[2].onpointerup();
  for (const id of ['lane', 'roundabout', 'mock']) { ids.lessons.value = id; ids.lessons.onchange(); for (let i = 0; i < 5; i++) frame(16 * (i + 2)); assert.equal(ctx.drivingTest.s.l.def.id, id); }
  assert.equal(ids['end-test'].hidden, false);
});
