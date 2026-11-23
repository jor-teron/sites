/* DW17: Writer ruler indent markers: Word-style SVG, inside the track, scale with zoom.
   Pure checks (no browser): Writer.ruler.scale, Writer.indent.positions, sync wiring,
   the drag guide, and the CSS / release hooks.
   Run: node --test apps/office/writer/test/test-dw17-ruler-indent.cjs */
'use strict';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.resolve(__dirname, '..');
const CM_PX = 96 / 2.54;

function read(rel) { return fs.readFileSync(path.join(DIR, rel), 'utf8'); }
function noComments(src) { return src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); }

function fakeEl(id) {
  const props = {};
  return {
    id, hidden: false, innerHTML: '', className: '', children: [], attrs: {},
    style: { setProperty(k, v) { props[k] = v; }, getPropertyValue(k) { return props[k]; } },
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle() {} },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { this.children.push(c); if (c.id) els[c.id] = c; return c; },
    insertBefore(c) { if (c.id) els[c.id] = c; return c; },
    addEventListener() {}, removeEventListener() {},
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 100, width: 44, bottom: 60 }; }
  };
}
let els = {};

function load(opts) {
  opts = opts || {};
  els = {};
  ['workspace', 'pagesScaler', 'rulerToggle'].forEach((id) => { els[id] = fakeEl(id); });
  const body = fakeEl('body');
  body.classList.contains = () => false;
  const ctx = {
    console, getComputedStyle: () => ({ marginLeft: '0px', marginRight: '0px', textIndent: '0px' }),
    localStorage: { getItem: () => (opts.rulerOn ? '1' : null), setItem() {} },
    InputEvent: function () {},
    window: {},
    document: {
      body,
      getElementById: (id) => els[id] || null,
      createElement: () => fakeEl(''),
      addEventListener() {}
    }
  };
  ctx.window.getSelection = () => null;
  ctx.window.Writer = {
    config: { landscapeClass: 'ls', paperWidthCm: 21, paperHeightCm: 29.7, marginLeftCm: 2.5, marginRightCm: 2, editorClass: 'editor' },
    view: { CM_PX, zoom: opts.zoom || 1, fit() { return 'fit'; } }
  };
  vm.createContext(ctx);
  /* ruler.build assigns innerHTML; register the child ids it names so sync can find them */
  const origCreate = ctx.document.createElement;
  ctx.document.createElement = (t) => {
    const e = origCreate(t);
    let html = '';
    Object.defineProperty(e, 'innerHTML', {
      get() { return html; },
      set(v) { html = v; (v.match(/id="([^"]+)"/g) || []).forEach((m) => { const id = m.slice(4, -1); els[id] = fakeEl(id); }); }
    });
    return e;
  };
  vm.runInContext(read('modules/writer-ruler.js'), ctx, { filename: 'writer-ruler.js' });
  vm.runInContext(read('modules/writer-indent.js'), ctx, { filename: 'writer-indent.js' });
  return ctx.window.Writer;
}

test('ruler.scale clamps zoom to 0.8-1.6', () => {
  const W = load();
  const s = W.ruler.scale;
  assert.strictEqual(s(0.5), 0.8);
  assert.strictEqual(s(0.8), 0.8);
  assert.strictEqual(s(1), 1);
  assert.strictEqual(s(1.25), 1.25);
  assert.strictEqual(s(1.6), 1.6);
  assert.strictEqual(s(2), 1.6);
  assert.strictEqual(s(NaN), 1);
  assert.strictEqual(s(0), 1);
  assert.strictEqual(s(undefined), 1);
});

test('indent.positions at zoom 0.5, 1 and 2', () => {
  const W = load();
  const v = { left: 1, right: 0.5, first: 0.75 };
  [0.5, 1, 2].forEach((z) => {
    const cm = CM_PX * z;
    const p = W.indent.positions(v, cm, 21, 2.5, 2);
    const r2 = (n) => Math.round(n * 100) / 100;
    assert.strictEqual(p.first, r2(4.25 * cm), 'first @' + z);
    assert.strictEqual(p.hang, r2(3.5 * cm), 'hang @' + z);
    assert.strictEqual(p.left, p.hang, 'left sits under hang @' + z);
    assert.strictEqual(p.right, r2(18.5 * cm), 'right @' + z);
  });
  const a = W.indent.positions(v, CM_PX, 21, 2.5, 2), b = W.indent.positions(v, CM_PX * 2, 21, 2.5, 2);
  assert.ok(Math.abs(b.first - 2 * a.first) < 0.02, 'positions scale linearly with zoom');
  /* negative first-line (hanging) puts first left of hang */
  const h = W.indent.positions({ left: 1, right: 0, first: -0.5 }, CM_PX, 21, 2.5, 2);
  assert.ok(h.first < h.hang);
});

test('ruler.sync sets --rs from the zoom; indent.sync places markers from positions', () => {
  const W = load({ rulerOn: true, zoom: 2 });
  assert.ok(W.ruler.on);
  assert.strictEqual(els.ruler.style.getPropertyValue('--rs'), '1.6');
  W.view.zoom = 0.5; W.ruler.lastKey = null; W.ruler.sync();
  assert.strictEqual(els.ruler.style.getPropertyValue('--rs'), '0.8');
  W.view.zoom = 1.2; W.ruler.sync();
  assert.strictEqual(els.ruler.style.getPropertyValue('--rs'), '1.2');
  const v = { left: 1, right: 0.5, first: 0.5 };
  W.indent.sync(v);
  const p = W.indent.positions(v, CM_PX * 1.2, 21, 2.5, 2);
  assert.strictEqual(els.indFirst.style.left, p.first + 'px');
  assert.strictEqual(els.indHang.style.left, p.hang + 'px');
  assert.strictEqual(els.indLeft.style.left, p.left + 'px');
  assert.strictEqual(els.indRight.style.left, p.right + 'px');
  assert.strictEqual(els.rulerIndent.hidden, false);
});

test('zoom during an indent drag keeps the dragged values; live margin drag moves markers', () => {
  const W = load({ rulerOn: true, zoom: 1 });
  const cur = { left: 3, right: 1, first: 0 };
  W.indent.drag = { cur, k: 'left', g: els.indLeft };
  W.view.zoom = 2; W.ruler.sync();       // what view.fit triggers
  assert.strictEqual(els.indLeft.style.left, W.indent.positions(cur, CM_PX * 2, 21, 2.5, 2).left + 'px');
  W.indent.drag = null;
  W.indent.lastV = { left: 1, right: 0, first: 0 };
  W.ruler.sync({ left: 4, right: 3, top: 2, bottom: 2 });   // live margin drag
  assert.strictEqual(els.indLeft.style.left, W.indent.positions(W.indent.lastV, CM_PX * 2, 21, 4, 3).left + 'px');
  assert.strictEqual(els.indRight.style.left, W.indent.positions(W.indent.lastV, CM_PX * 2, 21, 4, 3).right + 'px');
});

test('markers are SVG shapes; the drag guide shows on drag and hides on drop / cancel', () => {
  const W = load({ rulerOn: true });
  const S = W.indent.SHAPES;
  ['first', 'hang', 'left', 'right'].forEach((k) => assert.ok(/^<svg class="ind-shape"/.test(S[k]), k));
  assert.ok(/<svg class="ind-shape"/.test(els.rulerIndent.innerHTML));
  assert.ok(els.indGuide, 'guide element built');
  assert.strictEqual(els.indGuide.hidden, true);
  W.indent.guide(els.indFirst);
  assert.strictEqual(els.indGuide.hidden, false);
  assert.strictEqual(els.indGuide.style.left, '122px');
  assert.strictEqual(els.indGuide.style.top, '60px');
  const g = els.indHang;
  W.indent.drag = { k: 'hang', g, v0: { left: 0, right: 0, first: 0 }, cur: { left: 0, right: 0, first: 0 }, bl: [] };
  W.indent.end();   // pointerup and pointercancel both end here
  assert.strictEqual(els.indGuide.hidden, true);
  assert.strictEqual(W.indent.drag, null);
});

test('CSS: scale variable, markers inside the track, highlight, reduced motion, print', () => {
  const css = read('ui/ruler.css');
  const live = noComments(css);
  assert.ok(/--ru:\s*calc\(1px \* var\(--rs\)\)/.test(live));
  assert.ok(/\.ruler-track[^}]*height:\s*calc\(22 \* var\(--ru\)\)/.test(live));
  assert.ok(/\.ruler-ticks b[^}]*font-size:\s*calc\(9 \* var\(--ru\)\)/.test(live));
  assert.ok(/\.ind-shape\s*\{[^}]*fill:\s*var\(--accent[^}]*stroke:/.test(live));
  assert.ok(/\.ind-first \.ind-shape\s*\{\s*top:\s*11px/.test(live), 'first hangs from the top edge');
  assert.ok(/\.ind-right \.ind-shape\s*\{\s*bottom:\s*18px/.test(live), 'right sits on the bottom edge');
  assert.ok(/\.ind-grab:hover \.ind-shape/.test(live));
  assert.ok(/prefers-reduced-motion[^}]*\.ind-shape\s*\{\s*transition:\s*none/.test(live));
  assert.ok(/@media print\s*\{\s*\.ind-guide\s*\{\s*display:\s*none/.test(live));
  assert.ok(/\.ind-grab\s*\{[^}]*width:\s*44px/.test(live), '44px touch zone kept');
  assert.ok(!/\.ind-grab i\b/.test(live), 'old CSS-border triangles are commented out');
  assert.ok(css.indexOf('(before DW17)') !== -1);
  const ind = read('modules/writer-indent.js');
  assert.ok(ind.indexOf('(before DW17) d.innerHTML') !== -1);
  assert.ok(ind.indexOf('(before DW17) R.sync = function') !== -1);
});

test('writer.html title is DW17; config release is DW17; old ids are kept as comments', () => {
  const html = read('writer.html');
  const cfg = read('modules/writer-config.js');
  /* (before DW18) assert.ok(/<title>Writer DW17<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW19) assert.ok(/<title>Writer DW1(7|8)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW22) assert.ok(/<title>Writer DW1(7|8|9)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW23) assert.ok(/<title>Writer DW(1(7|8|9)|22)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW24) assert.ok(/<title>Writer DW(1(7|8|9)|22|23)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW25) assert.ok(/<title>Writer DW(1(7|8|9)|22|23|24)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  assert.ok(/<title>Writer DW(1(7|8|9)|22|23|24|25)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, '')));
  assert.ok(html.indexOf('<!-- (before DW17) <title>Writer DW16</title> -->') !== -1);
  /* (before DW18) assert.ok(/release:\s*'DW17'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW19) assert.ok(/release:\s*'DW1(7|8)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW22) assert.ok(/release:\s*'DW1(7|8|9)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW23) assert.ok(/release:\s*'DW(1(7|8|9)|22)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW24) assert.ok(/release:\s*'DW(1(7|8|9)|22|23)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW25) assert.ok(/release:\s*'DW(1(7|8|9)|22|23|24)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  assert.ok(/release:\s*'DW(1(7|8|9)|22|23|24|25)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(cfg.indexOf("(before DW17) release: 'DW16'") !== -1);
});
