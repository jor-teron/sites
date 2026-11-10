/* Hub Office Slides SL9 — PNG export helpers (SLPng). svgFor() has no DOM (Node-testable).
   Rasterising an SVG to a PNG blob needs a browser canvas and is done by toPngBlob(). */
(function (root) {
  'use strict';
  var W = 960, H = 540;
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function themeOf(id) { return (root.SLPptx && SLPptx.THEMES[id]) || (root.SLPptx && SLPptx.THEMES.light) || { bg: 'FFFFFF', tc: '111827', fg: '1F2430', acc: 'F97316', mut: '6B7280' }; }
  function wrap(text, maxChars) {
    text = String(text || '');
    if (!maxChars || text.length <= maxChars) return [text];
    var words = text.split(/(\s+)/), lines = [], cur = '';
    words.forEach(function (w) {
      if ((cur + w).length > maxChars && cur) { lines.push(cur.replace(/\s+$/, '')); cur = w.replace(/^\s+/, ''); }
      else cur += w;
    });
    if (cur) lines.push(cur.replace(/\s+$/, ''));
    return lines.length ? lines : [''];
  }
  function textLines(doc, box, defSize, defColor, defList) {
    var T = root.SLText, d = T ? T.clean(doc, { list: defList || 'none' }) : doc;
    var paras = (d && d.paragraphs) || [], out = [], y = box.y + defSize;
    paras.forEach(function (p) {
      var size = defSize, color = defColor, raw = '';
      (p.runs || []).forEach(function (r) { raw += r.text || ''; if (r.size) size = r.size; if (r.color) color = r.color; });
      var max = Math.max(8, Math.floor(box.w / Math.max(6, size * 0.55)));
      var list = p.list || defList || 'none', bullet = '';
      if (list === 'bullet') bullet = '• ';
      else if (list === 'number') bullet = '1. ';
      var pad = (p.level | 0) * size;
      wrap((bullet + raw), max).forEach(function (ln, i) {
        if (y > box.y + box.h + size) return;
        out.push({ x: box.x + pad, y: y, text: i ? ln : ln, size: size, color: color || defColor, b: !!(p.runs && p.runs[0] && p.runs[0].b), i: !!(p.runs && p.runs[0] && p.runs[0].i) });
        y += size * 1.35;
      });
    });
    return out;
  }
  function tspans(lines) {
    var h = '';
    lines.forEach(function (ln) {
      var st = 'font-size:' + ln.size + 'px;fill:#' + String(ln.color || '1F2430').replace(/^#/, '') + ';';
      if (ln.b) st += 'font-weight:700;';
      if (ln.i) st += 'font-style:italic;';
      h += '<text x="' + ln.x + '" y="' + ln.y + '" style="' + st + '">' + esc(ln.text) + '</text>';
    });
    return h;
  }
  function svgFor(deck, i, o) {
    o = o || {};
    var s = deck && deck.slides && deck.slides[i];
    if (!s) return '';
    var th = themeOf(deck.theme), T = root.SLText, M = root.SLMaster, D = root.SLDraw;
    var bg = (s.bg && /^#[0-9a-f]{6}$/i.test(s.bg) ? s.bg : ('#' + th.bg)).replace(/^#/, '');
    var font = (th.font === 'Georgia' ? 'Georgia, Palatino, serif' : 'system-ui, Segoe UI, sans-serif');
    var h = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<rect width="' + W + '" height="' + H + '" fill="#' + bg + '"/>';
    var boxes = root.SLPptx ? SLPptx.layoutBoxes(s.layout || 'tc') : {};
    if (boxes.title && T && T.has(s.title)) h += tspans(textLines(s.title, boxes.title, 44, th.tc, 'none'));
    if (boxes.body && T && T.has(s.body)) h += tspans(textLines(s.body, boxes.body, 28, th.fg, 'bullet'));
    if (boxes.body2 && T && T.has(s.body2)) h += tspans(textLines(s.body2, boxes.body2, 28, th.fg, 'bullet'));
    var items = [];
    (s.pics || []).forEach(function (p) { items.push({ z: p.z || 0, kind: 'pic', obj: p }); });
    (s.texts || s.tboxes || []).forEach(function (t) { items.push({ z: t.z || 1, kind: 'tbox', obj: t }); });
    (s.shapes || []).forEach(function (sh) { items.push({ z: sh.z || 2, kind: 'shape', obj: sh }); });
    (s.tables || []).forEach(function (tb) { items.push({ z: tb.z || 3, kind: 'table', obj: tb }); });
    items.sort(function (a, b) { return a.z - b.z; });
    items.forEach(function (it) {
      var o2 = it.obj;
      if (it.kind === 'pic' && o2.src) {
        h += '<image x="' + o2.x + '" y="' + o2.y + '" width="' + o2.w + '" height="' + o2.h + '" preserveAspectRatio="' + (o2.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice') + '" href="' + esc(o2.src) + '" xlink:href="' + esc(o2.src) + '"/>';
        return;
      }
      if (it.kind === 'tbox') {
        if (o2.fill) h += '<rect x="' + o2.x + '" y="' + o2.y + '" width="' + o2.w + '" height="' + o2.h + '" fill="' + esc(o2.fill) + '" stroke="' + esc(o2.border || 'none') + '"/>';
        h += tspans(textLines(o2.doc, { x: o2.x + 8, y: o2.y + 8, w: o2.w - 16, h: o2.h - 16 }, 18, th.fg, 'none'));
        return;
      }
      if (it.kind === 'shape' && D && D.shapeSvg) {
        h += '<svg x="' + o2.x + '" y="' + o2.y + '" width="' + o2.w + '" height="' + o2.h + '" overflow="visible">' + D.shapeSvg(o2) + '</svg>';
        if (o2.doc && T && T.has(o2.doc) && o2.kind !== 'line' && o2.kind !== 'arrow') {
          h += tspans(textLines(o2.doc, { x: o2.x + 10, y: o2.y + 10, w: o2.w - 20, h: o2.h - 20 }, 18, th.fg, 'none'));
        }
        return;
      }
      if (it.kind === 'table') {
        var rows = o2.rows || (o2.cells && o2.cells.length) || 1;
        var cols = o2.cols || (o2.cells && o2.cells[0] && o2.cells[0].length) || 1;
        var cw = o2.w / cols, rh = o2.h / rows, r, c;
        for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
          var cell = o2.cells && o2.cells[r] && o2.cells[r][c];
          var fill = (o2.header && r === 0 && o2.hfill) ? o2.hfill : (o2.fill || '#ffffff');
          h += '<rect x="' + (o2.x + c * cw) + '" y="' + (o2.y + r * rh) + '" width="' + cw + '" height="' + rh + '" fill="' + esc(fill) + '" stroke="' + esc(o2.border || '#111827') + '"/>';
          if (cell) h += tspans(textLines(cell.doc, { x: o2.x + c * cw + 4, y: o2.y + r * rh + 4, w: cw - 8, h: rh - 8 }, 14, '111827', 'none'));
        }
      }
    });
    if (M) {
      var foot = M.footerFor(deck, i, {});
      if (foot) {
        var txt = [foot.text, foot.date, foot.num].filter(Boolean).join('    ');
        h += '<text x="48" y="526" style="font-size:14px;fill:#' + th.mut + '">' + esc(txt) + '</text>';
      }
    }
    return h + '</svg>';
  }
  function toPngBlob(svg, scale) {
    scale = scale || 2;
    return new Promise(function (res, rej) {
      if (typeof Image === 'undefined' || typeof document === 'undefined') {
        rej(new Error('PNG export needs a browser.')); return;
      }
      var blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var im = new Image();
      im.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = Math.round(W * scale); c.height = Math.round(H * scale);
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(im, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          if (c.toBlob) c.toBlob(function (b) { if (b) res(b); else rej(new Error('Could not make a PNG.')); }, 'image/png');
          else {
            var data = c.toDataURL('image/png');
            var raw = data.split(',')[1], bin = atob(raw), u = new Uint8Array(bin.length), i;
            for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
            res(new Blob([u], { type: 'image/png' }));
          }
        } catch (e) { URL.revokeObjectURL(url); rej(e); }
      };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Could not draw this slide as a PNG.')); };
      im.src = url;
    });
  }
  function fileName(deck, i) {
    var n = String((i | 0) + 1), pad = n.length < 2 ? ('0' + n) : n;
    var title = '';
    try { title = root.SLText ? SLText.plain(deck.slides[i].title, { single: true }) : ''; } catch (_) { title = ''; }
    title = String(title || '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 40);
    return 'slide-' + pad + (title ? ('-' + title) : '') + '.png';
  }

  var API = { W: W, H: H, svgFor: svgFor, toPngBlob: toPngBlob, fileName: fileName, wrap: wrap };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.SLPng = API;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
