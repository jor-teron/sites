/* Calendar Maker CM13 render: the year sheet (all 12 months) on one canvas. window.CM.Render
   The same drawing is used for the on-screen preview, Print (as an image) and the PDF (CM2), so all three match.
   CM.Render.draw(canvas, o) with o = { year, week: 'sun'|'mon', colour (preset key or #rrggbb, CM6), font (CM6),
     rcolour (CM9), sundays, sat: 'none'|'24'|'all', hols: [{m, d, name, r?, em?, ed?}], fold (CM5, default true),
     bg: {type: 'none'|'soft'|'pic', colour, img, faint} (CM2), strip (CM2), layout (CM4), legend, mfill (CM12-F3), wfill, wmatch (CM16-F5),
     pcolour, scolour (CM18 Public / School tiles) }
   CM18: tile priority Sunday > Saturday holiday > Gazetted > Restricted > Public > School.
   History: CM1 3 x 4 sheet; CM7 all grid lines one weight/colour; CM8 one uniform grid, one text size;
   CM9 Restricted tiles (Gazetted wins on a shared date); CM11 ranges tile every day, strip shows a range as one row. */
window.CM = window.CM || {};
window.CM.Render = (function () {
  'use strict';
  const T = window.CM.Theme, C = window.CM.Canvas, Hd = window.CM.Holidays;
  const PX_MM = C.PX_MM, MN = Hd.MN, WD = Hd.WD, dim = Hd.dim, dow = Hd.dow, font = C.font;

  const api_last = {}; /* CM12-F3: last layout facts (tests) */
  function draw(cv, o) {
    const L = C.layoutOf(o.layout);
    const W = L.land ? 2923 : 2067, H = L.land ? 2067 : 2923; /* CM4 */
    /* cv.width = W; cv.height = H;  (CM1-CM3) */
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const y = o.year, f = o.week === 'mon' ? 1 : 0;
    /* const col = COLOURS[o.colour] || COLOURS.green;  (CM1-CM5) */
    /* CM6: o.colour = preset key or a custom #rrggbb; o.font = text colour (default black) */
    const fc = T.fontColour(o.font);
    const col = [T.holidayColour(o.colour), fc];
    /* const hol = {}; ... hol[k] = true; isHol -> true/false  (CM1-CM8) */
    /* CM9: isHol returns the tile colour (or false). Gazetted / Sundays / Saturdays = holiday colour;
       Restricted only if nothing gazetted that day */
    const rc = T.restrictedColour(o.rcolour);
    /* const hol = {}; (o.hols || []).forEach((h) => { const k = h.m * 100 + h.d;
         hol[k] = (h.r && hol[k] !== 'g') ? 'r' : 'g'; });  (CM9-CM10) */
    /* const hol = {}; (CM11-CM17: ranges, Gazetted wins)
    (o.hols || []).forEach((h) => Hd.daysOf(h, y).forEach(([m, d]) => {
      const k = m * 100 + d; hol[k] = (h.r && hol[k] !== 'g') ? 'r' : 'g';
    })); */
    const hol = {}; /* CM18: highest type wins (Gazetted > Restricted > Public > School) */
    (o.hols || []).forEach((h) => { const t = Hd.typeOf(h); Hd.daysOf(h, y).forEach(([m, d]) => {
      const k = m * 100 + d; if (!hol[k] || Hd.RANK[t] > Hd.RANK[hol[k]]) hol[k] = t;
    }); });
    const pc = T.publicColour(o.pcolour), sc = T.schoolColour(o.scolour); /* CM18 */
    const TC = { g: col[0], r: rc, p: pc, s: sc };
    const isHol = (m, d) => {
      const wd = dow(y, m, d);
      if (wd === 0 && o.sundays !== false) return col[0];
      const sat24 = (d >= 8 && d <= 14) || (d >= 22 && d <= 28);
      if (wd === 6 && (o.sat === 'all' || (o.sat === '24' && sat24))) return col[0];
      const t = hol[m * 100 + d];
      /* return t === 'g' ? col[0] : (t === 'r' ? rc : false);  (CM9-CM17) */
      return t ? TC[t] : false;
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
    const M = C.margin(); /* CM5: ~4 mm, printer safe minimum */
    /* title */
    c.fillStyle = fc; c.textAlign = 'center'; c.textBaseline = 'middle'; /* CM6: was '#111' */
    c.font = font('800', 150);
    /* c.fillText('YEAR ' + y, W / 2, M + 85);  (CM1-CM3 title) */
    /* c.fillText(String(y), W / 2, M + 85); let top = M + 200;  (CM4: 150px title, 200px band) */
    /* c.font = '800 120px ' + FONT; c.fillText(String(y), W / 2, M + 62); let top = M + 130;  (CM5: 130 px band) */
    /* CM6: band fits the digits tightly (cap height ~0.72 em), ~1 mm under it */
    const TFS = 110, capH = Math.round(TFS * 0.72);
    c.font = font('800', TFS); c.textBaseline = 'alphabetic';
    c.fillText(String(y), W / 2, M + capH);
    c.textBaseline = 'middle';
    let top = M + capH + Math.round(1.2 * PX_MM);
    /* holiday list strip (CM2) */
    let stripH = 0, rows = [];
    if (o.strip) {
      /* rows = stripRows(o.hols || []);  (CM2-CM8) */
      /* CM9: gazetted rows, then a 'Restricted Holidays' heading slot, then restricted rows (each in date order) */
      const sec = Hd.stripSections(o.hols);
      rows = sec.gaz.slice();
      if (sec.res.length) {
        rows.push({ head: 'Restricted Holidays' });
        sec.res.forEach((r) => rows.push({ ...r, r: true }));
      }
      [['pub', 'Public Holidays', 'p'], ['sch', 'School Holidays', 's']].forEach(([k, label, t]) => { /* CM18 */
        if (!sec[k].length) return;
        rows.push({ head: label }); sec[k].forEach((r) => rows.push({ ...r, t }));
      });
      const per = Math.ceil(rows.length / 3);
      /* stripH = rows.length ? 70 + per * 40 : 0;  (CM2-CM4) */
      stripH = rows.length ? 60 + per * 40 : 0; /* CM5: only the height it needs */
    }
    /* const gx = 34, gy = 30, cols = 3, rowsN = 4;  (CM1-CM3) */
    /* const gx = 34, gy = 30, cols = L.cols, rowsN = L.rows;  (CM4) */
    /* const gx = Math.round(2.5 * PX_MM), gy = Math.round(2.5 * PX_MM), ...  (CM5-CM7: ~2.5 mm gaps; unused since CM8) */
    const cols = L.cols, rowsN = L.rows;
    const fold = o.fold !== false; /* CM5: fold 6th week into first row (default on) */
    /* const mw = (W - 2 * M - gx * (cols - 1)) / cols;
    const mh = (H - top - M - stripH - gy * (rowsN - 1)) / rowsN;  (CM4-CM7: free month boxes + mm gutters) */
    /* CM8: one uniform spreadsheet grid. Each month = 7 columns x (2 + weeks) rows; the gap between months
       = exactly 1 column / 1 row. Column width UW and row height UH are the largest that fit the area inside
       the 4 mm margins, title band and strip. */
    const wkN = fold ? 5 : 6, RPM = 2 + wkN;
    const gCols = cols * 7 + (cols - 1), gRows = rowsN * RPM + (rowsN - 1);
    /* const UW = (W - 2 * M) / gCols, UH = (H - top - M - stripH) / gRows;
    const gx0 = M + (W - 2 * M - UW * gCols) / 2, gy0 = top + (H - top - M - stripH - UH * gRows) / 2;  (CM8-CM12) */
    /* CM12-F3: legend band below the grids (outside the uniform grid): gap + one line at ~58% of the date font.
       0 when off. */
    const UW = (W - 2 * M) / gCols, UH0 = (H - top - M - stripH) / gRows;
    /* const LFS = o.legend !== false ? Math.max(14, Math.round(Math.min(UH0 * 0.6, UW * 0.42) * 0.58)) : 0;  (CM12-F3-CM16) */
    /* CM16-F1: legend font = lgsz (0.5-2 em, default 0.58) x the date font before the band is taken off; the band
       (gap + 1.4 lines) is reserved below the grids, so the grids shrink to make room and nothing overlaps. */
    const lgsz = typeof o.lgsz === 'number' && isFinite(o.lgsz) ? Math.min(2, Math.max(0.5, o.lgsz)) : 0.58;
    const LFS = o.legend !== false ? Math.max(14, Math.round(Math.min(UH0 * 0.6, UW * 0.42) * lgsz)) : 0;
    const legGap = LFS ? Math.round(2 * PX_MM) : 0, legH = LFS ? legGap + Math.round(LFS * 1.4) : 0;
    const UH = (H - top - M - stripH - legH) / gRows;
    /* centred if any leftover */
    const gx0 = M + (W - 2 * M - UW * gCols) / 2, gy0 = top + (H - top - M - stripH - legH - UH * gRows) / 2;
    const mw = UW * 7, mh = UH * RPM;
    /* CM8: one text size for month name, weekdays and dates ('Wed' must fit the column width) */
    const UFS = Math.round(Math.min(UH * 0.6, UW * 0.42));
    const card = bg.type === 'pic' && bg.img;
    for (let m = 0; m < 12; m++) {
      /* const x0 = M + (m % cols) * (mw + gx), y0 = top + Math.floor(m / cols) * (mh + gy);  (CM4-CM7) */
      const x0 = gx0 + (m % cols) * 8 * UW, y0 = gy0 + Math.floor(m / cols) * (RPM + 1) * UH; /* CM8 */
      if (card) { c.fillStyle = 'rgba(255,255,255,.82)'; C.rr(c, x0 - 8, y0 - 6, mw + 16, mh + 12, 18); c.fill(); }
      /* CM4: each month is its own bordered grid table (month name above, weekday header row, 6 week rows) */
      /* const nameH = Math.min(70, mh * 0.16), nfs = Math.round(Math.min(52, nameH * 0.75));
      c.fillStyle = '#111'; c.textAlign = 'left'; c.font = '700 ' + nfs + 'px ' + FONT;
      c.fillText(MN[m], x0 + 6, y0 + nameH / 2);  (CM4-CM5: month name band above the grid) */
      /* CM6: month name is the grid's first row, merged & centred across 7 columns, no fill */
      /* const nameH = Math.min(62, mh * 0.13), nfs = Math.round(Math.min(46, nameH * 0.72));  (CM6-CM7) */
      const nameH = UH, nfs = UFS; /* CM8 */
      /* CM12-F3: optional month-name row fill (default light grey, white/none = no fill) */
      const mf = o.mfill === undefined ? '#d9d9d9' : o.mfill;
      if (T.isHex(mf) && !/^#ffffff$/i.test(mf)) { c.fillStyle = mf; c.fillRect(x0, y0, mw, nameH); }
      c.fillStyle = fc; c.textAlign = 'center'; c.font = font('700', nfs);
      c.fillText(MN[m], x0 + mw / 2, y0 + nameH / 2);
      const lead = (dow(y, m, 1) - f + 7) % 7, n = dim(y, m);
      /* const wkN = fold ? 5 : 6;  (CM5-CM7; CM8 computes it above) */
      /* const cw = mw / 7, gt = y0 + nameH, wh = Math.min(44, (mh - nameH) * 0.12), ch = (mh - nameH - wh) / 6;  (CM4) */
      /* const cw = mw / 7, gt = y0 + nameH, wh = Math.min(44, (mh - nameH) * 0.12), ch = (mh - nameH - wh) / wkN;
      c.font = '700 ' + Math.round(Math.min(30, wh * 0.7, cw * 0.3)) + 'px ' + FONT;  (CM5-CM7) */
      const cw = UW, gt = y0 + nameH, wh = UH, ch = UH; /* CM8: every row and column the same size */
      c.font = font('700', UFS); c.textAlign = 'center';
      /* c.fillStyle = '#f1f1f1'; c.fillRect(x0, gt, mw, wh);  (CM4-CM5 grey) */
      /* c.fillStyle = col[0]; c.fillRect(x0, gt, mw, wh);  (CM6-CM16-F4: weekday row = holiday colour) */
      /* CM16-F5: own weekday row fill (default light grey), or the holiday colour when wmatch is on */
      const wf = o.wmatch === true ? col[0] : (T.isHex(o.wfill) ? o.wfill : '#d9d9d9');
      c.fillStyle = wf; c.fillRect(x0, gt, mw, wh);
      /* for (...) { c.fillStyle = '#444'; ... }  (CM4-CM5) */
      for (let i = 0; i < 7; i++) { c.fillStyle = fc; c.fillText(WD[(i + f) % 7], x0 + cw * i + cw / 2, gt + wh / 2); }
      /* const lead = ..., n = ...;  (CM4: moved up in CM5) */
      /* const fs = Math.min(ch * 0.62, cw * 0.55);  (CM4) */
      /* const fs = Math.min(ch * 0.66, cw * 0.58);  (CM5-CM7) */
      const fs = UFS; /* CM8: same size as weekday labels and month name */
      c.font = font('700', Math.round(fs));
      for (let d = 1; d <= n; d++) {
        const p = lead + d - 1;
        if (fold && p >= 35) { /* CM5: folded date -> empty leading cell of row 1, same weekday column */
          const fx = x0 + ((p - 35) % 7) * cw, fy = gt + wh, h = isHol(m, d);
          /* CM5-CM6: half-cell tint + diagonal split, small date in the corner:
          if (h) { c.fillStyle = col[0]; c.beginPath(); c.moveTo(fx + cw - 1, fy + 1); c.lineTo(fx + cw - 1, fy + ch - 1); c.lineTo(fx + 1, fy + ch - 1); c.closePath(); c.fill(); }
          c.strokeStyle = '#888'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(fx + cw, fy); c.lineTo(fx, fy + ch); c.stroke();
          c.font = '700 ' + Math.round(fs * 0.6) + 'px ' + FONT;
          c.fillStyle = fc; c.fillText(String(d), fx + cw * 0.7, fy + ch * 0.7);
          c.font = '700 ' + Math.round(fs) + 'px ' + FONT; */
          /* CM7: folded date drawn like any other date; holiday tile fills the whole cell, no split */
          if (h) C.cell(c, h, fx + 1, fy + 1, cw - 2, ch - 2); /* CM9: colour was col[0] */
          c.fillStyle = fc;
          c.fillText(String(d), fx + cw / 2, fy + ch / 2 + 2);
          continue;
        }
        const cx = x0 + (p % 7) * cw, cy = gt + wh + Math.floor(p / 7) * ch;
        const h = isHol(m, d);
        if (h) C.cell(c, h, cx + 1, cy + 1, cw - 2, ch - 2); /* tile fills its cell; CM9: colour was col[0] */
        c.fillStyle = fc; /* CM6: was h ? col[1] : '#111' */
        c.fillText(String(d), cx + cw / 2, cy + ch / 2 + 2);
      }
      /* CM4-CM6 grid lines: inner thin '#888' 1.5 px, outer border '#333' 3 px:
      c.strokeStyle = '#888'; c.lineWidth = 1.5; ... inner lines ...; c.stroke();
      c.strokeStyle = '#333'; c.lineWidth = 3; c.strokeRect(x0, y0, mw, nameH + wh + wkN * ch); */
      /* CM7: Excel 'All Borders' - every line (outer border, under month row, under weekday row, between cells)
         same weight + colour (C.borders, snapped to whole pixels). */
      const gb = gt + wh + wkN * ch, segs = [[x0, gt, x0 + mw, gt]];
      for (let i = 1; i < 7; i++) segs.push([x0 + cw * i, gt, x0 + cw * i, gb]);
      segs.push([x0, gt + wh, x0 + mw, gt + wh]);
      for (let r = 1; r < wkN; r++) segs.push([x0, gt + wh + r * ch, x0 + mw, gt + wh + r * ch]);
      C.borders(c, segs, [x0, y0, x0 + mw, gb], true);
      /* CM1-CM3 (no grid): rounded tiles rr(c, cx + 3, cy + 3, cw - 6, ch - 6, 10), month name at y0 + 34, hh = 78 */
    }
    /* CM12-F3: legend - swatch (thin border) + '*Holiday', and '*Restricted holiday' only if the year has one */
    if (LFS) {
      const ly = gy0 + UH * gRows + legGap + Math.round(LFS * 0.7), sz = Math.round(LFS * 0.9);
      const items = [[col[0], '*Holiday']];
      /* if ((o.hols || []).some((h) => h.r)) items.push([rc, '*Restricted holiday']);  (CM12-F3-CM17) */
      const has = (t) => (o.hols || []).some((h) => Hd.typeOf(h) === t); /* CM18: only types in this year's list */
      if (has('r')) items.push([rc, '*Restricted holiday']);
      if (has('p')) items.push([pc, '*Public holiday']);
      if (has('s')) items.push([sc, '*School holiday']);
      let lx = gx0;
      c.font = font('400', LFS); c.textAlign = 'left'; c.textBaseline = 'middle';
      items.forEach(([sc, label]) => {
        C.cell(c, sc, lx, ly - sz / 2, sz, sz);
        c.strokeStyle = '#333'; c.lineWidth = 1.5; c.stroke();
        c.fillStyle = fc; c.fillText(label, lx + sz + LFS * 0.4, ly + 1);
        lx += sz + LFS * 0.4 + c.measureText(label).width + LFS * 1.6;
      });
      api_last.legend = { y: ly - sz / 2, h: sz, font: LFS, items: items.length, gridBottom: gy0 + UH * gRows, dateFont: UFS };
      /* CM16-F1: fit facts for tests, non-enumerable so the recorded layout facts stay the same */
      Object.defineProperty(api_last.legend, 'fit', { value: { dateFont0: Math.round(Math.min(UH0 * 0.6, UW * 0.42)),
        right: lx - LFS * 1.6, W, M, stripTop: H - M - stripH }, enumerable: false });
    } else api_last.legend = null;
    if (stripH) {
      const sy = H - M - stripH + 20;
      c.strokeStyle = '#999'; c.lineWidth = 2; c.beginPath(); c.moveTo(M, sy); c.lineTo(W - M, sy); c.stroke();
      c.fillStyle = fc; c.textAlign = 'left'; c.font = font('700', 30); /* CM6: was '#111' */
      c.fillText('Holidays', M, sy + 30);
      const per = Math.ceil(rows.length / 3), sw = (W - 2 * M) / 3;
      rows.forEach((r, i) => {
        const x = M + Math.floor(i / per) * sw, yy = sy + 72 + (i % per) * 40;
        if (r.head) { c.fillStyle = fc; c.font = font('700', 27); c.fillText(r.head, x, yy + 2); return; } /* CM9 */
        /* c.fillStyle = col[0];  (CM2-CM8) */
        /* c.fillStyle = r.r ? rc : col[0];  (CM9-CM17) */
        c.fillStyle = r.t ? TC[r.t] : (r.r ? rc : col[0]); C.rr(c, x, yy - 14, 28, 28, 6); c.fill();
        c.fillStyle = fc; c.font = font('700', 27); /* CM6: was '#111' */
        /* const dt = String(r.d).padStart(2, '0') + ' ' + MS[r.m];  (CM2-CM10) */
        const dt = Hd.dateText(r); /* CM11 */
        c.fillText(dt, x + 40, yy + 2);
        const nx = Math.max(x + 130, x + 40 + c.measureText(dt).width + 14); /* CM11: ranges are wider */
        c.font = font('400', 27);
        const name = C.ellipsis(c, r.name, sw - (nx - x) - 20);
        c.fillText(name, nx, yy + 2); /* CM2-CM10: x + 130 */
      });
    }
    return cv;
  }
  /* COLOURS ... endOf re-exported from core for callers and tests */
  return {
    last: api_last, draw, W: C.W, H: C.H, COLOURS: T.COLOURS, COLOUR_NAMES: T.COLOUR_NAMES, RCOLOURS: T.RCOLOURS,
    stripRows: Hd.stripRows, stripSections: Hd.stripSections, dateText: Hd.dateText, daysOf: Hd.daysOf,
    endOf: Hd.endOf, LAYOUTS: C.LAYOUTS, layoutOf: C.layoutOf
  };
})();
