/* Human Body Explorer HBE1 — draws the body as one SVG: the neutral outline, then the parts of the chosen view as layers.
   HB.drawBody(viewId, opts) returns the <svg>; each part is a <g class="hb-part" data-id>. opts.onPick(id) is called on tap.
   Small parts get a wide invisible stroke so they are easy to tap on a phone. No animation loop: cheap on weak phones. */
window.HB = window.HB || {};
(() => {
  const H = window.HB, NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const shape = (s, extra) => el(s[0], Object.assign({}, s[1], extra || {}));

  H.drawBody = (viewId, opts) => {
    opts = opts || {};
    const svg = el('svg', { viewBox: '0 0 200 420', class: 'hb-svg', role: 'img', 'aria-label': 'Human body, front view' });
    const body = el('g', { class: 'hb-body' });
    H.body.forEach(s => body.append(shape(s)));
    svg.append(body);
    H.partsOf(viewId).forEach(p => {
      const g = el('g', { class: 'hb-part', 'data-id': p.id, tabindex: 0, role: 'button', 'aria-label': p.name, style: '--pc:' + p.color });
      p.shapes.forEach(s => {
        const line = s[1].class === 'hb-line' || s[1].class === 'hb-bone';
        g.append(shape(s, line ? {} : { fill: p.color, class: 'hb-fill' }));
      });
      const hit = el('g', { class: 'hb-hit' });        // tap helper: same shapes, wide transparent stroke
      p.shapes.forEach(s => { if (!s[1].class) hit.append(shape(s, { fill: 'transparent', stroke: 'transparent', 'stroke-width': 10 })); });
      g.append(hit);
      const title = el('title', {}); title.textContent = p.name; g.append(title);
      svg.append(g);
    });
    const pick = e => { const g = e.target.closest && e.target.closest('.hb-part'); if (g && opts.onPick) opts.onPick(g.getAttribute('data-id')); };
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
