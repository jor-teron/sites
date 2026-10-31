/* Calendar Maker CM13 render: Holiday List page (CM10), shared parts + layout dispatcher. window.CM.List
   A printable A4 portrait list for the chosen year, drawn on one 250 dpi canvas (2067 x 2923) used for the
   preview, Print and the PDF. Main (Gazetted) holidays first in date order, then a 'Restricted Holidays' section.
   CM.List.draw(canvas, o) with o = { year, hols, colour, rcolour, font, header, layout: 'classic'|'simple',
     sub, deco, abcd, merge, hcolour }.
   Layouts (CM12): 'classic' (render/cm_list_classic.js, the page default) | 'simple' (render/cm_list_simple.js,
   CM10, also used when o.layout is missing). */
window.CM = window.CM || {};
window.CM.List = (function () {
  'use strict';
  const C = window.CM.Canvas, Hd = window.CM.Holidays;

  /* Simple table rows: [{head:true,text}] for headings, else {m,d,wd,name,r,date,em?,ed?} */
  function rows(hols, y) {
    const WD = Hd.WD, sec = Hd.stripSections(hols || []);
    /* const one = (h, r) => ({ m: h.m, d: h.d, wd: WD[new Date(y, h.m, h.d).getDay()], name: h.name, r });  (CM10) */
    const one = (h, r) => { /* CM11: ranges -> date '20–23 Oct', weekday 'Tue–Fri' */
      const o = { m: h.m, d: h.d, wd: WD[new Date(y, h.m, h.d).getDay()], name: h.name, r, date: Hd.dateText(h) };
      if (h.em != null) { o.em = h.em; o.ed = h.ed; o.wd += '–' + WD[new Date(y, h.em, h.ed).getDay()]; }
      return o;
    };
    const out = sec.gaz.map((h) => one(h, false));
    if (sec.res.length) {
      out.push({ head: true, text: 'Restricted Holidays' });
      sec.res.forEach((h) => out.push(one(h, true)));
    }
    return out;
  }
  /* header text: one line, control chars removed, max 80 chars (drawn on canvas, so no HTML escaping needed) */
  const cleanHeader = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 80);

  const api = { rows, cleanHeader, W: C.W, H: C.H, sfx: Hd.sfx, wrap: C.wrap, HCOLOURS: window.CM.Theme.HCOLOURS };
  /* drawSimple / drawClassic / classicRows / dateTokens / daysText are added by the layout files */
  api.draw = (cv, o) => (o && o.layout === 'classic' ? api.drawClassic : api.drawSimple)(cv, o);
  return api;
})();
