/* Guitar Chords GC1 — screens: Chords (library: pick a chord, see finger dots, strum it), Practice (two chords take turns
   to a metronome, to train fast changes) and Quiz (10 questions: a chord shape is shown and strummed, pick its name).
   The neck stays on every screen; tap any fret or strum any time. Space = strum.
   Saves in localStorage: learn.guitar-chords.lefty, .chord (last chord), .practice ({a, b, bpm, beats, auto}) and .best (quiz, via the Learn kit). */
(() => {
  const G = window.GC, A = G.audio, VER = 'GC1', PRE = 'learn.guitar-chords.', N = 10;
  const prog = LRN.progress(PRE), store = LRN.store;
  const root = document.getElementById('app');
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : String(c)));
    return el;
  };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  let mode = 'chords', cur = G.byId[store.read(PRE + 'chord', 'em')] || G.byId.em, timer = null, lefty = !!store.read(PRE + 'lefty', false);
  const board = G.makeBoard({ onPlay: (s, f) => A.pluck(s, G.note(s, f)) });
  board.lefty(lefty);
  const strum = (up) => { A.unlock(); const c = shown(); if (!c) return; G.strum(c, up).forEach((s, i) => setTimeout(() => board.mark(s, 'z'), i * 30)); };
  let shown = () => cur;
  const modes = { chords: 'Chords', practice: 'Practice', quiz: 'Quiz' };
  const modeBar = h('div', { class: 'lrn-mode gc-modes', role: 'group', 'aria-label': 'Mode' },
    Object.keys(modes).map(m => h('button', { type: 'button', 'data-m': m, onclick: () => go(m) }, modes[m])));
  const leftBtn = h('button', { type: 'button', class: 'lrn-qc gc-left', 'aria-pressed': String(lefty), title: 'Left-handed: mirror the neck',
    onclick: () => { lefty = !lefty; store.write(PRE + 'lefty', lefty); leftBtn.setAttribute('aria-pressed', String(lefty)); board.lefty(lefty); } }, '\u{1F91A} Left-handed');
  const head = h('header', { class: 'lrn-head' }, h('h1', null, h('span', { class: 'lrn-here' }, 'Guitar Chords')), modeBar, h('span', { class: 'gc-ver' }, VER));
  const top = h('div', { class: 'gc-top' }), bar = h('div', { class: 'gc-bar' });
  const rot = h('p', { class: 'gc-rot' }, '\u{1F4F1}\u21BB Landscape recommended: turn your phone sideways for a bigger neck.');
  const main = h('main', { class: 'lrn-main gc-main', id: 'lrn-main' }, top, rot, board.el, bar);
  root.className = 'lrn gc'; root.replaceChildren(head, main);
  const strumBtns = () => [h('button', { type: 'button', class: 'lrn-qc gc-strum', onclick: () => strum(false) }, 'Strum \u2193'),
    h('button', { type: 'button', class: 'lrn-qc', onclick: () => strum(true) }, 'Strum \u2191')];

  function go(m) {
    clearInterval(timer); timer = null; mode = m; shown = () => cur;
    modeBar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    document.title = 'Guitar Chords ' + VER + (m === 'chords' ? '' : ' \u2013 ' + modes[m]);
    if (m === 'chords') library(); else if (m === 'practice') practice(); else quizHome();
  }

  // ---------- chord library ----------
  function library() {
    const info = h('div', { class: 'gc-info', 'aria-live': 'polite' });
    const pick = c => {
      cur = c; store.write(PRE + 'chord', c.id); board.show(c);
      chips.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === c.id)));
      const lf = G.lowFret(c);
      info.replaceChildren(h('b', { class: 'gc-name' }, c.name), h('span', null, c.full),
        h('span', { class: 'lrn-sub' }, 'Strings E A D G B e: ' + G.shapeText(c) + ' \u00B7 ' + (c.barre ? 'barre at fret ' + c.barre.fret : 'starts at fret ' + lf)),
        c.tip ? h('span', { class: 'gc-tip' }, c.tip) : null);
    };
    const chips = h('div', { class: 'gc-chips' }, G.groups.map(g => h('div', { class: 'gc-grp' }, h('span', { class: 'gc-gn' }, g.name),
      G.chords.filter(c => c.grp === g.id).map(c => h('button', { type: 'button', class: 'gc-chip', 'data-id': c.id, title: c.full, onclick: () => { pick(c); strum(false); } }, c.name)))));
    top.replaceChildren(info, chips,
      h('p', { class: 'lrn-sub gc-help' }, 'Numbers = fingers (1 index, 2 middle, 3 ring, 4 little). O = play open, \u2715 = don\u2019t play. Tap a fret for one note, swipe the strum zone for the chord.'));
    bar.replaceChildren(...strumBtns(), leftBtn);
    pick(cur);
  }

  // ---------- practice: two chords, metronome ----------
  function practice() {
    const p = Object.assign({ a: 'c', b: 'g', bpm: 60, beats: 4, auto: true }, store.read(PRE + 'practice', {}));
    const save = () => store.write(PRE + 'practice', p);
    const sel = k => h('select', { class: 'gc-sel', 'aria-label': k === 'a' ? 'First chord' : 'Second chord', onchange: e => { p[k] = e.target.value; save(); reset(); } },
      G.chords.map(c => h('option', { value: c.id, selected: c.id === p[k] }, c.full)));
    const bpmOut = h('output', null, p.bpm + ' bpm');
    const bpm = h('input', { type: 'range', min: 40, max: 140, step: 5, value: p.bpm, 'aria-label': 'Tempo', oninput: e => { p.bpm = +e.target.value; bpmOut.textContent = p.bpm + ' bpm'; save(); if (timer) start(); } });
    const beats = h('select', { class: 'gc-sel', 'aria-label': 'Beats per chord', onchange: e => { p.beats = +e.target.value; save(); reset(); } },
      [2, 4, 8].map(n => h('option', { value: n, selected: n === p.beats }, n + ' beats each')));
    const auto = h('input', { type: 'checkbox', checked: p.auto, onchange: e => { p.auto = e.target.checked; save(); } });
    const now = h('b', { class: 'gc-name' }), next = h('span', { class: 'lrn-sub' }), dots = h('div', { class: 'gc-beats', 'aria-hidden': 'true' }), count = h('span', { class: 'lrn-sub' });
    let beat = -1, side = 0, changes = 0;
    const chordNow = () => G.byId[side ? p.b : p.a];
    shown = chordNow;
    const view = () => {
      board.show(chordNow()); now.textContent = chordNow().name;
      next.textContent = 'Next: ' + G.byId[side ? p.a : p.b].name;
      dots.replaceChildren(...Array.from({ length: p.beats }, (_, i) => h('i', { class: i === beat ? 'on' : '' })));
      count.textContent = changes + ' changes';
    };
    const tick = () => {
      beat++; if (beat >= p.beats) { beat = 0; side = 1 - side; changes++; }
      A.click(beat === 0); if (beat === 0 && p.auto) strum(false);
      view();
    };
    const start = () => { clearInterval(timer); A.unlock(); timer = setInterval(tick, 60000 / p.bpm); go1.textContent = '\u23F8 Stop'; };
    const stop = () => { clearInterval(timer); timer = null; go1.textContent = '\u25B6 Start'; };
    const reset = () => { beat = -1; side = 0; changes = 0; view(); };
    const go1 = h('button', { type: 'button', class: 'lrn-qc gc-go', onclick: () => { if (timer) stop(); else { reset(); start(); tick(); } } }, '\u25B6 Start');
    top.replaceChildren(h('div', { class: 'gc-prac' },
      h('div', { class: 'gc-row' }, sel('a'), h('span', null, '\u21C4'), sel('b'), beats),
      h('div', { class: 'gc-row' }, h('label', { class: 'gc-lab' }, 'Tempo ', bpm, bpmOut), h('label', { class: 'gc-lab' }, auto, ' auto strum')),
      h('div', { class: 'gc-row gc-now' }, now, dots, next, count)));
    bar.replaceChildren(go1, ...strumBtns(), leftBtn);
    reset();
  }

  // ---------- quiz ----------
  let Q = null;
  const pool = G.chords.filter((c, i, a) => a.findIndex(o => o.name === c.name) === i);   // one F only
  function quizHome() {
    const b = prog.best('quiz');
    board.show(cur); bar.replaceChildren(...strumBtns(), leftBtn);
    top.replaceChildren(h('div', { class: 'gc-qhome' }, h('h2', { class: 'lrn-h' }, '\u2753 Name the chord'),
      h('p', null, N + ' questions. A chord shape is shown and strummed. Pick its name.'),
      h('p', { class: 'lrn-sub' }, b ? 'Best: ' + b.score + ' / ' + b.of : 'No best score yet.'),
      h('button', { type: 'button', class: 'lrn-qc gc-go', onclick: () => { Q = { i: 0, score: 0, qs: shuffle(pool).slice(0, N) }; ask(); } }, 'Start quiz')));
  }
  function ask() {
    const c = Q.qs[Q.i]; shown = () => c; board.show(c);
    const opts = shuffle([c].concat(shuffle(pool.filter(o => o !== c)).slice(0, 3)));
    let locked = false;
    const fb = h('p', { class: 'gc-fb', 'aria-live': 'polite' });
    const next = h('button', { type: 'button', class: 'lrn-qc gc-go', hidden: true, onclick: () => { Q.i++; Q.i < N ? ask() : results(); } }, 'Next \u203A');
    const btns = opts.map(o => h('button', { type: 'button', class: 'gc-opt', 'data-id': o.id, onclick: e => {
      if (locked) return; locked = true; const ok = o === c; if (ok) Q.score++;
      btns.forEach(b => { if (b.dataset.id === c.id) b.classList.add('ok'); }); if (!ok) e.currentTarget.classList.add('bad');
      fb.textContent = (ok ? '\u2714 Right! ' : '\u2716 Not quite. ') + 'It is ' + c.full + '.'; fb.className = 'gc-fb ' + (ok ? 'ok' : 'bad');
      next.hidden = false; next.focus();
    } }, o.name));
    top.replaceChildren(h('div', { class: 'gc-qhome' }, h('p', { class: 'lrn-sub' }, 'Question ' + (Q.i + 1) + ' of ' + N + ' \u00B7 Score ' + Q.score),
      h('h2', { class: 'lrn-h' }, 'Which chord is this?'), h('div', { class: 'gc-opts' }, btns), fb, next));
    strum(false);
  }
  function results() {
    shown = () => cur; board.show(cur);
    const best = prog.saveScore('quiz', Q.score, N), b = prog.best('quiz');
    store.write(PRE + 'last', { score: Q.score, of: N, at: Date.now() });
    top.replaceChildren(h('div', { class: 'gc-qhome' }, h('h2', { class: 'lrn-h' }, Q.score >= 8 ? '\u{1F389} Great job!' : '\u{1F3B8} Keep practising!'),
      h('p', { class: 'gc-big' }, Q.score + ' / ' + N), h('p', { class: 'lrn-sub' }, best ? 'New best score!' : 'Best: ' + b.score + ' / ' + b.of),
      h('button', { type: 'button', class: 'lrn-qc gc-go', onclick: () => { Q = { i: 0, score: 0, qs: shuffle(pool).slice(0, N) }; ask(); } }, 'Play again')));
  }

  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.code === 'Space' && !/^(BUTTON|SELECT|INPUT)$/.test(e.target.tagName)) { e.preventDefault(); strum(e.shiftKey); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && timer && mode === 'practice') go('practice'); });   // stop the metronome when hidden
  go(location.hash === '#practice' ? 'practice' : location.hash === '#quiz' ? 'quiz' : 'chords');
})();
