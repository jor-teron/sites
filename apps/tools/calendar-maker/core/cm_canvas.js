/* Calendar Maker CM13 core: page sizes and canvas drawing helpers shared by the sheet and both list layouts.
   window.CM.Canvas. Sheet size: 210 x 297 mm at 250 dpi = 2067 x 2923 px (scale 1 = one sheet pixel). */
window.CM = window.CM || {};
window.CM.Canvas = (function () {
  'use strict';
  const T = window.CM.Theme;
  /* CM4: sheet size depends on the layout; W / H are the portrait defaults (kept for callers) */
  const W = 2067, H = 2923, PX_MM = W / 210;
  /* const W = 2067, H = 2923, PX_MM = W / 210;  (CM1-CM3: fixed portrait) */
  const LAYOUTS = {
    p3: { land: false, cols: 3, rows: 4 }, p2: { land: false, cols: 2, rows: 6 },
    l3: { land: true, cols: 3, rows: 4 }, l4: { land: true, cols: 4, rows: 3 }
  };
  const layoutOf = (k) => LAYOUTS[k] || LAYOUTS.p3;
  /* page margin: CM1-CM4 ~7 mm, CM5+ ~4 mm (printer safe minimum) */
  const margin = () => Math.round(4 * PX_MM);
  /* positions snapped to whole pixels so lines stay crisp at print resolution (CM7) */
  const sn = (v) => Math.round(v);
  const font = (weight, px) => weight + ' ' + px + 'px ' + T.FONT;

  /* rounded rectangle path */
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  /* filled cell rectangle (holiday tile, legend swatch) */
  function cell(c, colour, x, y, w, h) { c.fillStyle = colour; c.beginPath(); c.rect(x, y, w, h); c.fill(); }
  /* Excel 'All Borders': segments [x0, y0, x1, y1] in one path, then the outer box; every line #333, one weight.
     restyle = set the style again before the box (the sheet does, the lists do not; kept for identical output). */
  function borders(c, segs, box, restyle) {
    c.strokeStyle = T.GRID.colour; c.lineWidth = T.GRID.width; c.beginPath();
    segs.forEach(([x0, y0, x1, y1]) => { c.moveTo(sn(x0), sn(y0)); c.lineTo(sn(x1), sn(y1)); });
    c.stroke();
    if (restyle) { c.strokeStyle = T.GRID.colour; c.lineWidth = T.GRID.width; }
    const [x0, y0, x1, y1] = box;
    c.strokeRect(sn(x0), sn(y0), sn(x1) - sn(x0), sn(y1) - sn(y0));
  }
  /* text fit: shrink the font by 4 px steps until text() fits maxW or the size reaches min; returns the size */
  function fitFont(c, weight, fs, min, maxW, text) {
    c.font = font(weight, fs);
    while (fs > min && c.measureText(text()).width > maxW) { fs -= 4; c.font = font(weight, fs); }
    return fs;
  }
  /* one-line text cut to max width with an ellipsis (current font) */
  function ellipsis(c, text, max) {
    let s = text;
    while (c.measureText(s).width > max && s.length > 4) s = s.slice(0, -2);
    if (s !== text) s = s.replace(/\s*\S?$/, '') + '…';
    return s;
  }
  /* word wrap: plain text -> lines (current font) */
  function wrap(c, text, max) {
    const ws = String(text).split(/\s+/).filter(Boolean), out = [];
    let cur = '';
    ws.forEach((w) => {
      const t = cur ? cur + ' ' + w : w;
      if (cur && c.measureText(t).width > max) { out.push(cur); cur = w; } else cur = t;
    });
    if (cur || !out.length) out.push(cur);
    return out;
  }
  /* superscript tokens {b: base, s: superscript, a: after}; width = base + small suffix + after */
  function tokW(c, k, fs) {
    c.font = font('400', fs); let w = c.measureText(k.b + (k.a || '')).width;
    if (k.s) { c.font = font('400', Math.round(fs * 0.6)); w += c.measureText(k.s).width; }
    return w;
  }
  /* token wrap: lines of tokens */
  function wrapTok(c, toks, max, fs) {
    c.font = font('400', fs); const sp = c.measureText(' ').width || fs * 0.3;
    const out = []; let cur = [], w = 0;
    toks.forEach((k) => {
      const kw = tokW(c, k, fs);
      if (cur.length && w + sp + kw > max) { out.push(cur); cur = []; w = 0; }
      w += (cur.length ? sp : 0) + kw; cur.push(k);
    });
    if (cur.length || !out.length) out.push(cur);
    return out;
  }
  /* one token line centred on cx, superscript raised by 0.3 em */
  function drawTokLine(c, line, cx, y, fs, fc) {
    c.font = font('400', fs); const sp = c.measureText(' ').width || fs * 0.3;
    let w = 0; line.forEach((k, i) => { w += (i ? sp : 0) + tokW(c, k, fs); });
    let x = cx - w / 2; c.textAlign = 'left'; c.fillStyle = fc;
    line.forEach((k, i) => {
      if (i) x += sp;
      c.font = font('400', fs); c.fillText(k.b, x, y); x += c.measureText(k.b).width;
      if (k.s) {
        const ss = Math.round(fs * 0.6); c.font = font('400', ss);
        c.fillText(k.s, x, y - fs * 0.3); x += c.measureText(k.s).width;
      }
      if (k.a) { c.font = font('400', fs); c.fillText(k.a, x, y); x += c.measureText(k.a).width; }
    });
  }
  /* underline under centred text (current font and fill) */
  function underline(c, txt, cxm, by, fs) {
    const w = c.measureText(txt).width;
    c.fillRect(Math.round(cxm - w / 2), Math.round(by + fs * 0.1), Math.round(w), Math.max(2, Math.round(fs * 0.06)));
  }

  return {
    W, H, PX_MM, LAYOUTS, layoutOf, margin, sn, font, rr, cell, borders, fitFont, ellipsis,
    wrap, tokW, wrapTok, drawTokLine, underline
  };
})();
