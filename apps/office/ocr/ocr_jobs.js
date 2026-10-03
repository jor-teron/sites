/*
 * OCR — ocr_jobs.js
 * The work itself: open files (queue), show PDF pages, read one page / image ("Start OCR"),
 * read every page ("All pages") and Cancel. Holds the busy lock while working, so the page
 * cannot change and no new file can come in mid-OCR (no text under the wrong page).
 */
(function (OCR) {
  'use strict';

  const J = OCR.jobs = {};
  const S = OCR.state;
  const cfg = () => OCR.config;
  const ST = () => OCR.config.text.status;
  const pct = (p) => Math.round(Math.max(0, Math.min(1, p || 0)) * 100) + '%';
  let cancelled = false;

  J.isCancelled = () => cancelled;

  J.cancel = () => {
    if (!S.busy) return;
    cancelled = true;
    OCR.engine.cancel();
    OCR.status('Cancelling…', 'work');
  };

  function report(err) {
    if (err && err.cancelled) { OCR.status(ST().cancelled, ''); return; }
    const msg = (err && err.message) || String(err);
    OCR.status(msg, 'err');
    if (msg === ST().needKey) OCR.ui.openKey();
    // expected, user-facing problems are only shown in the status line
    const known = Object.values(ST()).indexOf(msg) !== -1 || /^Cloud Vision/.test(msg);
    if (!known) console.warn('[ocr]', err);
  }

  async function decodeImage(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { /* fall back */ }
    }
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); res(im); };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read that image')); };
      im.src = url;
    });
  }

  function closeDoc() {
    const d = S.doc;
    if (!d) return;
    if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
    if (d.pdf) { try { d.pdf.destroy(); } catch (_) { /* ignore */ } }
    S.doc = null;
  }

  async function openDoc(file) {
    closeDoc();
    const isPdf = OCR.io.isPdf(file);
    const doc = { name: file.name || 'file', kind: isPdf ? 'pdf' : 'image', file: file, pdf: null, pages: 1, page: 1, previewUrl: '' };
    if (isPdf) {
      OCR.status('Opening PDF…', 'work');
      doc.pdf = await OCR.pdf.load(file);
      doc.pages = doc.pdf.numPages;
      S.doc = doc;
      await J.showPage(1);
    } else {
      doc.previewUrl = URL.createObjectURL(file);
      S.doc = doc;
      OCR.emit('doc');
    }
    return doc;
  }

  // Show PDF page n in the preview (page nav; locked while OCR runs).
  J.showPage = async (n) => {
    const d = S.doc;
    if (!d || d.kind !== 'pdf') return;
    n = Math.max(1, Math.min(d.pages, n | 0));
    d.page = n;
    OCR.emit('doc');
    const c = await OCR.pdf.renderPreview(d.pdf, n);
    if (S.doc !== d || d.page !== n) { c.width = 0; return; }
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    c.width = 0;
    if (!blob || S.doc !== d || d.page !== n) return;
    if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
    d.previewUrl = URL.createObjectURL(blob);
    OCR.emit('doc');
  };

  J.goPage = (n) => {
    if (S.busy || !S.doc || S.doc.kind !== 'pdf') return;
    const d = S.doc;
    n = Math.max(1, Math.min(d.pages, n | 0));
    if (n === d.page) return;
    J.showPage(n).catch(report);
    OCR.status('Page ' + n + ' / ' + d.pages + ' — Start OCR or All pages', '');
  };

  async function readImage(doc, onProgress) {
    const img = await decodeImage(doc.file);
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const c = OCR.engine.toCanvas(img, w, h, cfg().ocrMaxSide);
    if (img.close) img.close();
    try { return await OCR.engine.recognize(c, onProgress); } finally { c.width = 0; c.height = 0; }
  }

  // Every page of a PDF; onPartial(text) after each page. Stops early on Cancel.
  async function readAllPages(d, onProgress, onPartial, stats) {
    const parts = [];
    for (let n = 1; n <= d.pages; n++) {
      if (cancelled) break;
      if (d.page !== n) { d.page = n; J.showPage(n).catch(() => {}); }
      let r;
      try { r = await OCR.pdf.readPage(d.pdf, n, (p) => onProgress(n, d.pages, p)); }
      catch (e) { if (cancelled || (e && e.cancelled)) break; throw e; }
      if (cancelled) break;
      stats[r.method]++;
      stats.done = n;
      parts.push(cfg().text.pageMarker(n) + '\n' + (r.text.trim() || '[no text found]'));
      onPartial(parts.join('\n\n'));
    }
    return parts.join('\n\n');
  }

  // "Start OCR": the image, or the current PDF page.
  J.runOne = async () => {
    if (S.busy || !S.doc) return;
    cancelled = false;
    OCR.setBusy(true, 'one');
    const d = S.doc;
    try {
      let r;
      const prog = (p) => OCR.status('Reading… ' + pct(p), 'work');
      prog(0);
      if (d.kind === 'pdf') r = await OCR.pdf.readPage(d.pdf, d.page, prog);
      else r = { text: await readImage(d, prog), method: 'ocr' };
      if (cancelled) throw Object.assign(new Error(ST().cancelled), { cancelled: true });
      const t = r.text.trim();
      OCR.ui.setText(t, true);
      if (!t) OCR.status(ST().noText, 'err');
      else if (d.kind === 'pdf') OCR.status('Done · page ' + d.page + ' (' + (r.method === 'text' ? 'PDF text' : 'OCR') + ')', 'ok');
      else OCR.status(ST().done, 'ok');
    } catch (err) { report(err); }
    finally { OCR.setBusy(false); }
  };

  // "All pages": combined text with page markers, progress, Cancel.
  J.runAll = async () => {
    const d = S.doc;
    if (S.busy || !d || d.kind !== 'pdf') return;
    cancelled = false;
    OCR.setBusy(true, 'all');
    const stats = { text: 0, ocr: 0, done: 0 };
    OCR.ui.setText('', false);
    try {
      const text = await readAllPages(d,
        (n, N, p) => OCR.status('Page ' + n + ' / ' + N + ' · Reading… ' + pct(p), 'work'),
        (partial) => OCR.ui.setText(partial, true, true), stats);
      OCR.ui.setText(text, true, true);
      if (cancelled) OCR.status('Cancelled after ' + stats.done + ' of ' + d.pages + ' pages', '');
      else OCR.status('Done · ' + d.pages + ' pages (' + stats.text + ' PDF text, ' + stats.ocr + ' OCR)', 'ok');
    } catch (err) { report(err); }
    finally { OCR.setBusy(false); }
  };

  // Open picked / dropped / pasted files. One file: an image is read at once, a PDF waits
  // for Start OCR / All pages. Several files: each is read in turn (PDFs: all pages),
  // results joined under "=== name ===" headers.
  J.openFiles = async (files, skipped) => {
    const note = skipped && skipped.length ? ' (' + skipped.length + ' skipped: ' + skipped[0] + ')' : '';
    if (files.length === 1) {
      OCR.setBusy(true, 'load');
      let doc;
      try { doc = await openDoc(files[0]); }
      catch (err) { OCR.setBusy(false); closeDoc(); OCR.emit('doc'); report(err); return; }
      OCR.setBusy(false);
      OCR.ui.setText('', false);
      OCR.ui.showTab('preview');
      if (doc.kind === 'image') await J.runOne();
      else OCR.status('PDF · ' + doc.pages + ' page' + (doc.pages > 1 ? 's' : '') + ' — Start OCR (this page) or All pages' + note, '');
      if (note && doc.kind === 'image') OCR.status(document.getElementById('status').textContent + note, '');
      return;
    }
    cancelled = false;
    OCR.setBusy(true, 'queue');
    OCR.ui.setText('', false);
    const out = [];
    let i = 0;
    try {
      for (const f of files) {
        if (cancelled) break;
        i++;
        const pre = 'File ' + i + ' / ' + files.length + ' · ';
        const head = cfg().text.fileMarker(f.name || ('file ' + i));
        let doc;
        try { doc = await openDoc(f); }
        catch (e) { out.push(head + '\n[' + (e.message || e) + ']'); OCR.ui.setText(out.join('\n\n'), true, true); continue; }
        let text = '';
        try {
          if (doc.kind === 'image') {
            text = (await readImage(doc, (p) => OCR.status(pre + 'Reading… ' + pct(p), 'work'))).trim();
          } else {
            text = await readAllPages(doc,
              (n, N, p) => OCR.status(pre + 'Page ' + n + ' / ' + N + ' · ' + pct(p), 'work'),
              (partial) => OCR.ui.setText(out.concat(head + '\n' + partial).join('\n\n'), true, true),
              { text: 0, ocr: 0, done: 0 });
          }
        } catch (e) {
          if (cancelled || (e && e.cancelled)) break;
          text = '[' + (e.message || e) + ']';
        }
        if (cancelled && !text) break;
        out.push(head + '\n' + (text || '[no text found]'));
        OCR.ui.setText(out.join('\n\n'), true, true);
      }
      if (cancelled) OCR.status('Cancelled after ' + out.length + ' of ' + files.length + ' files', '');
      else OCR.status('Done · ' + files.length + ' files' + note, 'ok');
    } catch (err) { report(err); }
    finally { OCR.setBusy(false); }
  };
})(window.OCR);
