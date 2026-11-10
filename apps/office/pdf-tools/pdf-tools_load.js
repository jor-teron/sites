/*
 * PDF Tools — opening and adding files (button, drag-drop). Checks each with
 * pdf-lib (editable, not encrypted) and pdf.js (renderable). Password-protected
 * or broken files get a friendly message. Adding PDFs appends their pages to
 * the same grid; Open starts a new session.
 */
PT.Load = (() => {
  const { S } = PT;
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../shared/vendor/pdfjs/pdf.worker.min.js';

  function friendly(err) {
    const n = (err && (err.name || err.constructor && err.constructor.name)) || '';
    const m = String(err && err.message || err);
    if (/Password/i.test(n) || /encrypt|password/i.test(m)) {
      return { title: 'Password-protected PDF', text: 'This PDF is password-protected or encrypted, so its pages can\'t be edited here.\nRemove the protection in the app that made it, then open it again.' };
    }
    return { title: 'Can\'t open this file', text: 'This doesn\'t look like a valid PDF, or the file is damaged.' };
  }

  function pdfFiles(list) {
    return Array.from(list || []).filter((x) => /pdf$/i.test(x.type) || /\.pdf$/i.test(x.name));
  }

  async function readSource(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
    if (head.indexOf('%PDF') < 0) throw new Error('not a pdf');
    const lib = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
    const sizes = lib.getPages().map((pg) => {
      const s = pg.getSize();
      return { w: s.width, h: s.height, baseRot: (pg.getRotation().angle || 0) };
    });
    let title = '', author = '', subject = '';
    try { title = lib.getTitle() || ''; } catch (_) { /* odd metadata */ }
    try { author = lib.getAuthor && lib.getAuthor() || ''; } catch (_) { /* */ }
    try { subject = lib.getSubject && lib.getSubject() || ''; } catch (_) { /* */ }
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    if (!pdf.numPages) {
      pdf.destroy();
      throw new Error('no pages');
    }
    return {
      id: S.nextSrc++,
      kind: 'pdf',
      name: file.name || 'document.pdf',
      color: PTUtil.colorFor(S.nextSrc - 2),
      bytes, pdf, n: pdf.numPages, sizes,
      title, author, subject,
    };
  }

  async function ingest(fileList, replace) {
    const files = pdfFiles(fileList);
    const picked = files.length ? files : (fileList && fileList[0] ? [fileList[0]] : []);
    if (!picked.length) return;
    if (replace && S.doc && PT.Edit.dirty()) {
      const ok = await PT.ask({ title: 'Open another file?', text: 'Your changes to ' + S.doc.name + ' haven\'t been saved.', yes: 'Open', danger: true });
      if (!ok) return;
    }
    const loaded = [];
    const errors = [];
    for (let i = 0; i < picked.length; i++) {
      const file = picked[i];
      PT.busy((picked.length > 1 ? (i + 1) + ' of ' + picked.length + ': ' : '') + 'Opening ' + file.name + '…');
      try {
        loaded.push(await readSource(file));
      } catch (err) {
        console.info('PDF Tools: open failed:', err && err.message);
        errors.push({ file, info: friendly(err) });
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    PT.busy(null);
    if (!loaded.length) {
      const f = errors[0] ? errors[0].info : { title: 'Can\'t open this file', text: 'Please choose a PDF file.' };
      await PT.ask(Object.assign({ no: false }, f));
      return;
    }
    if (replace || !S.doc) {
      close(true);
      S.sources = loaded;
      S.pages = [];
      loaded.forEach((src) => {
        for (let i = 0; i < src.n; i++) S.pages.push({ id: S.nextId++, srcId: src.id, src: i, rot: 0 });
      });
      S.doc = { name: loaded[0].name };
      S.sel.clear(); S.anchor = null;
      PT.Edit.reset();
      if (PT.Stamp) {
        PT.Stamp.reset();
        const first = loaded[0];
        S.meta = { title: first.title || '', author: first.author || '', subject: first.subject || '' };
      }
      PT.emit('opened');
      PT.refresh();
    } else {
      S.sources.push(...loaded);
      const extra = [];
      loaded.forEach((src) => {
        for (let i = 0; i < src.n; i++) extra.push({ id: S.nextId++, srcId: src.id, src: i, rot: 0 });
      });
      const n = extra.length;
      PT.Edit.append(extra, 'Added ' + n + (n === 1 ? ' page' : ' pages') + ' from ' + loaded.length + (loaded.length === 1 ? ' file' : ' files'));
    }
    if (errors.length) {
      const names = errors.map((e) => e.file.name).join(', ');
      await PT.ask({ title: 'Some files couldn\'t be opened', text: names + '.\n' + errors[0].info.text, no: false });
    }
  }

  function close(silent) {
    if (S.doc) PT.emit('closing');
    S.sources.forEach((s) => { if (s.pdf && s.pdf.destroy) s.pdf.destroy(); if (s.thumb) URL.revokeObjectURL(s.thumb); });
    S.sources = [];
    S.doc = null; S.pages = []; S.sel.clear(); S.anchor = null;
    PT.Edit.reset();
    if (PT.Stamp) PT.Stamp.reset();
    if (!silent) PT.refresh();
  }

  function init() {
    const fOpen = PT.$('file');
    const fAdd = PT.$('file-add');
    const pick = (input) => { PT.menu(false); input.value = ''; input.click(); };
    PT.$('b-open').addEventListener('click', () => pick(fOpen));
    PT.$('empty-open').addEventListener('click', () => pick(fOpen));
    PT.$('b-add').addEventListener('click', () => pick(S.doc ? fAdd : fOpen));
    fOpen.addEventListener('change', () => ingest(fOpen.files, true));
    fAdd.addEventListener('change', () => ingest(fAdd.files, false));
    let depth = 0;
    const isFile = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    addEventListener('dragenter', (e) => { if (!isFile(e)) return; e.preventDefault(); depth++; PT.$('drop').hidden = false; });
    addEventListener('dragover', (e) => { if (isFile(e)) e.preventDefault(); });
    addEventListener('dragleave', (e) => { if (!isFile(e)) return; if (--depth <= 0) { depth = 0; PT.$('drop').hidden = true; } });
    addEventListener('drop', (e) => {
      if (!isFile(e)) return;
      e.preventDefault(); depth = 0; PT.$('drop').hidden = true;
      const files = Array.from(e.dataTransfer.files || []);
      const pdfs = files.filter((x) => /pdf$/i.test(x.type) || /\.pdf$/i.test(x.name));
      const images = files.filter(PTUtil.isImageFile);
      const go = async () => {
        if (pdfs.length) await ingest(pdfs, !S.doc);
        if (images.length) await PT.Images.addFiles(images);
        if (!pdfs.length && !images.length && files[0]) await ingest(files, !S.doc);
      };
      go();
    });
    PT.$('m-close').addEventListener('click', async () => {
      PT.menu(false);
      if (PT.Edit.dirty() && !(await PT.ask({ title: 'Close file?', text: 'Your changes haven\'t been saved.', yes: 'Close', danger: true }))) return;
      close();
    });
  }
  return { ingest, close, init, pick: () => PT.$('b-open').click(), add: () => PT.$('b-add').click() };
})();
