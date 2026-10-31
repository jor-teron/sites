/* Calendar Maker CM13 render: Holiday List 'Simple' layout (CM10/CM11). Adds CM.List.drawSimple.
   Title 'Holidays YEAR' (optional header above), columns Date | Weekday | Holiday, header row on the holiday
   colour, Restricted heading row on the Restricted colour, rows sized to fill the page (up to 14 mm). */
(function () {
  'use strict';
  const T = window.CM.Theme, C = window.CM.Canvas, Hd = window.CM.Holidays, L = window.CM.List;
  const PX_MM = C.PX_MM, W = C.W, H = C.H, font = C.font;

  function drawSimple(cv, o) { /* CM12: was draw() (CM10/CM11), unchanged */
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const fc = T.fontColour(o.font), hc = T.holidayColour(o.colour), rc = T.restrictedColour(o.rcolour);
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    const M = C.margin();
    /* title band, tight like the sheet title */
    const TFS = 96, capH = Math.round(TFS * 0.72);
    c.fillStyle = fc; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    /* user header (e.g. organisation name) above the title; empty = not drawn, no space */
    const head = L.cleanHeader(o.header);
    let ty = M;
    if (head) {
      const HFS = C.fitFont(c, '800', 84, 30, W - 2 * M, () => head);
      const hcap = Math.round(HFS * 0.72); c.fillText(head, W / 2, ty + hcap); ty += hcap + Math.round(2 * PX_MM);
    }
    c.font = font('800', TFS);
    c.fillText('Holidays ' + o.year, W / 2, ty + capH);
    c.textBaseline = 'middle';
    const top = ty + capH + Math.round(2 * PX_MM);
    const list = L.rows(o.hols, o.year);
    const n = 1 + Math.max(1, list.length); /* header + rows (or one 'No holidays' row) */
    const RH = Math.max(40, Math.min(Math.round(14 * PX_MM), Math.floor((H - top - M) / n))); /* row height, up to 14 mm */
    const FS = Math.round(Math.max(22, Math.min(72, RH * 0.55)));
    /* const TW = W - 2 * M, cx = [M, M + Math.round(TW * 0.2), M + Math.round(TW * 0.36), W - M];  (CM10) */
    const wide = list.some((r) => r.em != null); /* CM11: room for '30 Sep–02 Oct' and 'Tue–Fri' */
    const TW = W - 2 * M;
    const cx = wide ? [M, M + Math.round(TW * 0.27), M + Math.round(TW * 0.45), W - M]
      : [M, M + Math.round(TW * 0.2), M + Math.round(TW * 0.36), W - M];
    let yy = top;
    /* header row on the holiday colour */
    c.fillStyle = hc; c.fillRect(cx[0], yy, TW, RH);
    c.fillStyle = fc; c.font = font('700', FS); c.textAlign = 'left';
    const pad = Math.round(FS * 0.4);
    ['Date', 'Weekday', 'Holiday'].forEach((s, i) => c.fillText(s, cx[i] + pad, yy + RH / 2));
    const lines = [[yy, true]];
    yy += RH;
    if (!list.length) {
      c.font = font('400', FS); c.fillText('No holidays', cx[0] + pad, yy + RH / 2);
      lines.push([yy, false]); yy += RH;
    }
    list.forEach((r) => {
      if (r.head) {
        c.fillStyle = rc; c.fillRect(cx[0], yy, TW, RH);
        c.fillStyle = fc; c.font = font('700', FS); c.fillText(r.text, cx[0] + pad, yy + RH / 2);
        lines.push([yy, false]); yy += RH; return;
      }
      c.fillStyle = fc; c.font = font('700', FS);
      /* c.fillText(String(r.d).padStart(2, '0') + ' ' + MS[r.m], cx[0] + pad, yy + RH / 2);  (CM10) */
      c.fillText(r.date || (String(r.d).padStart(2, '0') + ' ' + Hd.MS[r.m]), cx[0] + pad, yy + RH / 2); /* CM11 */
      c.font = font('400', FS);
      c.fillText(r.wd, cx[1] + pad, yy + RH / 2);
      c.fillText(C.ellipsis(c, r.name, cx[3] - cx[2] - 2 * pad), cx[2] + pad, yy + RH / 2);
      lines.push([yy, true]); yy += RH;
    });
    /* Excel 'All Borders': every line #333, same weight inside and outside; heading rows merged (no column lines) */
    const segs = [];
    lines.forEach(([ly, cols]) => {
      segs.push([cx[0], ly, cx[3], ly]);
      if (cols) for (let i = 1; i < 3; i++) segs.push([cx[i], ly, cx[i], ly + RH]);
    });
    C.borders(c, segs, [cx[0], top, cx[3], yy], false);
    return cv;
  }
  L.drawSimple = drawSimple;
})();
