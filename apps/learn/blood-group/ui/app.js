/* Blood Group BG-3a — three views in one page, all drawings are inline SVG made here. HOME view (BG-1), one scrollable page:
   1 what blood is (red cells, white cells, platelets, plasma; tap a part for a tip), 2 the ABO groups (a red cell with its
   A / B markers and the antibodies in the plasma; tap a card to highlight it), 3 the Rh factor and the 8 groups as drop badges,
   4 how common each group is in India (approximate bars), 5 did you know, 6 cards that open the donation and family views
   (shortcuts; the title-bar tabs also switch views).
   DONATION view (BG-2, hash #donate so refresh and the browser Back button work): a "Who can give to whom" tap chart of the
   8 groups (Give to / Receive from, highlights come from BG.canGive), universal donor and receiver, who can donate (India,
   basic), why donate, what happens at a donation (4 steps).
   FAMILY view (BG-3, hash #family): alleles explainer, Parents to child (pick Mum and Dad, possible / not possible, optional
   genotypes with odds and a Punnett square) and Guess (which parents can have this child).
   Title-bar tabs (BG-3a, LearnHubBar array form): Groups / Donation / Family, mapped to "" / #donate / #family. Deep links
   and Back/Forward stay in sync. Home shortcut cards are kept; the old "<- Blood groups" back links are gone. Room is left
   for a future Quiz tab (BG-4), not added here.
   Saves in localStorage: learn.blood-group.group (the last highlighted ABO group), learn.blood-group.chart ({ group, mode }),
   learn.blood-group.family ({ mode, mum, dad, mumAbo, dadAbo, mumRh, dadRh }).
   In a Hub desktop window the header (and these tabs) move to the Hub title bar (LearnHubBar). */
(() => {
  const B = window.BG, VER = 'BG-3a', PRE = 'learn.blood-group.', store = LRN.store, NS = 'http://www.w3.org/2000/svg';
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

  // ---- 6 cards that open the donation and family views (shortcuts; tabs in the title bar also switch) ----
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
        s('path', { d: 'M20 24 C17.5 29 14 33 14 36 A6 6 0 0 0 26 36 C26 33 22.5 29 20 24 Z' })))));

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

  // ================= FAMILY VIEW (BG-3) =================
  const famSaved = store.read(PRE + 'family', {}) || {};
  let famMode = famSaved.mode === 'guess' ? 'guess' : 'parents';
  let famMum = B.groups.includes(famSaved.mum) ? famSaved.mum : '';
  let famDad = B.groups.includes(famSaved.dad) ? famSaved.dad : '';
  const aboPick = (g, v) => { const p = B.parse(g); return p && B.aboGenos(p.abo).includes(v) ? v : ''; };
  const rhPick  = (g, v) => { const p = B.parse(g); return p && B.rhGenos(p.rh).includes(v) ? v : ''; };
  let famMumAbo = aboPick(famMum, famSaved.mumAbo), famDadAbo = aboPick(famDad, famSaved.dadAbo);
  let famMumRh  = rhPick(famMum, famSaved.mumRh),   famDadRh  = rhPick(famDad, famSaved.dadRh);
  const saveFam = () => store.write(PRE + 'family', { mode: famMode, mum: famMum, dad: famDad, mumAbo: famMumAbo, dadAbo: famDadAbo, mumRh: famMumRh, dadRh: famDadRh });
  const resolvedAbo = (g, picked) => { const p = B.parse(g); if (!p) return ''; const all = B.aboGenos(p.abo); return all.includes(picked) ? picked : (all.length === 1 ? all[0] : ''); };
  const resolvedRh  = (g, picked) => { const p = B.parse(g); if (!p) return ''; const all = B.rhGenos(p.rh);  return all.includes(picked) ? picked : (all.length === 1 ? all[0] : ''); };
  const joinList = items => items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  const oddLabel = (row, total) => {
    if (!row || !row.n) return '';
    if (row.n === total) return '100%';
    return row.pct % 1 === 0 ? row.pct + '%' : row.n + '/' + total;
  };

  const f0 = sec('alleles', 'How a child gets a group',
    h('p', { class: 'bg-p' }, 'You get one letter (an allele) from Mum and one from Dad. The pair is your genotype. The group we see (A, B, AB or O, and + or \u2212) comes from that pair.'),
    h('ul', { class: 'bg-list' },
      h('li', null, h('b', null, 'A and B are co-dominant. '), 'If you have both, you are group AB.'),
      h('li', null, h('b', null, 'O is recessive. '), 'AO looks like A, and BO looks like B. Only OO is group O.'),
      h('li', null, h('b', null, 'Rh positive is dominant. '), 'One D is enough for Rh+. Only dd is Rh negative.')));

  const famModeBtns = [['parents', 'Parents to child'], ['guess', 'Guess']].map(([m, label]) =>
    h('button', { type: 'button', class: 'bg-tog', 'data-mode': m, 'aria-pressed': 'false', onclick: () => setFamMode(m) }, label));

  function parentBtns(which) {
    return B.groups.map(g => h('button', { type: 'button', class: 'bg-drop bg-dropb', 'data-g': g, 'aria-pressed': 'false',
      'aria-label': (which === 'mum' ? 'Mum ' : 'Dad ') + B.name(g),
      onclick: () => setParent(which, ((which === 'mum' ? famMum : famDad) === g) ? '' : g) },
      svg('0 0 40 48', 'bg-dropsvg', 'Blood group ' + B.name(g), s('path', { d: DROP })), h('span', { class: 'bg-dropt' }, B.name(g))));
  }
  const mumBtns = parentBtns('mum'), dadBtns = parentBtns('dad');
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
    const mumRows = mp ? [genoRow('Mum ABO', B.aboGenos(mp.abo), famMumAbo, v => { famMumAbo = v; saveFam(); fillGenos(); paintFam(); }),
                          genoRow('Mum Rh',  B.rhGenos(mp.rh),  famMumRh,  v => { famMumRh  = v; saveFam(); fillGenos(); paintFam(); })].filter(Boolean) : [];
    const dadRows = dp ? [genoRow('Dad ABO', B.aboGenos(dp.abo), famDadAbo, v => { famDadAbo = v; saveFam(); fillGenos(); paintFam(); }),
                          genoRow('Dad Rh',  B.rhGenos(dp.rh),  famDadRh,  v => { famDadRh  = v; saveFam(); fillGenos(); paintFam(); })].filter(Boolean) : [];
    mumGenoBox.replaceChildren(...mumRows);
    dadGenoBox.replaceChildren(...dadRows);
  }

  const famCells = B.groups.map(g => h('div', { class: 'bg-famcell', 'data-g': g },
    h('div', { class: 'bg-drop' }, svg('0 0 40 48', 'bg-dropsvg', 'Blood group ' + B.name(g), s('path', { d: DROP })), h('span', { class: 'bg-dropt' }, B.name(g))),
    h('span', { class: 'bg-pct' }, '')));
  const famSay = h('p', { class: 'bg-tip', role: 'status', 'aria-live': 'polite' });
  const famBars = h('div', { class: 'bg-bars' });
  const famPunnett = h('div', { class: 'bg-punnetts' });

  function punnettCard(title, sq) {
    return h('div', { class: 'bg-pq' }, h('p', { class: 'bg-pqcap' }, title),
      h('div', { class: 'bg-pqgrid', role: 'table', 'aria-label': title },
        h('div', { class: 'bg-pqh' }, ''),
        ...sq.cols.map(c => h('div', { class: 'bg-pqh' }, c)),
        ...[0, 1].flatMap(i => [h('div', { class: 'bg-pqh' }, sq.rows[i]), ...sq.cells[i].map(cell => h('div', { class: 'bg-pqc' }, cell))])));
  }
  function paintFam() {
    mumBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.g === famMum)));
    dadBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.g === famDad)));
    if (!famMum || !famDad) {
      famCells.forEach(c => { c.classList.remove('bg-on', 'bg-off'); c.querySelector('.bg-pct').textContent = ''; });
      famSay.textContent = 'Pick Mum\'s and Dad\'s groups to see which groups a child can have.';
      famBars.replaceChildren(); famPunnett.replaceChildren();
      return;
    }
    const aboM = resolvedAbo(famMum, famMumAbo), aboD = resolvedAbo(famDad, famDadAbo);
    const rhM  = resolvedRh(famMum, famMumRh),   rhD  = resolvedRh(famDad, famDadRh);
    const odds = (aboM && aboD && rhM && rhD) ? B.childOdds(aboM, aboD, rhM, rhD) : null;
    const possible = odds ? odds.rows.filter(r => r.n > 0).map(r => r.group) : B.childGroups(famMum, famDad);
    famCells.forEach(c => {
      const on = possible.includes(c.dataset.g);
      c.classList.toggle('bg-on', on); c.classList.toggle('bg-off', !on);
      const row = odds && odds.rows.find(r => r.group === c.dataset.g);
      c.querySelector('.bg-pct').textContent = odds ? oddLabel(row, odds.total) : '';
    });
    if (odds) {
      const bits = odds.rows.filter(r => r.n > 0).map(r => oddLabel(r, odds.total) + ' ' + B.name(r.group));
      famSay.textContent = 'With Mum ' + aboM + ' ' + rhM + ' and Dad ' + aboD + ' ' + rhD + ', a child is ' + joinList(bits) + '.';
      famBars.replaceChildren(...odds.rows.filter(r => r.n > 0).map(r => h('div', { class: 'bg-bar' },
        h('span', { class: 'bg-barl' }, B.name(r.group)),
        h('span', { class: 'bg-bart' }, h('span', { class: 'bg-barf', style: 'width:' + r.pct + '%' })),
        h('span', { class: 'bg-barv' }, oddLabel(r, odds.total)))));
    } else {
      const abo = B.ABO.filter(a => possible.some(g => B.parse(g).abo === a));
      const rh = ['+', '-'].filter(r => possible.some(g => B.parse(g).rh === r));
      let say;
      if (possible.length === 1) say = 'These parents can only have a ' + B.name(possible[0]) + ' child.';
      else {
        say = 'These parents can have a child of group ' + joinList(abo);
        say += rh.length === 2 ? ', Rh positive or Rh negative.' : (', and the child is always ' + (rh[0] === '+' ? 'Rh positive.' : 'Rh negative.'));
      }
      say += ' Pick a genotype to see the odds.';
      famSay.textContent = say;
      famBars.replaceChildren();
    }
    const cards = [];
    if (aboM && aboD) cards.push(punnettCard('ABO: ' + aboM + ' \u00d7 ' + aboD, B.punnett(aboM, aboD)));
    if (rhM && rhD)   cards.push(punnettCard('Rh: ' + rhM + ' \u00d7 ' + rhD, B.punnett(rhM, rhD)));
    famPunnett.replaceChildren(...cards);
  }
  function setParent(which, g) {
    if (which === 'mum') { famMum = g; famMumAbo = aboPick(g, famMumAbo); famMumRh = rhPick(g, famMumRh); }
    else { famDad = g; famDadAbo = aboPick(g, famDadAbo); famDadRh = rhPick(g, famDadRh); }
    saveFam(); fillGenos(); paintFam();
  }

  const parentsPane = h('div', { class: 'bg-parents' },
    sec('mum', "Mum's group", h('div', { class: 'bg-drops' }, mumBtns), mumGenoBox),
    sec('dad', "Dad's group", h('div', { class: 'bg-drops' }, dadBtns), dadGenoBox),
    sec('child', 'Possible children',
      h('div', { class: 'bg-drops' }, famCells), famSay, famBars, famPunnett,
      h('p', { class: 'bg-p bg-muted' }, 'Lit groups are possible. Dim groups are not. Odds appear when both genotypes are known.')));

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

  function setFamMode(m) {
    famMode = m === 'guess' ? 'guess' : 'parents'; saveFam();
    famModeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === famMode)));
    parentsPane.hidden = famMode !== 'parents';
    guessPane.hidden = famMode !== 'guess';
    if (famMode === 'guess' && !guess) newGuess();
  }

  // ---- views and navigation (#donate, #family); title-bar tabs switch these views ----
  const TABS = [
    { id: 'home', label: 'Groups', short: 'Groups', hash: '', controls: 'bg-home' },
    { id: 'donate', label: 'Donation', short: 'Donate', hash: '#donate', controls: 'bg-donate' },
    { id: 'family', label: 'Family', short: 'Family', hash: '#family', controls: 'bg-family' }
  ];
  const disc = () => h('p', { class: 'bg-disc' }, 'For learning only. A doctor or blood bank can test your blood group.');
  const famNote = h('p', { class: 'bg-disc' }, 'Rare variants (like Bombay group) exist. Real family questions need a lab test.');
  const home = h('div', { class: 'bg-view', id: 'bg-home', 'data-view': 'home', role: 'tabpanel' }, s1, s2, s3, s4, s5, s6, disc());
  const donate = h('div', { class: 'bg-view', id: 'bg-donate', 'data-view': 'donate', role: 'tabpanel', hidden: true },
    h('div', { class: 'bg-top' }, h('h2', { class: 'bg-vt' }, 'Blood donation')), d1, d2, d3, d4, d5, disc());
  const family = h('div', { class: 'bg-view', id: 'bg-family', 'data-view': 'family', role: 'tabpanel', hidden: true },
    h('div', { class: 'bg-top' }, h('h2', { class: 'bg-vt' }, 'Family puzzle')),
    f0, h('div', { class: 'bg-togs', role: 'group', 'aria-label': 'Family mode' }, famModeBtns),
    parentsPane, guessPane, famNote);
  const here = h('span', { class: 'lrn-here' }, 'Blood Group');
  const head = h('header', { class: 'lrn-head' }, h('h1', null, here), h('span', { class: 'bg-ver' }, VER));
  const main = h('main', { class: 'lrn-main bg-main', id: 'lrn-main' }, home, donate, family);
  let view = '';
  function show(v) {
    if (v === view) return;
    if (view === 'home') homeTop = main.scrollTop;
    view = v; home.hidden = v !== 'home'; donate.hidden = v !== 'donate'; family.hidden = v !== 'family';
    main.scrollTop = v === 'home' ? homeTop : 0;
  }
  const route = () => {
    const t = window.LearnHubBar && LearnHubBar.tabFromHash ? LearnHubBar.tabFromHash(TABS, location.hash) : null;
    const v = t && t.id ? t.id : (location.hash === '#donate' ? 'donate' : location.hash === '#family' ? 'family' : 'home');
    show(v);
  };
  window.addEventListener('hashchange', route);
  setChart(chPick, chMode);
  fillGenos(); paintFam(); setFamMode(famMode);
  root.className = 'lrn bg'; root.replaceChildren(head, main);
  route();
  document.title = 'Blood Group ' + VER;
  if (window.LearnHubBar) LearnHubBar.attach(head, { tabs: TABS, hash: true, tabLabel: 'Blood Group sections' });
})();
