/* Clock Reading CR2 — the analog clock, drawn in code as one SVG (face, 60 minute ticks, numbers 1-12, hour hand black,
   minute hand blue, second hand red; the face stays light in dark theme so the black hand shows). It is redrawn only when
   the time changes (once a second by the app's tick) or on a drag event, so dragging stays immediate. Drag a hand to set the time: the minute hand also moves the hour hand along
   (passing 12 goes to the next or previous hour), the hour hand moves in steps of the snap. Grabbing near one hand drags that hand; where both
   hands are (or none), near the middle drags the hour hand and near the edge the minute hand.
   CR.makeClock({ onChange(t) }) -> { el, set(t), get(), snap(n), lock(bool), seconds(s or null) }. */
window.CR = window.CR || {};
(() => {
  const C = window.CR, NS = 'http://www.w3.org/2000/svg';
  const el = (tag, a, txt) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; };
  const pol = (deg, r) => { const a = (deg - 90) * Math.PI / 180; return [r * Math.cos(a), r * Math.sin(a)]; };
  C.makeClock = (o) => {
    let t = 0, step = 5, locked = false, sec = null, drag = null;
    const svg = el('svg', { viewBox: '-110 -110 220 220', class: 'cr-clock', role: 'img', 'aria-label': 'Clock' });
    svg.append(el('circle', { r: 104, class: 'cr-rim' }), el('circle', { r: 98, class: 'cr-face' }));
    for (let i = 0; i < 60; i++) { const big = i % 5 === 0, [x1, y1] = pol(i * 6, big ? 84 : 89), [x2, y2] = pol(i * 6, 95); svg.append(el('line', { x1, y1, x2, y2, class: big ? 'cr-tick5' : 'cr-tick' })); }
    for (let n = 1; n <= 12; n++) { const [x, y] = pol(n * 30, 71); svg.append(el('text', { x, y: y + 7, class: 'cr-num' }, String(n))); }
    const hand = (cls, len, w) => {
      const g = el('g', { class: 'cr-hand ' + cls });
      g.append(el('line', { x1: 0, y1: 12, x2: 0, y2: -len, 'stroke-width': w, class: 'cr-hv' }), el('line', { x1: 0, y1: 0, x2: 0, y2: -len, class: 'cr-hit' }),
        el('circle', { cy: -len, r: w * 0.9, class: 'cr-knob' }));
      svg.append(g); return g;
    };
    const hH = hand('cr-hh', 50, 8), mH = hand('cr-mh', 80, 5), sH = hand('cr-sh', 86, 1.6);
    svg.append(el('circle', { r: 6, class: 'cr-pin' }));
    const draw = () => {
      const m = C.min(t), h = C.h24(t) % 12;
      hH.setAttribute('transform', `rotate(${h * 30 + m * 0.5})`); mH.setAttribute('transform', `rotate(${m * 6})`);
      sH.style.display = sec == null ? 'none' : ''; if (sec != null) sH.setAttribute('transform', `rotate(${sec * 6})`);
      svg.setAttribute('aria-label', 'Clock showing ' + C.words(t));
    };
    const angle = e => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse());
      return { a: (Math.atan2(q.y, q.x) * 180 / Math.PI + 90 + 360) % 360, r: Math.hypot(q.x, q.y) }; };
    const move = e => {
      const { a } = angle(e);
      if (drag === 'm') {
        let m = Math.round(a / 6 / step) * step % 60, d = m - C.min(t);
        if (d < -30) d += 60; if (d > 30) d -= 60;                   // went past 12: next / previous hour
        t = C.norm(t + d);
      } else {
        const half = C.h24(t) >= 12 ? 720 : 0, old = C.norm(t) % 720;
        let v = Math.round(a * 2 / step) * step % 720;              // hour hand: 0.5 degree per minute
        if (v - old > 360) v -= 720; if (old - v > 360) v += 720;  // keep AM / PM unless it really went round
        t = C.norm(half + v);
      }
      draw(); o.onChange && o.onChange(t);
    };
    svg.addEventListener('pointerdown', e => {
      if (locked) return; e.preventDefault();
      const { a, r } = angle(e), m = C.min(t), off = x => Math.min(Math.abs(a - x), 360 - Math.abs(a - x));
      const nh = off((C.h24(t) % 12) * 30 + m * 0.5) < 25, nm = off(m * 6) < 25;   // near which hand? both: short one if close in
      drag = nh && !nm ? 'h' : nm && !nh ? 'm' : r < 58 ? 'h' : 'm';
      svg.setPointerCapture && svg.setPointerCapture(e.pointerId); svg.classList.add('drag-' + drag); move(e);
    });
    svg.addEventListener('pointermove', e => { if (drag) move(e); });
    const end = () => { if (drag) svg.classList.remove('drag-' + drag); drag = null; };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    draw();
    return {
      el: svg,
      set(v) { t = C.norm(v); draw(); }, get: () => t,
      snap(n) { step = n; }, lock(v) { locked = !!v; svg.classList.toggle('locked', locked); },
      seconds(s) { sec = s; draw(); }
    };
  };
})();
