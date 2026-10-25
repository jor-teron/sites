/* ============================================================
   FILE: modules/draftly-image.js
   PROJECT: Draftly
   ROLE: DF2 Insert > Image. File picker, downscale to 1600px
         (JPEG 0.85, or PNG when small and transparent), insert
         at the caret as its own block. Click an image to select:
         corner handle resizes (mouse + touch, keeps aspect) and
         25 / 50 / 100% buttons. Delete / Backspace removes it.
   MODEL: <p class="dl-img-block"><img src="data:..." style="width:N%">
          Width is a % of the page content width, so print, PDF
          and DOCX (draftly-docxgen.js) follow it. draftly-flow.js
          moves an image block whole to the next page.
          Handle + size bar live in <body>, never in the document.
   DEPENDS: Draftly.breaks, Draftly.history, Draftly.editor,
            Draftly.table (insert helper pattern), Draftly.pages
   ============================================================ */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.image = { MAX_W: 1600, Q: 0.85, PNG_MAX: 400 * 1024, sel: null };

/* File -> downscaled data URL (Promise). */
Draftly.image.load = function load(file) {
  var I = Draftly.image;
  return new Promise(function (res, rej) {
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () {
      URL.revokeObjectURL(url);
      var w = im.naturalWidth, h = im.naturalHeight;
      if (!w || !h) return rej(new Error('bad image'));
      if (w > I.MAX_W) { h = Math.round(h * I.MAX_W / w); w = I.MAX_W; }
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var g = c.getContext('2d'); g.drawImage(im, 0, 0, w, h);
      var alpha = false;
      if (/png|gif|webp/.test(file.type)) {
        var d = g.getImageData(0, 0, w, h).data;
        for (var i = 3; i < d.length; i += 16) if (d[i] < 250) { alpha = true; break; }
      }
      var png = alpha ? c.toDataURL('image/png') : null;
      if (png && png.length * 0.75 <= I.PNG_MAX) return res(png);
      g.globalCompositeOperation = 'destination-over';   /* JPEG: white behind transparency */
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      res(c.toDataURL('image/jpeg', I.Q));
    };
    im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('unreadable image')); };
    im.src = url;
  });
};

/* Insert a data URL at the caret as its own block. */
Draftly.image.insert = function insert(src) {
  var sel = window.getSelection();
  if ((!sel.rangeCount || !Draftly.breaks.topBlock(sel.anchorNode)) && Draftly.editor.restoreSelection) {
    Draftly.editor.restoreSelection(); sel = window.getSelection();
  }
  var block = sel.rangeCount ? Draftly.breaks.topBlock(sel.anchorNode) : null;
  var editor, after = null;
  if (!block || (Draftly.table && Draftly.table.current())) {
    editor = Draftly.pages.firstEditor();
    if (!editor) return null;
    block = block && block.closest('table') ? block : editor.lastElementChild;
  } else {
    if (!sel.isCollapsed) sel.deleteFromDocument();
    var r = sel.getRangeAt(0), tail = document.createRange();
    tail.setStart(r.startContainer, r.startOffset);
    tail.setEnd(block, block.childNodes.length);
    var frag = tail.extractContents();
    after = block.cloneNode(false);
    after.removeAttribute('id');
    after.removeAttribute(Draftly.flow.CONT);
    after.classList.remove('dl-img-block');
    after.appendChild(frag);
    if (!after.textContent.length && !after.querySelector('br,img')) after.innerHTML = '<br>';
    if (!block.textContent.length && !block.querySelector('br,img')) block.innerHTML = '<br>';
  }
  editor = block ? block.parentElement : Draftly.pages.firstEditor();
  var p = document.createElement('p'); p.className = 'dl-img-block';
  var img = document.createElement('img');
  img.src = src; img.alt = ''; img.style.width = '100%'; img.style.maxWidth = '100%';
  p.appendChild(img);
  if (!after) { after = document.createElement('p'); after.innerHTML = '<br>'; }
  editor.insertBefore(p, block ? block.nextSibling : null);
  editor.insertBefore(after, p.nextSibling);
  if (block && block.tagName === 'P' && !block.textContent.length && !block.querySelector('img') && block.previousElementSibling) block.remove();
  var rg = document.createRange(); rg.setStart(after, 0); rg.collapse(true);
  sel.removeAllRanges(); sel.addRange(rg);
  Draftly.breaks.changed();
  return img;
};

/* Set width (% of content width), reflow. */
Draftly.image.setWidth = function setWidth(img, pct) {
  img.style.width = Math.max(5, Math.min(100, Math.round(pct))) + '%';
  img.style.maxWidth = '100%';
  Draftly.breaks.changed();
  Draftly.image.place();
};

Draftly.image.remove = function remove(img) {
  var p = img.parentElement;
  img.remove();
  if (p && p.classList.contains('dl-img-block') && !p.textContent.length && !p.querySelector('img')) p.remove();
  Draftly.image.select(null);
  Draftly.breaks.changed();
};

/* ----- selection UI (handle + size bar in <body>) */
Draftly.image.select = function select(img) {
  var I = Draftly.image;
  I.sel = img;      /* no class on the img: keeps saved HTML and undo clean */
  I.place();
};

Draftly.image.place = function place() {
  var I = Draftly.image, h = I.handle, bar = I.bar;
  if (!h) return;
  var img = I.sel && document.contains(I.sel) ? I.sel : null;
  var fr = I.frame;
  if (!img) { h.hidden = true; bar.hidden = true; fr.hidden = true; if (I.sel && !img) I.sel = null; return; }
  var r = img.getBoundingClientRect();
  h.hidden = false; bar.hidden = false; fr.hidden = false;
  fr.style.left = r.left + 'px'; fr.style.top = r.top + 'px';
  fr.style.width = r.width + 'px'; fr.style.height = r.height + 'px';
  h.style.left = (r.right - 22) + 'px'; h.style.top = (r.bottom - 22) + 'px';
  var bw = bar.offsetWidth || 180;
  bar.style.left = Math.max(4, Math.min(window.innerWidth - bw - 4, r.left)) + 'px';
  bar.style.top = Math.max(4, r.top - 52) + 'px';
};

Draftly.image.contentWidth = function contentWidth(img) {
  var p = img.parentElement;
  return (p && p.getBoundingClientRect().width) || img.getBoundingClientRect().width || 1;
};

Draftly.image.startDrag = function startDrag(e) {
  var I = Draftly.image, img = I.sel;
  if (!img) return;
  e.preventDefault();
  var x0 = e.clientX, w0 = img.getBoundingClientRect().width, cw = I.contentWidth(img);
  Draftly.history.checkpoint();
  try { I.handle.setPointerCapture(e.pointerId); } catch (er) {}
  function move(ev) {
    img.style.width = Math.max(5, Math.min(100, (w0 + ev.clientX - x0) / cw * 100)).toFixed(1) + '%';
    I.place();
  }
  function up() {
    I.handle.removeEventListener('pointermove', move);
    I.handle.removeEventListener('pointerup', up);
    I.handle.removeEventListener('pointercancel', up);
    I.setWidth(img, parseFloat(img.style.width));
    Draftly.history.commit();
  }
  I.handle.addEventListener('pointermove', move);
  I.handle.addEventListener('pointerup', up);
  I.handle.addEventListener('pointercancel', up);
};

Draftly.image.init = function init() {
  var I = Draftly.image;
  var btn = document.getElementById('imageBtn'), file = document.getElementById('imageFile');
  if (!btn || !file) return;
  btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
  btn.addEventListener('click', function () { file.value = ''; file.click(); });
  file.addEventListener('change', function () {
    var f = file.files && file.files[0];
    if (!f) return;
    I.load(f).then(function (src) {
      Draftly.history.checkpoint();
      var img = I.insert(src);
      Draftly.history.commit();
      if (img) img.addEventListener('load', function () { Draftly.breaks.changed(); }, { once: true });
    }).catch(function (err) { console.warn('draftly: image insert failed', err); });
  });

  var h = I.handle = document.createElement('div');
  h.className = 'dl-img-handle'; h.hidden = true;
  h.setAttribute('aria-label', 'Resize image'); h.setAttribute('role', 'slider');
  h.innerHTML = '<span></span>';
  h.addEventListener('pointerdown', I.startDrag);
  var bar = I.bar = document.createElement('div');
  bar.className = 'dl-img-bar'; bar.hidden = true; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Image size');
  [25, 50, 100].forEach(function (n) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'dl-img-size'; b.dataset.pct = n; b.textContent = n + '%';
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function () {
      if (!I.sel) return;
      Draftly.history.checkpoint(); I.setWidth(I.sel, n); Draftly.history.commit();
    });
    bar.appendChild(b);
  });
  var fr = I.frame = document.createElement('div');
  fr.className = 'dl-img-frame'; fr.hidden = true;
  document.body.appendChild(fr); document.body.appendChild(h); document.body.appendChild(bar);

  document.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.dl-img-handle,.dl-img-bar')) return;
    var img = e.target.closest && e.target.closest('img');
    I.select(img && Draftly.editor.isInEditor(img) ? img : null);
  }, true);
  document.addEventListener('keydown', function (e) {
    if (!I.sel || !document.contains(I.sel)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); e.stopPropagation();
      Draftly.history.checkpoint(); I.remove(I.sel); Draftly.history.commit();
    } else if (e.key === 'Escape') I.select(null);
    else if (e.key.length === 1 || e.key === 'Enter') I.select(null);
  }, true);
  /* undo / redo / reload replace the DOM: drop the stale selection */
  var apply = Draftly.history.apply;
  Draftly.history.apply = function () { var out = apply.apply(this, arguments); I.select(null); return out; };
  window.addEventListener('resize', I.place);
  document.addEventListener('scroll', I.place, true);
};

Draftly.image.init();
