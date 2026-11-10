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
     or Enter edits. Thumbnails, Present and Print use the same renderer, so styling matches the editor. */
(function () {
  'use strict';
  var W = 960, H = 540;
  var $ = function (id) { return document.getElementById(id); };
  var title, body, body2, fit, stage, slideEl, picsEl, boxesEl, picph, picbar, tbbar, cur = null, theme = 'light';
  var onChange = function () {}, onObj = function () {}, onPickPic = function () {}, onFmt = function () {}, scale = 1;
  var SLOTS = { title: { t: 1, b: 'plain' }, tc: { t: 1, b: 'bul' }, two: { t: 1, b: 'bul', b2: 1 }, sec: { t: 1, b: 'plain' },
    pic: { t: 1, b: 'plain', ph: 1 }, to: { t: 1 }, blank: {} };
  var HINTS = { title: ['Click to add a title', 'Click to add a subtitle'], sec: ['Click to add a section title', 'Click to add text'],
    pic: ['Click to add a heading', 'Click to add a caption'], two: ['Click to add a title', 'Left column: one bullet per line'] };
  var BUL_HINT = 'Click to add bullets: one per line, Tab to indent';
  function slots(s) { return SLOTS[(s && s.layout) || 'tc'] || SLOTS.tc; }
  function cls(s, th) { return 'lay-' + ((s && SLOTS[s.layout]) ? s.layout : 'tc') + ' th-' + (th || 'light'); }
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
    if (slot === 'body' && slots(cur).b === 'plain') return 'none';
    return 'bullet';
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
    return cur.body;
  }
  function writeSlot(slot, doc) {
    if (!cur) return;
    if (slot === 'title') cur.title = doc;
    else if (slot === 'body2') cur.body2 = doc;
    else if (slot.indexOf('tb:') === 0) { var t = tbById(slot.slice(3)); if (t) t.doc = doc; }
    else cur.body = doc;
  }
  function elSlot(el) { return el && el.dataset ? el.dataset.slot : ''; }

  function doFit() {
    var r = stage.getBoundingClientRect(), pos = $('pos');
    var bar = 0;
    if (picbar && !picbar.hidden) bar = picbar.offsetHeight + 6;
    if (tbbar && !tbbar.hidden) bar = Math.max(bar, tbbar.offsetHeight + 6);
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
    if (editTb) {
      var t = tbById(editTb), inEl = boxesEl && boxesEl.querySelector('.tbox[data-id="' + editTb + '"] .tbox-in');
      if (t && inEl) t.doc = readBox(inEl, 'tb:' + editTb);
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
    if (editTb && boxesEl) {
      var inEl = boxesEl.querySelector('.tbox[data-id="' + editTb + '"] .tbox-in');
      if (inEl && (el === inEl || inEl.contains(el))) return { el: inEl, slot: 'tb:' + editTb, doc: readBox(inEl, 'tb:' + editTb) };
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
      if (e.key === 'Escape' && editTb && slot.indexOf('tb:') === 0) { e.preventDefault(); endEdit(true); }
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

  /* ---------- pictures + free text boxes ---------- */
  var sel = '', selKind = '', editTb = '', G = null;
  function boxArr() {
    if (!cur) return [];
    if (!cur.texts) cur.texts = cur.tboxes || [];
    cur.tboxes = cur.texts;
    return cur.texts;
  }
  function picById(id) { return cur && (cur.pics || []).filter(function (p) { return p.id === id; })[0]; }
  function tbById(id) { return boxArr().filter(function (t) { return t.id === id; })[0]; }
  function picHTML(p, edit) {
    var u = window.SLPics ? SLPics.url(p) : '';
    var st = 'left:' + p.x + 'px;top:' + p.y + 'px;width:' + p.w + 'px;height:' + p.h + 'px;z-index:' + (p.z || 0);
    return '<div class="pic' + (u ? '' : ' miss') + (edit && selKind === 'pic' && p.id === sel ? ' sel' : '') + '"' + (edit ? ' data-id="' + escq(p.id) + '"' : '') + ' style="' + st + '">' +
      (u ? '<img src="' + escq(u) + '" alt="" draggable="false" decoding="async" style="object-fit:' + (p.fit === 'contain' ? 'contain' : 'cover') + '">' : '') + '</div>';
  }
  var HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  function selboxHTML(o) {
    return '<div class="selbox" style="left:' + o.x + 'px;top:' + o.y + 'px;width:' + o.w + 'px;height:' + o.h + 'px">' +
      HANDLES.map(function (h) { return '<div class="h h-' + h + '" data-h="' + h + '"></div>'; }).join('') + '</div>';
  }
  function drawPics() {
    var ps = (cur && cur.pics) || [];
    if (selKind === 'pic' && sel && !picById(sel)) { sel = ''; selKind = ''; }
    var p = selKind === 'pic' ? picById(sel) : null;
    picsEl.innerHTML = ps.map(function (q) { return picHTML(q, true); }).join('') + (p ? selboxHTML(p) : '');
    picph.hidden = !(slots(cur).ph && !ps.length);
    var had = !picbar.hidden; picbar.hidden = !p;
    if (p) {
      [].forEach.call(picbar.querySelectorAll('[data-fit]'), function (b) { b.classList.toggle('on', b.dataset.fit === p.fit); b.setAttribute('aria-pressed', b.dataset.fit === p.fit ? 'true' : 'false'); });
    }
    if (had !== !picbar.hidden) doFit();
  }
  function boxHTML(t, edit) {
    var st = 'left:' + t.x + 'px;top:' + t.y + 'px;width:' + t.w + 'px;height:' + t.h + 'px;z-index:' + (t.z || 1);
    if (t.fill) st += ';background:' + t.fill;
    if (t.border) st += ';box-shadow:inset 0 0 0 2px ' + t.border;
    var on = edit && selKind === 'tbox' && t.id === sel;
    var ed = edit && editTb === t.id;
    var inner = SLText.html(t.doc, { show: true, list: 'none' });
    return '<div class="tbox' + (on ? ' sel' : '') + (ed ? ' editing' : '') + (SLText.has(t.doc) ? '' : ' empty') + '"' +
      (edit ? ' data-id="' + escq(t.id) + '"' : '') + ' style="' + st + '">' +
      '<div class="tbox-in s-ed' + (hasList(t.doc) ? ' has-list' : '') + (SLText.has(t.doc) ? '' : ' empty') + '"' +
      (edit ? ' data-slot="tb:' + escq(t.id) + '" data-ph="Click to add text"' : '') +
      (ed ? ' contenteditable="true" spellcheck="true"' : '') + '>' + inner + '</div></div>';
  }
  function drawBoxes() {
    if (!boxesEl) return;
    var ts = boxArr();
    if (selKind === 'tbox' && sel && !tbById(sel)) { sel = ''; selKind = ''; }
    var t = selKind === 'tbox' ? tbById(sel) : null;
    /* keep the live editor node if we are mid-edit, so typing / browser undo survive a sibling paint */
    var keep = null, keepId = editTb;
    if (keepId) {
      var live = boxesEl.querySelector('.tbox[data-id="' + keepId + '"]');
      if (live) { keep = live; live.parentNode && live.parentNode.removeChild(live); }
    }
    boxesEl.innerHTML = ts.map(function (q) { return (keep && q.id === keepId) ? '' : boxHTML(q, true); }).join('') +
      (t && t.id !== keepId ? selboxHTML(t) : (t && t.id === keepId ? selboxHTML(t) : ''));
    if (keep) {
      boxesEl.insertBefore(keep, boxesEl.querySelector('.selbox'));
      if (!boxesEl.querySelector('.selbox') && t && t.id === keepId) boxesEl.appendChild(htmlEl(selboxHTML(t)));
    }
    var had = tbbar && !tbbar.hidden; if (tbbar) tbbar.hidden = !(t && editTb !== t.id);
    if (t && tbbar && !tbbar.hidden) {
      var fi = document.getElementById('tb-fill'), bo = document.getElementById('tb-border');
      if (fi) fi.value = t.fill || '#ffffff';
      if (bo) bo.value = t.border || '#2563eb';
    }
    if (had !== (tbbar && !tbbar.hidden)) doFit();
  }
  function htmlEl(h) { var d = document.createElement('div'); d.innerHTML = h; return d.firstChild; }
  function drawObjs() { drawPics(); drawBoxes(); }
  function moveBox(o, kind) {
    var root = kind === 'tbox' ? boxesEl : picsEl;
    var el = root && root.querySelector((kind === 'tbox' ? '.tbox' : '.pic') + '[data-id="' + o.id + '"]');
    var sb = (boxesEl && boxesEl.querySelector('.selbox')) || (picsEl && picsEl.querySelector('.selbox'));
    [el, sb].forEach(function (x) { if (!x) return; x.style.left = o.x + 'px'; x.style.top = o.y + 'px'; x.style.width = o.w + 'px'; x.style.height = o.h + 'px'; });
  }
  function endEdit(keepSel) {
    if (!editTb) return;
    var id = editTb, inEl = boxesEl && boxesEl.querySelector('.tbox[data-id="' + id + '"] .tbox-in');
    if (inEl && cur) {
      var t = tbById(id); if (t) t.doc = readBox(inEl, 'tb:' + id);
    }
    editTb = '';
    try { if (inEl) inEl.blur(); } catch (_) { /* */ }
    drawBoxes();
    if (keepSel) { sel = id; selKind = 'tbox'; drawBoxes(); }
    onChange(cur); onFmt();
  }
  function startEdit(id) {
    var t = tbById(id); if (!t) return;
    if (editTb && editTb !== id) endEdit(false);
    sel = id; selKind = 'tbox'; editTb = id;
    drawBoxes();
    var inEl = boxesEl.querySelector('.tbox[data-id="' + id + '"] .tbox-in');
    if (inEl) {
      inEl.setAttribute('contenteditable', 'true');
      inEl.setAttribute('spellcheck', 'true');
      if (!inEl.dataset.bound) { inEl.dataset.bound = '1'; boxKeys(inEl, 'tb:' + id); }
      placeEnd(inEl);
    }
    if (tbbar) { tbbar.hidden = true; doFit(); }
    onFmt();
  }
  function select(id, kind) {
    if (editTb && !(kind === 'tbox' && id === editTb)) endEdit(false);
    if (sel === id && selKind === (kind || selKind)) return;
    sel = id || ''; selKind = sel ? (kind || 'pic') : '';
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
    if (selKind === 'pic') return picById(sel);
    if (selKind === 'tbox') return tbById(sel);
    return null;
  }
  function objDown(e) {
    var h = e.target.closest('.h'), pe = e.target.closest('.pic'), te = e.target.closest('.tbox');
    if (!h && !pe && !te) return;
    if (e.button > 0) return;
    /* while editing a text box, clicks inside the text stay with the caret */
    if (te && editTb === te.dataset.id && !h && e.target.closest('.tbox-in')) return;
    e.preventDefault(); e.stopPropagation();
    try { if (document.activeElement && document.activeElement !== document.body && !(te && editTb === te.dataset.id)) document.activeElement.blur(); } catch (_) { /* */ }
    try { stage.focus({ preventScroll: true }); } catch (_) { /* */ }
    if (pe) select(pe.dataset.id, 'pic');
    else if (te) select(te.dataset.id, 'tbox');
    var o = objOf(); if (!o) return;
    G = { id: e.pointerId, kind: selKind, mode: h ? h.dataset.h : 'move', x0: e.clientX, y0: e.clientY,
      r0: { x: o.x, y: o.y, w: o.w, h: o.h }, before: before(), moved: false };
  }
  function objMove(e) {
    if (!G || e.pointerId !== G.id) return;
    var o = objOf(); if (!o) { G = null; return; }
    var dx = (e.clientX - G.x0) / scale, dy = (e.clientY - G.y0) / scale, r = G.r0, m = G.mode;
    if (!G.moved && Math.abs(dx) + Math.abs(dy) < 2 / scale) return;
    G.moved = true; e.preventDefault();
    if (m === 'move') { o.x = r.x + dx; o.y = r.y + dy; clamp(o, G.kind === 'tbox' ? 80 : 16, G.kind === 'tbox' ? 40 : 16); moveBox(o, G.kind); return; }
    var x = r.x, y = r.y, w = r.w, hh = r.h;
    if (m.indexOf('e') >= 0) w = r.w + dx;
    if (m.indexOf('w') >= 0) w = r.w - dx;
    if (m.indexOf('s') >= 0) hh = r.h + dy;
    if (m.indexOf('n') >= 0) hh = r.h - dy;
    w = Math.max(G.kind === 'tbox' ? 80 : 16, w); hh = Math.max(G.kind === 'tbox' ? 40 : 16, hh);
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
    o.x = x; o.y = y; o.w = w; o.h = hh; clamp(o, G.kind === 'tbox' ? 80 : 16, G.kind === 'tbox' ? 40 : 16); moveBox(o, G.kind);
  }
  function objUp(e) {
    if (!G || e.pointerId !== G.id) return;
    var g = G; G = null;
    if (g.moved) {
      objDone(g.before, g.mode === 'move' ? (g.kind === 'tbox' ? 'Move text box' : 'Move picture') : (g.kind === 'tbox' ? 'Resize text box' : 'Resize picture'));
    }
  }
  function editPic(fn, label) {
    var p = picById(sel); if (!p || selKind !== 'pic') return false;
    var b = before(); if (fn(p) === false) return false; clamp(p); drawPics(); objDone(b, label); return true;
  }
  function delPic() {
    var p = picById(sel); if (!p || selKind !== 'pic') return false;
    var b = before(); cur.pics = cur.pics.filter(function (q) { return q !== p; }); sel = ''; selKind = ''; drawObjs(); objDone(b, 'Delete picture'); return true;
  }
  function addPic(p) {
    if (!cur) return;
    if (editTb) endEdit(false);
    var b = before(); cur.pics = (cur.pics || []).concat([p]); sel = p.id; selKind = 'pic'; drawObjs(); objDone(b, 'Insert picture');
  }
  function delBox() {
    var t = tbById(sel); if (!t || selKind !== 'tbox') return false;
    if (editTb) endEdit(false);
    var b = before(); cur.texts = boxArr().filter(function (q) { return q !== t; }); cur.tboxes = cur.texts; sel = ''; selKind = ''; drawObjs(); objDone(b, 'Delete text box'); return true;
  }
  function addBox(at) {
    if (!cur) return null;
    if (boxArr().length >= SLText.MAX_BOX) return null;
    if (editTb) endEdit(false);
    var b = before();
    var n = boxArr().length;
    var box = SLText.cleanBox({ id: SLSave.uid(), x: (at && at.x) || (80 + n * 24), y: (at && at.y) || (80 + n * 24),
      w: 320, h: 100, doc: SLText.empty('none') });
    if (!at) { box.x = Math.round((W - box.w) / 2 + n * 24); box.y = Math.round((H - box.h) / 2 + n * 24); clamp(box, 80, 40); }
    cur.texts = boxArr().concat([box]); cur.tboxes = cur.texts;
    sel = box.id; selKind = 'tbox'; drawObjs(); objDone(b, 'Insert text box');
    startEdit(box.id);
    return box;
  }
  function placeholderRect() {
    if (!slots(cur).ph) return null;
    var was = picph.hidden; picph.hidden = false;
    var r = { x: picph.offsetLeft, y: picph.offsetTop, w: picph.offsetWidth, h: picph.offsetHeight };
    picph.hidden = was; return r;
  }
  function nudgeObj(dx, dy) {
    var o = objOf(); if (!o || editTb) return false;
    var b = before(); o.x += dx; o.y += dy; clamp(o, selKind === 'tbox' ? 80 : 16, selKind === 'tbox' ? 40 : 16);
    moveBox(o, selKind); objDone(b, selKind === 'tbox' ? 'Move text box' : 'Move picture'); return true;
  }
  function delObj() {
    if (selKind === 'tbox') return delBox();
    if (selKind === 'pic') return delPic();
    return false;
  }
  function nextZ(dir) {
    var zs = [];
    (cur.pics || []).forEach(function (p) { zs.push(p.z || 0); });
    boxArr().forEach(function (tb) { zs.push(tb.z || 1); });
    if (!zs.length) return dir > 0 ? 1 : 0;
    return dir > 0 ? Math.max.apply(null, zs) + 1 : Math.min.apply(null, zs) - 1;
  }
  function layer(dir) {
    var o = objOf(); if (!o) return false;
    var b = before();
    o.z = nextZ(dir);
    drawObjs(); objDone(b, dir > 0 ? 'Bring forward' : 'Send back'); return true;
  }
  function setBoxChrome(prop, value, label) {
    var o = selKind === 'tbox' ? tbById(sel) : null; if (!o) return false;
    var b = before();
    if (prop === 'fill') { if (value) o.fill = value; else delete o.fill; }
    else if (prop === 'border') { if (value) o.border = value; else delete o.border; }
    else return false;
    drawBoxes(); objDone(b, label || 'Text box style'); return true;
  }

  function init(o) {
    onChange = o.onChange || onChange; onObj = o.onObj || onObj; onPickPic = o.onPickPic || onPickPic; onFmt = o.onFmt || onFmt;
    title = $('s-title'); body = $('s-body'); body2 = $('s-body2'); fit = $('fit'); stage = $('stage'); slideEl = $('slide');
    picsEl = $('pics'); boxesEl = $('tboxes'); picph = $('s-picph'); picbar = $('picbar'); tbbar = $('tbbar');
    boxKeys(title, 'title'); boxKeys(body, 'body'); boxKeys(body2, 'body2');
    picsEl.addEventListener('pointerdown', objDown);
    if (boxesEl) {
      boxesEl.addEventListener('pointerdown', objDown);
      boxesEl.addEventListener('dblclick', function (e) {
        var t = e.target.closest('.tbox'); if (!t) return;
        e.preventDefault(); startEdit(t.dataset.id);
      });
    }
    addEventListener('pointermove', objMove, { passive: false });
    addEventListener('pointerup', objUp);
    addEventListener('pointercancel', function (e) {
      if (G && e.pointerId === G.id) {
        var o = objOf();
        if (o && G.moved) { o.x = G.r0.x; o.y = G.r0.y; o.w = G.r0.w; o.h = G.r0.h; moveBox(o, G.kind); }
        G = null;
      }
    });
    slideEl.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.pics .pic') || e.target.closest('.tbox') || e.target.closest('.selbox')) return;
      if (editTb) endEdit(false);
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
      else if (b.dataset.a === 'del') delPic();
      else if (b.dataset.a === 'fwd') layer(1);
      else if (b.dataset.a === 'back') layer(-1);
    });
    if (tbbar) {
      tbbar.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.dataset.a === 'del') delBox();
        else if (b.dataset.a === 'edit' && selKind === 'tbox') startEdit(sel);
        else if (b.dataset.a === 'fwd') layer(1);
        else if (b.dataset.a === 'back') layer(-1);
        else if (b.dataset.a === 'nofill') setBoxChrome('fill', '', 'Text box fill');
        else if (b.dataset.a === 'noborder') setBoxChrome('border', '', 'Text box line');
      });
      tbbar.addEventListener('input', function (e) {
        if (e.target.id === 'tb-fill') setBoxChrome('fill', e.target.value, 'Text box fill');
        else if (e.target.id === 'tb-border') setBoxChrome('border', e.target.value, 'Text box line');
      });
    }
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
  function show(slide, th) {
    if (th) theme = th;
    if (slide !== cur) { sel = ''; selKind = ''; if (editTb) { editTb = ''; } }
    cur = slide;
    setLayoutDom();
    renderBox(title, slide ? slide.title : SLText.empty('none'), 'title');
    renderBox(body, slide ? slide.body : SLText.empty(defList('body')), 'body');
    renderBox(body2, slide ? slide.body2 : SLText.empty('bullet'), 'body2');
    autoTitle(); drawObjs();
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
    if (s.pics && s.pics.length) h += '<div class="pics">' + s.pics.map(function (p) { return picHTML(p, false); }).join('') + '</div>';
    var tbs = s.texts || s.tboxes || []; if (tbs.length) h += '<div class="tboxes">' + tbs.map(function (tb) { return boxHTML(tb, false); }).join('') + '</div>';
    return h;
  }

  window.SLEdit = {
    init: init, show: show, html: html, paint: paint, cls: cls, bgStyle: bgStyle, slots: slots, W: W, H: H, fit: doFit, scale: function () { return scale; },
    theme: function () { return theme; },
    selected: function () {
      if (selKind === 'pic' && picById(sel)) return { kind: 'pic', obj: picById(sel) };
      if (selKind === 'tbox' && tbById(sel)) return { kind: 'tbox', obj: tbById(sel), editing: editTb === sel };
      return null;
    },
    select: function (id, kind) { select(id, kind); },
    addPic: addPic, delPic: delPic, addBox: addBox, delBox: delBox, delObj: delObj, layer: layer, setBoxChrome: setBoxChrome, startEdit: startEdit, endEdit: endEdit,
    editingBox: function () { return editTb || ''; },
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
