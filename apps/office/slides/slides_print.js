/* Hub Office Slides SL4 — Print and Export PDF (SLPrint). No libraries, light on a 4 GB Celeron.
   The print view (#print, empty on screen) gets one .pp page per slide, drawn by the same static renderer as Present
   (SLEdit.paint, 'slide sv pv': layout, deck theme, per-slide background, pictures). slides.css @media print hides the
   app, shows #print and sets @page { size: 10in 5.625in; margin: 0 } = 960 x 540 CSS px, the slide's own design size,
   so every slide is exactly one 16:9 page with no scaling.
     SLPrint.run(deck, {pdf}) -> Promise: loads the pictures (IndexedDB), builds the view, waits for the images, then
       window.print(). pdf: true only names the file (document.title = deck name, the browser's default PDF name).
       Export PDF = the same print window with "Save as PDF" as the destination (the app shows a hint first).
     SLPrint.build(deck) / SLPrint.clear(): the view alone (tests: page.pdf after build).
   A print started from the browser's own menu builds the view synchronously on beforeprint (pictures already in memory). */
(function () {
  'use strict';
  var box = null, built = false, oldTitle = null, getDeck = null;
  function el() { return box || (box = document.getElementById('print')); }
  function build(deck) {
    var b = el(); if (!b || !deck) return 0;
    var th = deck.theme || 'light', html = '';
    b.textContent = '';
    deck.slides.forEach(function () { html += '<div class="pp"><div class="slide sv pv"></div></div>'; });
    b.innerHTML = html;
    [].forEach.call(b.querySelectorAll('.pp > .slide'), function (s, i) {
      SLEdit.paint(s, deck.slides[i], i, { show: true }, th, 'slide sv pv');
      s.setAttribute('aria-label', 'Slide ' + (i + 1));
    });
    built = true;
    return deck.slides.length;
  }
  function clear() {
    var b = el(); if (b) b.textContent = '';
    built = false;
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
      build(deck);
      return ready();
    }).then(function () {
      if (o.pdf) { oldTitle = document.title; document.title = String(deck.name || 'Slides').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Slides'; }
      /* print in the next frame so the view is laid out; afterprint clears it */
      return new Promise(function (r) { requestAnimationFrame(function () { try { window.print(); } catch (_) { /* no print here */ } r(true); }); });
    });
  }
  addEventListener('beforeprint', function () { if (!built && getDeck) build(getDeck()); });
  addEventListener('afterprint', function () { setTimeout(clear, 0); });
  window.SLPrint = { build: build, clear: clear, run: run, ready: ready, source: function (fn) { getDeck = fn; } };
})();
