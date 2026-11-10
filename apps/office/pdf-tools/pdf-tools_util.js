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


  const SLOTS = ['tl', 'tc', 'tr', 'bl', 'bc', 'br'];
  const SLOT_LABELS = [['tl', 'Top left'], ['tc', 'Top centre'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['bc', 'Bottom centre'], ['br', 'Bottom right']];

  function pageIndexNumber(i, total, start, skipFirst) {
    i = Number(i); total = Number(total);
    if (!Number.isInteger(i) || i < 0 || i >= total) return null;
    if (skipFirst && i === 0) return null;
    const n = (Number.isFinite(Number(start)) ? Number(start) : 1) + i - (skipFirst ? 1 : 0);
    const of = total - (skipFirst ? 1 : 0);
    return { n, of };
  }

  function pageLabel(format, n, of) {
    if (n == null) return '';
    if (format === 'page-of') return 'Page ' + n + ' of ' + of;
    if (format === 'slash') return n + ' / ' + of;
    return String(n);
  }

  function batesLabel(prefix, n, digits) {
    digits = Number(digits);
    if (!Number.isInteger(digits)) digits = 4;
    if (digits < 1) digits = 1;
    if (digits > 8) digits = 8;
    return String(prefix || '') + pad(n, digits);
  }

  /* insets {l,r,t,b} in points, from the visible box (existing or full page). y from bottom. */
  function cropBox(pageW, pageH, insets, existing) {
    const base = existing && existing.w > 0 && existing.h > 0
      ? { x: existing.x, y: existing.y, w: existing.w, h: existing.h }
      : { x: 0, y: 0, w: pageW, h: pageH };
    const l = Math.max(0, Number(insets && insets.l) || 0);
    const r = Math.max(0, Number(insets && insets.r) || 0);
    const top = Math.max(0, Number(insets && insets.t) || 0);
    const b = Math.max(0, Number(insets && insets.b) || 0);
    const x = base.x + l;
    const y = base.y + b;
    const w = base.w - l - r;
    const h = base.h - top - b;
    if (w < 8 || h < 8) return { ok: false, error: 'Crop is too large — there would be almost no page left.' };
    return { ok: true, x, y, w, h };
  }

  function slotPoint(pageW, pageH, slot, textW, fontSize, margin) {
    margin = margin == null ? 36 : margin;
    fontSize = fontSize || 10;
    textW = textW || 0;
    const top = /t/.test(slot || '');
    const y = top ? pageH - margin - fontSize : margin;
    let x;
    if ((slot || '').indexOf('l') >= 0) x = margin;
    else if ((slot || '').indexOf('r') >= 0) x = pageW - margin - textW;
    else x = (pageW - textW) / 2;
    return { x, y, top };
  }

  /* Origin so a string of size textW×textH, rotated by angleDeg about that origin, is centred on the page. */
  function watermarkOrigin(pageW, pageH, textW, textH, angleDeg) {
    const rad = ((Number(angleDeg) || 0) * Math.PI) / 180;
    const cx = pageW / 2, cy = pageH / 2;
    const dx = (textW || 0) / 2, dy = (textH || 0) / 2;
    return {
      x: cx - dx * Math.cos(rad) + dy * Math.sin(rad),
      y: cy - dx * Math.sin(rad) - dy * Math.cos(rad),
    };
  }

  function formatDate(d) {
    d = d || new Date();
    return pad(d.getDate(), 2) + '/' + pad(d.getMonth() + 1, 2) + '/' + d.getFullYear();
  }

  function expandTemplate(text, vars) {
    vars = vars || {};
    return String(text == null ? '' : text).replace(/\{(date|page|pages|file)\}/gi, (m, k) => {
      const v = vars[k.toLowerCase()];
      return v == null ? '' : String(v);
    });
  }

  /* Characters Helvetica (WinAnsi) cannot draw, replaced with '?'. */
  function winAnsiSafe(text) {
    return String(text == null ? '' : text).replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, '?');
  }

  return {
    COLORS, PAPER, colorFor, fileBase, shortName, pad, isContiguous, partName,
    parseRanges, planSingles, planEvery, planHint, displaySize, neighbourSize,
    sourceOf, pageKey, MM, ptFromMm, RENDER_MAX, imagePageLayout, isImageFile, imageMime, imagePartName, renderScale,
    SLOTS, SLOT_LABELS, pageIndexNumber, pageLabel, batesLabel, cropBox, slotPoint, watermarkOrigin, formatDate, expandTemplate, winAnsiSafe,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PTUtil;
