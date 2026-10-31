/* Calendar Maker CM13 render: Holiday List page (CM10), shared parts + layout dispatcher. window.CM.List
   A printable A4 portrait list for the chosen year, drawn on one 250 dpi canvas (2067 x 2923) used for the
   preview, Print and the PDF. Main (Gazetted) holidays first in date order, then a 'Restricted Holidays' section.
   CM.List.draw(canvas, o) with o = { year, hols, colour, rcolour, font, header, layout: 'classic'|'simple',
     sub, deco, abcd, merge, hcolour,
     band, bandc (CM16-F2 striped rows), showr (CM16-F3 restricted section on/off),
     pcolour, scolour, showp, shows (CM18 Public / School sections) }.
   Layouts (CM12): 'classic' (render/cm_list_classic.js, the page default) | 'simple' (render/cm_list_simple.js,
   CM10, also used when o.layout is missing). */
window.CM = window.CM || {};
window.CM.List = (function () {
  'use strict';
  const C = window.CM.Canvas, Hd = window.CM.Holidays;

  /* CM18: extra list sections after Restricted [key, heading, type] */
  const SECS = [['pub', 'Public Holidays', 'p'], ['sch', 'School Holidays', 's']];
  /* CM18: heading row fill: Public / School colour, else the Restricted colour */
  const headFill = (r, o) => (r.t === 'p' ? window.CM.Theme.publicColour(o.pcolour)
    : r.t === 's' ? window.CM.Theme.schoolColour(o.scolour) : window.CM.Theme.restrictedColour(o.rcolour));
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
    SECS.forEach(([k, text, t]) => { /* CM18: Public, School sections */
      if (!sec[k].length) return;
      out.push({ head: true, text, t }); sec[k].forEach((h) => out.push(Object.assign(one(h, false), { t })));
    });
    return out;
  }
  /* header text: one line, control chars removed, max 80 chars (drawn on canvas, so no HTML escaping needed) */
  const cleanHeader = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 80);

  /* CM16-F2: banded rows (Excel striped table). Presets + resolver; o.band false = no stripes (old look),
     o.bandc '#rrggbb' (bad/missing -> light blue). Stripe k = 0,1,2.. within a section: odd k shaded. */
  const BANDS = { blue: '#ddebf7', grey: '#ededed', green: '#e2efda' };
  const HEX6 = /^#[0-9a-fA-F]{6}$/;
  const bandColour = (o) => (o && o.band === false ? null : (o && HEX6.test(o.bandc) ? o.bandc : BANDS.blue));
  /* CM16-F3: o.showr false -> restricted holidays (and their heading) left out of the list */
  /* const listHols = (o) => (o && o.showr === false ? (o.hols || []).filter((h) => !h.r) : o.hols);  (CM16-F3-CM17) */
  /* CM18: + o.showp / o.shows false -> Public / School sections left out */
  const listHols = (o) => {
    const off = { r: o && o.showr === false, p: o && o.showp === false, s: o && o.shows === false };
    return off.r || off.p || off.s ? (o.hols || []).filter((h) => !off[Hd.typeOf(h)]) : o.hols;
  };

  const api = { SECS, headFill, BANDS, bandColour, listHols, rows, cleanHeader, W: C.W, H: C.H, sfx: Hd.sfx, wrap: C.wrap, HCOLOURS: window.CM.Theme.HCOLOURS };
  /* drawSimple / drawClassic / classicRows / dateTokens / daysText are added by the layout files */
  /* api.draw = (cv, o) => (o && o.layout === 'classic' ? api.drawClassic : api.drawSimple)(cv, o);  (CM12-CM16-F1) */
  api.draw = (cv, o) => { /* CM16-F3: restricted section dropped here, so both layouts get the freed space */
    const o2 = o && (o.showr === false || o.showp === false || o.shows === false) ? Object.assign({}, o, { hols: listHols(o) }) : o;
    return (o2 && o2.layout === 'classic' ? api.drawClassic : api.drawSimple)(cv, o2);
  };
  return api;
})();
