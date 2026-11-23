/* DW19: linked left and right margins on the ruler.
   Pure checks (no browser): Writer.ruler.linkMargins (link, Alt override, clamp,
   tip label), a simulated grab drag (both sides move, indent markers get the live
   values, setPage gets both), the Settings default (linkMargins on when missing,
   kept when off) and the chain-link toggle wiring.
   Run: node --test apps/office/writer/test/test-dw19-margins.cjs */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.resolve(__dirname, '..');
const CM_PX = 96 / 2.54;
const read = (rel) => fs.readFileSync(path.join(DIR, rel), 'utf8');
const noComments = (src) => src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

let els = {};
function fakeEl(id) {
  const props = {};
  const listeners = {};
  const set = new Set();
  return {
    id, hidden: false, innerHTML: '', className: '', title: '', attrs: {}, listeners,
    style: { setProperty(k, v) { props[k] = v; }, getPropertyValue(k) { return props[k]; } },
    classList: { add(c) { set.add(c); }, remove(c) { set.delete(c); }, contains(c) { return set.has(c); }, toggle(c, on) { if (on === undefined) on = !set.has(c); if (on) set.add(c); else set.delete(c); } },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { if (c.id) els[c.id] = c; return c; },
    insertBefore(c) { if (c.id) els[c.id] = c; return c; },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener(t, fn) { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
    setPointerCapture() {},
    fire(t, ev) { (listeners[t] || []).slice().forEach((f) => f(Object.assign({ preventDefault() {}, stopPropagation() {}, currentTarget: this }, ev || {}))); }
  };
}

function loadRuler(opts) {
  opts = opts || {};
  els = {};
  ['workspace', 'pagesScaler'].forEach((id) => { els[id] = fakeEl(id); });
  const log = [];
  const body = fakeEl('body');
  const ctx = {
    console,
    localStorage: { getItem: () => '1', setItem() {} },
    window: {},
    document: {
      body,
      getElementById: (id) => els[id] || null,
      createElement: () => {
        const e = fakeEl('');
        let html = '';
        Object.defineProperty(e, 'innerHTML', {
          get() { return html; },
          set(v) {
            html = v;
            (v.match(/<[a-z]+ [^>]*id="([^"]+)"[^>]*>/g) || []).forEach((tag) => {
              const id = tag.match(/id="([^"]+)"/)[1];
              const n = fakeEl(id);
              const side = tag.match(/data-side="([^"]+)"/);
              if (side) n.attrs['data-side'] = side[1];
              els[id] = n;
            });
          }
        });
        return e;
      },
      addEventListener() {}
    }
  };
  ctx.window.Writer = {
    config: { landscapeClass: 'ls', paperWidthCm: 21, paperHeightCm: 29.7, marginTopCm: 2, marginBottomCm: 2, marginLeftCm: opts.left || 2, marginRightCm: opts.right || 2, marginCustomMin: 0.5, marginCustomMax: 5, paperSize: 'A4' },
    view: { CM_PX, zoom: 1, fit() { return 'fit'; } },
    ui: { setPage(size, preset, m) { log.push(['setPage', size, preset, Object.assign({}, m)]); }, showToast(t) { log.push(['toast', t]); } }
  };
  if (opts.settings) ctx.window.Writer.settings = opts.settings;
  vm.createContext(ctx);
  vm.runInContext(read('modules/writer-ruler.js'), ctx, { filename: 'writer-ruler.js' });
  const R = ctx.window.Writer.ruler;
  const sync = R.sync;
  R.sync = function (live) { log.push(['sync', live ? { left: live.left, right: live.right } : null]); return sync.apply(this, arguments); };
  return { W: ctx.window.Writer, R, log };
}

const base = { start: { left: 2, right: 2 }, w: 21, min: 0.5, max: 5, minText: 2 };

test('linkMargins: linked drag moves both sides to the same value', () => {
  const R = loadRuler().R;
  const a = R.linkMargins(Object.assign({}, base, { side: 'left', dx: 0.5, linked: true }));
  assert.deepEqual([a.left, a.right, a.linked], [2.5, 2.5, true]);
  const b = R.linkMargins(Object.assign({}, base, { side: 'right', dx: 0.74, linked: true }));
  assert.deepEqual([b.left, b.right], [1.3, 1.3], 'right edge moved right = smaller right margin; snaps to 0.1');
  const c = R.linkMargins(Object.assign({}, base, { start: { left: 2, right: 3 }, side: 'left', dx: 0.2, linked: true }));
  assert.deepEqual([c.left, c.right], [2.2, 2.2], 'unequal typed margins become equal on the first linked drag');
});

test('linkMargins: Alt or the link off moves only that side (before-DW19 rule)', () => {
  const R = loadRuler().R;
  const a = R.linkMargins(Object.assign({}, base, { side: 'left', dx: 0.5, linked: true, alt: true }));
  assert.deepEqual([a.left, a.right, a.linked], [2.5, 2, false]);
  const b = R.linkMargins(Object.assign({}, base, { side: 'right', dx: -1, linked: false }));
  assert.deepEqual([b.left, b.right], [2, 3]);
  const c = R.linkMargins(Object.assign({}, base, { start: { left: 2, right: 5 }, w: 10, side: 'left', dx: 5, linked: false }));
  assert.equal(c.left, 3, 'one side: text keeps 2 cm (10 - 5 - 2)');
});

test('linkMargins: clamps keep the text at least 2 cm wide and inside the custom limits', () => {
  const R = loadRuler().R;
  const big = R.linkMargins(Object.assign({}, base, { side: 'left', dx: 20, linked: true }));
  assert.deepEqual([big.left, big.right], [5, 5], 'custom max 5 cm');
  const narrow = R.linkMargins(Object.assign({}, base, { w: 8, side: 'left', dx: 20, linked: true }));
  assert.deepEqual([narrow.left, narrow.right], [3, 3]);
  assert.ok(8 - narrow.left - narrow.right >= 2, 'text width never below 2 cm');
  const odd = R.linkMargins(Object.assign({}, base, { w: 7.15, side: 'left', dx: 20, linked: true }));
  assert.ok(7.15 - odd.left - odd.right >= 2 - 1e-9, 'rounding never eats into the 2 cm');
  const small = R.linkMargins(Object.assign({}, base, { side: 'right', dx: 20, linked: true }));
  assert.deepEqual([small.left, small.right], [0.5, 0.5], 'custom min 0.5 cm');
});

test('tip label shows both values', () => {
  const R = loadRuler().R;
  assert.equal(R.tipLabel(2.5, 2.5), 'Left 2.5 \u00b7 Right 2.5 cm');
  assert.equal(R.linkMargins(Object.assign({}, base, { side: 'left', dx: 0.5, linked: true })).tip, 'Left 2.5 \u00b7 Right 2.5 cm');
  assert.equal(R.linkMargins(Object.assign({}, base, { side: 'left', dx: 0.5, linked: true, alt: true })).tip, 'Left 2.5 \u00b7 Right 2.0 cm');
});

test('drag a grab: both sides move live (indent markers follow) and setPage gets both', () => {
  const t = loadRuler();
  const g = els.rulerGrabL;
  assert.ok(g && g.attrs['data-side'] === 'left');
  g.fire('pointerdown', { clientX: 100, pointerId: 1 });
  g.fire('pointermove', { clientX: 100 + CM_PX });
  assert.deepEqual(t.log.filter((x) => x[0] === 'sync' && x[1]).pop()[1], { left: 3, right: 3 });
  assert.equal(els.rulerTip.textContent, 'Left 3.0 \u00b7 Right 3.0 cm');
  assert.equal(els.rulerTip.hidden, false);
  g.fire('pointerup', {});
  const sp = t.log.filter((x) => x[0] === 'setPage').pop();
  assert.equal(sp[2], 'custom');
  assert.deepEqual([sp[3].left, sp[3].right, sp[3].top, sp[3].bottom], [3, 3, 2, 2]);
  assert.equal(els.rulerTip.hidden, true);
});

test('drag with Alt held moves one side only', () => {
  const t = loadRuler();
  const g = els.rulerGrabR;
  g.fire('pointerdown', { clientX: 500, pointerId: 1, altKey: true });
  g.fire('pointermove', { clientX: 500 - CM_PX });
  g.fire('pointerup', {});
  const sp = t.log.filter((x) => x[0] === 'setPage').pop();
  assert.deepEqual([sp[3].left, sp[3].right], [2, 3]);
});

test('indent markers follow a live margin drag (DW17 wiring is kept)', () => {
  const ind = noComments(read('modules/writer-indent.js'));
  assert.ok(/else if \(!I\.drag && I\.lastV\) I\.sync\(I\.lastV, live\)/.test(ind));
});

test('settings: linkMargins is on when missing, stays off once turned off, has a switch', () => {
  function boot(stored) {
    const data = {};
    if (stored) data.writer_settings = JSON.stringify(stored);
    const ctx = {
      console, JSON,
      localStorage: { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } },
      document: { body: null, getElementById: () => null, createElement: () => fakeEl('') },
      OfficeTheme: { isDark: () => false, modes: [] }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(DIR, '../shared/office-settings.js'), 'utf8'), ctx, { filename: 'office-settings.js' });
    ctx.Writer = { config: { storageKeyNonPrint: 'np', nonPrintOnValue: '1', nonPrintOffValue: '0', storageKeyTheme: 'th', themeDarkValue: 'dark', paperSizes: {}, marginPresets: {}, orientations: ['portrait', 'landscape'], version: 'x' }, ui: {} };
    vm.runInContext(read('modules/writer-settings.js'), ctx, { filename: 'writer-settings.js' });
    return { S: ctx.Writer.settings, data };
  }
  const fresh = boot(null);
  assert.equal(fresh.S.defaults.linkMargins, true);
  assert.equal(fresh.S.s.linkMargins, true);
  const old = boot({ theme: 'dark', ruler: true });
  assert.equal(old.S.s.linkMargins, true, 'missing in stored settings → on');
  assert.equal(old.S.s.theme, 'dark');
  const off = boot({ linkMargins: false });
  assert.equal(off.S.s.linkMargins, false);
  const rows = [].concat.apply([], fresh.S.sections(fresh.S.s).map((s) => s.rows));
  const row = rows.find((r) => r.key === 'linkMargins');
  assert.ok(row && row.type === 'switch' && row.label === 'Link left and right margins');
  assert.ok(/k === 'linkMargins'\) \{ if \(Writer\.ruler && Writer\.ruler\.syncLink\) Writer\.ruler\.syncLink\(\); \}/.test(noComments(read('modules/writer-settings.js'))));
});

test('chain-link toggle reflects and flips the setting', () => {
  const calls = [];
  const settings = { s: { linkMargins: true }, panel: {}, set(k, v) { calls.push([k, v]); this.s[k] = v; } };
  const t = loadRuler({ settings });
  const b = els.rulerLink;
  assert.ok(b, 'toggle is built into the ruler');
  assert.equal(b.attrs['aria-pressed'], 'true');
  assert.ok(b.classList.contains('active'));
  b.fire('click', {});
  assert.deepEqual(calls, [['linkMargins', false]]);
  assert.equal(b.attrs['aria-pressed'], 'false');
  assert.equal(b.classList.contains('active'), false);
  assert.equal(t.R.linked(), false);
  /* unlinked: a drag moves one side */
  const g = els.rulerGrabL;
  g.fire('pointerdown', { clientX: 100, pointerId: 1 });
  g.fire('pointermove', { clientX: 100 + CM_PX });
  g.fire('pointerup', {});
  const sp = t.log.filter((x) => x[0] === 'setPage').pop();
  assert.deepEqual([sp[3].left, sp[3].right], [3, 2]);
  b.fire('click', {});
  assert.equal(settings.s.linkMargins, true);
  assert.equal(b.attrs['aria-pressed'], 'true');
  /* the Settings switch path: apply('linkMargins') → syncLink */
  settings.s.linkMargins = false;
  t.R.syncLink();
  assert.equal(b.attrs['aria-pressed'], 'false');
  assert.equal(t.R.linkedFrom({}), true, 'missing → linked');
  assert.equal(t.R.linkedFrom(null), true);
});

test('toggle CSS: 44px touch target, shown on touch screens, theme colours', () => {
  const css = read('ui/ruler.css');
  assert.ok(/\.ruler-link \{[^}]*width: 44px; height: 44px;/.test(css));
  assert.ok(/@media \(pointer: coarse\), \(max-width: 700px\) \{ \.ruler-link \{ display: block; \} \}/.test(css));
  assert.ok(/\.ruler-link svg \{[^}]*var\(--bg-paper/.test(css));
});

test('Page Setup typed margins stay independent', () => {
  const m = noComments(read('modules/writer-margins.js'));
  assert.ok(m.indexOf('linkMargins') === -1 && m.indexOf('ruler.linked') === -1);
});

test('writer.html title is DW19; config release is DW19; old ids are kept as comments', () => {
  const html = read('writer.html');
  /* (before DW22) assert.ok(/<title>Writer DW19<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW23) assert.ok(/<title>Writer DW(19|22)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  assert.ok(/<title>Writer DW(19|22|23)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, '')));
  assert.ok(html.indexOf('<!-- (before DW19) <title>Writer DW18</title> -->') !== -1);
  const cfg = read('modules/writer-config.js');
  /* (before DW22) assert.ok(/release:\s*'DW19'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW23) assert.ok(/release:\s*'DW(19|22)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  assert.ok(/release:\s*'DW(19|22|23)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(cfg.indexOf("/* (before DW19) release: 'DW18', */") !== -1);
  assert.ok(read('modules/writer-ruler.js').indexOf('(before DW19) only the dragged side moved') !== -1);
  assert.ok(read('writer_readme.md').indexOf('## DW19') !== -1);
});
