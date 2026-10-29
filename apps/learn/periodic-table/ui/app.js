/* Periodic Table PT2 — screens: Table (all 118 elements in the usual 18-column layout with the lanthanide and actinide
   rows below, at the top of the page; under it the search row with Category / State and zoom, then the legend chips
   that filter; tap an element for its card) and
   Quiz (symbol -> name, name -> symbol, find it on the table; 10 questions; levels first 20 / first 36 / all 118).
   Saves in localStorage: learn.periodic-table.view ('cat' / 'state'), .zoom, .hint (landscape hint closed) and .best (via the Learn kit). */
(() => {
  const P = window.PT, VER = 'PT2', PRE = 'learn.periodic-table.', N = 10;
  const prog = LRN.progress(PRE), store = LRN.store;
  const root = document.getElementById('app');
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : String(c)));
    return el;
  };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const COL = { alkali: '#ff6b6b', alkaline: '#ffa94d', transition: '#ffd43b', post: '#b2c2d4', metalloid: '#8ce99a', nonmetal: '#4dabf7',
    halogen: '#66d9e8', noble: '#b197fc', lanthanide: '#f783ac', actinide: '#e599f7', solid: '#c9ced6', liquid: '#4dabf7', gas: '#ffd43b', unknown: '#5c636e' };
  const LEVELS = [{ id: 'first20', name: 'First 20', n: 20 }, { id: 'first36', name: 'First 36', n: 36 }, { id: 'all', name: 'All 118', n: 118 }];
  const TYPES = [{ id: 'sym', name: 'Symbol \u2192 name', info: 'See a symbol, pick its name.' }, { id: 'name', name: 'Name \u2192 symbol', info: 'See a name, pick its symbol.' },
    { id: 'find', name: 'Find it', info: 'Tap the element on the table.' }];
  let view = store.read(PRE + 'view', 'cat') === 'state' ? 'state' : 'cat', zoom = +store.read(PRE + 'zoom', 1) || 1, filter = null, query = '', mode = 'table';
  const key = e => view === 'cat' ? e.cat : e.state;
  const yearTxt = e => e.year === 0 ? 'Known since ancient times' : e.year < 1500 ? 'About ' + e.year : String(e.year);

  const modeBar = h('div', { class: 'lrn-mode', role: 'group', 'aria-label': 'Mode' },
    [['table', 'Table'], ['quiz', 'Quiz']].map(([m, l]) => h('button', { type: 'button', 'data-m': m, onclick: () => go(m) }, l)));
  const head = h('header', { class: 'lrn-head' }, h('h1', null, h('span', { class: 'lrn-here' }, 'Periodic Table')), modeBar, h('span', { class: 'pt-ver' }, VER));
  const main = h('main', { class: 'lrn-main pt-main', id: 'lrn-main' });
  const overlay = h('div', { class: 'pt-over', hidden: true, onclick: e => { if (e.target === overlay) closeCard(); } });
  root.className = 'lrn pt'; root.replaceChildren(head, main, overlay);
  if (window.LearnHubBar) LearnHubBar.attach(root.querySelector('.lrn-head'));   // TB2: Hub desktop window: the mode tabs go to the title bar

  // ---------- the grid (used by Table and by the Find quiz) ----------
  function makeGrid(onPick, byCat) {
    const grid = h('div', { class: 'pt-grid', role: 'grid', 'aria-label': 'Periodic table' }), cells = {};
    for (let g = 1; g <= 18; g++) grid.append(h('span', { class: 'pt-gnum', style: `grid-area:1/${g + 1}` }, g));
    for (let p = 1; p <= 7; p++) grid.append(h('span', { class: 'pt-pnum', style: `grid-area:${p + 1}/1` }, p));
    [['57\u201371', 7, 'lanthanide'], ['89\u2013103', 8, 'actinide']].forEach(([t, r, c]) => grid.append(h('span', { class: 'pt-ph', 'data-cat': c, style: `grid-area:${r}/4;--c:${COL[c]}` }, t)));
    grid.append(h('span', { class: 'pt-gap', style: 'grid-area:9/1' }));
    P.els.forEach(e => {
      const b = h('button', { type: 'button', class: 'pt-el', 'data-z': e.z, 'aria-label': e.name + ', ' + e.z, style: `grid-area:${e.row + 1}/${e.col + 1}`, onclick: () => onPick(e, b) },
        h('span', { class: 'pt-z' }, e.z), h('b', { class: 'pt-s' }, e.sym), h('span', { class: 'pt-n' }, e.name));
      cells[e.z] = b; grid.append(b);
    });
    const scroll = h('div', { class: 'pt-scroll' }, grid);
    // On the Table screen the grid is the top row and only as tall as it needs (rows below sit right under it), so the
    // height it may use is the page area minus the rows below, not its own box (which would shrink to fit itself).
    const room = () => {
      const m = scroll.parentNode; if (!scroll.classList.contains('pt-top') || !m) return scroll.clientHeight;
      const cs = getComputedStyle(m), gap = parseFloat(cs.rowGap) || 0, kids = [...m.children].filter(k => k !== scroll && k.offsetHeight);
      return m.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - kids.reduce((a, k) => a + k.offsetHeight + gap, 0);
    };
    const fit = () => {
      const w = scroll.clientWidth - 6, hh = room() - 6; if (w <= 0) return;
      const fw = (w - 58) / 18, fh = (hh - 42) / 9.35 || 1e9;   // short landscape screens may go down to 22 px so the whole table fits
      const c = Math.floor(Math.max(fh < fw ? 22 : 30, Math.min(fw, fh, 84)) * zoom);
      grid.style.setProperty('--cell', c + 'px'); grid.classList.toggle('big', c >= 58); grid.classList.toggle('tiny', c < 38);
    };
    const paint = () => P.els.forEach(e => cells[e.z].style.setProperty('--c', COL[byCat ? e.cat : key(e)]));
    paint(); const ro = new ResizeObserver(fit); ro.observe(scroll); ro.observe(main);
    return { el: scroll, cells, fit, paint };
  }

  function go(m) {
    mode = m; closeCard();
    modeBar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    document.title = 'Periodic Table ' + VER + (m === 'quiz' ? ' \u2013 Quiz' : '');
    m === 'table' ? table() : quizMenu();
  }

  // ---------- table ----------
  let G = null;
  function table() {
    G = makeGrid(e => openCard(e));
    const legend = h('div', { class: 'pt-legend', role: 'group', 'aria-label': 'Legend and filter' });
    const search = h('input', { type: 'search', class: 'pt-search', placeholder: 'Search name, symbol or number', 'aria-label': 'Search elements', value: query,
      oninput: () => { query = search.value.trim().toLowerCase(); apply(); },
      onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); const m = matches(); if (m.length) openCard(m[0]); } } });
    const found = h('span', { class: 'pt-found', 'aria-live': 'polite' });
    const vbtn = (v, l) => h('button', { type: 'button', class: 'lrn-qc pt-tog', 'aria-pressed': String(view === v), 'data-v': v, onclick: () => { view = v; filter = null; store.write(PRE + 'view', v); G.paint(); drawLegend(); apply(); bar.querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === view))); } }, l);
    const zb = (d, l) => h('button', { type: 'button', class: 'lrn-qc pt-zoom', 'aria-label': d > 0 ? 'Zoom in' : 'Zoom out', onclick: () => { zoom = Math.min(2.5, Math.max(1, +(zoom + d).toFixed(2))); store.write(PRE + 'zoom', zoom); G.fit(); } }, l);
    const bar = h('div', { class: 'pt-bar' }, search, found, h('span', { class: 'pt-views' }, vbtn('cat', 'Category'), vbtn('state', 'State')), zb(-0.5, '\u2212'), zb(0.5, '+'));
    const hint = store.read(PRE + 'hint', false) ? null : h('p', { class: 'pt-hint' }, '\u{1F4F1}\u21BB Turn your phone sideways to see more of the table. Swipe to scroll, or use \u2212 / +.',
      h('button', { type: 'button', class: 'pt-x', 'aria-label': 'Close hint', onclick: e => { store.write(PRE + 'hint', true); e.currentTarget.parentNode.remove(); } }, '\u00D7'));
    function matches() {
      if (!query) return []; const n = +query;
      return P.els.filter(e => n ? e.z === n : e.sym.toLowerCase() === query || e.name.toLowerCase().includes(query)).sort((a, b) => (b.sym.toLowerCase() === query) - (a.sym.toLowerCase() === query));
    }
    function apply() {
      const m = query ? new Set(matches().map(e => e.z)) : null;
      P.els.forEach(e => G.cells[e.z].classList.toggle('dim', (m && !m.has(e.z)) || (filter && key(e) !== filter)));
      G.el.querySelectorAll('.pt-ph').forEach(p => p.classList.toggle('dim', !!filter && (view !== 'cat' || p.dataset.cat !== filter) || !!m));
      found.textContent = query ? (m.size ? m.size + ' found' : 'No match') : '';
      if (m && m.size === 1) G.cells[[...m][0]].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    function drawLegend() {
      const list = view === 'cat' ? P.cats : P.states;
      legend.replaceChildren(...Object.keys(list).map(k => h('button', { type: 'button', class: 'pt-chip', 'data-k': k, 'aria-pressed': String(filter === k), style: '--c:' + COL[k],
        onclick: () => { filter = filter === k ? null : k; drawLegend(); apply(); } }, h('i'), k === 'unknown' ? 'Not known' : list[k])));
    }
    drawLegend();
    G.el.classList.add('pt-top'); main.replaceChildren(G.el, bar, legend, hint); apply(); G.fit();   // PT2: the table is the top row, search / view / zoom and the legend below it
  }

  // ---------- element card ----------
  let cardEl = null;
  function openCard(e) {
    const row = (k, v) => h('div', { class: 'pt-kv' }, h('span', null, k), h('b', null, v));
    const nav = d => { const n = P.els[(e.z - 1 + d + 118) % 118]; openCard(n); };
    cardEl = h('div', { class: 'pt-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': e.name, style: '--c:' + COL[e.cat] },
      h('div', { class: 'pt-card-top' }, h('div', { class: 'pt-big' }, h('span', null, e.z), h('b', null, e.sym)),
        h('div', null, h('h2', null, e.name), h('p', null, P.cats[e.cat])),
        h('button', { type: 'button', class: 'pt-x pt-close', 'aria-label': 'Close', onclick: closeCard }, '\u00D7')),
      h('div', { class: 'pt-kvs' }, row('Atomic number', e.z), row('Atomic mass', e.massTxt), row('Group', e.group || 'f-block (no group number)'), row('Period', e.period),
        row('At room temperature', P.states[e.state]), row('Discovered', yearTxt(e))),
      h('p', { class: 'pt-fact' }, '\u{1F4A1} ' + e.facts),
      h('div', { class: 'pt-cnav' }, h('button', { type: 'button', class: 'lrn-qc', onclick: () => nav(-1) }, '\u2039 ' + P.els[(e.z + 116) % 118].sym),
        h('button', { type: 'button', class: 'lrn-qc', onclick: () => nav(1) }, P.els[e.z % 118].sym + ' \u203A')));
    overlay.replaceChildren(cardEl); overlay.hidden = false; cardEl.querySelector('.pt-close').focus();
  }
  function closeCard() { overlay.hidden = true; overlay.replaceChildren(); cardEl = null; }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) closeCard(); });

  // ---------- quiz ----------
  let Q = null;
  function quizMenu() {
    main.replaceChildren(h('div', { class: 'pt-menu' }, h('h2', { class: 'lrn-h' }, '\u{1F9EA} Element quiz'), h('p', { class: 'lrn-sub' }, N + ' questions. Pick a quiz and a level.'),
      TYPES.map(t => h('div', { class: 'lrn-card pt-qt' }, h('b', null, t.name), h('span', { class: 'lrn-sub' }, t.info),
        h('div', { class: 'pt-lvs' }, LEVELS.map(lv => { const b = prog.best(t.id + '-' + lv.id);
          return h('button', { type: 'button', class: 'lrn-qc pt-lv', 'data-q': t.id + '-' + lv.id, onclick: () => start(t, lv) }, lv.name, h('small', null, b ? 'Best ' + b.score + '/' + b.of : '\u2013')); }))))));
  }
  function start(t, lv) { const pool = P.els.slice(0, lv.n); Q = { t, lv, pool, list: shuffle(pool).slice(0, N), i: 0, score: 0 }; ask(); }
  function ask() {
    const { t, lv, pool } = Q, e = Q.list[Q.i], fb = h('p', { class: 'pt-fb', 'aria-live': 'polite' }); let done = false;
    const next = h('button', { type: 'button', class: 'lrn-qc pt-go', hidden: true, onclick: () => { Q.i++; Q.i < N ? ask() : results(); } }, 'Next \u203A');
    const answer = ok => { done = true; if (ok) Q.score++; fb.className = 'pt-fb ' + (ok ? 'ok' : 'bad');
      fb.textContent = (ok ? '\u2714 Right! ' : '\u2716 Not quite. ') + e.sym + ' is ' + e.name + ' (number ' + e.z + ').'; next.hidden = false; next.focus(); };
    const top = h('p', { class: 'lrn-sub pt-qtop' }, t.name + ' \u00B7 ' + lv.name + ' \u00B7 Question ' + (Q.i + 1) + ' of ' + N + ' \u00B7 Score ' + Q.score);
    if (t.id === 'find') {
      const g = makeGrid((x, b) => { if (done) return; g.cells[e.z].classList.add('ok'); if (x !== e) b.classList.add('bad'); answer(x === e); }, true);
      P.els.forEach(x => { if (x.z > lv.n) g.cells[x.z].classList.add('dim'); g.cells[x.z].classList.add('quiz'); });
      main.replaceChildren(h('div', { class: 'pt-qhead' }, top, h('h2', { class: 'lrn-h' }, 'Find ', h('span', { class: 'pt-target' }, e.name)), fb, next), g.el);
      return;
    }
    const sameStart = shuffle(pool.filter(x => x !== e && x.sym[0] === e.sym[0])), others = shuffle(pool.filter(x => x !== e && x.sym[0] !== e.sym[0]));
    const opts = shuffle([e].concat(t.id === 'name' ? sameStart.slice(0, 2) : [], others).slice(0, 4));
    const btns = opts.map(x => h('button', { type: 'button', class: 'pt-opt', 'data-z': x.z, onclick: ev => {
      if (done) return; btns.forEach(b => { if (+b.dataset.z === e.z) b.classList.add('ok'); }); if (x !== e) ev.currentTarget.classList.add('bad'); answer(x === e); } }, t.id === 'sym' ? x.name : x.sym));
    main.replaceChildren(h('div', { class: 'pt-menu' }, top,
      h('div', { class: 'pt-prompt', style: '--c:' + COL[e.cat] }, t.id === 'sym' ? h('b', null, e.sym) : h('span', null, e.name)),
      h('h2', { class: 'lrn-h' }, t.id === 'sym' ? 'Which element has this symbol?' : 'What is the symbol for ' + e.name + '?'), h('div', { class: 'pt-opts' }, btns), fb, next));
  }
  function results() {
    const id = Q.t.id + '-' + Q.lv.id, best = prog.saveScore(id, Q.score, N), b = prog.best(id);
    main.replaceChildren(h('div', { class: 'pt-menu' }, h('h2', { class: 'lrn-h' }, Q.score >= 8 ? '\u{1F389} Great work!' : '\u{1F9EA} Keep exploring!'),
      h('p', { class: 'pt-score' }, Q.score + ' / ' + N), h('p', { class: 'lrn-sub' }, best ? 'New best score!' : 'Best: ' + b.score + ' / ' + b.of),
      h('div', { class: 'pt-row' }, h('button', { type: 'button', class: 'lrn-qc pt-go', onclick: () => start(Q.t, Q.lv) }, 'Again'), h('button', { type: 'button', class: 'lrn-qc', onclick: quizMenu }, 'Quizzes'))));
  }
  go(location.hash === '#quiz' ? 'quiz' : 'table');
})();
