/* Blood Group BG-1 — one scrollable home page about blood, all drawings are inline SVG made here:
   1 what blood is (red cells, white cells, platelets, plasma; tap a part for a tip), 2 the ABO groups (a red cell with its
   A / B markers and the antibodies in the plasma; tap a card to highlight it), 3 the Rh factor and the 8 groups as drop badges,
   4 how common each group is in India (approximate bars), 5 did you know, 6 the donation page card (BG-2, not built yet).
   Saves in localStorage: learn.blood-group.group (the last highlighted ABO group).
   In a Hub desktop window the header moves to the Hub title bar (LearnHubBar). No tabs and no buttons are sent. */
(() => {
  const B = window.BG, VER = 'BG-1', PRE = 'learn.blood-group.', store = LRN.store, NS = 'http://www.w3.org/2000/svg';
  const root = document.getElementById('app');
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : String(c)));
    return el;
  };
  const s = (tag, attrs, ...kids) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs || {}) el.setAttribute(k, attrs[k]);
    kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : String(c)));
    return el;
  };
  const svg = (vb, cls, label, ...kids) => s('svg', { viewBox: vb, class: cls, role: 'img', 'aria-label': label, focusable: 'false' }, ...kids);
  const DROP = 'M20 2 C14 12 4 22 4 31 A16 16 0 0 0 36 31 C36 22 26 12 20 2 Z';

  // ---- drawings ----
  function redCell(x, y, r) {   // a round red cell with the pale dip in the middle
    return s('g', null, s('circle', { cx: x, cy: y, r, class: 'bg-rbc' }), s('circle', { cx: x, cy: y, r: r * 0.45, class: 'bg-rbc-in' }));
  }
  function partArt(id) {
    if (id === 'red') return svg('0 0 80 60', 'bg-art', 'Red cells', redCell(26, 26, 17), redCell(54, 36, 15), redCell(20, 48, 9));
    if (id === 'white') return svg('0 0 80 60', 'bg-art', 'A white cell',
      s('circle', { cx: 40, cy: 30, r: 22, class: 'bg-wbc' }),
      s('path', { d: 'M30 24 q6 -8 12 -2 q8 -4 9 6 q-3 8 -10 6 q-6 6 -10 -1 q-6 -3 -1 -9z', class: 'bg-wbc-n' }));
    if (id === 'plate') return svg('0 0 80 60', 'bg-art', 'Platelets',
      [[20, 22, 7, 4, 20], [42, 34, 8, 4, -15], [60, 20, 6, 3.5, 40], [30, 46, 6, 3.5, 70], [58, 46, 5, 3, 0]].map(([x, y, rx, ry, a]) =>
        s('ellipse', { cx: x, cy: y, rx, ry, transform: 'rotate(' + a + ' ' + x + ' ' + y + ')', class: 'bg-plt' })));
    return svg('0 0 80 60', 'bg-art', 'Plasma in a tube',   // a tube of blood: plasma on top (about 55%), cells below
      s('rect', { x: 28, y: 4, width: 24, height: 52, rx: 10, class: 'bg-tube' }),
      s('rect', { x: 30, y: 8, width: 20, height: 25, class: 'bg-plasma' }),
      s('rect', { x: 30, y: 33, width: 20, height: 21, rx: 8, class: 'bg-cells' }),
      s('text', { x: 58, y: 24, class: 'bg-lbl' }, '55%'));
  }
  // markers on the rim of a red cell: A = triangle, B = square, RhD = small dot
  function markers(cx, cy, r, ag) {
    const out = [], list = [];
    ag.forEach(m => { const n = m === 'RhD' ? 4 : (ag.includes('A') && ag.includes('B') ? 4 : 6); for (let i = 0; i < n; i++) list.push(m); });
    list.forEach((m, i) => {
      const a = (i / list.length) * Math.PI * 2 - Math.PI / 2 + (m === 'RhD' ? 0.35 : 0), x = cx + Math.cos(a) * (r + 4), y = cy + Math.sin(a) * (r + 4);
      const rot = 'rotate(' + (a * 180 / Math.PI + 90).toFixed(1) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')';
      if (m === 'A') out.push(s('path', { d: 'M' + x.toFixed(1) + ' ' + (y - 5).toFixed(1) + ' l5 8 h-10 z', transform: rot, class: 'bg-mA' }));
      else if (m === 'B') out.push(s('rect', { x: (x - 4).toFixed(1), y: (y - 4).toFixed(1), width: 8, height: 8, transform: rot, class: 'bg-mB' }));
      else out.push(s('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 3.5, class: 'bg-mR' }));
    });
    return out;
  }
  function cellWith(g, label) {
    return svg('0 0 90 90', 'bg-cell', label, redCell(45, 45, 30), markers(45, 45, 30, B.antigens(g)));
  }
  function drop(g) {
    return h('div', { class: 'bg-drop', title: g }, svg('0 0 40 48', 'bg-dropsvg', 'Blood group ' + B.name(g), s('path', { d: DROP })),
      h('span', { class: 'bg-dropt' }, B.name(g)));
  }
  const legend = () => h('div', { class: 'bg-legend' },
    h('span', null, svg('0 0 14 14', 'bg-key', 'A marker', s('path', { d: 'M7 2 l5 9 h-10 z', class: 'bg-mA' })), ' A marker'),
    h('span', null, svg('0 0 14 14', 'bg-key', 'B marker', s('rect', { x: 3, y: 3, width: 8, height: 8, class: 'bg-mB' })), ' B marker'),
    h('span', null, svg('0 0 14 14', 'bg-key', 'RhD marker', s('circle', { cx: 7, cy: 7, r: 4, class: 'bg-mR' })), ' RhD marker'));
  const sec = (id, title, ...kids) => h('section', { class: 'bg-sec', id: 'bg-' + id, 'aria-labelledby': 'bg-' + id + '-h' }, h('h2', { id: 'bg-' + id + '-h' }, title), ...kids);

  // ---- 1 what blood is ----
  const partTip = h('p', { class: 'bg-tip', role: 'status' }, 'Tap a part to learn more.');
  const partBtns = B.parts.map(p => h('button', { type: 'button', class: 'bg-card bg-part', 'aria-pressed': 'false', 'data-part': p.id,
    onclick: () => { partBtns.forEach(b => b.setAttribute('aria-pressed', String(b === btn(p.id)))); partTip.replaceChildren(h('b', null, p.name + ': '), p.tip); } },
    partArt(p.id), h('span', { class: 'bg-cn' }, p.name), h('span', { class: 'bg-cj' }, p.job)));
  const btn = id => partBtns.find(b => b.dataset.part === id);
  const s1 = sec('what', 'What is blood?',
    h('p', { class: 'bg-p' }, 'Blood flows through your heart and blood vessels all day and night. It carries oxygen and food to every part of your body and takes waste away. Blood has four main parts.'),
    h('div', { class: 'bg-grid' }, partBtns), partTip);

  // ---- 2 ABO groups ----
  let pickedAbo = store.read(PRE + 'group', '');
  const aboCards = B.ABO.map(a => h('button', { type: 'button', class: 'bg-card bg-abo', 'data-abo': a, 'aria-pressed': String(a === pickedAbo), onclick: () => pickAbo(a) },
    cellWith(a, 'Group ' + a + ' red cell'), h('span', { class: 'bg-big' }, a),
    h('span', { class: 'bg-cj' }, B.aboInfo[a].note),
    h('span', { class: 'bg-ab' }, 'Antibodies: ' + (B.antibodies(a).join(' and ') || 'none'))));
  function pickAbo(a) {
    pickedAbo = pickedAbo === a ? '' : a; store.write(PRE + 'group', pickedAbo);
    aboCards.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.abo === pickedAbo)));
  }
  const s2 = sec('abo', 'The ABO groups: A, B, AB and O',
    h('p', { class: 'bg-p' }, 'Every red cell can carry tiny markers on its outside, called antigens. Which markers you have gives your group. Your plasma also carries antibodies, which attack the markers you do not have.'),
    legend(), h('div', { class: 'bg-grid' }, aboCards));

  // ---- 3 Rh factor and the 8 groups ----
  const s3 = sec('rh', 'The Rh factor: positive or negative',
    h('p', { class: 'bg-p' }, 'There is one more marker, called RhD. If your red cells have it you are Rh positive (+). If not, you are Rh negative (\u2212).'),
    h('div', { class: 'bg-grid bg-grid2' },
      h('div', { class: 'bg-card bg-rh' }, cellWith('O+', 'Rh positive red cell with RhD markers'), h('span', { class: 'bg-cn' }, 'Rh positive (+)'), h('span', { class: 'bg-cj' }, B.rhInfo['+'].note)),
      h('div', { class: 'bg-card bg-rh' }, cellWith('O-', 'Rh negative red cell with no RhD marker'), h('span', { class: 'bg-cn' }, 'Rh negative (\u2212)'), h('span', { class: 'bg-cj' }, B.rhInfo['-'].note))),
    h('p', { class: 'bg-p' }, 'Four ABO groups, each positive or negative, make ', h('b', null, '8 blood groups'), ':'),
    h('div', { class: 'bg-drops' }, B.groups.map(drop)));

  // ---- 4 India ----
  const max = Math.max(...B.groups.map(g => B.india[g]));
  const s4 = sec('india', 'How common is each group in India?',
    h('p', { class: 'bg-p bg-muted' }, 'Approximate, varies by region. Out of every 100 people:'),
    h('div', { class: 'bg-bars' }, B.byCommon().map(g => h('div', { class: 'bg-bar' },
      h('span', { class: 'bg-barl' }, B.name(g)),
      h('span', { class: 'bg-bart' }, h('span', { class: 'bg-barf', style: 'width:' + Math.max(1, B.india[g] / max * 100).toFixed(1) + '%' })),
      h('span', { class: 'bg-barv' }, B.india[g] + '%')))),
    h('p', { class: 'bg-p bg-muted' }, 'O+ and B+ are the most common in India. All the negative groups together are only about 1 or 2 in 100 people.'));

  // ---- 5 did you know ----
  const s5 = sec('know', 'Did you know?', h('ul', { class: 'bg-list' },
    h('li', null, 'A grown-up has about 5 litres of blood.'),
    h('li', null, 'Your blood group comes from your parents. It stays the same all your life.'),
    h('li', null, 'Red cells live for about 4 months. Your body makes new ones all the time.')));

  // ---- 6 donation page (BG-2, not built yet) ----
  const s6 = h('section', { class: 'bg-sec' }, h('div', { class: 'bg-card bg-next', 'aria-disabled': 'true' },
    svg('0 0 40 48', 'bg-nextsvg', 'Blood drop', s('path', { d: DROP })),
    h('span', null, h('span', { class: 'bg-cn' }, 'Blood donation'), h('span', { class: 'bg-cj' }, 'Blood donation page coming next (BG-2)'))));

  const note = h('p', { class: 'bg-disc' }, 'For learning only. A doctor or blood bank can test your blood group.');
  const head = h('header', { class: 'lrn-head' }, h('h1', null, h('span', { class: 'lrn-here' }, 'Blood Group')), h('span', { class: 'bg-ver' }, VER));
  const main = h('main', { class: 'lrn-main bg-main', id: 'lrn-main' }, s1, s2, s3, s4, s5, s6, note);
  root.className = 'lrn bg'; root.replaceChildren(head, main);
  document.title = 'Blood Group ' + VER;
  if (window.LearnHubBar) LearnHubBar.attach(head);   // Hub desktop window: the header goes to the title bar (no tabs, no buttons)
})();
