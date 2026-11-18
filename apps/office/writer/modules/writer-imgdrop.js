/* ============================================================
   FILE: modules/writer-imgdrop.js
   PROJECT: Writer
   ROLE: DW13b drag and drop of picture files (png / jpeg / gif / webp).
         - onto the page body: inserted where they are dropped (caret from
           caretRangeFromPoint / caretPositionFromPoint; else the current
           caret, else the end of the document), downscaled by
           Writer.image.load, all pictures of one drop as one undo step.
         - onto a header / footer slot (also the margin of an empty header /
           footer): the first picture becomes that slot's picture at size M
           (600 px, Writer.hf.setPic: one header / footer undo step), like
           DW13 paste and DW11 Picture….
         - onto anything else (ribbon, dialogs): nothing (the browser does
           not open the file either).
         Called from the document drop handler in writer-docxopen.js, which
         still opens .how / .docx / .odt / .txt first. Drags without files
         (e.g. moving a picture inside Writer) are never touched.
   DEPENDS: Writer.image, Writer.hf, Writer.hfimg, Writer.history,
            Writer.editor, Writer.ui
   ============================================================ */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.imgdrop = {
  TYPES: /^image\/(png|jpe?g|pjpeg|gif|webp)$/i,
  EXT: /\.(png|jpe?g|gif|webp)$/i,
  over: null      /* header / footer cell outlined during dragover */
};

/* A drag that carries files (not text, links or a picture moved inside the page). */
Writer.imgdrop.hasFiles = function hasFiles(e) {
  return !!(e && e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1);
};

/* A picture file Writer can insert. */
Writer.imgdrop.isImage = function isImage(f) {
  var D = Writer.imgdrop;
  if (!f) return false;
  if (f.type) return D.TYPES.test(f.type);
  return D.EXT.test(f.name || '');
};

/* Any other image/* file (svg, bmp, tiff...): not inserted, but the browser must not open it. */
Writer.imgdrop.isOtherImage = function isOtherImage(f) {
  return !!f && /^image\//i.test(f.type || '') && !Writer.imgdrop.isImage(f);
};

/* The picture files of a drop, in order. */
Writer.imgdrop.images = function images(files) {
  var out = [];
  for (var i = 0; files && i < files.length; i++) if (Writer.imgdrop.isImage(files[i])) out.push(files[i]);
  return out;
};

/* During dragover only the item types are known. */
Writer.imgdrop.dragHasImage = function dragHasImage(e) {
  var it = e && e.dataTransfer && e.dataTransfer.items;
  if (!it) return false;
  for (var i = 0; i < it.length; i++) if (it[i].kind === 'file' && Writer.imgdrop.TYPES.test(it[i].type || '')) return true;
  return false;
};

function imgdropEl(t) { return t && t.nodeType === 1 ? t : (t && t.parentElement) || null; }
function imgdropIn(r, x, y, pad) { return r && x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad; }

/* Header / footer slot under the point: { part, k, cell, slot, paper } or null.
   An empty header / footer box is hidden (visibility), so a drop in that margin
   lands on the paper: the box's rectangle decides. */
Writer.imgdrop.slotAt = function slotAt(target, x, y) {
  var el = imgdropEl(target);
  if (!el || !el.closest) return null;
  var cell = el.closest('.hf-cell'), box = cell ? cell.closest('.hf-box') : el.closest('.hf-box');
  if (!box) {
    var paper = el.closest('.paper');
    if (!paper || Writer.editor.isInEditor(el)) return null;
    var boxes = paper.querySelectorAll('.hf-box');
    for (var b = 0; b < boxes.length && !box; b++) if (imgdropIn(boxes[b].getBoundingClientRect(), x, y, 6)) box = boxes[b];
    if (!box) return null;
  }
  var cells = box.querySelectorAll('.hf-cell');
  if (!cells.length) return null;
  if (!cell) {
    var best = null, bd = Infinity;
    for (var i = 0; i < cells.length; i++) {
      var r = cells[i].getBoundingClientRect();
      var d = x < r.left ? r.left - x : (x > r.right ? x - r.right : 0);
      if (d < bd) { bd = d; best = cells[i]; }
    }
    cell = best;
  }
  var k = Array.prototype.indexOf.call(cells, cell);
  var part = box.getAttribute('data-part');
  if (k < 0 || (part !== 'head' && part !== 'foot')) return null;
  return { part: part, k: k, cell: cell, slot: cell.querySelector('.hf-slot'), paper: box.closest('.paper') };
};

/* Caret range at the point, inside a page editor (or null). */
Writer.imgdrop.caretAt = function caretAt(x, y) {
  var r = null;
  try {
    if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(x, y);
    else if (document.caretPositionFromPoint) {
      var p = document.caretPositionFromPoint(x, y);
      if (p && p.offsetNode) { r = document.createRange(); r.setStart(p.offsetNode, p.offset); r.collapse(true); }
    }
  } catch (er) { r = null; }
  if (!r || !Writer.editor.isInEditor(r.startContainer)) return null;
  /* dropped on a picture: go after its block rather than splitting it */
  var el = imgdropEl(r.startContainer), blk = el && el.closest ? el.closest('.dl-img-block') : null;
  if (blk) { r.selectNodeContents(blk); r.collapse(false); }
  return r;
};

/* Where a drop goes: 'slot' (header / footer), 'body' (the page area) or 'chrome'. */
Writer.imgdrop.where = function where(e) {
  var D = Writer.imgdrop, el = imgdropEl(e.target);
  var s = D.slotAt(el, e.clientX, e.clientY);
  if (s) return { kind: 'slot', slot: s };
  if (el && el.closest && el.closest('#workspace')) return { kind: 'body', range: D.caretAt(e.clientX, e.clientY) };
  return { kind: 'chrome' };
};

/* Header / footer: the first picture becomes the slot's picture at size M. */
Writer.imgdrop.toSlot = function toSlot(s, file) {
  var H = Writer.hf;
  if (!H || !H.setPic || !Writer.image) return Promise.resolve(false);
  if (!H.editing) H.enter({ name: s.part, paper: s.paper }, s.k);
  else if (s.slot) H.lastSlot = s.slot;
  var max = Writer.hfimg ? Writer.hfimg.MAX_PX : 600;
  return Writer.image.load(file, max).then(function (url) {
    H.setPic(s.part, s.k, { src: url, size: 'M' });
    if (!H.pics()[s.part][s.k]) H.note('That picture could not be used.');
    if (s.slot) H.lastSlot = s.slot;
    if (H.refocus) H.refocus();
    if (H.syncPicTools) H.syncPicTools();
    return true;
  }).catch(function () { H.note('That picture could not be read.'); return false; });
};

/* Page body: every picture, in order, at the drop point, as one undo step. */
Writer.imgdrop.toBody = function toBody(range, files) {
  var I = Writer.image;
  if (Writer.hf && Writer.hf.editing && Writer.hf.exit) Writer.hf.exit();
  return Promise.all(files.map(function (f) { return I.load(f).catch(function () { return null; }); })).then(function (urls) {
    var ok = urls.filter(Boolean);
    if (!ok.length) { Writer.ui.showToast(files.length > 1 ? 'Those pictures could not be read.' : 'That picture could not be read.'); return 0; }
    if (range && document.contains(range.startContainer)) {
      var el = imgdropEl(range.startContainer), ed = el && el.closest ? el.closest('.' + Writer.config.editorClass) : null;
      if (ed && ed.focus) { try { ed.focus({ preventScroll: true }); } catch (er) { ed.focus(); } }
      var sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
    }
    Writer.history.checkpoint();
    ok.forEach(function (u) {
      var img = I.insert(u);
      if (img && img.addEventListener) img.addEventListener('load', function () { Writer.breaks.changed(); }, { once: true });
    });
    Writer.history.commit();
    if (Writer.editor.saveSelection) Writer.editor.saveSelection();
    if (ok.length < urls.length) Writer.ui.showToast((urls.length - ok.length) + ' of ' + urls.length + ' pictures could not be read.');
    return ok.length;
  });
};

/* Drop with picture files (writer-docxopen.js has already called preventDefault). */
Writer.imgdrop.drop = function drop(e) {
  var D = Writer.imgdrop;
  D.mark(null);
  var files = D.images(e.dataTransfer && e.dataTransfer.files);
  if (!files.length) return Promise.resolve(null);
  var w = D.where(e);
  if (w.kind === 'slot') return D.toSlot(w.slot, files[0]);
  if (w.kind === 'body') return D.toBody(w.range, files);
  return Promise.resolve(null);   /* ribbon, dialogs: nothing */
};

/* Optional outline on the header / footer slot under a dragged picture. */
Writer.imgdrop.mark = function mark(cell) {
  var D = Writer.imgdrop;
  if (D.over === cell) return;
  if (D.over && D.over.classList) D.over.classList.remove('hf-drop');
  D.over = cell || null;
  if (D.over && D.over.classList) D.over.classList.add('hf-drop');
};

Writer.imgdrop.onOver = function onOver(e) {
  var D = Writer.imgdrop;
  if (!D.hasFiles(e) || !D.dragHasImage(e)) { D.mark(null); return; }
  var s = D.slotAt(e.target, e.clientX, e.clientY);
  D.mark(s ? s.cell : null);
};

document.addEventListener('dragover', Writer.imgdrop.onOver);
document.addEventListener('dragleave', function (e) { if (!e.relatedTarget) Writer.imgdrop.mark(null); });
document.addEventListener('dragend', function () { Writer.imgdrop.mark(null); });
