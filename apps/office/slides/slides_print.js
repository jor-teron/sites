/* Hub Office Slides SL4 — Print and Export PDF (SLPrint), extended in SL7 with optional notes pages. No libraries, light on a 4 GB Celeron.
   The print view (#print, empty on screen) gets one .pp page per slide, drawn by the same static renderer as Present
   (SLEdit.paint, 'slide sv pv': layout, deck theme, per-slide background, pictures). slides.css @media print hides the
   app, shows #print and sets @page { size: 10in 5.625in; margin: 0 } = 960 x 540 CSS px, the slide's own design size,
   so every slide is exactly one 16:9 page with no scaling.
     SLPrint.run(deck, {pdf}) -> Promise: loads the pictures (IndexedDB), builds the view, waits for the images, then
       window.print(). pdf: true only names the file (document.title = deck name, the browser's default PDF name).
       Export PDF = the same print window with "Save as PDF" as the destination (the app shows a hint first).
     SLPrint.build(deck) / SLPrint.clear(): the view alone (tests: page.pdf after build).
     SL7: run(deck, { notes: true }) prints notes pages (A4-ish: a smaller slide plus the speaker notes), not the default 16:9 slide pages.
     SL8: run(deck, { hidden: true }) includes hidden slides; the default is to skip them (if every slide is hidden they are all printed).
   A print started from the browser's own menu builds the view synchronously on beforeprint (pictures already in memory; never notes pages unless Print notes pages… was used). */
(function () {
  'use strict';
  var box = null, built = false, oldTitle = null, getDeck = null, notesMode = false, pageStyle = null;
  function el() { return box || (box = document.getElementById('print')); }
  function setPage(notes) {
    notesMode = !!notes;
    document.documentElement.classList.toggle('notes-print', notesMode);
    if (!pageStyle) { pageStyle = document.createElement('style'); pageStyle.id = 'print-page-size'; document.head.appendChild(pageStyle); }
    pageStyle.textContent = notesMode
      ? '@media print { @page { size: A4; margin: 12mm } }'
      : '@media print { @page { size: 10in 5.625in; margin: 0 } }';
  }
  function build(deck, o) {
    o = o || {};
    var notes = !!o.notes;
    setPage(notes);
    var b = el(); if (!b || !deck) return 0;
    var th = deck.theme || 'light', html = '', i;
    var list = deck.slides || [];
    if (!o.hidden && list.some(function (s) { return !s.hide; })) list = list.filter(function (s) { return !s.hide; });
    var ctx = { slides: list, master: deck.master, theme: th, name: deck.name };
    b.textContent = '';
    if (notes) {
      for (i = 0; i < list.length; i++) html += '<div class="pp notes"><div class="np-meta"></div><div class="np-slide"><div class="slide sv pv"></div></div><pre class="np-notes"></pre></div>';
      b.innerHTML = html;
      [].forEach.call(b.querySelectorAll('.pp.notes'), function (pg, i) {
        var s = list[i];
        pg.querySelector('.np-meta').textContent = (deck.name || 'Slides') + '  ·  Slide ' + (i + 1) + ' of ' + list.length;
        var slide = pg.querySelector('.np-slide .slide');
        SLEdit.paint(slide, s, i, { show: true, deck: ctx }, th, 'slide sv pv');
        slide.style.transform = 'scale(' + (160 * 3.779527559 / 960) + ')'; /* 160mm at 96dpi ≈ 3.78 px/mm */
        slide.setAttribute('aria-label', 'Slide ' + (i + 1));
        pg.querySelector('.np-notes').textContent = window.SLPresent ? SLPresent.cleanNotes(s.notes) : String(s.notes || '');
      });
    } else {
      list.forEach(function () { html += '<div class="pp"><div class="slide sv pv"></div></div>'; });
      b.innerHTML = html;
      [].forEach.call(b.querySelectorAll('.pp > .slide'), function (s, i) {
        SLEdit.paint(s, list[i], i, { show: true, deck: ctx }, th, 'slide sv pv');
        s.setAttribute('aria-label', 'Slide ' + (i + 1));
      });
    }
    built = true;
    return list.length;
  }
  function clear() {
    var b = el(); if (b) b.textContent = '';
    built = false; notesMode = false;
    document.documentElement.classList.remove('notes-print');
    if (oldTitle !== null) { document.title = oldTitle; oldTitle = null; }
  }
  /* wait for every picture to be decoded (so none print blank); never longer than 8 s */
  function ready() {
    var imgs = [].slice.call(el().querySelectorAll('img'));
    var all = Promise.all(imgs.map(function (im) {
      if (im.complete && im.naturalWidth) return im.decode ? im.decode().catch(function () {}) : null;
      return new Promise(function (r) { im.onload = im.onerror = function () { r(); }; });
    }));
    return Promise.race([all, new Promise(function (r) { setTimeout(r, 8000); })]);
  }
  function run(deck, o) {
    o = o || {};
    var hy = window.SLPics ? SLPics.hydrate(deck) : Promise.resolve();
    return Promise.resolve(hy).catch(function () {}).then(function () {
      build(deck, o);
      return ready();
    }).then(function () {
      if (o.pdf) { oldTitle = document.title; document.title = String(deck.name || 'Slides').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Slides'; }
      /* print in the next frame so the view is laid out; afterprint clears it */
      return new Promise(function (r) { requestAnimationFrame(function () { try { window.print(); } catch (_) { /* no print here */ } r(true); }); });
    });
  }
  addEventListener('beforeprint', function () { if (!built && getDeck) build(getDeck(), { notes: false }); });
  addEventListener('afterprint', function () { setTimeout(clear, 0); });
  window.SLPrint = { build: build, clear: clear, run: run, ready: ready, source: function (fn) { getDeck = fn; } };
})();
