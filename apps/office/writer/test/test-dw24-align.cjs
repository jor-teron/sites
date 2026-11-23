/* DW24: aligning a line keeps Shift+Enter lines in one paragraph.
   Pure checks (no browser): setAlign writes text-align on the enclosing
   block, does not split <br> lines, does not toggle off, skips execCommand
   justify*, and leaves list items / headings / cells as one block.
   Run: node --test apps/office/writer/test/test-dw24-align.cjs */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(DIR, rel), 'utf8');

function linkChildren(e) {
  for (let i = 0; i < e.childNodes.length; i++) {
    const n = e.childNodes[i];
    n.parentNode = e;
    n.parentElement = e;
    n.previousSibling = i ? e.childNodes[i - 1] : null;
    n.nextSibling = i + 1 < e.childNodes.length ? e.childNodes[i + 1] : null;
  }
  e.firstChild = e.childNodes[0] || null;
  e.lastChild = e.childNodes[e.childNodes.length - 1] || null;
}

function el(tag, attrs) {
  const e = {
    nodeType: 1,
    nodeName: String(tag).toUpperCase(),
    tagName: String(tag).toUpperCase(),
    childNodes: [],
    parentNode: null,
    parentElement: null,
    nextSibling: null,
    previousSibling: null,
    firstChild: null,
    lastChild: null,
    style: {},
    attrs: Object.assign({}, attrs || {}),
    classList: {
      _s: new Set(),
      contains(c) { return this._s.has(c); },
      add(c) { this._s.add(c); },
      toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); }
    }
  };
  if (e.attrs.class) String(e.attrs.class).split(/\s+/).forEach((c) => e.classList.add(c));
  e.getAttribute = (k) => (e.attrs[k] != null ? e.attrs[k] : null);
  e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
  e.removeAttribute = (k) => { delete e.attrs[k]; };
  e.hasAttribute = (k) => e.getAttribute(k) != null;
  e.appendChild = (n) => { if (n.parentNode) n.parentNode.removeChild(n); e.childNodes.push(n); linkChildren(e); return n; };
  e.insertBefore = (n, ref) => {
    if (n.parentNode) n.parentNode.removeChild(n);
    const i = ref ? e.childNodes.indexOf(ref) : -1;
    if (i < 0) e.childNodes.push(n);
    else e.childNodes.splice(i, 0, n);
    linkChildren(e);
    return n;
  };
  e.removeChild = (n) => {
    const i = e.childNodes.indexOf(n);
    if (i >= 0) e.childNodes.splice(i, 1);
    n.parentNode = n.parentElement = n.nextSibling = n.previousSibling = null;
    linkChildren(e);
    return n;
  };
  e.remove = () => { if (e.parentNode) e.parentNode.removeChild(e); };
  e.closest = (sel) => {
    const tags = sel[0] === '.' ? null : sel.toUpperCase().split(',');
    const cls = sel[0] === '.' ? sel.slice(1) : null;
    for (let n = e; n; n = n.parentNode) {
      if (cls && n.classList && n.classList.contains(cls)) return n;
      if (tags && n.tagName && tags.indexOf(n.tagName) !== -1) return n;
    }
    return null;
  };
  e.querySelector = (sel) => {
    const tags = sel.toUpperCase().split(',');
    const walk = (n) => {
      for (const c of n.childNodes || []) {
        if (c.nodeType === 1 && tags.indexOf(c.tagName) !== -1) return c;
        const f = walk(c);
        if (f) return f;
      }
      return null;
    };
    return walk(e);
  };
  e.querySelectorAll = (sel) => {
    const tags = sel.toUpperCase().split(',');
    const out = [];
    const walk = (n) => {
      for (const c of n.childNodes || []) {
        if (c.nodeType === 1 && tags.indexOf(c.tagName) !== -1) out.push(c);
        walk(c);
      }
    };
    walk(e);
    return out;
  };
  e.contains = (n) => {
    for (let x = n; x; x = x.parentNode) if (x === e) return true;
    return false;
  };
  e.focus = () => {};
  return e;
}

function text(v) {
  return { nodeType: 3, nodeValue: String(v), parentNode: null, parentElement: null, nextSibling: null, previousSibling: null };
}

function linesIn(p, lines) {
  lines.forEach((s, i) => {
    if (i) p.appendChild(el('br'));
    p.appendChild(text(s));
  });
  return p;
}

function structure(node) {
  if (node.nodeType === 3) return '#' + node.nodeValue;
  const kids = (node.childNodes || []).map(structure).join(',');
  return node.tagName + (kids ? '(' + kids + ')' : '');
}

function load() {
  const ctx = {
    console,
    document: {
      createElement: (t) => el(t),
      execCommand() { ctx._exec.push([].slice.call(arguments)); return true; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {},
      getElementById() { return null; }
    },
    window: {},
    setTimeout(fn) { return 0; },
    clearTimeout() {},
    _exec: []
  };
  ctx.window = ctx.window;
  ctx.window.getSelection = () => ctx._sel || null;
  ctx.window.Writer = { config: { editorClass: 'editor', inputDebounceMs: 0 } };
  vm.createContext(ctx);
  vm.runInContext(read('modules/writer-editor.js'), ctx, { filename: 'writer-editor.js' });
  return ctx;
}

function caretIn(ctx, host, node, offset) {
  host.classList.add('editor');
  ctx.window.Writer.editor.activeEditor = host;
  const range = {
    startContainer: node,
    startOffset: offset == null ? 0 : offset,
    endContainer: node,
    endOffset: offset == null ? 0 : offset,
    commonAncestorContainer: host,
    cloneRange() { return this; },
    intersectsNode(b) { return host.contains(b); }
  };
  ctx._sel = {
    rangeCount: 1,
    isCollapsed: true,
    anchorNode: node,
    getRangeAt() { return range; },
    removeAllRanges() {},
    addRange() {}
  };
  return range;
}

test('setAlign centres a whole <p> of Shift+Enter lines without splitting it', () => {
  const ctx = load();
  const W = ctx.window.Writer;
  const host = el('div', { class: 'editor' });
  const p = el('p');
  linesIn(p, ['one', 'two', 'three', 'four', 'five']);
  host.appendChild(p);
  const mid = p.childNodes[4]; /* text "three" after two brs: 0:one 1:br 2:two 3:br 4:three */
  assert.equal(mid.nodeValue, 'three');
  caretIn(ctx, host, mid, 1);
  const before = structure(p);
  W.editor.setAlign('center');
  assert.equal(ctx._exec.length, 0, 'must not call execCommand');
  assert.equal(host.childNodes.length, 1);
  assert.equal(host.firstChild, p);
  assert.equal(structure(p), before);
  assert.equal(p.style.textAlign, 'center');
  assert.equal(p.childNodes.length, 9);
});

test('setAlign does not toggle an already centred paragraph off', () => {
  const ctx = load();
  const W = ctx.window.Writer;
  const host = el('div', { class: 'editor' });
  const p = el('p');
  p.style.textAlign = 'center';
  p.appendChild(text('Hello'));
  host.appendChild(p);
  caretIn(ctx, host, p.firstChild, 0);
  W.editor.setAlign('center');
  assert.equal(p.style.textAlign, 'center');
  assert.equal(host.childNodes.length, 1);
});

test('setAlign removes a leftover align attribute and keeps the CSS value', () => {
  const ctx = load();
  const W = ctx.window.Writer;
  const host = el('div', { class: 'editor' });
  const p = el('p');
  p.setAttribute('align', 'right');
  p.appendChild(text('Hello'));
  host.appendChild(p);
  caretIn(ctx, host, p.firstChild, 0);
  assert.equal(W.editor.alignValue(p), 'right');
  W.editor.setAlign('justify');
  assert.equal(p.getAttribute('align'), null);
  assert.equal(p.style.textAlign, 'justify');
  assert.equal(W.editor.alignValue(p), 'justify');
  assert.equal(W.editor.alignAtCaret(), 'justify');
});

test('list item is not split: alignment is set on the <li>', () => {
  const ctx = load();
  const W = ctx.window.Writer;
  const host = el('div', { class: 'editor' });
  const ul = el('ul');
  const li = el('li');
  linesIn(li, ['alpha', 'beta']);
  ul.appendChild(li);
  host.appendChild(ul);
  caretIn(ctx, host, li.childNodes[2], 0);
  const before = structure(li);
  W.editor.setAlign('center');
  assert.equal(ul.childNodes.length, 1);
  assert.equal(li.childNodes.length, 3);
  assert.equal(structure(li), before);
  assert.equal(li.style.textAlign, 'center');
  assert.equal(li.querySelector('p,div'), null);
});

test('heading and table cell receive text-align on the same element', () => {
  const ctx = load();
  const W = ctx.window.Writer;
  const host = el('div', { class: 'editor' });
  const h = el('h2');
  h.appendChild(text('Title'));
  host.appendChild(h);
  caretIn(ctx, host, h.firstChild, 0);
  W.editor.setAlign('right');
  assert.equal(h.style.textAlign, 'right');
  assert.equal(h.tagName, 'H2');
  assert.equal(host.childNodes.length, 1);

  const table = el('table');
  const tr = el('tr');
  const td = el('td');
  td.appendChild(text('cell'));
  tr.appendChild(td);
  table.appendChild(tr);
  host.appendChild(table);
  caretIn(ctx, host, td.firstChild, 0);
  W.editor.setAlign('center');
  assert.equal(td.style.textAlign, 'center');
  assert.equal(td.childNodes.length, 1);
});

test('multi-paragraph selection aligns every touched block', () => {
  const ctx = load();
  const W = ctx.window.Writer;
  const host = el('div', { class: 'editor' });
  const p1 = el('p'); p1.appendChild(text('A'));
  const p2 = el('p'); p2.appendChild(text('B'));
  host.appendChild(p1); host.appendChild(p2);
  const range = caretIn(ctx, host, p1.firstChild, 0);
  range.endContainer = p2.firstChild;
  range.endOffset = 1;
  ctx._sel.isCollapsed = false;
  ctx._sel.anchorNode = p1.firstChild;
  W.editor.setAlign('center');
  assert.equal(p1.style.textAlign, 'center');
  assert.equal(p2.style.textAlign, 'center');
  assert.equal(host.childNodes.length, 2);
});

test('alignAtCaret is empty when blocks disagree; left/center/right/justify map from justify* names', () => {
  const ctx = load();
  const W = ctx.window.Writer;
  const host = el('div', { class: 'editor' });
  const p1 = el('p'); p1.style.textAlign = 'left'; p1.appendChild(text('A'));
  const p2 = el('p'); p2.style.textAlign = 'center'; p2.appendChild(text('B'));
  host.appendChild(p1); host.appendChild(p2);
  const range = caretIn(ctx, host, p1.firstChild, 0);
  range.endContainer = p2.firstChild;
  ctx._sel.isCollapsed = false;
  assert.equal(W.editor.alignAtCaret(), '');
  caretIn(ctx, host, p2.firstChild, 0);
  assert.equal(W.editor.alignAtCaret(), 'center');
  assert.equal(W.editor.alignNames.justifyCenter, 'center');
  assert.equal(W.editor.alignNames.justifyFull, 'justify');
  const mid = el('p'); mid.setAttribute('align', 'middle');
  assert.equal(W.editor.alignValue(mid), 'center');
});

test('source: buttons and Ctrl+L/E/R/J call setAlign; no live execCommand justify*', () => {
  const fmt = read('modules/writer-format.js');
  const live = fmt.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/setAlign\('left'\)/.test(live));
  assert.ok(/setAlign\('center'\)/.test(live));
  assert.ok(/setAlign\('right'\)/.test(live));
  assert.ok(/setAlign\('justify'\)/.test(live));
  assert.ok(!(/execCmd\('justify/.test(live)));
  assert.ok(/key === 'e'/.test(live) && /key === 'l'/.test(live) && /key === 'r'/.test(live) && /key === 'j'/.test(live));
  const hf = read('modules/writer-headerfooter.js');
  assert.ok(/Ctrl\+Shift\+L|Shift\+L\/E\/R|key\.toLowerCase\(\)/.test(hf) || /\^[lre]\$/.test(hf));
  assert.ok(hf.indexOf("H.align({ l: 'l', e: 'c', r: 'r' }[e.key.toLowerCase()])") !== -1);
  const hist = read('modules/writer-history.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/'setAlign'/.test(hist));
  const ui = read('modules/writer-ui.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/alignAtCaret\(\)/.test(ui));
  assert.ok(!/queryCommandState\('justify/.test(ui));
  const ed = read('modules/writer-editor.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/Writer\.editor\.setAlign\s*=\s*function/.test(ed));
  assert.ok(!/execCommand\('justify/.test(ed));
});

test('writer.html title is DW24; config release is DW24; old ids are kept as comments', () => {
  const html = read('writer.html');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  /* (before DW25) assert.ok(/<title>Writer DW24<\/title>/.test(live)); */
  assert.ok(/<title>Writer DW(24|25|26)<\/title>/.test(live));
  assert.ok(html.indexOf('<!-- (before DW24) <title>Writer DW23</title> -->') !== -1);
  const cfg = read('modules/writer-config.js');
  /* (before DW25) assert.ok(/release:\s*'DW24'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  assert.ok(/release:\s*'DW(24|25|26)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(cfg.indexOf("/* (before DW24) release: 'DW23', */") !== -1);
  assert.ok(read('writer_readme.md').indexOf('## DW24') !== -1);
  assert.ok(read('writer_readme.md').indexOf('## DW23') !== -1);
});
