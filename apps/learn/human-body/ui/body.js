/* Human Body Explorer HBE2 — draws the body as one SVG: the neutral outline, then the parts of the chosen view as layers.
   HB.drawBody(viewId, opts) returns the <svg>; each part is a <g class="hb-part" data-id>. opts.onPick(id) is called on tap.
   Back parts (p.back) are drawn first and dashed/faded; line parts (class hb-str) are coloured strokes.
   Tap targets live in one top layer (.hb-hits), smallest parts on top, with a slightly wider invisible stroke. No animation loop: cheap on weak phones. */
window.HB = window.HB || {};
(() => {
  const H = window.HB, NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const shape = (s, extra) => el(s[0], Object.assign({}, s[1], extra || {}));

  // rough area of a filled shape in viewBox units, only used to stack tap targets (small on top)
  const areaOf = (s) => {
    const a = s[1];
    if (s[0] === 'ellipse') return Math.PI * a.rx * a.ry;
    if (s[0] === 'circle') return Math.PI * a.r * a.r;
    if (s[0] === 'rect') return a.width * a.height;
    const n = String(a.d || '').match(/-?\d+(\.\d+)?/g) || [];   // path: bounding box of its numbers taken as x,y pairs
    const xs = n.filter((_, i) => i % 2 === 0).map(Number), ys = n.filter((_, i) => i % 2).map(Number);
    return xs.length ? (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) : 0;
  };

  H.drawBody = (viewId, opts) => {
    opts = opts || {};
    const svg = el('svg', { viewBox: '0 0 200 420', class: 'hb-svg', role: 'img', 'aria-label': 'Human body, front view' });
    const body = el('g', { class: 'hb-body' });
    H.body.forEach(s => body.append(shape(s)));
    svg.append(body);
    const hits = [];
    H.partsOf(viewId).forEach(p => {
      const g = el('g', { class: 'hb-part' + (p.back ? ' hb-back' : ''), 'data-id': p.id, tabindex: 0, role: 'button', 'aria-label': p.name + (p.back ? ' (at the back)' : ''), style: '--pc:' + p.color });
      p.shapes.forEach(s => {
        const c = s[1].class, str = c === 'hb-str', deco = c === 'hb-line' || c === 'hb-bone';
        g.append(shape(s, str ? { fill: 'none', stroke: p.color, class: 'hb-str hb-fill' } : deco ? {} : { fill: p.color, class: 'hb-fill' }));
        if (deco) return;
        // tap helper: the same shape, transparent and a little wider, ranked by its own size
        hits.push([str ? 0 : areaOf(s), shape(s, { fill: str ? 'none' : 'transparent', stroke: 'transparent', 'stroke-width': str ? Math.max(10, (+s[1]['stroke-width'] || 4) + 7) : 6, class: '', 'data-id': p.id })]);
      });
      const title = el('title', {}); title.textContent = p.name; g.append(title);
      svg.append(g);
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
