/* Clock Reading CR3 — the clock, drawn in code as one SVG in 7 styles (CR.styles in core/styles.js): Simple, Railway station,
   Roman wall clock, Pocket watch, Grandfather clock (swinging pendulum), Cuckoo clock (carved house, the bird pops out on the
   hour) and Sundial (a shadow instead of hands). Hour hand black, minute hand blue, second hand red on a light face.
   Every part a child can ask about carries data-part (face, rim, hour, minute, second, pin, h1..h12, m1..m59 between the hours,
   and the style's own extras); hour and minute marks have invisible tap areas (.cr-hit, above the hands) so they are easy to hit on a phone.
   Only the hand transforms change on each tick (1 a second); the pendulum swings with one SMIL animation (none with reduced motion).
   CR.makeClock() -> { el, style(id), set(t, sec), seconds(on), styleId }.  CR.miniClock(id) -> a small static svg (10:10). */
window.CR = window.CR || {};
(() => {
  const C = window.CR, NS = 'http://www.w3.org/2000/svg';
  const el = (tag, a, txt) => { const e = document.createElementNS(NS, tag); for (const k in a) if (a[k] != null) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; };
  const pol = (deg, r) => { const a = (deg - 90) * Math.PI / 180; return [+(r * Math.cos(a)).toFixed(2), +(r * Math.sin(a)).toFixed(2)]; };
  const grp = (part, cls, ...kids) => { const g = el('g', { 'data-part': part, class: cls }); kids.forEach(k => k && g.append(k)); return g; };
  const still = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const VIEW = { simple: '-110 -110 220 220', rail: '-110 -110 220 220', roman: '-114 -114 228 228', pocket: '-128 -162 256 278',
    grand: '-126 -140 252 492', cuckoo: '-142 -214 284 470', sun: '-114 -114 228 228' };
  // a pendulum: rod + bob from a pivot, swinging +-deg once per `dur` seconds each way
  function pendulum(px, py, len, bob, deg, dur, mini, leaf) {
    const g = grp('pendulum', 'cr-pend');
    g.append(el('line', { x1: px, y1: py, x2: px, y2: py + len, class: 'cr-rod' }),
      leaf ? el('path', { d: `M${px} ${py + len - bob} q ${bob} ${bob} 0 ${bob * 2.2} q ${-bob} ${-bob * 1.2} 0 ${-bob * 2.2}z`, class: 'cr-leaf' })
        : el('circle', { cx: px, cy: py + len, r: bob, class: 'cr-bob' }),
      el('line', { x1: px, y1: py, x2: px, y2: py + len + bob, class: 'cr-hit cr-hitw' }));
    if (!mini && !still()) g.append(el('animateTransform', { attributeName: 'transform', type: 'rotate', dur: dur * 2 + 's', repeatCount: 'indefinite',
      values: `${-deg} ${px} ${py};${deg} ${px} ${py};${-deg} ${px} ${py}`, calcMode: 'spline', keyTimes: '0;0.5;1', keySplines: '0.45 0 0.55 1;0.45 0 0.55 1' }));
    else g.setAttribute('transform', `rotate(${deg * 0.6} ${px} ${py})`);
    return g;
  }
  // the parts around the dial (drawn first, under it) and on top of it (after it)
  const EXTRA = {
    pocket(svg) {
      svg.append(grp('chain', 'cr-chain', el('path', { d: 'M14 -150 C 70 -178 132 -138 120 -40 S 96 60 118 108', class: 'cr-chainv' }),
        el('path', { d: 'M14 -150 C 70 -178 132 -138 120 -40 S 96 60 118 108', class: 'cr-hit cr-hitw' })),
        grp('bow', 'cr-gold', el('circle', { cy: -140, r: 15, class: 'cr-bow' }), el('circle', { cy: -140, r: 19, class: 'cr-hit' })),
        grp('crown', 'cr-gold', el('rect', { x: -11, y: -126, width: 22, height: 20, rx: 4, class: 'cr-crown' }),
          ...[-6, -2, 2, 6].map(x => el('line', { x1: x, y1: -124, x2: x, y2: -108, class: 'cr-ridge' }))));
    },
    grand(svg, mini) {
      svg.append(grp('case', 'cr-wood', el('path', { d: 'M-118 120 V-108 Q-118 -134 -90 -134 H90 Q118 -134 118 -108 V120 Z', class: 'cr-woodv' }),
        el('rect', { x: -72, y: 116, width: 144, height: 196, class: 'cr-woodv' }), el('rect', { x: -96, y: 308, width: 192, height: 40, rx: 4, class: 'cr-woodv cr-dark' }),
        el('rect', { x: -48, y: 130, width: 96, height: 166, rx: 6, class: 'cr-glass' })),
        pendulum(0, 112, 150, 18, 7, 1, mini));
    },
    cuckoo(svg, mini) {
      const leaves = [[-92, -84], [92, -84], [-96, 104], [96, 104]].map(([x, y]) => el('ellipse', { cx: x, cy: y, rx: 16, ry: 8, transform: `rotate(${x * y > 0 ? 35 : -35} ${x} ${y})`, class: 'cr-carve' }));
      svg.append(grp('weights', 'cr-wts', el('line', { x1: -42, y1: 110, x2: -42, y2: 196, class: 'cr-chainl' }), el('line', { x1: 42, y1: 110, x2: 42, y2: 176, class: 'cr-chainl' }),
        ...[[-42, 222], [42, 202]].map(([x, y]) => el('path', { d: `M${x - 11} ${y - 24} Q${x} ${y - 30} ${x + 11} ${y - 24} L${x + 9} ${y + 12} Q${x} ${y + 26} ${x - 9} ${y + 12} Z`, class: 'cr-cone' })),
        ...[[-42, 222], [42, 202]].map(([x, y]) => el('path', { d: `M${x - 8} ${y - 12} h16 M${x - 9} ${y} h18 M${x - 7} ${y + 12} h14`, class: 'cr-scale' })),
        el('rect', { x: -56, y: 110, width: 112, height: 130, class: 'cr-hit' })),
        pendulum(0, 112, 92, 13, 12, 0.5, mini, true),
        grp('rim', 'cr-wood', el('rect', { x: -112, y: -100, width: 224, height: 218, rx: 8, class: 'cr-woodv' }), ...leaves),
        grp('roof', 'cr-wood', el('path', { d: 'M-140 -92 L0 -210 L140 -92 L122 -82 L0 -186 L-122 -82 Z', class: 'cr-woodv cr-dark' }),
          el('path', { d: 'M-120 -84 L0 -184 L120 -84 Z', class: 'cr-woodv' }), ...[-60, 60].map(x => el('ellipse', { cx: x, cy: -112, rx: 14, ry: 7, class: 'cr-carve', transform: `rotate(${x > 0 ? 30 : -30} ${x} -112)` }))),
        grp('bird', 'cr-birdg', el('rect', { x: -17, y: -164, width: 34, height: 40, rx: 3, class: 'cr-door' }), el('rect', { x: -17, y: -164, width: 34, height: 40, rx: 3, class: 'cr-doorhole' }),
          el('g', { class: 'cr-bird' }, el('ellipse', { cx: 0, cy: -142, rx: 15, ry: 10, class: 'cr-birdb' }), el('circle', { cx: 10, cy: -150, r: 7, class: 'cr-birdb' }),
            el('path', { d: 'M16 -151 l10 2 l-10 3 z', class: 'cr-beak' }), el('circle', { cx: 12, cy: -152, r: 1.6, class: 'cr-eye' }))));
    },
    roman(svg) { svg.append(grp('rim', 'cr-wood', el('circle', { r: 112, class: 'cr-woodv' }))); }
  };
  function draw(svg, id, mini) {
    const st = C.styleById(id), sun = !st.hands;
    svg.replaceChildren(); svg.setAttribute('viewBox', VIEW[id] || VIEW.simple); svg.setAttribute('class', 'cr-clock st-' + st.id + (mini ? ' cr-mini' : ''));
    if (EXTRA[id]) EXTRA[id](svg, mini);
    if (id !== 'roman' || mini) svg.append(el('circle', { r: 104, class: 'cr-rim', 'data-part': id === 'roman' ? null : 'rim' }));
    else svg.append(el('circle', { r: 104, class: 'cr-rim cr-brass' }));
    svg.append(el('circle', { r: 98, class: 'cr-face', 'data-part': 'face' }));
    const ticks = el('g', { class: 'cr-ticks' }), nums = el('g', { class: 'cr-nums' }), hits = el('g', { class: 'cr-hits' });
    for (let i = 0; i < 60; i++) {
      const big = i % 5 === 0, rail = st.numerals === 'rail', [x1, y1] = pol(i * 6, big ? (rail ? 72 : 84) : 89), [x2, y2] = pol(i * 6, 95);
      if (!(rail && big && (i / 5) % 3 === 0)) ticks.append(el('line', { x1, y1, x2, y2, class: big ? (rail ? 'cr-bar' : 'cr-tick5') : 'cr-tick' }));
      if (!mini && !big) hits.append(el('circle', { cx: pol(i * 6, 91)[0], cy: pol(i * 6, 91)[1], r: 4.6, class: 'cr-hit', 'data-part': 'm' + i }));
    }
    if (sun) for (let n = 1; n <= 12; n++) { const [x, y] = pol(n * 30, 84); ticks.append(el('line', { x1: 0, y1: 0, x2: x, y2: y, class: 'cr-sunline' })); }
    for (let n = 1; n <= 12; n++) {
      const lab = C.hourLabel(st, n), rr = st.numerals === 'roman' ? 72 : 71, [x, y] = pol(n * 30, rr);
      if (lab) nums.append(el('text', { x, y: y + (st.numerals === 'roman' ? 5.5 : 6.5), class: 'cr-num' + (st.numerals === 'roman' ? ' cr-rom' : st.numerals === 'fancy' ? ' cr-fancy' : '') }, lab));
      if (!mini) { const [hx, hy] = pol(n * 30, 76), [ax, ay] = pol(n * 30, 84), [bx, by] = pol(n * 30, 96);
        hits.append(grp('h' + n, null, el('circle', { cx: hx, cy: hy, r: 14, class: 'cr-hit' }), el('line', { x1: ax, y1: ay, x2: bx, y2: by, class: 'cr-hit cr-hitw' }))); }
    }
    svg.append(ticks, nums);
    if (EXTRA[id + 'Top']) EXTRA[id + 'Top'](svg, mini);
    const R = {};
    if (sun) {
      R.shadow = grp('shadow', 'cr-shadow', el('path', { d: 'M-5 0 L-1.5 -64 L1.5 -64 L5 0 Z', class: 'cr-shadowv' }), el('path', { d: 'M0 0 L0 -64', class: 'cr-hit cr-hitw' }));
      svg.append(R.shadow, grp('gnomon', 'cr-gnomon', el('path', { d: 'M-3.5 12 L-1.2 -60 L1.2 -60 L3.5 12 Z', class: 'cr-gnomonv' }), el('path', { d: 'M0 12 L0 -60', class: 'cr-hit cr-hitw' })));
    } else {
      const rail = st.id === 'rail', thin = st.id === 'pocket' ? 0.75 : 1;
      const hand = (part, cls, len, w, tail) => grp(part, 'cr-hand ' + cls, el('line', { x1: 0, y1: tail, x2: 0, y2: -len, 'stroke-width': w * thin, class: 'cr-hv' + (rail ? ' cr-butt' : '') }),
        el('line', { x1: 0, y1: 0, x2: 0, y2: -len, class: 'cr-hit cr-hitw' }));
      R.h = hand('hour', 'cr-hh', 50, 8, 12); R.m = hand('minute', 'cr-mh', 80, 5, 12); R.s = hand('second', 'cr-sh', rail ? 62 : 86, 1.8, 20);
      if (rail) R.s.insertBefore(el('circle', { cy: -66, r: 7, class: 'cr-lolly' }), R.s.lastChild);
      svg.append(R.h, R.m, R.s, el('circle', { r: 6, class: 'cr-pin', 'data-part': 'pin' }), el('circle', { r: 11, class: 'cr-hit', 'data-part': 'pin' }));
    }
    svg.insertBefore(hits, svg.querySelector('[data-part=pin]') || null);   // the mark tap areas sit above the hands (the hands stay tappable along their length)
    R.bird = svg.querySelector('.cr-birdg');
    return R;
  }
  function paint(R, t, sec) {
    const m = C.min(t), h = C.h24(t) % 12, ha = h * 30 + m * 0.5;
    if (R.shadow) R.shadow.setAttribute('transform', `rotate(${ha})`);
    if (R.h) { R.h.setAttribute('transform', `rotate(${ha})`); R.m.setAttribute('transform', `rotate(${m * 6})`);
      R.s.style.display = sec == null ? 'none' : ''; if (sec != null) R.s.setAttribute('transform', `rotate(${sec * 6})`); }
    if (R.bird) R.bird.classList.toggle('out', m === 0 && (sec == null || sec < 20));   // the cuckoo is out for the first 20 s of each hour
  }
  C.makeClock = () => {
    const svg = el('svg', { role: 'img', 'aria-label': 'Clock' });
    let R = {}, t = 0, sec = 0, showSec = true, styleId = 'simple';
    const api = {
      el: svg, get styleId() { return styleId; },
      style(id) { styleId = C.styleById(id).id; R = draw(svg, styleId, false); paint(R, t, showSec ? sec : null); },
      set(v, s) { t = C.norm(v); sec = s; paint(R, t, showSec ? sec : null); svg.setAttribute('aria-label', C.styleById(styleId).name + ' showing ' + C.words(t)); },
      seconds(on) { showSec = !!on; paint(R, t, showSec ? sec : null); }
    };
    return api;
  };
  C.miniClock = id => { const svg = el('svg', { 'aria-hidden': 'true', focusable: 'false' }); paint(draw(svg, id, true), 10 * 60 + 10, 30); return svg; };
})();
