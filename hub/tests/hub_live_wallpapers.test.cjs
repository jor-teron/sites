// Offline Node checks for Hub Live Wallpapers engine & settings integration.
// Run: node --test hub/tests/hub_live_wallpapers.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const WALLPAPERS_SRC = fs.readFileSync(path.join(ROOT, 'hub/drives/hub_wallpapers.js'), 'utf8');
const ENGINE_SRC = fs.readFileSync(path.join(ROOT, 'hub/drives/hub_live_wallpaper.js'), 'utf8');
const SEARCH_SRC = fs.readFileSync(path.join(ROOT, 'apps/system/search/search_items.js'), 'utf8');
const SETTINGS_SEC_SRC = fs.readFileSync(path.join(ROOT, 'apps/system/settings/sec_wallpaper.js'), 'utf8');

function mockDOM(initialClasses = []) {
  class ClassList {
    constructor(init = []) { this.s = new Set(init); }
    add(c) { this.s.add(c); }
    remove(c) { this.s.delete(c); }
    contains(c) { return this.s.has(c); }
    toggle(c, v) {
      if (v === undefined) v = !this.s.has(c);
      if (v) this.s.add(c); else this.s.delete(c);
      return v;
    }
  }

  const elements = new Map();
  function makeEl(tag = 'div', initialId = '', classes = []) {
    let currentId = initialId;
    const e = {
      tagName: tag.toUpperCase(),
      className: classes.join(' '),
      classList: new ClassList(classes),
      style: {},
      attrs: new Map(),
      children: [],
      parentElement: null,
      clientWidth: 800,
      clientHeight: 600,
      setAttribute(k, v) { e.attrs.set(k, String(v)); },
      getAttribute(k) { return e.attrs.get(k) || null; },
      appendChild(child) {
        child.parentElement = e;
        e.children.push(child);
        return child;
      },
      insertBefore(child, before) {
        child.parentElement = e;
        const idx = e.children.indexOf(before);
        if (idx >= 0) e.children.splice(idx, 0, child);
        else e.children.push(child);
        return child;
      },
      getContext(type) {
        if (type === '2d') {
          return {
            fillRect() {},
            clearRect() {},
            beginPath() {},
            moveTo() {},
            lineTo() {},
            closePath() {},
            arc() {},
            fill() {},
            stroke() {},
            save() {},
            restore() {},
            createLinearGradient() {
              return { addColorStop() {} };
            },
            createRadialGradient() {
              return { addColorStop() {} };
            },
            drawImage() {},
            setTransform() {},
            ellipse() {}
          };
        }
        return null;
      }
    };
    Object.defineProperty(e, 'id', {
      get() { return currentId; },
      set(v) {
        if (currentId) elements.delete(currentId);
        currentId = v;
        if (v) elements.set(v, e);
      }
    });
    if (initialId) elements.set(initialId, e);
    return e;
  }

  const docEl = makeEl('html', '', initialClasses);
  const body = makeEl('body', '', ['wm-desktop']);
  docEl.appendChild(body);
  const empty = makeEl('div', 'empty', []);
  body.appendChild(empty);

  const listeners = new Map();
  const doc = {
    documentElement: docEl,
    body: body,
    hidden: false,
    fullscreenElement: null,
    getElementById(id) { return elements.get(id) || null; },
    createElement(tag) { return makeEl(tag); },
    querySelector(sel) {
      // if (sel === '.wm-max:not(.wm-min)') {   (before H158)
      if (sel === '.wm-max:not(.wm-min)' || sel === '.wm-max:not(.wm-min):not(.wm-off)') {
        for (const el of elements.values()) {
          if (el.classList.contains('wm-max') && !el.classList.contains('wm-min')) {
            if (sel.indexOf('wm-off') >= 0 && el.classList.contains('wm-off')) continue;
            return el;
          }
        }
      }
      return null;
    },
    addEventListener(k, f) {
      if (!listeners.has(k)) listeners.set(k, []);
      listeners.get(k).push(f);
    },
    removeEventListener(k, f) {
      const a = listeners.get(k) || [];
      const i = a.indexOf(f);
      if (i >= 0) a.splice(i, 1);
    },
    _fire(k, ev = {}) {
      (listeners.get(k) || []).forEach((f) => f(ev));
    }
  };

  const win = {
    document: doc,
    innerWidth: 800,
    innerHeight: 600,
    addEventListener(k, f) { doc.addEventListener(k, f); },
    removeEventListener(k, f) { doc.removeEventListener(k, f); },
    matchMedia: (q) => ({ matches: false }),
    requestAnimationFrame: (f) => setTimeout(f, 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    performance: { now: () => Date.now() },
    MutationObserver: class {
      constructor(cb) { this.cb = cb; }
      observe() {}
      disconnect() {}
    }
  };
  win.window = win;

  return { doc, win, makeEl, elements };
}

test('HUB_LIVE_WALLPAPERS registry in hub_wallpapers.js', () => {
  const { win } = mockDOM();
  vm.runInNewContext(WALLPAPERS_SRC, win);

  assert.ok(Array.isArray(win.HUB_LIVE_WALLPAPERS), 'HUB_LIVE_WALLPAPERS must be an array');
  // assert.equal(win.HUB_LIVE_WALLPAPERS.length, 3, 'Must define 3 procedural live wallpapers');   (before H158b)
  assert.equal(win.HUB_LIVE_WALLPAPERS.length, 5, 'Must define 5 procedural live wallpapers');

  const ids = Array.from(win.HUB_LIVE_WALLPAPERS.map((w) => w.id));
  // assert.deepEqual(JSON.parse(JSON.stringify(ids)), ['live:aurora', 'live:constellation', 'live:circadian']);   (before H158b)
  assert.deepEqual(JSON.parse(JSON.stringify(ids)), ['live:aurora', 'live:constellation', 'live:rain', 'live:lava', 'live:geo']);

  win.HUB_LIVE_WALLPAPERS.forEach((w) => {
    assert.equal(w.live, true, `${w.id} must have live: true`);
    assert.ok(w.name, `${w.id} must have name`);
    assert.ok(w.desc, `${w.id} must have desc`);
    assert.ok(w.color, `${w.id} must have color fallback`);
    assert.ok(w.image, `${w.id} must have image CSS gradient preview`);
  });

  // Test hubWallpaper lookup
  const hit = win.hubWallpaper('live:aurora');
  assert.equal(hit.id, 'live:aurora');
  assert.equal(hit.name, 'Aurora waves');

  // const hitCircadian = win.hubWallpaper('live:circadian');
  // assert.equal(hitCircadian.id, 'live:circadian');
  // assert.equal(hitCircadian.name, 'Circadian sky');   (before H158b)
  const hitCircadian = win.hubWallpaper('live:circadian');
  assert.equal(hitCircadian.id, 'live:aurora', 'H158b: stored live:circadian maps to Aurora');
  assert.equal(hitCircadian.name, 'Aurora waves');

  const missing = win.hubWallpaper('unknown_wp');
  assert.equal(missing.id, 'night', 'Falls back to default wallpaper');
});

test('HubLiveWallpaper engine presets and lifecycle', () => {
  const { win, doc } = mockDOM();
  vm.runInNewContext(WALLPAPERS_SRC, win);
  vm.runInNewContext(ENGINE_SRC, win);

  const engine = win.HubLiveWallpaper;
  assert.ok(engine, 'HubLiveWallpaper must be exported on window');
  // assert.deepEqual(JSON.parse(JSON.stringify(engine.presets())), ['live:aurora', 'live:constellation', 'live:circadian']);   (before H158b)
  assert.deepEqual(JSON.parse(JSON.stringify(engine.presets())), ['live:aurora', 'live:constellation', 'live:rain', 'live:lava', 'live:geo']);

  assert.equal(engine.current(), '');
  assert.equal(engine.isRunning(), false);

  // Set live:aurora
  const ok = engine.set('live:aurora');
  assert.equal(ok, true);
  assert.equal(engine.current(), 'live:aurora');
  assert.equal(engine.isRunning(), true);

  const canvas = doc.getElementById('hub-live-canvas');
  assert.ok(canvas, 'Canvas element #hub-live-canvas must be created and inserted');
  assert.equal(canvas.classList.contains('active'), true);

  // Tick execution
  assert.doesNotThrow(() => engine.tick());

  // Verify state.t increments and is preserved across size changes
  const tBefore = engine.getState().t;
  assert.ok(tBefore > 0, 't must advance on tick');

  // Simulate resize
  canvas.parentElement.clientWidth = 1024;
  canvas.parentElement.clientHeight = 768;
  engine.tick();
  assert.equal(canvas.width, 1024);
  assert.equal(canvas.height, 768);
  assert.ok(engine.getState().t > tBefore, 't must continue advancing and not reset to 0 on resize');

  // Pause & Resume
  engine.pause();
  assert.equal(engine.isPaused(), true);
  assert.equal(engine.isRunning(), false);

  engine.resume();
  assert.equal(engine.isPaused(), false);
  assert.equal(engine.isRunning(), true);

  // Stop
  engine.stop();
  assert.equal(engine.current(), '');
  assert.equal(engine.isRunning(), false);
  assert.equal(canvas.classList.contains('active'), false);
});

test('HubLiveWallpaper occlusion detection and auto-pausing', () => {
  const { win, doc, elements, makeEl } = mockDOM();
  vm.runInNewContext(WALLPAPERS_SRC, win);
  vm.runInNewContext(ENGINE_SRC, win);

  const engine = win.HubLiveWallpaper;
  engine.set('live:constellation');
  assert.equal(engine.shouldPause(), false);

  // 1. Hidden tab
  doc.hidden = true;
  assert.equal(engine.shouldPause(), true);
  engine.checkState();
  assert.equal(engine.isPaused(), true);
  doc.hidden = false;
  engine.checkState();
  assert.equal(engine.isPaused(), false);

  // 2. Screen lock active
  doc.documentElement.classList.add('hub-locked');
  assert.equal(engine.shouldPause(), true);
  doc.documentElement.classList.remove('hub-locked');

  // 3. Break lock active
  doc.documentElement.classList.add('hub-break');
  assert.equal(engine.shouldPause(), true);
  doc.documentElement.classList.remove('hub-break');
  assert.equal(engine.shouldPause(), false);

  // 4. Phone mode with open app (empty hidden)
  doc.body.classList.remove('wm-desktop');
  const empty = doc.getElementById('empty');
  empty.classList.add('hidden');
  assert.equal(engine.shouldPause(), true);
  empty.classList.remove('hidden');
  doc.body.classList.add('wm-desktop');
  assert.equal(engine.shouldPause(), false);

  // 5. Maximized window in desktop mode
  const maxWin = makeEl('div', 'win-max', ['wm-win', 'wm-max']);
  elements.set('win-max', maxWin);
  doc.body.appendChild(maxWin);
  assert.equal(engine.shouldPause(), true, 'Must pause when a desktop window is maximized');

  // When minimized, occlusion ceases
  maxWin.classList.add('wm-min');
  assert.equal(engine.shouldPause(), false, 'Must resume when maximized window is minimized');

  engine.stop();
});

test('H158: same-id set() keeps state.t', () => {
  const { win } = mockDOM();
  vm.runInNewContext(WALLPAPERS_SRC, win);
  vm.runInNewContext(ENGINE_SRC, win);
  const engine = win.HubLiveWallpaper;
  engine.set('live:aurora');
  engine.tick();
  engine.tick();
  const t = engine.getState().t;
  assert.ok(t > 0, 't must have advanced before the second set');
  const ok = engine.set('live:aurora');
  assert.equal(ok, true);
  assert.equal(engine.current(), 'live:aurora');
  assert.equal(engine.getState().t, t, 'same-id set() must not wipe state.t');
  engine.tick();
  assert.ok(engine.getState().t > t, 'loop must keep advancing after same-id set()');
  engine.stop();
});

test('H158: checkState resumes after a maximised window is removed', () => {
  const { win, doc, elements, makeEl } = mockDOM();
  vm.runInNewContext(WALLPAPERS_SRC, win);
  vm.runInNewContext(ENGINE_SRC, win);
  const engine = win.HubLiveWallpaper;
  engine.set('live:aurora');
  assert.equal(engine.isPaused(), false);

  const maxWin = makeEl('div', 'win-max', ['wm-win', 'wm-max']);
  elements.set('win-max', maxWin);
  doc.body.appendChild(maxWin);
  engine.checkState();
  assert.equal(engine.shouldPause(), true);
  assert.equal(engine.isPaused(), true);

  // Close: element is removed (wm_windows.js close() uses el.remove()), not class-toggled
  const i = doc.body.children.indexOf(maxWin);
  if (i >= 0) doc.body.children.splice(i, 1);
  elements.delete('win-max');
  assert.equal(engine.shouldPause(), false);
  engine.checkState();
  assert.equal(engine.isPaused(), false, 'checkState must resume once the maximised window is gone');
  assert.equal(engine.isRunning(), true);

  engine.stop();
});

test('H158: startLoop marks isPaused when it should pause, so checkState can resume', () => {
  const { win, doc } = mockDOM();
  vm.runInNewContext(WALLPAPERS_SRC, win);
  vm.runInNewContext(ENGINE_SRC, win);
  const engine = win.HubLiveWallpaper;
  doc.hidden = true;
  engine.set('live:aurora');
  assert.equal(engine.isPaused(), true, 'boot while hidden must leave isPaused true (not a dead loop)');
  doc.hidden = false;
  engine.checkState();
  assert.equal(engine.isPaused(), false);
  assert.equal(engine.isRunning(), true);
  engine.stop();
});

test('H158: a maximised window on the other workspace does not pause', () => {
  const { win, doc, elements, makeEl } = mockDOM();
  vm.runInNewContext(WALLPAPERS_SRC, win);
  vm.runInNewContext(ENGINE_SRC, win);
  const engine = win.HubLiveWallpaper;
  engine.set('live:aurora');
  const maxWin = makeEl('div', 'win-max', ['wm-win', 'wm-max', 'wm-off']);
  elements.set('win-max', maxWin);
  doc.body.appendChild(maxWin);
  assert.equal(engine.shouldPause(), false, 'wm-off maximised window must be ignored');
  engine.stop();
});

test('HubLiveWallpaper attachPreview and detachPreview for Settings', () => {
  const { win, makeEl } = mockDOM();
  vm.runInNewContext(WALLPAPERS_SRC, win);
  vm.runInNewContext(ENGINE_SRC, win);

  const engine = win.HubLiveWallpaper;
  const pCanvas = makeEl('canvas', 'p-canvas');

  assert.doesNotThrow(() => engine.attachPreview(pCanvas, 'live:aurora'));
  assert.doesNotThrow(() => engine.detachPreview(pCanvas));
});

test('HubLiveWallpaper reduced motion support', () => {
  const { win, doc } = mockDOM();
  vm.runInNewContext(WALLPAPERS_SRC, win);
  vm.runInNewContext(ENGINE_SRC, win);

  const engine = win.HubLiveWallpaper;
  assert.equal(engine.isReducedMotion(), false);

  // doc.documentElement.classList.add('hub-motion-reduced');
  // assert.equal(engine.isReducedMotion(), true);
  // doc.documentElement.classList.remove('hub-motion-reduced');
  // doc.documentElement.classList.add('hub-motion-off');
  // assert.equal(engine.isReducedMotion(), true);   (before H158a)
  // H158a: Hub Motion Off / Reduced must not freeze live wallpapers; only the OS media query does.
  doc.documentElement.classList.add('hub-motion-reduced');
  assert.equal(engine.isReducedMotion(), false, 'hub-motion-reduced must not count as reduced for live wallpaper');
  doc.documentElement.classList.remove('hub-motion-reduced');
  doc.documentElement.classList.add('hub-motion-off');
  assert.equal(engine.isReducedMotion(), false, 'hub-motion-off must not count as reduced for live wallpaper');

  win.matchMedia = (q) => ({ matches: /prefers-reduced-motion:\s*reduce/.test(q) });
  assert.equal(engine.isReducedMotion(), true, 'OS prefers-reduced-motion: reduce must still freeze live wallpaper');
});

/* (before H158b)
test('Circadian preset solar hours simulation', () => {
  const { win } = mockDOM();
  vm.runInNewContext(WALLPAPERS_SRC, win);
  vm.runInNewContext(ENGINE_SRC, win);

  const engine = win.HubLiveWallpaper;
  engine.set('live:circadian');

  const canvas = win.document.getElementById('hub-live-canvas');
  const ctx = canvas.getContext('2d');

  // Mock specific hours and verify no exceptions thrown
  const hours = [2, 6, 12, 18, 20.5, 23];
  hours.forEach((h) => {
    engine.setState({ mockHour: h });
    assert.doesNotThrow(() => engine.tick(), `Circadian sky must render without error for hour ${h}`);
  });

  engine.stop();
});
*/

test('H158b: each live preset init/render runs on a stub ctx', () => {
  const { win } = mockDOM();
  vm.runInNewContext(WALLPAPERS_SRC, win);
  vm.runInNewContext(ENGINE_SRC, win);
  const engine = win.HubLiveWallpaper;
  const ids = ['live:aurora', 'live:constellation', 'live:rain', 'live:lava', 'live:geo'];
  ids.forEach((id) => {
    assert.equal(engine.set(id), true, id + ' must set');
    assert.equal(engine.current(), id);
    assert.doesNotThrow(() => engine.tick(), id + ' render must not throw');
    assert.ok(engine.getState(), id + ' has state');
    engine.stop();
  });
});

test('H158b: live:circadian maps to live:aurora', () => {
  const { win } = mockDOM();
  vm.runInNewContext(WALLPAPERS_SRC, win);
  vm.runInNewContext(ENGINE_SRC, win);
  const engine = win.HubLiveWallpaper;
  assert.equal(engine.set('live:circadian'), true);
  assert.equal(engine.current(), 'live:aurora');
  assert.doesNotThrow(() => engine.tick());
  engine.stop();
});


test('Search items and settings UI structure', () => {
  const { win } = mockDOM();
  vm.runInNewContext(SEARCH_SRC, win);

  const items = win.HUB_SEARCH_ITEMS.settings;
  const liveRow = items.find((item) => item.name === 'Live wallpapers');
  assert.ok(liveRow, 'Search items must include "Live wallpapers"');
  assert.equal(liveRow.hash, 'wallpaper');
  assert.ok(liveRow.words.includes('aurora'));
  // assert.ok(liveRow.words.includes('circadian'));   (before H158b)
  assert.ok(liveRow.words.includes('constellation'));
  assert.ok(liveRow.words.includes('rain'));
  assert.ok(liveRow.words.includes('lava'));
  assert.ok(liveRow.words.includes('geo'));

  // Verify Settings sec_wallpaper.js creates Live wallpapers section
  assert.ok(SETTINGS_SEC_SRC.includes("ui.title('Live wallpapers')"), 'sec_wallpaper.js must add Live wallpapers title');
  assert.ok(SETTINGS_SEC_SRC.includes("wp-live"), 'sec_wallpaper.js must define wp-live grid');
  assert.ok(SETTINGS_SEC_SRC.includes("HUB_LIVE_WALLPAPERS"), 'sec_wallpaper.js must iterate over HUB_LIVE_WALLPAPERS');
  assert.ok(SETTINGS_SEC_SRC.includes("wp-preview-live"), 'sec_wallpaper.js must include live preview canvas in swatches');
});
