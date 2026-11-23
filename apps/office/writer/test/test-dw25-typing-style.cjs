/* DW25: new text keeps the font size, font and style you set, including after Enter.
   Pure checks (no browser): caret-only pending span for font size / family / B / I / U,
   selected-text path untouched, ZWSP stripped on real input & IME compositionend,
   removed on caret leave / ArrowLeft / Backspace, reflow/restoreCaret keeps caret in span,
   Undo removes pending span as one step, save/export/DOCX/ODT/PDF strip ZWSP & empty pending spans,
   and Enter / Shift+Enter carry inline formatting (without id / data-cont).
   Run: node --test apps/office/writer/test/test-dw25-typing-style.cjs */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const DIR = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(DIR, rel), 'utf8');

function camel(k) { return k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
function kebab(k) { return k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()); }

function styleText(style) {
  const parts = [];
  for (const k of Object.keys(style)) {
    if (!style[k]) continue;
    parts.push(kebab(k) + ':' + style[k]);
  }
  return parts.join(';');
}

function styleObj(css) {
  const o = {};
  String(css || '').split(';').forEach((part) => {
    const i = part.indexOf(':');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) o[camel(k)] = v;
  });
  return o;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const VOID = /^(AREA|BASE|BR|COL|EMBED|HR|IMG|INPUT|LINK|META|PARAM|SOURCE|TRACK|WBR)$/;

function serialize(n) {
  if (n.nodeType === 3) return esc(n.nodeValue);
  if (n.nodeType !== 1) return '';
  const tag = n.tagName.toLowerCase();
  let attrs = '';
  const st = styleText(n.style);
  for (const k of Object.keys(n.attrs)) {
    if (k === 'style') continue;
    attrs += ' ' + k + '="' + String(n.attrs[k]).replace(/"/g, '&quot;') + '"';
  }
  if (st) attrs += ' style="' + st.replace(/"/g, '&quot;') + '"';
  if (VOID.test(n.tagName)) return '<' + tag + attrs + '>';
  return '<' + tag + attrs + '>' + n.childNodes.map(serialize).join('') + '</' + tag + '>';
}

function parseMiniHtml(doc, html) {
  const root = doc.createElement('div');
  const stack = [root];
  const re = /(<\/?[^>]+>|[^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const tok = m[1];
    if (tok[0] !== '<') {
      stack[stack.length - 1].appendChild(doc.createTextNode(
        tok.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      ));
      continue;
    }
    if (tok[1] === '/') {
      const closeTag = tok.slice(2, -1).trim().toUpperCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === closeTag) { stack.length = i; break; }
      }
      continue;
    }
    const selfClose = /\/\s*>$/.test(tok);
    const body = tok.slice(1, selfClose ? -2 : -1).trim();
    const sp = body.search(/\s/);
    const tag = (sp < 0 ? body : body.slice(0, sp)).toUpperCase();
    const node = doc.createElement(tag);
    if (sp >= 0) {
      const attrStr = body.slice(sp + 1);
      const are = /([a-zA-Z0-9_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
      let am;
      while ((am = are.exec(attrStr))) {
        const k = am[1];
        const v = am[2] != null ? am[2] : (am[3] != null ? am[3] : (am[4] != null ? am[4] : ''));
        node.setAttribute(k, v.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      }
    }
    stack[stack.length - 1].appendChild(node);
    if (!selfClose && !VOID.test(tag)) stack.push(node);
  }
  return root;
}

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
  e.firstElementChild = e.childNodes.find((c) => c.nodeType === 1) || null;
  const els = e.childNodes.filter((c) => c.nodeType === 1);
  e.lastElementChild = els[els.length - 1] || null;
  e.childElementCount = els.length;
}

function makeDoc(ctx) {
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
      firstElementChild: null,
      lastElementChild: null,
      childElementCount: 0,
      isConnected: true,
      style: {},
      attrs: Object.assign({}, attrs || {}),
      classList: {
        _s: new Set(),
        contains(c) { return this._s.has(c); },
        add(c) { this._s.add(c); },
        remove(c) { this._s.delete(c); },
        toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); }
      },
      get textContent() { return this.childNodes.map((c) => c.textContent).join(''); },
      set textContent(v) {
        this.childNodes.forEach((c) => { c.parentNode = c.parentElement = null; });
        this.childNodes = [];
        if (v) this.appendChild(text(v));
      },
      get innerHTML() { return this.childNodes.map(serialize).join(''); },
      set innerHTML(v) {
        this.childNodes.forEach((c) => { c.parentNode = c.parentElement = null; });
        this.childNodes = [];
        const tmp = parseMiniHtml(doc, String(v || ''));
        while (tmp.firstChild) this.appendChild(tmp.firstChild);
      },
      get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
    };
    if (e.attrs.class) String(e.attrs.class).split(/\s+/).forEach((c) => c && e.classList.add(c));
    if (e.attrs.style) e.style = styleObj(e.attrs.style);
    e.getAttribute = (k) => {
      k = k.toLowerCase();
      if (k === 'style') return styleText(e.style) || null;
      return e.attrs[k] != null ? e.attrs[k] : null;
    };
    e.setAttribute = (k, v) => {
      k = k.toLowerCase();
      e.attrs[k] = String(v);
      if (k === 'style') e.style = styleObj(v);
      if (k === 'class') { e.classList._s.clear(); String(v).split(/\s+/).forEach((c) => c && e.classList.add(c)); }
    };
    e.removeAttribute = (k) => { k = k.toLowerCase(); delete e.attrs[k]; if (k === 'style') e.style = {}; };
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
    e.replaceChild = (n, old) => {
      const i = e.childNodes.indexOf(old);
      if (i < 0) return old;
      if (n.parentNode) n.parentNode.removeChild(n);
      e.childNodes.splice(i, 1, n);
      old.parentNode = old.parentElement = old.nextSibling = old.previousSibling = null;
      linkChildren(e);
      return old;
    };
    e.remove = () => { if (e.parentNode) e.parentNode.removeChild(e); };
    e.cloneNode = (deep) => {
      const c = el(e.tagName, Object.assign({}, e.attrs));
      c.style = Object.assign({}, e.style);
      if (deep) e.childNodes.forEach((k) => c.appendChild(k.cloneNode(true)));
      return c;
    };
    e.closest = (sel) => {
      const parts = sel.split(',').map((x) => x.trim());
      for (let n = e; n; n = n.parentNode) {
        for (const p of parts) {
          if (p[0] === '.' && n.classList && n.classList.contains(p.slice(1))) return n;
          if (p[0] !== '.' && n.tagName === p.toUpperCase()) return n;
        }
      }
      return null;
    };
    function matchesSel(n, sel) {
      if (n.nodeType !== 1) return false;
      if (sel === 'span[data-pending-style]') return n.tagName === 'SPAN' && n.hasAttribute('data-pending-style');
      if (sel === '.editor span[data-pending-style]') return n.tagName === 'SPAN' && n.hasAttribute('data-pending-style') && !!n.closest('.editor');
      if (sel === '[data-cont]') return n.hasAttribute('data-cont');
      if (sel === ':scope > [data-cont]') return n.parentNode === e && n.hasAttribute('data-cont');
      if (sel === '.editor') return n.classList.contains('editor');
      if (sel === '.paper') return n.classList.contains('paper');
      if (sel === '.editor font[size="7"]') return n.tagName === 'FONT' && n.getAttribute('size') === '7' && !!n.closest('.editor');
      if (sel.indexOf('[style*="font-size"]') >= 0) return !!n.style.fontSize;
      return n.tagName === sel.toUpperCase();
    }
    e.querySelectorAll = (sel) => {
      const sels = sel.split(',').map((s) => s.trim());
      const out = [];
      const walk = (n) => {
        for (const c of n.childNodes || []) {
          if (c.nodeType === 1) {
            if (sels.some((s) => matchesSel(c, s))) out.push(c);
            walk(c);
          }
        }
      };
      walk(e);
      return out;
    };
    e.querySelector = (sel) => e.querySelectorAll(sel)[0] || null;
    e.contains = (n) => {
      for (let x = n; x; x = x.parentNode) if (x === e) return true;
      return false;
    };
    e.insertAdjacentHTML = (pos, html) => {
      const tmp = parseMiniHtml(doc, String(html || ''));
      while (tmp.firstChild) e.appendChild(tmp.firstChild);
    };
    e.getBoundingClientRect = () => ({ top: 0, bottom: 16, left: 0, right: 0, height: 16, width: 0 });
    e.focus = () => { doc.activeElement = e; };
    e.dispatchEvent = (ev) => {
      ev.target = e;
      ctx._dispatched.push(ev);
      if (ctx._listeners[ev.type]) {
        ctx._listeners[ev.type].forEach((fn) => fn(ev));
      }
    };
    return e;
  }

  function text(v) {
    return {
      nodeType: 3,
      nodeValue: String(v),
      get textContent() { return this.nodeValue; },
      set textContent(x) { this.nodeValue = String(x); },
      isConnected: true,
      parentNode: null,
      parentElement: null,
      nextSibling: null,
      previousSibling: null,
      splitText(off) {
        const rest = text(this.nodeValue.slice(off));
        this.nodeValue = this.nodeValue.slice(0, off);
        if (this.parentNode) this.parentNode.insertBefore(rest, this.nextSibling);
        return rest;
      },
      remove() { if (this.parentNode) this.parentNode.removeChild(this); },
      cloneNode() { return text(this.nodeValue); }
    };
  }

  const body = el('body');
  const workspace = el('div', { id: 'workspace' });
  const pages = el('div', { id: 'pages' });
  const paper = el('div', { class: 'paper' });
  const editor = el('div', { class: 'editor' });
  paper.appendChild(editor);
  pages.appendChild(paper);
  workspace.appendChild(pages);
  body.appendChild(workspace);

  const doc = {
    body,
    activeElement: editor,
    createElement: (t) => el(t),
    createTextNode: (v) => text(v),
    createRange: () => {
      const r = {
        startContainer: null, startOffset: 0,
        endContainer: null, endOffset: 0,
        collapsed: true,
        setStart(n, o) { r.startContainer = n; r.startOffset = o; },
        setEnd(n, o) { r.endContainer = n; r.endOffset = o; r.collapsed = (r.startContainer === n && r.startOffset === o); },
        collapse(toStart) { if (toStart) { r.endContainer = r.startContainer; r.endOffset = r.startOffset; } else { r.startContainer = r.endContainer; r.startOffset = r.endOffset; } r.collapsed = true; },
        selectNodeContents(n) { r.startContainer = n; r.startOffset = 0; r.endContainer = n; r.endOffset = n.childNodes.length; r.collapsed = r.endOffset === 0; },
        selectNode(n) { r.startContainer = n; r.startOffset = 0; r.endContainer = n; r.endOffset = 1; r.collapsed = false; },
        compareBoundaryPoints(how, other) {
          function pathOf(node) {
            const p = [];
            for (let x = node; x && x.parentNode; x = x.parentNode) p.unshift(x.parentNode.childNodes.indexOf(x));
            return p;
          }
          const a = pathOf(r.startContainer), b = pathOf(other.startContainer);
          for (let i = 0; i < Math.min(a.length, b.length); i++) {
            if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
          }
          if (a.length !== b.length) return a.length < b.length ? -1 : 1;
          return r.startOffset === other.startOffset ? 0 : (r.startOffset < other.startOffset ? -1 : 1);
        },
        deleteContents() {},
        getBoundingClientRect() { return { top: 0, bottom: 16, left: 0, right: 0, height: 16, width: 0 }; },
        cloneRange() { const c = doc.createRange(); c.startContainer = r.startContainer; c.startOffset = r.startOffset; c.endContainer = r.endContainer; c.endOffset = r.endOffset; c.collapsed = r.collapsed; return c; }
      };
      return r;
    },
    createTreeWalker(root, what) {
      const list = [];
      const walk = (n) => {
        for (const c of n.childNodes || []) {
          if ((what & 4) && c.nodeType === 3) list.push(c);
          if ((what & 1) && c.nodeType === 1) list.push(c);
          walk(c);
        }
      };
      walk(root);
      let idx = -1;
      return { nextNode() { idx++; return list[idx] || null; } };
    },
    execCommand(cmd, ui, val) {
      ctx._exec.push([cmd, val]);
      if (ctx._onExec) return ctx._onExec(cmd, val);
      return true;
    },
    queryCommandState(cmd) { return !!ctx._cmdState[cmd]; },
    querySelector: (sel) => {
      if (sel === '.editor') return editor;
      return body.querySelector(sel);
    },
    querySelectorAll: (sel) => {
      if (sel === '.tool-btn') return [];
      return body.querySelectorAll(sel);
    },
    getElementById: (id) => ctx._byId[id] || (id === 'workspace' ? workspace : (id === 'pages' ? pages : null)),
    addEventListener(type, fn) {
      if (!ctx._listeners[type]) ctx._listeners[type] = [];
      ctx._listeners[type].push(fn);
    }
  };
  workspace.addEventListener = (type, fn) => doc.addEventListener('ws:' + type, fn);
  return { doc, el, text, editor, paper, workspace };
}

function loadWriter(opts) {
  opts = opts || {};
  const ctx = {
    console,
    NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 },
    Range: { START_TO_START: 0 },
    InputEvent: function InputEvent(type, init) {
      this.type = type;
      this.bubbles = !!(init && init.bubbles);
      this.inputType = (init && init.inputType) || '';
      this.isComposing = !!(init && init.isComposing);
    },
    setTimeout: (fn) => 0,
    clearTimeout: () => {},
    _exec: [],
    _dispatched: [],
    _listeners: {},
    _cmdState: {},
    _byId: {},
    _sel: null,
    Blob
  };
  const dom = makeDoc(ctx);
  ctx.document = dom.doc;
  ctx.DOMParser = function () {
    return {
      parseFromString(html) {
        const b = dom.el('body');
        b.innerHTML = String(html || '').replace(/^<!DOCTYPE[^>]*>/i, '');
        return { body: b };
      }
    };
  };
  ctx.el = dom.el;
  ctx.text = dom.text;
  ctx.editor = dom.editor;
  ctx.window = {};
  ctx.window.getSelection = () => ctx._sel;
  ctx.window.getComputedStyle = (n) => n.style || {};
  ctx.getComputedStyle = ctx.window.getComputedStyle;
  ctx.window.addEventListener = () => {};
  ctx.window.Writer = {
    config: {
      editorClass: 'editor',
      markClass: 'np-mark',
      fontCommandName: 'Times New Roman',
      fontSizePt: 12,
      lineHeight: 1.6,
      paragraphSpacingPt: 6,
      paginationSlackPx: 2,
      paginationAfterInsertMs: 0,
      inputDebounceMs: 800,
      defaultHtml: '<p><br></p>'
    },
    app: { ready: true }
  };
  vm.createContext(ctx);
  vm.runInContext(read('modules/writer-editor.js'), ctx, { filename: 'writer-editor.js' });
  if (opts.flow) {
    vm.runInContext(read('modules/writer-flow-blocks.js'), ctx, { filename: 'writer-flow-blocks.js' });
    vm.runInContext(read('modules/writer-flow.js'), ctx, { filename: 'writer-flow.js' });
    ctx.window.Writer.pages = {
      combinedHtml: () => ctx.window.Writer.flow.joinedHtml(),
      firstEditor: () => dom.editor,
      rebuildSinglePage: () => {},
      layoutAll: () => {},
      updatePageNumbers: () => {}
    };
  }
  if (opts.indent) vm.runInContext(read('modules/writer-indent.js'), ctx, { filename: 'writer-indent.js' });
  if (opts.ui) vm.runInContext(read('modules/writer-ui.js'), ctx, { filename: 'writer-ui.js' });
  if (opts.history) vm.runInContext(read('modules/writer-history.js'), ctx, { filename: 'writer-history.js' });
  if (opts.export) vm.runInContext(read('modules/writer-export.js'), ctx, { filename: 'writer-export.js' });
  if (opts.bind) ctx.window.Writer.editor.bind();
  return ctx;
}

function setSelection(ctx, startNode, startOffset, endNode, endOffset) {
  const r = ctx.document.createRange();
  r.setStart(startNode, startOffset);
  if (endNode != null) r.setEnd(endNode, endOffset);
  else r.collapse(true);
  ctx._sel = {
    rangeCount: 1,
    anchorNode: r.startContainer,
    anchorOffset: r.startOffset,
    focusNode: r.endContainer,
    focusOffset: r.endOffset,
    isCollapsed: r.collapsed,
    _range: r,
    getRangeAt() { return this._range; },
    removeAllRanges() { this._range = null; this.rangeCount = 0; },
    addRange(nr) {
      this._range = nr;
      this.rangeCount = 1;
      this.anchorNode = nr.startContainer;
      this.anchorOffset = nr.startOffset;
      this.focusNode = nr.endContainer;
      this.focusOffset = nr.endOffset;
      this.isCollapsed = nr.collapsed;
    },
    collapse(n, o) {
      const nr = ctx.document.createRange();
      nr.setStart(n, o);
      nr.collapse(true);
      this.addRange(nr);
    }
  };
  return r;
}

function fire(ctx, type, extra) {
  const ev = Object.assign({ type, target: ctx.editor, preventDefault() {} }, extra || {});
  (ctx._listeners[type] || []).forEach((fn) => fn(ev));
  return ev;
}

test('caret-only applyFontSize(18) after ABC inserts ZWSP pending span, strips ZWSP on typing DEF', () => {
  const ctx = loadWriter({ bind: true });
  const W = ctx.window.Writer;
  const p = ctx.el('p');
  const t = ctx.text('ABC');
  p.appendChild(t);
  ctx.editor.appendChild(p);
  W.editor.activeEditor = ctx.editor;
  setSelection(ctx, t, 3);

  W.editor.applyFontSize(18);
  assert.equal(ctx._exec.length, 0, 'collapsed caret must not call execCommand fontSize');
  const pend = p.querySelector('span[data-pending-style]');
  assert.ok(pend, 'pending span created');
  assert.equal(pend.style.fontSize, '18pt');
  assert.equal(pend.firstChild.nodeValue, '\u200B');
  assert.equal(ctx._sel.anchorNode, pend.firstChild);
  assert.equal(ctx._sel.anchorOffset, 1);

  // User types 'DEF' into that text node (simulating browser insertText)
  pend.firstChild.nodeValue = '\u200BDEF';
  setSelection(ctx, pend.firstChild, 4);
  fire(ctx, 'input', { inputType: 'insertText', isComposing: false });

  assert.equal(p.querySelector('span[data-pending-style]'), null, 'pending attribute stripped');
  assert.equal(pend.firstChild.nodeValue, 'DEF');
  assert.equal(pend.style.fontSize, '18pt');
  assert.equal(ctx._sel.anchorNode, pend.firstChild);
  assert.equal(ctx._sel.anchorOffset, 3, 'caret offset adjusted past stripped ZWSP');
  assert.equal(p.innerHTML, 'ABC<span style="font-size:18pt">DEF</span>');
});

test('caret-only setFontFamily and combined size + family + B/I/U reuse one pending span', () => {
  const ctx = loadWriter({ ui: true, bind: true });
  const W = ctx.window.Writer;
  const boldBtn = ctx.el('button', { id: 'boldBtn' });
  ctx._byId.boldBtn = boldBtn;
  const p = ctx.el('p');
  const t = ctx.text('ABC');
  p.appendChild(t);
  ctx.editor.appendChild(p);
  W.editor.activeEditor = ctx.editor;
  setSelection(ctx, t, 3);

  W.editor.applyFontSize(18);
  W.editor.applyFontSize(24);
  W.editor.setFontFamily('Tinos');
  W.editor.execCmd('bold');
  W.editor.execCmd('italic');
  W.editor.execCmd('underline');

  const spans = p.querySelectorAll('span[data-pending-style]');
  assert.equal(spans.length, 1, 'must update single pending span, not nest');
  assert.equal(spans[0].style.fontSize, '24pt');
  assert.equal(spans[0].style.fontFamily, 'Tinos');
  assert.equal(spans[0].style.fontWeight, 'bold');
  assert.equal(spans[0].style.fontStyle, 'italic');
  assert.equal(spans[0].style.textDecoration, 'underline');
  assert.equal(boldBtn.classList.contains('active'), true);

  // Toggle bold off before typing
  W.editor.execCmd('bold');
  assert.equal(spans[0].style.fontWeight || '', '');
  assert.equal(boldBtn.classList.contains('active'), false);
});

test('IME composition keeps ZWSP until compositionend, then strips it cleanly', () => {
  const ctx = loadWriter({ bind: true });
  const W = ctx.window.Writer;
  const p = ctx.el('p');
  p.appendChild(ctx.el('br'));
  ctx.editor.appendChild(p);
  W.editor.activeEditor = ctx.editor;
  setSelection(ctx, p, 0);

  W.editor.applyFontSize(18);
  const pend = p.querySelector('span[data-pending-style]');
  assert.ok(pend);

  fire(ctx, 'compositionstart');
  pend.firstChild.nodeValue = '\u200Bあ';
  setSelection(ctx, pend.firstChild, 2);
  fire(ctx, 'input', { inputType: 'insertCompositionText', isComposing: true });

  // Mid-composition: must NOT strip yet
  assert.equal(pend.hasAttribute('data-pending-style'), true);
  assert.equal(pend.firstChild.nodeValue, '\u200Bあ');

  fire(ctx, 'compositionend');
  assert.equal(pend.hasAttribute('data-pending-style'), false);
  assert.equal(pend.firstChild.nodeValue, 'あ');
  assert.equal(ctx._sel.anchorOffset, 1);
});

test('leaving pending span (selectionchange, ArrowLeft, Backspace) removes untyped span', () => {
  const ctx = loadWriter({ bind: true });
  const W = ctx.window.Writer;
  const p = ctx.el('p');
  const t = ctx.text('ABC');
  p.appendChild(t);
  ctx.editor.appendChild(p);
  W.editor.activeEditor = ctx.editor;
  setSelection(ctx, t, 3);

  // 1. selectionchange moves caret away -> removes empty pending span
  W.editor.applyFontSize(18);
  assert.ok(p.querySelector('span[data-pending-style]'));
  setSelection(ctx, t, 1);
  fire(ctx, 'selectionchange');
  assert.equal(p.querySelector('span[data-pending-style]'), null);
  assert.equal(p.innerHTML, 'ABC');

  // 2. ArrowLeft inside pending span detaches it cleanly
  setSelection(ctx, t, 3);
  W.editor.applyFontSize(18);
  assert.ok(p.querySelector('span[data-pending-style]'));
  fire(ctx, 'keydown', { key: 'ArrowLeft' });
  assert.equal(p.querySelector('span[data-pending-style]'), null);
  assert.equal(ctx._sel.anchorNode, t);
  assert.equal(ctx._sel.anchorOffset, 3);

  // 3. Backspace (deleteContentBackward) detaches it cleanly
  W.editor.applyFontSize(18);
  assert.ok(p.querySelector('span[data-pending-style]'));
  fire(ctx, 'beforeinput', { inputType: 'deleteContentBackward', isComposing: false });
  assert.equal(p.querySelector('span[data-pending-style]'), null);
  assert.equal(ctx._sel.anchorNode, t);
  assert.equal(ctx._sel.anchorOffset, 3);
});

test('40ms reflow (normalize + saveCaret + restoreCaret) keeps caret inside 18pt pending span', () => {
  const ctx = loadWriter({ flow: true, bind: true });
  const W = ctx.window.Writer;
  const p = ctx.el('p');
  const t = ctx.text('ABC');
  p.appendChild(t);
  ctx.editor.appendChild(p);
  W.editor.activeEditor = ctx.editor;
  setSelection(ctx, t, 3);

  W.editor.applyFontSize(18);
  const pend = p.querySelector('span[data-pending-style]');
  const tn = pend.firstChild;

  // Simulate 40ms pagination reflow
  W.flow.saveCaret();
  W.flow.normalize(ctx.editor);
  W.flow.restoreCaret();

  assert.equal(p.querySelector('span[data-pending-style]'), pend);
  assert.equal(ctx._sel.anchorNode, tn);
  assert.equal(ctx._sel.anchorOffset, 1);
});

test('Undo removes pending span as one step; abandoned pending span pops redundant history entry', () => {
  const ctx = loadWriter({ flow: true, history: true, bind: true });
  const W = ctx.window.Writer;
  const p = ctx.el('p');
  const t = ctx.text('ABC');
  p.appendChild(t);
  ctx.editor.appendChild(p);
  W.editor.activeEditor = ctx.editor;
  setSelection(ctx, t, 3);
  W.history.reset();
  assert.equal(W.history.undoStack.length, 0);

  // 1. Set 18pt -> pushes <p>ABC</p>, undo restores <p>ABC</p> in 1 step
  W.editor.applyFontSize(18);
  assert.equal(W.history.undoStack.length, 1);
  assert.ok(ctx.editor.querySelector('span[data-pending-style]'));
  assert.equal(W.history.undo(), true);
  assert.equal(ctx.editor.innerHTML, '<p>ABC</p>');
  assert.equal(W.history.undoStack.length, 0);

  // 2. Set 18pt, then move caret away without typing -> redundant step removed
  setSelection(ctx, ctx.editor.firstChild.firstChild, 3);
  W.editor.applyFontSize(18);
  assert.equal(W.history.undoStack.length, 1);
  setSelection(ctx, ctx.editor.firstChild.firstChild, 1);
  fire(ctx, 'selectionchange');
  assert.equal(ctx.editor.innerHTML, '<p>ABC</p>');
  assert.equal(W.history.undoStack.length, 0);
});

test('selected-text applyFontSize and setFontFamily still use execCommand path', () => {
  const ctx = loadWriter({ bind: true });
  const W = ctx.window.Writer;
  const p = ctx.el('p');
  const t = ctx.text('ABC');
  p.appendChild(t);
  ctx.editor.appendChild(p);
  W.editor.activeEditor = ctx.editor;
  setSelection(ctx, t, 0, t, 3);

  ctx._onExec = (cmd, val) => {
    if (cmd === 'fontSize' && val === '7') {
      const f = ctx.el('font', { size: '7' });
      f.appendChild(ctx.text('ABC'));
      p.replaceChild(f, t);
    }
    return true;
  };
  W.editor.applyFontSize(18);
  assert.ok(ctx._exec.some((c) => c[0] === 'fontSize' && c[1] === '7'));
  assert.equal(p.querySelector('span[data-pending-style]'), null);
  assert.equal(p.innerHTML, '<span style="font-size:18pt">ABC</span>');

  const span = p.firstChild;
  setSelection(ctx, span.firstChild, 0, span.firstChild, 3);
  W.editor.setFontFamily('Tinos');
  assert.ok(ctx._exec.some((c) => c[0] === 'fontName' && c[1] === 'Tinos'));
});

test('Enter at end of formatted text carries font size, family, B/I/U, colour and DW23 para style without id or data-cont', () => {
  const ctx = loadWriter({ indent: true, bind: true });
  const W = ctx.window.Writer;
  const p = ctx.el('p', { id: 'p1', 'data-cont': '1' });
  p.style.marginLeft = '2.0cm';
  p.style.textAlign = 'center';
  const span = ctx.el('span');
  span.style.fontSize = '18pt';
  span.style.fontFamily = 'Tinos';
  span.style.fontWeight = 'bold';
  span.style.fontStyle = 'italic';
  span.style.textDecoration = 'underline';
  span.style.color = '#ff0000';
  const t = ctx.text('ABC');
  span.appendChild(t);
  p.appendChild(span);
  ctx.editor.appendChild(p);
  W.editor.activeEditor = ctx.editor;
  setSelection(ctx, t, 3);

  ctx._onExec = (cmd) => {
    if (cmd === 'insertParagraph') {
      const np = ctx.el('p');
      np.appendChild(ctx.el('br'));
      ctx.editor.appendChild(np);
      setSelection(ctx, np, 0);
    }
    return true;
  };

  W.editor.insertParagraph();
  assert.equal(ctx.editor.childNodes.length, 2);
  const np = ctx.editor.lastChild;
  assert.equal(np.getAttribute('id'), null);
  assert.equal(np.getAttribute('data-cont'), null);
  assert.equal(np.style.marginLeft, '2.0cm');
  assert.equal(np.style.textAlign, 'center');
  const pend = np.querySelector('span[data-pending-style]');
  assert.ok(pend, 'new block gets pending span');
  assert.equal(pend.style.fontSize, '18pt');
  assert.equal(pend.style.fontFamily, 'Tinos');
  assert.equal(pend.style.fontWeight, 'bold');
  assert.equal(pend.style.fontStyle, 'italic');
  assert.equal(pend.style.textDecoration, 'underline');
  assert.equal(pend.style.color, '#ff0000');
  assert.equal(pend.firstChild.nodeValue, '\u200B');
  assert.equal(ctx._sel.anchorNode, pend.firstChild);
  assert.equal(ctx._sel.anchorOffset, 1);

  // Typing on line 2 strips ZWSP and keeps 18pt
  pend.firstChild.nodeValue = '\u200BDEF';
  setSelection(ctx, pend.firstChild, 4);
  fire(ctx, 'input', { inputType: 'insertText', isComposing: false });
  assert.equal(pend.hasAttribute('data-pending-style'), false);
  assert.equal(pend.firstChild.nodeValue, 'DEF');
});

test('Enter from an untyped pending span detaches line 1 ZWSP and carries style to line 2; plain Enter adds no pending span', () => {
  const ctx = loadWriter({ indent: true, bind: true });
  const W = ctx.window.Writer;
  const p = ctx.el('p');
  const t = ctx.text('ABC');
  p.appendChild(t);
  ctx.editor.appendChild(p);
  W.editor.activeEditor = ctx.editor;
  setSelection(ctx, t, 3);
  W.editor.applyFontSize(18);
  assert.ok(p.querySelector('span[data-pending-style]'));

  ctx._onExec = (cmd) => {
    if (cmd === 'insertParagraph') {
      const np = ctx.el('p');
      np.appendChild(ctx.el('br'));
      ctx.editor.appendChild(np);
      setSelection(ctx, np, 0);
    }
    return true;
  };
  W.editor.insertParagraph();

  assert.equal(p.querySelector('span[data-pending-style]'), null, 'line 1 ZWSP span removed');
  assert.equal(p.innerHTML, 'ABC');
  const p2 = ctx.editor.lastChild;
  const pend2 = p2.querySelector('span[data-pending-style]');
  assert.ok(pend2);
  assert.equal(pend2.style.fontSize, '18pt');

  // Plain text paragraph -> Enter must NOT add pending span
  const pPlain = ctx.el('p');
  const pt = ctx.text('Plain');
  pPlain.appendChild(pt);
  ctx.editor.appendChild(pPlain);
  setSelection(ctx, pt, 5);
  W.editor.insertParagraph();
  const p3 = ctx.editor.lastChild;
  assert.equal(p3.querySelector('span[data-pending-style]'), null);
});

test('Shift+Enter at end of formatted text carries font size, family, B/I/U and colour after <br> in same <p>', () => {
  const ctx = loadWriter({ bind: true });
  const W = ctx.window.Writer;
  const p = ctx.el('p');
  p.style.textAlign = 'center';
  const b = ctx.el('b');
  const span = ctx.el('span');
  span.style.fontSize = '18pt';
  span.style.fontFamily = 'Tinos';
  span.style.color = '#0070c0';
  const t = ctx.text('Line1');
  span.appendChild(t);
  b.appendChild(span);
  p.appendChild(b);
  ctx.editor.appendChild(p);
  W.editor.activeEditor = ctx.editor;
  setSelection(ctx, t, 5);

  W.editor.insertLineBreak();
  assert.equal(ctx.editor.childNodes.length, 1, 'stays in one <p>');
  const brs = p.querySelectorAll('br');
  assert.equal(brs.length, 2, 'line break + trailing placeholder <br>');
  const pend = p.querySelector('span[data-pending-style]');
  assert.ok(pend, 'pending span inserted after <br>');
  assert.equal(pend.previousSibling.tagName, 'BR');
  assert.equal(pend.nextSibling.tagName, 'BR');
  assert.equal(pend.style.fontSize, '18pt');
  assert.equal(pend.style.fontFamily, 'Tinos');
  assert.equal(pend.style.fontWeight, 'bold');
  assert.equal(pend.style.color, '#0070c0');
  assert.equal(ctx._sel.anchorNode, pend.firstChild);
  assert.equal(ctx._sel.anchorOffset, 1);

  // Align still keeps all lines in the single <p> (DW24)
  W.editor.setAlign('right');
  assert.equal(ctx.editor.childNodes.length, 1);
  assert.equal(p.style.textAlign, 'right');
});

function unzipStrings(buf) {
  const out = {};
  let i = 0;
  while (i + 30 < buf.length) {
    if (buf.readUInt32LE(i) !== 0x04034b50) break;
    const method = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nameLen).toString('utf8');
    const dataStart = i + 30 + nameLen + extraLen;
    const raw = buf.slice(dataStart, dataStart + compSize);
    out[name] = method === 8 ? zlib.inflateRawSync(raw).toString('utf8') : raw.toString('utf8');
    i = dataStart + compSize;
  }
  return out;
}

test('save and export (combinedHtml, DOCX, ODT) strip ZWSP and empty pending spans', async () => {
  const ctx = loadWriter({ flow: true, export: true, bind: true });
  const W = ctx.window.Writer;
  const p = ctx.el('p');
  const t = ctx.text('ABC');
  p.appendChild(t);
  ctx.editor.appendChild(p);
  W.editor.activeEditor = ctx.editor;
  setSelection(ctx, t, 3);
  W.editor.applyFontSize(18);

  // Live DOM still has pending span for typing
  assert.ok(ctx.editor.querySelector('span[data-pending-style]'));
  // Export combinedHtml strips it
  assert.equal(W.export.combinedHtml(), '<p>ABC</p>');

  // stripPending strips empty pending spans, keeps real spans without attr, removes stray ZWSP
  const box = ctx.el('div');
  box.innerHTML = '<p>A<span data-pending-style="1" style="font-size:18pt">\u200B</span></p>' +
                  '<p><span data-pending-style="1" style="font-size:18pt">\u200BDEF</span></p>' +
                  '<p><span data-pending-style="1" style="font-size:18pt">\u200B</span></p>';
  W.editor.stripPending(box);
  assert.equal(box.innerHTML, '<p>A</p><p><span style="font-size:18pt">DEF</span></p><p><br></p>');

  // Direct docxgen & odtgen strip ZWSP in text nodes
  ctx.TextEncoder = TextEncoder; ctx.TextDecoder = TextDecoder;
  vm.runInContext(read('modules/writer-zip.js'), ctx, { filename: 'writer-zip.js' });
  vm.runInContext(read('modules/writer-docxgen.js'), ctx, { filename: 'writer-docxgen.js' });
  vm.runInContext(read('modules/writer-odtgen.js'), ctx, { filename: 'writer-odtgen.js' });
  const docxBlob = W.docxgen.build('<p>Hello\u200BWorld<span style="font-size:18pt">Big</span></p>', { pageW: 11906, pageH: 16838, margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, defaults: { font: 'Times New Roman', sizePt: 12, lineHeight: 1.6, paraAfterPt: 6 } });
  const odtBlob = W.odtgen.build('<p>Hello\u200BWorld<span style="font-size:18pt">Big</span></p>', { pageWidthCm: 21, pageHeightCm: 29.7, margins: { top: 2, right: 2, bottom: 2, left: 2 }, defaults: { font: 'Times New Roman', sizePt: 12, lineHeight: 1.6, paraAfterPt: 6 } });
  const docxFiles = unzipStrings(Buffer.from(await docxBlob.arrayBuffer()));
  const odtFiles = unzipStrings(Buffer.from(await odtBlob.arrayBuffer()));
  assert.ok(docxFiles['word/document.xml'].includes('HelloWorld'));
  assert.equal(docxFiles['word/document.xml'].includes('\u200B'), false);
  assert.ok(odtFiles['content.xml'].includes('HelloWorld'));
  assert.equal(odtFiles['content.xml'].includes('\u200B'), false);
});

test('source & version: DW25 in config, writer.html, readme; format.js restores selection; save/pdf strip pending', () => {
  const html = read('writer.html');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  /* (before DW26) assert.ok(/<title>Writer DW25<\/title>/.test(live)); */
  assert.ok(/<title>Writer DW(25|26)<\/title>/.test(live));
  assert.ok(html.indexOf('<!-- (before DW25) <title>Writer DW24</title> -->') !== -1);
  const cfg = read('modules/writer-config.js');
  /* (before DW26) assert.ok(/release:\s*'DW25'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  assert.ok(/release:\s*'DW(25|26)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(cfg.indexOf("/* (before DW25) release: 'DW24', */") !== -1);
  assert.ok(read('writer_readme.md').indexOf('## DW25') !== -1);
  const fmt = read('modules/writer-format.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/fontFamilySelect[\s\S]*restoreSelection\(\)[\s\S]*setFontFamily/.test(fmt));
  assert.ok(/fontSizeSelect[\s\S]*restoreSelection\(\)[\s\S]*applyFontSize/.test(fmt));
  assert.ok(read('modules/writer-storage.js').includes('stripPending'));
  assert.ok(read('modules/writer-how.js').includes('stripPending'));
  assert.ok(read('modules/writer-export.js').includes('stripPending'));
  assert.ok(read('modules/writer-pdfgen.js').includes('stripPending'));
});
