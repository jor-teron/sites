/* Calendar Maker renderer (CM1): draws the whole A4 portrait sheet (all 12 months, 3 x 4) on a canvas.
   The same drawing is used for the on-screen preview, Print (as an image) and the PDF (CM2), so all three match.
   window.CMRender.draw(canvas, o) with o = { year, week:'sun'|'mon', colour, sundays, sat:'none'|'24'|'all',
     hols:[{m,d,name}], fold (CM5, default true), bg:{type:'none'|'soft'|'pic', colour, img, faint} (CM2), strip (CM2) }
   Sheet size: 210 x 297 mm at 250 dpi = 2067 x 2923 px (scale 1 = one sheet pixel). */
window.CMRender = (function () {
  'use strict';
  /* CM4: sheet size depends on the layout; W / H below are the portrait defaults (kept for callers) */
  const W = 2067, H = 2923, PX_MM = W / 210;
  /* const W = 2067, H = 2923, PX_MM = W / 210;  (CM1-CM3: fixed portrait) */
  const LAYOUTS = { p3: { land: false, cols: 3, rows: 4 }, p2: { land: false, cols: 2, rows: 6 },
    l3: { land: true, cols: 3, rows: 4 }, l4: { land: true, cols: 4, rows: 3 } };
  const layoutOf = (k) => LAYOUTS[k] || LAYOUTS.p3;
  const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const COLOURS = { green: ['#15803d', '#fff'], red: ['#b91c1c', '#fff'], yellow: ['#facc15', '#111'], blue: ['#1d4ed8', '#fff'], orange: ['#ea580c', '#fff'] };
  const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
  const dim = (y, m) => new Date(y, m + 1, 0).getDate();
  const dow = (y, m, d) => new Date(y, m, d).getDay();

  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  /* sorted, de-duplicated holiday list for the strip: [{m,d,name}] */
  function stripRows(hols) {
    const map = {};
    hols.forEach((h) => { const k = h.m * 100 + h.d; map[k] = map[k] ? map[k] + ' / ' + h.name : h.name; });
    return Object.keys(map).map(Number).sort((a, b) => a - b).map((k) => ({ m: Math.floor(k / 100), d: k % 100, name: map[k] }));
  }

  function draw(cv, o) {
    const L = layoutOf(o.layout);
    const W = L.land ? 2923 : 2067, H = L.land ? 2067 : 2923; /* CM4 */
    /* cv.width = W; cv.height = H;  (CM1-CM3) */
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const y = o.year, f = o.week === 'mon' ? 1 : 0;
    const col = COLOURS[o.colour] || COLOURS.green;
    const hol = {}; (o.hols || []).forEach((h) => { hol[h.m * 100 + h.d] = true; });
    const isHol = (m, d) => {
      const wd = dow(y, m, d);
      if (wd === 0 && o.sundays !== false) return true;
      if (wd === 6 && (o.sat === 'all' || (o.sat === '24' && ((d >= 8 && d <= 14) || (d >= 22 && d <= 28))))) return true;
      return !!hol[m * 100 + d];
    };
    /* page + background (CM2) */
    const bg = o.bg || { type: 'none' };
    c.fillStyle = bg.type === 'soft' ? (bg.colour || '#fff') : '#fff';
    c.fillRect(0, 0, W, H);
    if (bg.type === 'pic' && bg.img) {
      const s = Math.max(W / bg.img.width, H / bg.img.height), iw = bg.img.width * s, ih = bg.img.height * s;
      c.globalAlpha = Math.max(0.05, Math.min(1, bg.faint == null ? 0.25 : bg.faint));
      c.drawImage(bg.img, (W - iw) / 2, (H - ih) / 2, iw, ih);
      c.globalAlpha = 1;
    }
    /* const M = Math.round(7 * PX_MM);  (CM1-CM4: ~7 mm page margin) */
    const M = Math.round(4 * PX_MM); /* CM5: ~4 mm, printer safe minimum */
    /* title */
    c.fillStyle = '#111'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '800 150px ' + FONT;
    /* c.fillText('YEAR ' + y, W / 2, M + 85);  (CM1-CM3 title) */
    /* c.fillText(String(y), W / 2, M + 85); let top = M + 200;  (CM4: 150px title, 200px band) */
    c.font = '800 120px ' + FONT; /* CM5: slimmer title band */
    c.fillText(String(y), W / 2, M + 62); /* CM4: title is just YYYY */
    let top = M + 130;
    /* holiday list strip (CM2) */
    let stripH = 0, rows = [];
    if (o.strip) {
      rows = stripRows(o.hols || []);
      const per = Math.ceil(rows.length / 3);
      /* stripH = rows.length ? 70 + per * 40 : 0;  (CM2-CM4) */
      stripH = rows.length ? 60 + per * 40 : 0; /* CM5: only the height it needs */
    }
    /* const gx = 34, gy = 30, cols = 3, rowsN = 4;  (CM1-CM3) */
    /* const gx = 34, gy = 30, cols = L.cols, rowsN = L.rows;  (CM4) */
    const gx = Math.round(2.5 * PX_MM), gy = Math.round(2.5 * PX_MM), cols = L.cols, rowsN = L.rows; /* CM5: ~2.5 mm gaps */
    const fold = o.fold !== false; /* CM5: fold 6th week into first row (default on) */
    const mw = (W - 2 * M - gx * (cols - 1)) / cols;
    const mh = (H - top - M - stripH - gy * (rowsN - 1)) / rowsN;
    const card = bg.type === 'pic' && bg.img;
    for (let m = 0; m < 12; m++) {
      const x0 = M + (m % cols) * (mw + gx), y0 = top + Math.floor(m / cols) * (mh + gy);
      if (card) { c.fillStyle = 'rgba(255,255,255,.82)'; rr(c, x0 - 8, y0 - 6, mw + 16, mh + 12, 18); c.fill(); }
      /* CM4: each month is its own bordered grid table (month name above, weekday header row, 6 week rows) */
      const nameH = Math.min(70, mh * 0.16), nfs = Math.round(Math.min(52, nameH * 0.75));
      c.fillStyle = '#111'; c.textAlign = 'left'; c.font = '700 ' + nfs + 'px ' + FONT;
      c.fillText(MN[m], x0 + 6, y0 + nameH / 2);
      const lead = (dow(y, m, 1) - f + 7) % 7, n = dim(y, m);
      const wkN = fold ? 5 : 6; /* CM5: 5 rows when folding, else 6 */
      /* const cw = mw / 7, gt = y0 + nameH, wh = Math.min(44, (mh - nameH) * 0.12), ch = (mh - nameH - wh) / 6;  (CM4) */
      const cw = mw / 7, gt = y0 + nameH, wh = Math.min(44, (mh - nameH) * 0.12), ch = (mh - nameH - wh) / wkN;
      c.font = '700 ' + Math.round(Math.min(30, wh * 0.7)) + 'px ' + FONT; c.textAlign = 'center';
      c.fillStyle = '#f1f1f1'; c.fillRect(x0, gt, mw, wh);
      for (let i = 0; i < 7; i++) { c.fillStyle = '#444'; c.fillText(WD[(i + f) % 7], x0 + cw * i + cw / 2, gt + wh / 2); }
      /* const lead = ..., n = ...;  (CM4: moved up in CM5) */
      /* const fs = Math.min(ch * 0.62, cw * 0.55);  (CM4) */
      const fs = Math.min(ch * 0.66, cw * 0.58); /* CM5: dates fill the bigger cells */
      c.font = '700 ' + Math.round(fs) + 'px ' + FONT;
      for (let d = 1; d <= n; d++) {
        const p = lead + d - 1;
        if (fold && p >= 35) { /* CM5: folded date -> empty leading cell of row 1, same weekday column */
          const fx = x0 + ((p - 35) % 7) * cw, fy = gt + wh, h = isHol(m, d);
          if (h) { c.fillStyle = col[0]; c.beginPath(); c.moveTo(fx + cw - 1, fy + 1); c.lineTo(fx + cw - 1, fy + ch - 1); c.lineTo(fx + 1, fy + ch - 1); c.closePath(); c.fill(); }
          c.strokeStyle = '#888'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(fx + cw, fy); c.lineTo(fx, fy + ch); c.stroke();
          c.font = '700 ' + Math.round(fs * 0.6) + 'px ' + FONT;
          c.fillStyle = h ? col[1] : '#111';
          c.fillText(String(d), fx + cw * 0.7, fy + ch * 0.7);
          c.font = '700 ' + Math.round(fs) + 'px ' + FONT;
          continue;
        }
        const cx = x0 + (p % 7) * cw, cy = gt + wh + Math.floor(p / 7) * ch;
        const h = isHol(m, d);
        if (h) { c.fillStyle = col[0]; c.beginPath(); c.rect(cx + 1, cy + 1, cw - 2, ch - 2); c.fill(); } /* tile fills its cell */
        c.fillStyle = h ? col[1] : '#111';
        c.fillText(String(d), cx + cw / 2, cy + ch / 2 + 2);
      }
      /* grid lines: inner lines thin, outer border a bit thicker (every cell, incl. empty ones) */
      c.strokeStyle = '#888'; c.lineWidth = 1.5; c.beginPath();
      for (let i = 1; i < 7; i++) { c.moveTo(x0 + cw * i, gt); c.lineTo(x0 + cw * i, gt + wh + wkN * ch); }
      c.moveTo(x0, gt + wh); c.lineTo(x0 + mw, gt + wh);
      for (let r = 1; r < wkN; r++) { c.moveTo(x0, gt + wh + r * ch); c.lineTo(x0 + mw, gt + wh + r * ch); }
      c.stroke();
      c.strokeStyle = '#333'; c.lineWidth = 3; c.strokeRect(x0, gt, mw, wh + wkN * ch);
      /* CM1-CM3 (no grid): rounded tiles rr(c, cx + 3, cy + 3, cw - 6, ch - 6, 10), month name at y0 + 34, hh = 78 */
    }
    if (stripH) {
      const sy = H - M - stripH + 20;
      c.strokeStyle = '#999'; c.lineWidth = 2; c.beginPath(); c.moveTo(M, sy); c.lineTo(W - M, sy); c.stroke();
      c.fillStyle = '#111'; c.textAlign = 'left'; c.font = '700 30px ' + FONT;
      c.fillText('Holidays', M, sy + 30);
      const per = Math.ceil(rows.length / 3), sw = (W - 2 * M) / 3;
      rows.forEach((r, i) => {
        const x = M + Math.floor(i / per) * sw, yy = sy + 72 + (i % per) * 40;
        c.fillStyle = col[0]; rr(c, x, yy - 14, 28, 28, 6); c.fill();
        c.fillStyle = '#111'; c.font = '700 27px ' + FONT;
        const dt = String(r.d).padStart(2, '0') + ' ' + MS[r.m];
        c.fillText(dt, x + 40, yy + 2);
        c.font = '400 27px ' + FONT;
        let name = r.name; const max = sw - 150;
        while (c.measureText(name).width > max && name.length > 4) name = name.slice(0, -2);
        if (name !== r.name) name = name.replace(/\s*\S?$/, '') + '…';
        c.fillText(name, x + 130, yy + 2);
      });
    }
    return cv;
  }
  return { draw, W, H, COLOURS, stripRows, LAYOUTS, layoutOf };
})();
