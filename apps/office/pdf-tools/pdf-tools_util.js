/*
 * PDF Tools — pure helpers (range parser, split plans, names, sizes).
 * No DOM. Safe to load from Node: `node test_pdf_tools_util.js`.
 */
const PTUtil = (() => {
  const COLORS = ['#2f6fe4', '#e67e22', '#27ae60', '#8e44ad', '#c0392b', '#16a085', '#2980b9', '#d35400'];
  const PAPER = {
    a4: { w: 595.28, h: 841.89 },
    letter: { w: 612, h: 792 },
  };

  const colorFor = (i) => COLORS[((i % COLORS.length) + COLORS.length) % COLORS.length];

  function fileBase(name) {
    return (String(name || 'document').replace(/\.(pdf|png|jpe?g)$/i, '').replace(/[/\\?%*:|"<>]/g, '').trim() || 'document');
  }

  function shortName(name, max) {
    const b = fileBase(name);
    const n = max || 10;
    return b.length > n ? b.slice(0, n - 1) + '\u2026' : b;
  }

  function pad(n, width) {
    let s = String(n);
    width = width || 3;
    while (s.length < width) s = '0' + s;
    return s;
  }

  function isContiguous(group) {
    for (let i = 1; i < group.length; i++) if (group[i] !== group[i - 1] + 1) return false;
    return true;
  }

  /* File name for one split part. group is 1-based page numbers in that file. */
  function partName(base, group, index) {
    const b = fileBase(base);
    if (!group || !group.length) return b + '-part' + pad((index || 0) + 1, 2) + '.pdf';
    const width = group[group.length - 1] >= 1000 || group[0] >= 1000 ? 4 : 3;
    if (group.length === 1) return b + '-p' + pad(group[0], width) + '.pdf';
    if (isContiguous(group)) return b + '-p' + pad(group[0], width) + '-' + pad(group[group.length - 1], width) + '.pdf';
    return b + '-part' + pad((index || 0) + 1, 2) + '.pdf';
  }

  /*
   * Parse "1-3, 7" into groups of 1-based page numbers.
   * "3-1" is read as 1-3. Commas or semicolons separate files.
   */
  function parseRanges(text, pageCount) {
    if (!pageCount || pageCount < 1) return { ok: false, error: 'No pages to split.' };
    const raw = String(text || '').trim();
    if (!raw) return { ok: false, error: 'Type a range such as 1-3, 7.' };
    const parts = raw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return { ok: false, error: 'Type a range such as 1-3, 7.' };
    const groups = [];
    for (let p = 0; p < parts.length; p++) {
      const part = parts[p];
      let a, b;
      if (/^\d+$/.test(part)) {
        a = b = +part;
      } else {
        const m = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
        if (!m) return { ok: false, error: 'Can\'t read "' + part + '". Try 1-3 or 7.' };
        a = +m[1];
        b = +m[2];
        if (a > b) { const t = a; a = b; b = t; }
      }
      if (a < 1 || b > pageCount) {
        return { ok: false, error: 'Page ' + (a < 1 ? a : b) + ' is outside 1\u2013' + pageCount + '.' };
      }
      const g = [];
      for (let i = a; i <= b; i++) g.push(i);
      groups.push(g);
    }
    return { ok: true, groups };
  }

  function planSingles(pageCount) {
    if (!pageCount || pageCount < 1) return { ok: false, error: 'No pages to split.' };
    const groups = [];
    for (let i = 1; i <= pageCount; i++) groups.push([i]);
    return { ok: true, groups };
  }

  function planEvery(pageCount, n) {
    n = Number(n);
    if (!Number.isInteger(n) || n < 1) return { ok: false, error: 'Enter a whole number of 1 or more.' };
    if (!pageCount || pageCount < 1) return { ok: false, error: 'No pages to split.' };
    const groups = [];
    for (let i = 1; i <= pageCount; i += n) {
      const g = [];
      for (let j = i; j < i + n && j <= pageCount; j++) g.push(j);
      groups.push(g);
    }
    return { ok: true, groups };
  }

  function planHint(groups) {
    if (!groups || !groups.length) return '';
    if (groups.length === 1) {
      const g = groups[0];
      return 'Will save 1 file (' + g.length + (g.length === 1 ? ' page).' : ' pages).');
    }
    return 'Will save ' + groups.length + ' files as a .zip.';
  }

  /* Display size in PDF points, after built-in and extra rotation. */
  function displaySize(source, page) {
    let w, h, base = 0;
    if (!source) return { w: PAPER.a4.w, h: PAPER.a4.h };
    if (source.kind === 'image' && source.layout) {
      w = source.layout.pageW;
      h = source.layout.pageH;
    } else if (source.kind === 'blank' || source.kind === 'image') {
      w = source.width || PAPER.a4.w;
      h = source.height || PAPER.a4.h;
    } else {
      const s = (source.sizes && source.sizes[page && page.src != null ? page.src : 0]) || PAPER.a4;
      w = s.w;
      h = s.h;
      base = s.baseRot || 0;
    }
    const rot = (((base + (page && page.rot || 0)) % 360) + 360) % 360;
    if (rot === 90 || rot === 270) return { w: h, h: w };
    return { w, h };
  }

  function neighbourSize(sources, pages, at) {
    const list = pages || [];
    const srcOf = (p) => (sources || []).find((s) => s.id === p.srcId);
    const idx = at == null || at < 0 ? list.length : at;
    const neighbour = list[Math.min(idx, list.length - 1)] || list[idx - 1] || list[0];
    if (!neighbour) return { w: PAPER.a4.w, h: PAPER.a4.h };
    return displaySize(srcOf(neighbour), neighbour);
  }

  function sourceOf(sources, page) {
    if (!page) return null;
    return (sources || []).find((s) => s.id === page.srcId) || null;
  }

  function pageKey(page) {
    return page.srcId + ':' + page.src;
  }


  const MM = 72 / 25.4; /* 1 mm in PDF points */
  const ptFromMm = (n) => Number(n) * MM;
  const RENDER_MAX = 1600; /* long-side cap for preview / image export (Celeron-safe) */

  /*
   * Place an image on a page. imgW/imgH are pixel size.
   * opts: { paper: 'a4'|'letter'|'fit', marginMm, landscape, dpi }
   * Returns { pageW, pageH, x, y, w, h, margin } in points, y from the bottom-left.
   * The image is contained and centred; aspect ratio is kept.
   */
  function imagePageLayout(imgW, imgH, opts) {
    opts = opts || {};
    imgW = Number(imgW) || 1;
    imgH = Number(imgH) || 1;
    if (imgW < 1) imgW = 1;
    if (imgH < 1) imgH = 1;
    const margin = Math.max(0, ptFromMm(opts.marginMm || 0));
    let pageW, pageH;
    if (opts.paper === 'fit') {
      const dpi = Number(opts.dpi) > 0 ? Number(opts.dpi) : 150;
      let w = imgW * 72 / dpi + 2 * margin;
      let h = imgH * 72 / dpi + 2 * margin;
      const cap = 1440; /* 20 in */
      const s = Math.min(1, cap / Math.max(w, h));
      pageW = w * s;
      pageH = h * s;
    } else {
      const paper = PAPER[opts.paper] || PAPER.a4;
      pageW = paper.w;
      pageH = paper.h;
      if (opts.landscape) { const tmp = pageW; pageW = pageH; pageH = tmp; }
    }
    const innerW = Math.max(1, pageW - 2 * margin);
    const innerH = Math.max(1, pageH - 2 * margin);
    const scale = Math.min(innerW / imgW, innerH / imgH);
    const w = imgW * scale;
    const h = imgH * scale;
    return { pageW, pageH, x: (pageW - w) / 2, y: (pageH - h) / 2, w, h, margin };
  }

  function isImageFile(file) {
    const n = (file && (file.name || '')) + '';
    const t = (file && (file.type || '')) + '';
    return /image\/(jpeg|jpg|png)/i.test(t) || /\.(png|jpe?g)$/i.test(n);
  }

  function imageMime(file) {
    const t = (file && file.type || '').toLowerCase();
    const n = (file && file.name || '').toLowerCase();
    if (t === 'image/png' || n.endsWith('.png')) return 'image/png';
    if (t === 'image/jpeg' || t === 'image/jpg' || /\.jpe?g$/.test(n)) return 'image/jpeg';
    return '';
  }

  function imagePartName(base, index1, ext, width) {
    width = width || 3;
    return fileBase(base) + '-p' + pad(index1, width) + '.' + String(ext || 'png').replace(/^\./, '');
  }

  function renderScale(pageW, pageH, max) {
    max = max || RENDER_MAX;
    const long = Math.max(pageW, pageH, 1);
    return Math.min(max / long, 4);
  }

  return {
    COLORS, PAPER, colorFor, fileBase, shortName, pad, isContiguous, partName,
    parseRanges, planSingles, planEvery, planHint, displaySize, neighbourSize,
    sourceOf, pageKey, MM, ptFromMm, RENDER_MAX, imagePageLayout, isImageFile, imageMime, imagePartName, renderScale,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PTUtil;
