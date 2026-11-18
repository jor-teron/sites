/* ============================================================
   FILE: modules/writer-headerfooter.js
   DF25: was modules/draftly-headerfooter.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Header & Footer. Left / centre / right plain-text slots,
         the same on every page, drawn inside the top and bottom
         margins (absolute, so body page breaks never move).
         Fields: {page}, {pages}, {date}. Saved with the document
         (record field `hf`). The Page-tab page-number buttons now
         write {page} into the footer centre / right slot.
   EDIT: Insert > Header & Footer, or double-click a page's top /
         bottom margin. Esc, Close, or a click in the body exits.
         Typing undo is the browser's own (plain-text slots).
   DW11: each slot may also hold one small picture (a logo) before
         its text: Picture…, S / M / L and Remove in the Header &
         Footer tools while editing. Pictures live in data.img
         (see modules/writer-hfimg.js), sit inside the margin and
         share the header / footer undo.
   DEPENDS: config, pages, storage, ui, view, ribbon (optional),
            hfimg (DW11), image (DW11, picture downscale)
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.hf = {};
/* (before DW11) Writer.hf.data = { head: ['', '', ''], foot: ['', '', ''] }; */
Writer.hf.data = { head: ['', '', ''], foot: ['', '', ''], img: { head: [null, null, null], foot: [null, null, null] } };
Writer.hf.editing = false;
Writer.hf.lastSlot = null;
Writer.hf.saveTimer = null;
Writer.hf.PARTS = ['head', 'foot'];
/* Own small undo for header / footer edits (typing pauses end a step). */
Writer.hf.undoStack = [];
Writer.hf.redoStack = [];
Writer.hf.prev = null;
Writer.hf.lastPush = 0;
Writer.hf.stepMs = 450;

/* (before DW11) Writer.hf.blank = function blank() { return { head: ['', '', ''], foot: ['', '', ''] }; }; */
Writer.hf.blank = function blank() {
  return { head: ['', '', ''], foot: ['', '', ''], img: { head: [null, null, null], foot: [null, null, null] } };
};

Writer.hf.get = function get() {
  var d = Writer.hf.data;
  /* (before DW11) return { head: d.head.slice(), foot: d.foot.slice() }; */
  var img = d.img || { head: [null, null, null], foot: [null, null, null] };
  return { head: d.head.slice(), foot: d.foot.slice(), img: { head: img.head.slice(), foot: img.foot.slice() } };
};

Writer.hf.isEmpty = function isEmpty(d) {
  d = d || Writer.hf.data;
  /* (before DW11) return !(d.head.join('') + d.foot.join('')).trim(); */
  if (Writer.hfimg && Writer.hfimg.hasAny(d.img)) return false;
  return !(d.head.join('') + d.foot.join('')).trim();
};

/* DW11: one part (head / foot) has text or a picture. */
Writer.hf.partEmpty = function partEmpty(part) {
  var d = Writer.hf.data;
  if (d.img && d.img[part] && (d.img[part][0] || d.img[part][1] || d.img[part][2])) return false;
  return !d[part].join('').trim();
};

/* Load a document's header / footer. A document saved before this
   feature (no `hf`) starts from the old global page-number setting. */
Writer.hf.set = function set(saved) {
  var d = Writer.hf.blank();
  var ok = saved && Array.isArray(saved.head) && Array.isArray(saved.foot);
  if (ok) {
    for (var k = 0; k < 3; k++) {
      d.head[k] = String(saved.head[k] || '');
      d.foot[k] = String(saved.foot[k] || '');
    }
    if (Writer.hfimg) d.img = Writer.hfimg.normPics(saved.img);   /* DW11: missing / broken -> no pictures */
  } else if (Writer.breaks && Writer.breaks.loadNumbers) {
    var n = Writer.breaks.loadNumbers();
    if (n.on) d.foot[n.pos === 'right' ? 2 : 1] = '{page}';
  }
  Writer.hf.data = d;
  Writer.hf.undoStack = [];
  Writer.hf.redoStack = [];
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
  if (a && a.classList.contains('hf-slot')) {
    /* (before DW11) a.textContent = H.data[a.parentNode.getAttribute('data-part')][+a.getAttribute('data-slot')]; */
    a.textContent = H.data[a.closest('.hf-box').getAttribute('data-part')][+a.getAttribute('data-slot')];
    var sel = window.getSelection();
    sel.selectAllChildren(a);
    sel.collapseToEnd();
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

/* The header or footer box of one paper (made on demand). */
Writer.hf.box = function box(paper, part) {
  var b = paper.querySelector(':scope > .hf-' + part);
  if (b) return b;
  b = document.createElement('div');
  b.className = 'hf-box hf-' + part;
  b.setAttribute('data-part', part);
  for (var k = 0; k < 3; k++) {
    /* DW11: each slot sits in a cell with its picture before the text. */
    var cell = document.createElement('div');
    cell.className = 'hf-cell hf-cell-' + ['left', 'center', 'right'][k];
    var pic = document.createElement('img');
    pic.className = 'hf-pic'; pic.alt = ''; pic.hidden = true; pic.draggable = false;
    pic.setAttribute('data-slot', String(k));
    cell.appendChild(pic);
    var s = document.createElement('div');
    s.className = 'hf-slot hf-slot-' + ['left', 'center', 'right'][k];
    s.setAttribute('data-slot', String(k));
    s.setAttribute('spellcheck', 'false');
    /* (before DW11) b.appendChild(s); */
    cell.appendChild(s);
    b.appendChild(cell);
  }
  paper.appendChild(b);
  return b;
};

/* Draw every page. In edit mode the raw template is shown. */
Writer.hf.render = function render() {
  var H = Writer.hf;
  var papers = document.querySelectorAll('.paper');
  var n = papers.length;
  var editable = 'plaintext-only';
  var lay = { head: H.picLayout('head'), foot: H.picLayout('foot') };   /* DW11 */
  for (var i = 0; i < n; i++) {
    for (var p = 0; p < 2; p++) {
      var part = H.PARTS[p];
      var b = H.box(papers[i], part);
      /* (before DW11) var empty = !H.data[part].join('').trim(); */
      var empty = H.partEmpty(part);
      b.classList.toggle('hf-empty', empty);
      H.drawPics(b, part, lay[part]);
      var slots = b.querySelectorAll('.hf-slot');
      for (var k = 0; k < 3; k++) {
        /* (before DW11) var s = b.children[k]; */
        var s = slots[k];
        var want = H.editing ? H.data[part][k] : H.fill(H.data[part][k], i + 1, n);
        if (s !== document.activeElement && s.textContent !== want) s.textContent = want;
        if (H.editing) {
          if (s.contentEditable !== editable) {
            s.contentEditable = editable;
            if (s.contentEditable !== editable) s.contentEditable = 'true';
          }
        } else if (s.isContentEditable) s.removeAttribute('contenteditable');
      }
    }
  }
  if (Writer.breaks && Writer.breaks.syncNumbers) Writer.breaks.syncNumbers();
  H.syncPicTools();
};

/* ----- DW11 pictures ---------------------------------------- */

Writer.hf.pics = function pics() {
  var d = Writer.hf.data;
  if (!d.img) d.img = { head: [null, null, null], foot: [null, null, null] };
  return d.img;
};

/* Heights (mm) of one part's pictures and where its box sits. */
Writer.hf.picLayout = function picLayout(part) {
  var I = Writer.hfimg, row = Writer.hf.pics()[part];
  var cfg = Writer.config;
  var margin = (part === 'head' ? cfg.marginTopCm : cfg.marginBottomCm) * 10;
  var hs = [0, 0, 0], any = false, boxH = I ? I.TEXT_MM : 4.2;
  for (var k = 0; k < 3; k++) {
    if (!row[k] || !I) continue;
    hs[k] = I.heightMm(row[k].size, margin);
    boxH = Math.max(boxH, hs[k]);
    any = true;
  }
  return { any: any, hs: hs, edge: any ? I.boxTop(margin, boxH) : 0 };
};

/* Show / hide each slot's picture in one box; place the box in the margin. */
Writer.hf.drawPics = function drawPics(b, part, lay) {
  var row = Writer.hf.pics()[part];
  var side = part === 'head' ? 'top' : 'bottom';
  var want = lay.any ? lay.edge.toFixed(2) + 'mm' : '';
  if (b.style[side] !== want) b.style[side] = want;   /* '' keeps the CSS place (text only) */
  b.classList.toggle('hf-has-pics', lay.any);
  var imgs = b.querySelectorAll('.hf-pic');
  for (var k = 0; k < 3; k++) {
    var im = imgs[k], pic = row[k];
    im.parentNode.classList.toggle('hf-has-pic', !!pic);
    if (!pic) { if (!im.hidden) { im.hidden = true; im.removeAttribute('src'); } continue; }
    if (im.getAttribute('src') !== pic.src) im.setAttribute('src', pic.src);
    var h = lay.hs[k].toFixed(2) + 'mm';
    if (im.style.height !== h) im.style.height = h;
    im.hidden = false;
  }
};

/* Part + slot of the slot being edited ({ part, k } or null). */
Writer.hf.activeSlot = function activeSlot() {
  var s = Writer.hf.lastSlot;
  if (!s || !document.contains(s)) return null;
  var b = s.closest('.hf-box');
  return b ? { part: b.getAttribute('data-part'), k: +s.getAttribute('data-slot') } : null;
};

/* Put a picture (or null) in one slot as one undo step. */
Writer.hf.setPic = function setPic(part, k, pic) {
  var H = Writer.hf;
  if (H.PARTS.indexOf(part) === -1 || !(k >= 0 && k < 3)) return;
  H.record(true);
  H.pics()[part][k] = pic ? (Writer.hfimg ? Writer.hfimg.normPic(pic) : pic) : null;
  H.prev = H.get();
  H.lastPush = 0;
  H.render();
  H.changed();
};

Writer.hf.sizePic = function sizePic(size) {
  var H = Writer.hf, a = H.activeSlot();
  if (!a) return;
  var cur = H.pics()[a.part][a.k];
  if (!cur || cur.size === size) return;
  H.setPic(a.part, a.k, { src: cur.src, size: size });
  H.refocus();
};

Writer.hf.removePic = function removePic() {
  var H = Writer.hf, a = H.activeSlot();
  if (!a || !H.pics()[a.part][a.k]) return;
  H.setPic(a.part, a.k, null);
  H.refocus();
};

/* Picture… : file picker, downscale, then into the slot that was active. */
Writer.hf.pickPic = function pickPic() {
  var H = Writer.hf;
  if (!H.editing) H.enter({ name: 'head' }, 0);
  var a = H.activeSlot(), file = document.getElementById('hfPicFile');
  if (!a || !file) return;
  H.pickFor = a;
  file.value = '';
  file.click();
};

Writer.hf.onPicFile = function onPicFile() {
  var H = Writer.hf, file = document.getElementById('hfPicFile');
  var f = file && file.files && file.files[0], a = H.pickFor;
  H.pickFor = null;
  if (!f || !a) return;
  if (!/^image\//.test(f.type || '')) { H.note('That file is not a picture.'); return; }
  var max = Writer.hfimg ? Writer.hfimg.MAX_PX : 600;
  Writer.image.load(f, max).then(function (src) {
    var old = H.pics()[a.part][a.k];
    H.setPic(a.part, a.k, { src: src, size: old ? old.size : 'M' });
    if (!H.pics()[a.part][a.k]) H.note('That picture could not be used.');
    H.refocus();
  }).catch(function (err) {
    console.warn('writer: header picture failed', err);
    H.note('That picture could not be read.');
  });
};

Writer.hf.note = function note(msg) {
  if (Writer.ui && Writer.ui.showToast) Writer.ui.showToast(msg);
};

/* Back to the active slot's text after a tool click. */
Writer.hf.refocus = function refocus() {
  var s = Writer.hf.lastSlot;
  if (!Writer.hf.editing || !s || !document.contains(s)) return;
  if (document.activeElement !== s) {
    s.focus();
    var sel = window.getSelection();
    sel.selectAllChildren(s);
    sel.collapseToEnd();
  }
};

/* Picture tools follow the active slot: S / M / L / Remove only when it has one. */
Writer.hf.syncPicTools = function syncPicTools() {
  var H = Writer.hf;
  var opts = document.getElementById('hfPicOpts'), where = document.getElementById('hfPicWhere');
  var btn = document.getElementById('hfPicBtn');
  if (!opts) return;
  var a = H.editing ? H.activeSlot() : null;
  var pic = a ? H.pics()[a.part][a.k] : null;
  opts.hidden = !pic;
  var tight = false;   /* the margin is too small for the chosen size */
  if (pic && Writer.hfimg) {
    var m = (a.part === 'head' ? Writer.config.marginTopCm : Writer.config.marginBottomCm) * 10;
    tight = Writer.hfimg.heightMm(pic.size, m) < Writer.hfimg.SIZES[pic.size];
  }
  if (where) {
    where.textContent = a ? (a.part === 'head' ? 'Header ' : 'Footer ') + ['left', 'centre', 'right'][a.k] + (tight ? ' (small margin):' : ':') : '';
    where.title = tight ? 'The page margin limits the picture size. Page \u203a Margins makes room.' : '';
  }
  if (btn) btn.title = pic ? 'Replace this slot\u2019s picture' : 'Add a picture (e.g. a logo) to this slot';
  var sizes = opts.querySelectorAll('[data-hf-size]');
  for (var i = 0; i < sizes.length; i++) {
    var hit = !!pic && sizes[i].getAttribute('data-hf-size') === pic.size;
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
  var target = paper.querySelector('.hf-' + ((part && part.name) || 'head') + ' [data-slot="' + (slot == null ? 1 : slot) + '"]');
  if (target) {
    target.focus();
    var sel = window.getSelection();
    sel.selectAllChildren(target);
    sel.collapseToEnd();
    H.lastSlot = target;
  }
  H.syncPicTools();   /* DW11 */
};

Writer.hf.exit = function exit() {
  var H = Writer.hf;
  if (!H.editing) return;
  H.editing = false;
  document.body.classList.remove('hf-editing');
  var tools = document.getElementById('hfTools');
  if (tools) tools.hidden = true;
  var btn = document.getElementById('hfBtn');
  if (btn) { btn.classList.remove('active'); btn.setAttribute('aria-pressed', 'false'); }
  if (document.activeElement && document.activeElement.classList.contains('hf-slot')) document.activeElement.blur();
  H.render();
  H.changed();
};

/* Insert a field token at the caret of the slot being edited. */
Writer.hf.insertField = function insertField(token) {
  var H = Writer.hf;
  if (!H.editing) H.enter({ name: 'foot' }, 1);
  var s = H.lastSlot;
  if (!s) return;
  if (document.activeElement !== s) {
    s.focus();
    var sel = window.getSelection();
    sel.selectAllChildren(s);
    sel.collapseToEnd();
  }
  H.record(true);
  H.fieldStep = true;   /* the field is its own step */
  var cur = s.textContent;
  var t = (cur && !/\s$/.test(cur) ? ' ' : '') + token;
  if (!document.execCommand('insertText', false, t)) { s.textContent = cur + t; H.onInput({ target: s }); }
};

/* One slot changed: store it and copy it to the same slot on every page. */
Writer.hf.onInput = function onInput(e) {
  var s = e.target;
  if (!s || !s.classList || !s.classList.contains('hf-slot')) return;
  /* (before DW11) var part = s.parentNode.getAttribute('data-part'); */
  var part = s.closest('.hf-box').getAttribute('data-part');
  var k = +s.getAttribute('data-slot');
  if (Writer.hf.fieldStep) { Writer.hf.fieldStep = false; Writer.hf.lastPush = 0; }
  else Writer.hf.record(false);
  Writer.hf.data[part][k] = s.textContent.replace(/\n/g, ' ');
  Writer.hf.lastSlot = s;
  Writer.hf.prev = Writer.hf.get();
  Writer.hf.render();
  Writer.hf.changed();
};

/* Page-number buttons (Page tab) now edit the footer. */
Writer.hf.setNumbers = function setNumbers(on, pos) {
  var H = Writer.hf;
  try {
    localStorage.setItem(Writer.config.storageKeyPageNumbers, on ? '1' : '0');
    localStorage.setItem(Writer.config.storageKeyPageNumberPos, pos === 'right' ? 'right' : 'center');
  } catch (e) {}
  H.record(true);
  var f = H.data.foot;
  if (f[1] === '{page}') f[1] = '';
  if (f[2] === '{page}') f[2] = '';
  if (on) f[pos === 'right' ? 2 : 1] = '{page}';
  H.prev = H.get();
  H.render();
  H.changed();
};

/* Page-number buttons show which footer slot holds a bare {page}. */
Writer.hf.syncNumbers = function syncNumbers() {
  var f = Writer.hf.data.foot;
  var key = f[1] === '{page}' ? 'center' : (f[2] === '{page}' ? 'right' : 'off');
  var opts = document.querySelectorAll('#pagePanel .seg-btn[data-pn]');
  for (var i = 0; i < opts.length; i++) {
    var hit = opts[i].getAttribute('data-pn') === key;
    opts[i].classList.toggle('active', hit);
    opts[i].setAttribute('aria-pressed', hit ? 'true' : 'false');
  }
};

/* Which margin (if any) a point on a paper is in. */
Writer.hf.marginAt = function marginAt(paper, x, y) {
  var r = paper.getBoundingClientRect();
  var z = (Writer.view && Writer.view.zoom) || 1;
  var cm = Writer.view ? Writer.view.CM_PX : 96 / 2.54;
  var cfg = Writer.config;
  var part = null;
  if (y - r.top < cfg.marginTopCm * cm * z) part = 'head';
  else if (r.bottom - y < cfg.marginBottomCm * cm * z) part = 'foot';
  if (!part) return null;
  var third = Math.min(2, Math.max(0, Math.floor((x - r.left) / (r.width / 3))));
  return { name: part, paper: paper, slot: third };
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
  Writer.ui.onClick('hfBtn', function () { if (H.editing) H.exit(); else H.enter({ name: 'head' }, 1); });
  Writer.ui.onClick('hfCloseBtn', function () { H.exit(); });
  var fields = document.querySelectorAll('#hfTools [data-hf-field]');
  for (var i = 0; i < fields.length; i++) {
    (function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function (e) { e.preventDefault(); H.insertField(b.getAttribute('data-hf-field')); });
    })(fields[i]);
  }
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
    ws.addEventListener('focusin', function (e) {
      /* (before DW11) if (e.target.classList && e.target.classList.contains('hf-slot')) H.lastSlot = e.target; */
      if (e.target.classList && e.target.classList.contains('hf-slot')) { H.lastSlot = e.target; H.syncPicTools(); }
    });
    /* DW11: a click on a picture while editing makes its slot the active one. */
    ws.addEventListener('mousedown', function (e) {
      if (!H.editing || !e.target.classList || !e.target.classList.contains('hf-pic')) return;
      e.preventDefault();
      var slot = e.target.parentNode.querySelector('.hf-slot');
      if (slot) { H.lastSlot = slot; H.refocus(); H.syncPicTools(); }
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
  /* A click anywhere outside the header / footer and its tools ends editing. */
  document.addEventListener('mousedown', function (e) {
    if (!H.editing) return;
    if (e.target.closest('.hf-box, #hfTools, #hfBtn')) return;
    H.exit();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (!H.editing) return;
    var inSlot = e.target.classList && e.target.classList.contains('hf-slot');
    if (e.key === 'Escape') { e.preventDefault(); H.exit(); return; }
    if (inSlot && e.key === 'Enter') e.preventDefault();   /* one line per slot */
    if (inSlot && (e.ctrlKey || e.metaKey) && !e.altKey) {
      var key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); H.restore(H.undoStack, H.redoStack); }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); e.stopPropagation(); H.restore(H.redoStack, H.undoStack); }
    }
  }, true);
  H.render();
};
