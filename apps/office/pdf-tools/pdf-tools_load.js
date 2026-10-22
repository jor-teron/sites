/*
 * PDF Tools — opening a file (button, drag-drop). Checks it with pdf-lib (editable, not encrypted)
 * and pdf.js (renderable). Password-protected or broken files get a friendly message.
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

  async function open(file) {
    if (!file) return;
    if (S.doc && PT.Edit.dirty()) {
      const ok = await PT.ask({ title: 'Open another file?', text: 'Your changes to ' + S.doc.name + ' haven\'t been saved.', yes: 'Open', danger: true });
      if (!ok) return;
    }
    PT.busy('Opening ' + file.name + '…');
    let bytes, pdf = null;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
      const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
      if (head.indexOf('%PDF') < 0) throw new Error('not a pdf');
      await PDFLib.PDFDocument.load(bytes, { updateMetadata: false }); // throws EncryptedPDFError
      pdf = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
      if (!pdf.numPages) throw new Error('no pages');
    } catch (err) {
      if (pdf) pdf.destroy();
      PT.busy(null);
      console.info('PDF Tools: open failed:', err && err.message);
      const f = friendly(err);
      await PT.ask(Object.assign({ no: false }, f));
      return;
    }
    close(true);
    S.doc = { name: file.name || 'document.pdf', bytes, pdf, n: pdf.numPages };
    S.pages = Array.from({ length: pdf.numPages }, (_, i) => ({ id: S.nextId++, src: i, rot: 0 }));
    S.sel.clear(); S.anchor = null;
    PT.Edit.reset();
    PT.busy(null);
    PT.emit('opened');
    PT.refresh();
  }

  function close(silent) {
    if (S.doc) { PT.emit('closing'); S.doc.pdf.destroy(); }
    S.doc = null; S.pages = []; S.sel.clear(); S.anchor = null;
    PT.Edit.reset();
    if (!silent) PT.refresh();
  }

  function init() {
    const f = PT.$('file');
    const pick = () => { PT.menu(false); f.value = ''; f.click(); };
    PT.$('b-open').addEventListener('click', pick);
    PT.$('empty-open').addEventListener('click', pick);
    f.addEventListener('change', () => open(f.files[0]));
    let depth = 0;
    const isFile = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    addEventListener('dragenter', (e) => { if (!isFile(e)) return; e.preventDefault(); depth++; PT.$('drop').hidden = false; });
    addEventListener('dragover', (e) => { if (isFile(e)) e.preventDefault(); });
    addEventListener('dragleave', (e) => { if (!isFile(e)) return; if (--depth <= 0) { depth = 0; PT.$('drop').hidden = true; } });
    addEventListener('drop', (e) => {
      if (!isFile(e)) return;
      e.preventDefault(); depth = 0; PT.$('drop').hidden = true;
      const file = Array.from(e.dataTransfer.files).find((x) => /pdf$/i.test(x.type) || /\.pdf$/i.test(x.name)) || e.dataTransfer.files[0];
      open(file);
    });
    PT.$('m-close').addEventListener('click', async () => {
      PT.menu(false);
      if (PT.Edit.dirty() && !(await PT.ask({ title: 'Close file?', text: 'Your changes haven\'t been saved.', yes: 'Close', danger: true }))) return;
      close();
    });
  }
  return { open, close, init, pick: () => PT.$('b-open').click() };
})();
