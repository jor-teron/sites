/*
 * PDF Tools — saving. Every file goes through PTSave.save(blob, filename).
 * Today it is a browser download; swap the body for Hub Drive later without
 * touching the other modules. Returns a Promise that resolves to the file name.
 */
const PTSave = {
  save(blob, filename) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      resolve(filename);
    });
  },

  /* "report.pdf" -> "report-edited.pdf" */
  editedName(name) {
    return (String(name || 'document').replace(/\.pdf$/i, '') || 'document') + '-edited.pdf';
  },

  /* Build the edited PDF from the original bytes + page list with pdf-lib. */
  async build(bytes, pages) {
    const { PDFDocument, degrees } = PDFLib;
    const src = await PDFDocument.load(bytes, { updateMetadata: false });
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, pages.map((p) => p.src));
    copied.forEach((pg, i) => {
      const base = pg.getRotation().angle || 0;
      pg.setRotation(degrees((((base + pages[i].rot) % 360) + 360) % 360));
      out.addPage(pg);
    });
    const t = src.getTitle(); if (t) out.setTitle(t);
    return new Blob([await out.save()], { type: 'application/pdf' });
  },
};
