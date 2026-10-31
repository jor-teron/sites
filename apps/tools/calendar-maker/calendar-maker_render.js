/* Calendar Maker renderer (CM9: hols[].r = Restricted -> o.rcolour tile (default light grey), Gazetted wins on a shared date; strip lists Restricted in its own section; CM1; CM8: whole sheet is one uniform grid - every row/column, incl. gaps between months, same size; one text size; CM7: folded dates drawn as normal dates, all grid lines one weight/colour; CM6: o.colour may be a #rrggbb custom colour, o.font = text colour, default black): draws the whole A4 portrait sheet (all 12 months, 3 x 4) on a canvas.
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
  /* const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];  (CM1-CM5) */
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; /* CM6 */
  /* const COLOURS = { green: ['#15803d', '#fff'], red: ['#b91c1c', '#fff'], yellow: ['#facc15', '#111'], blue: ['#1d4ed8', '#fff'], orange: ['#ea580c', '#fff'] };  (CM1-CM5: dark tiles, white text) */
  /* CM6: light print colours, black text readable on all; [1] kept for callers but text uses the font colour */
  const COLOURS = { green: ['#92d36e', '#000'], red: ['#f4a6a6', '#000'], yellow: ['#fde68a', '#000'], blue: ['#a5c8f5', '#000'], orange: ['#fdba74', '#000'] };
  const RCOLOURS = { grey: '#cfcfcf', silver: '#e3e3e3', stone: '#d6d3c4', lilac: '#d9c8ee', sky: '#c9e7f2' }; /* CM9: restricted presets */
  const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v || '');
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

  /* CM9: strip sections { gaz, res }, each date-sorted */
  function stripSections(hols) {
    return { gaz: stripRows((hols || []).filter((h) => !h.r)), res: stripRows((hols || []).filter((h) => h.r)) };
  }

  function draw(cv, o) {
    const L = layoutOf(o.layout);
    const W = L.land ? 2923 : 2067, H = L.land ? 2067 : 2923; /* CM4 */
    /* cv.width = W; cv.height = H;  (CM1-CM3) */
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const y = o.year, f = o.week === 'mon' ? 1 : 0;
    /* const col = COLOURS[o.colour] || COLOURS.green;  (CM1-CM5) */
    /* CM6: o.colour = preset key or a custom #rrggbb; o.font = text colour (default black) */
    const fc = isHex(o.font) ? o.font : '#000000';
    const col = [isHex(o.colour) ? o.colour : (COLOURS[o.colour] || COLOURS.green)[0], fc];
    /* const hol = {}; ... hol[k] = true; isHol -> true/false  (CM1-CM8) */
    /* CM9: isHol returns the tile colour (or false). Gazetted / Sundays / Saturdays = holiday colour; Restricted only if nothing gazetted that day */
    const rc = isHex(o.rcolour) ? o.rcolour : RCOLOURS.grey;
    const hol = {}; (o.hols || []).forEach((h) => { const k = h.m * 100 + h.d; hol[k] = (h.r && hol[k] !== 'g') ? 'r' : 'g'; });
    const isHol = (m, d) => {
      const wd = dow(y, m, d);
      if (wd === 0 && o.sundays !== false) return col[0];
      if (wd === 6 && (o.sat === 'all' || (o.sat === '24' && ((d >= 8 && d <= 14) || (d >= 22 && d <= 28))))) return col[0];
      const t = hol[m * 100 + d];
      return t === 'g' ? col[0] : (t === 'r' ? rc : false);
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
    c.fillStyle = fc; c.textAlign = 'center'; c.textBaseline = 'middle'; /* CM6: was '#111' */
    c.font = '800 150px ' + FONT;
    /* c.fillText('YEAR ' + y, W / 2, M + 85);  (CM1-CM3 title) */
    /* c.fillText(String(y), W / 2, M + 85); let top = M + 200;  (CM4: 150px title, 200px band) */
    /* c.font = '800 120px ' + FONT; c.fillText(String(y), W / 2, M + 62); let top = M + 130;  (CM5: 130 px band) */
    /* CM6: band fits the digits tightly (cap height ~0.72 em), ~1 mm under it */
    const TFS = 110, capH = Math.round(TFS * 0.72);
    c.font = '800 ' + TFS + 'px ' + FONT; c.textBaseline = 'alphabetic';
    c.fillText(String(y), W / 2, M + capH);
    c.textBaseline = 'middle';
    let top = M + capH + Math.round(1.2 * PX_MM);
    /* holiday list strip (CM2) */
    let stripH = 0, rows = [];
    if (o.strip) {
      /* rows = stripRows(o.hols || []);  (CM2-CM8) */
      /* CM9: gazetted rows, then a 'Restricted Holidays' heading slot, then restricted rows (each in date order) */
      const sec = stripSections(o.hols);
      rows = sec.gaz.slice();
      if (sec.res.length) { rows.push({ head: 'Restricted Holidays' }); sec.res.forEach((r) => rows.push({ ...r, r: true })); }
      const per = Math.ceil(rows.length / 3);
      /* stripH = rows.length ? 70 + per * 40 : 0;  (CM2-CM4) */
      stripH = rows.length ? 60 + per * 40 : 0; /* CM5: only the height it needs */
    }
    /* const gx = 34, gy = 30, cols = 3, rowsN = 4;  (CM1-CM3) */
    /* const gx = 34, gy = 30, cols = L.cols, rowsN = L.rows;  (CM4) */
    const gx = Math.round(2.5 * PX_MM), gy = Math.round(2.5 * PX_MM), cols = L.cols, rowsN = L.rows; /* CM5: ~2.5 mm gaps */
    const fold = o.fold !== false; /* CM5: fold 6th week into first row (default on) */
    /* const mw = (W - 2 * M - gx * (cols - 1)) / cols;
    const mh = (H - top - M - stripH - gy * (rowsN - 1)) / rowsN;  (CM4-CM7: free month boxes + mm gutters) */
    /* CM8: one uniform spreadsheet grid. Each month = 7 columns x (2 + weeks) rows; the gap between months = exactly 1 column / 1 row.
       Column width UW and row height UH are the largest that fit the area inside the 4 mm margins, title band and strip. */
    const wkN = fold ? 5 : 6, RPM = 2 + wkN;
    const gCols = cols * 7 + (cols - 1), gRows = rowsN * RPM + (rowsN - 1);
    const UW = (W - 2 * M) / gCols, UH = (H - top - M - stripH) / gRows;
    const gx0 = M + (W - 2 * M - UW * gCols) / 2, gy0 = top + (H - top - M - stripH - UH * gRows) / 2; /* centred if any leftover */
    const mw = UW * 7, mh = UH * RPM;
    /* CM8: one text size for month name, weekdays and dates ('Wed' must fit the column width) */
    const UFS = Math.round(Math.min(UH * 0.6, UW * 0.42));
    const card = bg.type === 'pic' && bg.img;
    for (let m = 0; m < 12; m++) {
      /* const x0 = M + (m % cols) * (mw + gx), y0 = top + Math.floor(m / cols) * (mh + gy);  (CM4-CM7) */
      const x0 = gx0 + (m % cols) * 8 * UW, y0 = gy0 + Math.floor(m / cols) * (RPM + 1) * UH; /* CM8 */
      if (card) { c.fillStyle = 'rgba(255,255,255,.82)'; rr(c, x0 - 8, y0 - 6, mw + 16, mh + 12, 18); c.fill(); }
      /* CM4: each month is its own bordered grid table (month name above, weekday header row, 6 week rows) */
      /* const nameH = Math.min(70, mh * 0.16), nfs = Math.round(Math.min(52, nameH * 0.75));
      c.fillStyle = '#111'; c.textAlign = 'left'; c.font = '700 ' + nfs + 'px ' + FONT;
      c.fillText(MN[m], x0 + 6, y0 + nameH / 2);  (CM4-CM5: month name band above the grid) */
      /* CM6: month name is the grid's first row, merged & centred across 7 columns, no fill */
      /* const nameH = Math.min(62, mh * 0.13), nfs = Math.round(Math.min(46, nameH * 0.72));  (CM6-CM7) */
      const nameH = UH, nfs = UFS; /* CM8 */
      c.fillStyle = fc; c.textAlign = 'center'; c.font = '700 ' + nfs + 'px ' + FONT;
      c.fillText(MN[m], x0 + mw / 2, y0 + nameH / 2);
      const lead = (dow(y, m, 1) - f + 7) % 7, n = dim(y, m);
      /* const wkN = fold ? 5 : 6;  (CM5-CM7; CM8 computes it above) */
      /* const cw = mw / 7, gt = y0 + nameH, wh = Math.min(44, (mh - nameH) * 0.12), ch = (mh - nameH - wh) / 6;  (CM4) */
      /* const cw = mw / 7, gt = y0 + nameH, wh = Math.min(44, (mh - nameH) * 0.12), ch = (mh - nameH - wh) / wkN;
      c.font = '700 ' + Math.round(Math.min(30, wh * 0.7, cw * 0.3)) + 'px ' + FONT;  (CM5-CM7) */
      const cw = UW, gt = y0 + nameH, wh = UH, ch = UH; /* CM8: every row and column the same size */
      c.font = '700 ' + UFS + 'px ' + FONT; c.textAlign = 'center';
      /* c.fillStyle = '#f1f1f1'; c.fillRect(x0, gt, mw, wh);  (CM4-CM5 grey) */
      c.fillStyle = col[0]; c.fillRect(x0, gt, mw, wh); /* CM6: weekday row = holiday colour */
      /* for (...) { c.fillStyle = '#444'; ... }  (CM4-CM5) */
      for (let i = 0; i < 7; i++) { c.fillStyle = fc; c.fillText(WD[(i + f) % 7], x0 + cw * i + cw / 2, gt + wh / 2); }
      /* const lead = ..., n = ...;  (CM4: moved up in CM5) */
      /* const fs = Math.min(ch * 0.62, cw * 0.55);  (CM4) */
      /* const fs = Math.min(ch * 0.66, cw * 0.58);  (CM5-CM7) */
      const fs = UFS; /* CM8: same size as weekday labels and month name */
      c.font = '700 ' + Math.round(fs) + 'px ' + FONT;
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
          if (h) { c.fillStyle = h; /* CM9: was col[0] */ c.beginPath(); c.rect(fx + 1, fy + 1, cw - 2, ch - 2); c.fill(); }
          c.fillStyle = fc;
          c.fillText(String(d), fx + cw / 2, fy + ch / 2 + 2);
          continue;
        }
        const cx = x0 + (p % 7) * cw, cy = gt + wh + Math.floor(p / 7) * ch;
        const h = isHol(m, d);
        if (h) { c.fillStyle = h; /* CM9: was col[0] */ c.beginPath(); c.rect(cx + 1, cy + 1, cw - 2, ch - 2); c.fill(); } /* tile fills its cell */
        c.fillStyle = fc; /* CM6: was h ? col[1] : '#111' */
        c.fillText(String(d), cx + cw / 2, cy + ch / 2 + 2);
      }
      /* CM4-CM6 grid lines: inner thin '#888' 1.5 px, outer border '#333' 3 px:
      c.strokeStyle = '#888'; c.lineWidth = 1.5; ... inner lines ...; c.stroke();
      c.strokeStyle = '#333'; c.lineWidth = 3; c.strokeRect(x0, y0, mw, nameH + wh + wkN * ch); */
      /* CM7: Excel 'All Borders' - every line (outer border, under month row, under weekday row, between cells) same weight + colour.
         Positions snapped to whole pixels so lines stay crisp at print resolution. */
      const GW = 3, GC = '#333', sn = (v) => Math.round(v);
      c.strokeStyle = GC; c.lineWidth = GW; c.beginPath();
      const gb = gt + wh + wkN * ch;
      c.moveTo(sn(x0), sn(gt)); c.lineTo(sn(x0 + mw), sn(gt));
      for (let i = 1; i < 7; i++) { c.moveTo(sn(x0 + cw * i), sn(gt)); c.lineTo(sn(x0 + cw * i), sn(gb)); }
      c.moveTo(sn(x0), sn(gt + wh)); c.lineTo(sn(x0 + mw), sn(gt + wh));
      for (let r = 1; r < wkN; r++) { c.moveTo(sn(x0), sn(gt + wh + r * ch)); c.lineTo(sn(x0 + mw), sn(gt + wh + r * ch)); }
      c.stroke();
      c.strokeStyle = GC; c.lineWidth = GW; c.strokeRect(sn(x0), sn(y0), sn(x0 + mw) - sn(x0), sn(gb) - sn(y0));
      /* CM1-CM3 (no grid): rounded tiles rr(c, cx + 3, cy + 3, cw - 6, ch - 6, 10), month name at y0 + 34, hh = 78 */
    }
    if (stripH) {
      const sy = H - M - stripH + 20;
      c.strokeStyle = '#999'; c.lineWidth = 2; c.beginPath(); c.moveTo(M, sy); c.lineTo(W - M, sy); c.stroke();
      c.fillStyle = fc; c.textAlign = 'left'; c.font = '700 30px ' + FONT; /* CM6: was '#111' */
      c.fillText('Holidays', M, sy + 30);
      const per = Math.ceil(rows.length / 3), sw = (W - 2 * M) / 3;
      rows.forEach((r, i) => {
        const x = M + Math.floor(i / per) * sw, yy = sy + 72 + (i % per) * 40;
        if (r.head) { c.fillStyle = fc; c.font = '700 27px ' + FONT; c.fillText(r.head, x, yy + 2); return; } /* CM9 */
        /* c.fillStyle = col[0];  (CM2-CM8) */
        c.fillStyle = r.r ? rc : col[0]; rr(c, x, yy - 14, 28, 28, 6); c.fill();
        c.fillStyle = fc; c.font = '700 27px ' + FONT; /* CM6: was '#111' */
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
  return { draw, W, H, COLOURS, RCOLOURS, stripRows, stripSections, LAYOUTS, layoutOf };
})();
