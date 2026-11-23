/* ============================================================
   FILE: modules/writer-indent.js
   DF25: was modules/draftly-indent.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: DF7 Word-style indent markers on the ruler.
         Top triangle (down) = first-line indent, bottom triangle
         (up) = hanging indent, square = left indent (moves both),
         right triangle (up) = right indent. Act on the block(s)
         at the caret / selection as inline margin-left,
         margin-right and text-indent (cm). Snap 0.1 cm, keep
         >= 2 cm of text. Undo via history.checkpoint + input.
         DW17: Word-style SVG shapes that scale with zoom (--rs from
         the ruler), a drag guide line, and I.positions (pure).
         DW23: paraStyle / applyParaStyle / wrapLoose / blockForEnter
         copy indent, spacing and alignment onto a new paragraph after Enter.
   DEPENDS: ruler, config, view, editor, history
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.indent = {};
Writer.indent.BLOCK = /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE)$/;
Writer.indent.drag = null;

/* Blocks touched by the current selection (inside an editor). */
Writer.indent.blocks = function blocks() {
  var I = Writer.indent, sel = window.getSelection();
  if (!sel || !sel.rangeCount) return [];
  var r = sel.getRangeAt(0);
  var host = I.hostOf(r.startContainer);
  if (!host) return [];
  var a = I.blockOf(r.startContainer, host), b = I.blockOf(r.endContainer, host);
  if (!a) return [];
  if (!b || a === b) return [a];
  var out = [], all = host.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre'), on = false;
  for (var i = 0; i < all.length; i++) {
    if (all[i] === a) on = true;
    if (on && !all[i].querySelector('p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre')) out.push(all[i]);
    if (all[i] === b) break;
  }
  return out.length ? out : [a];
};

Writer.indent.hostOf = function hostOf(n) {
  var cls = Writer.config.editorClass || 'editor';
  for (; n; n = n.parentNode) if (n.nodeType === 1 && n.classList.contains(cls)) return n;
  return null;
};

/* Nearest block below the editor; bare text gets wrapped in a <div>. */
Writer.indent.blockOf = function blockOf(n, host) {
  var I = Writer.indent;
  for (var x = n; x && x !== host; x = x.parentNode) {
    if (x.nodeType === 1 && /^(TD|TH)$/.test(x.tagName)) return null;
    if (x.nodeType === 1 && I.BLOCK.test(x.tagName)) return x;
  }
  return null;
};

/* Current values (cm) of a block. */
Writer.indent.read = function read(el) {
  var px = Writer.view.CM_PX, s = getComputedStyle(el);
  var f = function (v) { return Math.round((parseFloat(v) || 0) / px * 10) / 10; };
  return { left: f(s.marginLeft), right: f(s.marginRight), first: f(s.textIndent) };
};

/* (before DW17) Place the four markers for the block at the caret.
Writer.indent.sync = function sync(live) {
  var I = Writer.indent, R = Writer.ruler, cfg = Writer.config;
  var box = R.el('rulerIndent');
  if (!box || !R.on) return;
  var v = live;
  if (!v) { var bl = I.blocks(); if (!bl.length) { box.hidden = true; return; } v = I.read(bl[0]); }
  box.hidden = false;
  var m = R.metrics(), L = cfg.marginLeftCm, Rt = cfg.marginRightCm;
  R.el('indFirst').style.left = (L + v.left + v.first) * m.cm + 'px';
  R.el('indHang').style.left = (L + v.left) * m.cm + 'px';
  R.el('indLeft').style.left = (L + v.left) * m.cm + 'px';
  R.el('indRight').style.left = (m.w - Rt - v.right) * m.cm + 'px';
};
*/

/* DW17: marker x positions (px from the ruler track's left edge). Pure.
   v = { left, right, first } cm; cm = px per cm (zoom included);
   w = paper width cm; L / Rt = page margins cm. */
Writer.indent.positions = function positions(v, cm, w, L, Rt) {
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  return {
    first: r2((L + v.left + v.first) * cm),
    hang: r2((L + v.left) * cm),
    left: r2((L + v.left) * cm),
    right: r2((w - Rt - v.right) * cm)
  };
};

/* DW17: last values placed, so a live margin drag can move the markers too. */
Writer.indent.lastV = null;

/* Place the four markers for the block at the caret.
   DW17: `marg` ({ left, right } cm) overrides the page margins while a
   ruler margin edge is being dragged; positions come from I.positions. */
Writer.indent.sync = function sync(live, marg) {
  var I = Writer.indent, R = Writer.ruler, cfg = Writer.config;
  var box = R.el('rulerIndent');
  if (!box || !R.on) return;
  var v = live;
  if (!v) { var bl = I.blocks(); if (!bl.length) { box.hidden = true; I.lastV = null; return; } v = I.read(bl[0]); }
  I.lastV = v;
  box.hidden = false;
  var m = R.metrics();
  var L = marg ? marg.left : cfg.marginLeftCm, Rt = marg ? marg.right : cfg.marginRightCm;
  var p = I.positions(v, m.cm, m.w, L, Rt);
  R.el('indFirst').style.left = p.first + 'px';
  R.el('indHang').style.left = p.hang + 'px';
  R.el('indLeft').style.left = p.left + 'px';
  R.el('indRight').style.left = p.right + 'px';
};

/* DW17: Word-style marker shapes (inline SVG, accent fill + outline). */
Writer.indent.SHAPES = {
  first: '<svg class="ind-shape" viewBox="0 0 10 7" aria-hidden="true" focusable="false"><path d="M.5 .5h9V3L5 6.5 .5 3z"/></svg>',
  hang: '<svg class="ind-shape" viewBox="0 0 10 7" aria-hidden="true" focusable="false"><path d="M5 .5 9.5 4v2.5h-9V4z"/></svg>',
  left: '<svg class="ind-shape" viewBox="0 0 10 4" aria-hidden="true" focusable="false"><rect x=".5" y=".5" width="9" height="3"/></svg>',
  right: '<svg class="ind-shape" viewBox="0 0 10 7" aria-hidden="true" focusable="false"><path d="M5 .5 9.5 4v2.5h-9V4z"/></svg>'
};

/* DW17: faint vertical guide down the page at the dragged marker. */
Writer.indent.guide = function guide(g) {
  var R = Writer.ruler, line = R.el('indGuide'), track = R.el('rulerTrack');
  if (!line) return;
  if (!g || !track) { line.hidden = true; return; }
  var gr = g.getBoundingClientRect(), tr = track.getBoundingClientRect();
  line.style.left = Math.round(gr.left + gr.width / 2) + 'px';
  line.style.top = Math.round(tr.bottom) + 'px';
  line.hidden = false;
};

Writer.indent.build = function build() {
  var I = Writer.indent, R = Writer.ruler, track = R.el('rulerTrack');
  if (!track || R.el('rulerIndent')) return;
  var d = document.createElement('div');
  d.className = 'ruler-indent'; d.id = 'rulerIndent'; d.hidden = true;
  /* (before DW17) d.innerHTML =
    '<div class="ind-grab ind-first" id="indFirst" data-k="first" title="First-line indent"><i></i></div>' +
    '<div class="ind-grab ind-hang" id="indHang" data-k="hang" title="Hanging indent"><i></i></div>' +
    '<div class="ind-grab ind-left" id="indLeft" data-k="left" title="Left indent"><i></i></div>' +
    '<div class="ind-grab ind-right" id="indRight" data-k="right" title="Right indent"><i></i></div>'; */
  var S = I.SHAPES;
  d.innerHTML =
    '<div class="ind-grab ind-first" id="indFirst" data-k="first" title="First-line indent">' + S.first + '</div>' +
    '<div class="ind-grab ind-hang" id="indHang" data-k="hang" title="Hanging indent">' + S.hang + '</div>' +
    '<div class="ind-grab ind-left" id="indLeft" data-k="left" title="Left indent">' + S.left + '</div>' +
    '<div class="ind-grab ind-right" id="indRight" data-k="right" title="Right indent">' + S.right + '</div>';
  track.appendChild(d);
  /* DW17: drag guide line (fixed, so it spans the visible page). */
  if (!R.el('indGuide')) {
    var gl = document.createElement('div');
    gl.className = 'ind-guide'; gl.id = 'indGuide'; gl.hidden = true;
    gl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(gl);
  }
  d.querySelectorAll('.ind-grab').forEach(function (g) {
    g.addEventListener('mousedown', function (e) { e.preventDefault(); });  // keep the caret
    g.addEventListener('pointerdown', I.start);
  });
};

Writer.indent.start = function start(e) {
  var I = Writer.indent, bl = I.blocks();
  e.preventDefault();
  if (!bl.length) return;
  var g = e.currentTarget;
  try { g.setPointerCapture(e.pointerId); } catch (x) {}
  if (Writer.history) Writer.history.checkpoint();
  var v0 = I.read(bl[0]);
  I.drag = { k: g.getAttribute('data-k'), g: g, x0: e.clientX, bl: bl, v0: v0, cur: Object.assign({}, v0) };
  g.classList.add('dragging');
  g.addEventListener('pointermove', I.move);
  g.addEventListener('pointerup', I.end);
  g.addEventListener('pointercancel', I.end);
  I.guide(g);   // DW17
};

Writer.indent.r1 = function (v) { return Math.round(v * 10) / 10; };

Writer.indent.move = function move(e) {
  var I = Writer.indent, d = I.drag, R = Writer.ruler, cfg = Writer.config;
  if (!d) return;
  var m = R.metrics(), dx = I.r1((e.clientX - d.x0) / m.cm), v0 = d.v0, c = {};
  var text = m.w - cfg.marginLeftCm - cfg.marginRightCm;      // text column, cm
  var maxL = function (right) { return text - right - 2; };   // keep 2 cm of text
  var clamp = function (v, lo, hi) { return I.r1(Math.max(lo, Math.min(hi, v))); };
  c.right = v0.right; c.left = v0.left; c.first = v0.first;
  if (d.k === 'first') {
    c.first = clamp(v0.left + v0.first + dx, 0, maxL(v0.right)) - v0.left;
  } else if (d.k === 'hang') {
    var abs = v0.left + v0.first;                              // first line stays put
    c.left = clamp(v0.left + dx, 0, maxL(v0.right));
    c.first = I.r1(abs - c.left);
  } else if (d.k === 'left') {
    var lo = Math.max(0, -v0.first), hi = Math.min(maxL(v0.right), maxL(v0.right) - v0.first);
    c.left = clamp(v0.left + dx, lo, hi);
  } else {
    c.right = clamp(v0.right - dx, 0, text - 2 - Math.max(v0.left, v0.left + v0.first));
  }
  c.first = I.r1(c.first);
  d.cur = c;
  I.sync(c);
  I.guide(d.g);   // DW17
  var tip = R.el('rulerTip'), label, at;
  if (d.k === 'first') { label = 'First line ' + (c.left + c.first).toFixed(1); at = cfg.marginLeftCm + c.left + c.first; }
  else if (d.k === 'hang') { label = 'Hanging ' + c.left.toFixed(1); at = cfg.marginLeftCm + c.left; }
  else if (d.k === 'left') { label = 'Left ' + c.left.toFixed(1); at = cfg.marginLeftCm + c.left; }
  else { label = 'Right ' + c.right.toFixed(1); at = m.w - cfg.marginRightCm - c.right; }
  tip.hidden = false; tip.textContent = label + ' cm'; tip.style.left = at * m.cm + 'px';
};

/* Write inline styles; 0 clears the property. */
Writer.indent.apply = function apply(el, v) {
  var set = function (p, n) { el.style[p] = n ? n.toFixed(1) + 'cm' : ''; };
  set('marginLeft', v.left); set('marginRight', v.right); set('textIndent', v.first);
  if (!el.getAttribute('style')) el.removeAttribute('style');
};


/* DW23: paragraph format carried across Enter (inline values only).
   Lists are skipped. id and data-cont are never copied. */
Writer.indent.inList = function inList(el) {
  if (!el) return false;
  if (/^(LI|UL|OL)$/.test(el.tagName)) return true;
  var cls = Writer.config && Writer.config.editorClass;
  for (var n = el.parentNode; n && n.nodeType === 1; n = n.parentNode) {
    if (/^(LI|UL|OL)$/.test(n.tagName)) return true;
    if (cls && n.classList && n.classList.contains(cls)) break;
  }
  return false;
};

Writer.indent.paraStyle = function paraStyle(el) {
  if (!el || !el.style || Writer.indent.inList(el)) return null;
  var s = el.style, out = {}, n = 0;
  if (s.marginLeft) { out.marginLeft = s.marginLeft; n++; }
  if (s.marginRight) { out.marginRight = s.marginRight; n++; }
  if (s.textIndent) { out.textIndent = s.textIndent; n++; }
  if (s.lineHeight) { out.lineHeight = s.lineHeight; n++; }
  if (s.textAlign) { out.textAlign = s.textAlign; n++; }
  var al = el.getAttribute && el.getAttribute('align');
  if (al) { out.align = al; n++; }
  return n ? out : null;
};

Writer.indent.applyParaStyle = function applyParaStyle(el, snap) {
  if (!el || !snap || !el.style || Writer.indent.inList(el)) return;
  if (snap.marginLeft) el.style.marginLeft = snap.marginLeft;
  if (snap.marginRight) el.style.marginRight = snap.marginRight;
  if (snap.textIndent) el.style.textIndent = snap.textIndent;
  if (snap.lineHeight) el.style.lineHeight = snap.lineHeight;
  if (snap.textAlign) el.style.textAlign = snap.textAlign;
  if (snap.align && el.setAttribute) el.setAttribute('align', snap.align);
};

/* Wrap a top-level leftover \\n / <br> (and following loose siblings) in a <p>,
   the same way flow.normalize would, so Enter under pre-wrap can be styled. */
Writer.indent.WRAP_BLOCK = /^(P|DIV|UL|OL|LI|H[1-6]|BLOCKQUOTE|PRE|TABLE|HR|FIGURE)$/;
Writer.indent.wrapLoose = function wrapLoose(host, node) {
  var BLOCK = Writer.indent.WRAP_BLOCK;
  if (!host || !node) return null;
  while (node && node.parentNode && node.parentNode !== host) node = node.parentNode;
  if (!node || node === host) return null;
  if (node.nodeType === 1 && BLOCK.test(node.tagName)) return node;
  var p = document.createElement('p');
  host.insertBefore(p, node);
  p.appendChild(node);
  var next = p.nextSibling, nxt;
  while (next) {
    nxt = next.nextSibling;
    if (next.nodeType === 1 && BLOCK.test(next.tagName)) break;
    if (next.nodeType === 3 && !next.nodeValue.length) { next.remove(); next = nxt; continue; }
    if (next.nodeType !== 1 && next.nodeType !== 3) { next.remove(); next = nxt; continue; }
    p.appendChild(next);
    next = nxt;
  }
  return p;
};

/* Block at the caret after insertParagraph; wraps a leftover top-level \\n / <br>. */
Writer.indent.blockForEnter = function blockForEnter() {
  var I = Writer.indent, sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  var r = sel.getRangeAt(0);
  var host = I.hostOf(r.startContainer);
  if (!host) return null;
  var b = I.blockOf(r.startContainer, host);
  if (b) return b;
  var node = r.startContainer;
  if (node === host) {
    var i = r.startOffset;
    node = (i < host.childNodes.length) ? host.childNodes[i] : host.lastChild;
  }
  return I.wrapLoose(host, node);
};

Writer.indent.end = function end() {
  var I = Writer.indent, d = I.drag, R = Writer.ruler;
  if (!d) return;
  I.drag = null;
  d.g.classList.remove('dragging');
  d.g.removeEventListener('pointermove', I.move);
  d.g.removeEventListener('pointerup', I.end);
  d.g.removeEventListener('pointercancel', I.end);
  R.el('rulerTip').hidden = true;
  I.guide(null);   // DW17: hide the guide on drop / cancel
  var c = d.cur, v0 = d.v0;
  if (c.left === v0.left && c.right === v0.right && c.first === v0.first) { I.sync(); return; }
  d.bl.forEach(function (el) {
    var own = I.read(el);
    /* one marker's change goes to every selected block */
    if (d.k === 'right') own.right = c.right;
    else { own.left = c.left; own.first = c.first; }
    I.apply(el, own);
  });
  var host = I.hostOf(d.bl[0]);
  if (host) host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'formatIndent' }));
  I.sync();
};

Writer.indent.init = function init() {
  var I = Writer.indent, R = Writer.ruler;
  if (!R) return;
  I.build();
  var rs = R.sync;
  /* (before DW17) R.sync = function (live) { var out = rs.apply(this, arguments); if (!live) I.sync(); return out; }; */
  /* DW17: a zoom / page change during an indent drag keeps the dragged values
     (it used to snap the markers back to the block's old values), and a live
     margin drag moves the markers with the margin edge. */
  R.sync = function (live) {
    var out = rs.apply(this, arguments);
    if (!live) I.sync(I.drag ? I.drag.cur : undefined);
    else if (!I.drag && I.lastV) I.sync(I.lastV, live);
    return out;
  };
  document.addEventListener('selectionchange', function () { if (!I.drag) I.sync(); });
  document.addEventListener('input', function () { if (!I.drag) I.sync(); });
  I.sync();
};

Writer.indent.init();
