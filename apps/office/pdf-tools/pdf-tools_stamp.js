/*
 * PDF Tools P4 — stamps (page numbers, watermark, header/footer, Bates),
 * crop, document metadata, and optional Shrink (image) on save.
 * Layout / format maths live in PTUtil. Drawing uses pdf-lib only.
 */
PT.Stamp = (() => {
  const { S } = PT;
  const MARGIN = 36;

  function defaults() {
    return {
      numbers: {
        on: false,
        format: PT.P.numFormat || 'page-of',
        pos: PT.P.numPos || 'bc',
        start: PT.P.numStart || 1,
        skipFirst: !!PT.P.numSkip,
      },
      watermark: {
        text: '',
        opacity: PT.P.wmOpacity != null ? PT.P.wmOpacity : 0.18,
        angle: PT.P.wmAngle != null ? PT.P.wmAngle : -45,
        size: PT.P.wmSize || 48,
      },
      header: '',
      footer: '',
      bates: {
        on: false,
        prefix: PT.P.batesPrefix || '',
        start: PT.P.batesStart || 1,
        digits: PT.P.batesDigits || 4,
        pos: PT.P.batesPos || 'br',
        skipFirst: !!PT.P.batesSkip,
      },
      shrink: false,
    };
  }

  function ensure() {
    if (!S.stamp) S.stamp = defaults();
    if (!S.meta) S.meta = { title: '', author: '', subject: '' };
    return S.stamp;
  }

  function reset() {
    S.stamp = defaults();
    S.meta = { title: '', author: '', subject: '' };
  }

  function remember(st) {
    Object.assign(PT.P, {
      numFormat: st.numbers.format, numPos: st.numbers.pos, numStart: st.numbers.start, numSkip: st.numbers.skipFirst,
      wmOpacity: st.watermark.opacity, wmAngle: st.watermark.angle, wmSize: st.watermark.size,
      batesPrefix: st.bates.prefix, batesStart: st.bates.start, batesDigits: st.bates.digits,
      batesPos: st.bates.pos, batesSkip: st.bates.skipFirst,
    });
    try { localStorage.setItem('pdf-tools-settings-v1', JSON.stringify(PT.P)); } catch (_) { /* private mode */ }
  }

  function visibleBox(pg, page) {
    const size = pg.getSize();
    if (page && page.crop) {
      const box = PTUtil.cropBox(size.width, size.height, page.crop);
      if (box.ok) return box;
    }
    return { x: 0, y: 0, w: size.width, h: size.height };
  }

  async function decorate(out, pages, stamp) {
    stamp = stamp || ensure();
    const { StandardFonts, degrees, rgb } = PDFLib;
    const font = await out.embedFont(StandardFonts.Helvetica);
    const pagesOut = out.getPages();
    const total = pagesOut.length;
    const date = PTUtil.formatDate(new Date());
    const file = PTUtil.fileBase(S.doc && S.doc.name);
    const grey = rgb(0.2, 0.2, 0.22);
    const wmGrey = rgb(0.35, 0.35, 0.38);

    function draw(pg, text, font, size, x, y, extra) {
      const t = PTUtil.winAnsiSafe(text);
      if (!t) return;
      const opts = Object.assign({ x, y, size, font, color: grey }, extra || {});
      try { pg.drawText(t, opts); } catch (err) { console.info('PDF Tools: stamp skipped:', err && err.message); }
    }

    for (let i = 0; i < pagesOut.length; i++) {
      const pg = pagesOut[i];
      const page = pages[i];
      const box = visibleBox(pg, page);
      const used = {};
      function put(slot, text, size) {
        const t = PTUtil.winAnsiSafe(text);
        if (!t) return;
        const tw = font.widthOfTextAtSize(t, size);
        const pt = PTUtil.slotPoint(box.w, box.h, slot, tw, size, Math.min(MARGIN, box.w / 6, box.h / 6));
        const times = used[slot] || 0;
        used[slot] = times + 1;
        const y = pt.y + (times ? (pt.top ? -1 : 1) * times * (size + 3) : 0);
        draw(pg, t, font, size, box.x + pt.x, box.y + y);
      }

      const wm = (stamp.watermark && stamp.watermark.text || '').trim();
      if (wm) {
        const size = Math.max(10, Math.min(144, Number(stamp.watermark.size) || 48));
        const angle = Number(stamp.watermark.angle) || 0;
        const opacity = Math.max(0.05, Math.min(0.9, Number(stamp.watermark.opacity) || 0.18));
        const t = PTUtil.winAnsiSafe(wm);
        const tw = font.widthOfTextAtSize(t, size);
        const origin = PTUtil.watermarkOrigin(box.w, box.h, tw, size, angle);
        draw(pg, t, font, size, box.x + origin.x, box.y + origin.y, {
          rotate: degrees(angle), opacity, color: wmGrey,
        });
      }

      const num = PTUtil.pageIndexNumber(i, total, stamp.numbers.start, stamp.numbers.skipFirst);
      const vars = {
        date, file,
        page: num ? num.n : '',
        pages: num ? num.of : total,
      };
      if ((stamp.header || '').trim()) put('tc', PTUtil.expandTemplate(stamp.header, vars), 10);
      if ((stamp.footer || '').trim()) put('bl', PTUtil.expandTemplate(stamp.footer, vars), 10);
      if (stamp.numbers && stamp.numbers.on && num) {
        put(stamp.numbers.pos || 'bc', PTUtil.pageLabel(stamp.numbers.format || 'page-of', num.n, num.of), 10);
      }
      if (stamp.bates && stamp.bates.on) {
        const bn = PTUtil.pageIndexNumber(i, total, stamp.bates.start, stamp.bates.skipFirst);
        if (bn) put(stamp.bates.pos || 'br', PTUtil.batesLabel(stamp.bates.prefix, bn.n, stamp.bates.digits), 10);
      }

    }
  }

  async function shrinkBytes(pdfBytes, onProgress) {
    const bytesIn = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
    const pdf = await pdfjsLib.getDocument({ data: bytesIn.slice(), isEvalSupported: false }).promise;
    const out = await PDFLib.PDFDocument.create();
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        if (onProgress) onProgress(i, pdf.numPages);
        const page = await pdf.getPage(i);
        const v1 = page.getViewport({ scale: 1 });
        const scale = Math.min(120 / 72, PTUtil.RENDER_MAX / Math.max(v1.width, v1.height, 1));
        const vp = page.getViewport({ scale });
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(vp.width));
        c.height = Math.max(1, Math.ceil(vp.height));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        page.cleanup();
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.7));
        if (!blob) throw new Error('toBlob failed');
        const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        const pg = out.addPage([v1.width, v1.height]);
        pg.drawImage(img, { x: 0, y: 0, width: v1.width, height: v1.height });
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      pdf.destroy();
    }
    return out.save();
  }

  function applyMeta(out, meta) {
    meta = meta || S.meta || {};
    try {
      if (meta.title) out.setTitle(PTUtil.winAnsiSafe(meta.title));
      if (meta.author) out.setAuthor(PTUtil.winAnsiSafe(meta.author));
      if (meta.subject) out.setSubject(PTUtil.winAnsiSafe(meta.subject));
    } catch (err) {
      console.info('PDF Tools: metadata skipped:', err && err.message);
    }
  }

  async function dialog() {
    if (!S.doc) return;
    const st = ensure();
    const values = await PT.form({
      title: 'Stamp & tidy',
      text: 'These marks are added when you Save (not when you Extract or Split). Shrink redraws every page as a picture.',
      yes: 'Save',
      fields: [
        { type: 'heading', label: 'Document info' },
        { name: 'title', type: 'text', label: 'Title', value: (S.meta && S.meta.title) || '' },
        { name: 'author', type: 'text', label: 'Author', value: (S.meta && S.meta.author) || '' },
        { name: 'subject', type: 'text', label: 'Subject', value: (S.meta && S.meta.subject) || '' },
        { type: 'heading', label: 'Page numbers' },
        { name: 'numOn', type: 'check', label: 'Add page numbers', value: st.numbers.on },
        { name: 'numFormat', type: 'select', label: 'Format', value: st.numbers.format,
          options: [['1', '1'], ['page-of', 'Page 1 of N'], ['slash', '1 / N']], when: (v) => v.numOn },
        { name: 'numPos', type: 'select', label: 'Position', value: st.numbers.pos, options: PTUtil.SLOT_LABELS, when: (v) => v.numOn },
        { name: 'numStart', type: 'number', label: 'Start at', value: st.numbers.start, min: 0, step: 1, when: (v) => v.numOn },
        { name: 'numSkip', type: 'check', label: 'Skip the first page', value: st.numbers.skipFirst, when: (v) => v.numOn },
        { type: 'heading', label: 'Watermark' },
        { name: 'wm', type: 'text', label: 'Text (leave blank for none)', value: st.watermark.text, placeholder: 'CONFIDENTIAL' },
        { name: 'wmOpacity', type: 'number', label: 'Opacity (0.05–0.9)', value: st.watermark.opacity, min: 0.05, max: 0.9, step: 0.01, when: (v) => !!(v.wm && String(v.wm).trim()) },
        { name: 'wmAngle', type: 'number', label: 'Angle (degrees)', value: st.watermark.angle, min: -90, max: 90, step: 1, when: (v) => !!(v.wm && String(v.wm).trim()) },
        { name: 'wmSize', type: 'select', label: 'Size', value: String(st.watermark.size),
          options: [['18', 'Small'], ['32', 'Medium'], ['48', 'Large'], ['72', 'Extra large']], when: (v) => !!(v.wm && String(v.wm).trim()) },
        { type: 'heading', label: 'Header and footer' },
        { name: 'header', type: 'text', label: 'Header  ({date} {page} {pages} {file})', value: st.header },
        { name: 'footer', type: 'text', label: 'Footer  ({date} {page} {pages} {file})', value: st.footer },
        { type: 'heading', label: 'Bates numbers' },
        { name: 'batesOn', type: 'check', label: 'Add Bates numbers', value: st.bates.on },
        { name: 'batesPrefix', type: 'text', label: 'Prefix', value: st.bates.prefix, placeholder: 'HUB-', when: (v) => v.batesOn },
        { name: 'batesStart', type: 'number', label: 'Start at', value: st.bates.start, min: 0, step: 1, when: (v) => v.batesOn },
        { name: 'batesDigits', type: 'number', label: 'Digits', value: st.bates.digits, min: 1, max: 8, step: 1, when: (v) => v.batesOn },
        { name: 'batesPos', type: 'select', label: 'Position', value: st.bates.pos, options: PTUtil.SLOT_LABELS, when: (v) => v.batesOn },
        { name: 'batesSkip', type: 'check', label: 'Skip the first page', value: st.bates.skipFirst, when: (v) => v.batesOn },
        { type: 'heading', label: 'Shrink' },
        { name: 'shrink', type: 'check', label: 'Shrink (image) — text will no longer be selectable or searchable', value: st.shrink },
      ],
      watch: (v) => v.shrink
        ? 'Shrink draws every page as a JPEG (about 120 dpi, long side capped at 1600 px). The file may not get smaller if the pages are already pictures, and you cannot select or search the text afterwards.'
        : 'Header sits at the top centre, footer at the bottom left. If two marks share a corner, the later one moves inward.',
      validate: (v) => {
        if (v.numOn && (v.numStart == null || v.numStart < 0 || !Number.isFinite(v.numStart))) return 'Start-at for page numbers must be 0 or more.';
        if (v.batesOn && (v.batesDigits < 1 || v.batesDigits > 8)) return 'Bates digits must be between 1 and 8.';
        return null;
      },
    });
    if (!values) return;
    S.meta = { title: values.title || '', author: values.author || '', subject: values.subject || '' };
    S.stamp = {
      numbers: { on: !!values.numOn, format: values.numFormat || 'page-of', pos: values.numPos || 'bc', start: Number(values.numStart) || 1, skipFirst: !!values.numSkip },
      watermark: { text: values.wm || '', opacity: Number(values.wmOpacity) || 0.18, angle: Number(values.wmAngle), size: Number(values.wmSize) || 48 },
      header: values.header || '',
      footer: values.footer || '',
      bates: { on: !!values.batesOn, prefix: values.batesPrefix || '', start: Number(values.batesStart) || 1, digits: Number(values.batesDigits) || 4, pos: values.batesPos || 'br', skipFirst: !!values.batesSkip },
      shrink: !!values.shrink,
    };
    remember(S.stamp);
    if (S.stamp.shrink) {
      const ok = await PT.ask({
        title: 'Shrink this PDF?',
        text: 'Every page will be redrawn as a picture. Text can no longer be selected or searched, and the file may not get smaller if the pages are already pictures. This cannot be undone in the saved file (your open pages stay as they are).',
        yes: 'Shrink and save', danger: true,
      });
      if (!ok) { S.stamp.shrink = false; return; }
    }
    await PT.Edit.save();
  }

  async function cropDialog() {
    if (!S.doc) return;
    const hasSel = S.sel.size > 0;
    const sample = (hasSel ? S.pages.find((p) => S.sel.has(p.id)) : S.pages[0]) || {};
    const cur = sample.crop || { l: 0, r: 0, t: 0, b: 0 };
    const mm = (pt) => Math.round((pt / PTUtil.MM) * 10) / 10;
    const values = await PT.form({
      title: 'Crop page edges',
      text: 'Insets are in millimetres, from the edges of the page (the original page box, not after a rotate you added here). Crop is kept with the pages and you can undo it.',
      yes: 'Crop',
      fields: [
        { name: 'scope', type: 'radio', value: hasSel ? 'sel' : 'all',
          options: hasSel
            ? [['sel', 'Selected (' + S.sel.size + ')'], ['all', 'All ' + S.pages.length + ' pages']]
            : [['all', 'All ' + S.pages.length + ' pages']] },
        { name: 'l', type: 'number', label: 'Left (mm)', value: mm(cur.l || 0), min: 0, step: 0.5 },
        { name: 'r', type: 'number', label: 'Right (mm)', value: mm(cur.r || 0), min: 0, step: 0.5 },
        { name: 't', type: 'number', label: 'Top (mm)', value: mm(cur.t || 0), min: 0, step: 0.5 },
        { name: 'b', type: 'number', label: 'Bottom (mm)', value: mm(cur.b || 0), min: 0, step: 0.5 },
        { name: 'clear', type: 'check', label: 'Clear crop instead', value: false },
      ],
      validate: (v) => {
        if (v.clear) return null;
        const insets = { l: PTUtil.ptFromMm(v.l || 0), r: PTUtil.ptFromMm(v.r || 0), t: PTUtil.ptFromMm(v.t || 0), b: PTUtil.ptFromMm(v.b || 0) };
        /* check against A4 as a minimum warning only if every page fails — done in apply */
        if ((v.l || 0) < 0 || (v.r || 0) < 0 || (v.t || 0) < 0 || (v.b || 0) < 0) return 'Insets cannot be negative.';
        const probe = PTUtil.cropBox(PTUtil.PAPER.a4.w, PTUtil.PAPER.a4.h, insets);
        if (!probe.ok && (v.l + v.r > 100 || v.t + v.b > 100)) return probe.error;
        return null;
      },
    });
    if (!values) return;
    const list = values.scope === 'sel' ? S.pages.filter((p) => S.sel.has(p.id)) : S.pages;
    const ids = new Set(list.map((p) => p.id));
    if (values.clear) {
      if (list.every((p) => !p.crop)) { PT.toast('No crop to clear'); return; }
      PT.Edit.setPages(S.pages.map((p) => ids.has(p.id) ? { ...p, crop: null } : { ...p }), 'Cleared crop');
      return;
    }
    const insets = {
      l: PTUtil.ptFromMm(Number(values.l) || 0),
      r: PTUtil.ptFromMm(Number(values.r) || 0),
      t: PTUtil.ptFromMm(Number(values.t) || 0),
      b: PTUtil.ptFromMm(Number(values.b) || 0),
    };
    if (insets.l === 0 && insets.r === 0 && insets.t === 0 && insets.b === 0) {
      await PT.ask({ title: 'Nothing to crop', text: 'Enter a margin greater than 0 mm, or choose Clear crop.', no: false });
      return;
    }
    let failed = 0;
    const next = S.pages.map((p) => {
      if (!ids.has(p.id)) return { ...p };
      const src = PT.sourceOf(p);
      const size = PTUtil.displaySize(src, { ...p, rot: 0 }); /* crop is on the original page box */
      const raw = src && src.kind === 'pdf' && src.sizes && src.sizes[p.src]
        ? { w: src.sizes[p.src].w, h: src.sizes[p.src].h }
        : (src && src.kind === 'image' && src.layout ? { w: src.layout.pageW, h: src.layout.pageH } : size);
      const box = PTUtil.cropBox(raw.w, raw.h, insets);
      if (!box.ok) { failed++; return { ...p }; }
      return { ...p, crop: { l: insets.l, r: insets.r, t: insets.t, b: insets.b } };
    });
    if (failed === ids.size) {
      await PT.ask({ title: 'Crop is too large', text: 'Those insets would leave almost no page. Try smaller values.', no: false });
      return;
    }
    PT.Edit.setPages(next, 'Cropped ' + (ids.size - failed) + ((ids.size - failed) === 1 ? ' page' : ' pages') + (failed ? ' (' + failed + ' skipped)' : ''));
  }

  return { ensure, reset, defaults, decorate, shrinkBytes, applyMeta, dialog, cropDialog, visibleBox };
})();
