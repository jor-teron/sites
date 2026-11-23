/* DW22: paste from Word no longer adds a blank line after each line.
   Pure checks (no browser): Writer.paste.sanitize on Word / WordSection /
   LibreOffice / Word Online / Google Docs clipboard HTML, spaces kept
   inside a paragraph, empty mid-paste paragraphs kept, and
   Writer.editor.plainText CRLF normalisation.
   Run: node --test apps/office/writer/test/test-dw22-paste.cjs */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(DIR, rel), 'utf8');

/* ------------------------------------------------------------------ */
/* A small HTML DOM, enough to run Writer.paste.sanitize in node.      */
/* STYLE/SCRIPT are raw text (Word clipboard CSS has <!-- ... -->).    */
/* ------------------------------------------------------------------ */
const VOID = /^(AREA|BASE|BR|COL|EMBED|HR|IMG|INPUT|LINK|META|PARAM|SOURCE|TRACK|WBR)$/;
const RAW = /^(STYLE|SCRIPT)$/;

function decode(s) {
  return String(s)
    .replace(/&nbsp;|&#160;|&#xA0;/gi, '\u00a0')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function encode(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function camel(k) {
  return k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
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

function styleCss(st) {
  return Object.keys(st).map((k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ':' + st[k]).join(';');
}

function makeNode(doc, type, name) {
  const n = {
    nodeType: type,
    nodeName: name,
    tagName: type === 1 ? name : undefined,
    childNodes: [],
    parentNode: null,
    attrs: {},
    style: {},
    get firstChild() { return this.childNodes[0] || null; },
    get lastChild() { return this.childNodes.length ? this.childNodes[this.childNodes.length - 1] : null; },
    get previousSibling() {
      if (!this.parentNode) return null;
      const i = this.parentNode.childNodes.indexOf(this);
      return i > 0 ? this.parentNode.childNodes[i - 1] : null;
    },
    get nextSibling() {
      if (!this.parentNode) return null;
      const i = this.parentNode.childNodes.indexOf(this);
      return i >= 0 ? this.parentNode.childNodes[i + 1] || null : null;
    },
    get children() { return this.childNodes.filter((c) => c.nodeType === 1); },
    get firstElementChild() { return this.children[0] || null; },
    get lastElementChild() { return this.children.length ? this.children[this.children.length - 1] : null; },
    get previousElementSibling() {
      let s = this.previousSibling;
      while (s && s.nodeType !== 1) s = s.previousSibling;
      return s;
    },
    get nextElementSibling() {
      let s = this.nextSibling;
      while (s && s.nodeType !== 1) s = s.nextSibling;
      return s;
    },
    get textContent() {
      if (this.nodeType === 3 || this.nodeType === 8) return this.nodeValue;
      return this.childNodes.map((c) => c.textContent).join('');
    },
    set textContent(v) {
      this.childNodes.forEach((c) => { c.parentNode = null; });
      this.childNodes = [];
      if (v) this.appendChild(doc.createTextNode(v));
    },
    get innerHTML() { return this.childNodes.map((c) => serialize(c)).join(''); },
    set innerHTML(v) {
      this.childNodes.forEach((c) => { c.parentNode = null; });
      this.childNodes = [];
      const tmp = parseHtml(doc, String(v || ''), true);
      while (tmp.firstChild) this.appendChild(tmp.firstChild);
    },
    get className() { return this.getAttribute('class') || ''; },
    set className(v) { this.setAttribute('class', v); },
    getAttribute(k) { k = k.toLowerCase(); return this.attrs[k] == null ? null : this.attrs[k]; },
    hasAttribute(k) { return this.attrs[k.toLowerCase()] != null; },
    setAttribute(k, v) {
      k = k.toLowerCase();
      this.attrs[k] = String(v);
      if (k === 'style') this.style = styleObj(v);
    },
    removeAttribute(k) {
      k = k.toLowerCase();
      delete this.attrs[k];
      if (k === 'style') this.style = {};
    },
    appendChild(c) {
      if (c.nodeType === 11) { while (c.firstChild) this.appendChild(c.firstChild); return c; }
      if (c.parentNode) c.parentNode.removeChild(c);
      c.parentNode = this;
      this.childNodes.push(c);
      return c;
    },
    insertBefore(c, ref) {
      if (c.nodeType === 11) {
        while (c.firstChild) this.insertBefore(c.firstChild, ref);
        return c;
      }
      if (c.parentNode) c.parentNode.removeChild(c);
      c.parentNode = this;
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      if (i < 0) this.childNodes.push(c);
      else this.childNodes.splice(i, 0, c);
      return c;
    },
    removeChild(c) {
      const i = this.childNodes.indexOf(c);
      if (i < 0) throw new Error('not a child');
      this.childNodes.splice(i, 1);
      c.parentNode = null;
      return c;
    },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) { return qsa(this, sel); },
    closest(sel) {
      let el = this.nodeType === 1 ? this : this.parentNode;
      while (el && el.nodeType === 1) {
        if (matches(el, sel)) return el;
        el = el.parentNode;
      }
      return null;
    },
    get attributes() {
      return Object.keys(this.attrs).map((name) => ({ name, value: this.attrs[name] }));
    }
  };
  return n;
}

function matches(el, sel) {
  sel = String(sel || '').trim();
  if (sel === '*') return el.nodeType === 1;
  if (sel.includes(',')) return sel.split(',').some((s) => matches(el, s.trim()));
  const attr = /^\[([^\]]+)\]$/.exec(sel);
  if (attr) return el.hasAttribute(attr[1]);
  if (sel.startsWith('.')) return (' ' + (el.getAttribute('class') || '') + ' ').indexOf(' ' + sel.slice(1) + ' ') >= 0;
  if (sel.startsWith('#')) return el.getAttribute('id') === sel.slice(1);
  return el.tagName === sel.toUpperCase();
}

function qsa(root, sel) {
  const out = [];
  (function walk(n) {
    if (n !== root && n.nodeType === 1 && matches(n, sel)) out.push(n);
    n.childNodes && n.childNodes.forEach(walk);
  })(root);
  return out;
}

function serialize(n) {
  if (n.nodeType === 3) return encode(n.nodeValue);
  if (n.nodeType === 8) return '<!--' + n.nodeValue + '-->';
  if (n.nodeType === 11) return n.childNodes.map(serialize).join('');
  const tag = n.tagName.toLowerCase();
  let a = '';
  Object.keys(n.attrs).forEach((k) => {
    if (k === 'style') {
      const css = n.attrs.style || styleCss(n.style);
      if (css) a += ' style="' + css + '"';
      return;
    }
    a += ' ' + k + '="' + String(n.attrs[k]).replace(/"/g, '&quot;') + '"';
  });
  if (VOID.test(n.tagName)) return '<' + tag + a + '>';
  return '<' + tag + a + '>' + n.childNodes.map(serialize).join('') + '</' + tag + '>';
}

function parseAttrs(s, el) {
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(s))) {
    const k = m[1];
    if (k === '/') continue;
    el.setAttribute(k, m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : '');
  }
}

function parseHtml(doc, html, asFragment) {
  const root = asFragment ? doc.createDocumentFragment() : doc.createElement('HTML');
  if (!asFragment) {
    doc.documentElement = root;
    root.parentNode = doc;
  }
  let cur = root;
  let i = 0;
  html = String(html || '');
  function open(name, attrStr, selfClose) {
    const el = doc.createElement(name);
    parseAttrs(attrStr || '', el);
    cur.appendChild(el);
    if (!selfClose && !VOID.test(el.tagName)) cur = el;
    return el;
  }
  function close(name) {
    name = name.toUpperCase();
    let n = cur;
    while (n && n.nodeType === 1 && n !== root) {
      if (n.tagName === name) { cur = n.parentNode || root; return; }
      n = n.parentNode;
    }
  }
  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      const body = end < 0 ? html.slice(i + 4) : html.slice(i + 4, end);
      const c = makeNode(doc, 8, '#comment');
      c.nodeValue = body;
      cur.appendChild(c);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!DOCTYPE', i) || html.startsWith('<!doctype', i)) {
      const end = html.indexOf('>', i);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    const tag = /^<\/([A-Za-z][\w:.-]*)\s*>/.exec(html.slice(i));
    if (tag) { close(tag[1]); i += tag[0].length; continue; }
    const start = /^<([A-Za-z][\w:.-]*)([^>]*)>/.exec(html.slice(i));
    if (start) {
      const name = start[1];
      const rawAttr = start[2] || '';
      const self = /\/\s*$/.test(rawAttr);
      const el = open(name, rawAttr.replace(/\/\s*$/, ''), self || VOID.test(name.toUpperCase()));
      i += start[0].length;
      if (RAW.test(el.tagName)) {
        const re = new RegExp('</' + name + '\\s*>', 'i');
        const rest = html.slice(i);
        const m = re.exec(rest);
        const text = m ? rest.slice(0, m.index) : rest;
        if (text) el.appendChild(doc.createTextNode(text));
        i = m ? i + m.index + m[0].length : html.length;
        cur = el.parentNode || root;
      }
      continue;
    }
    const next = html.indexOf('<', i + 1);
    const text = next < 0 ? html.slice(i) : html.slice(i, next);
    if (text) cur.appendChild(doc.createTextNode(decode(text)));
    i = next < 0 ? html.length : next;
  }
  if (asFragment) return root;
  /* Put stray content into body, like a browser. */
  let body = qsa(root, 'body')[0];
  let head = qsa(root, 'head')[0];
  if (!head) { head = doc.createElement('HEAD'); root.insertBefore(head, root.firstChild); }
  if (!body) {
    body = doc.createElement('BODY');
    root.appendChild(body);
    const move = root.childNodes.slice();
    move.forEach((c) => {
      if (c === head || c === body || (c.nodeType === 1 && c.tagName === 'HTML')) return;
      if (c.nodeType === 1 && /^(HEAD|BODY)$/.test(c.tagName)) return;
      body.appendChild(c);
    });
  }
  doc.body = body;
  return root;
}

function createDocument() {
  const doc = {
    nodeType: 9,
    nodeName: '#document',
    childNodes: [],
    createElement(name) {
      const el = makeNode(doc, 1, String(name).toUpperCase());
      return el;
    },
    createTextNode(s) {
      const t = makeNode(doc, 3, '#text');
      t.nodeValue = String(s);
      return t;
    },
    createDocumentFragment() { return makeNode(doc, 11, '#document-fragment'); },
    createComment(s) {
      const c = makeNode(doc, 8, '#comment');
      c.nodeValue = String(s);
      return c;
    },
    querySelector(sel) { return this.documentElement ? this.documentElement.querySelector(sel) : null; },
    querySelectorAll(sel) { return this.documentElement ? this.documentElement.querySelectorAll(sel) : []; },
    implementation: {
      createHTMLDocument() { return createDocument(); }
    }
  };
  doc.createElementNS = (ns, name) => doc.createElement(name);
  return doc;
}

function loadPaste() {
  const document = createDocument();
  parseHtml(document, '<!doctype html><html><head></head><body></body></html>', false);
  document.addEventListener = function () {};
  document.removeEventListener = function () {};
  document.getElementById = function () { return null; };
  document.querySelector = function (sel) { return document.documentElement ? document.documentElement.querySelector(sel) : null; };
  document.querySelectorAll = function (sel) { return document.documentElement ? document.documentElement.querySelectorAll(sel) : []; };
  function DOMParser() {}
  DOMParser.prototype.parseFromString = function (html) {
    const d = createDocument();
    parseHtml(d, html, false);
    return d;
  };
  const ctx = {
    console,
    window: { getSelection() { return null; } },
    document,
    DOMParser,
    Writer: { table: { TBL: 'border-collapse:collapse;width:100%;', TD: 'border:1px solid #000;' } }
  };
  ctx.window.Writer = ctx.Writer;
  ctx.window.document = document;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('modules/writer-paste.js'), ctx, { filename: 'writer-paste.js' });
  vm.runInContext(read('modules/writer-editor.js'), ctx, { filename: 'writer-editor.js' });
  return ctx.window.Writer;
}

const wordOne = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv=Content-Type content="text/html; charset=utf-8">
<style><!--
p.MsoNormal, li.MsoNormal, div.MsoNormal
	{margin-top:0cm;
	margin-right:0cm;
	margin-bottom:8.0pt;
	margin-left:0cm;
	line-height:107%;
	font-size:11.0pt;
	font-family:"Calibri",sans-serif;}
--></style>
</head>
<body lang=EN-IN style='tab-interval:36.0pt'>
<!--StartFragment-->
<p class=MsoNormal>Hello world<o:p></o:p></p>
<!--EndFragment-->
</body>
</html>`;

const wordTwo = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv=Content-Type content="text/html; charset=utf-8">
<style><!--
p.MsoNormal, li.MsoNormal, div.MsoNormal
	{margin-top:0cm;margin-right:0cm;margin-bottom:8.0pt;margin-left:0cm;
	line-height:107%;font-size:11.0pt;font-family:"Calibri",sans-serif;}
--></style>
</head>
<body lang=EN-US>
<!--StartFragment-->
<p class=MsoNormal>Line 1<o:p></o:p></p>
<p class=MsoNormal>Line 2<o:p></o:p></p>
<!--EndFragment-->
</body>
</html>`;

const wordSection = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns="http://www.w3.org/TR/REC-html40">
<body>
<!--StartFragment-->
<div class=WordSection1>
<p class=MsoNormal>Line 1<o:p></o:p></p>
<p class=MsoNormal>Line 2<o:p></o:p></p>
<p class=MsoNormal>Line 3<o:p></o:p></p>
</div>
<!--EndFragment-->
</body>
</html>`;

const wordOnline = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns="http://www.w3.org/TR/REC-html40">
<body>
<!--StartFragment-->
<p class=MsoNormal>Line 1<br></p>
<p class=MsoNormal>Line 2<br></p>
<!--EndFragment-->
</body>
</html>`;

const wordOneBr = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns="http://www.w3.org/TR/REC-html40">
<body>
<!--StartFragment-->
<p class=MsoNormal>Hello world<br><o:p></o:p></p>
<!--EndFragment-->
</body>
</html>`;

const wordEmptyOp = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns="http://www.w3.org/TR/REC-html40">
<body>
<!--StartFragment-->
<p class=MsoNormal>Line 1<o:p></o:p></p>
<p class=MsoNormal><o:p>&nbsp;</o:p></p>
<p class=MsoNormal>Line 2<o:p></o:p></p>
<p class=MsoNormal><o:p>&nbsp;</o:p></p>
<!--EndFragment-->
</body>
</html>`;

const gdocsTwo = `<html>
<body>
<!--StartFragment-->
<meta charset="utf-8">
<b id="docs-internal-guid-abc123" style="font-weight:normal;">
  <p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial;color:#000000;white-space:pre;white-space:pre-wrap;">Line 1</span></p>
  <p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial;color:#000000;white-space:pre;white-space:pre-wrap;">Line 2</span></p>
</b>
<br class="Apple-interchange-newline">
<!--EndFragment-->
</body>
</html>`;

const gdocsOne = `<html>
<body>
<!--StartFragment-->
<meta charset="utf-8">
<b id="docs-internal-guid-abc123" style="font-weight:normal;">
  <p dir="ltr"><span style="font-size:11pt;font-family:Arial;">Hello world</span></p>
</b>
<br class="Apple-interchange-newline">
<!--EndFragment-->
</body>
</html>`;

const loTwo = `<!DOCTYPE html>
<html>
<head><meta http-equiv="content-type" content="text/html; charset=utf-8"/></head>
<body>
<p style="margin-bottom: 0.25cm; line-height: 115%">Line 1</p>
<p style="margin-bottom: 0.25cm; line-height: 115%">Line 2</p>
</body>
</html>`;

const loBr = `<!DOCTYPE html>
<html>
<body>
<p>Line 1<br></p>
<p>Line 2<br></p>
</body>
</html>`;

function paras(html) {
  return (html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || []).map((p) => p.replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ').trim());
}

function hasInterBlockSpace(html) {
  return /<\/p>\s+<p/.test(html) || /<\/p>\s+<br/i.test(html);
}

test('Word one paragraph stays one paragraph', () => {
  const P = loadPaste().paste;
  const safe = P.sanitize(wordOne, false);
  assert.equal(safe, '<p>Hello world</p>');
});

test('Word two paragraphs: no blank line between them', () => {
  const P = loadPaste().paste;
  const safe = P.sanitize(wordTwo, false);
  assert.equal(safe, '<p>Line 1</p><p>Line 2</p>');
  assert.equal(hasInterBlockSpace(safe), false);
  assert.deepEqual(paras(safe), ['Line 1', 'Line 2']);
});

test('Word WordSection1 three paragraphs: no blank lines between them', () => {
  const P = loadPaste().paste;
  const safe = P.sanitize(wordSection, false);
  assert.equal(safe, '<p>Line 1</p><p>Line 2</p><p>Line 3</p>');
  assert.deepEqual(paras(safe), ['Line 1', 'Line 2', 'Line 3']);
});

test('Word Online trailing <br> inside each paragraph is stripped', () => {
  const P = loadPaste().paste;
  const safe = P.sanitize(wordOnline, false);
  assert.equal(safe, '<p>Line 1</p><p>Line 2</p>');
  assert.equal((safe.match(/<br\b/gi) || []).length, 0);
});

test('Word one line with a trailing <br> stays one line', () => {
  const P = loadPaste().paste;
  assert.equal(P.sanitize(wordOneBr, false), '<p>Hello world</p>');
});

test('Word empty <o:p>&nbsp;</o:p> paragraphs mid-paste are kept', () => {
  const P = loadPaste().paste;
  const safe = P.sanitize(wordEmptyOp, false);
  assert.equal(safe, '<p>Line 1</p><p><br></p><p>Line 2</p><p><br></p>');
});

test('Google Docs two paragraphs: no inter-block space, trailing Apple br dropped', () => {
  const P = loadPaste().paste;
  const safe = P.sanitize(gdocsTwo, false);
  assert.equal(hasInterBlockSpace(safe), false);
  assert.equal((safe.match(/<br\b/gi) || []).length, 0);
  assert.deepEqual(paras(safe), ['Line 1', 'Line 2']);
  assert.match(safe, /^<p><span style="font-size:10pt;">Line 1<\/span><\/p><p><span style="font-size:10pt;">Line 2<\/span><\/p>$/);
});

test('Google Docs one paragraph: trailing Apple-interchange-newline is dropped', () => {
  const P = loadPaste().paste;
  const safe = P.sanitize(gdocsOne, false);
  assert.equal((safe.match(/<br\b/gi) || []).length, 0);
  assert.equal(safe, '<p><span style="font-size:10pt;">Hello world</span></p>');
});

test('LibreOffice two paragraphs: no blank line between them', () => {
  const P = loadPaste().paste;
  assert.equal(P.sanitize(loTwo, false), '<p>Line 1</p><p>Line 2</p>');
});

test('LibreOffice trailing <br> inside each paragraph is stripped', () => {
  const P = loadPaste().paste;
  assert.equal(P.sanitize(loBr, false), '<p>Line 1</p><p>Line 2</p>');
});

test('spaces inside a paragraph are kept; mid-paste empty paragraphs are kept', () => {
  const P = loadPaste().paste;
  assert.equal(P.sanitize('<p>Hello <i>world</i></p>', false), '<p>Hello <i>world</i></p>');
  assert.equal(P.sanitize('<p>Line 1</p>\n<p><br></p>\n<p>Line 2</p>', false), '<p>Line 1</p><p><br></p><p>Line 2</p>');
});

test('plainText: CRLF becomes LF; one trailing newline is a terminator', () => {
  const E = loadPaste().editor;
  assert.equal(E.plainText('Line 1\r\nLine 2\r\n'), 'Line 1\nLine 2');
  assert.equal(E.plainText('Hello world\r\n'), 'Hello world');
  assert.equal(E.plainText('Line 1\r\n\r\nLine 2'), 'Line 1\n\nLine 2');
  assert.equal(E.plainText('Hello\n'), 'Hello');
  assert.equal(E.plainText('Hello'), 'Hello');
  assert.equal(E.plainText('Line 1\nLine 2'), 'Line 1\nLine 2');
  assert.equal(E.plainText('Hello\r'), 'Hello');
});

test('writer.html title is DW22; config release is DW22; old ids are kept as comments', () => {
  const html = read('writer.html');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  /* (before DW23) assert.ok(/<title>Writer DW22<\/title>/.test(live)); */
  /* (before DW24) assert.ok(/<title>Writer DW(22|23)<\/title>/.test(live)); */
  /* (before DW25) assert.ok(/<title>Writer DW(22|23|24)<\/title>/.test(live)); */
  assert.ok(/<title>Writer DW(22|23|24|25)<\/title>/.test(live));
  assert.ok(html.indexOf('<!-- (before DW22) <title>Writer DW19</title> -->') !== -1);
  const cfg = read('modules/writer-config.js');
  /* (before DW23) assert.ok(/release:\s*'DW22'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW24) assert.ok(/release:\s*'DW(22|23)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW25) assert.ok(/release:\s*'DW(22|23|24)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  assert.ok(/release:\s*'DW(22|23|24|25)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(cfg.indexOf("/* (before DW22) release: 'DW19', */") !== -1);
  assert.ok(read('writer_readme.md').indexOf('## DW22') !== -1);
});
