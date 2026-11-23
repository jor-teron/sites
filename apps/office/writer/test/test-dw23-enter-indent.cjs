/* DW23: Enter keeps the ruler indents, line spacing and alignment on the new line.
   Pure checks (no browser): paraStyle / applyParaStyle / wrapLoose, list skip,
   id and data-cont left alone, and insertParagraph wiring.
   Run: node --test apps/office/writer/test/test-dw23-enter-indent.cjs */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(DIR, rel), 'utf8');

function styleText(style) {
  const parts = [];
  for (const k of Object.keys(style)) {
    if (!style[k]) continue;
    parts.push(k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ':' + style[k]);
  }
  return parts.join(';');
}

function linkChildren(e) {
  for (let i = 0; i < e.childNodes.length; i++) {
    const n = e.childNodes[i];
    n.parentNode = e;
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
    nextSibling: null,
    previousSibling: null,
    firstChild: null,
    lastChild: null,
    style: {},
    attrs: Object.assign({}, attrs || {}),
    classList: {
      _s: new Set(),
      contains(c) { return this._s.has(c); },
      add(c) { this._s.add(c); }
    }
  };
  if (e.attrs.class) String(e.attrs.class).split(/\s+/).forEach((c) => e.classList.add(c));
  if (e.attrs.style) {
    String(e.attrs.style).split(';').forEach((part) => {
      const i = part.indexOf(':');
      if (i < 0) return;
      const k = part.slice(0, i).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      e.style[k] = part.slice(i + 1).trim();
    });
  }
  e.getAttribute = (k) => {
    if (k === 'style') return styleText(e.style) || null;
    return e.attrs[k] != null ? e.attrs[k] : null;
  };
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
    n.parentNode = n.nextSibling = n.previousSibling = null;
    linkChildren(e);
    return n;
  };
  e.remove = () => { if (e.parentNode) e.parentNode.removeChild(e); };
  e.closest = (sel) => {
    if (sel[0] !== '.') return null;
    const cls = sel.slice(1);
    for (let n = e; n; n = n.parentNode) {
      if (n.classList && n.classList.contains(cls)) return n;
    }
    return null;
  };
  e.focus = () => {};
  return e;
}

function text(v) {
  return {
    nodeType: 3,
    nodeValue: String(v),
    parentNode: null,
    nextSibling: null,
    previousSibling: null
  };
}

function load(opts) {
  opts = opts || {};
  const body = el('body');
  const ctx = {
    console,
    window: {},
    document: {
      body,
      createElement: (t) => el(t),
      createTextNode: (v) => text(v),
      execCommand() { return true; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {},
      getElementById() { return null; }
    },
    InputEvent: function () {},
    setTimeout: (fn) => { /* run pagination later only if tests ask */ if (opts.runTimeouts) return setTimeout(fn, 0); return 0; },
    window: {}
  };
  ctx.window = ctx.window;
  ctx.window.getSelection = () => ctx._sel || null;
  ctx.document.execCommand = ctx.document.execCommand;
  ctx.window.Writer = {
    config: { editorClass: 'editor', paginationAfterInsertMs: 0, fontCommandName: 'Times New Roman' }
  };
  vm.createContext(ctx);
  vm.runInContext(read('modules/writer-indent.js'), ctx, { filename: 'writer-indent.js' });
  if (opts.editor) vm.runInContext(read('modules/writer-editor.js'), ctx, { filename: 'writer-editor.js' });
  return ctx;
}

function snapEq(s, expect) {
  for (const k of Object.keys(expect)) assert.equal(s && s[k], expect[k], k);
}

test('paraStyle snapshots only set inline values; applyParaStyle copies them', () => {
  const I = load().window.Writer.indent;
  const p = el('p');
  I.apply(p, { left: 2, right: 1.5, first: 1 });
  p.style.lineHeight = '1.5';
  p.style.textAlign = 'center';
  p.setAttribute('align', 'center');
  const snap = I.paraStyle(p);
  snapEq(snap, {
    marginLeft: '2.0cm', marginRight: '1.5cm', textIndent: '1.0cm',
    lineHeight: '1.5', textAlign: 'center', align: 'center'
  });
  const dest = el('p');
  dest.style.color = 'red';
  I.applyParaStyle(dest, snap);
  snapEq(dest.style, { marginLeft: '2.0cm', marginRight: '1.5cm', textIndent: '1.0cm', lineHeight: '1.5', textAlign: 'center', color: 'red' });
  assert.equal(dest.getAttribute('align'), 'center');
});

test('empty indented line still has a snapshot; a new empty p receives it', () => {
  const I = load().window.Writer.indent;
  const p = el('p');
  I.apply(p, { left: 2, right: 0, first: -1 });
  p.appendChild(el('br'));
  const snap = I.paraStyle(p);
  snapEq(snap, { marginLeft: '2.0cm', textIndent: '-1.0cm' });
  assert.equal(snap.marginRight, undefined);
  const dest = el('p');
  dest.appendChild(el('br'));
  I.applyParaStyle(dest, snap);
  assert.equal(dest.style.marginLeft, '2.0cm');
  assert.equal(dest.style.textIndent, '-1.0cm');
  assert.equal(dest.style.marginRight || '', '');
});

test('heading end: a new p gets the heading indent, alignment and spacing', () => {
  const I = load().window.Writer.indent;
  const h = el('h2');
  h.style.marginLeft = '2.0cm';
  h.style.marginRight = '1.0cm';
  h.style.textIndent = '0.5cm';
  h.style.lineHeight = '1.15';
  h.style.textAlign = 'right';
  const snap = I.paraStyle(h);
  assert.ok(snap);
  const np = el('p');
  I.applyParaStyle(np, snap);
  assert.equal(np.tagName, 'P');
  snapEq(np.style, {
    marginLeft: '2.0cm', marginRight: '1.0cm', textIndent: '0.5cm',
    lineHeight: '1.15', textAlign: 'right'
  });
});

test('list items are skipped: no snapshot, apply is a no-op', () => {
  const I = load().window.Writer.indent;
  const ul = el('ul');
  const li = el('li');
  li.style.marginLeft = '2.0cm';
  li.style.textAlign = 'center';
  ul.appendChild(li);
  assert.equal(I.inList(li), true);
  assert.equal(I.paraStyle(li), null);
  const inner = el('p');
  inner.style.marginLeft = '3.0cm';
  li.appendChild(inner);
  assert.equal(I.inList(inner), true);
  assert.equal(I.paraStyle(inner), null);
  const dest = el('li');
  I.applyParaStyle(dest, { marginLeft: '2.0cm', textAlign: 'center', lineHeight: '1.5' });
  assert.equal(dest.style.marginLeft || '', '');
  assert.equal(dest.style.textAlign || '', '');
  const p = el('p');
  I.apply(p, { left: 2, right: 0, first: 0 });
  assert.ok(I.paraStyle(p));
  assert.equal(I.inList(p), false);
});

test('applyParaStyle never copies id or data-cont', () => {
  const I = load().window.Writer.indent;
  const dest = el('p');
  dest.setAttribute('id', 'keep-me');
  dest.setAttribute('data-cont', '1');
  I.applyParaStyle(dest, {
    marginLeft: '2.0cm', lineHeight: '2', id: 'stolen', 'data-cont': '9', dataCont: '9'
  });
  assert.equal(dest.getAttribute('id'), 'keep-me');
  assert.equal(dest.getAttribute('data-cont'), '1');
  assert.equal(dest.style.marginLeft, '2.0cm');
  assert.equal(dest.style.lineHeight, '2');
  assert.equal(Object.prototype.hasOwnProperty.call(dest.attrs, 'id'), true);
});

test('wrapLoose + apply: normalize-style leftover \\n becomes a styled p', () => {
  const ctx = load();
  const I = ctx.window.Writer.indent;
  const host = el('div', { class: 'editor' });
  const p = el('p');
  I.apply(p, { left: 2, right: 1.5, first: 1 });
  p.style.lineHeight = '1.5';
  p.style.textAlign = 'center';
  p.appendChild(text('Hello'));
  host.appendChild(p);
  const leftover = text('\n');
  host.appendChild(leftover);
  const wrapped = I.wrapLoose(host, leftover);
  assert.equal(wrapped.tagName, 'P');
  assert.equal(wrapped.parentNode, host);
  assert.equal(wrapped.previousSibling, p);
  assert.equal((wrapped.style.marginLeft || ''), '');
  I.applyParaStyle(wrapped, I.paraStyle(p));
  snapEq(wrapped.style, {
    marginLeft: '2.0cm', marginRight: '1.5cm', textIndent: '1.0cm',
    lineHeight: '1.5', textAlign: 'center'
  });
  assert.equal(I.wrapLoose(host, p), p);
});

test('insertParagraph applies the snapshot to a bare new p (mocked execCommand)', () => {
  const ctx = load({ editor: true });
  const W = ctx.window.Writer;
  const host = el('div', { class: 'editor' });
  const p = el('p');
  W.indent.apply(p, { left: 2, right: 1.5, first: 1 });
  p.style.lineHeight = '1.5';
  p.style.textAlign = 'justify';
  const t = text('Hello');
  p.appendChild(t);
  host.appendChild(p);
  W.editor.activeEditor = host;
  ctx._sel = {
    rangeCount: 1,
    getRangeAt() { return { startContainer: t, startOffset: t.nodeValue.length, cloneRange() { return this; } }; },
    removeAllRanges() {},
    addRange() {}
  };
  ctx.document.execCommand = (cmd) => {
    assert.equal(cmd, 'insertParagraph');
    const bare = el('p');
    bare.appendChild(el('br'));
    host.appendChild(bare);
    ctx._sel = {
      rangeCount: 1,
      getRangeAt() { return { startContainer: bare, startOffset: 0, cloneRange() { return this; } }; },
      removeAllRanges() {},
      addRange() {}
    };
    return true;
  };
  W.editor.insertParagraph();
  assert.equal(host.childNodes.length, 2);
  const np = host.lastChild;
  assert.equal(np.tagName, 'P');
  snapEq(np.style, {
    marginLeft: '2.0cm', marginRight: '1.5cm', textIndent: '1.0cm',
    lineHeight: '1.5', textAlign: 'justify'
  });
});

test('source: Enter calls insertParagraph; Shift+Enter and Ctrl+Enter stay as they were', () => {
  const ed = read('modules/writer-editor.js');
  const live = ed.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/Writer\.editor\.insertParagraph\s*=\s*function/.test(live));
  assert.ok(/else Writer\.editor\.insertParagraph\(\);/.test(live));
  assert.ok(/if \(e\.shiftKey\) Writer\.editor\.insertLineBreak\(\);/.test(live));
  assert.ok(/e\.key !== 'Enter' \|\| e\.ctrlKey \|\| e\.metaKey/.test(live));
  assert.ok(/insertLineBreak/.test(live));
  const br = read('modules/writer-breaks.js');
  assert.ok(/e\.key === 'Enter' && \(e\.ctrlKey \|\| e\.metaKey\)/.test(br));
  const hist = read('modules/writer-history.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/'insertParagraph'/.test(hist));
});

test('writer.html title is DW23; config release is DW23; old ids are kept as comments', () => {
  const html = read('writer.html');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  /* (before DW24) assert.ok(/<title>Writer DW23<\/title>/.test(live)); */
  /* (before DW25) assert.ok(/<title>Writer DW(23|24)<\/title>/.test(live)); */
  assert.ok(/<title>Writer DW(23|24|25)<\/title>/.test(live));
  assert.ok(html.indexOf('<!-- (before DW23) <title>Writer DW22</title> -->') !== -1);
  const cfg = read('modules/writer-config.js');
  /* (before DW24) assert.ok(/release:\s*'DW23'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW25) assert.ok(/release:\s*'DW(23|24)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  assert.ok(/release:\s*'DW(23|24|25)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(cfg.indexOf("/* (before DW23) release: 'DW22', */") !== -1);
  assert.ok(read('writer_readme.md').indexOf('## DW23') !== -1);
  assert.ok(read('writer_readme.md').indexOf('## DW22') !== -1);
});
