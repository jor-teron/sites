/* Calendar Maker CM14 render: Year Overview page, one A4 portrait 250 dpi canvas (preview, Print, PDF).
   window.CM.Overview.draw(canvas, o), o = { year, hols, sat, font, header, hcolour }.
   Title band (optional Header, 'YEAR OVERVIEW', spaced year) like the Classic list, then three all-borders tables:
   Summary, Holiday streaks, Holiday stretches. Header rows use the list header colour; whole page shrinks to fit. */
window.CM = window.CM || {};
window.CM.Overview = (function () {
  'use strict';
  const T = window.CM.Theme, C = window.CM.Canvas, St = window.CM.Stats, L = window.CM.List;
  const W = C.W, H = C.H, PX_MM = C.PX_MM, font = C.font;

  /* table data from the stats */
  function tables(s) {
    const u = s.summary;
    const sum = [
      ['Total days', u.total], ['Sundays', u.sundays], ['Saturday holidays (' + u.satRule + ')', u.sats],
      ['Gazetted holidays (days)', u.gaz], ['Gazetted holidays falling on a Sunday / Saturday holiday', u.gazWk],
      ['Total holidays (Sundays + Saturday holidays + Gazetted, with overlaps)', u.totalHol],
      ['Actual holidays (each day once)', u.actual], ['Working days (total days − actual holidays)', u.working],
      ['Restricted holidays (days, not deducted)', u.restricted]
    ].map((r) => [r[0], String(r[1])]);
    return [
      { title: 'Summary', cols: [0.78, 0.22], head: ['Item', 'Days'], align: ['l', 'c'], rows: sum, bold: [6, 7] },
      { title: 'Holiday streaks (3 or more days off in a row)', cols: [0.07, 0.33, 0.1, 0.5],
        head: ['#', 'From – To', 'Days', 'Holidays in it'], align: ['c', 'c', 'c', 'l'],
        rows: s.streaks.map((k, i) => [String(i + 1), k.from, String(k.len), k.names]) },
      { title: 'Holiday stretches (days off ≥ working days)', cols: [0.06, 0.3, 0.09, 0.07, 0.1, 0.38],
        head: ['#', 'From – To', 'Total', 'Off', 'Working', 'Holidays in it'], align: ['c', 'c', 'c', 'c', 'c', 'l'],
        rows: s.stretches.map((k, i) => [String(i + 1), k.from, String(k.len), String(k.off), String(k.work), k.names]) }
    ];
  }

  function draw(cv, o) {
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), y = o.year, fc = T.fontColour(o.font);
    const hc = T.headerColour(o.hcolour), htc = T.textOn(hc, fc);
    const s = St.year(y, o.hols, o.sat), tbs = tables(s);
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    const M = C.margin(), TW = W - 2 * M;
    c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = fc;
    let ty = M;
    const line = (txt, weight, fs0, ul) => {
      const fs = C.fitFont(c, weight, fs0, 28, TW, () => txt), cap = Math.round(fs * 0.72);
      c.fillStyle = fc; c.textAlign = 'center'; c.fillText(txt, W / 2, ty + cap);
      if (ul) C.underline(c, txt, W / 2, ty + cap, fs);
      ty += cap + Math.round(fs * 0.4);
    };
    const head = L.cleanHeader(o.header);
    if (head) line(head, '800', 84, true);
    line('YEAR OVERVIEW', '400', 60, true);
    { /* spaced year, as in the Classic list */
      const YFS = 100, digs = String(y).split(''); c.font = font('800', YFS);
      const gap = YFS * 0.35, ws = digs.map((d) => c.measureText(d).width);
      let x = W / 2 - (ws.reduce((a, b) => a + b, 0) + gap * (digs.length - 1)) / 2;
      const cap = Math.round(YFS * 0.72); c.textAlign = 'left'; c.fillStyle = fc;
      digs.forEach((d, i) => { c.fillText(d, x, ty + cap); x += ws[i] + gap; });
      ty += cap + Math.round(1.5 * PX_MM);
    }
    const top = ty, avail = H - M - top;
    /* layout at a font size: wrapped cell lines per row */
    const lay = (fs) => {
      const pad = Math.round(fs * 0.35), LH = Math.round(fs * 1.2), base = LH + 2 * pad, gapT = Math.round(fs * 1.9);
      let total = 0;
      const ts = tbs.map((t) => {
        const xs = [M]; t.cols.forEach((f, i) => xs.push(i === t.cols.length - 1 ? W - M : xs[i] + Math.round(TW * f)));
        c.font = font('400', fs);
        const rs = (t.rows.length ? t.rows : [null]).map((r) => {
          if (!r) return { none: true, h: base };
          const ls = r.map((v, i) => C.wrap(c, v, xs[i + 1] - xs[i] - 2 * pad));
          return { r, ls, h: Math.max(...ls.map((x) => x.length)) * LH + 2 * pad };
        });
        const h = gapT + base + rs.reduce((a, b) => a + b.h, 0);
        total += h; return { t, xs, rs, h };
      });
      return { fs, pad, LH, base, gapT, ts, total };
    };
    let Lay = null;
    for (let fs = 48; fs >= 18; fs -= 2) { Lay = lay(fs); if (Lay.total <= avail) break; }
    const { fs, pad, LH, base, gapT } = Lay;
    let yy = top;
    Lay.ts.forEach(({ t, xs, rs }) => {
      c.textBaseline = 'alphabetic'; c.font = font('700', Math.round(fs * 1.1)); c.fillStyle = fc; c.textAlign = 'left';
      c.fillText(t.title, M, yy + gapT - Math.round(fs * 0.45));
      yy += gapT;
      const t0 = yy, segs = [];
      const vlines = (y0, h) => { for (let i = 1; i < xs.length - 1; i++) segs.push([xs[i], y0, xs[i], y0 + h]); };
      c.fillStyle = hc; c.fillRect(xs[0], yy, TW, base);
      c.font = font('700', fs); c.fillStyle = htc; c.textAlign = 'center'; c.textBaseline = 'middle';
      t.head.forEach((s0, i) => c.fillText(s0, (xs[i] + xs[i + 1]) / 2, yy + base / 2));
      vlines(yy, base); yy += base;
      rs.forEach((x, ri) => {
        segs.push([xs[0], yy, xs[xs.length - 1], yy]);
        const mid = yy + x.h / 2;
        if (x.none) {
          c.font = font('400', fs); c.fillStyle = fc; c.textAlign = 'center'; c.fillText('None', W / 2, mid);
        } else {
          vlines(yy, x.h);
          c.font = font((t.bold || []).indexOf(ri) >= 0 ? '700' : '400', fs); c.fillStyle = fc;
          x.ls.forEach((ls, i) => {
            const al = t.align[i];
            c.textAlign = al === 'l' ? 'left' : 'center';
            const tx = al === 'l' ? xs[i] + pad : (xs[i] + xs[i + 1]) / 2;
            ls.forEach((s1, j) => c.fillText(s1, tx, mid + (j - (ls.length - 1) / 2) * LH));
          });
        }
        yy += x.h;
      });
      C.borders(c, segs, [xs[0], t0, xs[xs.length - 1], yy], false);
    });
    cv._cm14 = { stats: s, fs, top, bottom: yy, tables: tbs }; /* for the test harness */
    return cv;
  }
  return { draw, tables };
})();
