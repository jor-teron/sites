/*
 * PDF Tools P3 — add JPG/PNG as pages, export pages as images, zoomed page preview.
 * Layout maths live in PTUtil.imagePageLayout. All downloads go through PTSave.save.
 */
PT.Images = (() => {
  const { S } = PT;
  const MAX = PTUtil.RENDER_MAX;

  function remember(extra) {
    Object.assign(PT.P, extra);
    try { localStorage.setItem('pdf-tools-settings-v1', JSON.stringify(PT.P)); } catch (_) { /* private mode */ }
  }

  async function layoutDialog(n) {
    const values = await PT.form({
      title: n === 1 ? 'Add image as a page' : 'Add ' + n + ' images as pages',
      text: 'Each image becomes its own page. The picture is centred and kept in proportion.',
      yes: 'Add',
      fields: [
        { name: 'paper', type: 'select', label: 'Page size', value: PT.P.paper || 'a4',
          options: [['a4', 'A4'], ['letter', 'Letter'], ['fit', 'Fit to image']] },
        { name: 'landscape', type: 'select', label: 'Orientation', value: PT.P.landscape ? '1' : '0',
          options: [['0', 'Portrait'], ['1', 'Landscape']], when: (v) => v.paper !== 'fit' },
        { name: 'marginMm', type: 'select', label: 'Margins', value: String(PT.P.marginMm != null ? PT.P.marginMm : 10),
          options: [['0', 'None'], ['10', '10 mm'], ['20', '20 mm']] },
      ],
    });
    if (!values) return null;
    const opts = {
      paper: values.paper || 'a4',
      landscape: values.paper !== 'fit' && values.landscape === '1',
      marginMm: Number(values.marginMm) || 0,
    };
    remember({ paper: opts.paper, landscape: opts.landscape, marginMm: opts.marginMm });
    return opts;
  }

  function loadBitmap(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('bad image'));
      img.src = url;
    });
  }

  async function readImage(file) {
    const mime = PTUtil.imageMime(file);
    if (!mime) throw new Error('not an image');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadBitmap(url);
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h) throw new Error('empty image');
      return { bytes, mime, name: file.name || (mime === 'image/png' ? 'image.png' : 'image.jpg'), w, h, url };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []).filter(PTUtil.isImageFile);
    if (!files.length) {
      await PT.ask({ title: 'No images found', text: 'Please choose JPG or PNG files.', no: false });
      return;
    }
    const opts = await layoutDialog(files.length);
    if (!opts) return;
    const loaded = [];
    const errors = [];
    for (let i = 0; i < files.length; i++) {
      PT.busy((files.length > 1 ? (i + 1) + ' of ' + files.length + ': ' : '') + 'Reading ' + files[i].name + '…');
      try {
        loaded.push(await readImage(files[i]));
      } catch (err) {
        console.info('PDF Tools: image failed:', err && err.message);
        errors.push(files[i].name);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    PT.busy(null);
    if (!loaded.length) {
      await PT.ask({ title: 'Couldn\'t read those images', text: (errors.join(', ') || 'The files') + ' could not be opened. Use a JPG or PNG.', no: false });
      return;
    }
    const pages = [];
    loaded.forEach((im, i) => {
      const layout = PTUtil.imagePageLayout(im.w, im.h, opts);
      const src = {
        id: S.nextSrc++,
        kind: 'image',
        name: im.name,
        color: PTUtil.colorFor(S.nextSrc - 2),
        bytes: im.bytes,
        mime: im.mime,
        width: im.w,
        height: im.h,
        layout,
        thumb: im.url,
      };
      S.sources.push(src);
      pages.push({ id: S.nextId++, srcId: src.id, src: 0, rot: 0 });
    });
    const started = !S.doc;
    if (started) {
      S.doc = { name: PTUtil.fileBase(loaded[0].name) + '.pdf' };
      S.sel.clear(); S.anchor = null;
      PT.Edit.reset();
    }
    const n = pages.length;
    if (started) {
      S.pages = pages;
      PT.emit('opened');
      PT.refresh();
      PT.toast('Added ' + n + (n === 1 ? ' page' : ' pages') + ' from ' + (n === 1 ? 'an image' : n + ' images'));
      /* mark dirty: a fresh session of images is unsaved */
      PT.Edit.touch();
    } else {
      PT.Edit.append(pages, 'Added ' + n + (n === 1 ? ' page' : ' pages') + ' from ' + (n === 1 ? 'an image' : n + ' images'));
    }
    if (errors.length) {
      await PT.ask({ title: 'Some images couldn\'t be added', text: errors.join(', ') + '.\nUse a JPG or PNG.', no: false });
    }
  }

  function pick() {
    PT.menu(false);
    const f = PT.$('file-images');
    f.value = '';
    f.click();
  }

  /* Draw one page to a canvas (white paper + content). Long side capped. */
  async function renderPage(page, max) {
    max = max || MAX;
    const src = PT.sourceOf(page);
    const size = PTUtil.displaySize(src, page);
    const scale = PTUtil.renderScale(size.w, size.h, max);
    const w = Math.max(1, Math.round(size.w * scale));
    const h = Math.max(1, Math.round(size.h * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    if (!src || src.kind === 'blank') return c;
    if (src.kind === 'image') {
      const url = src.thumb || PT.Thumbs.url(page);
      const img = await loadBitmap(url);
      const L = src.layout;
      const rot = (((page.rot || 0) % 360) + 360) % 360;
      ctx.save();
      if (rot) {
        ctx.translate(w / 2, h / 2);
        ctx.rotate(rot * Math.PI / 180);
        /* unrotated page size in canvas pixels */
        const uw = Math.max(1, Math.round((L ? L.pageW : size.w) * scale));
        const uh = Math.max(1, Math.round((L ? L.pageH : size.h) * scale));
        ctx.translate(-uw / 2, -uh / 2);
        if (L) ctx.drawImage(img, L.x * scale, (L.pageH - L.y - L.h) * scale, L.w * scale, L.h * scale);
        else ctx.drawImage(img, 0, 0, uw, uh);
      } else if (L) {
        /* layout y is from the bottom; canvas y is from the top */
        ctx.drawImage(img, L.x * scale, (L.pageH - L.y - L.h) * scale, L.w * scale, L.h * scale);
      } else {
        ctx.drawImage(img, 0, 0, w, h);
      }
      ctx.restore();
      return c;
    }
    /* PDF page via pdf.js */
    const pdfPage = await src.pdf.getPage(page.src + 1);
    const base = pdfPage.rotate || 0;
    const rotation = (((base + (page.rot || 0)) % 360) + 360) % 360;
    const v1 = pdfPage.getViewport({ scale: 1, rotation });
    const vp = pdfPage.getViewport({ scale: Math.min(w / v1.width, h / v1.height), rotation });
    c.width = Math.ceil(vp.width);
    c.height = Math.ceil(vp.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    await pdfPage.render({ canvasContext: ctx, viewport: vp }).promise;
    pdfPage.cleanup();
    return c;
  }

  async function exportPages() {
    if (!S.doc || !S.pages.length) return;
    const hasSel = S.sel.size > 0;
    const values = await PT.form({
      title: 'Export as images',
      text: 'Each page is drawn at up to ' + MAX + ' px on the long side.',
      yes: 'Export',
      fields: [
        { name: 'fmt', type: 'radio', value: PT.P.exportFmt || 'png', options: [['png', 'PNG'], ['jpg', 'JPG']] },
        { name: 'scope', type: 'radio', value: hasSel ? 'sel' : 'all',
          options: hasSel
            ? [['sel', 'Selected (' + S.sel.size + ')'], ['all', 'All ' + S.pages.length + ' pages']]
            : [['all', 'All ' + S.pages.length + ' pages']] },
      ],
    });
    if (!values) return;
    remember({ exportFmt: values.fmt });
    const list = values.scope === 'sel' ? S.pages.filter((p) => S.sel.has(p.id)) : S.pages.slice();
    if (!list.length) return;
    const ext = values.fmt === 'jpg' ? 'jpg' : 'png';
    const mime = ext === 'jpg' ? 'image/jpeg' : 'image/png';
    const quality = 0.85;
    const base = PTUtil.fileBase(S.doc.name);
    PT.busy('Exporting…');
    try {
      const files = [];
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const idx = S.pages.indexOf(p) + 1;
        PT.busy('Exporting ' + (i + 1) + ' of ' + list.length + '…');
        const canvas = await renderPage(p, MAX);
        const blob = await new Promise((r) => canvas.toBlob(r, mime, quality));
        if (!blob) throw new Error('toBlob failed');
        files.push({ name: PTUtil.imagePartName(base, idx, ext), data: new Uint8Array(await blob.arrayBuffer()) });
        await new Promise((r) => setTimeout(r, 0));
      }
      if (files.length === 1) {
        const name = await PTSave.save(new Blob([files[0].data], { type: mime }), files[0].name);
        PT.toast('Saved ' + name);
      } else {
        const name = await PTSave.save(PTZip.build(files), base + '-pages.zip');
        PT.toast('Saved ' + name);
      }
    } catch (err) {
      console.info('PDF Tools: export failed:', err && err.message);
      await PT.ask({ title: 'Couldn\'t export', text: 'Something went wrong while drawing the pages. Try fewer pages, or a smaller file.', no: false });
    } finally { PT.busy(null); }
  }

  let openId = null;
  function isOpen() { return openId != null; }

  function close() {
    openId = null;
    const box = PT.$('preview');
    if (!box) return;
    box.hidden = true;
    const stage = PT.$('preview-stage');
    if (stage) stage.replaceChildren();
  }

  async function preview(id) {
    const page = S.pages.find((p) => p.id === id);
    if (!page) return;
    const box = PT.$('preview');
    const stage = PT.$('preview-stage');
    const cap = PT.$('preview-cap');
    if (!box) return;
    openId = id;
    box.hidden = false;
    stage.replaceChildren();
    const i = S.pages.indexOf(page) + 1;
    cap.textContent = 'Page ' + i + ' of ' + S.pages.length + ' — opening…';
    try {
      const canvas = await renderPage(page, MAX);
      if (openId !== id) return;
      canvas.setAttribute('alt', 'Page ' + i);
      stage.replaceChildren(canvas);
      cap.textContent = 'Page ' + i + ' of ' + S.pages.length;
    } catch (err) {
      if (openId !== id) return;
      cap.textContent = 'Couldn\'t open this page.';
      console.info('PDF Tools: preview failed:', err && err.message);
    }
  }

  function init() {
    const f = PT.$('file-images');
    if (f) f.addEventListener('change', () => addFiles(f.files));
    const closeBtn = PT.$('preview-close');
    if (closeBtn) closeBtn.addEventListener('click', close);
    const box = PT.$('preview');
    if (box) box.addEventListener('click', (e) => { if (e.target === box) close(); });
  }

  return { init, addFiles, pick, exportPages, preview, close, isOpen, renderPage };
})();
