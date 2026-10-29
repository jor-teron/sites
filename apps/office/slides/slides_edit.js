/* Hub Office Slides SL1 — the slide canvas (SLEdit). A 960 x 540 design slide scaled with one CSS transform to fit the
   stage (ResizeObserver). Title = one textarea (Enter goes to the bullets). Bullets = a textarea, one bullet per line;
   a leading TAB = indented one level (Tab / Shift+Tab on the selected lines, Enter keeps the indent, native undo kept via execCommand where it works).
   The dots are drawn by a mirror div behind the textarea (same font, width and wrapping, transparent text), so wrapped
   lines keep one dot. Only the visible slide is live DOM; thumbnails are plain text (slides_list.js).
   SL2: SLEdit.html(slide, i, o) is the one static slide renderer (same design classes), used by the thumbnails
   (o.max = 9 lines, no empty lines, one line each) and by Present (slides_show.js: every line, wrapped). */
(function () {
  'use strict';
  var W = 960, H = 540;
  var $ = function (id) { return document.getElementById(id); };
  var title, body, mirror, fit, stage, slideEl, cur = null, onChange = function () {}, scale = 1;

  function esc(s) { return s.replace(/[&<>]/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'; }); }
  function drawMirror() {
    var lines = body.value.split('\n'), h = '';
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i], lv = l.charAt(0) === '\t' ? 1 : 0;
      var m = /^\t*/.exec(l)[0];
      /* an empty last line (after Enter) still gets a dot, so the new bullet shows */
      h += '<div class="ln l' + lv + '">' + esc(m) + (l.length || i === lines.length - 1 || lines.length === 1 ? '<span class="d"></span>' : '') + esc(l.slice(m.length)) + '\u200b</div>';
    }
    mirror.innerHTML = body.value ? h : '';
    mirror.scrollTop = body.scrollTop;
  }
  function autoTitle() { title.style.height = 'auto'; title.style.height = Math.min(160, title.scrollHeight) + 'px'; }
  function doFit() {
    var r = stage.getBoundingClientRect(), pos = $('pos');
    var aw = r.width, ah = r.height - (pos ? pos.offsetHeight + 6 : 0);
    scale = Math.max(0.1, Math.min(aw / W, ah / H));
    fit.style.width = Math.floor(W * scale) + 'px'; fit.style.height = Math.floor(H * scale) + 'px';
    slideEl.style.transform = 'scale(' + scale + ')';
  }
  /* replace [a, b) with text keeping the browser's undo where possible */
  function replace(el, a, b, text) {
    el.focus(); el.setSelectionRange(a, b);
    var ok = false; try { ok = document.execCommand('insertText', false, text); } catch (_) { ok = false; }
    if (!ok || el.value.slice(a, a + text.length) !== text) { el.setRangeText(text, a, b, 'end'); }
  }
  function indent(out) {
    var v = body.value, s = body.selectionStart, e = body.selectionEnd;
    var ls = v.lastIndexOf('\n', s - 1) + 1;
    var le = v.indexOf('\n', e > s && v.charAt(e - 1) === '\n' ? e - 1 : e); if (le < 0) le = v.length;
    var block = v.slice(ls, le).split('\n'), ds = 0, de = 0;
    var nb = block.map(function (l, i) {
      if (out) { if (l.charAt(0) === '\t') { if (i === 0) ds = -1; de--; return l.slice(1); } return l; }
      if (l.charAt(0) === '\t') return l;            /* one level only in SL1 */
      if (i === 0) ds = 1; de++; return '\t' + l;
    }).join('\n');
    if (nb === v.slice(ls, le)) return;
    replace(body, ls, le, nb);
    var ns = Math.max(ls, s + ds), ne = Math.max(ns, e + de);
    if (s === e) ns = ne = Math.max(ls, s + ds);
    body.setSelectionRange(ns, ne);
    changed();
  }
  function changed() { if (!cur) return; cur.title = title.value.replace(/[\r\n]+/g, ' '); cur.body = body.value.replace(/\r/g, ''); drawMirror(); onChange(cur); }

  function init(o) {
    onChange = o.onChange || onChange;
    title = $('s-title'); body = $('s-body'); mirror = $('mirror'); fit = $('fit'); stage = $('stage'); slideEl = $('slide');
    title.addEventListener('input', function () { if (/[\r\n]/.test(title.value)) { var p = title.selectionStart; title.value = title.value.replace(/[\r\n]+/g, ' '); title.setSelectionRange(p, p); } autoTitle(); changed(); });
    title.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); body.focus(); body.setSelectionRange(0, 0); }
      else if (e.key === 'ArrowDown' && title.selectionStart === title.value.length) { e.preventDefault(); body.focus(); body.setSelectionRange(0, 0); }
    });
    body.addEventListener('input', changed);
    body.addEventListener('scroll', function () { mirror.scrollTop = body.scrollTop; });
    body.addEventListener('keydown', function (e) {
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); indent(e.shiftKey); }
      else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && body.selectionStart === body.selectionEnd) {
        /* a new line keeps the indent; Enter on an empty indented bullet outdents it instead */
        var p = body.selectionStart, val = body.value, a = val.lastIndexOf('\n', p - 1) + 1, z = val.indexOf('\n', p); if (z < 0) z = val.length;
        var line = val.slice(a, z);
        if (line.charAt(0) !== '\t') return;
        e.preventDefault();
        if (line === '\t') indent(true); else { replace(body, p, p, '\n\t'); changed(); }
      }
      else if (e.key === 'ArrowUp' && body.selectionStart === 0 && body.selectionEnd === 0) { e.preventDefault(); title.focus(); var n = title.value.length; title.setSelectionRange(n, n); }
      else if (e.key === 'Backspace' && body.selectionStart === body.selectionEnd) {
        /* Backspace right after an indent tab = outdent */
        var s = body.selectionStart, v = body.value, ls = v.lastIndexOf('\n', s - 1) + 1;
        if (s === ls + 1 && v.charAt(ls) === '\t') { e.preventDefault(); indent(true); }
      }
    });
    if (window.ResizeObserver) new ResizeObserver(doFit).observe(stage); else addEventListener('resize', doFit);
    doFit();
  }
  function show(slide) {
    cur = slide;
    title.value = slide ? slide.title : ''; body.value = slide ? slide.body : '';
    body.scrollTop = 0; autoTitle(); drawMirror();
  }
  /* the static slide renderer (thumbnails + Present). o = { max: lines (default all), show: true for Present } */
  function escq(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function html(s, i, o) {
    o = o || {}; s = s || {};
    var lines = String(s.body || '').split('\n');
    if (!o.show) lines = lines.filter(function (l) { return l.replace(/\t/g, '').trim() !== ''; });
    else while (lines.length && lines[lines.length - 1].replace(/\t/g, '').trim() === '') lines.pop();
    if (o.max) lines = lines.slice(0, o.max);
    var t = s.title ? '<div class="t">' + escq(s.title) + '</div>'
      : (o.show ? (lines.length ? '' : '<div class="t empty"></div>') : '<div class="t empty">Slide ' + ((i | 0) + 1) + '</div>');
    return t + '<div class="b">' + lines.map(function (l) {
      var txt = l.replace(/^\t+/, '');
      return '<div class="l' + (l.charAt(0) === '\t' ? 1 : 0) + (txt.trim() ? '' : ' e') + '">' + (escq(txt) || '\u200b') + '</div>';
    }).join('') + '</div>';
  }
  window.SLEdit = { init: init, show: show, html: html, W: W, H: H, fit: doFit, scale: function () { return scale; }, indent: indent,
    focusTitle: function () { title.focus(); var n = title.value.length; title.setSelectionRange(n, n); },
    focusBody: function () { body.focus(); } };
})();
