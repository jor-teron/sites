/* Hub Office Slides SL1 — .hslides import / export (SLFile). Open, documented JSON (see slides_readme.md):
     { "format": "hub-slides", "version": 1, "name": "My talk", "created": "<ISO>", "updated": "<ISO>",
       "slides": [ { "title": "Hello", "bullets": [ { "text": "First point", "level": 0 }, { "text": "Detail", "level": 1 } ] } ] }
   level 0 = top bullet, 1 = indented once. Unknown keys are ignored, so later releases (layouts, pictures) can add fields.
   Import is checked: max 5 MB, 500 slides, 300 chars per title, 200 bullets of 1000 chars per slide.
   SL3 writes version 2 (and reads 1 and 2):
     { "format": "hub-slides", "version": 2, "name", "created", "updated", "theme": "blue",
       "slides": [ { "layout": "two", "title", "bullets": [...], "bullets2": [...], "background": "#0f2a4a",
                     "pictures": [ { "src": "data:image/webp;base64,...", "x", "y", "w", "h", "fit": "cover" } ] } ] }
   layout: title | tc | two | sec | pic | to | blank (missing = tc); theme missing = light; x / y / w / h in 960 x 540
   design px; fit cover = crop to fill, contain = fit. Pictures are data URLs inside the file (png / jpeg / webp / gif).
   Import limit is 40 MB now (pictures), 50 pictures per slide. Version-1 files open unchanged (legacy limit was 5 MB).
   SL5 writes version 3 (and reads 1, 2 and 3): title stays a plain string; optional titleRuns / titleAlign when styled.
   bullets / bullets2 stay [{ text, level }] and may add runs / align; optional list / list2 / align / align2 (list:
   bullets | numbers | none). texts: [{ x, y, w, h, bullets, list, align, fill, border, z }] in 960 x 540 design px
   (aliases textboxes / tboxes still read). A higher version than 3 is refused by SL5.
   SL6 writes version 4 (and reads 1–4): adds shapes:[{ kind, x, y, w, h, fill, stroke, sw, flip, bullets, list, align, z }]
   and tables:[{ x, y, w, h, rows, cols, header, border, bw, fill, hfill, cells:[[{ text, runs, bullets, align, list }]], z }].
   A higher version than 4 is refused by SL6.
   SL7 writes version 5 (and reads 1–5): optional notes (plain text), transition (none|fade|push|wipe; alias trans),
   and ink (kept pen strokes, only when saved). A higher version than 5 is refused. */
(function () {
  'use strict';
  var MAX_BYTES = 40 * 1024 * 1024, MAX_SLIDES = 500, MAX_BULLETS = 200;   /* legacy (SL1 / SL2): MAX_BYTES = 5 MB */
  function iso(ms) { try { return new Date(ms).toISOString(); } catch (_) { return ''; } }
  function toBullets(body) {
    return String(body || '').split('\n').map(function (l) {
      var lv = l.charAt(0) === '\t' ? 1 : 0; return { text: l.replace(/^\t+/, ''), level: lv };
    }).filter(function (b, i, a) { return b.text !== '' || i < a.length - 1; });   /* drop one trailing empty line */
  }
  function fromBullets(arr) {
    if (!Array.isArray(arr)) return '';
    return arr.slice(0, MAX_BULLETS).map(function (b) {
      if (typeof b === 'string') return b.replace(/[\r\n\t]+/g, ' ').slice(0, 1000);
      if (!b || typeof b !== 'object') return '';
      var t = String(b.text == null ? '' : b.text).replace(/[\r\n\t]+/g, ' ').slice(0, 1000);
      return ((+b.level || 0) >= 1 ? '\t' : '') + t;
    }).join('\n');
  }
  function toJSON(deck) {
    /* legacy (SL1 / SL2): version 1, slides: [{ title, bullets }]. SL3: version 2 + theme, layout, bullets2, background, pictures. */
    return {
      format: 'hub-slides', version: 5, name: deck.name, created: iso(deck.created), updated: iso(deck.updated || Date.now()),
      theme: deck.theme || 'light',
      slides: deck.slides.map(function (s) {
        var titleOut = SLText.titleOut(s.title);
        var o = { layout: s.layout || 'tc', title: titleOut.text, bullets: SLText.toFileBullets(s.body) };
        if (titleOut.runs) o.titleRuns = titleOut.runs;
        if (titleOut.align) o.titleAlign = titleOut.align;
        var blist = SLText.boxList(s.body), balign = SLText.boxAlign(s.body);
        if (blist && blist !== 'bullet') o.list = blist === 'number' ? 'numbers' : (blist === 'none' ? 'none' : blist);
        /* default body list on title / sec / pic is none; say so when it is still bullets */
        if ((s.layout === 'title' || s.layout === 'sec' || s.layout === 'pic') && blist === 'bullet') o.list = 'bullets';
        if (balign) o.align = balign;
        if (SLText.has(s.body2)) {
          o.bullets2 = SLText.toFileBullets(s.body2);
          var l2 = SLText.boxList(s.body2), a2 = SLText.boxAlign(s.body2);
          if (l2 && l2 !== 'bullet') o.list2 = l2 === 'number' ? 'numbers' : l2;
          if (a2) o.align2 = a2;
        }
        if (s.bg) o.background = s.bg;
        var pics = (s.pics || []).filter(function (p) { return !!p.src; });
        if (pics.length) o.pictures = pics.map(function (p) {
          var q = { src: p.src, x: p.x, y: p.y, w: p.w, h: p.h, iw: p.iw, ih: p.ih, fit: p.fit };
          if (p.z) q.z = p.z; return q;
        });
        var tbs = (s.texts || s.tboxes || []).map(function (tb) {
          var box = SLText.cleanBox(tb), q = { x: box.x, y: box.y, w: box.w, h: box.h, bullets: SLText.toFileBullets(box.doc, { list: SLText.boxList(box.doc) || 'none' }) };
          if (box.id) q.id = box.id;
          var tl = SLText.boxList(box.doc); if (tl && tl !== 'none') q.list = tl === 'number' ? 'numbers' : (tl === 'bullet' ? 'bullets' : tl);
          var ta = SLText.boxAlign(box.doc); if (ta) q.align = ta;
          if (box.fill) q.fill = box.fill; if (box.border) q.border = box.border; if (box.z != 1) q.z = box.z;
          return q;
        });
        if (tbs.length) o.texts = tbs;
        if (window.SLDraw) {
          var shs = (s.shapes || []).map(function (sh) { return SLDraw.shapeOut(sh); });
          if (shs.length) o.shapes = shs;
          var tbs2 = (s.tables || []).map(function (tb) { return SLDraw.tableOut(tb); });
          if (tbs2.length) o.tables = tbs2;
        }
        if (s.notes) o.notes = window.SLPresent ? SLPresent.cleanNotes(s.notes) : String(s.notes);
        var tr = window.SLPresent ? SLPresent.cleanTrans(s.trans) : (s.trans || 'none');
        if (tr && tr !== 'none') o.transition = tr;
        if (s.ink && s.ink.length && window.SLPresent) o.ink = SLPresent.inkOut(s.ink);
        return o;
      })
    };
  }
  /* returns { deck } or { error } — never throws */
  function parse(text) {
    if (typeof text !== 'string') return { error: 'Could not read the file.' };
    if (text.length > MAX_BYTES) return { error: 'The file is too big (over 40 MB).' };
    var j; try { j = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (_) { return { error: 'This is not a Slides file (not valid JSON).' }; }
    if (!j || typeof j !== 'object' || Array.isArray(j)) return { error: 'This is not a Slides file.' };
    if (j.format !== 'hub-slides') return { error: 'This is not a Slides file (format is not "hub-slides").' };
    if ((+j.version || 0) > 5) return { error: 'This file was made by a newer Slides (version ' + j.version + '). Update the Hub and try again.' };
    if (!Array.isArray(j.slides)) return { error: 'The file has no slides list.' };
    var slides = j.slides.slice(0, MAX_SLIDES).map(function (s) {
      s = s && typeof s === 'object' ? s : {};
      var lay = typeof s.layout === 'string' ? s.layout : 'tc';
      var bl = (lay === 'title' || lay === 'sec' || lay === 'pic') ? 'none' : 'bullet';
      var titleSrc = s.title;
      if (s.titleRuns || s.titleAlign) titleSrc = { text: typeof s.title === 'string' ? s.title : (s.title && s.title.text), runs: s.titleRuns || (s.title && s.title.runs), align: s.titleAlign || (s.title && s.title.align) };
      var o = { title: SLText.fromFileTitle(titleSrc), body: SLText.fromFileBullets(s.bullets != null ? s.bullets : s.body, { list: s.list || bl, max: 5000 }) };
      if (s.align) o.body = SLText.setAlign(o.body, s.align);
      /* SL3 fields (version 2); SL5 rich runs / list / align / texts (version 3); SL6 shapes / tables (version 4); SL7 notes / transition / ink (version 5). Missing or wrong → SLSave.cleanSlide defaults. */
      if (typeof s.layout === 'string') o.layout = s.layout;
      if (s.bullets2 != null) {
        o.body2 = SLText.fromFileBullets(s.bullets2, { list: s.list2 || 'bullet', max: 5000 });
        if (s.align2) o.body2 = SLText.setAlign(o.body2, s.align2);
      }
      if (typeof s.background === 'string') o.bg = s.background;
      if (Array.isArray(s.pictures)) o.pics = s.pictures.slice(0, 50).filter(function (p) { return p && SLPics.validSrc(p.src); })
        .map(function (p) { return { src: p.src, x: p.x, y: p.y, w: p.w, h: p.h, iw: p.iw, ih: p.ih, fit: p.fit, z: p.z }; });
      var rawT = s.texts || s.textboxes || s.tboxes;
      if (Array.isArray(rawT)) o.texts = rawT.map(function (tb) {
        if (!tb || typeof tb !== 'object') return tb;
        if (tb.doc) return tb;
        var doc = tb.bullets != null ? SLText.fromFileBullets(tb.bullets, { list: tb.list || 'none', max: 2000 }) : SLText.fromPlain(tb.text || '', { max: 2000, list: tb.list || 'none' });
        if (tb.align) doc = SLText.setAlign(doc, tb.align);
        return { id: tb.id, x: tb.x, y: tb.y, w: tb.w, h: tb.h, doc: doc, fill: tb.fill, border: tb.border, z: tb.z };
      });
      if (Array.isArray(s.shapes)) o.shapes = s.shapes;
      if (Array.isArray(s.tables)) o.tables = s.tables;
      if (s.notes != null) o.notes = s.notes;
      if (s.transition != null || s.trans != null) o.trans = s.transition || s.trans;
      if (Array.isArray(s.ink)) o.ink = window.SLPresent ? SLPresent.inkIn(s.ink) : s.ink;
      return SLSave.cleanSlide(o);
    });
    var t = Date.parse(j.created);
    return { deck: { name: String(j.name || '').trim().slice(0, 80) || 'Imported deck', created: isFinite(t) ? t : Date.now(), slides: slides,
      theme: typeof j.theme === 'string' ? j.theme : 'light' },
      cut: j.slides.length > MAX_SLIDES };
  }
  function safeName(n) { return (String(n || 'slides').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').trim() || 'slides').slice(0, 60); }
  function download(deck) {
    var blob = new Blob([JSON.stringify(toJSON(deck), null, 1)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = safeName(deck.name) + '.hslides';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    return a.download;
  }
  function read(file) {
    return new Promise(function (res) {
      if (!file) return res({ error: 'No file.' });
      if (file.size > MAX_BYTES) return res({ error: 'The file is too big (over 40 MB).' });
      var r = new FileReader();
      r.onload = function () { res(parse(String(r.result || ''))); };
      r.onerror = function () { res({ error: 'Could not read the file.' }); };
      r.readAsText(file);
    });
  }
  window.SLFile = { toJSON: toJSON, parse: parse, download: download, read: read, toBullets: toBullets, fromBullets: fromBullets, safeName: safeName };
})();
