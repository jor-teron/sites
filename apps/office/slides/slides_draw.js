/* Hub Office Slides SL6 — shapes, tables and arrange helpers (SLDraw). No DOM, safe to load in Node for tests.
   Shapes: rect, round, ellipse, line, arrow, triangle, star, callout.
   A shape is { id, kind, x, y, w, h, fill?, stroke?, sw, flip?, doc?, z }.
   Lines and arrows have no text; other shapes carry an SLText document (SL5 runs).
   A table is { id, x, y, w, h, header, border?, bw, fill?, hfill?, cells:[[{doc}]], z }.
   Cells use equal column widths and equal row heights. Arrange works on any mix of
   pictures, text boxes, shapes and tables (align, distribute, z-order, snap to the
   960 x 540 slide centre and edges). */
(function (root) {
  'use strict';
  var T = root.SLText;
  var W = 960, H = 540;
  var KINDS = ['rect', 'round', 'ellipse', 'line', 'arrow', 'triangle', 'star', 'callout'];
  var LABELS = { rect: 'Rectangle', round: 'Rounded rectangle', ellipse: 'Ellipse', line: 'Line',
    arrow: 'Arrow', triangle: 'Triangle', star: 'Star', callout: 'Callout' };
  var MAX_SHAPES = 50, MAX_TABLES = 20, MAX_ROWS = 20, MAX_COLS = 12;
  var SW = [1, 2, 3, 4, 6, 8];
  var SNAP = 8;

  function text() { return T || root.SLText; }
  function str(x, max) { return (typeof x === 'string' ? x : (typeof x === 'number' ? String(x) : '')).slice(0, max || 40); }
  function num(x, lo, hi, d) { x = +x; return isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x * 10) / 10)) : d; }
  function color(s) { return text() ? text().cleanColor(s) : ''; }
  function escq(s) { return text() ? text().escq(s) : String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function kindOf(k) { k = String(k || ''); return KINDS.indexOf(k) >= 0 ? k : 'rect'; }
  function hasText(k) { k = kindOf(k); return k !== 'line' && k !== 'arrow'; }
  function emptyDoc() { return text() ? text().empty('none') : { paragraphs: [{ runs: [{ text: '' }], level: 0, align: '', list: 'none' }] }; }
  function cleanDoc(d, max) { return text() ? text().clean(d, { max: max || 2000, list: 'none' }) : emptyDoc(); }
  function cloneDoc(d, max) { return text() ? text().clone(d, { max: max || 2000, list: 'none' }) : JSON.parse(JSON.stringify(cleanDoc(d, max))); }

  function cleanShape(s) {
    s = s && typeof s === 'object' ? s : {};
    var kind = kindOf(s.kind || s.type);
    var fill = color(s.fill || ''), stroke = color(s.stroke || s.outline || s.border || '');
    var sw = num(s.sw != null ? s.sw : s.strokeWidth, 0, 24, stroke ? 2 : 0);
    if (sw && SW.indexOf(sw) < 0) {
      var i, best = SW[0], bd = 99;
      for (i = 0; i < SW.length; i++) { var d = Math.abs(SW[i] - sw); if (d < bd) { best = SW[i]; bd = d; } }
      sw = sw < 1 ? 0 : best;
    }
    if ((kind === 'line' || kind === 'arrow') && !stroke) { stroke = '#2563eb'; if (!sw) sw = 3; }
    var o = {
      id: str(s.id, 20), kind: kind,
      x: num(s.x, -4000, 4000, 80), y: num(s.y, -4000, 4000, 80),
      w: num(s.w, 8, 4000, kind === 'line' || kind === 'arrow' ? 220 : 220),
      h: num(s.h, 8, 4000, kind === 'line' || kind === 'arrow' ? 80 : 140),
      sw: sw, z: isFinite(+s.z) ? Math.round(+s.z) : 2
    };
    if (fill && kind !== 'line' && kind !== 'arrow') o.fill = fill;
    if (stroke) o.stroke = stroke;
    if (s.flip) o.flip = true;
    if (hasText(kind)) {
      if (s.doc != null) o.doc = cleanDoc(s.doc, 2000);
      else if (s.bullets != null && text()) {
        o.doc = text().fromFileBullets(s.bullets, { list: s.list || 'none', max: 2000 });
        if (s.align) o.doc = text().setAlign(o.doc, s.align);
      } else o.doc = emptyDoc();
    }
    return o;
  }
  function cleanShapes(arr) {
    return (Array.isArray(arr) ? arr : []).slice(0, MAX_SHAPES).map(cleanShape);
  }
  function defaultShape(kind, at, n) {
    kind = kindOf(kind);
    n = n || 0;
    var line = kind === 'line' || kind === 'arrow';
    var s = cleanShape({
      kind: kind,
      x: (at && at.x) || Math.round((W - 220) / 2 + n * 18),
      y: (at && at.y) || Math.round((H - (line ? 80 : 140)) / 2 + n * 18),
      w: (at && at.w) || 220, h: (at && at.h) || (line ? 80 : 140),
      fill: line ? '' : '#dbeafe', stroke: '#2563eb', sw: line ? 3 : 2, z: 2
    });
    return s;
  }

  function starPoints(w, h, sw) {
    var cx = w / 2, cy = h / 2, ro = Math.max(4, Math.min(w, h) / 2 - sw / 2), ri = ro * 0.38, i, pts = [];
    for (i = 0; i < 10; i++) {
      var r = i % 2 === 0 ? ro : ri, a = -Math.PI / 2 + i * Math.PI / 5;
      pts.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
    }
    return pts.join(' ');
  }
  function calloutPath(w, h, sw) {
    var p = sw / 2, tail = Math.max(14, Math.min(32, h * 0.22)), y2 = Math.max(p + 20, h - tail),
      x2 = w - p, rx = Math.min(14, (w - sw) / 8, (y2 - p) / 6);
    var t1 = p + Math.min(28, w * 0.12), t2 = p + Math.min(16, w * 0.07), t3 = p + Math.min(64, w * 0.28);
    return 'M ' + (p + rx) + ' ' + p +
      ' H ' + (x2 - rx) + ' Q ' + x2 + ' ' + p + ' ' + x2 + ' ' + (p + rx) +
      ' V ' + (y2 - rx) + ' Q ' + x2 + ' ' + y2 + ' ' + (x2 - rx) + ' ' + y2 +
      ' H ' + t3 + ' L ' + t2 + ' ' + (h - p) + ' L ' + t1 + ' ' + y2 +
      ' H ' + (p + rx) + ' Q ' + p + ' ' + y2 + ' ' + p + ' ' + (y2 - rx) +
      ' V ' + (p + rx) + ' Q ' + p + ' ' + p + ' ' + (p + rx) + ' ' + p + ' Z';
  }
  function arrowHead(x1, y1, x2, y2, sw, stroke) {
    var ang = Math.atan2(y2 - y1, x2 - x1), len = Math.max(10, sw * 3.6 + 8);
    var a = 0.45, p1x = x2 + Math.cos(ang + Math.PI - a) * len, p1y = y2 + Math.sin(ang + Math.PI - a) * len;
    var p2x = x2 + Math.cos(ang + Math.PI + a) * len, p2y = y2 + Math.sin(ang + Math.PI + a) * len;
    return { len: len * 0.72, html: '<polygon points="' + x2.toFixed(2) + ',' + y2.toFixed(2) + ' ' +
      p1x.toFixed(2) + ',' + p1y.toFixed(2) + ' ' + p2x.toFixed(2) + ',' + p2y.toFixed(2) +
      '" fill="' + escq(stroke || '#2563eb') + '" stroke="none"/>' };
  }
  function shapeSvg(s) {
    s = cleanShape(s);
    var w = s.w, h = s.h, sw = s.sw || 0, fill = s.fill || 'none', stroke = s.stroke || 'none';
    var attrs = 'fill="' + escq(fill) + '" stroke="' + escq(stroke) + '" stroke-width="' + sw + '" stroke-linejoin="round" stroke-linecap="round"';
    var half = sw / 2, body = '', kind = s.kind;
    if (kind === 'rect' || kind === 'round') {
      var rx = kind === 'round' ? Math.min(w, h) * 0.16 : 0;
      body = '<rect x="' + half + '" y="' + half + '" width="' + Math.max(0, w - sw) + '" height="' + Math.max(0, h - sw) + '"' +
        (rx ? ' rx="' + rx.toFixed(2) + '"' : '') + ' ' + attrs + '/>';
    } else if (kind === 'ellipse') {
      body = '<ellipse cx="' + (w / 2) + '" cy="' + (h / 2) + '" rx="' + Math.max(0, w / 2 - half) + '" ry="' + Math.max(0, h / 2 - half) + '" ' + attrs + '/>';
    } else if (kind === 'line' || kind === 'arrow') {
      var x1, y1, x2, y2;
      if (s.flip) { x1 = half; y1 = h - half; x2 = w - half; y2 = half; }
      else { x1 = half; y1 = half; x2 = w - half; y2 = h - half; }
      var lineAttrs = 'fill="none" stroke="' + escq(stroke) + '" stroke-width="' + (sw || 3) + '" stroke-linecap="round"';
      if (kind === 'arrow') {
        var hd = arrowHead(x1, y1, x2, y2, sw || 3, stroke);
        var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
        x2 = x1 + dx / len * Math.max(0, len - hd.len);
        y2 = y1 + dy / len * Math.max(0, len - hd.len);
        body = '<line x1="' + x1.toFixed(2) + '" y1="' + y1.toFixed(2) + '" x2="' + x2.toFixed(2) + '" y2="' + y2.toFixed(2) + '" ' + lineAttrs + '/>' + hd.html;
      } else {
        body = '<line x1="' + x1.toFixed(2) + '" y1="' + y1.toFixed(2) + '" x2="' + x2.toFixed(2) + '" y2="' + y2.toFixed(2) + '" ' + lineAttrs + '/>';
      }
    } else if (kind === 'triangle') {
      body = '<polygon points="' + (w / 2) + ',' + half + ' ' + (w - half) + ',' + (h - half) + ' ' + half + ',' + (h - half) + '" ' + attrs + '/>';
    } else if (kind === 'star') {
      body = '<polygon points="' + starPoints(w, h, sw) + '" ' + attrs + '/>';
    } else if (kind === 'callout') {
      body = '<path d="' + calloutPath(w, h, sw) + '" ' + attrs + '/>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="100%" preserveAspectRatio="none" overflow="visible" aria-hidden="true">' + body + '</svg>';
  }

  function cleanCell(c) {
    c = c && typeof c === 'object' ? c : {};
    var doc;
    if (c.doc != null) doc = cleanDoc(c.doc, 1500);
    else if (c.bullets != null && text()) {
      doc = text().fromFileBullets(c.bullets, { list: c.list || 'none', max: 1500 });
      if (c.align) doc = text().setAlign(doc, c.align);
    } else if (c.paragraphs) doc = cleanDoc(c, 1500);
    else doc = text() ? text().fromPlain(c.text || '', { max: 1500, list: 'none' }) : emptyDoc();
    return { doc: doc };
  }
  function padGrid(cells, rows, cols) {
    var r, c, out = [];
    for (r = 0; r < rows; r++) {
      var row = [], src = (cells && cells[r]) || [];
      for (c = 0; c < cols; c++) row.push(cleanCell(src[c]));
      out.push(row);
    }
    return out;
  }
  function cleanTable(t) {
    t = t && typeof t === 'object' ? t : {};
    var cellsIn = Array.isArray(t.cells) ? t.cells : [];
    var rows = Math.max(1, Math.min(MAX_ROWS, (t.rows | 0) || cellsIn.length || 3));
    var cols = Math.max(1, Math.min(MAX_COLS, (t.cols | 0) || ((cellsIn[0] && cellsIn[0].length) || 3)));
    var border = color(t.border || '');
    var fill = color(t.fill || ''), hfill = color(t.hfill || t.headerFill || '');
    var o = {
      id: str(t.id, 20),
      x: num(t.x, -4000, 4000, 80), y: num(t.y, -4000, 4000, 80),
      w: num(t.w, 40, 4000, 480), h: num(t.h, 32, 4000, 200),
      header: t.header !== false && t.header !== 0 && t.header !== 'false',
      bw: num(t.bw != null ? t.bw : (border ? 1 : 1), 0, 8, 1),
      cells: padGrid(cellsIn, rows, cols),
      z: isFinite(+t.z) ? Math.round(+t.z) : 3
    };
    o.rows = o.cells.length; o.cols = o.cells[0].length;
    if (border) o.border = border; else o.border = '#111827';
    if (fill) o.fill = fill;
    if (hfill) o.hfill = hfill;
    return o;
  }
  function cleanTables(arr) {
    return (Array.isArray(arr) ? arr : []).slice(0, MAX_TABLES).map(cleanTable);
  }
  function makeTable(rows, cols, at, n) {
    rows = Math.max(1, Math.min(MAX_ROWS, rows | 0 || 3));
    cols = Math.max(1, Math.min(MAX_COLS, cols | 0 || 3));
    n = n || 0;
    var cells = [], r, c;
    for (r = 0; r < rows; r++) { var row = []; for (c = 0; c < cols; c++) row.push({ doc: emptyDoc() }); cells.push(row); }
    return cleanTable({
      x: (at && at.x) || Math.round((W - 480) / 2 + n * 16),
      y: (at && at.y) || Math.round((H - 200) / 2 + n * 16),
      w: (at && at.w) || 480, h: (at && at.h) || Math.max(120, rows * 40),
      header: true, border: '#111827', bw: 1, fill: '#ffffff', hfill: '#e5e7eb',
      cells: cells, z: 3
    });
  }
  function addRow(t, at) {
    t = cleanTable(t);
    if (t.rows >= MAX_ROWS) return t;
    var i = at == null ? t.rows : Math.max(0, Math.min(t.rows, at | 0));
    var row = [], c;
    for (c = 0; c < t.cols; c++) row.push({ doc: emptyDoc() });
    t.cells.splice(i, 0, row);
    t.rows = t.cells.length;
    return t;
  }
  function delRow(t, at) {
    t = cleanTable(t);
    if (t.rows <= 1) return t;
    var i = at == null ? t.rows - 1 : Math.max(0, Math.min(t.rows - 1, at | 0));
    t.cells.splice(i, 1);
    t.rows = t.cells.length;
    return t;
  }
  function addCol(t, at) {
    t = cleanTable(t);
    if (t.cols >= MAX_COLS) return t;
    var i = at == null ? t.cols : Math.max(0, Math.min(t.cols, at | 0));
    t.cells.forEach(function (row) { row.splice(i, 0, { doc: emptyDoc() }); });
    t.cols = t.cells[0].length;
    return t;
  }
  function delCol(t, at) {
    t = cleanTable(t);
    if (t.cols <= 1) return t;
    var i = at == null ? t.cols - 1 : Math.max(0, Math.min(t.cols - 1, at | 0));
    t.cells.forEach(function (row) { row.splice(i, 1); });
    t.cols = t.cells[0].length;
    return t;
  }
  function cellRect(t, r, c) {
    t = typeof t.cols === 'number' ? t : cleanTable(t);
    var cw = t.w / t.cols, ch = t.h / t.rows;
    return { x: t.x + c * cw, y: t.y + r * ch, w: cw, h: ch };
  }

  /* ---------- arrange ---------- */
  function bounds(rects) {
    if (!rects || !rects.length) return { x: 0, y: 0, w: 0, h: 0 };
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, i, r;
    for (i = 0; i < rects.length; i++) {
      r = rects[i]; x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
      x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function align(rects, edge, canvas) {
    rects = (rects || []).map(function (r) { return r; });
    if (!rects.length) return rects;
    var box = (rects.length === 1 || (canvas && canvas.slide)) ? { x: 0, y: 0, w: (canvas && canvas.w) || W, h: (canvas && canvas.h) || H } : bounds(rects);
    edge = String(edge || '');
    if (edge === 'centre') edge = 'center';
    rects.forEach(function (r) {
      if (edge === 'left') r.x = box.x;
      else if (edge === 'center') r.x = box.x + (box.w - r.w) / 2;
      else if (edge === 'right') r.x = box.x + box.w - r.w;
      else if (edge === 'top') r.y = box.y;
      else if (edge === 'middle') r.y = box.y + (box.h - r.h) / 2;
      else if (edge === 'bottom') r.y = box.y + box.h - r.h;
      r.x = Math.round(r.x * 10) / 10; r.y = Math.round(r.y * 10) / 10;
    });
    return rects;
  }
  function distribute(rects, axis) {
    rects = (rects || []).map(function (r) { return r; });
    if (rects.length < 3) return rects;
    var key = axis === 'v' || axis === 'y' ? 'y' : 'x';
    var size = key === 'y' ? 'h' : 'w';
    var sorted = rects.slice().sort(function (a, b) { return a[key] - b[key]; });
    var first = sorted[0], last = sorted[sorted.length - 1];
    var span = (last[key] + last[size]) - first[key];
    var total = 0, i;
    for (i = 0; i < sorted.length; i++) total += sorted[i][size];
    var gap = (span - total) / (sorted.length - 1), pos = first[key];
    for (i = 0; i < sorted.length; i++) {
      sorted[i][key] = Math.round(pos * 10) / 10;
      pos += sorted[i][size] + gap;
    }
    return rects;
  }
  /* items: [{ id, z, ... }]. how: 'front' | 'back' | 'forward' | 'backward'. selected: id or [id]. Reassigns compact z. */
  function order(items, selected, how) {
    items = (items || []).map(function (it, i) { return Object.assign({}, it, { z: isFinite(+it.z) ? +it.z : i, _i: i }); });
    items.sort(function (a, b) { return a.z - b.z || a._i - b._i; });
    var ids = {};
    (Array.isArray(selected) ? selected : [selected]).forEach(function (id) { if (id != null && id !== '') ids[id] = 1; });
    var sel = [], rest = [];
    items.forEach(function (it) { (ids[it.id] ? sel : rest).push(it); });
    if (!sel.length) return items.map(function (it, i) { it.z = i; delete it._i; return it; });
    var next;
    if (how === 'front' || how === 'tofront') next = rest.concat(sel);
    else if (how === 'back' || how === 'toback') next = sel.concat(rest);
    else if (how === 'forward' || how === 'fwd') {
      next = items.slice();
      var k, tmp;
      for (k = next.length - 2; k >= 0; k--) {
        if (ids[next[k].id] && !ids[next[k + 1].id]) {
          tmp = next[k]; next[k] = next[k + 1]; next[k + 1] = tmp;
        }
      }
    } else {
      next = items.slice();
      for (k = 1; k < next.length; k++) {
        if (ids[next[k].id] && !ids[next[k - 1].id]) {
          tmp = next[k]; next[k] = next[k - 1]; next[k - 1] = tmp;
        }
      }
    }
    next.forEach(function (it, i) { it.z = i; delete it._i; });
    return next;
  }
  function listObjs(slide) {
    var out = [];
    ((slide && slide.pics) || []).forEach(function (p) { out.push({ kind: 'pic', id: p.id, z: isFinite(+p.z) ? +p.z : 0, obj: p }); });
    ((slide && (slide.texts || slide.tboxes)) || []).forEach(function (t) { out.push({ kind: 'tbox', id: t.id, z: isFinite(+t.z) ? +t.z : 1, obj: t }); });
    ((slide && slide.shapes) || []).forEach(function (s) { out.push({ kind: 'shape', id: s.id, z: isFinite(+s.z) ? +s.z : 2, obj: s }); });
    ((slide && slide.tables) || []).forEach(function (t) { out.push({ kind: 'table', id: t.id, z: isFinite(+t.z) ? +t.z : 3, obj: t }); });
    out.sort(function (a, b) { return a.z - b.z; });
    return out;
  }
  function applyOrder(slide, selected, how) {
    var items = listObjs(slide);
    var next = order(items, selected, how);
    next.forEach(function (it) { if (it.obj) it.obj.z = it.z; });
    return next;
  }
  function snapRect(r, opt) {
    opt = opt || {};
    var th = opt.threshold != null ? opt.threshold : SNAP;
    var cw = opt.W || W, ch = opt.H || H;
    var x = r.x, y = r.y, w = r.w, h = r.h;
    var guides = [], dx = 0, dy = 0, gotX = false, gotY = false;
    function consider(axis, pos, parts) {
      if (axis === 'x' ? gotX : gotY) return;
      var i, hit = null, best = th + 1;
      for (i = 0; i < parts.length; i++) {
        var d = Math.abs(parts[i].v - pos);
        if (d <= th && d < best) { best = d; hit = parts[i]; }
      }
      if (!hit) return;
      if (axis === 'x') { dx = pos - hit.v; gotX = true; guides.push({ axis: 'x', pos: pos }); }
      else { dy = pos - hit.v; gotY = true; guides.push({ axis: 'y', pos: pos }); }
    }
    var xs = [{ v: x, side: 'left' }, { v: x + w / 2, side: 'cx' }, { v: x + w, side: 'right' }];
    var ys = [{ v: y, side: 'top' }, { v: y + h / 2, side: 'cy' }, { v: y + h, side: 'bottom' }];
    /* edges first, then centre, so a box already on an edge stays there */
    consider('x', 0, xs); consider('x', cw, xs); consider('x', cw / 2, xs);
    consider('y', 0, ys); consider('y', ch, ys); consider('y', ch / 2, ys);
    return { x: Math.round((x + dx) * 10) / 10, y: Math.round((y + dy) * 10) / 10, w: w, h: h, guides: guides, snapped: gotX || gotY };
  }

  /* ---------- file helpers (version 4) ---------- */
  function shapeOut(s) {
    s = cleanShape(s);
    var q = { kind: s.kind, x: s.x, y: s.y, w: s.w, h: s.h };
    if (s.id) q.id = s.id;
    if (s.fill) q.fill = s.fill;
    if (s.stroke) q.stroke = s.stroke;
    if (s.sw) q.sw = s.sw;
    if (s.flip) q.flip = true;
    if (s.z != 2) q.z = s.z;
    if (hasText(s.kind) && s.doc && text()) {
      q.bullets = text().toFileBullets(s.doc, { list: text().boxList(s.doc) || 'none' });
      var tl = text().boxList(s.doc); if (tl && tl !== 'none') q.list = tl === 'number' ? 'numbers' : (tl === 'bullet' ? 'bullets' : tl);
      var ta = text().boxAlign(s.doc); if (ta) q.align = ta;
    }
    return q;
  }
  function cellOut(cell) {
    if (!text()) return { text: '' };
    var d = cell && cell.doc, bullets = text().toFileBullets(d, { list: 'none' });
    var q = { text: text().plain(d) };
    if ((bullets || []).some(function (b) { return b.runs || b.align || b.level; })) q.bullets = bullets;
    else if (bullets && bullets.length === 1) {
      if (bullets[0].runs) q.runs = bullets[0].runs;
      if (bullets[0].align) q.align = bullets[0].align;
    }
    var al = text().boxAlign(d); if (al) q.align = al;
    var ls = text().boxList(d); if (ls && ls !== 'none') q.list = ls === 'number' ? 'numbers' : (ls === 'bullet' ? 'bullets' : ls);
    return q;
  }
  function tableOut(t) {
    t = cleanTable(t);
    var q = { x: t.x, y: t.y, w: t.w, h: t.h, rows: t.rows, cols: t.cols, header: !!t.header,
      cells: t.cells.map(function (row) { return row.map(cellOut); }) };
    if (t.id) q.id = t.id;
    if (t.border) q.border = t.border;
    if (t.bw != 1) q.bw = t.bw;
    if (t.fill) q.fill = t.fill;
    if (t.hfill) q.hfill = t.hfill;
    if (t.z != 3) q.z = t.z;
    return q;
  }
  function cloneShape(s, newId) {
    var q = cleanShape(s);
    if (q.doc) q.doc = cloneDoc(q.doc, 2000);
    if (newId) q.id = '';
    return q;
  }
  function cloneTable(t, newId) {
    var q = cleanTable(t);
    q.cells = q.cells.map(function (row) { return row.map(function (c) { return { doc: cloneDoc(c.doc, 1500) }; }); });
    if (newId) q.id = '';
    return q;
  }

  var API = {
    W: W, H: H, KINDS: KINDS, LABELS: LABELS, MAX_SHAPES: MAX_SHAPES, MAX_TABLES: MAX_TABLES,
    MAX_ROWS: MAX_ROWS, MAX_COLS: MAX_COLS, SW: SW, SNAP: SNAP,
    kindOf: kindOf, hasText: hasText, cleanShape: cleanShape, cleanShapes: cleanShapes, defaultShape: defaultShape,
    shapeSvg: shapeSvg, starPoints: starPoints, calloutPath: calloutPath,
    cleanTable: cleanTable, cleanTables: cleanTables, makeTable: makeTable,
    addRow: addRow, delRow: delRow, addCol: addCol, delCol: delCol, cellRect: cellRect,
    bounds: bounds, align: align, distribute: distribute, order: order, listObjs: listObjs, applyOrder: applyOrder,
    snapRect: snapRect, shapeOut: shapeOut, tableOut: tableOut, cloneShape: cloneShape, cloneTable: cloneTable
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.SLDraw = API;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
