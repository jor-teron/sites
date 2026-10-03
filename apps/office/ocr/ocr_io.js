/*
 * OCR — ocr_io.js
 * Getting files in (file picker, camera, drag & drop on either panel, paste) and text out
 * (Copy, .txt, .docx).
 */
(function (OCR) {
  'use strict';

  const IO = OCR.io = {};
  const cfg = () => OCR.config;
  const $ = (id) => document.getElementById(id);
  let picker, camera;

  IO.init = () => {
    picker = $('file-in'); camera = $('camera-in');
    picker.accept = cfg().accept.pickerAccept;
    picker.addEventListener('change', () => { const f = Array.from(picker.files || []); picker.value = ''; IO.add(f); });
    camera.addEventListener('change', () => { const f = Array.from(camera.files || []); camera.value = ''; IO.add(f); });

    // Both panels are drop zones; the rest of the page just must not navigate to a dropped file.
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
    for (const zone of document.querySelectorAll('.panel')) {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
      zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag'); });
      zone.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation();
        zone.classList.remove('drag');
        IO.add(Array.from((e.dataTransfer && e.dataTransfer.files) || []));
      });
    }

    // Paste an image (or a copied file) anywhere — but plain text pastes into the text box as usual.
    window.addEventListener('paste', (e) => {
      const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
      const files = items.filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter(Boolean);
      if (!files.length) return;
      e.preventDefault();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
      IO.add(files.map((f) => (f.name && f.name !== 'image.png') ? f
        : new File([f], 'pasted-' + stamp + '.' + ((f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')), { type: f.type })));
    });
  };

  IO.pick = () => { if (!OCR.state.busy) picker.click(); else OCR.status(cfg().text.status.busy, 'err'); };
  IO.camera = () => { if (!OCR.state.busy) camera.click(); else OCR.status(cfg().text.status.busy, 'err'); };

  IO.isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');

  IO.check = (f) => {
    const A = cfg().accept, name = (f.name || '').toLowerCase();
    const ok = A.types.indexOf(f.type) !== -1 || A.ext.some((x) => name.endsWith(x));
    if (!ok) return cfg().text.status.wrongType;
    if (f.size > A.maxBytes) return cfg().text.status.tooBig + (f.name ? ' (' + f.name + ')' : '');
    return '';
  };

  // Validate and hand the good files to the job runner.
  IO.add = (files) => {
    if (!files || !files.length) return;
    if (OCR.state.busy) { OCR.status(cfg().text.status.busy, 'err'); return; }
    const good = [], errors = [];
    for (const f of files.slice(0, cfg().accept.maxFiles)) {
      const err = IO.check(f);
      if (err) errors.push(err); else good.push(f);
    }
    if (!good.length) { OCR.status(errors[0] || cfg().text.status.wrongType, 'err'); return; }
    OCR.jobs.openFiles(good, errors);
  };

  // ----- export -----
  // Characters XML 1.0 does not allow (control chars, lone surrogates, U+FFFE/FFFF).
  const XML_BAD = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;
  IO.xmlEscape = (s) => String(s).replace(XML_BAD, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  IO.baseName = () => {
    const d = OCR.state.doc;
    const n = d && d.name ? d.name.replace(/\.[^.]+$/, '') : '';
    return (n.replace(/[^\w.\- ]+/g, '_').trim() || cfg().download.base);
  };

  IO.download = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), cfg().download.revokeDelayMs);
  };

  IO.text = () => $('ocr-text').value;

  IO.saveTxt = () => {
    IO.download(new Blob([IO.text()], { type: 'text/plain;charset=utf-8' }), IO.baseName() + '.txt');
    OCR.status('Saved ' + IO.baseName() + '.txt', 'ok');
  };

  IO.saveDocx = async () => {
    if (typeof JSZip === 'undefined') { OCR.status('Word export library failed to load', 'err'); return; }
    const paras = IO.text().split(/\r?\n/).map((line) =>
      '<w:p><w:r><w:t xml:space="preserve">' + IO.xmlEscape(line) + '</w:t></w:r></w:p>').join('');
    const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paras + '</w:body></w:document>';
    const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>';
    const zip = new JSZip();
    zip.file('[Content_Types].xml', types);
    zip.folder('_rels').file('.rels', rels);
    zip.folder('word').file('document.xml', doc);
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    IO.download(blob, IO.baseName() + '.docx');
    OCR.status('Saved ' + IO.baseName() + '.docx', 'ok');
  };

  IO.copy = async () => {
    const ta = $('ocr-text');
    try {
      await navigator.clipboard.writeText(ta.value);
    } catch (_) {
      const ro = ta.readOnly; ta.readOnly = false;
      ta.focus(); ta.select();
      try { document.execCommand('copy'); } catch (__) { /* ignore */ }
      ta.readOnly = ro; ta.setSelectionRange(0, 0); ta.blur();
    }
    OCR.status('Copied', 'ok');
  };
})(window.OCR);
