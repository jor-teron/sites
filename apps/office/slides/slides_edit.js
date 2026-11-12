/* Hub Office Slides SL1 — the slide canvas (SLEdit). A 960 x 540 design slide scaled with one CSS transform to fit the
   stage (ResizeObserver).
   SL2: SLEdit.html(slide, i, o) is the one static slide renderer (same design classes), used by the thumbnails
   (o.max = 9 lines) and by Present (slides_show.js: every line, wrapped).
   SL3: layouts, deck themes, pictures. The slide carries 'lay-<layout> th-<theme>' (+ an inline --s-bg); the editor,
     the thumbnails and Present all use these classes and the same placeholder order (.s-picph, title, .s-cols > body
     [+ body2], .pics), so CSS places them identically everywhere (paint()). Pictures sit in .pics; click to select,
     drag to move, 8 handles to resize (Shift keeps the aspect ratio), arrows nudge; the picture bar sets Crop / Fit /
     Original shape / Delete. Finished changes call o.onObj(slide, before, label) for save + Undo.
   SL5: title, body, body2 and free text boxes are contenteditable, backed by the SLText model (runs + paragraphs, not
     raw HTML). Tab / Shift+Tab indent, Enter keeps the indent, Backspace at the start outdents, Enter on the title
     goes to the bullets. Format (bold / italic / underline, size, colour, highlight, align, list type) is applied to
     the model. Free text boxes (.tboxes, above pictures) move / resize with the same handles; click selects, double-click
     or Enter edits. Thumbnails, Present and Print use the same renderer, so styling matches the editor.
   SL6: shapes and tables live with pictures and text boxes in #objs (shared z-order). Shapes have fill / outline and
     SL5 text inside (except line / arrow). Tables have equal cells, a header row, and SL5 cell text. Shift-click
     multi-selects; arrange aligns, distributes and changes z-order; drag snaps to the slide centre and edges.
   SL10: doFit() returns at once if the stage, fit box or slide element is not ready yet, so an early fit() (for
     example from the notes pane, before init) cannot throw and abort the rest of start-up. */
(function () {
  'use strict';
  var W = 960, H = 540;
  var $ = function (id) { return document.getElementById(id); };
  var title, body, body2, fit, stage, slideEl, picsEl, boxesEl, shapesEl, tablesEl, objsEl, sellayer, guidesEl, picph, picbar, tbbar, shpbar, tblbar, arrbar, cur = null, theme = 'light';
  var onChange = function () {}, onObj = function () {}, onPickPic = function () {}, onFmt = function () {}, scale = 1;
  var SLOTS = { title: { t: 1, b: 'plain' }, tc: { t: 1, b: 'bul' }, two: { t: 1, b: 'bul', b2: 1 }, sec: { t: 1, b: 'plain' },
    pic: { t: 1, b: 'plain', ph: 1 }, to: { t: 1 }, blank: {} };
  var HINTS = { title: ['Click to add a title', 'Click to add a subtitle'], sec: ['Click to add a section title', 'Click to add text'],
    pic: ['Click to add a heading', 'Click to add a caption'], two: ['Click to add a title', 'Left column: one bullet per line'] };
  var BUL_HINT = 'Click to add bullets: one per line, Tab to indent';
  function slots(s) { return SLOTS[(s && s.layout) || 'tc'] || SLOTS.tc; }
  var deckCtx = null;
  function cls(s, th) {
    var id = th || (deckCtx && deckCtx.theme) || 'light';
    if (window.SLSave && SLSave.THEME_IDS && SLSave.THEME_IDS.indexOf(id) < 0) id = 'light';
    return 'lay-' + ((s && SLOTS[s.layout]) ? s.layout : 'tc') + ' th-' + id;
  }
  function bgStyle(s) { return s && s.bg ? '--s-bg:' + s.bg : ''; }
  function paint(el, s, i, o, th, base) {
    el.className = base + ' ' + cls(s, th);
    el.style.removeProperty('--s-bg');
    if (s && s.bg) el.style.setProperty('--s-bg', s.bg);
    if (o) el.innerHTML = html(s, i, o);
  }
  function escq(x) { return SLText.escq(x); }
  function defList(slot) {
    if (slot === 'title') return 'none';
    if (slot && (slot.indexOf('tb:') === 0 || slot.indexOf('sh:') === 0 || slot.indexOf('tc:') === 0)) return 'none';
    if (slot === 'body' && slots(cur).b === 'plain') return 'none';
    return 'bullet';
  }
  function parseTc(slot) {
    var m = /^tc:([^:]+):(\d+):(\d+)$/.exec(slot || '');
    return m ? { id: m[1], r: +m[2], c: +m[3] } : null;
  }
  function hasList(doc) {
    return (SLText.clean(doc).paragraphs || []).some(function (p) { return p.list === 'bullet' || p.list === 'number'; });
  }
  function docOf(slot) {
    if (!cur) return SLText.empty(defList(slot));
    if (slot === 'title') return cur.title;
    if (slot === 'body2') return cur.body2;
    if (slot.indexOf('tb:') === 0) {
      var t = tbById(slot.slice(3)); return t ? t.doc : SLText.empty('none');
    }
    if (slot.indexOf('sh:') === 0) {
      var sh = shById(slot.slice(3)); return sh && sh.doc ? sh.doc : SLText.empty('none');
    }
    if (slot.indexOf('tc:') === 0) {
      var p = parseTc(slot), tb = p && tblById(p.id), cell = tb && tb.cells[p.r] && tb.cells[p.r][p.c];
      return cell ? cell.doc : SLText.empty('none');
    }
    return cur.body;
  }
  function writeSlot(slot, doc) {
    if (!cur) return;
    if (slot === 'title') cur.title = doc;
    else if (slot === 'body2') cur.body2 = doc;
    else if (slot.indexOf('tb:') === 0) { var t = tbById(slot.slice(3)); if (t) t.doc = doc; }
    else if (slot.indexOf('sh:') === 0) { var sh = shById(slot.slice(3)); if (sh) sh.doc = doc; }
    else if (slot.indexOf('tc:') === 0) {
      var p = parseTc(slot), tb = p && tblById(p.id);
      if (tb && tb.cells[p.r] && tb.cells[p.r][p.c]) tb.cells[p.r][p.c].doc = doc;
    }
    else cur.body = doc;
  }
  function elSlot(el) { return el && el.dataset ? el.dataset.slot : ''; }

  function doFit() {
    /* (before SL10) var r = stage.getBoundingClientRect(), pos = $('pos'); */
    if (!stage || !fit || !slideEl) return;
    var r = stage.getBoundingClientRect(), pos = $('pos');
    var bar = 0;
    [picbar, tbbar, shpbar, tblbar, arrbar].forEach(function (el) {
      if (el && !el.hidden) bar = Math.max(bar, el.offsetHeight + 6);
    });
    var aw = r.width, ah = r.height - (pos ? pos.offsetHeight + 6 : 0) - bar;
    scale = Math.max(0.1, Math.min(aw / W, ah / H));
    fit.style.width = Math.floor(W * scale) + 'px'; fit.style.height = Math.floor(H * scale) + 'px';
    slideEl.style.transform = 'scale(' + scale + ')';
    slideEl.style.setProperty('--hs', (14 / scale).toFixed(2) + 'px');
    slideEl.style.setProperty('--ol', (2 / scale).toFixed(2) + 'px');
  }
  function autoTitle() {
    if (!title || title.hidden) return;
    title.style.height = 'auto';
    var bd = title.offsetHeight - title.clientHeight;
    title.style.height = Math.min(200 + bd, Math.max(title.scrollHeight, 1) + bd) + 'px';
  }

  /* ---------- contenteditable selection (paragraph + character offset) ---------- */
  function paraKids(el) { return [].filter.call(el.children, function (c) { return c.nodeType === 1; }); }
  function textLen(node) {
    if (node.nodeType === 3) return (node.nodeValue || '').replace(/\u200b/g, '').length;
    var n = 0, i, k = node.childNodes;
    for (i = 0; i < k.length; i++) n += textLen(k[i]);
    return n;
  }
  function caretIn(el, node, offset) {
    var kids = paraKids(el), pEl = node, i;
    if (node === el) {
      var idx = Math.min(offset, kids.length);
      return { p: Math.max(0, idx ? idx - (offset === kids.length ? 0 : 0) : 0), off: offset >= kids.length ? textLen(kids[kids.length - 1] || el) : 0 };
    }
    while (pEl && pEl.parentNode !== el) pEl = pEl.parentNode;
    var pi = kids.indexOf(pEl);
    if (pi < 0) {
      for (i = 0; i < kids.length; i++) if (kids[i].contains(node) || kids[i] === node) { pi = i; pEl = kids[i]; break; }
    }
    if (pi < 0) return { p: 0, off: 0 };
    var off = 0, seen = false;
    function walk(n) {
      if (seen) return;
      if (n === node) {
        if (n.nodeType === 3) {
          var raw = n.nodeValue || '', cut = raw.slice(0, offset).replace(/\u200b/g, '');
          off += cut.length;
        } else {
          var j, ch = n.childNodes;
          for (j = 0; j < Math.min(offset, ch.length); j++) off += textLen(ch[j]);
        }
        seen = true; return;
      }
      if (n.nodeType === 3) { off += (n.nodeValue || '').replace(/\u200b/g, '').length; return; }
      var c = n.childNodes, k;
      for (k = 0; k < c.length; k++) { walk(c[k]); if (seen) return; }
    }
    walk(pEl);
    return { p: pi, off: off };
  }
  function getSel(el) {
    var sel = window.getSelection && window.getSelection();
    if (!sel || !sel.rangeCount || !el) return null;
    var a = sel.anchorNode, b = sel.focusNode;
    if (!a || !b) return null;
    if (!(el === a || el.contains(a)) || !(el === b || el.contains(b))) return null;
    return { a: caretIn(el, a, sel.anchorOffset), b: caretIn(el, b, sel.focusOffset) };
  }
  function setSel(el, s) {
    if (!el || !s) return;
    var kids = paraKids(el);
    function point(pt) {
      var pEl = kids[Math.max(0, Math.min(kids.length - 1, pt.p | 0))] || el, remain = Math.max(0, pt.off | 0), hit = null, cut = 0;
      function walk(n) {
        if (hit) return;
        if (n.nodeType === 3) {
          var t = n.nodeValue || '', vis = t.replace(/\u200b/g, ''), L = vis.length;
          if (remain <= L) {
            /* map visible offset back onto the raw node (skip zwsp) */
            var i = 0, v = 0;
            while (i < t.length && v < remain) { if (t.charAt(i) !== '\u200b') v++; i++; }
            hit = { node: n, offset: i }; return;
          }
          remain -= L; return;
        }
        var c = n.childNodes, k;
        for (k = 0; k < c.length; k++) { walk(c[k]); if (hit) return; }
      }
      walk(pEl);
      if (!hit) {
        var tw, last = pEl;
        try {
          var w = document.createTreeWalker(pEl, NodeFilter.SHOW_TEXT, null);
          while ((tw = w.nextNode())) last = tw;
        } catch (_) { /* */ }
        hit = last.nodeType === 3 ? { node: last, offset: last.nodeValue.length } : { node: pEl, offset: pEl.childNodes.length };
      }
      return hit;
    }
    try {
      var A = point(s.a), B = point(s.b || s.a), r = document.createRange();
      r.setStart(A.node, A.offset); r.setEnd(B.node, B.offset);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    } catch (_) { /* */ }
  }
  function placeEnd(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (e2) { /* */ } }
    var kids = paraKids(el), last = kids[kids.length - 1] || el;
    setSel(el, { a: { p: Math.max(0, kids.length - 1), off: textLen(last) }, b: { p: Math.max(0, kids.length - 1), off: textLen(last) } });
  }
  function placeStart(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (e2) { /* */ } }
    setSel(el, { a: { p: 0, off: 0 }, b: { p: 0, off: 0 } });
  }

  function renderBox(el, doc, slot) {
    if (!el) return;
    var o = { show: true, list: slot === 'title' ? 'none' : defList(slot) };
    el.innerHTML = SLText.html(doc, o);
    el.classList.toggle('empty', !SLText.has(doc));
    el.classList.toggle('has-list', hasList(doc));
  }
  function readBox(el, slot) {
    var opt = { list: defList(slot), max: slot === 'title' ? 300 : (String(slot).indexOf('tb:') === 0 ? 2000 : 5000), single: slot === 'title' };
    return SLText.parseHtml(el.innerHTML, opt);
  }
  function refreshMarks(el, doc) {
    if (!el || !doc) return;
    var paras = SLText.clean(doc).paragraphs, nums = SLText.numbers(paras), kids = paraKids(el);
    kids.forEach(function (k, i) {
      var p = paras[i]; if (!p) return;
      var al = p.align || '';
      k.className = 'p l' + (p.level >= 1 ? 1 : 0) + ' ' + (p.list || 'none') + (SLText.paraText(p).replace(/\s+/g, '') ? '' : ' e');
      if (p.list === 'number' && nums[i]) k.setAttribute('data-n', nums[i]); else k.removeAttribute('data-n');
      if (al) k.style.textAlign = al; else k.style.removeProperty('text-align');
    });
    el.classList.toggle('empty', !SLText.has(doc));
    el.classList.toggle('has-list', hasList(doc));
  }
  function atStartOfPara(el) {
    var s = getSel(el); if (!s) return false;
    return s.a.p === s.b.p && s.a.off === 0 && s.b.off === 0;
  }
  function currentPara(el) {
    var s = getSel(el), doc = readBox(el, elSlot(el));
    if (!s) return doc.paragraphs[0];
    return doc.paragraphs[s.a.p] || doc.paragraphs[0];
  }

  function changed() {
    if (!cur) return;
    if (title && !title.hidden) cur.title = readBox(title, 'title');
    if (body && body.closest('.s-cols') && !body.closest('.s-cols').hidden) cur.body = readBox(body, 'body');
    if (body2 && body2.parentNode && !body2.parentNode.hidden) cur.body2 = readBox(body2, 'body2');
    if (editSlot) {
      var inEl = editorEl(editSlot);
      if (inEl) writeSlot(editSlot, readBox(inEl, editSlot));
    }
    if (title) { refreshMarks(title, cur.title); autoTitle(); }
    if (body) refreshMarks(body, cur.body);
    if (body2) refreshMarks(body2, cur.body2);
    onChange(cur);
    onFmt();
  }
  function onInput() { changed(); }

  function applyToActive(kind, payload, label, force) {
    var ctx = activeCtx(); if (!ctx) return false;
    var sel = getSel(ctx.el) || SLText.normSel(ctx.doc, 'all');
    var wasCol = sel.a.p === sel.b.p && sel.a.off === sel.b.off;
    if (kind === 'run' && wasCol && !force && !(payload && payload.clear) && payload && (payload.size || payload.color != null || payload.hl != null || payload.b || payload.i || payload.u || payload.s)) {
      /* collapsed: remember typing marks for the next character; also toggle B/I/U via execCommand so it types styled */
      pending = Object.assign({}, marksFrom(ctx.doc, sel), payload);
      if (payload.b === 'toggle') pending.b = !pending.b;
      if (payload.i === 'toggle') pending.i = !pending.i;
      if (payload.u === 'toggle') pending.u = !pending.u;
      if (payload.s === 'toggle') pending.s = !pending.s;
      try {
        if (payload.b != null) document.execCommand('bold');
        if (payload.i != null) document.execCommand('italic');
        if (payload.u != null) document.execCommand('underline');
        if (payload.s != null) document.execCommand('strikeThrough');
      } catch (_) { /* */ }
      onFmt(); return true;
    }
    var b = before();
    var next = kind === 'run' ? SLText.applyRun(ctx.doc, sel, payload) : SLText.applyPara(ctx.doc, sel, payload);
    writeSlot(ctx.slot, next);
    renderBox(ctx.el, next, ctx.slot);
    setSel(ctx.el, sel);
    if (ctx.slot === 'title') autoTitle();
    onChange(cur);
    if (label) objDone(b, label);
    onFmt();
    return true;
  }
  var pending = null;
  function marksFrom(doc, sel) { return SLText.marksAt(doc, sel); }
  function activeCtx() {
    var el = document.activeElement;
    if (title && (el === title || title.contains(el))) return { el: title, slot: 'title', doc: readBox(title, 'title') };
    if (body && (el === body || body.contains(el))) return { el: body, slot: 'body', doc: readBox(body, 'body') };
    if (body2 && (el === body2 || body2.contains(el))) return { el: body2, slot: 'body2', doc: readBox(body2, 'body2') };
    if (editSlot) {
      var inEl = editorEl(editSlot);
      if (inEl && (el === inEl || inEl.contains(el))) return { el: inEl, slot: editSlot, doc: readBox(inEl, editSlot) };
    }
    return null;
  }
  function format(fmt, label) { return applyToActive('run', fmt, label || 'Format text', false); }
  function paraFmt(props, label) { return applyToActive('para', props, label || 'Format text', true); }

  function boxKeys(el, slot) {
    el.addEventListener('input', onInput);
    el.addEventListener('beforeinput', function (e) {
      if (!pending || e.inputType !== 'insertText' || !e.data) return;
      e.preventDefault();
      var doc = readBox(el, slot), sel = getSel(el) || { a: { p: 0, off: 0 }, b: { p: 0, off: 0 } };
      var marks = { b: pending.b || undefined, i: pending.i || undefined, u: pending.u || undefined, s: pending.s || undefined,
        size: pending.size || undefined, color: pending.color || undefined, hl: pending.hl || undefined };
      var next = SLText.insertText(doc, sel, e.data, marks);
      var off = (sel.a.p === sel.b.p ? Math.min(sel.a.off, sel.b.off) : sel.a.off) + e.data.length;
      var p = sel.a.p;
      writeSlot(slot, next); renderBox(el, next, slot);
      setSel(el, { a: { p: p, off: off }, b: { p: p, off: off } });
      pending = null; changed();
    });
    el.addEventListener('keydown', function (e) {
      var isTitle = slot === 'title';
      var plain = slot === 'body' && slots(cur).b === 'plain';
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        if (!isTitle && !plain) paraFmt({ indent: e.shiftKey ? -1 : 1 }, e.shiftKey ? 'Outdent' : 'Indent');
        return;
      }
      if (e.key === 'Enter' && isTitle && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (!body.closest('.s-cols').hidden) placeStart(body);
        return;
      }
      if (e.key === 'Enter' && !isTitle && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var p = currentPara(el);
        if (p && p.level >= 1 && !SLText.paraText(p).replace(/\s+/g, '') && atStartOfPara(el)) {
          e.preventDefault(); paraFmt({ indent: -1 }, 'Outdent'); return;
        }
        /* let the browser insert a paragraph; input handler inherits list via parseHtml (previous classes) */
      }
      if (e.key === 'ArrowDown' && isTitle) {
        var s = getSel(el), doc = readBox(el, 'title');
        if (s && s.a.p === doc.paragraphs.length - 1 && s.a.off >= SLText.paraText(doc.paragraphs[s.a.p]).length && !body.closest('.s-cols').hidden) {
          e.preventDefault(); placeStart(body);
        }
      }
      if (e.key === 'ArrowUp' && slot === 'body' && !title.hidden) {
        var s2 = getSel(el);
        if (s2 && s2.a.p === 0 && s2.a.off === 0 && s2.b.p === 0 && s2.b.off === 0) { e.preventDefault(); placeEnd(title); }
      }
      if (e.key === 'Backspace' && !isTitle && !e.ctrlKey && !e.metaKey && atStartOfPara(el)) {
        var p2 = currentPara(el), s3 = getSel(el);
        if (p2 && p2.level >= 1 && s3 && s3.a.p === s3.b.p) { e.preventDefault(); paraFmt({ indent: -1 }, 'Outdent'); }
      }
      if (e.key === 'Escape' && editSlot && (slot.indexOf('tb:') === 0 || slot.indexOf('sh:') === 0 || slot.indexOf('tc:') === 0)) { e.preventDefault(); endEdit(true); }
    });
    el.addEventListener('paste', function (e) {
      var dt = e.clipboardData; if (!dt) return;
      var html = '', text = '';
      try { html = dt.getData('text/html') || ''; text = dt.getData('text/plain') || ''; } catch (_) { /* */ }
      if (!html && !text) return;   /* image-only: leave it to the document paste handler */
      e.preventDefault(); e.stopPropagation();
      var doc = readBox(el, slot), sel = getSel(el) || { a: { p: 0, off: 0 }, b: { p: 0, off: 0 } };
      var next, single = slot === 'title';
      if (html && html.trim()) next = SLText.insertParas(doc, sel, SLText.parseHtml(html, { list: defList(slot), single: single, max: single ? 300 : 5000 }), { inheritFirst: true });
      else next = SLText.pastePlain(doc, sel, text, { single: single, list: defList(slot) });
      if (single) next = SLText.clean(next, { single: true, max: 300, list: 'none' });
      writeSlot(slot, next);
      renderBox(el, next, slot);
      placeEnd(el);
      changed();
    });
    el.addEventListener('focus', function () { pending = null; onFmt(); });
    el.addEventListener('keyup', function () { onFmt(); });
    el.addEventListener('mouseup', function () { onFmt(); });
  }

  /* ---------- pictures, text boxes, shapes and tables (SL6 shared z-order) ---------- */
  var sels = [], editSlot = '', cellSel = null, G = null;
  function boxArr() {
    if (!cur) return [];
    if (!cur.texts) cur.texts = cur.tboxes || [];
    cur.tboxes = cur.texts;
    return cur.texts;
  }
  function shapeArr() { if (!cur) return []; if (!cur.shapes) cur.shapes = []; return cur.shapes; }
  function tableArr() { if (!cur) return []; if (!cur.tables) cur.tables = []; return cur.tables; }
  function picById(id) { return cur && (cur.pics || []).filter(function (p) { return p.id === id; })[0]; }
  function tbById(id) { return boxArr().filter(function (t) { return t.id === id; })[0]; }
  function shById(id) { return shapeArr().filter(function (s) { return s.id === id; })[0]; }
  function tblById(id) { return tableArr().filter(function (t) { return t.id === id; })[0]; }
  function objBy(kind, id) {
    return kind === 'pic' ? picById(id) : kind === 'tbox' ? tbById(id) : kind === 'shape' ? shById(id) : kind === 'table' ? tblById(id) : null;
  }
  function isSel(kind, id) { return sels.some(function (s) { return s.kind === kind && s.id === id; }); }
  function primary() { return sels.length ? sels[sels.length - 1] : null; }
  function editorEl(slot) {
    if (!slot) return null;
    if (slot.indexOf('tb:') === 0) return boxesEl && boxesEl.querySelector('.tbox[data-id="' + slot.slice(3) + '"] .tbox-in');
    if (slot.indexOf('sh:') === 0) return shapesEl && shapesEl.querySelector('.shp[data-id="' + slot.slice(3) + '"] .shp-in');
    var p = parseTc(slot);
    if (p && tablesEl) {
      var td = tablesEl.querySelector('.tbl[data-id="' + p.id + '"] td[data-r="' + p.r + '"][data-c="' + p.c + '"] .cell-in');
      return td;
    }
    return null;
  }
  function picHTML(p, edit) {
    var u = window.SLPics ? SLPics.url(p) : '';
    var st = 'left:' + p.x + 'px;top:' + p.y + 'px;width:' + p.w + 'px;height:' + p.h + 'px;z-index:' + (p.z || 0);
    return '<div class="pic' + (u ? '' : ' miss') + (edit && isSel('pic', p.id) ? ' sel' : '') + '"' + (edit ? ' data-id="' + escq(p.id) + '"' : '') + ' style="' + st + '">' +
      (u ? '<img src="' + escq(u) + '" alt="" draggable="false" decoding="async" style="object-fit:' + (p.fit === 'contain' ? 'contain' : 'cover') + '">' : '') + '</div>';
  }
  var HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  function selboxHTML(o, kind, withHandles) {
    return '<div class="selbox' + (withHandles ? '' : ' multi') + '" data-id="' + escq(o.id) + '" data-kind="' + escq(kind) + '" style="left:' + o.x + 'px;top:' + o.y + 'px;width:' + o.w + 'px;height:' + o.h + 'px;z-index:1000">' +
      (withHandles ? HANDLES.map(function (h) { return '<div class="h h-' + h + '" data-h="' + h + '"></div>'; }).join('') : '') + '</div>';
  }
  function minSize(kind) {
    if (kind === 'tbox' || kind === 'table') return { w: 80, h: 40 };
    return { w: 16, h: 16 };
  }
  function boxHTML(t, edit) {
    var st = 'left:' + t.x + 'px;top:' + t.y + 'px;width:' + t.w + 'px;height:' + t.h + 'px;z-index:' + (t.z || 1);
    if (t.fill) st += ';background:' + t.fill;
    if (t.border) st += ';box-shadow:inset 0 0 0 2px ' + t.border;
    var on = edit && isSel('tbox', t.id);
    var ed = edit && editSlot === 'tb:' + t.id;
    var inner = SLText.html(t.doc, { show: true, list: 'none' });
    return '<div class="tbox' + (on ? ' sel' : '') + (ed ? ' editing' : '') + (SLText.has(t.doc) ? '' : ' empty') + '"' +
      (edit ? ' data-id="' + escq(t.id) + '"' : '') + ' style="' + st + '">' +
      '<div class="tbox-in s-ed' + (hasList(t.doc) ? ' has-list' : '') + (SLText.has(t.doc) ? '' : ' empty') + '"' +
      (edit ? ' data-slot="tb:' + escq(t.id) + '" data-ph="Click to add text"' : '') +
      (ed ? ' contenteditable="true" spellcheck="true"' : '') + '>' + inner + '</div></div>';
  }
  function shapeHTML(s, edit) {
    var st = 'left:' + s.x + 'px;top:' + s.y + 'px;width:' + s.w + 'px;height:' + s.h + 'px;z-index:' + (s.z || 2);
    var on = edit && isSel('shape', s.id);
    var ed = edit && editSlot === 'sh:' + s.id;
    var text = '';
    if (SLDraw.hasText(s.kind)) {
      var doc = s.doc || SLText.empty('none');
      text = '<div class="shp-in s-ed' + (hasList(doc) ? ' has-list' : '') + (SLText.has(doc) ? '' : ' empty') + '"' +
        (edit ? ' data-slot="sh:' + escq(s.id) + '" data-ph="Click to add text"' : '') +
        (ed ? ' contenteditable="true" spellcheck="true"' : '') + '>' + SLText.html(doc, { show: true, list: 'none' }) + '</div>';
    }
    return '<div class="shp ' + s.kind + (on ? ' sel' : '') + (ed ? ' editing' : '') + '"' +
      (edit ? ' data-id="' + escq(s.id) + '"' : '') + ' style="' + st + '">' + SLDraw.shapeSvg(s) + text + '</div>';
  }
  function tableHTML(t, edit) {
    var st = 'left:' + t.x + 'px;top:' + t.y + 'px;width:' + t.w + 'px;height:' + t.h + 'px;z-index:' + (t.z || 3);
    var on = edit && isSel('table', t.id);
    var edTbl = edit && editSlot && editSlot.indexOf('tc:' + t.id + ':') === 0;
    var border = t.border || '#111827', bw = t.bw || 1, rows = '', r, c;
    for (r = 0; r < t.rows; r++) {
      rows += '<tr' + (t.header && r === 0 ? ' class="hdr"' : '') + '>';
      for (c = 0; c < t.cols; c++) {
        var cell = t.cells[r][c], doc = cell.doc || SLText.empty('none');
        var slot = 'tc:' + t.id + ':' + r + ':' + c;
        var ed = edit && editSlot === slot;
        var cs = edit && cellSel && cellSel.id === t.id && cellSel.r === r && cellSel.c === c;
        var bg = (t.header && r === 0) ? (t.hfill || '#e5e7eb') : (t.fill || '#ffffff');
        rows += '<td class="' + (cs ? 'cell-sel' : '') + '" data-r="' + r + '" data-c="' + c + '" style="background:' + bg + ';border:' + bw + 'px solid ' + border + '">' +
          '<div class="cell-in s-ed' + (hasList(doc) ? ' has-list' : '') + (SLText.has(doc) ? '' : ' empty') + '"' +
          (edit ? ' data-slot="' + escq(slot) + '" data-ph=""' : '') +
          (ed ? ' contenteditable="true" spellcheck="true"' : '') + '>' + SLText.html(doc, { show: true, list: 'none' }) + '</div></td>';
      }
      rows += '</tr>';
    }
    return '<div class="tbl' + (on ? ' sel' : '') + (edTbl ? ' editing' : '') + '"' + (edit ? ' data-id="' + escq(t.id) + '"' : '') + ' style="' + st + '"><table>' + rows + '</table></div>';
  }
  function hideBars() {
    var vis = function (el, on) { if (!el) return; var had = !el.hidden; el.hidden = !on; return had !== !on; };
    var ch = false;
    ch = vis(picbar, false) || ch; ch = vis(tbbar, false) || ch; ch = vis(shpbar, false) || ch;
    ch = vis(tblbar, false) || ch; ch = vis(arrbar, false) || ch;
    return ch;
  }
  function showBars() {
    var p = primary(), multi = sels.length > 1, changed = hideBars();
    if (multi) {
      if (arrbar) { arrbar.hidden = false; var lab = document.getElementById('arr-count'); if (lab) lab.textContent = sels.length + ' objects'; }
      if (changed || (arrbar && !arrbar.hidden)) doFit();
      return;
    }
    if (!p || editSlot) { if (changed) doFit(); return; }
    if (p.kind === 'pic' && picbar) {
      picbar.hidden = false;
      var o = picById(p.id);
      if (o) [].forEach.call(picbar.querySelectorAll('[data-fit]'), function (b) { b.classList.toggle('on', b.dataset.fit === o.fit); b.setAttribute('aria-pressed', b.dataset.fit === o.fit ? 'true' : 'false'); });
    } else if (p.kind === 'tbox' && tbbar) {
      tbbar.hidden = false;
      var t = tbById(p.id), fi = document.getElementById('tb-fill'), bo = document.getElementById('tb-border');
      if (t && fi) fi.value = t.fill || '#ffffff';
      if (t && bo) bo.value = t.border || '#2563eb';
    } else if (p.kind === 'shape' && shpbar) {
      var s = shById(p.id);
      shpbar.hidden = false;
      var sf = document.getElementById('sh-fill'), ss = document.getElementById('sh-stroke'), sw = document.getElementById('sh-sw');
      if (s && sf) sf.value = s.fill || '#dbeafe';
      if (s && ss) ss.value = s.stroke || '#2563eb';
      if (s && sw) sw.value = String(s.sw || 2);
      var flip = shpbar.querySelector('[data-a=flip]'), ed = shpbar.querySelector('[data-a=edit]');
      if (flip) flip.hidden = !(s && (s.kind === 'line' || s.kind === 'arrow'));
      if (ed) ed.hidden = !(s && SLDraw.hasText(s.kind));
    } else if (p.kind === 'table' && tblbar) {
      var tb = tblById(p.id);
      tblbar.hidden = false;
      var hdr = tblbar.querySelector('[data-a=header]'), bf = document.getElementById('tbl-fill'), bb = document.getElementById('tbl-border');
      if (hdr && tb) { hdr.setAttribute('aria-pressed', tb.header ? 'true' : 'false'); hdr.classList.toggle('on', !!tb.header); }
      if (tb && bf) bf.value = tb.fill || '#ffffff';
      if (tb && bb) bb.value = tb.border || '#111827';
    }
    doFit();
  }
  function keepLive(root, sel, cls) {
    if (!editSlot || !root) return null;
    var live = root.querySelector(sel);
    if (live) { live.parentNode && live.parentNode.removeChild(live); return live; }
    return null;
  }
  function drawPics() {
    var ps = (cur && cur.pics) || [];
    picsEl.innerHTML = ps.map(function (q) { return picHTML(q, true); }).join('');
    picph.hidden = !(slots(cur).ph && !ps.length);
  }
  function drawBoxes() {
    if (!boxesEl) return;
    var ts = boxArr();
    var keep = (editSlot && editSlot.indexOf('tb:') === 0) ? keepLive(boxesEl, '.tbox[data-id="' + editSlot.slice(3) + '"]') : null;
    boxesEl.innerHTML = ts.map(function (q) { return (keep && q.id === editSlot.slice(3)) ? '' : boxHTML(q, true); }).join('');
    if (keep) boxesEl.appendChild(keep);
  }
  function drawShapes() {
    if (!shapesEl) return;
    var ss = shapeArr();
    var keep = (editSlot && editSlot.indexOf('sh:') === 0) ? keepLive(shapesEl, '.shp[data-id="' + editSlot.slice(3) + '"]') : null;
    shapesEl.innerHTML = ss.map(function (q) { return (keep && q.id === editSlot.slice(3)) ? '' : shapeHTML(q, true); }).join('');
    if (keep) shapesEl.appendChild(keep);
  }
  function drawTables() {
    if (!tablesEl) return;
    var ts = tableArr();
    var keepId = (editSlot && editSlot.indexOf('tc:') === 0) ? parseTc(editSlot).id : '';
    var keep = keepId ? keepLive(tablesEl, '.tbl[data-id="' + keepId + '"]') : null;
    tablesEl.innerHTML = ts.map(function (q) { return (keep && q.id === keepId) ? '' : tableHTML(q, true); }).join('');
    if (keep) tablesEl.appendChild(keep);
  }
  function drawSel() {
    if (!sellayer) return;
    var html = '', multi = sels.length > 1, i, s, o;
    for (i = 0; i < sels.length; i++) {
      s = sels[i]; o = objBy(s.kind, s.id);
      if (o) html += selboxHTML(o, s.kind, !multi && !editSlot);
    }
    sellayer.innerHTML = html;
  }
  function clearGuides() { if (guidesEl) { guidesEl.hidden = true; guidesEl.innerHTML = ''; } }
  function showGuides(list) {
    if (!guidesEl) return;
    if (!list || !list.length) { clearGuides(); return; }
    guidesEl.hidden = false;
    guidesEl.innerHTML = list.map(function (g) {
      return '<div class="g ' + g.axis + '" style="' + (g.axis === 'x' ? 'left:' + g.pos + 'px' : 'top:' + g.pos + 'px') + '"></div>';
    }).join('');
  }
  function pruneSel() {
    sels = sels.filter(function (s) { return !!objBy(s.kind, s.id); });
  }
  function drawObjs() {
    pruneSel();
    drawPics(); drawBoxes(); drawShapes(); drawTables(); drawSel(); showBars();
  }
  function moveBox(o, kind) {
    var root = kind === 'tbox' ? boxesEl : kind === 'shape' ? shapesEl : kind === 'table' ? tablesEl : picsEl;
    var cls = kind === 'tbox' ? '.tbox' : kind === 'shape' ? '.shp' : kind === 'table' ? '.tbl' : '.pic';
    var el = root && root.querySelector(cls + '[data-id="' + o.id + '"]');
    if (el) { el.style.left = o.x + 'px'; el.style.top = o.y + 'px'; el.style.width = o.w + 'px'; el.style.height = o.h + 'px'; }
    if (sellayer) [].forEach.call(sellayer.querySelectorAll('.selbox[data-id="' + o.id + '"]'), function (x) {
      x.style.left = o.x + 'px'; x.style.top = o.y + 'px'; x.style.width = o.w + 'px'; x.style.height = o.h + 'px';
    });
  }
  function endEdit(keepSel) {
    if (!editSlot) return;
    var slot = editSlot, inEl = editorEl(slot);
    if (inEl && cur) writeSlot(slot, readBox(inEl, slot));
    editSlot = '';
    try { if (inEl) inEl.blur(); } catch (_) { /* */ }
    if (!keepSel) { /* leave sels as they are */ }
    drawObjs();
    onChange(cur); onFmt();
  }
  function startEdit(kind, id, r, c) {
    var slot;
    if (kind === 'tbox') slot = 'tb:' + id;
    else if (kind === 'shape') slot = 'sh:' + id;
    else if (kind === 'table') slot = 'tc:' + id + ':' + (r | 0) + ':' + (c | 0);
    else return;
    if (kind === 'shape') { var sh = shById(id); if (!sh || !SLDraw.hasText(sh.kind)) return; }
    if (editSlot && editSlot !== slot) endEdit(true);
    sels = [{ kind: kind === 'table' ? 'table' : kind, id: id }];
    if (kind === 'table') cellSel = { id: id, r: r | 0, c: c | 0 };
    editSlot = slot;
    drawObjs();
    var inEl = editorEl(slot);
    if (inEl) {
      inEl.setAttribute('contenteditable', 'true');
      inEl.setAttribute('spellcheck', 'true');
      if (!inEl.dataset.bound) { inEl.dataset.bound = '1'; boxKeys(inEl, slot); }
      placeEnd(inEl);
    }
    showBars();
    onFmt();
  }
  function select(id, kind, add) {
    if (editSlot && !(kind && editSlot.indexOf((kind === 'tbox' ? 'tb:' : kind === 'shape' ? 'sh:' : kind === 'table' ? 'tc:' : '') + id) === 0)) endEdit(false);
    if (!id) { sels = []; cellSel = null; drawObjs(); return; }
    if (add) {
      var i, found = -1;
      for (i = 0; i < sels.length; i++) if (sels[i].kind === kind && sels[i].id === id) found = i;
      if (found >= 0) sels.splice(found, 1);
      else sels.push({ kind: kind, id: id });
      if (kind !== 'table') cellSel = null;
    } else {
      if (sels.length === 1 && sels[0].kind === kind && sels[0].id === id) return;
      sels = [{ kind: kind, id: id }];
      if (kind !== 'table') cellSel = null;
    }
    drawObjs();
  }
  function clamp(p, minW, minH) {
    minW = minW || 16; minH = minH || 16;
    p.w = Math.max(minW, Math.min(4000, p.w)); p.h = Math.max(minH, Math.min(4000, p.h));
    p.x = Math.max(24 - p.w, Math.min(W - 24, p.x)); p.y = Math.max(24 - p.h, Math.min(H - 24, p.y));
    p.x = Math.round(p.x * 10) / 10; p.y = Math.round(p.y * 10) / 10; p.w = Math.round(p.w * 10) / 10; p.h = Math.round(p.h * 10) / 10;
  }
  function objDone(before, label) { if (cur) onObj(cur, before, label); }
  function before() { return SLSave.cloneSlide(cur); }
  function objOf() {
    var p = primary(); return p ? objBy(p.kind, p.id) : null;
  }
  function hitObj(e) {
    var h = e.target.closest('.h'), sb = h && h.closest('.selbox');
    if (h && sb) return { handle: h.dataset.h, kind: sb.dataset.kind, id: sb.dataset.id };
    var te = e.target.closest('.tbox'); if (te) return { kind: 'tbox', id: te.dataset.id, el: te };
    var se = e.target.closest('.shp'); if (se) return { kind: 'shape', id: se.dataset.id, el: se };
    var ce = e.target.closest('.tbl'); if (ce) return { kind: 'table', id: ce.dataset.id, el: ce, td: e.target.closest('td') };
    var pe = e.target.closest('.pic'); if (pe) return { kind: 'pic', id: pe.dataset.id, el: pe };
    return null;
  }
  function objDown(e) {
    var hit = hitObj(e);
    if (!hit) return;
    if (e.button > 0) return;
    if (hit.kind === 'tbox' && editSlot === 'tb:' + hit.id && !hit.handle && e.target.closest('.tbox-in')) return;
    if (hit.kind === 'shape' && editSlot === 'sh:' + hit.id && !hit.handle && e.target.closest('.shp-in')) return;
    if (hit.kind === 'table' && editSlot && editSlot.indexOf('tc:' + hit.id + ':') === 0 && !hit.handle && e.target.closest('.cell-in[contenteditable="true"]')) return;
    e.preventDefault(); e.stopPropagation();
    try { if (document.activeElement && document.activeElement !== document.body && !e.target.closest('[contenteditable="true"]')) document.activeElement.blur(); } catch (_) { /* */ }
    try { stage.focus({ preventScroll: true }); } catch (_) { /* */ }
    if (!hit.handle) {
      if (e.shiftKey) select(hit.id, hit.kind, true);
      else if (!isSel(hit.kind, hit.id)) select(hit.id, hit.kind, false);
      else if (sels.length === 1) select(hit.id, hit.kind, false);
      /* already in a multi-selection: keep it, start a group move */
      if (hit.kind === 'table' && hit.td && !e.shiftKey) {
        cellSel = { id: hit.id, r: +hit.td.dataset.r, c: +hit.td.dataset.c };
        if (tblbar && !tblbar.hidden) { /* refresh cell highlight */ drawTables(); drawSel(); }
      }
    } else if (!isSel(hit.kind, hit.id)) select(hit.id, hit.kind, false);
    var group = sels.map(function (s) { var o = objBy(s.kind, s.id); return o ? { kind: s.kind, id: s.id, r0: { x: o.x, y: o.y, w: o.w, h: o.h } } : null; }).filter(Boolean);
    if (!group.length) return;
    G = { id: e.pointerId, kind: hit.kind, mode: hit.handle || 'move', x0: e.clientX, y0: e.clientY,
      group: group, before: before(), moved: false };
  }
  function objMove(e) {
    if (!G || e.pointerId !== G.id) return;
    var dx = (e.clientX - G.x0) / scale, dy = (e.clientY - G.y0) / scale, m = G.mode;
    if (!G.moved && Math.abs(dx) + Math.abs(dy) < 2 / scale) return;
    G.moved = true; e.preventDefault();
    if (m === 'move') {
      G.group.forEach(function (g) {
        var o = objBy(g.kind, g.id), ms = minSize(g.kind); if (!o) return;
        o.x = g.r0.x + dx; o.y = g.r0.y + dy; clamp(o, ms.w, ms.h);
      });
      var box = SLDraw.bounds(G.group.map(function (g) { return objBy(g.kind, g.id); }).filter(Boolean));
      var sn = SLDraw.snapRect(box, { threshold: 8 / Math.max(scale, 0.2) });
      var ax = sn.x - box.x, ay = sn.y - box.y;
      if (ax || ay) {
        G.group.forEach(function (g) {
          var o = objBy(g.kind, g.id), ms = minSize(g.kind); if (!o) return;
          o.x += ax; o.y += ay; clamp(o, ms.w, ms.h);
        });
      }
      G.group.forEach(function (g) { var o = objBy(g.kind, g.id); if (o) moveBox(o, g.kind); });
      showGuides(sn.guides);
      return;
    }
    if (G.group.length !== 1) return;
    var g = G.group[0], o = objBy(g.kind, g.id); if (!o) { G = null; return; }
    var r = g.r0, ms = minSize(g.kind), x = r.x, y = r.y, w = r.w, hh = r.h;
    if (m.indexOf('e') >= 0) w = r.w + dx;
    if (m.indexOf('w') >= 0) w = r.w - dx;
    if (m.indexOf('s') >= 0) hh = r.h + dy;
    if (m.indexOf('n') >= 0) hh = r.h - dy;
    w = Math.max(ms.w, w); hh = Math.max(ms.h, hh);
    if (e.shiftKey) {
      var a = r.w / r.h;
      if (m === 'n' || m === 's') w = hh * a;
      else if (m === 'e' || m === 'w') hh = w / a;
      else if (w / r.w > hh / r.h) hh = w / a; else w = hh * a;
    }
    if (m.indexOf('w') >= 0) x = r.x + r.w - w;
    if (m.indexOf('n') >= 0) y = r.y + r.h - hh;
    if (e.shiftKey && (m === 'n' || m === 's')) x = r.x + (r.w - w) / 2;
    if (e.shiftKey && (m === 'e' || m === 'w')) y = r.y + (r.h - hh) / 2;
    o.x = x; o.y = y; o.w = w; o.h = hh; clamp(o, ms.w, ms.h); moveBox(o, g.kind);
  }
  function objUp(e) {
    if (!G || e.pointerId !== G.id) return;
    var g = G; G = null; clearGuides();
    if (g.moved) {
      var lab = g.mode === 'move' ? (g.group.length > 1 ? 'Move objects' : ('Move ' + kindLabel(g.kind))) : ('Resize ' + kindLabel(g.kind));
      objDone(g.before, lab);
    }
  }
  function kindLabel(k) { return k === 'tbox' ? 'text box' : k === 'pic' ? 'picture' : k === 'shape' ? 'shape' : k === 'table' ? 'table' : 'object'; }
  function editPic(fn, label) {
    var p = primary(), o = p && p.kind === 'pic' ? picById(p.id) : null; if (!o) return false;
    var b = before(); if (fn(o) === false) return false; clamp(o); drawObjs(); objDone(b, label); return true;
  }
  function addPic(p) {
    if (!cur) return;
    if (editSlot) endEdit(false);
    var b = before(); cur.pics = (cur.pics || []).concat([p]); sels = [{ kind: 'pic', id: p.id }]; drawObjs(); objDone(b, 'Insert picture');
  }
  function addBox(at) {
    if (!cur) return null;
    if (boxArr().length >= SLText.MAX_BOX) return null;
    if (editSlot) endEdit(false);
    var b = before();
    var n = boxArr().length;
    var box = SLText.cleanBox({ id: SLSave.uid(), x: (at && at.x) || (80 + n * 24), y: (at && at.y) || (80 + n * 24),
      w: 320, h: 100, doc: SLText.empty('none') });
    if (!at) { box.x = Math.round((W - box.w) / 2 + n * 24); box.y = Math.round((H - box.h) / 2 + n * 24); clamp(box, 80, 40); }
    box.z = nextZVal(1);
    cur.texts = boxArr().concat([box]); cur.tboxes = cur.texts;
    sels = [{ kind: 'tbox', id: box.id }]; drawObjs(); objDone(b, 'Insert text box');
    startEdit('tbox', box.id);
    return box;
  }
  function addShape(kind, at) {
    if (!cur) return null;
    if (shapeArr().length >= SLDraw.MAX_SHAPES) return null;
    if (editSlot) endEdit(false);
    var b = before();
    var sh = SLDraw.defaultShape(kind, at, shapeArr().length);
    sh.id = SLSave.uid();
    sh.z = nextZVal(1);
    clamp(sh, 16, 16);
    cur.shapes = shapeArr().concat([sh]);
    sels = [{ kind: 'shape', id: sh.id }]; drawObjs(); objDone(b, 'Insert shape');
    if (SLDraw.hasText(sh.kind)) startEdit('shape', sh.id);
    return sh;
  }
  function addTable(rows, cols, at) {
    if (!cur) return null;
    if (tableArr().length >= SLDraw.MAX_TABLES) return null;
    if (editSlot) endEdit(false);
    var b = before();
    var tb = SLDraw.makeTable(rows, cols, at, tableArr().length);
    tb.id = SLSave.uid();
    tb.z = nextZVal(1);
    clamp(tb, 80, 40);
    cur.tables = tableArr().concat([tb]);
    sels = [{ kind: 'table', id: tb.id }]; cellSel = { id: tb.id, r: 0, c: 0 };
    drawObjs(); objDone(b, 'Insert table');
    return tb;
  }
  function delSelected() {
    if (!sels.length || editSlot) return false;
    var b = before(), n = sels.length;
    var drop = {};
    sels.forEach(function (s) { drop[s.kind + ':' + s.id] = 1; });
    if (cur.pics) cur.pics = cur.pics.filter(function (p) { return !drop['pic:' + p.id]; });
    cur.texts = boxArr().filter(function (t) { return !drop['tbox:' + t.id]; }); cur.tboxes = cur.texts;
    cur.shapes = shapeArr().filter(function (s) { return !drop['shape:' + s.id]; });
    cur.tables = tableArr().filter(function (t) { return !drop['table:' + t.id]; });
    var lab = n > 1 ? 'Delete objects' : ('Delete ' + kindLabel((sels[0] && sels[0].kind) || 'object'));
    sels = []; cellSel = null;
    drawObjs(); objDone(b, lab);
    return true;
  }
  function placeholderRect() {
    if (!slots(cur).ph) return null;
    var was = picph.hidden; picph.hidden = false;
    var r = { x: picph.offsetLeft, y: picph.offsetTop, w: picph.offsetWidth, h: picph.offsetHeight };
    picph.hidden = was; return r;
  }
  function nudgeObj(dx, dy) {
    if (!sels.length || editSlot) return false;
    var b = before();
    sels.forEach(function (s) {
      var o = objBy(s.kind, s.id); if (!o) return;
      var ms = minSize(s.kind); o.x += dx; o.y += dy; clamp(o, ms.w, ms.h); moveBox(o, s.kind);
    });
    objDone(b, sels.length > 1 ? 'Move objects' : 'Move ' + kindLabel(primary().kind));
    return true;
  }
  function nextZVal(dir) {
    var zs = SLDraw.listObjs(cur).map(function (o) { return o.z; });
    if (!zs.length) return dir > 0 ? 1 : 0;
    return dir > 0 ? Math.max.apply(null, zs) + 1 : Math.min.apply(null, zs) - 1;
  }
  function arrangeLayer(how) {
    if (!sels.length) return false;
    var b = before();
    SLDraw.applyOrder(cur, sels.map(function (s) { return s.id; }), how);
    drawObjs(); objDone(b, how === 'front' ? 'Bring to front' : how === 'back' ? 'Send to back' : how === 'forward' ? 'Bring forward' : 'Send backward');
    return true;
  }
  function arrangeAlign(edge) {
    if (!sels.length) return false;
    var b = before(), objs = sels.map(function (s) { return objBy(s.kind, s.id); }).filter(Boolean);
    SLDraw.align(objs, edge, objs.length === 1 ? { w: W, h: H, slide: true } : null);
    objs.forEach(function (o, i) { var ms = minSize(sels[i].kind); clamp(o, ms.w, ms.h); });
    drawObjs(); objDone(b, 'Align'); return true;
  }
  function arrangeDist(axis) {
    if (sels.length < 3) return false;
    var b = before(), objs = sels.map(function (s) { return objBy(s.kind, s.id); }).filter(Boolean);
    SLDraw.distribute(objs, axis);
    objs.forEach(function (o, i) { var ms = minSize(sels[i].kind); clamp(o, ms.w, ms.h); });
    drawObjs(); objDone(b, axis === 'v' ? 'Distribute vertically' : 'Distribute horizontally'); return true;
  }
  function layer(dir) { return arrangeLayer(dir > 0 ? 'forward' : 'backward'); }
  function setBoxChrome(prop, value, label) {
    var p = primary(), o = p && p.kind === 'tbox' ? tbById(p.id) : null; if (!o) return false;
    var b = before();
    if (prop === 'fill') { if (value) o.fill = value; else delete o.fill; }
    else if (prop === 'border') { if (value) o.border = value; else delete o.border; }
    else return false;
    drawObjs(); objDone(b, label || 'Text box style'); return true;
  }
  function setShapeChrome(prop, value, label) {
    var p = primary(), o = p && p.kind === 'shape' ? shById(p.id) : null; if (!o) return false;
    var b = before();
    if (prop === 'fill') { if (value) o.fill = value; else delete o.fill; }
    else if (prop === 'stroke') { if (value) o.stroke = value; else delete o.stroke; }
    else if (prop === 'sw') o.sw = +value || 0;
    else if (prop === 'flip') o.flip = !o.flip;
    else return false;
    drawObjs(); objDone(b, label || 'Shape style'); return true;
  }
  function setTableChrome(prop, value, label) {
    var p = primary(), o = p && p.kind === 'table' ? tblById(p.id) : null; if (!o) return false;
    var b = before();
    if (prop === 'fill') { if (value) o.fill = value; else delete o.fill; }
    else if (prop === 'border') { if (value) o.border = value; else delete o.border; }
    else if (prop === 'header') o.header = !!value;
    else if (prop === 'addrow') { var next = SLDraw.addRow(o, cellSel && cellSel.id === o.id ? cellSel.r + 1 : o.rows); o.cells = next.cells; o.rows = next.rows; o.cols = next.cols; }
    else if (prop === 'delrow') {
      if (o.rows <= 1) return false;
      var ri = cellSel && cellSel.id === o.id ? cellSel.r : o.rows - 1;
      var nextR = SLDraw.delRow(o, ri); o.cells = nextR.cells; o.rows = nextR.rows; o.cols = nextR.cols;
      if (cellSel && cellSel.r >= o.rows) cellSel.r = o.rows - 1;
    } else if (prop === 'addcol') { var nextC = SLDraw.addCol(o, cellSel && cellSel.id === o.id ? cellSel.c + 1 : o.cols); o.cells = nextC.cells; o.rows = nextC.rows; o.cols = nextC.cols; }
    else if (prop === 'delcol') {
      if (o.cols <= 1) return false;
      var ci = cellSel && cellSel.id === o.id ? cellSel.c : o.cols - 1;
      var nextD = SLDraw.delCol(o, ci); o.cells = nextD.cells; o.rows = nextD.rows; o.cols = nextD.cols;
      if (cellSel && cellSel.c >= o.cols) cellSel.c = o.cols - 1;
    } else return false;
    drawObjs(); objDone(b, label || 'Table'); return true;
  }


  function init(o) {
    onChange = o.onChange || onChange; onObj = o.onObj || onObj; onPickPic = o.onPickPic || onPickPic; onFmt = o.onFmt || onFmt;
    title = $('s-title'); body = $('s-body'); body2 = $('s-body2'); fit = $('fit'); stage = $('stage'); slideEl = $('slide');
    picsEl = $('pics'); boxesEl = $('tboxes'); shapesEl = $('shapes'); tablesEl = $('tables'); objsEl = $('objs');
    sellayer = $('sellayer'); guidesEl = $('guides'); picph = $('s-picph');
    picbar = $('picbar'); tbbar = $('tbbar'); shpbar = $('shpbar'); tblbar = $('tblbar'); arrbar = $('arrbar');
    boxKeys(title, 'title'); boxKeys(body, 'body'); boxKeys(body2, 'body2');
    if (objsEl) objsEl.addEventListener('pointerdown', objDown);
    else { if (picsEl) picsEl.addEventListener('pointerdown', objDown); if (boxesEl) boxesEl.addEventListener('pointerdown', objDown); }
    if (objsEl) {
      objsEl.addEventListener('dblclick', function (e) {
        var t = e.target.closest('.tbox'); if (t) { e.preventDefault(); startEdit('tbox', t.dataset.id); return; }
        var s = e.target.closest('.shp'); if (s) { e.preventDefault(); startEdit('shape', s.dataset.id); return; }
        var td = e.target.closest('.tbl td'); if (td) {
          var tbl = td.closest('.tbl'); e.preventDefault();
          startEdit('table', tbl.dataset.id, +td.dataset.r, +td.dataset.c);
        }
      });
    }
    addEventListener('pointermove', objMove, { passive: false });
    addEventListener('pointerup', objUp);
    addEventListener('pointercancel', function (e) {
      if (G && e.pointerId === G.id) {
        if (G.moved && G.group) {
          G.group.forEach(function (g) {
            var o = objBy(g.kind, g.id); if (!o) return;
            o.x = g.r0.x; o.y = g.r0.y; o.w = g.r0.w; o.h = g.r0.h; moveBox(o, g.kind);
          });
        }
        G = null; clearGuides();
      }
    });
    slideEl.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.pic') || e.target.closest('.tbox') || e.target.closest('.shp') || e.target.closest('.tbl') || e.target.closest('.selbox')) return;
      if (editSlot) endEdit(false);
      select('');
    }, true);
    picph.addEventListener('click', function () { onPickPic(); });
    picbar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.fit) editPic(function (p) { if (p.fit === b.dataset.fit) return false; p.fit = b.dataset.fit; }, b.dataset.fit === 'cover' ? 'Crop to fill' : 'Fit picture');
      else if (b.dataset.a === 'shape') editPic(function (p) {
        var a = p.iw / p.ih; if (!isFinite(a) || a <= 0) return false;
        var cx = p.x + p.w / 2, cy = p.y + p.h / 2, area = p.w * p.h, w = Math.sqrt(area * a), h = w / a;
        if (w > W) { w = W; h = w / a; } if (h > H) { h = H; w = h * a; }
        if (Math.abs(w - p.w) < 0.5 && Math.abs(h - p.h) < 0.5) return false;
        p.w = w; p.h = h; p.x = cx - w / 2; p.y = cy - h / 2;
      }, 'Original shape');
      else if (b.dataset.a === 'del') delSelected();
      else if (b.dataset.a === 'fwd') arrangeLayer('forward');
      else if (b.dataset.a === 'back') arrangeLayer('backward');
      else if (b.dataset.a === 'front') arrangeLayer('front');
      else if (b.dataset.a === 'toback') arrangeLayer('back');
    });
    function wireBar(el, click, input) {
      if (!el) return;
      el.addEventListener('click', click);
      if (input) el.addEventListener('input', input);
    }
    wireBar(tbbar, function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var p = primary();
      if (b.dataset.a === 'del') delSelected();
      else if (b.dataset.a === 'edit' && p && p.kind === 'tbox') startEdit('tbox', p.id);
      else if (b.dataset.a === 'fwd') arrangeLayer('forward');
      else if (b.dataset.a === 'back') arrangeLayer('backward');
      else if (b.dataset.a === 'front') arrangeLayer('front');
      else if (b.dataset.a === 'toback') arrangeLayer('back');
      else if (b.dataset.a === 'nofill') setBoxChrome('fill', '', 'Text box fill');
      else if (b.dataset.a === 'noborder') setBoxChrome('border', '', 'Text box line');
    }, function (e) {
      if (e.target.id === 'tb-fill') setBoxChrome('fill', e.target.value, 'Text box fill');
      else if (e.target.id === 'tb-border') setBoxChrome('border', e.target.value, 'Text box line');
    });
    wireBar(shpbar, function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var p = primary();
      if (b.dataset.a === 'del') delSelected();
      else if (b.dataset.a === 'edit' && p && p.kind === 'shape') startEdit('shape', p.id);
      else if (b.dataset.a === 'fwd') arrangeLayer('forward');
      else if (b.dataset.a === 'back') arrangeLayer('backward');
      else if (b.dataset.a === 'front') arrangeLayer('front');
      else if (b.dataset.a === 'toback') arrangeLayer('back');
      else if (b.dataset.a === 'nofill') setShapeChrome('fill', '', 'Shape fill');
      else if (b.dataset.a === 'nostroke') setShapeChrome('stroke', '', 'Shape outline');
      else if (b.dataset.a === 'flip') setShapeChrome('flip', true, 'Flip line');
    }, function (e) {
      if (e.target.id === 'sh-fill') setShapeChrome('fill', e.target.value, 'Shape fill');
      else if (e.target.id === 'sh-stroke') setShapeChrome('stroke', e.target.value, 'Shape outline');
      else if (e.target.id === 'sh-sw') setShapeChrome('sw', e.target.value, 'Outline width');
    });
    if (shpbar) {
      var sw = document.getElementById('sh-sw');
      if (sw) sw.addEventListener('change', function () { setShapeChrome('sw', this.value, 'Outline width'); });
    }
    wireBar(tblbar, function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var p = primary();
      if (b.dataset.a === 'del') delSelected();
      else if (b.dataset.a === 'edit' && p && p.kind === 'table') startEdit('table', p.id, cellSel ? cellSel.r : 0, cellSel ? cellSel.c : 0);
      else if (b.dataset.a === 'fwd') arrangeLayer('forward');
      else if (b.dataset.a === 'back') arrangeLayer('backward');
      else if (b.dataset.a === 'front') arrangeLayer('front');
      else if (b.dataset.a === 'toback') arrangeLayer('back');
      else if (b.dataset.a === 'header') {
        var tb = p && tblById(p.id);
        setTableChrome('header', !(tb && tb.header), 'Header row');
      } else if (b.dataset.a === 'addrow') setTableChrome('addrow', 1, 'Add row');
      else if (b.dataset.a === 'delrow') setTableChrome('delrow', 1, 'Delete row');
      else if (b.dataset.a === 'addcol') setTableChrome('addcol', 1, 'Add column');
      else if (b.dataset.a === 'delcol') setTableChrome('delcol', 1, 'Delete column');
    }, function (e) {
      if (e.target.id === 'tbl-fill') setTableChrome('fill', e.target.value, 'Table fill');
      else if (e.target.id === 'tbl-border') setTableChrome('border', e.target.value, 'Table border');
    });
    wireBar(arrbar, function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var a = b.dataset.a;
      if (a === 'del') delSelected();
      else if (a === 'fwd') arrangeLayer('forward');
      else if (a === 'back') arrangeLayer('backward');
      else if (a === 'front') arrangeLayer('front');
      else if (a === 'toback') arrangeLayer('back');
      else if (a === 'disth') arrangeDist('h');
      else if (a === 'distv') arrangeDist('v');
      else if (a === 'left' || a === 'center' || a === 'right' || a === 'top' || a === 'middle' || a === 'bottom') arrangeAlign(a);
    });
    if (window.ResizeObserver) new ResizeObserver(doFit).observe(stage); else addEventListener('resize', doFit);
    doFit();
  }
  function setLayoutDom() {
    var L = slots(cur), lay = (cur && cur.layout) || 'tc', hint = HINTS[lay] || [];
    paint(slideEl, cur, 0, null, theme, 'slide');
    title.hidden = !L.t;
    var cols = body.closest('.s-cols'); cols.hidden = !L.b;
    body2.parentNode.hidden = !L.b2;
    body.parentNode.classList.toggle('plain', L.b === 'plain');
    title.setAttribute('data-ph', hint[0] || 'Click to add a title');
    body.setAttribute('data-ph', hint[1] || BUL_HINT);
    body2.setAttribute('data-ph', 'Right column: one bullet per line');
    title.setAttribute('aria-label', 'Slide title');
    body.setAttribute('aria-label', L.b === 'plain' ? 'Slide text' : 'Slide bullets, one per line');
  }
  function paintFoot() {
    var el = document.getElementById('s-foot'); if (!el) return;
    var info = null, i = 0;
    if (window.SLMaster && deckCtx && cur && deckCtx.slides) {
      i = deckCtx.slides.indexOf(cur);
      if (i < 0) i = deckCtx.cur | 0;
      info = SLMaster.footerFor(deckCtx, i, {});
    }
    if (!info) { el.hidden = true; return; }
    el.hidden = false;
    var tx = el.querySelector('.s-foot-text'), dt = el.querySelector('.s-foot-date'), nm = el.querySelector('.s-foot-num');
    if (tx) tx.textContent = info.text || '';
    if (dt) { dt.textContent = info.date || ''; dt.hidden = !info.date; }
    if (nm) { nm.textContent = info.num || ''; nm.hidden = !info.num; }
  }
  function setDeck(d) { deckCtx = d || null; }
  function show(slide, th, deck) {
    if (deck) deckCtx = deck;
    if (th) theme = th;
    if (slide !== cur) { sels = []; cellSel = null; editSlot = ''; clearGuides(); }
    cur = slide;
    setLayoutDom();
    renderBox(title, slide ? slide.title : SLText.empty('none'), 'title');
    renderBox(body, slide ? slide.body : SLText.empty(defList('body')), 'body');
    renderBox(body2, slide ? slide.body2 : SLText.empty('bullet'), 'body2');
    autoTitle(); drawObjs(); paintFoot();
  }

  /* the static slide renderer (thumbnails + Present + Print). o = { max, show } */
  function bodyHTML(doc, o, plain, extra) {
    var d = SLText.clean(doc, { list: plain ? 'none' : 'bullet' });
    var inner = SLText.html(d, o);
    return '<div class="b' + (plain ? ' plain' : '') + (hasList(d) ? ' has-list' : '') + (extra || '') + '">' + inner + '</div>';
  }
  function html(s, i, o) {
    o = o || {}; s = s || {};
    var L = slots(s), h = '';
    if (L.ph) h += '<div class="s-picph"></div>';
    if (L.t) {
      var emptyT = !SLText.has(s.title);
      if (!emptyT) h += '<div class="t">' + SLText.html(s.title, { show: true, single: true }) + '</div>';
      else h += o.show ? '<div class="t empty"></div>' : '<div class="t empty">Slide ' + ((i | 0) + 1) + '</div>';
    }
    if (L.b) h += '<div class="s-cols">' + bodyHTML(s.body, o, L.b === 'plain') + (L.b2 ? bodyHTML(s.body2, o, false, ' b2') : '') + '</div>';
    var objs = '';
    if (s.pics && s.pics.length) objs += '<div class="pics">' + s.pics.map(function (p) { return picHTML(p, false); }).join('') + '</div>';
    var tbs = s.texts || s.tboxes || []; if (tbs.length) objs += '<div class="tboxes">' + tbs.map(function (tb) { return boxHTML(tb, false); }).join('') + '</div>';
    if (s.shapes && s.shapes.length) objs += '<div class="shapes">' + s.shapes.map(function (sh) { return shapeHTML(sh, false); }).join('') + '</div>';
    if (s.tables && s.tables.length) objs += '<div class="tables">' + s.tables.map(function (tb) { return tableHTML(tb, false); }).join('') + '</div>';
    if (objs) h += '<div class="objs">' + objs + '</div>';
    if (!o.noFoot && window.SLMaster) {
      var deck = o.deck || deckCtx;
      if (deck) h += SLMaster.footHTML(SLMaster.footerFor(deck, i, o));
    }
    return h;
  }

  window.SLEdit = {
    init: init, show: show, html: html, paint: paint, cls: cls, bgStyle: bgStyle, slots: slots, W: W, H: H, fit: doFit, scale: function () { return scale; }, setDeck: setDeck, paintFoot: paintFoot,
    theme: function () { return theme; },
    selected: function () {
      var p = primary(); if (!p) return null;
      var obj = objBy(p.kind, p.id); if (!obj) return null;
      return { kind: p.kind, obj: obj, editing: !!editSlot, items: sels.slice(), cell: cellSel };
    },
    select: function (id, kind, add) { select(id, kind, add); },
    addPic: addPic, delPic: delSelected, addBox: addBox, delBox: delSelected, delObj: delSelected, delSelected: delSelected,
    addShape: addShape, addTable: addTable, layer: layer, arrangeLayer: arrangeLayer, arrangeAlign: arrangeAlign, arrangeDist: arrangeDist,
    setBoxChrome: setBoxChrome, setShapeChrome: setShapeChrome, setTableChrome: setTableChrome,
    startEdit: function (kind, id, r, c) { if (id == null) return startEdit('tbox', kind); return startEdit(kind, id, r, c); },
    endEdit: endEdit,
    editingBox: function () { return editSlot || ''; },
    placeholderRect: placeholderRect,
    nudge: function (dx, dy) { return nudgeObj(dx, dy); },
    redrawPics: drawObjs, redraw: drawObjs,
    format: format, para: paraFmt,
    marks: function () {
      var ctx = activeCtx();
      if (!ctx) return { b: false, i: false, u: false, s: false, size: 0, color: '', hl: '', align: '', list: 'none', level: 0, on: false };
      return Object.assign({ on: true }, SLText.marksAt(ctx.doc, getSel(ctx.el) || 'all'), { slot: ctx.slot });
    },
    active: activeCtx,
    focusTitle: function () { if (!title.hidden) placeEnd(title); else if (!body.closest('.s-cols').hidden) placeStart(body); },
    focusBody: function () { placeStart(body); }
  };
})();
