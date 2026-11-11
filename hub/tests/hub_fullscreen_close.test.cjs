// H144 ask-before-closing + taskbar fullscreen toggle (desktop/wm/wm_taskbar.js).
// H145: blur behind the browser leave prompt (html.hub-leave-blur).
// Offline Node checks only (no browser, no network). Run: node --test hub/tests/hub_fullscreen_close.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'desktop/wm/wm_taskbar.js'), 'utf8');

function ev() {
  const m = new Map();
  return {
    add(k, f) { if (!m.has(k)) m.set(k, []); m.get(k).push(f); },
    remove(k, f) { const a = m.get(k) || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); },
    fire(k, e) { (m.get(k) || []).slice().forEach((f) => f(e)); },
    has(k) { return (m.get(k) || []).length > 0; }
  };
}

function load(opts) {
  const o = opts || {};
  const store = o.store instanceof Map ? o.store : new Map(o.store || []);
  const wev = ev(), dev = ev();
  const calls = { request: 0, exit: 0, webkitRequest: 0, webkitExit: 0 };
  class ClassList {
    constructor() { this.s = new Set(); }
    add(c) { this.s.add(c); } remove(c) { this.s.delete(c); } contains(c) { return this.s.has(c); }
    toggle(c, v) { if (v === undefined) v = !this.s.has(c); if (v) this.s.add(c); else this.s.delete(c); return v; }
  }
  const els = {};
  const el = (id) => {
    if (els[id]) return els[id];
    const e = { id: id, attrs: new Map(), hidden: false, classList: new ClassList(), title: '', innerHTML: '', events: {} };
    e.setAttribute = (k, v) => e.attrs.set(k, String(v));
    e.getAttribute = (k) => (e.attrs.has(k) ? e.attrs.get(k) : null);
    e.addEventListener = (k, f) => { (e.events[k] = e.events[k] || []).push(f); };
    e.click = () => (e.events.click || []).forEach((f) => f({ target: e, stopPropagation() {}, preventDefault() {} }));
    els[id] = e;
    return e;
  };
  const docEl = {
    classList: new ClassList(),   // H145: html.hub-leave-blur
    requestFullscreen: (o.webkitOnly || o.requestFs === false) ? undefined : function () { calls.request++; doc.fullscreenElement = docEl; },
    webkitRequestFullscreen: o.webkitOnly ? function () { calls.webkitRequest++; doc.webkitFullscreenElement = docEl; } : undefined
  };
  const doc = {
    fullscreenEnabled: o.webkitOnly ? false : (o.fsEnabled !== false),
    webkitFullscreenEnabled: o.webkitOnly ? true : (o.webkitEnabled || false),
    fullscreenElement: o.fsEl || null,
    webkitFullscreenElement: o.webkitEl || null,
    documentElement: docEl,
    exitFullscreen: o.webkitOnly ? undefined : function () { calls.exit++; doc.fullscreenElement = null; },
    webkitExitFullscreen: (o.webkitOnly || o.webkitExit) ? function () { calls.webkitExit++; doc.webkitFullscreenElement = null; } : undefined,
    getElementById: (id) => (o.full ? el(id) : null),   // default: early-return after APIs (no full taskbar)
    addEventListener: (k, f) => dev.add(k, f),
    removeEventListener: (k, f) => dev.remove(k, f),
    createElement: (tag) => {
      const e = el('el-' + Math.random());
      e.tagName = String(tag).toUpperCase();
      e.append = function () {};
      return e;
    },
    body: { appendChild() {} }
  };
  const loc = { search: o.search || '', pathname: '/sites/desktop/desktop.html' };
  const win = {
    __hubRemote: o.remote || undefined,
    HubMode: o.joined ? { joined: true } : undefined,
    addEventListener: (k, f) => wev.add(k, f),
    removeEventListener: (k, f) => wev.remove(k, f),
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    }
  };
  const timers = [];
  let tid = 0;
  function fakeSetTimeout(fn, ms) {
    const id = ++tid;
    timers.push({ id: id, fn: fn, ms: ms || 0 });
    return id;
  }
  function fakeClearTimeout(id) {
    const i = timers.findIndex((x) => x.id === id);
    if (i >= 0) timers.splice(i, 1);
  }
  function flushTimers() {
    const q = timers.splice(0);
    q.forEach((x) => x.fn());
  }
  const ctx = {
    window: win, document: doc, location: loc, localStorage: win.localStorage,
    setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout, console
  };
  win.window = win;
  win.document = doc;
  win.location = loc;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  function unload() {
    const e = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } };
    win.HubCloseGuard.onBeforeUnload(e);
    return e;
  }
  const btn = () => {
    const b = el('wm-fs-test');
    win.HubFullscreen.paint(b, doc);
    return b;
  };
  return { win, doc, store, calls, wev, dev, unload, btn, el, guard: win.HubCloseGuard, fs: win.HubFullscreen, timers, flushTimers };
}

function prompted(e) { return e.prevented === true && e.returnValue === ''; }

test('defaults: ask before closing and the fullscreen button are on', () => {
  const p = load();
  assert.equal(p.guard.askOn(), true);
  assert.equal(p.fs.showOn(), true);
  assert.equal(p.guard.joined(), false);
  assert.equal(p.guard.shouldPrompt(), true);
  assert.equal(p.fs.shouldShow(p.doc), true);
  assert.equal(p.fs.supported(p.doc), true);
});

test('beforeunload prompts when the setting is on, and not when it is off', () => {
  const p = load();
  assert.equal(prompted(p.unload()), true);
  p.store.set('sites-hub.askClose', '0');
  assert.equal(p.guard.askOn(), false);
  assert.equal(p.guard.shouldPrompt(), false);
  assert.equal(prompted(p.unload()), false);
});

test('beforeunload does not prompt for a ?join / joined device', () => {
  const a = load({ search: '?join=12345' });
  assert.equal(a.guard.joined(), true);
  assert.equal(prompted(a.unload()), false);
  const b = load({ remote: { code: '12345' } });
  assert.equal(b.guard.joined(), true);
  assert.equal(prompted(b.unload()), false);
  const c = load({ joined: true });
  assert.equal(c.guard.joined(), true);
  assert.equal(prompted(c.unload()), false);
});

test('beforeunload does not prompt after the intentional-reload flag', () => {
  const p = load();
  assert.equal(prompted(p.unload()), true);
  p.win.__hubAllowUnload();
  assert.equal(p.guard.shouldPrompt(), false);
  assert.equal(prompted(p.unload()), false);
});

test('fullscreen button is hidden when the setting is off or the API is unsupported', () => {
  const on = load();
  const bOn = on.btn();
  assert.equal(bOn.hidden, false);
  assert.equal(bOn.title, 'Full screen');
  const off = load({ store: [['sites-hub.showFsBtn', '0']] });
  assert.equal(off.fs.showOn(), false);
  assert.equal(off.fs.shouldShow(off.doc), false);
  assert.equal(off.btn().hidden, true);
  const no = load({ fsEnabled: false });
  assert.equal(no.fs.supported(no.doc), false);
  assert.equal(no.fs.shouldShow(no.doc), false);
  assert.equal(no.btn().hidden, true);
});

test('toggle calls requestFullscreen, or exitFullscreen when already full screen, with webkit fallbacks', () => {
  const p = load();
  assert.equal(p.fs.toggle(p.doc), 'enter');
  assert.equal(p.calls.request, 1);
  assert.equal(p.calls.exit, 0);
  assert.equal(p.fs.isOn(p.doc), true);
  assert.equal(p.fs.toggle(p.doc), 'exit');
  assert.equal(p.calls.exit, 1);
  assert.equal(p.fs.isOn(p.doc), false);
  const w = load({ webkitOnly: true });
  assert.equal(w.fs.supported(w.doc), true);
  assert.equal(w.fs.toggle(w.doc), 'enter');
  assert.equal(w.calls.webkitRequest, 1);
  assert.equal(w.calls.request, 0);
  assert.equal(w.fs.isOn(w.doc), true);
  assert.equal(w.fs.toggle(w.doc), 'exit');
  assert.equal(w.calls.webkitExit, 1);
});

test('label and pressed state stay in sync on fullscreenchange (including Esc)', () => {
  const p = load();
  const b = p.btn();
  assert.equal(p.fs.label(false), 'Full screen');
  assert.equal(p.fs.label(true), 'Exit full screen');
  assert.equal(b.title, 'Full screen');
  assert.equal(b.getAttribute('aria-pressed'), 'false');
  assert.equal(b.classList.contains('on'), false);
  p.doc.fullscreenElement = p.doc.documentElement;
  p.fs.paint(b, p.doc);   // same path as the fullscreenchange / Esc listener
  assert.equal(b.title, 'Exit full screen');
  assert.equal(b.getAttribute('aria-label'), 'Exit full screen');
  assert.equal(b.getAttribute('aria-pressed'), 'true');
  assert.equal(b.classList.contains('on'), true);
  p.doc.fullscreenElement = null;
  p.fs.paint(b, p.doc);
  assert.equal(b.title, 'Full screen');
  assert.equal(b.getAttribute('aria-pressed'), 'false');
  assert.equal(b.classList.contains('on'), false);
});

test('intentional Hub reload / navigation paths set the skip flag before leaving', () => {
  const files = [
    'hub/update/hub_update.js',
    'desktop/menu/hub_ctx.js',
    'desktop/menu/hub_ctx_menus.js',
    'hub/core/hub_profile.js',
    'desktop/mode/hub_osmode.js',
    'desktop/panels/hub_panels.js',
    'hub/link/hub_meshlink.js',
    'desktop/link/hub_remote.js',
    'apps/system/settings/sec_devices.js',
    'apps/system/settings/sec_desktop.js'
  ];
  files.forEach((rel) => {
    const t = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.match(t, /__hubAllowUnload/, rel + ' must call __hubAllowUnload before a deliberate leave');
  });
});


function hasBlur(p) { return p.doc.documentElement.classList.contains('hub-leave-blur'); }

test('H145: prompting beforeunload adds hub-leave-blur; a quiet close does not', () => {
  const on = load();
  assert.equal(hasBlur(on), false);
  assert.equal(prompted(on.unload()), true);
  assert.equal(hasBlur(on), true);
  on.store.set('sites-hub.askClose', '0');
  on.guard.clearLeaveBlur();
  assert.equal(hasBlur(on), false);
  assert.equal(prompted(on.unload()), false);
  assert.equal(hasBlur(on), false);
  const joined = load({ search: '?join=12345' });
  assert.equal(prompted(joined.unload()), false);
  assert.equal(hasBlur(joined), false);
  const skip = load();
  skip.win.__hubAllowUnload();
  assert.equal(prompted(skip.unload()), false);
  assert.equal(hasBlur(skip), false);
});

test('H145: 0 ms timer and Cancel-path events remove the blur', () => {
  const t = load();
  assert.equal(prompted(t.unload()), true);
  assert.equal(hasBlur(t), true);
  assert.ok(t.timers.length >= 1);
  t.flushTimers();
  assert.equal(hasBlur(t), false);
  assert.equal(t.timers.length, 0);

  ['focus', 'pointerdown', 'keydown'].forEach((k) => {
    const p = load();
    assert.equal(prompted(p.unload()), true);
    assert.equal(hasBlur(p), true);
    p.wev.fire(k, {});
    assert.equal(hasBlur(p), false, k + ' on window should clear the blur');
  });
  const vis = load();
  assert.equal(prompted(vis.unload()), true);
  vis.dev.fire('visibilitychange', {});
  assert.equal(hasBlur(vis), false);
});
