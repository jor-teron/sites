/* Hub Office Slides SL1 — the slide canvas (SLEdit). A 960 x 540 design slide scaled with one CSS transform to fit the
   stage (ResizeObserver). Title = one textarea (Enter goes to the bullets). Bullets = a textarea, one bullet per line;
   a leading TAB = indented one level (Tab / Shift+Tab on the selected lines, Enter keeps the indent, native undo kept via execCommand where it works).
   The dots are drawn by a mirror div behind the textarea (same font, width and wrapping, transparent text), so wrapped
   lines keep one dot. Only the visible slide is live DOM; thumbnails are plain text (slides_list.js).
   SL2: SLEdit.html(slide, i, o) is the one static slide renderer (same design classes), used by the thumbnails
   (o.max = 9 lines, no empty lines, one line each) and by Present (slides_show.js: every line, wrapped).
   SL3: layouts, deck themes, pictures.
   - The slide element carries 'lay-<layout> th-<theme>' (+ an inline --s-bg for a per-slide background); the editor,
     the thumbnails and Present all use these classes and the same placeholder elements in the same order
     (.s-picph, title, .s-cols > body [+ body2], .pics), so CSS places them identically everywhere (paint()).
   - Placeholders per layout (SLOTS): t = title, b = 'bul' (bullets) or 'plain' (subtitle / text / caption, no dots),
     b2 = right column (Two Columns), ph = picture placeholder (Picture + Caption).
   - Pictures: absolutely placed in design px over the slide (.pics layer, above the text). In the editor: click to
     select, drag to move, 8 handles to resize (Shift keeps the aspect ratio), arrow keys nudge (from slides_app.js),
     the picture bar sets Crop to fill / Fit / Original shape / Delete. Every finished change calls o.onObj(slide,
     before, label) so the app can save and keep Undo. */
(function () {
  'use strict';
  var W = 960, H = 540;
  var $ = function (id) { return document.getElementById(id); };
  var title, body, body2, mirror, mirror2, fit, stage, slideEl, picsEl, picph, picbar, cur = null, theme = 'light', onChange = function () {}, onObj = function () {}, onPickPic = function () {}, scale = 1;
  var SLOTS = { title: { t: 1, b: 'plain' }, tc: { t: 1, b: 'bul' }, two: { t: 1, b: 'bul', b2: 1 }, sec: { t: 1, b: 'plain' },
    pic: { t: 1, b: 'plain', ph: 1 }, to: { t: 1 }, blank: {} };
  var HINTS = { title: ['Click to add a title', 'Click to add a subtitle'], sec: ['Click to add a section title', 'Click to add text'],
    pic: ['Click to add a heading', 'Click to add a caption'], two: ['Click to add a title', 'Left column: one bullet per line'] };
  var BUL_HINT = 'Click to add bullets: one per line, Tab to indent';
  function slots(s) { return SLOTS[(s && s.layout) || 'tc'] || SLOTS.tc; }
  function cls(s, th) { return 'lay-' + ((s && SLOTS[s.layout]) ? s.layout : 'tc') + ' th-' + (th || 'light'); }
  function bgStyle(s) { return s && s.bg ? '--s-bg:' + s.bg : ''; }
  /* one place that dresses a slide element: editor, thumbnails, Present */
  function paint(el, s, i, o, th, base) {
    el.className = base + ' ' + cls(s, th);
    el.style.removeProperty('--s-bg');
    if (s && s.bg) el.style.setProperty('--s-bg', s.bg);
    if (o) el.innerHTML = html(s, i, o);
  }

  function esc(s) { return s.replace(/[&<>]/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'; }); }
  function drawMirror(ta, mir, plain) {
    if (plain) { mir.innerHTML = ''; return; }
    var lines = ta.value.split('\n'), h = '';
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i], lv = l.charAt(0) === '\t' ? 1 : 0;
      var m = /^\t*/.exec(l)[0];
      /* an empty last line (after Enter) still gets a dot, so the new bullet shows */
      h += '<div class="ln l' + lv + '">' + esc(m) + (l.length || i === lines.length - 1 || lines.length === 1 ? '<span class="d"></span>' : '') + esc(l.slice(m.length)) + '\u200b</div>';
    }
    mir.innerHTML = ta.value ? h : '';
    mir.scrollTop = ta.scrollTop;
  }
  function mirrors() { var L = slots(cur); drawMirror(body, mirror, L.b === 'plain'); drawMirror(body2, mirror2, false); }
  /* SL3: + the border (the title has an accent underline now), so the box is exactly as tall as Present's .t */
  function autoTitle() { title.style.height = 'auto'; var bd = title.offsetHeight - title.clientHeight; title.style.height = Math.min(160 + bd, title.scrollHeight + bd) + 'px'; }
  function doFit() {
    var r = stage.getBoundingClientRect(), pos = $('pos'), bar = picbar && !picbar.hidden ? picbar.offsetHeight + 6 : 0;
    var aw = r.width, ah = r.height - (pos ? pos.offsetHeight + 6 : 0) - bar;
    scale = Math.max(0.1, Math.min(aw / W, ah / H));
    fit.style.width = Math.floor(W * scale) + 'px'; fit.style.height = Math.floor(H * scale) + 'px';
    slideEl.style.transform = 'scale(' + scale + ')';
    slideEl.style.setProperty('--hs', (14 / scale).toFixed(2) + 'px');
    slideEl.style.setProperty('--ol', (2 / scale).toFixed(2) + 'px');
  }
  /* replace [a, b) with text keeping the browser's undo where possible */
  function replace(el, a, b, text) {
    el.focus(); el.setSelectionRange(a, b);
    var ok = false; try { ok = document.execCommand('insertText', false, text); } catch (_) { ok = false; }
    if (!ok || el.value.slice(a, a + text.length) !== text) { el.setRangeText(text, a, b, 'end'); }
  }
  function indent(out, ta) {
    ta = ta || body;
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    var ls = v.lastIndexOf('\n', s - 1) + 1;
    var le = v.indexOf('\n', e > s && v.charAt(e - 1) === '\n' ? e - 1 : e); if (le < 0) le = v.length;
    var block = v.slice(ls, le).split('\n'), ds = 0, de = 0;
    var nb = block.map(function (l, i) {
      if (out) { if (l.charAt(0) === '\t') { if (i === 0) ds = -1; de--; return l.slice(1); } return l; }
      if (l.charAt(0) === '\t') return l;            /* one level only in SL1 */
      if (i === 0) ds = 1; de++; return '\t' + l;
    }).join('\n');
    if (nb === v.slice(ls, le)) return;
    replace(ta, ls, le, nb);
    var ns = Math.max(ls, s + ds), ne = Math.max(ns, e + de);
    if (s === e) ns = ne = Math.max(ls, s + ds);
    ta.setSelectionRange(ns, ne);
    changed();
  }
  function changed() {
    if (!cur) return;
    cur.title = title.value.replace(/[\r\n]+/g, ' '); cur.body = body.value.replace(/\r/g, ''); cur.body2 = body2.value.replace(/\r/g, '');
    mirrors(); onChange(cur);
  }
  function bodyKeys(ta, mir) {
    ta.addEventListener('input', changed);
    ta.addEventListener('scroll', function () { mir.scrollTop = ta.scrollTop; });
    ta.addEventListener('keydown', function (e) {
      var plain = ta === body && slots(cur).b === 'plain';
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); if (!plain) indent(e.shiftKey, ta); }
      else if (e.key === 'Enter' && !plain && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && ta.selectionStart === ta.selectionEnd) {
        /* a new line keeps the indent; Enter on an empty indented bullet outdents it instead */
        var p = ta.selectionStart, val = ta.value, a = val.lastIndexOf('\n', p - 1) + 1, z = val.indexOf('\n', p); if (z < 0) z = val.length;
        var line = val.slice(a, z);
        if (line.charAt(0) !== '\t') return;
        e.preventDefault();
        if (line === '\t') indent(true, ta); else { replace(ta, p, p, '\n\t'); changed(); }
      }
      else if (e.key === 'ArrowUp' && ta.selectionStart === 0 && ta.selectionEnd === 0 && !title.hidden) { e.preventDefault(); title.focus(); var n = title.value.length; title.setSelectionRange(n, n); }
      else if (e.key === 'Backspace' && !plain && ta.selectionStart === ta.selectionEnd) {
        /* Backspace right after an indent tab = outdent */
        var s = ta.selectionStart, v = ta.value, ls = v.lastIndexOf('\n', s - 1) + 1;
        if (s === ls + 1 && v.charAt(ls) === '\t') { e.preventDefault(); indent(true, ta); }
      }
    });
  }

  /* ---------- SL3 pictures in the editor ---------- */
  var sel = '', G = null;   /* G = gesture { id, mode:'move'|handle, p0:{x,y}, r0, before, moved } */
  function picById(id) { return cur && (cur.pics || []).filter(function (p) { return p.id === id; })[0]; }
  function picHTML(p, edit) {
    var u = window.SLPics ? SLPics.url(p) : '';
    var st = 'left:' + p.x + 'px;top:' + p.y + 'px;width:' + p.w + 'px;height:' + p.h + 'px';
    return '<div class="pic' + (u ? '' : ' miss') + (edit && p.id === sel ? ' sel' : '') + '"' + (edit ? ' data-id="' + escq(p.id) + '"' : '') + ' style="' + st + '">' +
      (u ? '<img src="' + escq(u) + '" alt="" draggable="false" decoding="async" style="object-fit:' + (p.fit === 'contain' ? 'contain' : 'cover') + '">' : '') + '</div>';
  }
  var HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  function drawPics() {
    var ps = (cur && cur.pics) || [];
    if (sel && !picById(sel)) sel = '';
    var p = picById(sel);
    picsEl.innerHTML = ps.map(function (q) { return picHTML(q, true); }).join('') +
      (p ? '<div class="selbox" style="left:' + p.x + 'px;top:' + p.y + 'px;width:' + p.w + 'px;height:' + p.h + 'px">' +
        HANDLES.map(function (h) { return '<div class="h h-' + h + '" data-h="' + h + '"></div>'; }).join('') + '</div>' : '');
    picph.hidden = !(slots(cur).ph && !ps.length);
    var had = !picbar.hidden; picbar.hidden = !p;
    if (p) {
      [].forEach.call(picbar.querySelectorAll('[data-fit]'), function (b) { b.classList.toggle('on', b.dataset.fit === p.fit); b.setAttribute('aria-pressed', b.dataset.fit === p.fit ? 'true' : 'false'); });
    }
    if (had !== !picbar.hidden) doFit();
  }
  function moveBox(p) {
    var el = picsEl.querySelector('.pic[data-id="' + p.id + '"]'), sb = picsEl.querySelector('.selbox');
    [el, sb].forEach(function (x) { if (!x) return; x.style.left = p.x + 'px'; x.style.top = p.y + 'px'; x.style.width = p.w + 'px'; x.style.height = p.h + 'px'; });
  }
  function select(id) { if (sel === id) return; sel = id || ''; drawPics(); }
  function clamp(p) {
    p.w = Math.max(16, Math.min(4000, p.w)); p.h = Math.max(16, Math.min(4000, p.h));
    p.x = Math.max(24 - p.w, Math.min(W - 24, p.x)); p.y = Math.max(24 - p.h, Math.min(H - 24, p.y));
    p.x = Math.round(p.x * 10) / 10; p.y = Math.round(p.y * 10) / 10; p.w = Math.round(p.w * 10) / 10; p.h = Math.round(p.h * 10) / 10;
  }
  function objDone(before, label) { if (cur) onObj(cur, before, label); }
  function before() { return SLSave.cloneSlide(cur); }
  function picDown(e) {
    var h = e.target.closest('.h'), pe = e.target.closest('.pic');
    if (!h && !pe) return;
    if (e.button > 0) return;
    e.preventDefault(); e.stopPropagation();
    try { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); } catch (_) { /* */ }
    try { stage.focus({ preventScroll: true }); } catch (_) { /* */ }
    if (pe) select(pe.dataset.id);
    var p = picById(sel); if (!p) return;
    G = { id: e.pointerId, mode: h ? h.dataset.h : 'move', x0: e.clientX, y0: e.clientY, r0: { x: p.x, y: p.y, w: p.w, h: p.h }, before: before(), moved: false };
  }
  function picMove(e) {
    if (!G || e.pointerId !== G.id) return;
    var p = picById(sel); if (!p) { G = null; return; }
    var dx = (e.clientX - G.x0) / scale, dy = (e.clientY - G.y0) / scale, r = G.r0, m = G.mode;
    if (!G.moved && Math.abs(dx) + Math.abs(dy) < 2 / scale) return;
    G.moved = true; e.preventDefault();
    if (m === 'move') { p.x = r.x + dx; p.y = r.y + dy; clamp(p); moveBox(p); return; }
    var x = r.x, y = r.y, w = r.w, hh = r.h;
    if (m.indexOf('e') >= 0) w = r.w + dx;
    if (m.indexOf('w') >= 0) w = r.w - dx;
    if (m.indexOf('s') >= 0) hh = r.h + dy;
    if (m.indexOf('n') >= 0) hh = r.h - dy;
    w = Math.max(16, w); hh = Math.max(16, hh);
    if (e.shiftKey) {   /* keep the aspect ratio */
      var a = r.w / r.h;
      if (m === 'n' || m === 's') w = hh * a;
      else if (m === 'e' || m === 'w') hh = w / a;
      else if (w / r.w > hh / r.h) hh = w / a; else w = hh * a;
    }
    if (m.indexOf('w') >= 0) x = r.x + r.w - w;
    if (m.indexOf('n') >= 0) y = r.y + r.h - hh;
    if (e.shiftKey && (m === 'n' || m === 's')) x = r.x + (r.w - w) / 2;
    if (e.shiftKey && (m === 'e' || m === 'w')) y = r.y + (r.h - hh) / 2;
    p.x = x; p.y = y; p.w = w; p.h = hh; clamp(p); moveBox(p);
  }
  function picUp(e) {
    if (!G || e.pointerId !== G.id) return;
    var g = G; G = null;
    if (g.moved) { objDone(g.before, g.mode === 'move' ? 'Move picture' : 'Resize picture'); }
  }
  function editPic(fn, label) {
    var p = picById(sel); if (!p) return false;
    var b = before(); if (fn(p) === false) return false; clamp(p); drawPics(); objDone(b, label); return true;
  }
  function delPic() {
    var p = picById(sel); if (!p) return false;
    var b = before(); cur.pics = cur.pics.filter(function (q) { return q !== p; }); sel = ''; drawPics(); objDone(b, 'Delete picture'); return true;
  }
  function addPic(p) {
    if (!cur) return;
    var b = before(); cur.pics = (cur.pics || []).concat([p]); sel = p.id; drawPics(); objDone(b, 'Insert picture');
  }
  /* the picture placeholder box of Picture + Caption, in design px (offsets ignore the scale transform) */
  function placeholderRect() {
    if (!slots(cur).ph) return null;
    var was = picph.hidden; picph.hidden = false;
    var r = { x: picph.offsetLeft, y: picph.offsetTop, w: picph.offsetWidth, h: picph.offsetHeight };
    picph.hidden = was; return r;
  }

  function init(o) {
    onChange = o.onChange || onChange; onObj = o.onObj || onObj; onPickPic = o.onPickPic || onPickPic;
    title = $('s-title'); body = $('s-body'); body2 = $('s-body2'); mirror = $('mirror'); mirror2 = $('mirror2'); fit = $('fit'); stage = $('stage'); slideEl = $('slide');
    picsEl = $('pics'); picph = $('s-picph'); picbar = $('picbar');
    title.addEventListener('input', function () { if (/[\r\n]/.test(title.value)) { var p = title.selectionStart; title.value = title.value.replace(/[\r\n]+/g, ' '); title.setSelectionRange(p, p); } autoTitle(); changed(); });
    title.addEventListener('keydown', function (e) {
      var tb = !body.parentNode.hidden && !body.closest('.s-cols').hidden;
      if (!tb) return;
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); body.focus(); body.setSelectionRange(0, 0); }
      else if (e.key === 'ArrowDown' && title.selectionStart === title.value.length) { e.preventDefault(); body.focus(); body.setSelectionRange(0, 0); }
    });
    bodyKeys(body, mirror); bodyKeys(body2, mirror2);
    picsEl.addEventListener('pointerdown', picDown);
    addEventListener('pointermove', picMove, { passive: false });
    addEventListener('pointerup', picUp);
    addEventListener('pointercancel', function (e) { if (G && e.pointerId === G.id) { var p = picById(sel); if (p && G.moved) { p.x = G.r0.x; p.y = G.r0.y; p.w = G.r0.w; p.h = G.r0.h; moveBox(p); } G = null; } });
    /* a press anywhere else on the slide (text, background) drops the picture selection */
    slideEl.addEventListener('pointerdown', function (e) { if (!e.target.closest('.pics .pic') && !e.target.closest('.selbox')) select(''); }, true);
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
    title.placeholder = hint[0] || 'Click to add a title';
    body.placeholder = hint[1] || BUL_HINT;
    body2.placeholder = 'Right column: one bullet per line';
  }
  function show(slide, th) {
    if (th) theme = th;
    if (slide !== cur) sel = '';
    cur = slide;
    title.value = slide ? slide.title : ''; body.value = slide ? slide.body : ''; body2.value = slide ? (slide.body2 || '') : '';
    body.scrollTop = 0; body2.scrollTop = 0; setLayoutDom(); autoTitle(); mirrors(); drawPics();
  }
  /* the static slide renderer (thumbnails + Present). o = { max: lines (default all), show: true for Present } */
  function escq(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function bodyHTML(text, o, plain, extra) {
    var lines = String(text || '').split('\n');
    if (!o.show) lines = lines.filter(function (l) { return l.replace(/\t/g, '').trim() !== ''; });
    else while (lines.length && lines[lines.length - 1].replace(/\t/g, '').trim() === '') lines.pop();
    if (o.max) lines = lines.slice(0, o.max);
    return '<div class="b' + (plain ? ' plain' : '') + (extra || '') + '">' + lines.map(function (l) {
      var txt = l.replace(/^\t+/, '');
      return '<div class="l' + (!plain && l.charAt(0) === '\t' ? 1 : 0) + (txt.trim() ? '' : ' e') + '">' + (escq(txt) || '\u200b') + '</div>';
    }).join('') + '</div>';
  }
  function html(s, i, o) {
    o = o || {}; s = s || {};
    var L = slots(s), h = '';
    if (L.ph) h += '<div class="s-picph"></div>';
    /* SL3: the title box is always there (empty = no text), so Present places the text exactly like the editor.
       Legacy (SL2): in Present an empty title on a slide with bullets was left out. */
    if (L.t) h += s.title ? '<div class="t">' + escq(s.title) + '</div>' : (o.show ? '<div class="t empty"></div>' : '<div class="t empty">Slide ' + ((i | 0) + 1) + '</div>');
    if (L.b) h += '<div class="s-cols">' + bodyHTML(s.body, o, L.b === 'plain') + (L.b2 ? bodyHTML(s.body2, o, false, ' b2') : '') + '</div>';
    if (s.pics && s.pics.length) h += '<div class="pics">' + s.pics.map(function (p) { return picHTML(p, false); }).join('') + '</div>';
    return h;
  }
  window.SLEdit = { init: init, show: show, html: html, paint: paint, cls: cls, bgStyle: bgStyle, slots: slots, W: W, H: H, fit: doFit, scale: function () { return scale; }, indent: indent,
    theme: function () { return theme; },
    selected: function () { return picById(sel) || null; }, select: select, addPic: addPic, delPic: delPic, placeholderRect: placeholderRect,
    nudge: function (dx, dy) { return editPic(function (p) { p.x += dx; p.y += dy; }, 'Move picture'); },
    redrawPics: drawPics,
    focusTitle: function () { if (!title.hidden) { title.focus(); var n = title.value.length; title.setSelectionRange(n, n); } else if (!body.closest('.s-cols').hidden) body.focus(); },
    focusBody: function () { body.focus(); } };
})();
