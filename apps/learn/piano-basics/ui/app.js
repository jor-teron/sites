/* Piano Basics PB1 — screens: Play (free piano, octave shift), Songs (play-along: the next key lights and waits; Listen first demo)
   and Quiz (10 questions: a key lights or a note plays, pick its name). The piano stays at the bottom of every screen.
   Saves in localStorage: learn.piano-basics.labels (letters by default; sargam is optional), .sa (movable Sa key 0-11), .songs (finished songs) and .best (quiz, via the Learn kit). */
(() => {
  const P = window.PB, A = P.audio, VER = 'PB1', PRE = 'learn.piano-basics.', N = 10;
  const prog = LRN.progress(PRE), store = LRN.store;
  const root = document.getElementById('app');
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : String(c)));
    return el;
  };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const STYLES = ['letters', 'sargam', 'off'], STYLE_NAME = { letters: 'Names: C D E', sargam: 'Names: Sa Re Ga', off: 'Names: off' };
  let style = store.read(PRE + 'labels', 'letters'); if (STYLES.indexOf(style) < 0) style = 'letters';
  P.sa = +store.read(PRE + 'sa', 0) || 0; if (P.sa < 0 || P.sa > 11) P.sa = 0;
  const saPick = h('select', { class: 'pb-sa', 'aria-label': 'Sa is on key', onchange: e => { P.sa = +e.target.value; store.write(PRE + 'sa', P.sa); relabel(); } },
    P.letters.map((l, k) => h('option', { value: k, selected: k === P.sa }, l)));
  const saBox = h('label', { class: 'pb-sabox' }, 'Sa = ', saPick);
  const saHint = h('p', { class: 'pb-hint' }, 'Real pianos don\u2019t print sargam; Sa is movable. Pick the key that is Sa for your song or voice.');
  const relabel = () => { saBox.hidden = saHint.hidden = style !== 'sargam'; if (mode !== 'quiz') piano.labels(style); if (mode === 'songs' && songView) songView(); };
  let mode = 'play', onNote = null, timers = [], lo = null, oct = 2;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const stopTimers = () => { timers.forEach(clearTimeout); timers = []; piano.clear('pb-demo'); };

  const piano = P.makePiano({ onDown: m => { A.on(m); if (onNote) onNote(m); }, onUp: m => A.off(m) });
  const modes = { play: 'Play', songs: 'Songs', quiz: 'Quiz' };
  const modeBar = h('div', { class: 'lrn-mode pb-modes', role: 'group', 'aria-label': 'Mode' },
    Object.keys(modes).map(m => h('button', { type: 'button', 'data-m': m, onclick: () => go(m) }, modes[m])));
  const nameBtn = h('button', { type: 'button', class: 'lrn-qc pb-names', onclick: () => {
    style = STYLES[(STYLES.indexOf(style) + 1) % 3]; store.write(PRE + 'labels', style); nameBtn.textContent = STYLE_NAME[style];
    relabel();
  } }, STYLE_NAME[style]);
  const nameTools = () => [nameBtn, saBox];
  const head = h('header', { class: 'lrn-head' }, h('h1', null, h('span', { class: 'lrn-here' }, 'Piano Basics')), modeBar, h('span', { class: 'pb-ver' }, VER));
  const top = h('div', { class: 'pb-top' });
  const bar = h('div', { class: 'pb-bar' });
  const rot = h('p', { class: 'pb-rot' }, '\u{1F4F1}\u21BB Turn your phone sideways for bigger keys.');
  const main = h('main', { class: 'lrn-main pb-main', id: 'lrn-main' }, top, saHint, rot, bar, piano.el);
  root.className = 'lrn pb'; root.replaceChildren(head, main);

  function range(fixed) {                                   // fixed = songs / quiz: middle C must be on screen
    oct = innerWidth >= 900 ? 3 : 2;
    if (fixed || lo == null) lo = oct === 3 ? 48 : 60;
    lo = Math.max(24, Math.min(lo, 96 - oct * 12));
    piano.build(lo, oct); piano.labels(mode === 'quiz' ? 'off' : style);
  }
  let lastOct = 0;
  addEventListener('resize', () => { const o = innerWidth >= 900 ? 3 : 2; if (o !== lastOct) { lastOct = o; range(mode !== 'play'); if (redo) redo(); } });
  let redo = null, songView = null;

  function go(m) {
    stopTimers(); mode = m; onNote = null; redo = null; songView = null;
    modeBar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    document.title = 'Piano Basics ' + VER + (m === 'play' ? '' : ' \u2013 ' + modes[m]);
    range(m !== 'play'); lastOct = oct;
    if (m === 'play') playMode(); else if (m === 'songs') songList(); else quizHome();
  }

  // ---------- play ----------
  function playMode() {
    const shift = d => { lo += d * 12; range(false); info.textContent = 'C' + P.octave(lo) + ' to C' + P.octave(lo + oct * 12); };
    const info = h('span', { class: 'lrn-sub' });
    top.replaceChildren(h('h2', { class: 'lrn-h' }, '\u{1F3B9} Free play'),
      h('p', null, 'Tap the keys, or use your computer keyboard: ', h('kbd', null, 'A S D F G H J K'), ' are the white keys from middle C, ', h('kbd', null, 'W E T Y U'), ' the black keys.'),
      h('p', { class: 'lrn-sub' }, 'Middle C has a dot. Every white key just left of the two black keys is a C.'));
    bar.replaceChildren(h('button', { type: 'button', class: 'lrn-qc', 'aria-label': 'Lower octave', onclick: () => shift(-1) }, '\u2039 Lower'), info,
      h('button', { type: 'button', class: 'lrn-qc', 'aria-label': 'Higher octave', onclick: () => shift(1) }, 'Higher \u203A'), ...nameTools());
    shift(0);
  }

  // ---------- songs ----------
  function songList() {
    const done = store.read(PRE + 'songs', {});
    bar.replaceChildren(...nameTools());
    top.replaceChildren(h('h2', { class: 'lrn-h' }, '\u{1F3B5} Play along'), h('p', { class: 'lrn-sub' }, 'Pick a tune. The next key lights up and waits for you.'),
      h('div', { class: 'lrn-grid pb-songs' }, P.songs.map(s => h('button', { type: 'button', class: 'lrn-card pb-song', 'data-song': s.id, onclick: () => song(s) },
        h('span', { class: 'lrn-icon' }, s.icon), h('b', null, s.name), h('span', { class: 'lrn-sub' }, P.songNotes(s).length + ' notes'),
        done[s.id] ? h('span', { class: 'lrn-tags' }, h('i', null, '\u2714 played')) : null))));
  }
  function song(s) {
    const notes = P.songNotes(s), beat = 60 / s.bpm;
    let i = 0;
    const strip = h('div', { class: 'pb-strip', 'aria-live': 'polite' }), msg = h('p', { class: 'pb-msg' });
    const show = () => {
      piano.clear(); if (i < notes.length) piano.light(notes[i].m);
      strip.replaceChildren(...notes.map((n, k) => h('span', { class: 'pb-n' + (k < i ? ' ok' : k === i ? ' cur' : '') }, P.name(n.m, style === 'off' ? 'letters' : style))));
      const cur = strip.children[i]; if (cur) strip.scrollLeft = cur.offsetLeft - strip.offsetLeft - strip.clientWidth / 2;   // sideways only
      msg.textContent = i < notes.length ? 'Note ' + (i + 1) + ' of ' + notes.length + (P.midiToKey(notes[i].m) ? '  \u00B7  key ' + P.midiToKey(notes[i].m) : '') : '\u{1F389} Well done! You played ' + s.name + '.';
    };
    songView = show; redo = show;
    onNote = m => {
      if (i >= notes.length) return;
      stopTimers();
      if (m === notes[i].m) { i++; show(); if (i === notes.length) { const d = store.read(PRE + 'songs', {}); d[s.id] = 1; store.write(PRE + 'songs', d); } }
      else { piano.light(m, 'pb-wrong'); later(() => piano.clear('pb-wrong'), 300); }
    };
    const listen = () => {
      stopTimers(); A.unlock(); let t = 0;
      notes.forEach(n => {
        later(() => { piano.clear('pb-demo'); piano.light(n.m, 'pb-demo'); A.on(n.m, n.beats * beat * 0.9); }, t * 1000);
        t += n.beats * beat;
      });
      later(() => piano.clear('pb-demo'), t * 1000);
    };
    top.replaceChildren(h('h2', { class: 'lrn-h' }, h('button', { type: 'button', class: 'lrn-crumb', onclick: () => go('songs') }, '\u2039 Songs'), s.icon + ' ' + s.name), strip, msg);
    bar.replaceChildren(h('button', { type: 'button', class: 'lrn-qc pb-listen', onclick: listen }, '\u{1F50A} Listen first'),
      h('button', { type: 'button', class: 'lrn-qc', onclick: () => { stopTimers(); i = 0; show(); } }, '\u21BA Restart'), ...nameTools());
    show();
  }

  // ---------- quiz ----------
  let Q = null;
  function quizHome() {
    const b = prog.best('quiz');
    bar.replaceChildren();
    top.replaceChildren(h('div', { class: 'pb-qhome' }, h('h2', { class: 'lrn-h' }, '\u2753 Name the note'),
      h('p', null, N + ' questions. A key lights up, or you hear a note after middle C (or after Sa). Pick its name.'),
      h('p', { class: 'lrn-sub' }, b ? 'Best: ' + b.score + ' / ' + b.of : 'No best score yet.'),
      h('button', { type: 'button', class: 'lrn-qc pb-go', onclick: () => { A.unlock(); Q = { i: 0, score: 0, qs: makeQuiz() }; ask(); } }, 'Start quiz')));
  }
  function makeQuiz() {
    const pool = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79];
    return shuffle(pool.concat(pool)).slice(0, N).map((m, k) => ({ m, hear: k % 3 === 2 }));
  }
  const qStyle = () => style === 'sargam' ? 'sargam' : 'letters';
  function ask() {
    const q = Q.qs[Q.i], right = P.name(q.m, qStyle());
    const names = [60, 62, 64, 65, 67, 69, 71].map(m => P.name(m, qStyle())).filter((n, k, a) => a.indexOf(n) === k);
    const opts = shuffle([right].concat(shuffle(names.filter(n => n !== right)).slice(0, 3)));
    let locked = false;
    const fb = h('p', { class: 'pb-fb', 'aria-live': 'polite' });
    const next = h('button', { type: 'button', class: 'lrn-qc pb-go', hidden: true, onclick: () => { Q.i++; Q.i < N ? ask() : results(); } }, 'Next \u203A');
    const ref = qStyle() === 'sargam' ? 60 + P.sa : 60, refName = qStyle() === 'sargam' ? 'Sa (' + P.letter(ref) + ')' : 'Middle C';
    const hear = () => { stopTimers(); A.on(ref, 0.6); later(() => A.on(q.m, 0.9), 750); };
    const btns = opts.map(o => h('button', { type: 'button', class: 'pb-opt', onclick: e => {
      if (locked) return; locked = true; const ok = o === right; if (ok) Q.score++;
      btns.forEach(b => { if (b.textContent === right) b.classList.add('ok'); }); if (!ok) e.currentTarget.classList.add('bad');
      piano.clear('pb-q'); piano.light(q.m, 'pb-q'); A.on(q.m, 0.8);
      fb.textContent = (ok ? '\u2714 Right! ' : '\u2716 Not quite. ') + 'It is ' + right + '.'; fb.className = 'pb-fb ' + (ok ? 'ok' : 'bad');
      next.hidden = false; next.focus();
    } }, o));
    piano.clear('pb-q'); if (!q.hear) piano.light(q.m, 'pb-q');
    top.replaceChildren(h('div', { class: 'pb-qhome' }, h('p', { class: 'lrn-sub' }, 'Question ' + (Q.i + 1) + ' of ' + N + ' \u00B7 Score ' + Q.score),
      h('h2', { class: 'lrn-h' }, q.hear ? refName + ', then a mystery note. Which is it?' : 'What is the lit key?'),
      q.hear ? h('button', { type: 'button', class: 'lrn-qc', onclick: hear }, '\u{1F50A} Play again') : null,
      h('div', { class: 'pb-opts' }, btns), fb, next));
    if (q.hear) hear();
  }
  function results() {
    piano.clear('pb-q');
    const best = prog.saveScore('quiz', Q.score, N), b = prog.best('quiz');
    store.write(PRE + 'last', { score: Q.score, of: N, at: Date.now() });
    top.replaceChildren(h('div', { class: 'pb-qhome' }, h('h2', { class: 'lrn-h' }, Q.score >= 8 ? '\u{1F389} Great ear!' : '\u{1F3B9} Keep practising!'),
      h('p', { class: 'pb-big' }, Q.score + ' / ' + N), h('p', { class: 'lrn-sub' }, best ? 'New best score!' : 'Best: ' + b.score + ' / ' + b.of),
      h('button', { type: 'button', class: 'lrn-qc pb-go', onclick: () => { Q = { i: 0, score: 0, qs: makeQuiz() }; ask(); } }, 'Play again')));
  }

  // computer keyboard
  const held = {};
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.key === 'Escape' && mode !== 'play') { go(mode); return; }
    const m = P.keyToMidi(e.code); if (m == null || held[e.code]) return;
    held[e.code] = m; e.preventDefault(); piano.press(m);
  });
  addEventListener('keyup', e => { if (held[e.code] != null) { piano.release(held[e.code]); delete held[e.code]; } });
  addEventListener('blur', () => { for (const c in held) { piano.release(held[c]); delete held[c]; } });

  relabel();
  go(location.hash === '#songs' ? 'songs' : location.hash === '#quiz' ? 'quiz' : 'play');
})();
