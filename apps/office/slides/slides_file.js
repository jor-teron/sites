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
   Import limit is 40 MB now (pictures), 50 pictures per slide. Version-1 files open unchanged (legacy limit was 5 MB). */
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
    /* legacy (SL1 / SL2): version 1, slides: [{ title, bullets }] */
    return {
      format: 'hub-slides', version: 2, name: deck.name, created: iso(deck.created), updated: iso(deck.updated || Date.now()),
      theme: deck.theme || 'light',
      slides: deck.slides.map(function (s) {
        var o = { layout: s.layout || 'tc', title: s.title, bullets: toBullets(s.body) };
        if (s.body2) o.bullets2 = toBullets(s.body2);
        if (s.bg) o.background = s.bg;
        var pics = (s.pics || []).filter(function (p) { return !!p.src; });
        if (pics.length) o.pictures = pics.map(function (p) { return { src: p.src, x: p.x, y: p.y, w: p.w, h: p.h, iw: p.iw, ih: p.ih, fit: p.fit }; });
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
    if ((+j.version || 0) > 2) return { error: 'This file was made by a newer Slides (version ' + j.version + '). Update the Hub and try again.' };
    if (!Array.isArray(j.slides)) return { error: 'The file has no slides list.' };
    var slides = j.slides.slice(0, MAX_SLIDES).map(function (s) {
      s = s && typeof s === 'object' ? s : {};
      var o = { title: String(s.title == null ? '' : s.title).replace(/[\r\n]+/g, ' ').slice(0, 300), body: fromBullets(s.bullets) };
      /* SL3 fields (version 2); anything missing or wrong falls back to the SL1 / SL2 defaults in SLSave.cleanSlide */
      if (typeof s.layout === 'string') o.layout = s.layout;
      if (Array.isArray(s.bullets2)) o.body2 = fromBullets(s.bullets2);
      if (typeof s.background === 'string') o.bg = s.background;
      if (Array.isArray(s.pictures)) o.pics = s.pictures.slice(0, 50).filter(function (p) { return p && SLPics.validSrc(p.src); })
        .map(function (p) { return { src: p.src, x: p.x, y: p.y, w: p.w, h: p.h, iw: p.iw, ih: p.ih, fit: p.fit }; });
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
