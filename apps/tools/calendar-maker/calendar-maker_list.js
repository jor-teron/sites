/* Calendar Maker CM10: Holiday List page - a printable A4 portrait list for the chosen year.
   Columns Date | Weekday | Holiday. Main (Gazetted) holidays first in date order, then a 'Restricted Holidays'
   section (heading row on the Restricted colour), each in date order. Same merged holiday set as the sheet (CM.hols).
   Drawn on one 250 dpi canvas (2067 x 2923) used for the preview, Print and the PDF (jsPDF in vendor/).
   window.CMList = { rows(hols, year), draw(canvas, o) } with o = { year, hols, colour, rcolour, font, header }.
   CM12: o.layout 'classic' (Jor's Excel list, the page default) | 'simple' (CM10, also used when o.layout is missing).
   Classic: centred header block (':: ORG ::' bold underlined, ':: LIST OF HOLIDAYS ::' underlined, spaced year),
   Month | Date | Days | Holiday, blue header row, optional (a)-(d) row, month merged down, ordinal dates with
   superscript suffix, full weekday names, wrapped cells (row grows). Extra o keys: sub, deco, abcd, merge, hcolour. */
window.CMList = (function () {
  'use strict';
  const W = 2067, H = 2923, PX_MM = W / 210;
  const MS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
  const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v || '');

  /* table rows: [{head:true,text}] for headings, else {m,d,wd,name,r} */
  function rows(hols, y) {
    const R = window.CMRender, sec = R.stripSections(hols || []);
    /* const one = (h, r) => ({ m: h.m, d: h.d, wd: WD[new Date(y, h.m, h.d).getDay()], name: h.name, r });  (CM10) */
    const one = (h, r) => { /* CM11: ranges -> date '20–23 Oct', weekday 'Tue–Fri' */
      const o = { m: h.m, d: h.d, wd: WD[new Date(y, h.m, h.d).getDay()], name: h.name, r, date: R.dateText(h) };
      if (h.em != null) { o.em = h.em; o.ed = h.ed; o.wd += '–' + WD[new Date(y, h.em, h.ed).getDay()]; }
      return o;
    };
    const out = sec.gaz.map((h) => one(h, false));
    if (sec.res.length) { out.push({ head: true, text: 'Restricted Holidays' }); sec.res.forEach((h) => out.push(one(h, true))); }
    return out;
  }

  /* header text: one line, control chars removed, max 80 chars (drawn on canvas, so no HTML escaping needed) */
  const cleanHeader = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

  function drawSimple(cv, o) { /* CM12: was draw() (CM10/CM11), unchanged */
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), R = window.CMRender;
    const fc = isHex(o.font) ? o.font : '#000000';
    const hc = isHex(o.colour) ? o.colour : (R.COLOURS[o.colour] || R.COLOURS.green)[0];
    const rc = isHex(o.rcolour) ? o.rcolour : R.RCOLOURS.grey;
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    const M = Math.round(4 * PX_MM);
    /* title band, tight like the sheet title */
    const TFS = 96, capH = Math.round(TFS * 0.72);
    c.fillStyle = fc; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    /* user header (e.g. organisation name) above the title; empty = not drawn, no space */
    const head = cleanHeader(o.header);
    let ty = M;
    if (head) {
      let HFS = 84; c.font = '800 ' + HFS + 'px ' + FONT;
      while (HFS > 30 && c.measureText(head).width > W - 2 * M) { HFS -= 4; c.font = '800 ' + HFS + 'px ' + FONT; }
      const hc = Math.round(HFS * 0.72); c.fillText(head, W / 2, ty + hc); ty += hc + Math.round(2 * PX_MM);
    }
    c.font = '800 ' + TFS + 'px ' + FONT;
    c.fillText('Holidays ' + o.year, W / 2, ty + capH);
    c.textBaseline = 'middle';
    const top = ty + capH + Math.round(2 * PX_MM);
    const list = rows(o.hols, o.year);
    const n = 1 + Math.max(1, list.length); /* header + rows (or one 'No holidays' row) */
    const RH = Math.max(40, Math.min(Math.round(14 * PX_MM), Math.floor((H - top - M) / n))); /* row height, up to 14 mm */
    const FS = Math.round(Math.max(22, Math.min(72, RH * 0.55)));
    /* const TW = W - 2 * M, cx = [M, M + Math.round(TW * 0.2), M + Math.round(TW * 0.36), W - M];  (CM10) */
    const wide = list.some((r) => r.em != null); /* CM11: room for '30 Sep–02 Oct' and 'Tue–Fri' */
    const TW = W - 2 * M, cx = wide ? [M, M + Math.round(TW * 0.27), M + Math.round(TW * 0.45), W - M] : [M, M + Math.round(TW * 0.2), M + Math.round(TW * 0.36), W - M];
    const sn = (v) => Math.round(v);
    let yy = top;
    /* header row on the holiday colour */
    c.fillStyle = hc; c.fillRect(cx[0], yy, TW, RH);
    c.fillStyle = fc; c.font = '700 ' + FS + 'px ' + FONT; c.textAlign = 'left';
    const pad = Math.round(FS * 0.4);
    ['Date', 'Weekday', 'Holiday'].forEach((s, i) => c.fillText(s, cx[i] + pad, yy + RH / 2));
    const lines = [[yy, true]];
    yy += RH;
    if (!list.length) { c.font = '400 ' + FS + 'px ' + FONT; c.fillText('No holidays', cx[0] + pad, yy + RH / 2); lines.push([yy, false]); yy += RH; }
    list.forEach((r) => {
      if (r.head) {
        c.fillStyle = rc; c.fillRect(cx[0], yy, TW, RH);
        c.fillStyle = fc; c.font = '700 ' + FS + 'px ' + FONT; c.fillText(r.text, cx[0] + pad, yy + RH / 2);
        lines.push([yy, false]); yy += RH; return;
      }
      c.fillStyle = fc; c.font = '700 ' + FS + 'px ' + FONT;
      /* c.fillText(String(r.d).padStart(2, '0') + ' ' + MS[r.m], cx[0] + pad, yy + RH / 2);  (CM10) */
      c.fillText(r.date || (String(r.d).padStart(2, '0') + ' ' + MS[r.m]), cx[0] + pad, yy + RH / 2); /* CM11 */
      c.font = '400 ' + FS + 'px ' + FONT;
      c.fillText(r.wd, cx[1] + pad, yy + RH / 2);
      let name = r.name; const max = cx[3] - cx[2] - 2 * pad;
      while (c.measureText(name).width > max && name.length > 4) name = name.slice(0, -2);
      if (name !== r.name) name = name.replace(/\s*\S?$/, '') + '…';
      c.fillText(name, cx[2] + pad, yy + RH / 2);
      lines.push([yy, true]); yy += RH;
    });
    /* Excel 'All Borders': every line #333, same weight inside and outside; heading rows merged (no column lines) */
    c.strokeStyle = '#333'; c.lineWidth = 3; c.beginPath();
    lines.forEach(([ly, cols]) => {
      c.moveTo(sn(cx[0]), sn(ly)); c.lineTo(sn(cx[3]), sn(ly));
      if (cols) for (let i = 1; i < 3; i++) { c.moveTo(sn(cx[i]), sn(ly)); c.lineTo(sn(cx[i]), sn(ly + RH)); }
    });
    c.stroke();
    c.strokeRect(sn(cx[0]), sn(top), sn(cx[3]) - sn(cx[0]), sn(yy) - sn(top));
    return cv;
  }


  /* ===== CM12: Classic layout ===== */
  const WDF = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const HCOLOURS = { blue: '#2e75b6', navy: '#1f3864', green: '#00b050', grey: '#7f7f7f', orange: '#c55a11' };
  const sfx = (n) => (n % 100 >= 11 && n % 100 <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  /* 'A', 'A & B', 'A, B & C' */
  const join = (a) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' & ' + a[a.length - 1];
  /* date cell as tokens {b: base, s: superscript, a: after}; words separated by spaces */
  function dateTokens(r, y) {
    const R = window.CMRender, ds = R.daysOf(r, y);
    const tk = (m, d, a) => ({ b: String(d), s: sfx(d), a: a || '' });
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
    const ds = window.CMRender.daysOf(r, y).map((x) => WDF[new Date(y, x[0], x[1]).getDay()]);
    if (ds.length > 4) return ds[0] + ' – ' + ds[ds.length - 1];
    return join(ds.length ? ds : [WDF[new Date(y, r.m, r.d).getDay()]]);
  }
  /* sections with same start+end+type joined by ', ' (Simple keeps CM11's ' / ') */
  function classicRows(hols, y) {
    const R = window.CMRender;
    const grp = (list) => {
      const map = {}, ord = [];
      list.forEach((h) => { const k = (h.m * 100 + h.d) * 10000 + R.endOf(h); if (!map[k]) { map[k] = { m: h.m, d: h.d, names: [] }; ord.push(k); if (R.endOf(h) !== h.m * 100 + h.d) { map[k].em = h.em; map[k].ed = h.ed; } } map[k].names.push(h.name); });
      return ord.sort((a, b) => a - b).map((k) => { const r = map[k]; r.name = r.names.join(', '); r.dt = dateTokens(r, y); r.days = daysText(r, y); r.month = MF[r.m]; return r; });
    };
    const all = hols || [];
    return { gaz: grp(all.filter((h) => !h.r)), res: grp(all.filter((h) => h.r)) };
  }
  /* word wrap: plain text -> lines */
  function wrap(c, text, max) {
    const ws = String(text).split(/\s+/).filter(Boolean), out = [];
    let cur = '';
    ws.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (cur && c.measureText(t).width > max) { out.push(cur); cur = w; } else cur = t; });
    if (cur || !out.length) out.push(cur);
    return out;
  }
  /* token wrap for the date cell: lines of tokens; width of a token = base + small suffix + after */
  function tokW(c, k, fs) {
    c.font = '400 ' + fs + 'px ' + FONT; let w = c.measureText(k.b + (k.a || '')).width;
    if (k.s) { c.font = '400 ' + Math.round(fs * 0.6) + 'px ' + FONT; w += c.measureText(k.s).width; }
    return w;
  }
  function wrapTok(c, toks, max, fs) {
    c.font = '400 ' + fs + 'px ' + FONT; const sp = c.measureText(' ').width || fs * 0.3;
    const out = []; let cur = [], w = 0;
    toks.forEach((k) => { const kw = tokW(c, k, fs); if (cur.length && w + sp + kw > max) { out.push(cur); cur = []; w = 0; } w += (cur.length ? sp : 0) + kw; cur.push(k); });
    if (cur.length || !out.length) out.push(cur);
    return out;
  }
  function drawTokLine(c, line, cx, y, fs, fc) {
    c.font = '400 ' + fs + 'px ' + FONT; const sp = c.measureText(' ').width || fs * 0.3;
    let w = 0; line.forEach((k, i) => { w += (i ? sp : 0) + tokW(c, k, fs); });
    let x = cx - w / 2; c.textAlign = 'left'; c.fillStyle = fc;
    line.forEach((k, i) => {
      if (i) x += sp;
      c.font = '400 ' + fs + 'px ' + FONT; c.fillText(k.b, x, y); x += c.measureText(k.b).width;
      if (k.s) { const ss = Math.round(fs * 0.6); c.font = '400 ' + ss + 'px ' + FONT; c.fillText(k.s, x, y - fs * 0.3); x += c.measureText(k.s).width; }
      if (k.a) { c.font = '400 ' + fs + 'px ' + FONT; c.fillText(k.a, x, y); x += c.measureText(k.a).width; }
    });
  }
  const darkOf = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 150; };

  function drawClassic(cv, o) {
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), R = window.CMRender, y = o.year;
    const fc = isHex(o.font) ? o.font : '#000000';
    const hc = isHex(o.hcolour) ? o.hcolour : (HCOLOURS[o.hcolour] || HCOLOURS.blue);
    const htc = darkOf(hc) ? '#ffffff' : fc; /* white text on the Excel blue */
    const rc = isHex(o.rcolour) ? o.rcolour : R.RCOLOURS.grey;
    const deco = o.deco !== false, abcd = o.abcd !== false, merge = o.merge !== false;
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    const M = Math.round(4 * PX_MM), TW = W - 2 * M;
    c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = fc;
    let ty = M;
    const uline = (txt, cxm, by, fs) => { const w = c.measureText(txt).width; c.fillRect(Math.round(cxm - w / 2), Math.round(by + fs * 0.1), Math.round(w), Math.max(2, Math.round(fs * 0.06))); };
    /* line with optional :: marks; only the inner text is underlined (as in the photo) */
    const deco1 = (txt, weight, fs0) => {
      let fs = fs0; c.font = weight + ' ' + fs + 'px ' + FONT;
      const full = () => deco ? ':: ' + txt + ' ::' : txt;
      while (fs > 28 && c.measureText(full()).width > TW) { fs -= 4; c.font = weight + ' ' + fs + 'px ' + FONT; }
      const cap = Math.round(fs * 0.72); c.fillStyle = fc; c.textAlign = 'center';
      c.fillText(full(), W / 2, ty + cap); uline(txt, W / 2, ty + cap, fs);
      ty += cap + Math.round(fs * 0.4);
    };
    const head = cleanHeader(o.header);
    if (head) deco1(head, '800', 84);
    const sub = cleanHeader(o.sub == null ? 'LIST OF HOLIDAYS' : o.sub);
    if (sub) deco1(sub, '400', 60);
    /* spaced year: each digit drawn on its own with a gap */
    { const YFS = 100, digs = String(y).split(''); c.font = '800 ' + YFS + 'px ' + FONT;
      const gap = YFS * 0.35, ws = digs.map((d) => c.measureText(d).width), tot = ws.reduce((a, b) => a + b, 0) + gap * (digs.length - 1);
      let x = W / 2 - tot / 2; const cap = Math.round(YFS * 0.72); c.textAlign = 'left'; c.fillStyle = fc;
      digs.forEach((d, i) => { c.fillText(d, x, ty + cap); x += ws[i] + gap; });
      ty += cap + Math.round(1.5 * PX_MM); }
    const top = ty;
    const sec = classicRows(o.hols, y);
    const body = sec.gaz.map((r) => Object.assign({ sec: 'g' }, r));
    if (sec.res.length) { body.push({ head: true, text: 'Restricted Holidays' }); sec.res.forEach((r) => body.push(Object.assign({ sec: 'r' }, r))); }
    const cx = [M, M + Math.round(TW * 0.15), M + Math.round(TW * 0.32), M + Math.round(TW * 0.56), W - M];
    const avail = H - M - top;
    /* layout pass at a font size: each row's line count -> height */
    const lay = (fs) => {
      const pad = Math.round(fs * 0.35), LH = Math.round(fs * 1.2), base = LH + 2 * pad;
      const rs = body.map((r) => {
        if (r.head) return { r, h: base };
        c.font = '400 ' + fs + 'px ' + FONT;
        const dl = wrapTok(c, r.dt, cx[2] - cx[1] - 2 * pad, fs);
        c.font = '400 ' + fs + 'px ' + FONT;
        const yl = wrap(c, r.days, cx[3] - cx[2] - 2 * pad), nl = wrap(c, r.name, cx[4] - cx[3] - 2 * pad);
        const n = Math.max(dl.length, yl.length, nl.length);
        return { r, dl, yl, nl, h: n * LH + 2 * pad };
      });
      const fixed = base * (abcd ? 2 : 1) + (body.length ? 0 : base);
      return { fs, pad, LH, base, rs, total: fixed + rs.reduce((a, b) => a + b.h, 0) };
    };
    let L = null;
    for (let fs = 60; fs >= 18; fs -= 2) { L = lay(fs); if (L.total <= avail) break; }
    /* fill the page: spare height spread over rows, each row grown by at most 6 mm */
    const nr = (abcd ? 2 : 1) + Math.max(1, L.rs.length);
    const extra = Math.max(0, Math.min(Math.round(6 * PX_MM), Math.floor((avail - L.total) / nr)));
    const { fs, LH } = L, base = L.base + extra;
    L.rs.forEach((x) => { x.h += extra; });
    let yy = top; c.textBaseline = 'middle';
    const hl = [], vl = []; /* horizontal [y, x0, x1], vertical [x, y0, y1] */
    const full = (ly) => hl.push([ly, cx[0], cx[4]]);
    /* header row */
    c.fillStyle = hc; c.fillRect(cx[0], yy, TW, base);
    c.font = '700 ' + fs + 'px ' + FONT; c.fillStyle = htc; c.textAlign = 'center';
    ['Month', 'Date', 'Days', 'Holiday'].forEach((s, i) => c.fillText(s, (cx[i] + cx[i + 1]) / 2, yy + base / 2));
    full(yy); for (let i = 1; i < 4; i++) vl.push([cx[i], yy, yy + base]); yy += base;
    if (abcd) {
      c.fillStyle = '#e7e6e6'; c.fillRect(cx[0], yy, TW, base);
      c.font = 'italic 400 ' + fs + 'px ' + FONT; c.fillStyle = fc;
      ['(a)', '(b)', '(c)', '(d)'].forEach((s, i) => c.fillText(s, (cx[i] + cx[i + 1]) / 2, yy + base / 2));
      full(yy); for (let i = 1; i < 4; i++) vl.push([cx[i], yy, yy + base]); yy += base;
    }
    if (!body.length) { c.font = '400 ' + fs + 'px ' + FONT; c.fillStyle = fc; c.fillText('No holidays', W / 2, yy + base / 2); full(yy); yy += base; }
    /* month spans: consecutive rows of one month in one section; restart after the heading */
    const spans = [];
    L.rs.forEach((x, i) => {
      if (x.r.head) return;
      const s = spans[spans.length - 1];
      if (merge && s && s.end === i - 1 && s.m === x.r.m && s.sec === x.r.sec) s.end = i; else spans.push({ m: x.r.m, sec: x.r.sec, start: i, end: i });
    });
    const ys = []; L.rs.forEach((x) => { ys.push(yy); yy += x.h; }); ys.push(yy);
    L.rs.forEach((x, i) => {
      const y0 = ys[i];
      if (x.r.head) {
        c.fillStyle = rc; c.fillRect(cx[0], y0, TW, x.h);
        c.font = '700 ' + fs + 'px ' + FONT; c.fillStyle = fc; c.textAlign = 'center'; c.fillText(x.r.text, W / 2, y0 + x.h / 2);
        full(y0); return;
      }
      hl.push([y0, cx[1], cx[4]]);
      for (let k = 1; k < 4; k++) vl.push([cx[k], y0, y0 + x.h]);
      const mid = y0 + x.h / 2;
      x.dl.forEach((ln, j) => drawTokLine(c, ln, (cx[1] + cx[2]) / 2, mid + (j - (x.dl.length - 1) / 2) * LH, fs, fc));
      c.font = '400 ' + fs + 'px ' + FONT; c.fillStyle = fc; c.textAlign = 'center';
      x.yl.forEach((ln, j) => c.fillText(ln, (cx[2] + cx[3]) / 2, mid + (j - (x.yl.length - 1) / 2) * LH));
      c.textAlign = 'left';
      x.nl.forEach((ln, j) => c.fillText(ln, cx[3] + L.pad, mid + (j - (x.nl.length - 1) / 2) * LH));
    });
    spans.forEach((s) => {
      const y0 = ys[s.start], y1 = ys[s.end + 1];
      hl.push([y0, cx[0], cx[1]]);
      c.font = '400 ' + fs + 'px ' + FONT; c.fillStyle = fc; c.textAlign = 'center';
      c.fillText(MF[s.m], (cx[0] + cx[1]) / 2, (y0 + y1) / 2);
    });
    /* all borders #333, one weight */
    const sn = Math.round;
    c.strokeStyle = '#333'; c.lineWidth = 3; c.beginPath();
    hl.forEach(([ly, a, b]) => { c.moveTo(sn(a), sn(ly)); c.lineTo(sn(b), sn(ly)); });
    vl.forEach(([lx, a, b]) => { c.moveTo(sn(lx), sn(a)); c.lineTo(sn(lx), sn(b)); });
    c.stroke();
    c.strokeRect(sn(cx[0]), sn(top), sn(cx[4]) - sn(cx[0]), sn(yy) - sn(top));
    cv._cm12 = { spans, rows: L.rs, fs, top, bottom: yy }; /* for the test harness */
    return cv;
  }
  const draw = (cv, o) => (o && o.layout === 'classic' ? drawClassic : drawSimple)(cv, o);

  /* page UI (skipped in the test harness when the elements are missing) */
  const $ = (id) => document.getElementById(id);
  const CM = window.CM;
  if (CM && $('list-sheet')) {
    const opts = () => ({ year: CM.P.year, hols: CM.hols(CM.P.year), colour: CM.P.colour === 'custom' ? CM.P.custom : CM.P.colour, rcolour: CM.P.rcol, font: CM.P.font, header: CM.P.lhead,
      layout: CM.P.llay, sub: CM.P.lsub, deco: CM.P.ldeco, abcd: CM.P.labcd, merge: CM.P.lmerge, hcolour: CM.P.lhc }); /* CM12 */
    const canvas = () => draw(document.createElement('canvas'), opts());
    CM.listRender = () => draw($('list-sheet'), opts());
    const hi = $('list-header');
    if (hi) { hi.value = cleanHeader(CM.P.lhead); hi.oninput = () => { CM.P.lhead = cleanHeader(hi.value); CM.save(); CM.listRender(); }; }
    /* CM12: Classic / Simple options */
    const hcs = HCOLOURS, set = (k, v) => { CM.P[k] = v; CM.save(); syncL(); CM.listRender(); };
    function syncL() {
      if ($('list-layout')) $('list-layout').value = CM.P.llay;
      if ($('list-sub')) $('list-sub').value = CM.P.lsub;
      [['list-deco', 'ldeco'], ['list-abcd', 'labcd'], ['list-merge', 'lmerge']].forEach(([id, k]) => { if ($(id)) $(id).checked = CM.P[k] !== false; });
      if ($('list-hcustom')) $('list-hcustom').value = CM.P.lhc;
      document.querySelectorAll('#list-hcolours button').forEach((b) => b.classList.toggle('on', b.dataset.v === CM.P.lhc));
      document.querySelectorAll('.list-classic').forEach((e) => { e.hidden = CM.P.llay !== 'classic'; });
    }
    if ($('list-layout')) $('list-layout').onchange = () => set('llay', $('list-layout').value === 'simple' ? 'simple' : 'classic');
    if ($('list-sub')) $('list-sub').oninput = () => { CM.P.lsub = cleanHeader($('list-sub').value); CM.save(); CM.listRender(); };
    [['list-deco', 'ldeco'], ['list-abcd', 'labcd'], ['list-merge', 'lmerge']].forEach(([id, k]) => { if ($(id)) $(id).onchange = () => set(k, $(id).checked); });
    if ($('list-hcolours')) {
      $('list-hcolours').innerHTML = Object.keys(hcs).map((k) => '<button type="button" data-v="' + hcs[k] + '" style="background:' + hcs[k] + '" aria-label="' + k + '" title="' + k[0].toUpperCase() + k.slice(1) + '"></button>').join('');
      $('list-hcolours').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) set('lhc', b.dataset.v); });
    }
    if ($('list-hcustom')) $('list-hcustom').oninput = () => set('lhc', $('list-hcustom').value);
    syncL();
    $('list-print').onclick = () => {
      /* the list is always portrait: override the layout's @page / preview class while printing */
      const st = $('cm-page'); if (st) st.textContent = '@page{size:A4 portrait;margin:0}';
      document.body.classList.remove('land');
      const img = $('print-img');
      img.onload = () => { img.onload = null; setTimeout(() => { window.print(); CM.render(); }, 50); };
      img.src = canvas().toDataURL('image/png');
    };
    $('list-pdf').onclick = () => {
      const J = window.jspdf && window.jspdf.jsPDF;
      if (!J) { window.UiDialog.info('PDF not available', [['Reason', 'The PDF library did not load.']]); return; }
      const b = $('list-pdf'); b.disabled = true; b.textContent = 'Making PDF…';
      setTimeout(() => {
        try {
          const doc = new J({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
          doc.setProperties({ title: 'Holidays ' + CM.P.year, creator: 'Calendar Maker' });
          doc.addImage(canvas().toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
          doc.save('holidays-' + CM.P.year + '.pdf');
        } catch (e) {
          window.UiDialog.info('PDF failed', [['Error', String(e && e.message || e)]]);
        }
        b.disabled = false; b.textContent = 'Download PDF';
      }, 30);
    };
  }
  return { rows, draw, drawSimple, drawClassic, classicRows, dateTokens, daysText, sfx, wrap, HCOLOURS, cleanHeader, W, H }; /* CM12 */
})();
