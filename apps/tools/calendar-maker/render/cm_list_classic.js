/* Calendar Maker CM13 render: Holiday List 'Classic' layout (CM12, Jor's Excel list, the page default).
   Adds CM.List.drawClassic, classicRows, dateTokens, daysText.
   Centred header block (':: ORG ::' bold underlined, ':: LIST OF HOLIDAYS ::' underlined, spaced year),
   Month | Date | Days | Holiday, blue header row, optional (a)-(d) row, month merged down, ordinal dates with
   superscript suffix, full weekday names, wrapped cells (row grows). o keys: sub, deco, abcd, merge, hcolour. */
(function () {
  'use strict';
  const T = window.CM.Theme, C = window.CM.Canvas, Hd = window.CM.Holidays, L = window.CM.List;
  const PX_MM = C.PX_MM, W = C.W, H = C.H, MS = Hd.MS, WDF = Hd.WDF, font = C.font;

  /* date cell as tokens {b: base, s: superscript, a: after}; words separated by spaces */
  function dateTokens(r, y) {
    const ds = Hd.daysOf(r, y);
    const tk = (m, d, a) => ({ b: String(d), s: Hd.sfx(d), a: a || '' });
    if (ds.length <= 1) return [tk(r.m, r.d)];
    const cross = ds[0][0] !== ds[ds.length - 1][0], e = ds[ds.length - 1];
    if (cross) return [tk(r.m, r.d, ' ' + MS[r.m]), { b: '–' }, tk(e[0], e[1], ' ' + MS[e[0]])];
    if (ds.length > 4) return [tk(r.m, r.d), { b: '–' }, tk(e[0], e[1])];
    const out = [];
    ds.forEach((x, i) => {
      const last = i === ds.length - 1;
      if (last) out.push({ b: '&' });
      out.push(tk(x[0], x[1], (!last && i < ds.length - 2) ? ',' : ''));
    });
    return out;
  }
  function daysText(r, y) {
    const ds = Hd.daysOf(r, y).map((x) => WDF[new Date(y, x[0], x[1]).getDay()]);
    if (ds.length > 4) return ds[0] + ' – ' + ds[ds.length - 1];
    return Hd.join(ds.length ? ds : [WDF[new Date(y, r.m, r.d).getDay()]]);
  }
  /* sections with same start+end+type joined by ', ' (Simple keeps CM11's ' / ') */
  function classicRows(hols, y) {
    const grp = (list) => {
      const map = {}, ord = [];
      list.forEach((h) => {
        const k = (h.m * 100 + h.d) * 10000 + Hd.endOf(h);
        if (!map[k]) {
          map[k] = { m: h.m, d: h.d, names: [] }; ord.push(k);
          if (Hd.endOf(h) !== h.m * 100 + h.d) { map[k].em = h.em; map[k].ed = h.ed; }
        }
        map[k].names.push(h.name);
      });
      return ord.sort((a, b) => a - b).map((k) => {
        const r = map[k];
        r.name = r.names.join(', '); r.dt = dateTokens(r, y); r.days = daysText(r, y); r.month = Hd.MN[r.m];
        return r;
      });
    };
    const all = hols || [];
    return { gaz: grp(all.filter((h) => !h.r)), res: grp(all.filter((h) => h.r)) };
  }

  function drawClassic(cv, o) {
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), y = o.year;
    const fc = T.fontColour(o.font);
    const hc = T.headerColour(o.hcolour);
    const htc = T.textOn(hc, fc); /* white text on the Excel blue */
    const rc = T.restrictedColour(o.rcolour);
    const bc = L.bandColour(o); /* CM16-F2: stripe fill or null */
    const deco = o.deco !== false, abcd = o.abcd !== false, merge = o.merge !== false;
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    const M = C.margin(), TW = W - 2 * M;
    c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = fc;
    let ty = M;
    /* line with optional :: marks; only the inner text is underlined (as in the photo) */
    const deco1 = (txt, weight, fs0) => {
      const full = () => deco ? ':: ' + txt + ' ::' : txt;
      const fs = C.fitFont(c, weight, fs0, 28, TW, full);
      const cap = Math.round(fs * 0.72); c.fillStyle = fc; c.textAlign = 'center';
      c.fillText(full(), W / 2, ty + cap); C.underline(c, txt, W / 2, ty + cap, fs);
      ty += cap + Math.round(fs * 0.4);
    };
    const head = L.cleanHeader(o.header);
    if (head) deco1(head, '800', 84);
    const sub = L.cleanHeader(o.sub == null ? 'LIST OF HOLIDAYS' : o.sub);
    if (sub) deco1(sub, '400', 60);
    /* spaced year: each digit drawn on its own with a gap */
    {
      const YFS = 100, digs = String(y).split(''); c.font = font('800', YFS);
      const gap = YFS * 0.35, ws = digs.map((d) => c.measureText(d).width);
      const tot = ws.reduce((a, b) => a + b, 0) + gap * (digs.length - 1);
      let x = W / 2 - tot / 2; const cap = Math.round(YFS * 0.72); c.textAlign = 'left'; c.fillStyle = fc;
      digs.forEach((d, i) => { c.fillText(d, x, ty + cap); x += ws[i] + gap; });
      ty += cap + Math.round(1.5 * PX_MM);
    }
    const top = ty;
    const sec = classicRows(o.hols, y);
    const body = sec.gaz.map((r) => Object.assign({ sec: 'g' }, r));
    if (sec.res.length) {
      body.push({ head: true, text: 'Restricted Holidays' });
      sec.res.forEach((r) => body.push(Object.assign({ sec: 'r' }, r)));
    }
    const cx = [M, M + Math.round(TW * 0.15), M + Math.round(TW * 0.32), M + Math.round(TW * 0.56), W - M];
    const avail = H - M - top;
    /* layout pass at a font size: each row's line count -> height */
    const lay = (fs) => {
      const pad = Math.round(fs * 0.35), LH = Math.round(fs * 1.2), base = LH + 2 * pad;
      const rs = body.map((r) => {
        if (r.head) return { r, h: base };
        c.font = font('400', fs);
        const dl = C.wrapTok(c, r.dt, cx[2] - cx[1] - 2 * pad, fs);
        c.font = font('400', fs);
        const yl = C.wrap(c, r.days, cx[3] - cx[2] - 2 * pad), nl = C.wrap(c, r.name, cx[4] - cx[3] - 2 * pad);
        const n = Math.max(dl.length, yl.length, nl.length);
        return { r, dl, yl, nl, h: n * LH + 2 * pad };
      });
      const fixed = base * (abcd ? 2 : 1) + (body.length ? 0 : base);
      return { fs, pad, LH, base, rs, total: fixed + rs.reduce((a, b) => a + b.h, 0) };
    };
    let Lay = null;
    for (let fs = 60; fs >= 18; fs -= 2) { Lay = lay(fs); if (Lay.total <= avail) break; }
    /* fill the page: spare height spread over rows, each row grown by at most 6 mm */
    const nr = (abcd ? 2 : 1) + Math.max(1, Lay.rs.length);
    const extra = Math.max(0, Math.min(Math.round(6 * PX_MM), Math.floor((avail - Lay.total) / nr)));
    const { fs, LH } = Lay, base = Lay.base + extra;
    Lay.rs.forEach((x) => { x.h += extra; });
    let yy = top; c.textBaseline = 'middle';
    const hl = [], vl = []; /* horizontal [y, x0, x1], vertical [x, y0, y1] */
    const full = (ly) => hl.push([ly, cx[0], cx[4]]);
    const colLines = (y0, h) => { for (let i = 1; i < 4; i++) vl.push([cx[i], y0, y0 + h]); };
    const centred = (labels, y0) => labels.forEach((s, i) => c.fillText(s, (cx[i] + cx[i + 1]) / 2, y0 + base / 2));
    /* header row */
    c.fillStyle = hc; c.fillRect(cx[0], yy, TW, base);
    c.font = font('700', fs); c.fillStyle = htc; c.textAlign = 'center';
    centred(['Month', 'Date', 'Days', 'Holiday'], yy);
    full(yy); colLines(yy, base); yy += base;
    if (abcd) {
      c.fillStyle = '#e7e6e6'; c.fillRect(cx[0], yy, TW, base);
      c.font = font('italic 400', fs); c.fillStyle = fc;
      centred(['(a)', '(b)', '(c)', '(d)'], yy);
      full(yy); colLines(yy, base); yy += base;
    }
    if (!body.length) {
      c.font = font('400', fs); c.fillStyle = fc; c.fillText('No holidays', W / 2, yy + base / 2);
      full(yy); yy += base;
    }
    /* month spans: consecutive rows of one month in one section; restart after the heading */
    const spans = [];
    Lay.rs.forEach((x, i) => {
      if (x.r.head) return;
      const s = spans[spans.length - 1];
      if (merge && s && s.end === i - 1 && s.m === x.r.m && s.sec === x.r.sec) s.end = i;
      else spans.push({ m: x.r.m, sec: x.r.sec, start: i, end: i });
    });
    const ys = []; Lay.rs.forEach((x) => { ys.push(yy); yy += x.h; }); ys.push(yy);
    let k = 0; /* CM16-F2: stripe counter, restarts after the Restricted heading */
    Lay.rs.forEach((x, i) => {
      const y0 = ys[i];
      if (x.r.head) k = 0;
      else if (bc && (k++ % 2) === 1) { /* merged month cell stays white; 'month every row' follows the stripe */
        c.fillStyle = bc; c.fillRect(merge ? cx[1] : cx[0], y0, merge ? cx[4] - cx[1] : TW, x.h);
      }
      if (x.r.head) {
        c.fillStyle = rc; c.fillRect(cx[0], y0, TW, x.h);
        c.font = font('700', fs); c.fillStyle = fc; c.textAlign = 'center'; c.fillText(x.r.text, W / 2, y0 + x.h / 2);
        full(y0); return;
      }
      hl.push([y0, cx[1], cx[4]]);
      colLines(y0, x.h);
      const mid = y0 + x.h / 2, at = (j, n) => mid + (j - (n - 1) / 2) * LH;
      x.dl.forEach((ln, j) => C.drawTokLine(c, ln, (cx[1] + cx[2]) / 2, at(j, x.dl.length), fs, fc));
      c.font = font('400', fs); c.fillStyle = fc; c.textAlign = 'center';
      x.yl.forEach((ln, j) => c.fillText(ln, (cx[2] + cx[3]) / 2, at(j, x.yl.length)));
      c.textAlign = 'left';
      x.nl.forEach((ln, j) => c.fillText(ln, cx[3] + Lay.pad, at(j, x.nl.length)));
    });
    spans.forEach((s) => {
      const y0 = ys[s.start], y1 = ys[s.end + 1];
      hl.push([y0, cx[0], cx[1]]);
      c.font = font('400', fs); c.fillStyle = fc; c.textAlign = 'center';
      c.fillText(Hd.MN[s.m], (cx[0] + cx[1]) / 2, (y0 + y1) / 2);
    });
    /* all borders #333, one weight */
    const segs = hl.map(([ly, a, b]) => [a, ly, b, ly]).concat(vl.map(([lx, a, b]) => [lx, a, lx, b]));
    C.borders(c, segs, [cx[0], top, cx[4], yy], false);
    cv._cm12 = { spans, rows: Lay.rs, fs, top, bottom: yy }; /* for the test harness */
    return cv;
  }
  Object.assign(L, { drawClassic, classicRows, dateTokens, daysText });
})();
