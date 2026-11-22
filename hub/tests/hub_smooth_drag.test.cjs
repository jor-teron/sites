// H169: smoother window drag and resize (rAF-batched transforms, commit on release, no Glass blur while dragging).
// Run: node --test hub/tests/hub_smooth_drag.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function createHarness() {
  function makeClassList(initial) {
    const set = new Set(initial || []);
    return {
      add(...cs) { cs.forEach((c) => { if (c) set.add(c); }); },
      remove(...cs) { cs.forEach((c) => set.delete(c)); },
      toggle(c, force) {
        if (force === true) { set.add(c); return true; }
        if (force === false) { set.delete(c); return false; }
        if (set.has(c)) { set.delete(c); return false; }
        set.add(c); return true;
      },
      contains(c) { return set.has(c); },
      toString() { return Array.from(set).join(' '); }
    };
  }

  function makeEmitter() {
    const map = new Map();
    return {
      addEventListener(type, fn) {
        if (!map.has(type)) map.set(type, new Set());
        map.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        const s = map.get(type);
        if (s) s.delete(fn);
      },
      dispatchEvent(ev) {
        const s = map.get(ev.type);
        if (!s) return;
        for (const fn of Array.from(s)) fn.call(this, ev);
      }
    };
  }

  function matchesSelector(el, sel) {
    return sel.split(',').map((s) => s.trim()).some((part) => {
      if (part.startsWith('.')) return el.classList.contains(part.slice(1));
      if (part.startsWith('#')) return el.id === part.slice(1);
      return el.tagName === part.toUpperCase();
    });
  }

  function makeEl(tag) {
    const em = makeEmitter();
    let _className = '';
    const classList = makeClassList();
    const captured = new Set();
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      id: '',
      children: [],
      parentNode: null,
      style: {},
      dataset: {},
      attributes: {},
      hidden: false,
      offsetWidth: 600,
      classList,
      get className() { return _className || classList.toString(); },
      set className(v) {
        _className = String(v || '');
        const parts = _className.split(/\s+/).filter(Boolean);
        classList.remove(...classList.toString().split(/\s+/).filter(Boolean));
        classList.add(...parts);
      },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k] || null; },
      removeAttribute(k) { delete this.attributes[k]; },
      append(...nodes) { nodes.forEach((n) => this.appendChild(n)); },
      appendChild(child) {
        if (child.parentNode) {
          const i = child.parentNode.children.indexOf(child);
          if (i >= 0) child.parentNode.children.splice(i, 1);
        }
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      insertBefore(node, ref) {
        if (node.parentNode) {
          const i = node.parentNode.children.indexOf(node);
          if (i >= 0) node.parentNode.children.splice(i, 1);
        }
        node.parentNode = this;
        const idx = ref ? this.children.indexOf(ref) : -1;
        if (idx >= 0) this.children.splice(idx, 0, node);
        else this.children.push(node);
        return node;
      },
      remove() {
        if (!this.parentNode) return;
        const i = this.parentNode.children.indexOf(this);
        if (i >= 0) this.parentNode.children.splice(i, 1);
        this.parentNode = null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children) {
            if (matchesSelector(c, sel)) out.push(c);
            walk(c);
          }
        };
        walk(this);
        return out;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (matchesSelector(cur, sel)) return cur;
          cur = cur.parentNode;
        }
        return null;
      },
      matches() { return false; },
      focus() {},
      getBoundingClientRect() {
        const l = parseFloat(this.style.left) || 0;
        const t = parseFloat(this.style.top) || 0;
        const w = parseFloat(this.style.width) || 1280;
        const h = parseFloat(this.style.height) || 800;
        return { left: l, top: t, width: w, height: h, right: l + w, bottom: t + h };
      },
      setPointerCapture(id) { captured.add(id); },
      hasPointerCapture(id) { return captured.has(id); },
      releasePointerCapture(id) { captured.delete(id); },
      addEventListener: em.addEventListener,
      removeEventListener: em.removeEventListener,
      dispatchEvent(ev) {
        if (!ev.target) ev.target = this;
        if (!ev.preventDefault) ev.preventDefault = () => {};
        if (!ev.stopPropagation) ev.stopPropagation = () => {};
        em.dispatchEvent.call(this, ev);
      }
    };
    return el;
  }

  const wrap = makeEl('div');
  wrap.id = 'frame-wrap';
  wrap.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 800, right: 1280, bottom: 800 });
  const appFrame = makeEl('iframe');
  appFrame.id = 'app-frame';
  const body = makeEl('body');
  body.appendChild(wrap);
  body.appendChild(appFrame);
  const documentElement = makeEl('html');
  documentElement.appendChild(body);

  const docEmitter = makeEmitter();
  const winEmitter = makeEmitter();

  const store = new Map();
  let saveCount = 0;
  const localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { if (k === 'sites-hub.wmSession') saveCount++; store.set(k, String(v)); },
    removeItem(k) { store.delete(k); }
  };

  let nextRaf = 1;
  const rafQueue = new Map();
  let rafScheduled = 0;
  let rafCancelled = 0;
  function requestAnimationFrame(fn) {
    const id = nextRaf++;
    rafScheduled++;
    rafQueue.set(id, fn);
    return id;
  }
  function cancelAnimationFrame(id) {
    if (rafQueue.delete(id)) rafCancelled++;
  }
  function flushRaf() {
    const entries = Array.from(rafQueue.entries());
    rafQueue.clear();
    for (const [, fn] of entries) fn(16);
  }

  let nextTimer = 1;
  const timers = new Map();
  function setTimeoutMock(fn) {
    const id = nextTimer++;
    timers.set(id, fn);
    return id;
  }
  function clearTimeoutMock(id) { timers.delete(id); }
  function flushTimers() {
    const entries = Array.from(timers.entries());
    timers.clear();
    for (const [, fn] of entries) fn();
  }

  const windowObj = {
    location: { origin: 'https://example.test', protocol: 'https:', href: 'https://example.test/desktop/desktop.html' },
    HubMode: { isDesktop: () => true },
    addEventListener: winEmitter.addEventListener,
    removeEventListener: winEmitter.removeEventListener,
    dispatchEvent: winEmitter.dispatchEvent,
    requestAnimationFrame,
    cancelAnimationFrame
  };

  const documentObj = {
    baseURI: 'https://example.test/',
    documentElement,
    body,
    activeElement: null,
    hidden: false,
    getElementById(id) {
      if (id === 'frame-wrap') return wrap;
      if (id === 'app-frame') return appFrame;
      if (id === 'wm-desk') return wrap.children.find((c) => c.id === 'wm-desk') || null;
      return null;
    },
    createElement(tag) { return makeEl(tag); },
    querySelector() { return null; },
    addEventListener: docEmitter.addEventListener,
    removeEventListener: docEmitter.removeEventListener,
    dispatchEvent: docEmitter.dispatchEvent
  };

  const ctx = vm.createContext({
    window: windowObj,
    document: documentObj,
    localStorage,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    URL,
    performance: { mark() {}, measure() {} },
    requestAnimationFrame,
    cancelAnimationFrame,
    setTimeout: setTimeoutMock,
    clearTimeout: clearTimeoutMock,
    console
  });
  windowObj.window = windowObj;
  windowObj.document = documentObj;
  windowObj.localStorage = localStorage;

  vm.runInContext(read('desktop/wm/wm_windows.js'), ctx, { filename: 'wm_windows.js' });
  const desk = documentObj.getElementById('wm-desk');
  desk.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 800, right: 1280, bottom: 800 });
  vm.runInContext(read('desktop/wm/wm_snap.js'), ctx, { filename: 'wm_snap.js' });

  const openWin = () => windowObj.HubWM.open({
    key: 'apps/tools/calc/index.html',
    name: 'Calc',
    icon: '',
    url: 'apps/tools/calc/index.html'
  });

  return {
    window: windowObj,
    document: documentObj,
    desk,
    openWin,
    flushRaf,
    flushTimers,
    stats: () => ({
      rafScheduled,
      rafCancelled,
      rafPending: rafQueue.size,
      saveCount,
      pendingTimers: timers.size
    }),
    resetCounts: () => { rafScheduled = 0; rafCancelled = 0; saveCount = 0; }
  };
}

function ptr(type, x, y, extra) {
  return Object.assign({
    type,
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    clientX: x,
    clientY: y,
    preventDefault() {},
    stopPropagation() {}
  }, extra);
}

test('H169: drag batches pointermove into one rAF using translate3d and commits left/top once on pointerup', () => {
  const h = createHarness();
  const w = h.openWin();
  h.flushTimers();
  h.resetCounts();

  const x0 = w.rect.x, y0 = w.rect.y;
  assert.equal(w.el.style.left, x0 + 'px');
  assert.equal(w.el.style.top, y0 + 'px');
  assert.equal(w.el.style.willChange || '', '');

  w.bar.dispatchEvent(ptr('pointerdown', x0 + 50, y0 + 10));
  assert.equal(w.el.classList.contains('wm-dragging'), true);
  assert.equal(h.document.body.classList.contains('wm-dragging'), true);
  assert.equal(w.el.style.willChange, 'transform');

  // 5 pointermoves in one frame -> only 1 rAF scheduled, no layout writes yet
  for (let i = 1; i <= 5; i++) {
    w.bar.dispatchEvent(ptr('pointermove', x0 + 50 + i * 10, y0 + 10 + i * 5));
  }
  assert.equal(h.stats().rafScheduled, 1);
  assert.equal(w.el.style.transform || '', '');
  assert.equal(w.el.style.left, x0 + 'px');
  assert.equal(w.el.style.top, y0 + 'px');
  assert.equal(h.stats().saveCount, 0);

  // Flush the frame -> applies translate3d with latest coords (50, 25), still no left/top commit
  h.flushRaf();
  assert.equal(w.el.style.transform, 'translate3d(50px, 25px, 0)');
  assert.equal(w.el.style.left, x0 + 'px');
  assert.equal(w.el.style.top, y0 + 'px');
  assert.equal(w.rect.x, x0);
  assert.equal(w.rect.y, y0);
  h.flushTimers();
  assert.equal(h.stats().saveCount, 0, 'session not saved mid-drag');

  // Release -> clears transform/willChange/class, commits final left/top once, saves once
  w.bar.dispatchEvent(ptr('pointerup', x0 + 50 + 60, y0 + 10 + 40));
  assert.equal(w.el.style.transform, '');
  assert.equal(w.el.style.willChange, '');
  assert.equal(w.el.classList.contains('wm-dragging'), false);
  assert.equal(h.document.body.classList.contains('wm-dragging'), false);
  assert.equal(w.el.style.left, (x0 + 60) + 'px');
  assert.equal(w.el.style.top, (y0 + 40) + 'px');
  assert.equal(w.rect.x, x0 + 60);
  assert.equal(w.rect.y, y0 + 40);
  h.flushTimers();
  assert.equal(h.stats().saveCount, 1);
});

test('H169: drag snap-to-edge on pointerup still snaps cleanly with transform cleared', () => {
  const h = createHarness();
  const w = h.openWin();
  const x0 = w.rect.x, y0 = w.rect.y;

  w.bar.dispatchEvent(ptr('pointerdown', x0 + 50, y0 + 10));
  w.bar.dispatchEvent(ptr('pointermove', 5, 200));
  h.flushRaf();
  assert.ok(w.el.style.transform.includes('translate3d('));
  w.bar.dispatchEvent(ptr('pointerup', 5, 200));

  assert.equal(w.snap, 'l');
  assert.equal(w.el.classList.contains('wm-snap-l'), true);
  assert.equal(w.el.classList.contains('wm-dragging'), false);
  assert.equal(w.el.style.transform, '');
  assert.equal(w.el.style.willChange, '');
});

test('H169: resize batches per rAF (incl. west/north edges), keeps min sizes, and commits once on release', () => {
  const h = createHarness();
  const w = h.openWin();
  h.flushTimers();
  h.resetCounts();

  const nw = w.el.querySelector('.wm-rz-nw');
  assert.ok(nw);
  const { x: x0, y: y0, w: w0, h: h0 } = w.rect;

  nw.dispatchEvent(ptr('pointerdown', x0, y0));
  assert.equal(w.el.classList.contains('wm-dragging'), true);
  assert.equal(h.document.body.classList.contains('wm-dragging'), true);

  // Multiple moves in one frame -> 1 rAF, no immediate DOM writes (shiftKey bypasses magnet for exact raw check)
  nw.dispatchEvent(ptr('pointermove', x0 - 20, y0 - 5, { shiftKey: true }));
  nw.dispatchEvent(ptr('pointermove', x0 - 40, y0 - 10, { shiftKey: true }));
  assert.equal(h.stats().rafScheduled, 1);
  assert.equal(w.el.style.width, w0 + 'px');
  assert.equal(w.el.style.left, x0 + 'px');

  h.flushRaf();
  assert.equal(w.el.style.width, (w0 + 40) + 'px');
  assert.equal(w.el.style.height, (h0 + 10) + 'px');
  assert.equal(w.el.style.left, (x0 - 40) + 'px');
  assert.equal(w.el.style.top, (y0 - 10) + 'px');
  assert.equal(w.rect.w, w0, 'w.rect not mutated before release');
  h.flushTimers();
  assert.equal(h.stats().saveCount, 0);

  // Shrink past minimum size -> clamped to MIN_W=320, MIN_H=200
  nw.dispatchEvent(ptr('pointermove', x0 + 2000, y0 + 2000, { shiftKey: true }));
  h.flushRaf();
  assert.equal(w.el.style.width, '320px');
  assert.equal(w.el.style.height, '200px');

  nw.dispatchEvent(ptr('pointerup', x0 + 2000, y0 + 2000, { shiftKey: true }));
  assert.equal(w.el.classList.contains('wm-dragging'), false);
  assert.equal(w.rect.w, 320);
  assert.equal(w.rect.h, 200);
  h.flushTimers();
  assert.equal(h.stats().saveCount, 1);
});

test('H169: pointercancel, lostpointercapture, window blur, and maximize-during-drag all clean up', () => {
  const h = createHarness();
  const w = h.openWin();
  const x0 = w.rect.x, y0 = w.rect.y;

  // 1. pointercancel with pending rAF
  w.bar.dispatchEvent(ptr('pointerdown', x0 + 20, y0 + 10));
  w.bar.dispatchEvent(ptr('pointermove', x0 + 60, y0 + 30));
  assert.equal(h.stats().rafPending, 1);
  w.bar.dispatchEvent(ptr('pointercancel', 0, 0));
  assert.equal(h.stats().rafPending, 0);
  assert.equal(h.stats().rafCancelled, 1);
  assert.equal(w.el.classList.contains('wm-dragging'), false);
  assert.equal(h.document.body.classList.contains('wm-dragging'), false);
  assert.equal(w.el.style.transform, '');
  assert.equal(w.el.style.willChange, '');

  // 2. lostpointercapture after a frame applied transform
  const x1 = w.rect.x, y1 = w.rect.y;
  w.bar.dispatchEvent(ptr('pointerdown', x1 + 20, y1 + 10));
  w.bar.dispatchEvent(ptr('pointermove', x1 + 45, y1 + 25));
  h.flushRaf();
  assert.equal(w.el.style.transform, 'translate3d(25px, 15px, 0)');
  w.bar.dispatchEvent(ptr('pointermove', x1 + 55, y1 + 35));
  w.bar.dispatchEvent(ptr('lostpointercapture', 0, 0));
  assert.equal(h.stats().rafPending, 0);
  assert.equal(w.el.style.transform, '');
  assert.equal(w.el.style.willChange, '');
  assert.equal(w.el.classList.contains('wm-dragging'), false);
  assert.equal(h.document.body.classList.contains('wm-dragging'), false);

  // 3. window blur
  const x2 = w.rect.x, y2 = w.rect.y;
  w.bar.dispatchEvent(ptr('pointerdown', x2 + 20, y2 + 10));
  w.bar.dispatchEvent(ptr('pointermove', x2 + 40, y2 + 20));
  h.flushRaf();
  assert.ok(w.el.style.transform.includes('translate3d('));
  h.window.dispatchEvent({ type: 'blur' });
  assert.equal(w.el.style.transform, '');
  assert.equal(w.el.style.willChange, '');
  assert.equal(w.el.classList.contains('wm-dragging'), false);
  assert.equal(h.document.body.classList.contains('wm-dragging'), false);

  // 4. maximize-during-drag
  const x3 = w.rect.x, y3 = w.rect.y;
  w.bar.dispatchEvent(ptr('pointerdown', x3 + 20, y3 + 10));
  w.bar.dispatchEvent(ptr('pointermove', x3 + 50, y3 + 30));
  h.flushRaf();
  w.bar.dispatchEvent(ptr('pointermove', x3 + 60, y3 + 40));
  assert.equal(h.stats().rafPending, 1);
  h.window.HubWM.setMax(w, true);
  assert.equal(h.stats().rafPending, 0);
  assert.equal(w.max, true);
  assert.equal(w.el.classList.contains('wm-max'), true);
  assert.equal(w.el.classList.contains('wm-dragging'), false);
  assert.equal(h.document.body.classList.contains('wm-dragging'), false);
  assert.equal(w.el.style.transform, '');
  assert.equal(w.el.style.willChange, '');
  // Late pointerup after maximize cleanup stays harmless
  w.bar.dispatchEvent(ptr('pointerup', x3 + 60, y3 + 40));
  assert.equal(w.max, true);
  assert.equal(w.el.classList.contains('wm-dragging'), false);
});

test('H169: CSS disables backdrop-filter and heavy shadows under .wm-win.wm-dragging', () => {
  const wmCss = read('desktop/wm/wm.css');
  const glassCss = read('hub/core/hub_glass.css');

  assert.match(wmCss, /\.wm-win\.wm-dragging[\s\S]*?box-shadow:\s*none/);
  assert.match(wmCss, /\.wm-win\.wm-dragging[\s\S]*?backdrop-filter:\s*none/);
  assert.equal(/\.wm-win\s*\{[^}]*will-change:\s*transform/.test(wmCss), false, 'no permanent will-change on .wm-win');

  assert.match(glassCss, /html\.hub-glass\s+\.wm-win\.wm-dragging[\s\S]*?box-shadow:\s*none/);
  assert.match(glassCss, /html\.hub-glass\s+\.wm-win\.wm-dragging[\s\S]*?\.wm-bar[\s\S]*?backdrop-filter:\s*none/);
  assert.match(glassCss, /html\.hub-glass\s+\.wm-win\.wm-dragging\s+\.wm-body:has\([^)]*\)[\s\S]*?backdrop-filter:\s*none/);
});

test('H169: wm_windows.js keeps (before H169) history and H166 performance marks', () => {
  const wm = read('desktop/wm/wm_windows.js');
  assert.match(wm, /\(before H169\)/);
  assert.match(wm, /hub-app-open-start-/);
  assert.match(wm, /hub-app-open-end-/);
  assert.match(wm, /hub-app-open/);
});

test('H169: dragging a maximised window away restores its size and uses translate3d', () => {
  const h = createHarness();
  const w = h.openWin();
  h.window.HubWM.setMax(w, true);
  assert.equal(w.max, true);

  w.bar.dispatchEvent(ptr('pointerdown', 640, 14));
  // Small jitter < 6px stays maximised
  w.bar.dispatchEvent(ptr('pointermove', 642, 15));
  h.flushRaf();
  assert.equal(w.max, true);

  // Move >= 6px restores and transforms
  w.bar.dispatchEvent(ptr('pointermove', 660, 40));
  h.flushRaf();
  assert.equal(w.max, false);
  assert.equal(w.el.classList.contains('wm-max'), false);
  assert.ok(w.el.style.transform.includes('translate3d('));

  w.bar.dispatchEvent(ptr('pointerup', 660, 40));
  assert.equal(w.el.style.transform, '');
  assert.equal(w.el.style.willChange, '');
  assert.equal(w.el.classList.contains('wm-dragging'), false);
});
