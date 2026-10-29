/* Road Safety RS1 — screens: Signs (31 Indian road signs in 3 groups, tap for the meaning), Lights (animated traffic
   and pedestrian signal with what to do), Cross (Safe Crossing game), Rules (10 rule cards) and Quiz (signs, situations
   or mixed; 10 questions). Saves in localStorage: learn.road-safety.viewed (signs seen), .best (quizzes) and .cross (best crossing score). */
(() => {
  const R = window.RS, VER = 'RS1', PRE = 'learn.road-safety.', N = 10;
  const prog = LRN.progress(PRE), store = LRN.store, root = document.getElementById('app');
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : String(c)));
    return el;
  };
  const svg = (s, cls) => { const d = h('div', { class: 'rs-sv' }); d.innerHTML = R.svg(s, cls); return d; };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const MODES = { signs: 'Signs', lights: 'Lights', cross: 'Cross', rules: 'Rules', quiz: 'Quiz' };
  const modeBar = h('div', { class: 'lrn-mode rs-modes', role: 'group', 'aria-label': 'Mode' }, Object.keys(MODES).map(m => h('button', { type: 'button', 'data-m': m, onclick: () => go(m) }, MODES[m])));
  const main = h('main', { class: 'lrn-main rs-main', id: 'lrn-main' }), over = h('div', { class: 'rs-over', hidden: true, onclick: e => { if (e.target === over) closeCard(); } });
  root.className = 'lrn rs';
  root.replaceChildren(h('header', { class: 'lrn-head' }, h('h1', null, h('span', { class: 'lrn-here' }, 'Road Safety')), modeBar, h('span', { class: 'rs-ver' }, VER)), main, over);
  if (window.LearnHubBar) LearnHubBar.attach(root.querySelector('.lrn-head'));   // TB2: Hub desktop window: the mode tabs go to the title bar
  let stopper = null;
  function go(m) {
    stopper && stopper(); stopper = null; closeCard();
    modeBar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    document.title = 'Road Safety ' + VER + ' \u2013 ' + MODES[m];
    ({ signs, lights, cross, rules, quiz: quizMenu })[m]();
  }
  const intro = (t, s) => [h('h2', { class: 'lrn-h' }, t), h('p', { class: 'lrn-sub' }, s)];

  // ---------- signs ----------
  let grp = 'all';
  function signs() {
    const seen = prog.viewed(), list = R.signs.filter(s => grp === 'all' || s.g === grp);
    const tab = (k, l) => h('button', { type: 'button', class: 'lrn-qc rs-tab', 'aria-pressed': String(grp === k), onclick: () => { grp = k; signs(); } }, l);
    main.replaceChildren(h('div', { class: 'rs-page' }, ...intro('\u{1F6A6} Road signs of India', 'Signs talk to everyone on the road. Tap a sign to see what it means. Seen ' + Object.keys(seen).length + ' of ' + R.signs.length + '.'),
      h('div', { class: 'rs-row' }, tab('all', 'All'), tab('m', '\u2B55 Mandatory'), tab('c', '\u26A0 Cautionary'), tab('i', '\u{1F7E6} Informatory')),
      grp === 'all' ? null : h('p', { class: 'rs-ginfo' }, R.groupInfo[grp]),
      h('div', { class: 'rs-signs' }, list.map(s => h('button', { type: 'button', class: 'rs-st' + (seen[s.id] ? ' seen' : ''), 'data-id': s.id, onclick: () => openCard(s) }, svg(s), h('span', null, s.name))))));
  }
  function openCard(s) {
    prog.markViewed(s.id);
    over.replaceChildren(h('div', { class: 'rs-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': s.name },
      h('button', { type: 'button', class: 'rs-x', 'aria-label': 'Close', onclick: closeCard }, '\u00D7'), svg(s, 'rs-sign big'),
      h('h2', null, s.name), h('p', { class: 'rs-grp g-' + s.g }, R.groups[s.g] + ' sign'), h('p', null, s.meaning), h('p', { class: 'lrn-sub' }, R.groupInfo[s.g])));
    over.hidden = false; over.querySelector('.rs-x').focus();
  }
  function closeCard() { if (over.hidden) return; over.hidden = true; over.replaceChildren(); if (main.querySelector('.rs-signs')) signs(); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });

  // ---------- traffic lights ----------
  function lights() {
    const NS = 'http://www.w3.org/2000/svg', sv = document.createElementNS(NS, 'svg');
    sv.setAttribute('viewBox', '0 0 200 220'); sv.setAttribute('class', 'rs-light');
    sv.innerHTML = '<rect x="20" y="10" width="64" height="180" rx="14" fill="#222"/><rect x="48" y="190" width="8" height="30" fill="#444"/>' +
      ['red', 'amber', 'green'].map((c, i) => `<circle data-l="${c}" cx="52" cy="${42 + i * 58}" r="22"/>`).join('') +
      '<rect x="116" y="60" width="64" height="120" rx="10" fill="#222"/><rect x="144" y="180" width="8" height="40" fill="#444"/>' +
      '<g data-l="stand"><circle cx="148" cy="80" r="7"/><path d="M141 90 h14 v26 h-4 v24 h-6 v-24 h-4 z"/></g>' +
      '<g data-l="walk"><circle cx="150" cy="126" r="6"/><path d="M146 134 l8 0 l3 16 l6 10 l-5 3 l-7 -10 l-4 10 l-6 -2 l5 -14 l-6 6 l-4 -3 z"/></g>';
    const car = h('div', { class: 'rs-carinfo' }), walk = h('div', { class: 'rs-walkinfo' });
    let st = 'red', auto = true, timer = 0, t = 0, blink = false;
    const SEQ = { red: ['green', 5], green: ['amber', 5], amber: ['red', 2] };
    const paint = () => {
      const on = { red: st === 'red', amber: st === 'amber' || (st === 'flash' && blink), green: st === 'green' };
      const col = { red: '#ff3b30', amber: '#ffb000', green: '#2ecc71' };
      sv.querySelectorAll('circle[data-l]').forEach(c => c.setAttribute('fill', on[c.dataset.l] ? col[c.dataset.l] : '#3a3a3a'));
      const wk = st === 'red' && !(t > 3.5 && blink);
      sv.querySelector('[data-l=stand]').setAttribute('fill', st !== 'red' ? '#ff3b30' : '#3a3a3a'); sv.querySelector('[data-l=walk]').setAttribute('fill', wk ? '#2ecc71' : '#3a3a3a');
      car.replaceChildren(h('b', null, '\u{1F697} Drivers: '), R.lights[st].car); walk.replaceChildren(h('b', null, '\u{1F6B6} Walkers: '), R.lights[st].walk + (st === 'red' && t > 3.5 ? ' (Flashing now: if you have not started, wait.)' : ''));
      btns.querySelectorAll('[data-s]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.s === st)));
      autoB.textContent = auto ? '\u23F8 Pause' : '\u25B6 Auto';
    };
    const set = s => { st = s; t = 0; paint(); };
    timer = setInterval(() => { blink = !blink; if (auto && st !== 'flash') { t += 0.5; if (t >= SEQ[st][1]) set(SEQ[st][0]); } paint(); }, 500);
    const autoB = h('button', { type: 'button', class: 'lrn-qc rs-go', onclick: () => { auto = !auto; if (st === 'flash') set('red'); paint(); } });
    const btns = h('div', { class: 'rs-row' }, autoB, ...[['red', 'Red'], ['amber', 'Amber'], ['green', 'Green'], ['flash', 'Flashing amber']].map(([s, l]) => h('button', { type: 'button', class: 'lrn-qc rs-tab', 'data-s': s, onclick: () => { auto = false; set(s); } }, l)));
    stopper = () => clearInterval(timer);
    main.replaceChildren(h('div', { class: 'rs-page rs-lights' }, h('div', { class: 'rs-lbox' }, sv),
      h('div', null, ...intro('\u{1F6A5} Traffic lights', 'The big light is for vehicles. The small one with the man is for people walking. It changes red \u2192 green \u2192 amber \u2192 red.'), btns, car, walk,
        h('p', { class: 'lrn-sub' }, 'Traffic police hand signals always come first: if a police officer is directing traffic, follow the officer, even if the light shows something else.'))));
    paint();
  }

  // ---------- safe crossing game ----------
  function cross() {
    const info = h('p', { class: 'rs-ginfo', 'aria-live': 'polite' }, 'In India traffic keeps LEFT: the cars nearest to you come from your RIGHT.');
    const best = () => 'Best: ' + store.read(PRE + 'cross', 0);
    const bestEl = h('span', { class: 'lrn-sub' }, best());
    const startB = h('button', { type: 'button', class: 'lrn-qc rs-go', onclick: () => { game.start(); startB.hidden = true; } }, '\u25B6 Start');
    const game = R.makeCross({ onInfo: s => info.textContent = s, onEnd: sc => {
      const old = store.read(PRE + 'cross', 0); if (sc > old) store.write(PRE + 'cross', sc);
      info.textContent = 'Game over: ' + sc + ' safe crossing' + (sc === 1 ? '' : 's') + '. ' + (sc > old ? 'New best!' : ''); bestEl.textContent = best(); startB.hidden = false; startB.textContent = '\u21BB Play again'; } });
    const wrap = h('div', { class: 'rs-cvwrap' }, game.el);
    const key = e => { if (e.key === 'ArrowRight') game.look(1); else if (e.key === 'ArrowLeft') game.look(-1); else if (e.key === 'ArrowUp' || e.key === ' ') { e.preventDefault(); game.cross(); } };
    document.addEventListener('keydown', key); stopper = () => { game.stop(); document.removeEventListener('keydown', key); };
    main.replaceChildren(h('div', { class: 'rs-game' }, h('div', { class: 'rs-row rs-gtop' }, h('b', null, '\u{1F993} Safe crossing'), bestEl, startB), info, wrap,
      h('div', { class: 'rs-ctl' }, h('button', { type: 'button', class: 'rs-big', 'data-a': 'left', onclick: () => game.look(-1) }, '\u{1F448} Look left'),
        h('button', { type: 'button', class: 'rs-big rs-crossb', 'data-a': 'cross', onclick: () => game.cross() }, '\u{1F6B6} Cross'),
        h('button', { type: 'button', class: 'rs-big', 'data-a': 'right', onclick: () => game.look(1) }, 'Look right \u{1F449}'))));
    R.game = game; requestAnimationFrame(game.fit);
  }

  // ---------- rules ----------
  function rules() {
    main.replaceChildren(h('div', { class: 'rs-page' }, ...intro('\u{1F4CB} Road rules', 'Simple rules that keep you safe every day.'),
      h('div', { class: 'rs-rules' }, R.rules.map(([ic, t, s]) => h('div', { class: 'lrn-card rs-rule' }, h('span', { class: 'rs-ic', 'aria-hidden': 'true' }, ic), h('div', null, h('b', null, t), h('p', null, s)))))));
  }

  // ---------- quiz ----------
  const LV = [{ id: 'signs', name: 'Road signs', info: 'See a sign, pick what it means.' }, { id: 'situations', name: 'What do you do?', info: 'Real road situations.' }, { id: 'mixed', name: 'Mixed', info: 'Signs and situations together.' }];
  let Q = null;
  function quizMenu() {
    main.replaceChildren(h('div', { class: 'rs-page' }, ...intro('\u2753 Road safety quiz', N + ' questions. Pick a quiz.'),
      h('div', { class: 'rs-levels' }, LV.map(lv => { const b = prog.best('quiz-' + lv.id);
        return h('button', { type: 'button', class: 'lrn-card rs-lv', 'data-lv': lv.id, onclick: () => start(lv) }, h('b', null, lv.name), h('span', { class: 'lrn-sub' }, lv.info), h('span', { class: 'rs-best' }, b ? 'Best ' + b.score + ' / ' + b.of : 'Not played yet')); }))));
  }
  function makeQ(kind) {
    if (kind === 'sign') { const s = R.signs[Math.floor(Math.random() * R.signs.length)], same = shuffle(R.signs.filter(x => x !== s && x.g === s.g)), other = shuffle(R.signs.filter(x => x.g !== s.g));
      return { sign: s, q: 'What does this sign mean?', a: s.name, w: same.slice(0, 2).concat(other.slice(0, 1)).map(x => x.name), why: s.meaning }; }
    return R.situations[Math.floor(Math.random() * R.situations.length)];
  }
  function start(lv) {
    const list = [], used = new Set();
    while (list.length < N) { const k = lv.id === 'signs' ? 'sign' : lv.id === 'situations' ? 'sit' : (list.length % 2 ? 'sit' : 'sign'), q = makeQ(k), id = q.sign ? q.sign.id : q.q; if (!used.has(id)) { used.add(id); list.push(q); } }
    Q = { lv, list, i: 0, score: 0 }; ask();
  }
  function ask() {
    const q = Q.list[Q.i], fb = h('p', { class: 'rs-fb', 'aria-live': 'polite' }); let done = false;
    const next = h('button', { type: 'button', class: 'lrn-qc rs-go', hidden: true, onclick: () => { Q.i++; Q.i < N ? ask() : results(); } }, 'Next \u203A');
    const btns = shuffle([q.a].concat(q.w)).map(t => h('button', { type: 'button', class: 'rs-opt', onclick: e => {
      if (done) return; done = true; const ok = t === q.a; if (ok) Q.score++;
      btns.forEach(b => { if (b.textContent === q.a) b.classList.add('ok'); }); if (!ok) e.currentTarget.classList.add('bad');
      fb.className = 'rs-fb ' + (ok ? 'ok' : 'bad'); fb.textContent = (ok ? '\u2714 Right! ' : '\u2716 The answer is: ' + q.a + '. ') + q.why; next.hidden = false; next.focus(); } }, t));
    main.replaceChildren(h('div', { class: 'rs-page rs-quiz' }, h('p', { class: 'lrn-sub' }, Q.lv.name + ' \u00B7 Question ' + (Q.i + 1) + ' of ' + N + ' \u00B7 Score ' + Q.score),
      q.sign ? svg(q.sign, 'rs-sign rs-qsign') : null, h('h2', { class: 'lrn-h' }, q.q), h('div', { class: 'rs-opts' }, btns), fb, next));
  }
  function results() {
    const id = 'quiz-' + Q.lv.id, best = prog.saveScore(id, Q.score, N), b = prog.best(id);
    main.replaceChildren(h('div', { class: 'rs-page' }, h('h2', { class: 'lrn-h' }, Q.score >= 8 ? '\u{1F389} Road safety star!' : '\u{1F6A6} Keep learning!'),
      h('p', { class: 'rs-score' }, Q.score + ' / ' + N), h('p', { class: 'lrn-sub' }, best ? 'New best score!' : 'Best: ' + b.score + ' / ' + b.of),
      h('div', { class: 'rs-row' }, h('button', { type: 'button', class: 'lrn-qc rs-go', onclick: () => start(Q.lv) }, 'Again'), h('button', { type: 'button', class: 'lrn-qc', onclick: quizMenu }, 'Quizzes'))));
  }
  go(MODES[location.hash.slice(1)] ? location.hash.slice(1) : 'signs');
})();
