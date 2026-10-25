/* ============================================================
   FILE: modules/draftly-indent.js
   PROJECT: Draftly
   ROLE: DF7 Word-style indent markers on the ruler.
         Top triangle (down) = first-line indent, bottom triangle
         (up) = hanging indent, square = left indent (moves both),
         right triangle (up) = right indent. Act on the block(s)
         at the caret / selection as inline margin-left,
         margin-right and text-indent (cm). Snap 0.1 cm, keep
         >= 2 cm of text. Undo via history.checkpoint + input.
   DEPENDS: ruler, config, view, editor, history
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.indent = {};
Draftly.indent.BLOCK = /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE)$/;
Draftly.indent.drag = null;

/* Blocks touched by the current selection (inside an editor). */
Draftly.indent.blocks = function blocks() {
  var I = Draftly.indent, sel = window.getSelection();
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

Draftly.indent.hostOf = function hostOf(n) {
  var cls = Draftly.config.editorClass || 'editor';
  for (; n; n = n.parentNode) if (n.nodeType === 1 && n.classList.contains(cls)) return n;
  return null;
};

/* Nearest block below the editor; bare text gets wrapped in a <div>. */
Draftly.indent.blockOf = function blockOf(n, host) {
  var I = Draftly.indent;
  for (var x = n; x && x !== host; x = x.parentNode) {
    if (x.nodeType === 1 && /^(TD|TH)$/.test(x.tagName)) return null;
    if (x.nodeType === 1 && I.BLOCK.test(x.tagName)) return x;
  }
  return null;
};

/* Current values (cm) of a block. */
Draftly.indent.read = function read(el) {
  var px = Draftly.view.CM_PX, s = getComputedStyle(el);
  var f = function (v) { return Math.round((parseFloat(v) || 0) / px * 10) / 10; };
  return { left: f(s.marginLeft), right: f(s.marginRight), first: f(s.textIndent) };
};

/* Place the four markers for the block at the caret. */
Draftly.indent.sync = function sync(live) {
  var I = Draftly.indent, R = Draftly.ruler, cfg = Draftly.config;
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

Draftly.indent.build = function build() {
  var I = Draftly.indent, R = Draftly.ruler, track = R.el('rulerTrack');
  if (!track || R.el('rulerIndent')) return;
  var d = document.createElement('div');
  d.className = 'ruler-indent'; d.id = 'rulerIndent'; d.hidden = true;
  d.innerHTML =
    '<div class="ind-grab ind-first" id="indFirst" data-k="first" title="First-line indent"><i></i></div>' +
    '<div class="ind-grab ind-hang" id="indHang" data-k="hang" title="Hanging indent"><i></i></div>' +
    '<div class="ind-grab ind-left" id="indLeft" data-k="left" title="Left indent"><i></i></div>' +
    '<div class="ind-grab ind-right" id="indRight" data-k="right" title="Right indent"><i></i></div>';
  track.appendChild(d);
  d.querySelectorAll('.ind-grab').forEach(function (g) {
    g.addEventListener('mousedown', function (e) { e.preventDefault(); });  // keep the caret
    g.addEventListener('pointerdown', I.start);
  });
};

Draftly.indent.start = function start(e) {
  var I = Draftly.indent, bl = I.blocks();
  e.preventDefault();
  if (!bl.length) return;
  var g = e.currentTarget;
  try { g.setPointerCapture(e.pointerId); } catch (x) {}
  if (Draftly.history) Draftly.history.checkpoint();
  var v0 = I.read(bl[0]);
  I.drag = { k: g.getAttribute('data-k'), g: g, x0: e.clientX, bl: bl, v0: v0, cur: Object.assign({}, v0) };
  g.classList.add('dragging');
  g.addEventListener('pointermove', I.move);
  g.addEventListener('pointerup', I.end);
  g.addEventListener('pointercancel', I.end);
};

Draftly.indent.r1 = function (v) { return Math.round(v * 10) / 10; };

Draftly.indent.move = function move(e) {
  var I = Draftly.indent, d = I.drag, R = Draftly.ruler, cfg = Draftly.config;
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
  var tip = R.el('rulerTip'), label, at;
  if (d.k === 'first') { label = 'First line ' + (c.left + c.first).toFixed(1); at = cfg.marginLeftCm + c.left + c.first; }
  else if (d.k === 'hang') { label = 'Hanging ' + c.left.toFixed(1); at = cfg.marginLeftCm + c.left; }
  else if (d.k === 'left') { label = 'Left ' + c.left.toFixed(1); at = cfg.marginLeftCm + c.left; }
  else { label = 'Right ' + c.right.toFixed(1); at = m.w - cfg.marginRightCm - c.right; }
  tip.hidden = false; tip.textContent = label + ' cm'; tip.style.left = at * m.cm + 'px';
};

/* Write inline styles; 0 clears the property. */
Draftly.indent.apply = function apply(el, v) {
  var set = function (p, n) { el.style[p] = n ? n.toFixed(1) + 'cm' : ''; };
  set('marginLeft', v.left); set('marginRight', v.right); set('textIndent', v.first);
  if (!el.getAttribute('style')) el.removeAttribute('style');
};

Draftly.indent.end = function end() {
  var I = Draftly.indent, d = I.drag, R = Draftly.ruler;
  if (!d) return;
  I.drag = null;
  d.g.classList.remove('dragging');
  d.g.removeEventListener('pointermove', I.move);
  d.g.removeEventListener('pointerup', I.end);
  d.g.removeEventListener('pointercancel', I.end);
  R.el('rulerTip').hidden = true;
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

Draftly.indent.init = function init() {
  var I = Draftly.indent, R = Draftly.ruler;
  if (!R) return;
  I.build();
  var rs = R.sync;
  R.sync = function (live) { var out = rs.apply(this, arguments); if (!live) I.sync(); return out; };
  document.addEventListener('selectionchange', function () { if (!I.drag) I.sync(); });
  document.addEventListener('input', function () { if (!I.drag) I.sync(); });
  I.sync();
};

Draftly.indent.init();
