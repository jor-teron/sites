/* ============================================================
   FILE: modules/writer-headerfooter.js
   DF25: was modules/draftly-headerfooter.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Header & Footer.
         DW13c: a letterhead. The header is ONE full-width block (so is
         the footer): an optional picture on top (resizable by its
         corner handle, aligned left / centre / right), then any number
         of plain text lines, each aligned with the alignment buttons.
         The block grows to fit and the body text moves down (up for
         the footer), so nothing overlaps; pages re-flow. A plain one-
         line header looks as before. Model: writer-hfimg.js (hf v 2).
   (before DW13c) Left / centre / right plain-text slots, the same on
         every page, drawn inside the top and bottom margins (absolute,
         so body page breaks never move).
         Fields: {page}, {pages}, {date}. Saved with the document
         (record field `hf`). The Page-tab page-number buttons now
         write {page} into the footer (DW13c: a {page} line, centre or
         right; before DW13c: the centre / right slot).
   EDIT: Insert > Header & Footer, or double-click a page's top /
         bottom margin. Esc, Close, or a click in the body exits.
         Header / footer edits have their own undo (Ctrl+Z / Ctrl+Y).
   DW11: (before DW13c) each slot could hold one small picture before
         its text. DW13c: one picture per header / footer; Picture…,
         S / M / L (8 / 14 / 20 mm) and Remove in the Header & Footer
         tools; drag the corner handle for any height 6..60 mm.
   DEPENDS: config, pages, storage, ui, view, ribbon (optional),
            hfimg (DW11 / DW13c), image (DW11, picture downscale)
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.hf = {};
/* (before DW11) Writer.hf.data = { head: ['', '', ''], foot: ['', '', ''] }; */
/* (before DW13c) Writer.hf.data = { head: ['', '', ''], foot: ['', '', ''], img: { head: [null, null, null], foot: [null, null, null] } }; */
Writer.hf.data = { v: 2, head: [], foot: [], al: { head: [], foot: [] }, pic: { head: null, foot: null } };
Writer.hf.editing = false;
Writer.hf.lastSlot = null;     /* DW13c: the .hf-text block being edited (was: the slot) */
Writer.hf.saveTimer = null;
Writer.hf.PARTS = ['head', 'foot'];
/* Own small undo for header / footer edits (typing pauses end a step). */
Writer.hf.undoStack = [];
Writer.hf.redoStack = [];
Writer.hf.prev = null;
Writer.hf.lastPush = 0;
Writer.hf.stepMs = 450;
/* DW13c */
Writer.hf.picSel = null;       /* 'head' | 'foot' while its picture is selected */
Writer.hf.lineSel = null;      /* { part, a, b, li, off } last caret / selection lines */
Writer.hf.ar = {};             /* picture src -> aspect ratio (w / h), from the loaded <img> */
Writer.hf.extra = { head: 0, foot: 0 };   /* mm the body moved for a grown block */

/* (before DW11) Writer.hf.blank = function blank() { return { head: ['', '', ''], foot: ['', '', ''] }; }; */
/* (before DW13c) return { head: ['', '', ''], foot: ['', '', ''], img: { head: [null, null, null], foot: [null, null, null] } }; */
Writer.hf.blank = function blank() {
  return { v: 2, head: [], foot: [], al: { head: [], foot: [] }, pic: { head: null, foot: null } };
};

/* DW13c: a deep copy of the block (undo, save). */
Writer.hf.get = function get() {
  var d = Writer.hf.data, cp = function (p) { return p ? { src: p.src, h: p.h, a: p.a } : null; };
  /* (before DW11) return { head: d.head.slice(), foot: d.foot.slice() }; */
  /* (before DW13c) return { head: d.head.slice(), foot: d.foot.slice(), img: { head: img.head.slice(), foot: img.foot.slice() } }; */
  return { v: 2, head: d.head.slice(), foot: d.foot.slice(), al: { head: d.al.head.slice(), foot: d.al.foot.slice() },
    pic: { head: cp(d.pic.head), foot: cp(d.pic.foot) } };
};

Writer.hf.isEmpty = function isEmpty(d) {
  d = d || Writer.hf.data;
  /* (before DW11) return !(d.head.join('') + d.foot.join('')).trim(); */
  /* (before DW13c) if (Writer.hfimg && Writer.hfimg.hasAny(d.img)) return false; */
  if (d.pic && (d.pic.head || d.pic.foot)) return false;
  return !((d.head || []).join('') + (d.foot || []).join('')).trim();
};

/* DW11: one part (head / foot) has text or a picture. */
Writer.hf.partEmpty = function partEmpty(part) {
  var d = Writer.hf.data;
  /* (before DW13c) if (d.img && d.img[part] && (d.img[part][0] || d.img[part][1] || d.img[part][2])) return false; */
  if (d.pic && d.pic[part]) return false;
  return !d[part].join('').trim();
};

/* Load a document's header / footer. A document saved before this
   feature (no `hf`) starts from the old global page-number setting.
   DW13c: old 3-slot headers are migrated by writer-hfimg.js normalize. */
Writer.hf.set = function set(saved) {
  var I = Writer.hfimg, d = Writer.hf.blank();
  var ok = saved && typeof saved === 'object' && Array.isArray(saved.head) && Array.isArray(saved.foot);
  if (ok && I) {
    d = I.normalize(saved);
  } else if (Writer.breaks && Writer.breaks.loadNumbers) {
    var n = Writer.breaks.loadNumbers();
    /* (before DW13c) if (n.on) d.foot[n.pos === 'right' ? 2 : 1] = '{page}'; */
    if (n.on) { d.foot = ['{page}']; d.al.foot = [n.pos === 'right' ? 'r' : 'c']; }
  }
  Writer.hf.data = d;
  Writer.hf.undoStack = [];
  Writer.hf.redoStack = [];
  Writer.hf.picSel = null;
  Writer.hf.prev = Writer.hf.get();
  Writer.hf.render();
};

/* Record the state before a change (merged while typing quickly). */
Writer.hf.record = function record(force) {
  var H = Writer.hf;
  var now = Date.now();
  if (H.prev && (force || now - H.lastPush > H.stepMs)) {
    H.undoStack.push(H.prev);
    if (H.undoStack.length > 100) H.undoStack.shift();
    H.redoStack = [];
  }
  H.lastPush = now;
};

Writer.hf.restore = function restore(from, to) {
  var H = Writer.hf;
  if (!from.length) return;
  to.push(H.get());
  H.data = from.pop();
  H.prev = H.get();
  H.lastPush = 0;
  var a = document.activeElement;
  /* (before DW13c) the focused slot got its text back and the caret went to its end. */
  if (a && a.classList && a.classList.contains('hf-text')) {
    var part = a.getAttribute('data-part');
    H.fillText(a, part, true);
    H.setCaret(a, Math.max(0, a.children.length - 1), Infinity);
  }
  H.render();
  H.changed();
};

Writer.hf.today = function today() {
  try { return new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch (e) { return new Date().toDateString(); }
};

/* Template text -> what one page shows. */
Writer.hf.fill = function fill(t, page, pages) {
  return String(t).replace(/\{page\}/g, String(page)).replace(/\{pages\}/g, String(pages)).replace(/\{date\}/g, Writer.hf.today());
};

/* The header or footer box of one paper (made on demand).
   DW13c: picture row on top, then the text block (one div per line).
   (before DW13c) three .hf-cell children, each a picture + a .hf-slot. */
Writer.hf.box = function box(paper, part) {
  var b = paper.querySelector(':scope > .hf-' + part);
  if (b) return b;
  b = document.createElement('div');
  b.className = 'hf-box hf-' + part;
  b.setAttribute('data-part', part);
  var row = document.createElement('div');
  row.className = 'hf-picrow';
  row.hidden = true;
  var wrap = document.createElement('span');
  wrap.className = 'hf-picwrap';
  var pic = document.createElement('img');
  pic.className = 'hf-pic'; pic.alt = ''; pic.draggable = false;
  pic.setAttribute('data-part', part);
  pic.addEventListener('load', Writer.hf.onPicLoad);
  var handle = document.createElement('span');
  handle.className = 'hf-pic-handle';
  handle.setAttribute('data-part', part);
  handle.title = 'Drag to resize';
  wrap.appendChild(pic); wrap.appendChild(handle);
  row.appendChild(wrap);
  b.appendChild(row);
  var s = document.createElement('div');
  /* hf-slot kept as a class so older selectors still find the text */
  s.className = 'hf-text hf-slot';
  s.setAttribute('data-part', part);
  s.setAttribute('data-slot', '0');
  s.setAttribute('spellcheck', 'false');
  b.appendChild(s);
  paper.appendChild(b);
  return b;
};

/* Fill one text block with its lines (raw template while editing, page
   values otherwise). Skips the DOM when nothing changed, unless force. */
Writer.hf.fillText = function fillText(el, part, force, page, pages) {
  var H = Writer.hf, I = Writer.hfimg, d = H.data;
  var ls = d[part].length ? d[part] : [''];
  var parts = [], sig;
  for (var i = 0; i < ls.length; i++) {
    var t = H.editing ? ls[i] : H.fill(ls[i], page, pages);
    parts.push((d.al[part][i] || (I ? I.DEFAULT_ALIGN : 'c')) + '\u0001' + t);
  }
  sig = parts.join('\u0002');
  if (!force && el._hfSig === sig) return;
  el._hfSig = sig;
  el.textContent = '';
  for (var k = 0; k < parts.length; k++) {
    var cut = parts[k].indexOf('\u0001');
    var line = document.createElement('div');
    line.className = 'hf-line';
    line.style.textAlign = I ? I.cssAlign(parts[k].slice(0, cut)) : 'center';
    var txt = parts[k].slice(cut + 1);
    if (txt) line.textContent = txt; else line.appendChild(document.createElement('br'));
    el.appendChild(line);
  }
};

/* Draw every page. In edit mode the raw template is shown. */
Writer.hf.render = function render() {
  var H = Writer.hf;
  var papers = document.querySelectorAll('.paper');
  var n = papers.length;
  var editable = 'plaintext-only';
  /* (before DW13c) var lay = { head: H.picLayout('head'), foot: H.picLayout('foot') }; */
  for (var i = 0; i < n; i++) {
    for (var p = 0; p < 2; p++) {
      var part = H.PARTS[p];
      var b = H.box(papers[i], part);
      /* (before DW11) var empty = !H.data[part].join('').trim(); */
      var empty = H.partEmpty(part);
      b.classList.toggle('hf-empty', empty);
      H.drawPic(b, part);
      /* (before DW13c) three slots: textContent of each slot = its text / filled text. */
      var s = b.querySelector('.hf-text');
      if (s !== document.activeElement) H.fillText(s, part, false, i + 1, n);
      if (H.editing) {
        if (s.contentEditable !== editable) {
          s.contentEditable = editable;
          if (s.contentEditable !== editable) s.contentEditable = 'true';
        }
      } else if (s.isContentEditable) s.removeAttribute('contenteditable');
    }
  }
  if (Writer.breaks && Writer.breaks.syncNumbers) Writer.breaks.syncNumbers();
  H.syncPicTools();
  H.layout();
};

/* ----- DW11 / DW13c picture ---------------------------------- */

/* (before DW13c) Writer.hf.pics() -> img { head: [3], foot: [3] }; picLayout(part) -> slot heights. */
Writer.hf.pic = function pic(part) { return Writer.hf.data.pic[part] || null; };

/* Text column width in mm. */
Writer.hf.colMm = function colMm() {
  var cfg = Writer.config, ps = (cfg.paperSizes && cfg.paperSizes[cfg.paperSize]) || { widthCm: 21, heightCm: 29.7 };
  var land = document.body.classList.contains(cfg.landscapeClass);
  var w = (land ? ps.heightCm : ps.widthCm) * 10;
  return Math.max(10, w - ((cfg.marginLeftCm || 0) + (cfg.marginRightCm || 0)) * 10);
};

/* Picture box (mm) of one part as drawn: its height, cut to the column width. */
Writer.hf.picBox = function picBox(part, d) {
  var I = Writer.hfimg, p = (d || Writer.hf.data).pic;
  p = p && p[part];
  if (!p || !I) return null;
  return I.fitPic(Writer.hf.ar[p.src] || 0, p.h, Writer.hf.colMm());
};

/* mm the body moves for each grown block ({ head, foot }), writer-hfimg.js math. */
Writer.hf.extras = function extras(d) {
  var H = Writer.hf, I = Writer.hfimg, cfg = Writer.config, out = { head: 0, foot: 0 };
  d = d || H.data;
  if (!I) return out;
  H.PARTS.forEach(function (part) {
    if (I.partEmpty(d, part)) return;
    var box = H.picBox(part, d);
    var n = (d[part] || []).length;
    out[part] = I.extraMm((part === 'head' ? cfg.marginTopCm : cfg.marginBottomCm) * 10, I.blockMm(n, box ? box.h : 0));
  });
  return out;
};

/* Body padding follows the blocks (page.css vars). Pages re-flow when it changes. */
Writer.hf.layout = function layout() {
  var H = Writer.hf, ex = H.extras();
  var root = document.documentElement;
  if (ex.head === H.extra.head && ex.foot === H.extra.foot) return;
  H.extra = ex;
  if (root && root.style) {
    root.style.setProperty('--hf-head-extra-mm', String(ex.head));
    root.style.setProperty('--hf-foot-extra-mm', String(ex.foot));
  }
  clearTimeout(H.flowTimer);
  H.flowTimer = setTimeout(function () {
    if (Writer.pages && Writer.pages.layoutAll && Writer.flow) Writer.pages.layoutAll();
  }, 0);
};

/* Show / hide the picture of one box at its height and alignment. */
Writer.hf.drawPic = function drawPic(b, part) {
  var H = Writer.hf, pic = H.pic(part), row = b.querySelector('.hf-picrow'), im = b.querySelector('.hf-pic');
  /* (before DW13c) the box was moved inside the margin (lay.edge) and each slot's picture shown. */
  b.classList.toggle('hf-has-pic', !!pic);
  b.classList.toggle('hf-pic-on', !!pic && H.editing && H.picSel === part);
  if (!pic) { if (!row.hidden) { row.hidden = true; im.removeAttribute('src'); } return; }
  if (im.getAttribute('src') !== pic.src) im.setAttribute('src', pic.src);
  var box = H.picBox(part), h = (box ? box.h : pic.h).toFixed(2) + 'mm';
  if (im.style.height !== h) im.style.height = h;
  var al = Writer.hfimg ? Writer.hfimg.cssAlign(pic.a) : 'center';
  if (row.style.textAlign !== al) row.style.textAlign = al;
  row.hidden = false;
};

/* The picture's aspect ratio is known once it loads: redraw and re-layout. */
Writer.hf.onPicLoad = function onPicLoad(e) {
  var im = e.target, H = Writer.hf, src = im.getAttribute('src');
  if (!src || !im.naturalWidth || !im.naturalHeight) return;
  var ar = im.naturalWidth / im.naturalHeight;
  if (H.ar[src] === ar) return;
  H.ar[src] = ar;
  H.render();
};

/* Part of the block being edited ({ part, k: 0 } or null). k is kept for older callers. */
Writer.hf.activeSlot = function activeSlot() {
  var s = Writer.hf.lastSlot;
  if (!s || !document.contains(s)) return null;
  var b = s.closest('.hf-box');
  /* (before DW13c) return b ? { part: b.getAttribute('data-part'), k: +s.getAttribute('data-slot') } : null; */
  return b ? { part: b.getAttribute('data-part'), k: 0 } : null;
};

/* Put a picture (or null) in one part as one undo step.
   (before DW13c) setPic(part, k, pic) with pic = { src, size }. The old
   3-argument form still works; { size } maps to its preset height. */
Writer.hf.setPic = function setPic(part, k, pic) {
  var H = Writer.hf, I = Writer.hfimg;
  if (arguments.length < 3) pic = k;
  if (H.PARTS.indexOf(part) === -1) return;
  H.record(true);
  var old = H.data.pic[part];
  H.data.pic[part] = pic ? (I ? I.normBlockPic(pic, old ? old.a : I.DEFAULT_ALIGN) : pic) : null;
  if (!H.data.pic[part]) H.picSel = H.picSel === part ? null : H.picSel;
  H.prev = H.get();
  H.lastPush = 0;
  H.render();
  H.changed();
};

/* S / M / L: preset heights 8 / 14 / 20 mm. */
Writer.hf.sizePic = function sizePic(size) {
  var H = Writer.hf, a = H.activeSlot(), I = Writer.hfimg;
  var part = H.picSel || (a && a.part);
  var cur = part && H.pic(part);
  var h = I && I.PRESETS[size];
  /* (before DW13c) if (!cur || cur.size === size) return; H.setPic(a.part, a.k, { src: cur.src, size: size }); */
  if (!cur || !h || cur.h === h) return;
  H.setPic(part, { src: cur.src, h: h, a: cur.a });
  H.refocus();
};

Writer.hf.removePic = function removePic() {
  var H = Writer.hf, a = H.activeSlot(), part = H.picSel || (a && a.part);
  if (!part || !H.pic(part)) return;
  H.setPic(part, null);
  H.picSel = null;
  H.refocus();
};

/* Picture… : file picker, downscale, then into the part that was active. */
Writer.hf.pickPic = function pickPic() {
  var H = Writer.hf;
  /* (before DW13c) if (!H.editing) H.enter({ name: 'head' }, 0); */
  if (!H.editing) H.enter({ name: 'head' });
  var a = H.activeSlot(), file = document.getElementById('hfPicFile');
  if (!a || !file) return;
  H.pickFor = { part: H.picSel || a.part, k: 0 };
  file.value = '';
  file.click();
};

Writer.hf.onPicFile = function onPicFile() {
  var H = Writer.hf, file = document.getElementById('hfPicFile'), I = Writer.hfimg;
  var f = file && file.files && file.files[0], a = H.pickFor;
  H.pickFor = null;
  if (!f || !a) return;
  if (!/^image\//.test(f.type || '')) { H.note('That file is not a picture.'); return; }
  var max = I ? I.MAX_PX : 600;
  Writer.image.load(f, max).then(function (src) {
    var old = H.pic(a.part);
    /* (before DW13c) H.setPic(a.part, a.k, { src: src, size: old ? old.size : 'M' }); */
    H.setPic(a.part, { src: src, h: old ? old.h : (I ? I.DEFAULT_H : 14), a: old ? old.a : 'c' });
    if (!H.pic(a.part)) H.note('That picture could not be used.');
    H.refocus();
  }).catch(function (err) {
    console.warn('writer: header picture failed', err);
    H.note('That picture could not be read.');
  });
};

Writer.hf.note = function note(msg) {
  if (Writer.ui && Writer.ui.showToast) Writer.ui.showToast(msg);
};

/* Back to the block's text after a tool click (the last caret, else the end). */
Writer.hf.refocus = function refocus() {
  var H = Writer.hf, s = H.lastSlot;
  if (!H.editing || !s || !document.contains(s)) return;
  if (document.activeElement !== s) {
    s.focus();
    var L = H.lineSel, part = s.getAttribute('data-part');
    if (L && L.part === part && L.li < s.children.length) H.setCaret(s, L.li, L.off);
    else H.setCaret(s, Math.max(0, s.children.length - 1), Infinity);
  }
};

/* Picture tools follow the active part: S / M / L / Remove only when it has one. */
Writer.hf.syncPicTools = function syncPicTools() {
  var H = Writer.hf, I = Writer.hfimg;
  var opts = document.getElementById('hfPicOpts'), where = document.getElementById('hfPicWhere');
  var btn = document.getElementById('hfPicBtn');
  if (!opts) return;
  var a = H.editing ? H.activeSlot() : null;
  var part = H.editing ? (H.picSel || (a && a.part)) : null;
  var pic = part ? H.pic(part) : null;
  opts.hidden = !pic;
  /* (before DW13c) a 'tight' note when the margin cut the picture; the block now grows instead. */
  if (where) where.textContent = part ? (part === 'head' ? 'Header:' : 'Footer:') : '';
  if (btn) btn.title = pic ? 'Replace the ' + (part === 'head' ? 'header' : 'footer') + ' picture' : 'Add a picture (e.g. a logo) on top of the ' + (part === 'foot' ? 'footer' : 'header');
  var preset = pic && I ? I.presetOf(pic.h) : '';
  var sizes = opts.querySelectorAll('[data-hf-size]');
  for (var i = 0; i < sizes.length; i++) {
    var hit = !!pic && sizes[i].getAttribute('data-hf-size') === preset;
    sizes[i].classList.toggle('active', hit);
    sizes[i].setAttribute('aria-pressed', hit ? 'true' : 'false');
  }
};

/* (before DW11a) .docx / .odt exports did not carry header pictures, so this said so once:
Writer.hf.warnedExport = false;
Writer.hf.warnExport = function warnExport() {
  var H = Writer.hf;
  if (H.warnedExport || !Writer.hfimg || !Writer.hfimg.hasAny(H.data.img)) return;
  H.warnedExport = true;
  console.warn('writer: header / footer pictures are not exported to .docx / .odt yet (DW11a); the text is.');
};
   DW11a: writer-export.js writes the pictures into .docx and .odt. */

Writer.hf.changed = function changed() {
  clearTimeout(Writer.hf.saveTimer);
  Writer.hf.saveTimer = setTimeout(function () {
    if (Writer.app && Writer.app.ready) Writer.storage.save();
  }, Writer.config.inputDebounceMs);
};

Writer.hf.enter = function enter(part, slot) {
  var H = Writer.hf;
  if (!H.editing) {
    H.editing = true;
    document.body.classList.add('hf-editing');
    if (Writer.ribbon) Writer.ribbon.selectTab('insert');
    var tools = document.getElementById('hfTools');
    if (tools) tools.hidden = false;
    var btn = document.getElementById('hfBtn');
    if (btn) { btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true'); }
    H.render();
  }
  var paper = (H.lastSlot && H.lastSlot.closest('.paper')) || document.querySelector('.paper');
  if (part) paper = part.paper || paper;
  /* (before DW13c) var target = paper.querySelector('.hf-' + ((part && part.name) || 'head') + ' [data-slot="' + (slot == null ? 1 : slot) + '"]'); */
  var target = paper && paper.querySelector('.hf-' + ((part && part.name) || 'head') + ' .hf-text');
  if (target) {
    target.focus();
    H.setCaret(target, Math.max(0, target.children.length - 1), Infinity);
    H.lastSlot = target;
  }
  H.syncPicTools();   /* DW11 */
};

Writer.hf.exit = function exit() {
  var H = Writer.hf;
  if (!H.editing) return;
  H.editing = false;
  H.picSel = null;
  document.body.classList.remove('hf-editing');
  var tools = document.getElementById('hfTools');
  if (tools) tools.hidden = true;
  var btn = document.getElementById('hfBtn');
  if (btn) { btn.classList.remove('active'); btn.setAttribute('aria-pressed', 'false'); }
  if (document.activeElement && document.activeElement.classList.contains('hf-slot')) document.activeElement.blur();
  H.render();
  H.changed();
};

/* ----- DW13c text block: lines, caret ------------------------ */

/* Lines of a text block: [{ t, a, nodes }]. Any top-level DIV / P is a line;
   loose text or inline nodes between them form a line of their own. */
Writer.hf.readLines = function readLines(el) {
  var I = Writer.hfimg, out = [], cur = null, def = I ? I.DEFAULT_ALIGN : 'c';
  var al = function (node) { return I ? I.normAlign(node.style && node.style.textAlign, def) : 'c'; };
  for (var c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1 && (c.nodeName === 'DIV' || c.nodeName === 'P')) {
      cur = null;
      out.push({ t: c.textContent.replace(/[\r\n]+/g, ' '), a: al(c), nodes: [c] });
    } else {
      if (!cur) { cur = { t: '', a: out.length ? out[out.length - 1].a : def, nodes: [] }; out.push(cur); }
      if (c.nodeName !== 'BR') cur.t += String(c.textContent || '').replace(/[\r\n]+/g, ' ');
      else { cur.nodes.push(c); cur = null; continue; }
      cur.nodes.push(c);
    }
  }
  if (!out.length) out.push({ t: '', a: def, nodes: [] });
  return out;
};

/* True when every child is a line DIV (else the block is rebuilt). */
Writer.hf.clean = function clean(el) {
  for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType !== 1 || c.nodeName !== 'DIV') return false;
  return !!el.firstChild;
};

/* Caret / selection as line indexes and the caret's text offset in its line. */
Writer.hf.caretOf = function caretOf(el) {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return null;
  var lines = Writer.hf.readLines(el);
  var find = function (node) {
    for (var i = 0; i < lines.length; i++) {
      for (var j = 0; j < lines[i].nodes.length; j++) if (lines[i].nodes[j] === node || lines[i].nodes[j].contains(node)) return i;
    }
    return node === el ? -1 : lines.length - 1;
  };
  var r = sel.getRangeAt(0);
  var li = find(r.startContainer), lf = find(r.endContainer), off = 0;
  if (li === -1) { li = Math.min(lines.length - 1, r.startOffset); off = 0; }
  else if (lines[li].nodes.length) {
    var pre = document.createRange();
    pre.setStartBefore(lines[li].nodes[0]);
    pre.setEnd(r.startContainer, r.startOffset);
    off = pre.toString().replace(/[\r\n]+/g, ' ').length;
  }
  if (lf === -1) lf = li;
  return { li: li, off: off, a: Math.min(li, lf), b: Math.max(li, lf), collapsed: r.collapsed };
};

/* Caret at text offset off (Infinity: the end) of line li. */
Writer.hf.setCaret = function setCaret(el, li, off) {
  var line = el.children[li];
  var sel = window.getSelection();
  if (!line || !sel) return;
  var r = document.createRange();
  var walk = document.createTreeWalker(line, 4 /* NodeFilter.SHOW_TEXT */, null), n, left = off, last = null;
  while ((n = walk.nextNode())) {
    last = n;
    if (left <= n.data.length) { r.setStart(n, left); break; }
    left -= n.data.length;
  }
  if (!n) { if (last) r.setStart(last, last.data.length); else r.setStart(line, 0); }
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
};

/* Model edit at the caret: Enter splits the line (the new line keeps the
   alignment); text with line breaks (paste) adds lines. */
Writer.hf.insertLines = function insertLines(el, text) {
  var H = Writer.hf, I = Writer.hfimg, part = el.getAttribute('data-part');
  var sel = window.getSelection();
  if (sel && sel.rangeCount && !sel.isCollapsed) document.execCommand('delete');
  var c = H.caretOf(el) || { li: 0, off: 0 };
  var lines = H.readLines(el);
  var cur = lines[c.li] || { t: '', a: I ? I.DEFAULT_ALIGN : 'c' };
  var bits = String(text).replace(/\r\n?/g, '\n').split('\n');
  var max = I ? I.MAX_LINES : 30;
  if (lines.length + bits.length - 1 > max) { H.note('A header or footer holds up to ' + max + ' lines.'); bits = bits.slice(0, Math.max(1, max - lines.length + 1)); }
  var head = cur.t.slice(0, c.off), tail = cur.t.slice(c.off);
  var add = bits.map(function (b, i) { return { t: (i === 0 ? head : '') + b + (i === bits.length - 1 ? tail : ''), a: cur.a }; });
  var texts = lines.map(function (l) { return l.t; }), aligns = lines.map(function (l) { return l.a; });
  texts.splice.apply(texts, [c.li, 1].concat(add.map(function (x) { return x.t; })));
  aligns.splice.apply(aligns, [c.li, 1].concat(add.map(function (x) { return x.a; })));
  H.record(true);
  H.data[part] = texts;
  H.data.al[part] = aligns;
  H.prev = H.get();
  H.lastPush = 0;
  H.fillText(el, part, true);
  var li = c.li + bits.length - 1;
  H.setCaret(el, li, add[add.length - 1].t.length - tail.length);
  H.render();
  H.changed();
};

/* Alignment buttons while editing: the selected picture, else the caret's lines. */
Writer.hf.align = function align(a) {
  var H = Writer.hf, I = Writer.hfimg;
  if (!H.editing || !I) return false;
  a = I.normAlign(a);
  if (H.picSel && H.pic(H.picSel)) {
    var p = H.pic(H.picSel);
    if (p.a !== a) H.setPic(H.picSel, { src: p.src, h: p.h, a: a });
    H.refocus();
    return true;
  }
  var s = H.lastSlot;
  if (!s || !document.contains(s)) return true;
  var part = s.getAttribute('data-part'), L = H.lineSel && H.lineSel.part === part ? H.lineSel : null;
  var lines = H.readLines(s);
  var from = L ? L.a : lines.length - 1, to = L ? L.b : lines.length - 1;
  H.record(true);
  H.data[part] = lines.map(function (l) { return l.t; });
  H.data.al[part] = lines.map(function (l, i) { return i >= from && i <= to ? a : l.a; });
  H.prev = H.get();
  H.lastPush = 0;
  H.fillText(s, part, true);
  H.render();
  H.changed();
  H.refocus();
  return true;
};

/* Insert a field token at the caret of the block being edited. */
Writer.hf.insertField = function insertField(token) {
  var H = Writer.hf;
  /* (before DW13c) if (!H.editing) H.enter({ name: 'foot' }, 1); */
  if (!H.editing) H.enter({ name: 'foot' });
  var s = H.lastSlot;
  if (!s) return;
  H.refocus();
  H.record(true);
  H.fieldStep = true;   /* the field is its own step */
  var c = H.caretOf(s), lines = H.readLines(s);
  var cur = c ? lines[c.li].t.slice(0, c.off) : s.textContent;
  var t = (cur && !/\s$/.test(cur) ? ' ' : '') + token;
  if (!document.execCommand('insertText', false, t)) {
    var last = s.lastElementChild || s;
    last.textContent = last.textContent + t;
    H.onInput({ target: s });
  }
};

/* The block changed: store its lines and copy them to every page.
   (before DW13c) one slot: Writer.hf.data[part][k] = s.textContent.replace(/\n/g, ' '). */
Writer.hf.onInput = function onInput(e) {
  var H = Writer.hf, s = e.target;
  if (!s || !s.classList || !s.classList.contains('hf-text')) return;
  var part = s.getAttribute('data-part');
  if (H.fieldStep) { H.fieldStep = false; H.lastPush = 0; }
  else H.record(false);
  var c = H.clean(s) ? null : H.caretOf(s);
  var lines = H.readLines(s);
  var max = Writer.hfimg ? Writer.hfimg.MAX_LINES : 30;
  if (lines.length > max) lines = lines.slice(0, max);
  H.data[part] = lines.map(function (l) { return l.t; });
  H.data.al[part] = lines.map(function (l) { return l.a; });
  if (H.isEmpty({ head: H.data[part], foot: [], pic: {} })) { H.data[part] = []; H.data.al[part] = []; }
  if (c) { H.fillText(s, part, true); H.setCaret(s, Math.min(c.li, s.children.length - 1), c.off); }
  else s._hfSig = null;
  H.lastSlot = s;
  H.prev = H.get();
  H.render();
  H.changed();
};

/* Page-number buttons (Page tab) now edit the footer: a '{page}' line, centre or right.
   (before DW13c) the centre / right footer slot held '{page}'. */
Writer.hf.setNumbers = function setNumbers(on, pos) {
  var H = Writer.hf;
  try {
    localStorage.setItem(Writer.config.storageKeyPageNumbers, on ? '1' : '0');
    localStorage.setItem(Writer.config.storageKeyPageNumberPos, pos === 'right' ? 'right' : 'center');
  } catch (e) {}
  H.record(true);
  var f = H.data.foot, al = H.data.al.foot, i = f.length;
  while (i--) if (f[i].trim() === '{page}') { f.splice(i, 1); al.splice(i, 1); }
  if (on) { f.push('{page}'); al.push(pos === 'right' ? 'r' : 'c'); }
  H.prev = H.get();
  H.render();
  H.changed();
};

/* Page-number buttons show which alignment a bare {page} footer line has. */
Writer.hf.syncNumbers = function syncNumbers() {
  var d = Writer.hf.data, key = 'off';
  /* (before DW13c) var key = f[1] === '{page}' ? 'center' : (f[2] === '{page}' ? 'right' : 'off'); */
  for (var i = 0; i < d.foot.length; i++) {
    if (d.foot[i].trim() !== '{page}') continue;
    key = d.al.foot[i] === 'r' ? 'right' : (d.al.foot[i] === 'c' ? 'center' : 'off');
    break;
  }
  var opts = document.querySelectorAll('#pagePanel .seg-btn[data-pn]');
  for (var j = 0; j < opts.length; j++) {
    var hit = opts[j].getAttribute('data-pn') === key;
    opts[j].classList.toggle('active', hit);
    opts[j].setAttribute('aria-pressed', hit ? 'true' : 'false');
  }
};

/* Which margin (if any) a point on a paper is in (DW13c: the grown one). */
Writer.hf.marginAt = function marginAt(paper, x, y) {
  var r = paper.getBoundingClientRect();
  var z = (Writer.view && Writer.view.zoom) || 1;
  var cm = Writer.view ? Writer.view.CM_PX : 96 / 2.54;
  var cfg = Writer.config, ex = Writer.hf.extra;
  var part = null;
  /* (before DW13c) if (y - r.top < cfg.marginTopCm * cm * z) part = 'head'; */
  if (y - r.top < (cfg.marginTopCm + ex.head / 10) * cm * z) part = 'head';
  else if (r.bottom - y < (cfg.marginBottomCm + ex.foot / 10) * cm * z) part = 'foot';
  if (!part) return null;
  /* (before DW13c) var third = ...; return { name: part, paper: paper, slot: third }; */
  return { name: part, paper: paper, slot: 0 };
};

/* ----- DW13c picture resize (corner handle) ------------------ */
Writer.hf.startResize = function startResize(e) {
  var H = Writer.hf, I = Writer.hfimg, part = e.target.getAttribute('data-part'), p = H.pic(part);
  if (!p || !I) return;
  e.preventDefault(); e.stopPropagation();
  var z = (Writer.view && Writer.view.zoom) || 1, pxMm = (Writer.view ? Writer.view.CM_PX : 96 / 2.54) * z / 10;
  var box = H.picBox(part), ar = H.ar[p.src] || 1, h0 = box ? box.h : p.h;
  var x0 = e.clientX, y0 = e.clientY, now = h0;
  var dirY = part === 'head' ? 1 : -1;   /* footer handle is on top: drag up to grow */
  var dirX = p.a === 'r' ? -1 : 1;       /* right-aligned picture: handle on the left */
  var imgs = document.querySelectorAll('.hf-' + part + ' .hf-pic');
  document.body.classList.add('hf-resizing');
  function move(ev) {
    var dy = (ev.clientY - y0) / pxMm * dirY, dx = (ev.clientX - x0) / pxMm * dirX / ar;
    now = I.fitPic(ar, I.resizeH(h0, Math.abs(dx) > Math.abs(dy) ? dx : dy), H.colMm()).h;
    for (var i = 0; i < imgs.length; i++) imgs[i].style.height = now.toFixed(2) + 'mm';
  }
  function up() {
    document.removeEventListener('mousemove', move, true);
    document.removeEventListener('mouseup', up, true);
    document.body.classList.remove('hf-resizing');
    if (Math.abs(now - h0) >= 0.1) H.setPic(part, { src: p.src, h: now, a: p.a });
    else H.render();
    H.refocus();
  }
  document.addEventListener('mousemove', move, true);
  document.addEventListener('mouseup', up, true);
};

/* DW13c: Enter / paste / formatting keys inside the text block. */
Writer.hf.onKey = function onKey(e) {
  var H = Writer.hf, t = e.target;
  var inText = t && t.classList && t.classList.contains('hf-text');
  if (e.isComposing) return;
  if (H.picSel && (e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey) {
    e.preventDefault(); e.stopPropagation(); H.removePic(); return;
  }
  if (H.picSel && !/^(Shift|Control|Alt|Meta)$/.test(e.key)) { H.picSel = null; H.render(); }
  if (!inText) return;
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); H.insertLines(t, '\n'); return; }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[biuj]$/i.test(e.key) && !e.shiftKey) {
    e.preventDefault(); e.stopPropagation();   /* plain text block: no bold / italic / underline / justify */
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.shiftKey && /^[lre]$/i.test(e.key)) {
    e.preventDefault(); e.stopPropagation();
    H.align({ l: 'l', e: 'c', r: 'r' }[e.key.toLowerCase()]);
  }
};

/* Text pasted into the block: plain text, line breaks become lines. Pictures
   are taken first by writer-paste.js (onHfPaste). */
Writer.hf.onPaste = function onPaste(e) {
  var H = Writer.hf, t = e.target, el = t && (t.nodeType === 1 ? t : t.parentElement);
  var s = el && el.closest ? el.closest('.hf-text') : null;
  if (!s || !H.editing || e.defaultPrevented) return;
  var text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
  e.preventDefault();
  if (!text) return;
  if (/[\r\n]/.test(text)) H.insertLines(s, text.replace(/[\r\n]+$/, ''));
  else if (!document.execCommand('insertText', false, text)) H.insertLines(s, text);
};

/* Track the caret's lines so the alignment buttons know what to change. */
Writer.hf.onSelection = function onSelection() {
  var H = Writer.hf, s = H.lastSlot;
  if (!H.editing || !s || document.activeElement !== s) return;
  var c = H.caretOf(s);
  if (c) H.lineSel = { part: s.getAttribute('data-part'), a: c.a, b: c.b, li: c.li, off: c.off };
};

Writer.hf.bind = function bind() {
  var H = Writer.hf;
  /* Old page-number badges are replaced by the footer. */
  document.body.classList.remove('pn-on', 'pn-right');
  if (Writer.breaks) {
    Writer.breaks.setNumbers = H.setNumbers;
    Writer.breaks.syncNumbers = H.syncNumbers;
  }
  /* Redraw after every pagination pass. */
  var up = Writer.pages.updatePageNumbers;
  Writer.pages.updatePageNumbers = function () {
    var out = up.apply(this, arguments);
    H.render();
    return out;
  };
  /* (before DW13c) Writer.ui.onClick('hfBtn', function () { if (H.editing) H.exit(); else H.enter({ name: 'head' }, 1); }); */
  Writer.ui.onClick('hfBtn', function () { if (H.editing) H.exit(); else H.enter({ name: 'head' }); });
  Writer.ui.onClick('hfCloseBtn', function () { H.exit(); });
  var fields = document.querySelectorAll('#hfTools [data-hf-field]');
  for (var i = 0; i < fields.length; i++) {
    (function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function (e) { e.preventDefault(); H.insertField(b.getAttribute('data-hf-field')); });
    })(fields[i]);
  }
  /* DW13c: alignment buttons in the Header & Footer tools. */
  var aligns = document.querySelectorAll('#hfTools [data-hf-align]');
  for (var a = 0; a < aligns.length; a++) {
    (function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function (e) { e.preventDefault(); H.align(b.getAttribute('data-hf-align')); });
    })(aligns[a]);
  }
  /* DW13c: the Home ribbon's align buttons work on the header / footer while editing. */
  var ribbonAlign = { alignLeftBtn: 'l', alignCenterBtn: 'c', alignRightBtn: 'r' };
  document.addEventListener('click', function (e) {
    if (!H.editing) return;
    var b = e.target.closest && e.target.closest('#alignLeftBtn, #alignCenterBtn, #alignRightBtn');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    H.align(ribbonAlign[b.id]);
  }, true);
  /* DW11: picture tools (in-app only). */
  var picBtn = document.getElementById('hfPicBtn'), picFile = document.getElementById('hfPicFile');
  if (picBtn && picFile) {
    picBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    picBtn.addEventListener('click', function (e) { e.preventDefault(); H.pickPic(); });
    picFile.addEventListener('change', H.onPicFile);
  }
  var picTools = document.querySelectorAll('#hfPicOpts [data-hf-size], #hfPicRemove');
  for (var j = 0; j < picTools.length; j++) {
    (function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function (e) {
        e.preventDefault();
        if (b.id === 'hfPicRemove') H.removePic(); else H.sizePic(b.getAttribute('data-hf-size'));
      });
    })(picTools[j]);
  }
  var ws = document.getElementById('workspace');
  if (ws) {
    ws.addEventListener('input', H.onInput);
    ws.addEventListener('paste', H.onPaste);
    ws.addEventListener('focusin', function (e) {
      /* (before DW11) if (e.target.classList && e.target.classList.contains('hf-slot')) H.lastSlot = e.target; */
      if (e.target.classList && e.target.classList.contains('hf-text')) { H.lastSlot = e.target; H.syncPicTools(); }
    });
    /* DW11: a click on a picture while editing selects it (DW13c: alignment
       buttons, S / M / L, Delete then act on it); the handle resizes it. */
    ws.addEventListener('mousedown', function (e) {
      if (!H.editing || !e.target.classList) return;
      if (e.target.classList.contains('hf-pic-handle')) { H.startResize(e); return; }
      if (e.target.classList.contains('hf-pic')) {
        e.preventDefault();
        /* (before DW13c) var slot = e.target.parentNode.querySelector('.hf-slot'); if (slot) { H.lastSlot = slot; ... } */
        var s = e.target.closest('.hf-box').querySelector('.hf-text');
        if (s) { H.lastSlot = s; H.picSel = e.target.getAttribute('data-part'); H.refocus(); H.render(); }
        return;
      }
      if (H.picSel && e.target.closest && e.target.closest('.hf-text')) { H.picSel = null; H.render(); }
    });
    ws.addEventListener('dblclick', function (e) {
      if (H.editing && e.target.closest('.hf-box')) return;
      var paper = e.target.closest('.paper');
      if (!paper || e.target.closest('.' + Writer.config.editorClass)) return;
      var m = H.marginAt(paper, e.clientX, e.clientY);
      if (!m) return;
      e.preventDefault();
      H.enter(m, m.slot);
    });
  }
  document.addEventListener('selectionchange', H.onSelection);
  /* A click anywhere outside the header / footer and its tools ends editing.
     DW13c: the ribbon tabs and the Home align buttons keep it open. */
  document.addEventListener('mousedown', function (e) {
    if (!H.editing) return;
    /* (before DW13c) if (e.target.closest('.hf-box, #hfTools, #hfBtn')) return; */
    if (e.target.closest('.hf-box, #hfTools, #hfBtn, .ribbon-tab, #alignLeftBtn, #alignCenterBtn, #alignRightBtn')) return;
    H.exit();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (!H.editing) return;
    var inSlot = e.target.classList && e.target.classList.contains('hf-slot');
    if (e.key === 'Escape') { e.preventDefault(); H.exit(); return; }
    /* (before DW13c) if (inSlot && e.key === 'Enter') e.preventDefault();   one line per slot */
    H.onKey(e);
    if (e.defaultPrevented) return;
    if (inSlot && (e.ctrlKey || e.metaKey) && !e.altKey) {
      var key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); H.restore(H.undoStack, H.redoStack); }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); e.stopPropagation(); H.restore(H.redoStack, H.undoStack); }
    }
  }, true);
  H.render();
};
