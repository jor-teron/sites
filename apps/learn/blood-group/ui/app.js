/* Blood Group BG-6a — five views in one page, all drawings are inline SVG made here. HOME view (BG-1), one scrollable page:
   1 what blood is (red cells, white cells, platelets, plasma; tap a part for a tip), 2 the ABO groups (a red cell with its
   A / B markers and the antibodies in the plasma; tap a card to highlight it), 3 the Rh factor and the 8 groups as drop badges,
   4 how common each group is in India (approximate bars), 5 did you know, 6 cards that open the donation, family, myths and
   health views (shortcuts; the title-bar tabs also switch views).
   DONATION view (BG-2, hash #donate so refresh and the browser Back button work): a "Who can give to whom" tap chart of the
   8 groups (Give to / Receive from, highlights come from BG.canGive), universal donor and receiver, who can donate (India,
   basic), why donate, what happens at a donation (4 steps).
   FAMILY view (BG-3b, hash #family): Mum and Dad chip pickers side by side (8 full group-name chips each), a Child box that
   lights possible groups and greys out the rest, a plain-English reason, and a 4x4 ABO reference table below. The old
   8-column drop badges are gone from this view (they wrapped on a narrow or Hub window so only + / \u2212 showed). Guess
   and gene-pair Punnett picks live in a collapsed More section. A short alleles note and the lab-test note stay on the page.
   MYTHS view (BG-5, hash #myths): Japan's blood-type personality (ketsueki-gata) as tap cards for A, B, O and AB, each with
   a "Myth, not science" badge, plus a short history, a studies note and a bura-hara note; then Myth vs Fact flip cards.
   HEALTH view (BG-6 / BG-6a, hash #health): what healthy blood needs (iron, B12, folate and vitamin C, with India-friendly
   food cards), iron tips, anaemia signs and who is at higher risk, lifestyle for circulation; then Know your numbers
   (typical ranges for haemoglobin, blood pressure and blood sugar, a CBC explainer, and an Is my Hb normal? checker that
   stores nothing), and a not-medical-advice disclaimer at the end.
   Title-bar tabs (BG-3a, LearnHubBar array form): Groups / Donation / Family / Myths / Health, mapped to "" / #donate /
   #family / #myths / #health (from BG.views). Deep links and Back/Forward stay in sync. Home shortcut cards are kept.
   Saves in localStorage: learn.blood-group.group (the last highlighted ABO group), learn.blood-group.chart ({ group, mode }),
   learn.blood-group.family ({ mum, dad, mumAbo, dadAbo, mumRh, dadRh }), learn.blood-group.myths ({ abo }).
   In a Hub desktop window the header (and these tabs) move to the Hub title bar (LearnHubBar). */
(() => {
  const B = window.BG, VER = 'BG-6a', PRE = 'learn.blood-group.', store = LRN.store, NS = 'http://www.w3.org/2000/svg';
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

  // ---- 6 cards that open the donation, family, myths and health views (shortcuts; tabs in the title bar also switch) ----
  let homeTop = 0;
  const nextCard = (hash, title, sub, art) => h('button', { type: 'button', class: 'bg-card bg-next', 'data-go': hash,
    onclick: () => { location.hash = hash; } },
    art, h('span', { class: 'bg-nextt' }, h('span', { class: 'bg-cn' }, title), h('span', { class: 'bg-cj' }, sub)));
  const s6 = h('section', { class: 'bg-sec' }, h('div', { class: 'bg-nextrow' },
    nextCard('donate', 'Blood donation \u2192', 'Who can give to whom, who can donate, and what happens when you give blood.',
      svg('0 0 40 48', 'bg-nextsvg', 'Blood drop', s('path', { d: DROP }))),
    nextCard('family', 'Family puzzle \u2192', 'See which groups a child can have, and guess the parents.',
      svg('0 0 40 48', 'bg-nextsvg bg-famicon', 'Parents and a child',
        s('path', { d: 'M14 2 C10 10 4 16 4 22 A10 10 0 0 0 24 22 C24 16 18 10 14 2 Z' }),
        s('path', { d: 'M28 6 C25 12 20 17 20 22 A8 8 0 0 0 36 22 C36 17 31 12 28 6 Z' }),
        s('path', { d: 'M20 24 C17.5 29 14 33 14 36 A6 6 0 0 0 26 36 C26 33 22.5 29 20 24 Z' }))),
    nextCard('myths', 'Myths \u2192', "Japan's blood-type personality myth, and myth versus fact.",
      svg('0 0 40 48', 'bg-nextsvg', 'Myths', s('path', { d: DROP }),
        s('text', { x: '20', y: '32', class: 'bg-itw', 'text-anchor': 'middle' }, '?'))),
    nextCard('health', 'Health \u2192', 'How to keep blood healthy, and how to read common blood numbers.',
      svg('0 0 40 48', 'bg-nextsvg', 'Health', s('path', { d: DROP }),
        s('text', { x: '20', y: '33', class: 'bg-itw', 'text-anchor': 'middle' }, '+')))));

  // ================= DONATION VIEW (BG-2) =================
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

  // ================= FAMILY VIEW (BG-3b) =================
  // Chip order is A+/A- then B, AB, O, so each column reads as pairs, not a tight 8-drop row.
  const CHIPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const famSaved = store.read(PRE + 'family', {}) || {};
  const asGroup = g => (B.groups.includes(g) ? g : '');
  let famMum = asGroup(famSaved.mum) || 'A+';
  let famDad = asGroup(famSaved.dad) || 'B+';
  const aboPick = (g, v) => { const p = B.parse(g); return p && B.aboGenos(p.abo).includes(v) ? v : ''; };
  const rhPick  = (g, v) => { const p = B.parse(g); return p && B.rhGenos(p.rh).includes(v) ? v : ''; };
  let famMumAbo = aboPick(famMum, famSaved.mumAbo), famDadAbo = aboPick(famDad, famSaved.dadAbo);
  let famMumRh  = rhPick(famMum, famSaved.mumRh),   famDadRh  = rhPick(famDad, famSaved.dadRh);
  const saveFam = () => store.write(PRE + 'family', { mum: famMum, dad: famDad, mumAbo: famMumAbo, dadAbo: famDadAbo, mumRh: famMumRh, dadRh: famDadRh });
  const resolvedAbo = (g, picked) => { const p = B.parse(g); if (!p) return ''; const all = B.aboGenos(p.abo); return all.includes(picked) ? picked : (all.length === 1 ? all[0] : ''); };
  const resolvedRh  = (g, picked) => { const p = B.parse(g); if (!p) return ''; const all = B.rhGenos(p.rh);  return all.includes(picked) ? picked : (all.length === 1 ? all[0] : ''); };
  const oddLabel = (row, total) => {
    if (!row || !row.n) return '';
    if (row.n === total) return '100%';
    return row.pct % 1 === 0 ? row.pct + '%' : row.n + '/' + total;
  };

  const f0 = sec('alleles', 'How a child gets a group',
    h('p', { class: 'bg-p' }, 'A child gets one gene from Mum and one from Dad. A and B together make AB. O stays hidden unless both genes are O. Rh+ wins: two Rh\u2212 parents have only a Rh\u2212 child; a Rh+ parent can have either.'));

  function parentChips(which) {
    return CHIPS.map(g => h('button', { type: 'button', class: 'bg-chip', 'data-g': g, 'aria-pressed': 'false',
      'aria-label': (which === 'mum' ? 'Mum ' : 'Dad ') + B.name(g),
      onclick: () => setParent(which, g) }, B.name(g)));
  }
  const mumBtns = parentChips('mum'), dadBtns = parentChips('dad');
  const mumGenoBox = h('div', { class: 'bg-genos' }), dadGenoBox = h('div', { class: 'bg-genos' });

  function genoRow(label, options, picked, onPick) {
    if (!options.length) return null;
    if (options.length === 1)
      return h('div', { class: 'bg-genorow' }, h('span', { class: 'bg-genol' }, label), h('span', { class: 'bg-cn' }, options[0]));
    const btns = [['', 'Either'], ...options.map(o => [o, o])].map(([v, lab]) =>
      h('button', { type: 'button', class: 'bg-tog bg-genob', 'aria-pressed': String(picked === v), onclick: () => onPick(v) }, lab));
    return h('div', { class: 'bg-genorow' }, h('span', { class: 'bg-genol' }, label), h('div', { class: 'bg-togs' }, btns));
  }
  function fillGenos() {
    const mp = B.parse(famMum), dp = B.parse(famDad);
    const mumRows = mp ? [genoRow('Mum ABO', B.aboGenos(mp.abo), famMumAbo, v => { famMumAbo = v; saveFam(); fillGenos(); paintMore(); }),
                          genoRow('Mum Rh',  B.rhGenos(mp.rh),  famMumRh,  v => { famMumRh  = v; saveFam(); fillGenos(); paintMore(); })].filter(Boolean) : [];
    const dadRows = dp ? [genoRow('Dad ABO', B.aboGenos(dp.abo), famDadAbo, v => { famDadAbo = v; saveFam(); fillGenos(); paintMore(); }),
                          genoRow('Dad Rh',  B.rhGenos(dp.rh),  famDadRh,  v => { famDadRh  = v; saveFam(); fillGenos(); paintMore(); })].filter(Boolean) : [];
    mumGenoBox.replaceChildren(...mumRows);
    dadGenoBox.replaceChildren(...dadRows);
  }

  const childChips = CHIPS.map(g => h('div', { class: 'bg-childchip', 'data-g': g, 'aria-label': B.name(g) }, B.name(g)));
  const famSay = h('p', { class: 'bg-tip bg-whyline', role: 'status', 'aria-live': 'polite' });
  const famBars = h('div', { class: 'bg-bars' });
  const famPunnett = h('div', { class: 'bg-punnetts' });

  function punnettCard(title, sq) {
    return h('div', { class: 'bg-pq' }, h('p', { class: 'bg-pqcap' }, title),
      h('div', { class: 'bg-pqgrid', role: 'table', 'aria-label': title },
        h('div', { class: 'bg-pqh' }, ''),
        ...sq.cols.map(c => h('div', { class: 'bg-pqh' }, c)),
        ...[0, 1].flatMap(i => [h('div', { class: 'bg-pqh' }, sq.rows[i]), ...sq.cells[i].map(cell => h('div', { class: 'bg-pqc' }, cell))])));
  }
  function paintPicker() {
    mumBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.g === famMum)));
    dadBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.g === famDad)));
    const possible = B.childGroups(famMum, famDad);
    childChips.forEach(c => {
      const on = possible.includes(c.dataset.g);
      c.classList.toggle('bg-on', on); c.classList.toggle('bg-off', !on);
      c.setAttribute('aria-disabled', String(!on));
    });
    famSay.textContent = B.pickerWhy(famMum, famDad);
    const mp = B.parse(famMum), dp = B.parse(famDad);
    tableCells.forEach(td => {
      const hit = mp && dp && td.dataset.mum === mp.abo && td.dataset.dad === dp.abo;
      td.classList.toggle('bg-on', !!hit);
      td.setAttribute('aria-pressed', String(!!hit));
    });
  }
  function paintMore() {
    const aboM = resolvedAbo(famMum, famMumAbo), aboD = resolvedAbo(famDad, famDadAbo);
    const rhM  = resolvedRh(famMum, famMumRh),   rhD  = resolvedRh(famDad, famDadRh);
    const odds = (aboM && aboD && rhM && rhD) ? B.childOdds(aboM, aboD, rhM, rhD) : null;
    if (odds) {
      famBars.replaceChildren(...odds.rows.filter(r => r.n > 0).map(r => h('div', { class: 'bg-bar' },
        h('span', { class: 'bg-barl' }, B.name(r.group)),
        h('span', { class: 'bg-bart' }, h('span', { class: 'bg-barf', style: 'width:' + r.pct + '%' })),
        h('span', { class: 'bg-barv' }, oddLabel(r, odds.total)))));
    } else famBars.replaceChildren();
    const cards = [];
    if (aboM && aboD) cards.push(punnettCard('ABO: ' + aboM + ' \u00d7 ' + aboD, B.punnett(aboM, aboD)));
    if (rhM && rhD)   cards.push(punnettCard('Rh: ' + rhM + ' \u00d7 ' + rhD, B.punnett(rhM, rhD)));
    famPunnett.replaceChildren(...cards);
  }
  function setParent(which, g) {
    if (which === 'mum') { famMum = g; famMumAbo = aboPick(g, famMumAbo); famMumRh = rhPick(g, famMumRh); }
    else { famDad = g; famDadAbo = aboPick(g, famDadAbo); famDadRh = rhPick(g, famDadRh); }
    saveFam(); fillGenos(); paintPicker(); paintMore();
  }
  function setFromTable(mumAbo, dadAbo) {
    const m = B.parse(famMum), d = B.parse(famDad);
    setParent('mum', mumAbo + (m && m.rh ? m.rh : '+'));
    setParent('dad', dadAbo + (d && d.rh ? d.rh : '+'));
  }

  const table = B.aboTable();
  const tableCells = [];
  const aboTableEl = h('table', { class: 'bg-abotable', 'aria-label': 'Possible child ABO groups' },
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Mum \\ Dad'),
      ...table.cols.map(c => h('th', { scope: 'col' }, 'Dad ' + c)))),
    h('tbody', null, ...table.rows.map((mum, i) => h('tr', null,
      h('th', { scope: 'row' }, 'Mum ' + mum),
      ...table.cells[i].map((child, j) => {
        const dad = table.cols[j];
        const td = h('td', { role: 'button', tabindex: '0', 'data-mum': mum, 'data-dad': dad,
          'aria-label': 'Mum ' + mum + ' and Dad ' + dad + ': child can be ' + child.join(', '),
          onclick: () => setFromTable(mum, dad),
          onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault && e.preventDefault(); setFromTable(mum, dad); } } },
          child.join(', '));
        tableCells.push(td);
        return td;
      })))));

  const parentsPane = h('div', { class: 'bg-parents' },
    sec('parents', 'Mum and Dad',
      h('div', { class: 'bg-picker' },
        h('div', { class: 'bg-pickcol' }, h('h3', { class: 'bg-pickh' }, 'Mum'), h('div', { class: 'bg-chips', role: 'group', 'aria-label': "Mum's group" }, mumBtns)),
        h('div', { class: 'bg-pickcol' }, h('h3', { class: 'bg-pickh' }, 'Dad'), h('div', { class: 'bg-chips', role: 'group', 'aria-label': "Dad's group" }, dadBtns))),
      h('div', { class: 'bg-childbox' },
        h('h3', { class: 'bg-pickh' }, 'Child'),
        h('div', { class: 'bg-childchips', 'aria-label': 'Possible child groups' }, childChips),
        famSay)));

  const rhNote = h('p', { class: 'bg-p bg-muted' }, '+ and + can give + or \u2212; \u2212 and \u2212 give only \u2212; + and \u2212 can give either.');
  const tablePane = sec('abotable', 'ABO table',
    h('p', { class: 'bg-p bg-muted' }, 'Mum down the side, Dad across the top. Each cell lists the child ABO groups that are possible. Tap a cell to set the picker.'),
    h('div', { class: 'bg-tablewrap' }, aboTableEl), rhNote);

  let guess = null, guessPicked = -1, guessScore = { ok: 0, n: 0 };
  const guessChildBox = h('div', { class: 'bg-guesschild' });
  const guessPairs = h('div', { class: 'bg-grid bg-grid2' });
  const guessSay = h('p', { class: 'bg-tip', role: 'status', 'aria-live': 'polite' });
  const guessScoreEl = h('p', { class: 'bg-p bg-muted' });
  const guessNext = h('button', { type: 'button', class: 'bg-back', hidden: true, onclick: () => newGuess() }, 'Next puzzle');
  function pairCard(pair, i) {
    return h('button', { type: 'button', class: 'bg-card bg-pair', 'data-i': String(i),
      'aria-label': 'Mum ' + B.name(pair.mum) + ' and Dad ' + B.name(pair.dad),
      onclick: () => pickGuess(i) },
      h('div', { class: 'bg-pairwho' },
        h('span', { class: 'bg-pairp' }, h('span', { class: 'bg-cj' }, 'Mum'), drop(pair.mum)),
        h('span', { class: 'bg-pairp' }, h('span', { class: 'bg-cj' }, 'Dad'), drop(pair.dad))));
  }
  function paintScore() { guessScoreEl.textContent = guessScore.n ? ('Your score: ' + guessScore.ok + ' of ' + guessScore.n + '.') : ''; }
  function newGuess() {
    guess = B.makeGuess(); guessPicked = -1;
    guessChildBox.replaceChildren(
      h('p', { class: 'bg-p' }, 'This child is'),
      drop(guess.child),
      h('p', { class: 'bg-p' }, 'Which parents can have this child? Tap a pair.'));
    guessPairs.replaceChildren(pairCard(guess.pairs[0], 0), pairCard(guess.pairs[1], 1));
    guessSay.textContent = 'Tap the parents who can have this child.';
    guessNext.hidden = true;
    paintScore();
  }
  function pickGuess(i) {
    if (guessPicked >= 0 || !guess) return;
    guessPicked = i; guessScore.n++; if (i === guess.answer) guessScore.ok++;
    [...guessPairs.children].forEach((c, j) => {
      c.classList.toggle('bg-yes', j === guess.answer);
      c.classList.toggle('bg-no', j === i && i !== guess.answer);
      c.setAttribute('aria-pressed', String(j === i));
    });
    const pick = guess.pairs[i], right = guess.pairs[guess.answer];
    const bits = [B.inheritWhy(pick.mum, pick.dad, guess.child)];
    if (i !== guess.answer) bits.push(B.inheritWhy(right.mum, right.dad, guess.child));
    guessSay.replaceChildren(...bits.flatMap((t, n) => n ? [' ', t] : [t]));
    guessNext.hidden = false;
    paintScore();
  }
  const guessPane = h('div', { class: 'bg-guess' },
    sec('guess', 'Guess the parents', guessChildBox, guessPairs, guessSay, guessNext, guessScoreEl));

  const morePane = h('details', { class: 'bg-more' },
    h('summary', null, 'More: guess and gene pairs'),
    h('p', { class: 'bg-p bg-muted' }, 'Optional: pick the gene pair to see the odds and a Punnett square.'),
    mumGenoBox, dadGenoBox, famBars, famPunnett, guessPane);

  // ================= MYTHS VIEW (BG-5) =================
  const mythSaved = store.read(PRE + 'myths', {}) || {};
  let mythAbo = B.personality.some(p => p.abo === mythSaved.abo) ? mythSaved.abo : '';
  const saveMyths = () => store.write(PRE + 'myths', { abo: mythAbo });
  const persTip = h('p', { class: 'bg-tip', role: 'status' }, 'Tap a group to read the traits people once believed.');
  function paintPersTip() {
    const p = B.personality.find(x => x.abo === mythAbo);
    persTip.textContent = p ? ('Type ' + p.abo + ': ' + p.text) : 'Tap a group to read the traits people once believed.';
  }
  const persCards = B.personality.map(p => h('button', { type: 'button', class: 'bg-card bg-perscard', 'data-abo': p.abo,
    'aria-pressed': String(p.abo === mythAbo),
    'aria-label': 'Group ' + p.abo + ' personality myth',
    onclick: () => pickMyth(p.abo) },
    h('span', { class: 'bg-badge' }, 'Myth, not science'),
    h('span', { class: 'bg-big' }, p.abo),
    h('span', { class: 'bg-cj' }, p.text)));
  function pickMyth(a) {
    mythAbo = mythAbo === a ? '' : a;
    saveMyths();
    persCards.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.abo === mythAbo)));
    paintPersTip();
  }
  paintPersTip();
  const m1 = sec('ketsueki', "Japan's blood-type personality",
    h('p', { class: 'bg-p' }, B.mythIntro.history),
    h('div', { class: 'bg-grid bg-pers' }, persCards),
    persTip,
    h('p', { class: 'bg-p' }, B.mythIntro.studies),
    h('p', { class: 'bg-p bg-muted' }, B.mythIntro.harassment));
  function flipCard(item) {
    const front = h('span', { class: 'bg-flipside bg-flip-front' },
      h('span', { class: 'bg-flip-k' }, 'Myth'),
      h('span', { class: 'bg-cn' }, item.myth),
      h('span', { class: 'bg-cj' }, 'Tap to see the fact'));
    const back = h('span', { class: 'bg-flipside bg-flip-back' },
      h('span', { class: 'bg-flip-k' }, 'Fact'),
      h('span', { class: 'bg-cn' }, item.fact),
      h('span', { class: 'bg-cj' }, 'Tap to see the myth'));
    const btn = h('button', { type: 'button', class: 'bg-card bg-flip', 'data-myth': item.id,
      'aria-pressed': 'false',
      'aria-label': 'Myth: ' + item.myth + ' Fact: ' + item.fact,
      onclick: () => {
        const on = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', String(on));
        btn.classList.toggle('bg-flipped', on);
      } }, front, back);
    return btn;
  }
  const m2 = sec('mythfact', 'Myth vs Fact',
    h('p', { class: 'bg-p bg-muted' }, 'Tap a card to flip it. These are common beliefs, each with the real fact in a line or two.'),
    h('div', { class: 'bg-flips' }, B.mythFacts.map(flipCard)));


  // ================= HEALTH VIEW (BG-6 / BG-6a) =================
  // Part 1: healthy blood. Part 2 (#bg-health-part2): know your numbers, a CBC explainer, and an Hb checker (stores nothing).
  const foodChips = foods => h('ul', { class: 'bg-foods' }, foods.map(f => h('li', { class: 'bg-food' }, f)));
  const needSec = sec('needs', 'What healthy blood needs',
    h('p', { class: 'bg-p' }, 'Healthy blood needs a few key nutrients. Iron is used to make haemoglobin, which carries oxygen. Vitamin B12 and folate help the body make red cells. Vitamin C helps the body absorb iron from plant foods.'),
    h('div', { class: 'bg-grid bg-nutri' }, B.health.needs.map(n => h('div', { class: 'bg-card bg-nutricard', 'data-nutrient': n.id },
      h('span', { class: 'bg-cn' }, n.name),
      h('span', { class: 'bg-cj' }, n.job),
      foodChips(n.foods),
      n.note ? h('p', { class: 'bg-p bg-muted' }, n.note) : null))));
  const tipSec = sec('irontips', 'Iron tips',
    h('div', { class: 'bg-grid' }, B.health.ironTips.map(tx => h('div', { class: 'bg-card bg-why' },
      h('span', { class: 'bg-cj' }, tx)))));
  const anaemiaSec = sec('anaemia', 'Anaemia',
    h('p', { class: 'bg-p' }, B.health.anaemia.what),
    h('p', { class: 'bg-p' }, h('b', null, 'Common signs')),
    h('div', { class: 'bg-signs' }, B.health.anaemia.signs.map(sg => h('span', { class: 'bg-sign' }, sg))),
    h('p', { class: 'bg-p' }, h('b', null, 'Who is at higher risk? '), B.health.anaemia.risk),
    h('p', { class: 'bg-tip bg-warn' }, B.health.anaemia.warning));
  const lifeSec = sec('lifestyle', 'Lifestyle for circulation',
    h('div', { class: 'bg-grid' }, B.health.lifestyle.map(x => h('div', { class: 'bg-card bg-why', 'data-life': x.id },
      h('span', { class: 'bg-cn' }, x.title), h('span', { class: 'bg-cj' }, x.text)))));
  const healthDisc = h('p', { class: 'bg-disc' }, B.health.disclaimer);
  const rangeSec = sec('numbers', 'Know your numbers',
    h('p', { class: 'bg-p bg-muted' }, B.health.ranges.note),
    h('div', { class: 'bg-grid bg-ranges' }, B.health.ranges.items.map(r => h('div', { class: 'bg-card bg-rangecard', 'data-range': r.id },
      h('span', { class: 'bg-cn' }, r.title),
      h('span', { class: 'bg-unit' }, r.unit),
      h('ul', { class: 'bg-rangelist' }, r.lines.map(ln => h('li', null, ln))),
      h('p', { class: 'bg-p bg-seedoc' }, r.seeDoctor)))));
  const cbcSec = sec('cbc', 'Reading a CBC report',
    h('p', { class: 'bg-p bg-muted' }, B.health.cbc.lead),
    h('div', { class: 'bg-grid bg-cbc' }, B.health.cbc.items.map(c => h('div', { class: 'bg-card bg-cbccard', 'data-cbc': c.id },
      h('span', { class: 'bg-cn' }, c.name),
      h('span', { class: 'bg-cj' }, c.text)))));
  let hbWho = '';
  const hbOut = h('p', { class: 'bg-tip', id: 'bg-hb-out', 'aria-live': 'polite' });
  const hbInput = h('input', { type: 'number', class: 'bg-hbin', id: 'bg-hb-in', inputmode: 'decimal',
    min: '3', max: '25', step: '0.1', autocomplete: 'off', enterkeyhint: 'done',
    'aria-label': 'Haemoglobin in grams per decilitre' });
  const paintHb = () => {
    const raw = String(hbInput.value || '').trim();
    const band = B.hbBand(raw, hbWho);
    hbOut.className = 'bg-tip';
    if (!raw && !hbWho) { hbOut.textContent = 'Enter a haemoglobin value and pick who the reading is for.'; return; }
    if (!hbWho) { hbOut.textContent = 'Pick who the reading is for.'; return; }
    if (!raw) { hbOut.textContent = 'Enter a haemoglobin value in g/dL.'; return; }
    if (!band) { hbOut.textContent = 'Enter a number from 3 to 25.'; return; }
    hbOut.classList.add('bg-band-' + band);
    if (band === 'low') hbOut.textContent = 'This looks low. Talk to a doctor.';
    else if (band === 'high') hbOut.textContent = 'This looks high. A doctor can advise.';
    else hbOut.textContent = 'This looks in the usual range. Labs vary, so a doctor can confirm.';
  };
  const whoBtns = [['man', 'Man'], ['woman', 'Woman'], ['pregnant', 'Pregnant']].map(([id, label]) =>
    h('button', { type: 'button', class: 'bg-tog', 'data-who': id, 'aria-pressed': 'false', onclick: () => {
      hbWho = id;
      whoBtns.forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-who') === hbWho)));
      paintHb();
    } }, label));
  hbInput.addEventListener('input', paintHb);
  hbInput.addEventListener('change', paintHb);
  paintHb();
  const hbSec = sec('hbcheck', 'Is my Hb normal?',
    h('p', { class: 'bg-p bg-muted' }, 'Enter a haemoglobin value in g/dL and pick who the reading is for. Nothing is saved. This is only a guide; labs vary.'),
    h('div', { class: 'bg-hbcheck' },
      h('label', { class: 'bg-hblabel', 'for': 'bg-hb-in' }, h('span', null, 'Hb (g/dL)'), hbInput),
      h('div', { class: 'bg-togs', role: 'group', 'aria-label': 'Who the reading is for' }, whoBtns),
      hbOut));
  const healthPart2 = h('div', { id: 'bg-health-part2', class: 'bg-health-part2' }, rangeSec, cbcSec, hbSec);

  // ---- views and navigation (#donate, #family, #myths, #health); title-bar tabs switch these views ----
  const TABS = B.views.map(t => ({ id: t.id, label: t.label, short: t.short, hash: t.hash, controls: 'bg-' + t.id }));
  const disc = () => h('p', { class: 'bg-disc' }, 'For learning only. A doctor or blood bank can test your blood group.');
  const famNote = h('p', { class: 'bg-disc' }, 'Rare variants (like Bombay group) exist. Real family questions need a lab test.');
  const home = h('div', { class: 'bg-view', id: 'bg-home', 'data-view': 'home', role: 'tabpanel' }, s1, s2, s3, s4, s5, s6, disc());
  const donate = h('div', { class: 'bg-view', id: 'bg-donate', 'data-view': 'donate', role: 'tabpanel', hidden: true },
    h('div', { class: 'bg-top' }, h('h2', { class: 'bg-vt' }, 'Blood donation')), d1, d2, d3, d4, d5, disc());
  const family = h('div', { class: 'bg-view', id: 'bg-family', 'data-view': 'family', role: 'tabpanel', hidden: true },
    h('div', { class: 'bg-top' }, h('h2', { class: 'bg-vt' }, 'Family')),
    f0, parentsPane, tablePane, morePane, famNote);
  const myths = h('div', { class: 'bg-view', id: 'bg-myths', 'data-view': 'myths', role: 'tabpanel', hidden: true },
    h('div', { class: 'bg-top' }, h('h2', { class: 'bg-vt' }, 'Myths')),
    m1, m2, disc());
  const health = h('div', { class: 'bg-view', id: 'bg-health', 'data-view': 'health', role: 'tabpanel', hidden: true },
    h('div', { class: 'bg-top' }, h('h2', { class: 'bg-vt' }, 'Health')),
    needSec, tipSec, anaemiaSec, lifeSec, healthPart2, healthDisc);
  const panels = { home, donate, family, myths, health };

  const here = h('span', { class: 'lrn-here' }, 'Blood Group');
  const head = h('header', { class: 'lrn-head' }, h('h1', null, here), h('span', { class: 'bg-ver' }, VER));
  const main = h('main', { class: 'lrn-main bg-main', id: 'lrn-main' }, home, donate, family, myths, health);
  let view = '';
  function show(v) {
    if (!panels[v]) v = 'home';
    if (v === view) return;
    if (view === 'home') homeTop = main.scrollTop;
    view = v;
    Object.keys(panels).forEach(id => { panels[id].hidden = id !== v; });
    main.scrollTop = v === 'home' ? homeTop : 0;
  }
  const route = () => {
    const tab = window.LearnHubBar && LearnHubBar.tabFromHash ? LearnHubBar.tabFromHash(TABS, location.hash) : null;
    const raw = (location.hash || '').replace(/^#/, '');
    const v = tab && tab.id ? tab.id : (panels[raw] ? raw : 'home');
    show(v);
  };
  window.addEventListener('hashchange', route);
  setChart(chPick, chMode);
  fillGenos(); paintPicker(); paintMore(); newGuess();
  root.className = 'lrn bg'; root.replaceChildren(head, main);
  route();
  document.title = 'Blood Group ' + VER;
  if (window.LearnHubBar) LearnHubBar.attach(head, { tabs: TABS, hash: true, tabLabel: 'Blood Group sections' });
})();
