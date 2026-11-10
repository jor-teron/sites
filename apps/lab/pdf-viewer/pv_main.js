/* PDF Viewer — pv_main.js: wire modules together. PV2 */
(function () {
  'use strict';

  var RELEASE = 'PV2';
  window.PV_RELEASE = RELEASE;

  // Point pdf.js worker at the vendored classic build (no CDN).
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js?v=' + RELEASE;
  }

  var els = {
    fileInput: document.getElementById('file-input'),
    openLabel: document.getElementById('open-label'),
    controls: document.getElementById('controls'),
    meta: document.getElementById('toolbar-meta'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    pageInput: document.getElementById('page-input'),
    pageCount: document.getElementById('page-count'),
    zoomOutBtn: document.getElementById('zoom-out-btn'),
    zoomInBtn: document.getElementById('zoom-in-btn'),
    zoomLabel: document.getElementById('zoom-label'),
    fitBtn: document.getElementById('fit-btn'),
    findBtn: document.getElementById('find-btn'),
    ocrBtn: document.getElementById('ocr-btn'),
    printBtn: document.getElementById('print-btn'),
    viewer: document.getElementById('viewer'),
    pages: document.getElementById('pages'),
    empty: document.getElementById('empty'),
    overlay: document.getElementById('drop-overlay'),
    status: document.getElementById('status'),
    printRoot: document.getElementById('print-root'),
    findBar: document.getElementById('find-bar'),
    findInput: document.getElementById('find-input'),
    findCount: document.getElementById('find-count'),
    findPrevBtn: document.getElementById('find-prev-btn'),
    findNextBtn: document.getElementById('find-next-btn'),
    findCloseBtn: document.getElementById('find-close-btn')
  };

  var ui = PVUi.createUi({ els: els });

  var pageInfo = Object.create(null);
  var emptyPages = [];
  var scanGen = 0;
  var offeredForScan = 0;
  var opening = false;

  var renderer = PVRender.createRenderer({
    viewer: els.viewer,
    pagesEl: els.pages,
    onPageChange: function (cur, total) {
      ui.updatePage(cur, total);
    },
    onStatus: function (msg, kind) {
      ui.setStatus(msg, kind);
    },
    onPageRendered: function (slot) {
      return attachLayer(slot);
    }
  });
  ui.setRenderer(renderer);
  ui.setEmpty(true);

  var ocr = PVOcr.createController({
    onStatus: function (m, k) { ui.setStatus(m, k); },
    onPageOcr: function (n, rec) {
      rememberOcr(n, rec);
      var slot = renderer.getSlot(n);
      if (slot && slot.rendered) attachLayer(slot);
      if (find) find.refreshIfOpen();
    }
  });

  function rememberOcr(n, rec) {
    pageInfo[n] = pageInfo[n] || {};
    pageInfo[n].ocr = rec;
    pageInfo[n].text = rec.text || '';
    pageInfo[n].searchText = (rec.words || []).map(function (w) {
      return w.text + ' ';
    }).join('');
  }

  function getPageSearchText(n) {
    var info = pageInfo[n] || {};
    if (info.searchText) return info.searchText;
    return info.text || '';
  }

  var find = PVFind.createFind({
    els: {
      bar: els.findBar,
      input: els.findInput,
      count: els.findCount,
      prevBtn: els.findPrevBtn,
      nextBtn: els.findNextBtn,
      closeBtn: els.findCloseBtn
    },
    getPageText: getPageSearchText,
    getNumPages: function () { return renderer.getNumPages(); },
    getSlot: function (n) { return renderer.getSlot(n); },
    goToPage: function (n) { renderer.goToPage(n); },
    onStatus: function (m, k) { ui.setStatus(m, k); }
  });

  async function attachLayer(slot) {
    if (!slot) return;
    var info = pageInfo[slot.pageNum] || {};
    var page = null;
    var doc = renderer.getDoc();
    var ocrRec = info.ocr && (info.ocr.text || (info.ocr.words && info.ocr.words.length)) ? info.ocr : null;
    if (doc && !ocrRec) {
      try { page = await doc.getPage(slot.pageNum); } catch (e) { return; }
    }
    try {
      await PVTextLayer.attach(slot, {
        ocr: ocrRec,
        page: page,
        scale: renderer.getScale(),
        nativeText: info.hasNative === false && !info.ocr ? false : undefined
      });
    } catch (e) {
      console.warn('[pv2] text layer', e);
    }
    find.onPageRendered(slot);
  }

  function langPicker() {
    var label = document.createElement('label');
    label.className = 'ocr-lang';
    label.appendChild(document.createTextNode('Language'));
    var sel = document.createElement('select');
    sel.setAttribute('aria-label', 'OCR language');
    ocr.getLangs().forEach(function (l) {
      var o = document.createElement('option');
      o.value = l.id;
      o.textContent = l.label;
      if (l.id === ocr.getLang()) o.selected = true;
      sel.appendChild(o);
    });
    sel.disabled = ocr.getLangs().length < 2;
    sel.addEventListener('change', function () { ocr.setLang(sel.value); });
    label.appendChild(sel);
    return label;
  }

  function pagesWithoutText() {
    var out = [];
    var n = renderer.getNumPages();
    var i, info;
    for (i = 1; i <= n; i++) {
      info = pageInfo[i] || {};
      if (info.ocr && (info.ocr.text || (info.ocr.words && info.ocr.words.length))) continue;
      if (info.hasNative) continue;
      out.push(i);
    }
    return out;
  }

  function allPageNums() {
    var out = [];
    var n = renderer.getNumPages();
    for (var i = 1; i <= n; i++) out.push(i);
    return out;
  }

  function uniqueValid(pages) {
    var seen = Object.create(null);
    var out = [];
    var total = renderer.getNumPages();
    var i, n;
    for (i = 0; i < (pages || []).length; i++) {
      n = pages[i] | 0;
      if (n < 1 || n > total || seen[n]) continue;
      seen[n] = true;
      out.push(n);
    }
    return out;
  }

  async function startOcr(pages) {
    pages = uniqueValid(pages);
    if (!pages.length) {
      PVDlg.message('OCR', 'No pages to OCR.');
      return;
    }
    var labelEl = null;
    var progEl = null;
    PVDlg.open({
      title: 'OCR',
      dismissable: false,
      fill: function (body) {
        labelEl = document.createElement('p');
        labelEl.textContent = 'Starting…';
        progEl = document.createElement('progress');
        progEl.max = 100;
        progEl.value = 0;
        body.appendChild(labelEl);
        body.appendChild(progEl);
        var hint = document.createElement('p');
        hint.className = 'ocr-hint';
        hint.textContent = 'One page at a time. You can cancel any time.';
        body.appendChild(hint);
      },
      actions: [
        { label: 'Cancel', fn: function () { ocr.cancel(); } }
      ]
    });
    try {
      await ocr.runPages(pages, function (info) {
        if (progEl) progEl.value = Math.round((info.fraction || 0) * 100);
        if (labelEl) {
          labelEl.textContent = 'Page ' + info.page + ' — ' + (info.index + 1) + ' of ' + info.total;
        }
      });
      PVDlg.close();
      var text = ocr.allCachedText();
      PVDlg.open({
        title: 'OCR done',
        text: pages.length === 1
          ? 'Page ' + pages[0] + ' is now searchable and can be copied.'
          : pages.length + ' pages are now searchable and can be copied.',
        actions: [
          { label: 'Copy all OCR text', cls: 'btn-primary', fn: function () { copyOcrText(); } },
          { label: 'Save as .txt', fn: function () { saveOcrText(); return false; } },
          { label: 'Close' }
        ]
      });
      if (!text) {
        /* still show done — some pages may have had no recognised words */
      }
    } catch (e) {
      if (e && e.cancelled) {
        PVDlg.close();
        return;
      }
      PVDlg.close();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    ui.setStatus(ok ? 'OCR text copied' : 'Could not copy', ok ? undefined : 'error');
  }

  function copyOcrText() {
    var text = ocr.allCachedText();
    if (!text) {
      PVDlg.message('OCR', 'No OCR text yet. Run OCR first.');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        ui.setStatus('OCR text copied');
      }).catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  function saveOcrText() {
    var text = ocr.allCachedText();
    if (!text) {
      PVDlg.message('OCR', 'No OCR text yet. Run OCR first.');
      return;
    }
    var name = (ui.getFileName() || 'document').replace(/\.pdf$/i, '') + '-ocr.txt';
    var blob = new Blob([text], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    ui.setStatus('Saved ' + name);
  }

  function offerOcr(pages) {
    if (!pages.length) return;
    if (offeredForScan === scanGen) return;
    offeredForScan = scanGen;
    var cur = renderer.getCurrentPage();
    var thisEmpty = pages.indexOf(cur) !== -1;
    var msg = pages.length === 1
      ? 'Page ' + pages[0] + ' has no text layer. Run OCR so you can search and copy the text?'
      : (pages.length + ' pages have no text layer. Run OCR so you can search and copy the text?');
    PVDlg.open({
      title: 'OCR scanned pages',
      fill: function (body) {
        var p = document.createElement('p');
        p.textContent = msg;
        body.appendChild(p);
        body.appendChild(langPicker());
        var hint = document.createElement('p');
        hint.className = 'ocr-hint';
        hint.textContent = 'OCR is not started automatically.';
        body.appendChild(hint);
      },
      actions: [
        {
          label: 'This page',
          cls: thisEmpty ? 'btn-primary' : '',
          fn: function () { startOcr([renderer.getCurrentPage()]); }
        },
        {
          label: pages.length === 1 ? 'Run OCR' : 'All ' + pages.length + ' pages',
          cls: thisEmpty ? '' : 'btn-primary',
          fn: function () { startOcr(pages); }
        },
        { label: 'Not now' }
      ]
    });
  }

  function openOcrMenu() {
    if (ocr.isRunning()) return;
    if (!renderer.getDoc()) {
      PVDlg.message('OCR', 'Open a PDF first.');
      return;
    }
    var empty = pagesWithoutText();
    var cur = renderer.getCurrentPage();
    PVDlg.open({
      title: 'OCR',
      fill: function (body) {
        var p = document.createElement('p');
        p.textContent = empty.length
          ? (empty.length + ' page' + (empty.length === 1 ? '' : 's') + ' have no text layer.')
          : 'Every page already has text. You can still re-run OCR if you want.';
        body.appendChild(p);
        body.appendChild(langPicker());
        var hint = document.createElement('p');
        hint.className = 'ocr-hint';
        hint.textContent = 'English is the only language packaged with the app. Results stay on this device.';
        body.appendChild(hint);
      },
      actions: [
        { label: 'This page', cls: 'btn-primary', fn: function () { startOcr([cur]); } },
        { label: empty.length ? ('Pages without text (' + empty.length + ')') : 'Pages without text', fn: function () { startOcr(empty); } },
        { label: 'All pages', fn: function () { startOcr(allPageNums()); } },
        { label: 'Copy all OCR text', fn: function () { copyOcrText(); return false; } },
        { label: 'Save as .txt', fn: function () { saveOcrText(); return false; } },
        { label: 'Close' }
      ]
    });
  }

  async function afterOpen(opened) {
    pageInfo = Object.create(null);
    emptyPages = [];
    var myGen = ++scanGen;
    offeredForScan = 0;
    ocr.resetDocument(opened.doc, opened.file);

    var nums = allPageNums();
    await ocr.warmupCache(nums);
    if (scanGen !== myGen) return;

    ui.setStatus('Checking pages for text…', 'busy');
    var n, page, tc, readable, search, has, info, slot;
    for (n = 1; n <= opened.numPages; n++) {
      if (scanGen !== myGen) return;
      info = pageInfo[n] || (pageInfo[n] = {});
      if (info.ocr) {
        slot = renderer.getSlot(n);
        if (slot && slot.rendered) attachLayer(slot);
        continue;
      }
      try {
        page = await opened.doc.getPage(n);
        tc = await page.getTextContent();
        try { page.cleanup(); } catch (e) { /* ignore */ }
        readable = PVOcrMath.joinPageText(tc.items);
        search = (tc.items || []).map(function (it) {
          return (it && typeof it.str === 'string') ? it.str : '';
        }).join('');
        has = PVOcrMath.hasRealText(readable) || PVOcrMath.hasRealText(search);
        info.hasNative = has;
        if (has) {
          info.text = readable;
          info.searchText = search;
        } else {
          emptyPages.push(n);
        }
      } catch (e) {
        console.warn('[pv2] text scan page ' + n, e);
        emptyPages.push(n);
        info.hasNative = false;
      }
      slot = renderer.getSlot(n);
      if (slot && slot.rendered) attachLayer(slot);
      await new Promise(function (r) { setTimeout(r, 0); });
    }
    if (scanGen !== myGen) return;

    emptyPages = pagesWithoutText();
    if (emptyPages.length) {
      ui.setStatus(
        emptyPages.length + ' page' + (emptyPages.length === 1 ? '' : 's') +
          ' have no text — OCR can make them searchable'
      );
      offerOcr(emptyPages);
    } else {
      ui.setStatus('Ready — text can be selected and searched');
    }
    find.refreshIfOpen();
  }

  async function handleFile(file) {
    if (!file || opening) return;
    opening = true;
    if (ocr.isRunning()) ocr.cancel();
    scanGen += 1;
    PVDlg.close();
    ui.setStatus('Opening…', 'busy');
    try {
      var opened = await PVLoad.openPdfFile(file);
      await renderer.loadDocument(opened.doc);
      ui.onDocReady(opened.name, opened.numPages);
      ui.updateZoom();
      await afterOpen(opened);
    } catch (e) {
      console.error(e);
      var msg = 'Could not open this file.';
      if (e && e.code === 'NOT_PDF') msg = 'That does not look like a PDF.';
      else if (e && e.code === 'PASSWORD') msg = 'Password required — open cancelled.';
      else if (e && e.message) msg = e.message;
      ui.setStatus(msg, 'error');
      if (!renderer.getDoc()) ui.setEmpty(true);
    } finally {
      opening = false;
    }
  }

  PVLoad.bindOpeners({
    fileInput: els.fileInput,
    overlay: els.overlay,
    onFile: handleFile
  });

  if (els.printBtn) {
    els.printBtn.addEventListener('click', function () {
      var doc = renderer.getDoc();
      if (!doc) {
        ui.setStatus('Open a PDF first', 'error');
        return;
      }
      PVPrint.printDocument({
        doc: doc,
        printRoot: els.printRoot,
        onStatus: function (m, k) { ui.setStatus(m, k); }
      });
    });
  }

  if (els.ocrBtn) els.ocrBtn.addEventListener('click', openOcrMenu);
  if (els.findBtn) els.findBtn.addEventListener('click', function () { find.open(); });

  window.addEventListener('keydown', function (e) {
    var key = e.key;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === 'f' || key === 'F')) {
      e.preventDefault();
      find.open();
      return;
    }
    if (key === 'F3') {
      if (!find.isOpen()) return;
      e.preventDefault();
      find.step(e.shiftKey ? -1 : 1);
    }
  });
})();
