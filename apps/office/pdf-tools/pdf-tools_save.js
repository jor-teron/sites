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
    return PTUtil.fileBase(name) + '-edited.pdf';
  },

  /* Build a PDF from the current sources + page list with pdf-lib.
     Pages from PDFs are copied (text and quality kept). Blank pages are new. Images are embedded (JPG/PNG). */
  async build(sources, pages, opts) {
    opts = opts || {};
    const { PDFDocument, degrees } = PDFLib;
    const out = await PDFDocument.create();
    const cache = new Map();
    async function libOf(src) {
      if (cache.has(src.id)) return cache.get(src.id);
      const doc = await PDFDocument.load(src.bytes, { updateMetadata: false });
      if (PT.Sign) PT.Sign.applyFields(doc, src.id, !!opts.flatten);
      cache.set(src.id, doc);
      return doc;
    }
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const src = (sources || []).find((s) => s.id === p.srcId);
      if (!src) continue;
      if (src.kind === 'blank') {
        const w = src.width || PTUtil.PAPER.a4.w;
        const h = src.height || PTUtil.PAPER.a4.h;
        const pg = out.addPage([w, h]);
        if (p.rot) pg.setRotation(degrees((((p.rot % 360) + 360) % 360)));
      } else if (src.kind === 'image') {
        const L = src.layout || PTUtil.imagePageLayout(src.width || 1, src.height || 1, { paper: 'fit', marginMm: 0 });
        const pg = out.addPage([L.pageW, L.pageH]);
        try {
          const pic = src.mime === 'image/png' ? await out.embedPng(src.bytes) : await out.embedJpg(src.bytes);
          pg.drawImage(pic, { x: L.x, y: L.y, width: L.w, height: L.h });
        } catch (err) {
          throw new Error('Could not embed ' + (src.name || 'image') + ': ' + (err && err.message || err));
        }
        if (p.rot) pg.setRotation(degrees((((p.rot % 360) + 360) % 360)));
      } else if (src.kind === 'pdf') {
        const lib = await libOf(src);
        const [pg] = await out.copyPages(lib, [p.src]);
        const base = pg.getRotation().angle || 0;
        pg.setRotation(degrees((((base + p.rot) % 360) + 360) % 360));
        out.addPage(pg);
      }
      if (p.annots && p.annots.length && PT.Sign) {
        await PT.Sign.drawOn(out, out.getPages()[out.getPageCount() - 1], p);
      }
      if (i && i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (opts.stamp && PT.Stamp) await PT.Stamp.decorate(out, pages, opts.stamp);
    out.getPages().forEach((pg, i) => {
      const p = pages[i];
      if (!p || !p.crop) return;
      const c = PTUtil.cropBox(pg.getSize().width, pg.getSize().height, p.crop);
      if (c.ok) pg.setCropBox(c.x, c.y, c.w, c.h);
    });
    if (opts.meta && PT.Stamp) {
      PT.Stamp.applyMeta(out, opts.meta);
    } else {
      const first = (sources || []).find((s) => s.kind === 'pdf' && cache.has(s.id)) || (sources || []).find((s) => s.kind === 'pdf');
      if (first) {
        const lib = await libOf(first);
        try {
          const t = lib.getTitle(); if (t) out.setTitle(t);
          const a = lib.getAuthor && lib.getAuthor(); if (a) out.setAuthor(a);
          const sub = lib.getSubject && lib.getSubject(); if (sub) out.setSubject(sub);
        } catch (_) { /* some files have odd metadata */ }
      }
    }
    let bytes = await out.save();
    if (opts.shrink && PT.Stamp) {
      bytes = await PT.Stamp.shrinkBytes(bytes, opts.onProgress);
    }
    return new Blob([bytes], { type: 'application/pdf' });
  },
};
