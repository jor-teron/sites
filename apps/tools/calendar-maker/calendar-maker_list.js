/* Calendar Maker CM10: Holiday List page - a printable A4 portrait list for the chosen year.
   Columns Date | Weekday | Holiday. Main (Gazetted) holidays first in date order, then a 'Restricted Holidays'
   section (heading row on the Restricted colour), each in date order. Same merged holiday set as the sheet (CM.hols).
   Drawn on one 250 dpi canvas (2067 x 2923) used for the preview, Print and the PDF (jsPDF in vendor/).
   window.CMList = { rows(hols, year), draw(canvas, o) } with o = { year, hols, colour, rcolour, font, header }. */
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
    const one = (h, r) => ({ m: h.m, d: h.d, wd: WD[new Date(y, h.m, h.d).getDay()], name: h.name, r });
    const out = sec.gaz.map((h) => one(h, false));
    if (sec.res.length) { out.push({ head: true, text: 'Restricted Holidays' }); sec.res.forEach((h) => out.push(one(h, true))); }
    return out;
  }

  /* header text: one line, control chars removed, max 80 chars (drawn on canvas, so no HTML escaping needed) */
  const cleanHeader = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

  function draw(cv, o) {
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
    const TW = W - 2 * M, cx = [M, M + Math.round(TW * 0.2), M + Math.round(TW * 0.36), W - M];
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
      c.fillText(String(r.d).padStart(2, '0') + ' ' + MS[r.m], cx[0] + pad, yy + RH / 2);
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

  /* page UI (skipped in the test harness when the elements are missing) */
  const $ = (id) => document.getElementById(id);
  const CM = window.CM;
  if (CM && $('list-sheet')) {
    const opts = () => ({ year: CM.P.year, hols: CM.hols(CM.P.year), colour: CM.P.colour === 'custom' ? CM.P.custom : CM.P.colour, rcolour: CM.P.rcol, font: CM.P.font, header: CM.P.lhead });
    const canvas = () => draw(document.createElement('canvas'), opts());
    CM.listRender = () => draw($('list-sheet'), opts());
    const hi = $('list-header');
    if (hi) { hi.value = cleanHeader(CM.P.lhead); hi.oninput = () => { CM.P.lhead = cleanHeader(hi.value); CM.save(); CM.listRender(); }; }
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
  return { rows, draw, cleanHeader, W, H };
})();
