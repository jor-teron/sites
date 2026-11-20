/* Blood Group BG-2 — two views in one page, all drawings are inline SVG made here. HOME view (BG-1), one scrollable page:
   1 what blood is (red cells, white cells, platelets, plasma; tap a part for a tip), 2 the ABO groups (a red cell with its
   A / B markers and the antibodies in the plasma; tap a card to highlight it), 3 the Rh factor and the 8 groups as drop badges,
   4 how common each group is in India (approximate bars), 5 did you know, 6 a big card that opens the donation view.
   DONATION view (BG-2, hash #donate so refresh and the browser Back button work): a "Who can give to whom" tap chart of the
   8 groups (Give to / Receive from, highlights come from BG.canGive), universal donor and receiver, who can donate (India,
   basic), why donate, what happens at a donation (4 steps). "<- Blood groups" goes back to the home view (in-app, not a category button).
   Saves in localStorage: learn.blood-group.group (the last highlighted ABO group), learn.blood-group.chart ({ group, mode }).
   In a Hub desktop window the header moves to the Hub title bar (LearnHubBar). No tabs and no buttons are sent. */
(() => {
  const B = window.BG, VER = 'BG-2', PRE = 'learn.blood-group.', store = LRN.store, NS = 'http://www.w3.org/2000/svg';
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

  // ---- 6 card that opens the donation view ----
  let cameFromHome = false, homeTop = 0;
  const s6 = h('section', { class: 'bg-sec' }, h('button', { type: 'button', class: 'bg-card bg-next', 'data-go': 'donate',
    onclick: () => { cameFromHome = true; location.hash = 'donate'; } },
    svg('0 0 40 48', 'bg-nextsvg', 'Blood drop', s('path', { d: DROP })),
    h('span', { class: 'bg-nextt' }, h('span', { class: 'bg-cn' }, 'Blood donation \u2192'), h('span', { class: 'bg-cj' }, 'Who can give to whom, who can donate, and what happens when you give blood.'))));

  // ================= DONATION VIEW (BG-2) =================
  const backBtn = () => h('button', { type: 'button', class: 'bg-back', 'data-go': 'home', onclick: goHome }, '\u2190 Blood groups');

  // ---- d1 who can give to whom ----
  const saved = store.read(PRE + 'chart', {}) || {};
  let chMode = saved.mode === 'receive' ? 'receive' : 'give', chPick = B.groups.includes(saved.group) ? saved.group : '';
  const modeBtns = [['give', 'Give to'], ['receive', 'Receive from']].map(([m, label]) =>
    h('button', { type: 'button', class: 'bg-tog', 'data-mode': m, 'aria-pressed': 'false', onclick: () => setChart(chPick, m) }, label));
  const chartBtns = B.groups.map(g => h('button', { type: 'button', class: 'bg-drop bg-dropb', 'data-g': g, 'aria-pressed': 'false',
    'aria-label': 'Blood group ' + B.name(g), onclick: () => setChart(chPick === g ? '' : g, chMode) },
    svg('0 0 40 48', 'bg-dropsvg', 'Blood group ' + B.name(g), s('path', { d: DROP })), h('span', { class: 'bg-dropt' }, B.name(g))));
  const chartSay = h('p', { class: 'bg-tip', role: 'status', 'aria-live': 'polite' });
  function setChart(g, m) {
    chPick = g; chMode = m; store.write(PRE + 'chart', { group: g, mode: m });
    modeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    const list = g ? (m === 'give' ? B.givesTo(g) : B.receivesFrom(g)) : [];
    chartBtns.forEach(b => {
      const x = b.dataset.g;
      b.setAttribute('aria-pressed', String(x === g));
      b.classList.toggle('bg-on', !!g && list.includes(x));
      b.classList.toggle('bg-off', !!g && !list.includes(x));
    });
    chartSay.textContent = g ? B.compatText(g, m) : (m === 'give' ? 'Tap a group to see who it can give red cells to.' : 'Tap a group to see who it can receive red cells from.');
  }
  const d1 = sec('chart', 'Who can give to whom?',
    h('p', { class: 'bg-p' }, 'Red cells from a donor are safe only if they carry no marker the patient does not have. So the patient\'s antibodies do not attack them.'),
    h('div', { class: 'bg-togs', role: 'group', 'aria-label': 'Chart mode' }, modeBtns),
    h('div', { class: 'bg-drops bg-chart' }, chartBtns), chartSay,
    h('p', { class: 'bg-p bg-muted' }, 'Lit groups match. Dim groups do not. This is for red cells. Plasma and platelets follow other rules.'));

  // ---- d2 universal donor and receiver ----
  const uni = (g, title, text, m) => h('button', { type: 'button', class: 'bg-card bg-uni', 'data-g': g,
    onclick: () => { setChart(g, m); d1.scrollIntoView && d1.scrollIntoView({ block: 'start' }); } },
    h('div', { class: 'bg-drop' }, svg('0 0 40 48', 'bg-dropsvg', 'Blood group ' + B.name(g), s('path', { d: DROP })), h('span', { class: 'bg-dropt' }, B.name(g))),
    h('span', { class: 'bg-cn' }, title), h('span', { class: 'bg-cj' }, text));
  const d2 = sec('uni', 'Universal donor and universal receiver',
    h('div', { class: 'bg-grid bg-grid2' },
      uni('O-', 'Universal donor', 'O\u2212 red cells have no A, B or RhD marker, so they can go to all 8 groups. Used in emergencies.', 'give'),
      uni('AB+', 'Universal receiver', 'AB+ has every marker and no ABO antibodies, so it can receive red cells from all 8 groups.', 'receive')));

  // ---- d3 who can donate ----
  function ruleIcon(id) {
    const c = 'bg-ico';
    if (id === 'age') return svg('0 0 48 48', c, 'Calendar', s('rect', { x: 6, y: 10, width: 36, height: 32, rx: 5, class: 'bg-i1' }), s('rect', { x: 6, y: 10, width: 36, height: 9, rx: 4, class: 'bg-i2' }),
      s('text', { x: 24, y: 36, class: 'bg-it' }, '18+'));
    if (id === 'weight') return svg('0 0 48 48', c, 'Weighing scale', s('rect', { x: 6, y: 8, width: 36, height: 34, rx: 8, class: 'bg-i1' }),
      s('path', { d: 'M14 22 A10 10 0 0 1 34 22', class: 'bg-il' }), s('path', { d: 'M24 22 L29 15', class: 'bg-il' }), s('text', { x: 24, y: 37, class: 'bg-it' }, '45'));
    if (id === 'well') return svg('0 0 48 48', c, 'Heart', s('path', { d: 'M24 41 C10 31 5 24 5 17 A9.5 9.5 0 0 1 24 12 A9.5 9.5 0 0 1 43 17 C43 24 38 31 24 41 Z', class: 'bg-i2' }),
      s('path', { d: 'M10 23 h8 l3 -6 l5 11 l3 -5 h9', class: 'bg-iw' }));
    if (id === 'hb') return svg('0 0 48 48', c, 'Finger-prick drop', s('path', { d: 'M24 4 C18 14 9 23 9 31 A15 15 0 0 0 39 31 C39 23 30 14 24 4 Z', class: 'bg-i2' }),
      s('text', { x: 24, y: 36, class: 'bg-it bg-itw' }, 'Hb'));
    return svg('0 0 48 48', c, 'Clock', s('circle', { cx: 24, cy: 24, r: 18, class: 'bg-i1' }), s('path', { d: 'M24 13 V24 L32 29', class: 'bg-il' }));
  }
  const d3 = sec('who', 'Who can donate?',
    h('p', { class: 'bg-p bg-muted' }, 'Common rules in India - the blood bank decides.'),
    h('div', { class: 'bg-grid' }, B.donor.rules.map(r => h('div', { class: 'bg-card bg-rule', 'data-rule': r.id }, ruleIcon(r.id),
      h('span', null, h('span', { class: 'bg-cn' }, r.title), h('span', { class: 'bg-cj' }, r.text))))));

  // ---- d4 why donate ----
  const d4 = sec('why', 'Why donate?', h('div', { class: 'bg-grid' }, B.donor.why.map(w => h('div', { class: 'bg-card bg-why' },
    h('span', { class: 'bg-cn' }, w.title), h('span', { class: 'bg-cj' }, w.text)))));

  // ---- d5 what happens at a donation ----
  const d5 = sec('steps', 'What happens at a donation?', h('ol', { class: 'bg-steps' }, B.donor.steps.map((st, i) => h('li', { class: 'bg-step' },
    h('span', { class: 'bg-num', 'aria-hidden': 'true' }, String(i + 1)),
    h('span', null, h('span', { class: 'bg-cn' }, st.title), h('span', { class: 'bg-cj' }, st.text))))));

  // ---- views and navigation (#donate) ----
  const disc = () => h('p', { class: 'bg-disc' }, 'For learning only. A doctor or blood bank can test your blood group.');
  const home = h('div', { class: 'bg-view', 'data-view': 'home' }, s1, s2, s3, s4, s5, s6, disc());
  const donate = h('div', { class: 'bg-view', 'data-view': 'donate', hidden: true },
    h('div', { class: 'bg-top' }, backBtn(), h('h2', { class: 'bg-vt' }, 'Blood donation')), d1, d2, d3, d4, d5, backBtn(), disc());
  const here = h('span', { class: 'lrn-here' }, 'Blood Group');
  const head = h('header', { class: 'lrn-head' }, h('h1', null, here), h('span', { class: 'bg-ver' }, VER));
  const main = h('main', { class: 'lrn-main bg-main', id: 'lrn-main' }, home, donate);
  let view = '';
  function show(v) {
    if (v === view) return;
    if (view === 'home') homeTop = main.scrollTop;
    view = v; home.hidden = v !== 'home'; donate.hidden = v !== 'donate';
    here.textContent = v === 'donate' ? 'Blood Group \u203a Donation' : 'Blood Group';
    main.scrollTop = v === 'home' ? homeTop : 0;
  }
  function goHome() {
    if (cameFromHome) { cameFromHome = false; history.back(); return; }   // undo our own #donate entry
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
    show('home');
  }
  const route = () => { if (location.hash !== '#donate') cameFromHome = false; show(location.hash === '#donate' ? 'donate' : 'home'); };
  window.addEventListener('hashchange', route);
  setChart(chPick, chMode);
  root.className = 'lrn bg'; root.replaceChildren(head, main);
  route();
  document.title = 'Blood Group ' + VER;
  if (window.LearnHubBar) LearnHubBar.attach(head);   // Hub desktop window: the header goes to the title bar (no tabs, no buttons)
})();
