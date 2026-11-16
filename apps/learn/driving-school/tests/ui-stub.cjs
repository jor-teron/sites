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
    const set = new Set(); this.classList = { toggle: (c, on) => { on = on === undefined ? !set.has(c) : !!on; on ? set.add(c) : set.delete(c); return on; }, add: (...cs) => cs.forEach(c => set.add(c)), remove: (...cs) => cs.forEach(c => set.delete(c)), contains: c => set.has(c) };
    const style = {}; style.setProperty = (k, v) => { style[k] = v; }; this.style = style;
  }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  dispatch(type, e = {}) { const ev = Object.assign({ preventDefault() {}, stopPropagation() {}, pointerId: 1, clientX: 0, clientY: 0, target: this }, e); (this.listeners[type] || []).forEach(f => f(ev)); if (this['on' + type]) this['on' + type](ev); }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; }
  appendChild(c) { this.children.push(c); return c; } replaceChildren(...c) { this.children = c; }
  querySelector() { return this._q || (this._q = new El('svg')); } querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 }; }
  setPointerCapture() {} showModal() { this.open = true; } close() { this.open = false; this.dispatch('close'); }
  click() { this.dispatch('click'); }
  matches() { return false; } closest() { return null; } getContext() { return noop; } remove() {}
}
function boot(search = '?test', seed) {
  const ids = {}, rafs = [], winListeners = {};
  const pedals = ['clutch', 'brake', 'throttle'].map(h => { const e = new El('button'); e.dataset.hold = h; return e; });
  const store = new Map(Object.entries(seed || {}));
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
  for (const id of ['view3d', 'road', 'mirror', 'mirror-l', 'mirror-r', 'hint', 'note', 'note-show', 'minimap', 'wheel', 'horn', 'speedo', 'tacho', 'gate', 'park', 'engine', 'left', 'right', 'look', 'cockpit', 'lessons', 'end-test', 'odo-total', 'odo-trip', 'trip-reset', 'dash-score', 'edge-alert', 'edge-alert-pref'])
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
test('DS-3: Open road group, route number input, endless and loop run on the map fallback', () => {
  const { ctx, ids, frame } = boot();
  const groups = ids.lessons.children.map(g => g.label);
  assert.deepEqual(groups, ['Practice lot', 'Town', 'Open road', 'Test']);
  assert.deepEqual(ids.lessons.children[2].children.map(o => o.value), ['endless', 'loop']);
  assert.equal(ctx.drivingTest.s.c.auto, false, 'manual stays the default');
  for (const id of ['endless', 'loop']) {
    ids.lessons.value = id; ids.lessons.onchange();
    assert.equal(ids['route-box'].hidden, false); assert.equal(ids.route.value, '1');
    const shape = () => ctx.drivingTest.s.w.road.pts.slice(40, 120).map(p => p.y.toFixed(2)).join(), before = shape();
    ids.route.value = '17'; ids.route.onchange();
    assert.equal(ctx.drivingTest.s.l.def.route, 17); assert.notEqual(shape(), before);
    for (let i = 0; i < 5; i++) frame(16 * (i + 2));
    assert.match(ids.progress.textContent, /km\/h/); assert.match(ids['lesson-name'].textContent, /route 17/);
    ids.route.value = '1'; ids.route.onchange();
  }
  ids.lessons.value = 'lane'; ids.lessons.onchange(); assert.equal(ids['route-box'].hidden, true);
  assert.match(fs.readFileSync(path.join(dir, 'ui/driving.css'), 'utf8'), /body\.hub-titlebar \.lrn-head\{display:none!important\}/, 'Hub title bar hides the in-page row');
});

test('DS-4: engine button label and running class follow the engine state', () => {
  const { ctx, ids, frame } = boot();
  frame(16);
  assert.equal(ids.engine.textContent, 'Engine OFF');
  assert.equal(ids.engine.classList.contains('running'), false);
  assert.equal(ctx.drivingTest.s.c.engine, false);
  ids.engine.click(); frame(32);
  assert.equal(ctx.drivingTest.s.c.engine, true);
  assert.equal(ids.engine.textContent, 'Engine ON');
  assert.equal(ids.engine.classList.contains('running'), true);
});
test('DS-4: mini-map is off by default, saved in settings, and the map fallback still draws', () => {
  const PRE = 'learn.driving-school.settings';
  const first = boot();
  assert.equal(first.ctx.drivingTest.prefs.minimap, false);
  assert(first.ids.screen.classList.contains('no-minimap'));
  assert(first.ids.screen.classList.contains('flat'), 'stub boots in map fallback');
  first.ids.minimap.value = 'on'; first.ids.minimap.onchange({ target: first.ids.minimap });
  assert.equal(first.ctx.drivingTest.prefs.minimap, true);
  assert(!first.ids.screen.classList.contains('no-minimap'));
  const saved = JSON.parse(first.ctx.localStorage.getItem(PRE));
  assert.equal(saved.minimap, true);

  const again = boot('?test', { [PRE]: JSON.stringify({ auto: false, side: 'left', muted: false, route: 1, minimap: true }) });
  assert.equal(again.ctx.drivingTest.prefs.minimap, true);
  assert(!again.ids.screen.classList.contains('no-minimap'));

  const legacy = boot('?test', { [PRE]: JSON.stringify({ auto: false, side: 'left', muted: false, route: 1 }) });
  assert.equal(legacy.ctx.drivingTest.prefs.minimap, false, 'old settings without the key stay off');

  // Map fallback (?view=map style / no 3D) still draws every frame when the mini-map is off.
  const { ctx, ids, frame } = boot();
  let draws = 0; const orig = ctx.DS.draw; ctx.DS.draw = function () { draws++; return orig.apply(this, arguments); };
  frame(16); frame(32);
  assert(draws >= 2, 'flat fallback still paints the full map');
  assert(ids.screen.classList.contains('flat') && ids.screen.classList.contains('no-minimap'));

  // In 3D, the mini-map canvas is not drawn until Settings turns it on.
  const td = boot();
  td.ctx.DS.view3dFactory = () => ({ render() {} }); td.ctx.dispatchEvent(new td.ctx.Event('ds-view3d'));
  let mini = 0; const base = td.ctx.DS.draw; td.ctx.DS.draw = function () { mini++; return base.apply(this, arguments); };
  for (let i = 0; i < 9; i++) td.frame(16 * (i + 1));
  assert.equal(mini, 0, '3D view does not draw the mini-map when it is off');
  assert(!td.ids.screen.classList.contains('flat'));
  assert(td.ids.screen.classList.contains('no-minimap'));
  td.ids.minimap.value = 'on'; td.ids.minimap.onchange({ target: td.ids.minimap });
  td.ctx.drivingTest.s.paused = false;
  mini = 0;
  for (let i = 0; i < 9; i++) td.frame(16 * (i + 10));
  assert(mini > 0, 'turning the mini-map on draws it in the 3D view');
  assert(!td.ids.screen.classList.contains('no-minimap'));
});
test('DS-4: lesson note fades after a few seconds and a tap brings it back', () => {
  const { ids, frame } = boot();
  frame(16);
  assert.match(ids.hint.textContent, /^Next: /);
  assert.equal(ids.note.classList.contains('faded'), false);
  frame(16 + 5000);
  assert.equal(ids.note.classList.contains('faded'), true);
  assert.match(ids.hint.textContent, /^Next: /, 'text stays in the document for the chip / reader');
  ids['note-show'].click();
  frame(16 + 5000 + 16);
  assert.equal(ids.note.classList.contains('faded'), false);
  const html = require('node:fs').readFileSync(require('node:path').join(dir, 'driving-school.html'), 'utf8');
  assert(!html.includes('class="disclaimer"'), 'footer row is gone');
  assert.match(html, /id="left"[\s\S]*id="speedo"[\s\S]*id="wheel"[\s\S]*id="tacho"[\s\S]*id="right"/, 'indicators sit beside the dials');
  const css = require('node:fs').readFileSync(require('node:path').join(dir, 'ui/driving.css'), 'utf8');
  assert.match(css, /width:100vw;height:100vh;width:100dvw;height:100dvh/, 'driving view fills the screen with vw/vh fallbacks');
  assert.match(css, /html,body\{[^}]*overflow:hidden/, 'the page does not scroll while driving');
  assert.match(css, /\.lrn-head button\{font-size:11px;min-height:28px/, 'the in-app top bar is thinner');
});

test('DS-4a: Total and Trip odometers count movement, trip resets, values persist', () => {
  const PRE = 'learn.driving-school.odo';
  const { ctx, ids, frame } = boot();
  frame(16);
  assert.equal(ids['odo-total'].textContent, '0.0 km');
  assert.equal(ids['odo-trip'].textContent, '0.0 km');
  const t = ctx.drivingTest;
  assert.equal(t.odo.total, 0); assert.equal(t.odo.trip, 0);
  t.D.start(t.s.c); t.D.shift(t.s.c, 1); t.s.c.handbrake = false; t.s.c.clutch = 0;
  t.s.c.v = 10;
  for (let i = 0; i < 40; i++) t.update(0.05);
  assert(t.s.c.distance > 10, 'car moved ' + t.s.c.distance);
  assert(t.odo.total > 10 && t.odo.trip > 10);
  assert.equal(t.odo.total, t.odo.trip);
  assert.match(ids['odo-total'].textContent, / km$/);
  assert.equal(ids['odo-total'].textContent, t.D.formatKm(t.odo.total));
  assert.equal(ids['odo-trip'].textContent, t.D.formatKm(t.odo.trip));
  const total = t.odo.total;
  t.s.c.v = 0; t.s.c.handbrake = true;
  ids['trip-reset'].click();
  t.update(0);
  assert.equal(t.odo.trip, 0); assert.equal(t.odo.total, total);
  assert.equal(ids['odo-trip'].textContent, '0.0 km');
  assert.equal(ids['odo-total'].textContent, t.D.formatKm(total));
  // Throttled save: not every frame, but pagehide always writes.
  t.s.c.v = 8;
  for (let i = 0; i < 10; i++) t.update(0.05);
  ctx.dispatchEvent(new ctx.Event('pagehide'));
  const saved = JSON.parse(ctx.localStorage.getItem(PRE));
  assert(saved.total > total); assert(saved.trip > 0); assert.equal(saved.total, t.odo.total);

  const again = boot('?test', { [PRE]: JSON.stringify({ total: 12340, trip: 400 }) });
  again.frame(16);
  assert.equal(again.ctx.drivingTest.odo.total, 12340); assert.equal(again.ctx.drivingTest.odo.trip, 400);
  assert.equal(again.ids['odo-total'].textContent, '12.3 km');
  assert.equal(again.ids['odo-trip'].textContent, '0.4 km');

  // Open road (endless) also feeds the same odometers.
  const road = boot();
  road.ids.lessons.value = 'endless'; road.ids.lessons.onchange();
  const r = road.ctx.drivingTest;
  assert(r.s.w && r.s.w.road);
  r.D.start(r.s.c); r.s.c.handbrake = false; r.s.c.clutch = 0; r.D.shift(r.s.c, 1); r.s.c.v = 12;
  for (let i = 0; i < 30; i++) r.update(0.05);
  assert(r.s.c.distance > 8 && r.odo.total > 8, 'open road movement counts');
});
test('DS-4a: engine crank plays on start; fault beep is rate-limited', () => {
  const { ctx, ids, frame } = boot();
  let cranks = 0, beeps = 0;
  const sound = ctx.DS.sound;
  const crank = sound.crank.bind(sound), fault = sound.fault.bind(sound);
  sound.crank = () => { cranks++; crank(); };
  sound.fault = () => { beeps++; fault(); };
  frame(16);
  ids.engine.click();
  assert.equal(ctx.drivingTest.s.c.engine, true);
  assert.equal(cranks, 1);
  ids.engine.click();
  assert.equal(cranks, 1, 'already running does not crank again');
  ctx.drivingTest.s.c.engine = false; ctx.drivingTest.s.c.v = 5; ctx.drivingTest.s.c.gear = 1; ctx.drivingTest.s.c.clutch = 0;
  ids.engine.click();
  assert.equal(ctx.drivingTest.s.c.engine, false);
  assert.equal(cranks, 1, 'a failed start does not crank');

  ctx.DS.penalize(ctx.drivingTest.s.l, 'x', 'reason', 1);
  frame(32);
  assert.equal(beeps, 1);
  ctx.DS.penalize(ctx.drivingTest.s.l, 'y', 'reason', 1);
  frame(48);
  assert.equal(beeps, 1, 'a second fault inside the cooldown is silent');
  ctx.DS.penalize(ctx.drivingTest.s.l, 'z', 'reason', 1);
  frame(32 + 800);
  assert.equal(beeps, 2);
});
test('DS-4a: dashboard is 25% shorter and the wheel keeps its DS-4 size', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(dir, 'ui/driving.css'), 'utf8');
  assert.match(css, /height:clamp\(150px,34\.5vh,270px\)/, 'dash panel is 25% shorter than DS-4');
  assert.match(css, /\.wheel-box\{[^}]*height:153\.33%/, 'wheel height is raised so its size stays the same');
  assert.match(css, /max-height:128px/, 'dials are more compact');
  const html = require('node:fs').readFileSync(require('node:path').join(dir, 'driving-school.html'), 'utf8');
  assert.match(html, /id="odo-total"/); assert.match(html, /id="trip-reset"/);
});

test('DS-4b: engine button and Enter toggle on and off; restart cranks; trip reset has a 44px hit area', () => {
  const { ctx, ids, frame } = boot();
  frame(16);
  let cranks = 0, cuts = 0;
  const sound = ctx.DS.sound;
  const crank = sound.crank.bind(sound), cut = sound.cutEngine.bind(sound);
  sound.crank = () => { cranks++; crank(); };
  sound.cutEngine = () => { cuts++; cut(); };
  ids.engine.click(); frame(32);
  assert.equal(ctx.drivingTest.s.c.engine, true);
  assert.equal(ids.engine.textContent, 'Engine ON');
  assert.equal(ids.engine.classList.contains('running'), true);
  assert.equal(cranks, 1);
  ids.engine.click(); frame(48);
  assert.equal(ctx.drivingTest.s.c.engine, false);
  assert.equal(ctx.drivingTest.s.c.rpm, 0);
  assert.equal(ids.engine.textContent, 'Engine OFF');
  assert.equal(ids.engine.classList.contains('running'), false);
  assert.equal(cranks, 1, 'switching off does not crank');
  assert.equal(cuts, 1);

  const key = k => ctx.dispatchEvent(Object.assign(new ctx.Event('keydown'), { key: k, target: { matches: () => false }, preventDefault() {}, repeat: false }));
  key('Enter'); frame(64);
  assert.equal(ctx.drivingTest.s.c.engine, true);
  assert.equal(cranks, 2, 'Enter starts and cranks again');
  key('Enter'); frame(80);
  assert.equal(ctx.drivingTest.s.c.engine, false);
  assert.equal(cuts, 2, 'Enter also switches off');

  const t = ctx.drivingTest;
  t.s.c.v = 0; t.s.c.gear = 0; t.s.c.clutch = 1; t.s.c.handbrake = true;
  ids.engine.click();
  assert.equal(t.s.c.engine, true); assert.equal(cranks, 3);
  t.D.shift(t.s.c, 1); t.s.c.handbrake = false; t.s.c.clutch = 0; t.s.c.v = 10;
  const moving = t.s.c.v;
  ids.engine.click();
  assert.equal(t.s.c.engine, false);
  for (let i = 0; i < 30; i++) t.update(0.05);
  assert(t.s.c.v < moving && t.s.c.v > 0, 'coasts without power');
  assert.equal(t.s.c.engine, false);
  ids.engine.click();
  assert.equal(t.s.c.engine, false, 'start still refused while moving');
  assert.equal(cranks, 3, 'a refused start does not crank');

  const css = fs.readFileSync(path.join(dir, 'ui/driving.css'), 'utf8');
  assert.match(css, /#trip-reset::after\{[^}]*width:44px;height:44px/, '44px hit area around the compact Reset');
  assert.match(css, /#trip-reset\{[^}]*min-height:22px;height:22px/, 'visual Reset stays compact');
  assert.match(css, /height:clamp\(150px,34\.5vh,270px\)/, 'dashboard height is unchanged');
  assert.match(css, /\.wheel-box\{[^}]*height:153\.33%/, 'wheel size is unchanged');
});

test('DS-5: horn hold and tap wiring; key B does not restart on repeat', () => {
  const { ctx, ids } = boot();
  let downs = 0, ups = 0, stops = 0;
  const sound = ctx.DS.sound;
  sound.hornDown = () => { downs++; };
  sound.hornUp = () => { ups++; };
  sound.hornStop = () => { stops++; };
  ids.horn.dispatch('pointerdown', { pointerId: 7 });
  assert.equal(downs, 1); assert.equal(ups, 0);
  ids.horn.dispatch('pointerup', { pointerId: 7 });
  assert.equal(ups, 1);
  ids.horn.dispatch('pointerdown', { pointerId: 8 });
  ids.horn.dispatch('pointerleave', { pointerId: 8 });
  assert.equal(downs, 2); assert.equal(ups, 2, 'leaving the button releases the horn');
  const key = (type, k, extra = {}) => ctx.dispatchEvent(Object.assign(new ctx.Event(type), { key: k, target: { matches: () => false }, preventDefault() {}, repeat: false }, extra));
  key('keydown', 'b');
  assert.equal(downs, 3);
  key('keydown', 'b', { repeat: true });
  assert.equal(downs, 3, 'key repeat does not start the horn again');
  key('keyup', 'b');
  assert.equal(ups, 3);
  ctx.dispatchEvent(new ctx.Event('blur'));
  assert(stops >= 1, 'blur stops the horn');

  const css = fs.readFileSync(path.join(dir, 'ui/driving.css'), 'utf8');
  const js = fs.readFileSync(path.join(dir, 'ui/audio.js'), 'utf8');
  assert.match(js, /HORN_MIN_S = \.6/, 'tap / minimum hold is 0.6 s');
  assert.match(css, /#edge-alert\.pulse-amber\{animation:dsEdgeAmber \.45s ease-out 2\}/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /height:clamp\(150px,34\.5vh,270px\)/, 'dashboard height is unchanged');
  assert.match(css, /\.wheel-box\{[^}]*height:153\.33%/, 'wheel size is unchanged');
});

test('DS-5: live score is on the dashboard and edge alert follows settings', () => {
  const PRE = 'learn.driving-school.settings';
  const first = boot();
  first.frame(16);
  assert.equal(first.ctx.drivingTest.prefs.edgeAlert, true);
  assert.equal(first.ids['dash-score'].textContent, '100%');
  assert(first.ids['dash-score'].classList.contains('green'));
  first.ctx.DS.penalize(first.ctx.drivingTest.s.l, 'lane_line', 'Keep to your side.', 5, 'minor');
  first.ctx.drivingTest.update(0);
  assert.equal(first.ctx.drivingTest.s.l.score, 95);
  assert.equal(first.ids['dash-score'].textContent, '95%');
  assert(first.ids['dash-score'].classList.contains('green'));
  assert(first.ids['edge-alert'].classList.contains('pulse-amber'), 'minor fault glows amber');
  first.ctx.DS.penalize(first.ctx.drivingTest.s.l, 'collision', 'Collision.', 25, 'serious');
  first.ctx.drivingTest.update(0);
  assert.equal(first.ids['dash-score'].textContent, '70%');
  assert(first.ids['dash-score'].classList.contains('amber'));
  assert(first.ids['edge-alert'].classList.contains('pulse-red'));
  assert.match(first.ids.score.textContent, /Score 70%/);

  first.ids['edge-alert-pref'].value = 'off';
  first.ids['edge-alert-pref'].onchange({ target: first.ids['edge-alert-pref'] });
  assert.equal(first.ctx.drivingTest.prefs.edgeAlert, false);
  const saved = JSON.parse(first.ctx.localStorage.getItem(PRE));
  assert.equal(saved.edgeAlert, false);

  const off = boot('?test', { [PRE]: JSON.stringify({ auto: false, side: 'left', muted: false, route: 1, edgeAlert: false }) });
  off.frame(16);
  assert.equal(off.ctx.drivingTest.prefs.edgeAlert, false);
  off.ctx.DS.penalize(off.ctx.drivingTest.s.l, 'x', 'reason', 5, 'minor');
  off.ctx.drivingTest.update(0);
  assert.equal(off.ctx.document.getElementById('edge-alert').classList.contains('pulse-amber'), false, 'edge alert stays off when switched off');
  assert.equal(off.ids['dash-score'].textContent, '95%');
});
