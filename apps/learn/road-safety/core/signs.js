/* Road Safety RS1 — 31 Indian road signs (IRC:67 / Motor Vehicles Act), each drawn in code as a small SVG (viewBox 0 0 100 100).
   Groups: mandatory (red circle; a red bar means "not allowed"), cautionary (red triangle, warns of danger ahead) and
   informatory (blue rectangle, gives information). RS.signs = [{ id, g, name, meaning, svg }], RS.svg(sign) -> markup. */
window.RS = window.RS || {};
(() => {
  const R = window.RS, K = '#111', RED = '#d32f2f';
  const S = (d, w) => `<path d="${d}" fill="none" stroke="${K}" stroke-width="${w || 7}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const F = (d, c) => `<path d="${d}" fill="${c || K}"/>`;
  const T = (t, y, size, c) => `<text x="50" y="${y}" font-size="${size}" font-weight="800" text-anchor="middle" fill="${c || K}" font-family="Arial,Helvetica,sans-serif">${t}</text>`;
  const ring = (inner, bar) => `<circle cx="50" cy="50" r="43" fill="#fff" stroke="${RED}" stroke-width="9"/>${inner}${bar ? `<line x1="20" y1="20" x2="80" y2="80" stroke="${RED}" stroke-width="8"/>` : ''}`;
  const tri = inner => `<path d="M50 7 L95 88 H5 Z" fill="#fff" stroke="${RED}" stroke-width="8" stroke-linejoin="round"/>${inner}`;
  const blue = (inner, box) => `<rect x="7" y="7" width="86" height="86" rx="8" fill="#1565c0"/>${box ? '<rect x="20" y="20" width="60" height="60" rx="4" fill="#fff"/>' : ''}${inner}`;
  const g = (x, y, s, inner) => `<g transform="translate(${x} ${y}) scale(${s})">${inner}</g>`;
  // little pictures, drawn in a 0..100 box and then placed with g()
  const man = `<circle cx="52" cy="14" r="10" fill="${K}"/>` + S('M50 30 L44 60 L32 92 M44 60 L60 92 M48 38 L32 54 M48 38 L66 50', 10);
  const kid = `<circle cx="50" cy="16" r="11" fill="${K}"/>` + S('M50 32 V62 L38 92 M50 62 L62 92 M50 40 L34 56 M50 40 L66 56', 10) + F('M56 34 h14 v22 h-14 z');
  const car = c => F('M8 40 L22 18 H70 L86 40 H96 V62 H2 V40 Z', c) + `<circle cx="24" cy="64" r="10" fill="${K}"/><circle cx="76" cy="64" r="10" fill="${K}"/>`;
  const arrowUp = F('M50 18 L70 42 H58 V82 H42 V42 H30 Z');
  const turnL = S('M60 82 V54 Q60 42 48 42 H42', 11) + F('M24 42 L44 26 V58 Z');
  const flip = x => `<g transform="matrix(-1 0 0 1 100 0)">${x}</g>`;
  const oct = Array.from({ length: 8 }, (_, i) => { const a = (i * 45 + 22.5) * Math.PI / 180; return (50 + 46 * Math.cos(a)).toFixed(1) + ' ' + (50 + 46 * Math.sin(a)).toFixed(1); }).join(' L');
  const L = [
    // ---- mandatory ----
    ['stop', 'm', 'Stop', 'Stop completely at the line. Go only when the road is clear.', `<path d="M${oct} Z" fill="${RED}" stroke="#fff" stroke-width="3"/>` + T('STOP', 60, 27, '#fff')],
    ['giveway', 'm', 'Give way', 'Slow down and let traffic on the main road go first.', `<path d="M6 12 H94 L50 92 Z" fill="#fff" stroke="${RED}" stroke-width="8" stroke-linejoin="round"/>`],
    ['noentry', 'm', 'No entry', 'Vehicles must not go into this road.', `<circle cx="50" cy="50" r="45" fill="${RED}"/><rect x="18" y="41" width="64" height="18" fill="#fff"/>`],
    ['speed50', 'm', 'Speed limit 50', 'Do not drive faster than 50 km per hour.', ring(T('50', 64, 40))],
    ['nopark', 'm', 'No parking', 'Vehicles must not be parked here.', ring(T('P', 68, 50), true)],
    ['nohorn', 'm', 'No horn', 'Do not sound the horn, for example near hospitals and schools.', ring(F('M24 42 H36 L64 26 V74 L36 58 H24 Z') + S('M72 38 Q78 50 72 62', 5), true)],
    ['nouturn', 'm', 'No U-turn', 'Do not turn around to go back the way you came.', ring(S('M38 80 V46 Q38 28 52 28 Q66 28 66 46 V56', 9) + F('M54 54 H78 L66 72 Z'), true)],
    ['noovertake', 'm', 'No overtaking', 'Do not pass the vehicle in front of you.', ring(g(14, 34, 0.36, car(RED)) + g(50, 34, 0.36, car(K)))],
    ['oneway', 'm', 'One way', 'Traffic may go only in the direction of the arrow.', ring(arrowUp)],
    ['left', 'm', 'Compulsory turn left', 'You must turn left here.', ring(turnL)],
    ['right', 'm', 'Compulsory turn right', 'You must turn right here.', ring(flip(turnL))],
    ['noped', 'm', 'Pedestrians prohibited', 'People must not walk on this road; use another way.', ring(g(26, 20, 0.6, man), true)],
    // ---- cautionary ----
    ['school', 'c', 'School ahead', 'A school is near: drive slowly, children may cross.', tri(g(22, 40, 0.42, kid) + g(46, 40, 0.42, kid))],
    ['zebra', 'c', 'Pedestrian crossing', 'A zebra crossing is ahead: slow down and let people cross.', tri(g(31, 32, 0.4, man) + F('M24 78 h10 v6 h-10z M40 78 h10 v6 h-10z M56 78 h10 v6 h-10z M72 78 h4 v6 h-4z'))],
    ['bendL', 'c', 'Sharp left bend', 'The road turns sharply to the left: slow down.', tri(S('M58 82 V58 L40 46', 8) + F('M30 40 L48 38 L40 54 Z'))],
    ['bendR', 'c', 'Sharp right bend', 'The road turns sharply to the right: slow down.', tri(flip(S('M58 82 V58 L40 46', 8) + F('M30 40 L48 38 L40 54 Z')))],
    ['bridge', 'c', 'Narrow bridge', 'The bridge ahead is narrow: go slowly and give way.', tri(S('M34 82 L42 54 V42 M66 82 L58 54 V42', 7))],
    ['hump', 'c', 'Speed breaker', 'A speed breaker (hump) is ahead: slow down.', tri(F('M22 80 Q50 44 78 80 Z'))],
    ['slip', 'c', 'Slippery road', 'The road may be slippery: drive slowly, no sudden braking.', tri(g(30, 36, 0.4, car(K)) + S('M36 82 q6 -8 0 -14 M64 82 q-6 -8 0 -14', 4))],
    ['work', 'c', 'Men at work', 'Road work ahead: slow down and watch for workers.', tri(g(30, 36, 0.4, man) + S('M60 60 L72 80', 5) + F('M62 82 Q72 66 82 82 Z'))],
    ['cattle', 'c', 'Cattle', 'Animals may be on the road: slow down.', tri(F('M28 56 h36 v14 h-36z M64 50 h12 v12 h-12z') + S('M32 70 v12 M42 70 v12 M54 70 v12 M60 70 v12 M66 50 l-4 -6 M74 50 l4 -6', 4))],
    ['rocks', 'c', 'Falling rocks', 'Rocks may fall from the hill: do not stop here.', tri(F('M58 36 L80 84 H58 Z') + `<circle cx="44" cy="54" r="6" fill="${K}"/><circle cx="34" cy="70" r="7" fill="${K}"/><circle cx="48" cy="78" r="5" fill="${K}"/>`)],
    ['round', 'c', 'Roundabout', 'A roundabout is ahead: give way to traffic already on it.', tri(`<circle cx="50" cy="64" r="14" fill="none" stroke="${K}" stroke-width="6"/>` + F('M64 50 l8 12 l-14 0z M36 78 l-8 -12 l14 0z M42 48 l14 -4 l-4 12z'))],
    ['rail', 'c', 'Unguarded railway crossing', 'A railway crossing with no gate: stop, look both ways, listen, then cross.', tri(F('M26 56 h36 v20 h-36z M62 46 h14 v30 h-14z M32 46 h8 v10 h-8z') + `<circle cx="34" cy="80" r="5" fill="${K}"/><circle cx="52" cy="80" r="5" fill="${K}"/><circle cx="70" cy="80" r="5" fill="${K}"/>`)],
    // ---- informatory ----
    ['hospital', 'i', 'Hospital', 'A hospital is nearby. Keep quiet, no horn.', blue(F('M42 26 h16 v16 h16 v16 h-16 v16 h-16 v-16 h-16 v-16 h16 z', RED), true)],
    ['parking', 'i', 'Parking', 'You may park your vehicle here.', blue(T('P', 76, 72, '#fff'))],
    ['petrol', 'i', 'Petrol pump', 'A petrol pump (fuel station) is ahead.', blue(F('M32 28 h28 v50 h-28z') + F('M37 34 h18 v12 h-18z', '#fff') + S('M60 40 h8 v28 q0 6 6 4 V44', 4), true)],
    ['bus', 'i', 'Bus stop', 'Buses stop here for people to get on and off.', blue(F('M28 24 h44 q6 0 6 6 v40 h-56 v-40 q0 -6 6 -6z') + F('M30 32 h40 v18 h-40z', '#fff') + `<circle cx="34" cy="62" r="4" fill="#fff"/><circle cx="66" cy="62" r="4" fill="#fff"/>` + F('M28 70 h10 v8 h-10z M62 70 h10 v8 h-10z'), true)],
    ['firstaid', 'i', 'First aid post', 'First aid help is available here.', blue(F('M26 36 h48 v38 h-48z') + S('M42 36 v-6 h16 v6', 4) + F('M46 44 h8 v8 h8 v8 h-8 v8 h-8 v-8 h-8 v-8 h8 z', RED), true)],
    ['food', 'i', 'Eating place', 'A place to eat (restaurant or dhaba) is ahead.', blue(S('M38 26 V76 M30 26 V40 Q30 48 38 48 Q46 48 46 40 V26 M62 76 V26 Q72 34 70 54 H62', 5), true)],
    ['toilet', 'i', 'Public toilet', 'A public toilet is nearby.', blue(g(14, 26, 0.48, man) + `<circle cx="66" cy="33" r="5" fill="${K}"/>` + F('M66 40 L76 64 H56 Z') + S('M62 64 v12 M70 64 v12', 4), true)]
  ];
  R.groups = { m: 'Mandatory', c: 'Cautionary', i: 'Informatory' };
  R.groupInfo = { m: 'Red circles are orders: you must obey them. A red bar means "not allowed".', c: 'Red triangles warn you of danger ahead.', i: 'Blue rectangles give useful information.' };
  R.signs = L.map(([id, gr, name, meaning, svg]) => ({ id, g: gr, name, meaning, svg }));
  R.svg = (s, cls) => `<svg viewBox="0 0 100 100" class="${cls || 'rs-sign'}" role="img" aria-label="${s.name} sign">${s.svg}</svg>`;
})();
