/* Human Body Explorer HBE3 — draws the body as one SVG: shading defs, the smooth outline, then the parts of the chosen view as layers.
   HB.drawBody(viewId, opts) returns the <svg>; each part is a <g class="hb-part" data-id>. opts.onPick(id) is called on tap; opts.side = 'front' | 'back'.
   Inside: organs get a soft radial gradient (light spot top-left), muscles a fibre texture, bones a dark rim (data-ol shapes).
   Back parts (p.back) are drawn first and dashed/faded; line parts (class hb-str) are coloured strokes; hb-deco shapes are drawing only.
   External (view ids 'e-...'): a skin-toned figure, zoomed per group (view.vb); visible features (hair, eyes, lips...) keep their natural fill,
   other parts are tap zones that tint and glow when picked; features outside the view are drawn as plain context.
   Tap targets live in one top layer (.hb-hits), smallest parts on top. No animation loop: cheap on weak phones (one CSS fade-in). */
window.HB = window.HB || {};
(() => {
  const H = window.HB, NS = 'http://www.w3.org/2000/svg';
  let uid = 0;
  const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const shape = (s, extra) => el(s[0], Object.assign({}, s[1], extra || {}));
  const mix = (hex, t) => {                         // t > 0 towards white, t < 0 towards black
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(t > 0 ? v + (255 - v) * t : v * (1 + t)));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  };

  // rough area of a filled shape in viewBox units, only used to stack tap targets (small on top)
  const areaOf = (s) => {
    const a = s[1];
    if (a['data-a']) return +a['data-a'];
    if (s[0] === 'ellipse') return Math.PI * a.rx * a.ry;
    if (s[0] === 'circle') return Math.PI * a.r * a.r;
    if (s[0] === 'rect') return a.width * a.height;
    const n = String(a.d || '').replace(/[aA][^MLCQZmlcqz]*/g, ' ').match(/-?\d+(\.\d+)?/g) || [];   // path: bounding box of its numbers taken as x,y pairs
    const xs = n.filter((_, i) => i % 2 === 0).map(Number), ys = n.filter((_, i) => i % 2).map(Number);
    return xs.length ? (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) : 0;
  };

  function defs(id, parts, ext) {
    const d = el('defs', {});
    const lin = (gid, stops) => { const g = el('linearGradient', { id: gid, x1: 0, x2: 1, y1: 0, y2: 0 });
      stops.forEach(([o, c]) => g.append(el('stop', { offset: o, style: 'stop-color:' + c }))); d.append(g); };
    lin(id + 'skin', ext ? [[0, 'var(--eskin-lo)'], [0.38, 'var(--eskin-hi)'], [0.62, 'var(--eskin-hi)'], [1, 'var(--eskin-lo)']]
      : [[0, 'var(--skin-lo)'], [0.4, 'var(--skin-hi)'], [0.6, 'var(--skin-hi)'], [1, 'var(--skin-lo)']]);
    parts.forEach(p => {                            // one soft radial gradient per part colour
      const g = el('radialGradient', { id: id + 'g-' + p.id, cx: 0.42, cy: 0.38, r: 0.75, fx: 0.32, fy: 0.26 });
      [[0, mix(p.color, 0.45)], [0.55, p.color], [1, mix(p.color, -0.28)]].forEach(([o, c]) => g.append(el('stop', { offset: o, 'stop-color': c })));
      d.append(g);
    });
    const pat = el('pattern', { id: id + 'fib', width: 3, height: 3, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(12)' });
    pat.append(el('path', { d: 'M0 0 V3', stroke: 'rgba(60,0,0,.35)', 'stroke-width': 0.7 }), el('path', { d: 'M1.6 0 V3', stroke: 'rgba(255,220,220,.18)', 'stroke-width': 0.5 }));
    d.append(pat);
    return d;
  }

  H.drawBody = (viewId, opts) => {
    opts = opts || {};
    const ext = H.isExtView(viewId), side = opts.side || H.side, id = 'hb' + (++uid) + '-';
    const view = H.viewsNow().find(v => v.id === viewId) || {};
    const parts = H.partsOf(viewId, side);
    const svg = el('svg', { viewBox: (ext && view.vb) || '0 0 200 420', class: 'hb-svg' + (ext ? ' hb-ext' : ''), role: 'img',
      'aria-label': 'Human body, ' + (ext && side === 'back' ? 'back' : 'front') + ' view' });
    svg.append(defs(id, parts, ext));
    const under = el('g', {}), body = el('g', { class: 'hb-body' });
    svg.append(under, body);
    H.body.forEach(s => body.append(shape(s, { fill: `url(#${id}skin)` })));
    if (ext) {
      body.append(el('path', { class: 'hb-crease', d: side === 'back' ? 'M100 92 V200 M70 112 Q78 124 88 114 M130 112 Q122 124 112 114 M76 338 q5 2 9 0 M124 338 q-5 2 -9 0'
        : 'M66 95 Q82 93 96 96 M134 95 Q118 93 104 96 M76 334 q5 3 9 0 M124 334 q-5 3 -9 0 M100 200 v0' }));
      // context: natural features that are not in this view still show (eyes, hair, lips...), with no tap
      const inView = {}; parts.forEach(p => { inView[p.id] = 1; });
      H.ext.forEach(p => { if (inView[p.id] || !p.fill || !H.onSide(p, side)) return;
        const g = el('g', { class: 'hb-ctx', 'aria-hidden': 'true' });
        (side === 'back' ? p.bshapes : p.shapes).forEach(s => g.append(shape(s, s[1].class === 'hb-deco' ? {} : { fill: p.fill })));
        (p.under ? under : svg).append(g); });
    }
    const hits = [];
    parts.forEach(p => {
      const g = el('g', { class: 'hb-part' + (!ext && p.back ? ' hb-back' : '') + (p.skin ? ' hb-skinpart' : ''), 'data-id': p.id, tabindex: 0, role: 'button',
        'aria-label': p.name + (!ext && p.back ? ' (at the back)' : ''), style: '--pc:' + p.color });
      const shapes = ext && side === 'back' ? p.bshapes : p.shapes, musc = !ext && p.sys === 'muscles';
      shapes.forEach(s => {
        const c = s[1].class, str = c === 'hb-str', deco = c === 'hb-line' || c === 'hb-bone' || c === 'hb-deco';
        if (s[1]['data-ol']) g.append(shape(s, { fill: 'rgba(40,30,10,.55)', stroke: 'rgba(40,30,10,.55)', 'stroke-width': 1.6 }));   // dark rim under bones
        const fill = ext ? (p.fill || p.color) : `url(#${id}g-${p.id})`;
        g.append(shape(s, str ? { fill: 'none', stroke: p.color, class: 'hb-str hb-fill' } : deco ? {}
          : { fill, class: 'hb-fill' + (ext ? (p.fill ? ' hb-feat' : ' hb-zone') : '') + (s[1]['data-ol'] ? ' hb-nos' : '') }));
        if (musc && !str && !deco) g.append(shape(s, { fill: `url(#${id}fib)`, class: 'hb-tex' }));
        if (deco) return;
        // tap helper: the same shape, transparent and a little wider, ranked by its own size
        hits.push([str ? 0 : areaOf(s), shape(s, { fill: str ? 'none' : 'transparent', stroke: 'transparent', 'stroke-width': str ? Math.max(10, (+s[1]['stroke-width'] || 4) + 7) : ext ? 1.5 : 6, class: '', 'data-id': p.id })]);
      });
      const title = el('title', {}); title.textContent = p.name; g.append(title);
      (p.under ? under : svg).append(g);
    });
    // All tap shapes sit in one top layer, biggest shape first, so a small shape (or a thin line) on top of a big one is still tappable.
    const layer = el('g', { class: 'hb-hits' });
    hits.sort((x, y) => y[0] - x[0]).forEach(x => layer.append(x[1]));
    svg.append(layer);
    const pick = e => { const g = e.target.closest && e.target.closest('[data-id]'); if (g && opts.onPick) opts.onPick(g.getAttribute('data-id')); };
    svg.addEventListener('click', pick);
    svg.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); } });
    return svg;
  };

  H.highlight = (svg, id, cls) => {
    cls = cls || 'on';
    svg.querySelectorAll('.hb-part').forEach(g => g.classList.toggle(cls, g.getAttribute('data-id') === id));
    if (cls === 'on') svg.classList.toggle('has-on', !!id);
  };
})();
