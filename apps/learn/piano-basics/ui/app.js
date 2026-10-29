/* Piano Basics PB2 — screens: Play (free piano, octave shift, record + play back), Songs (play-along, two ways: "Step by step" =
   the next key lights and waits; "Falling notes" = bars fall onto the keys, slow/normal, optional "Wait for me"; some songs have
   an optional left-hand part) and Quiz (10 questions: a key lights or a note plays, pick its name). Piano at the bottom of every screen.
   Saves in localStorage: learn.piano-basics.labels (letters by default; sargam optional), .sa (movable Sa key 0-11), .sound,
   .songs (finished songs), .fall (best falling-notes score per song), .fallopt (song options) and .best (quiz, via the Learn kit).
   Recordings stay in memory only. */
(() => {
  const P = window.PB, A = P.audio, R = P.rec, VER = 'PB2', PRE = 'learn.piano-basics.', N = 10;
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
  let mode = 'play', onNote = null, timers = [], lo = null, oct = 2, songFit = null;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const stopTimers = () => { timers.forEach(clearTimeout); timers = []; piano.clear('pb-demo'); };

  const piano = P.makePiano({ onDown: m => { A.on(m); R.down(m); if (onNote) onNote(m); }, onUp: m => { A.off(m); R.up(m); } });
  const fall = P.makeFall(h('canvas', { class: 'pb-fall', 'aria-label': 'Falling notes: press each key when its bar reaches the yellow line' }), piano);
  P._fall = fall;                                               // for tests
  const modes = { play: 'Play', songs: 'Songs', quiz: 'Quiz' };
  const modeBar = h('div', { class: 'lrn-mode pb-modes', role: 'group', 'aria-label': 'Mode' },
    Object.keys(modes).map(m => h('button', { type: 'button', 'data-m': m, onclick: () => go(m) }, modes[m])));
  const nameBtn = h('button', { type: 'button', class: 'lrn-qc pb-names', onclick: () => {
    style = STYLES[(STYLES.indexOf(style) + 1) % 3]; store.write(PRE + 'labels', style); nameBtn.textContent = STYLE_NAME[style];
    relabel();
  } }, STYLE_NAME[style]);
  A.sound = store.read(PRE + 'sound', 'piano'); if (!A.sounds[A.sound]) A.sound = 'piano';
  const soundPick = h('select', { class: 'pb-sa pb-sound', 'aria-label': 'Sound', onchange: e => { A.sound = e.target.value; store.write(PRE + 'sound', A.sound); A.on(60 + P.sa, 0.5); } },
    Object.keys(A.sounds).map(k => h('option', { value: k, selected: k === A.sound }, A.sounds[k])));
  const nameTools = () => [nameBtn, saBox, soundPick];

  // plain-words help (the owner asked for beginner-friendly help)
  const HELP = [
    ['\u{1F3B9} The keys', 'Each key makes one note. Keys further right sound higher. The red dot is middle C: a good home for your right thumb.'],
    ['\u{1F524} Note names', 'The \u201CNames\u201D button shows letters (C D E F G A B), Indian sargam (Sa Re Ga Ma Pa Dha Ni) or nothing. With sargam, \u201CSa =\u201D picks which key is Sa.'],
    ['\u{1F3B5} Songs: step by step', 'The key to press next turns blue. Take your time: the song waits for you. \u201CListen first\u201D plays the tune so you know how it goes.'],
    ['\u2B07 Songs: falling notes', 'Coloured bars fall down. Press the key under a bar when it touches the yellow line. Start with \u201CSlow\u201D and \u201CWait for me\u201D: the song stops until you press the key.'],
    ['\u270B Two hands', 'Some songs have an easy part for your left hand: one low key now and then. Left-hand keys turn green and their bars say L. Your right hand plays the tune.'],
    ['\u23FA Record', 'In Play, tap Record, play anything, tap Stop, then Play back to hear yourself. Nothing is saved: it is gone when you leave the page.'],
    ['\u{1F50A} Sound', 'Pick piano, soft organ, bell or harmonium. No sound? Turn the volume up and make sure the phone is not on silent.']
  ];
  const help = h('div', { class: 'pb-help', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Help', hidden: true, onclick: e => { if (e.target === help) help.hidden = true; } },
    h('div', { class: 'pb-helpbox' }, h('h2', { class: 'lrn-h' }, 'How to use Piano Basics'),
      HELP.map(([t, d]) => h('p', null, h('b', null, t), h('br'), d)),
      h('button', { type: 'button', class: 'lrn-qc pb-go', onclick: () => { help.hidden = true; } }, 'Got it')));
  const helpBtn = h('button', { type: 'button', class: 'lrn-qc pb-helpbtn', 'aria-label': 'Help', onclick: () => { help.hidden = false; } }, '? Help');
  const head = h('header', { class: 'lrn-head' }, h('h1', null, h('span', { class: 'lrn-here' }, 'Piano Basics')), modeBar, helpBtn, h('span', { class: 'pb-ver' }, VER));
  const top = h('div', { class: 'pb-top' });
  const bar = h('div', { class: 'pb-bar' });
  const rot = h('p', { class: 'pb-rot' }, '\u{1F4F1}\u21BB Turn your phone sideways for bigger keys.');
  const main = h('main', { class: 'lrn-main pb-main', id: 'lrn-main' }, top, saHint, rot, bar, piano.el);
  root.className = 'lrn pb'; root.replaceChildren(head, main, help);
  if (window.LearnHubBar) LearnHubBar.attach(root.querySelector('.lrn-head'), { buttons: '.pb-helpbtn' });   // TB2: Hub desktop window: mode tabs + Help button
  const setRun = on => root.classList.toggle('pb-run', on);   // falling notes running: hide everything but score, bars and keys

  function range(fixed) {                                   // fixed = songs / quiz: middle C (or the whole song) must be on screen
    oct = innerWidth >= 900 ? 3 : 2;
    if (fixed || lo == null) lo = songFit ? songFit(oct) : oct === 3 ? 48 : 60;
    lo = Math.max(24, Math.min(lo, 96 - oct * 12));
    piano.build(lo, oct); piano.labels(mode === 'quiz' ? 'off' : style);
  }
  let lastOct = 0;
  addEventListener('resize', () => { const o = innerWidth >= 900 ? 3 : 2; if (o !== lastOct) { lastOct = o; range(mode !== 'play'); if (redo) redo(); } });
  let redo = null, songView = null;

  function go(m) {
    stopTimers(); fall.stop(); setRun(false); R.end(); R.stop(); mode = m; onNote = null; redo = null; songView = null; songFit = null;
    modeBar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    document.title = 'Piano Basics ' + VER + (m === 'play' ? '' : ' \u2013 ' + modes[m]);
    top.className = 'pb-top';
    range(m !== 'play'); lastOct = oct;
    if (m === 'play') playMode(); else if (m === 'songs') songList(); else quizHome();
  }

  // ---------- play (+ record / play back) ----------
  function playMode() {
    const shift = d => { lo += d * 12; range(false); info.textContent = 'C' + P.octave(lo) + ' to C' + P.octave(lo + oct * 12); };
    const info = h('span', { class: 'lrn-sub' });
    const recBtn = h('button', { type: 'button', class: 'lrn-qc pb-rec', onclick: () => { if (R.on) R.end(); else { A.unlock(); R.start(); } recUi(); } });
    const playBtn = h('button', { type: 'button', class: 'lrn-qc pb-playback', onclick: () => { if (R.playing) R.stop(); else R.play(); recUi(); } });
    const recInfo = h('span', { class: 'lrn-sub', 'aria-live': 'polite' });
    const recUi = () => {
      recBtn.textContent = R.on ? '\u25A0 Stop recording' : '\u23FA Record'; recBtn.classList.toggle('on', R.on);
      playBtn.textContent = R.playing ? '\u25A0 Stop' : '\u25B6 Play back'; playBtn.disabled = R.on || !R.notes.length;
      recInfo.textContent = R.on ? 'Recording\u2026 play some keys, then tap Stop.' : R.playing ? 'Playing back what you played\u2026'
        : R.notes.length ? 'Recorded ' + R.notes.length + ' notes (' + (R.length() / 1000).toFixed(1) + ' s).' : 'Record yourself, then listen back.';
    };
    R.onNote = (m, on) => on ? piano.light(m, 'pb-demo') : piano.unlight(m, 'pb-demo');
    R.onEnd = recUi;
    top.replaceChildren(h('h2', { class: 'lrn-h' }, '\u{1F3B9} Free play'),
      h('p', null, 'Tap the keys, or use your computer keyboard: ', h('kbd', null, 'A S D F G H J K'), ' are the white keys from middle C, ', h('kbd', null, 'W E T Y U'), ' the black keys.'),
      h('p', { class: 'lrn-sub' }, 'Middle C has a dot. Every white key just left of the two black keys is a C.'),
      h('div', { class: 'pb-opts2' }, recBtn, playBtn, recInfo));
    bar.replaceChildren(h('button', { type: 'button', class: 'lrn-qc', 'aria-label': 'Lower octave', onclick: () => shift(-1) }, '\u2039 Lower'), info,
      h('button', { type: 'button', class: 'lrn-qc', 'aria-label': 'Higher octave', onclick: () => shift(1) }, 'Higher \u203A'), ...nameTools());
    shift(0); recUi();
  }

  // ---------- songs ----------
  const opt = Object.assign({ view: 'step', speed: 0.6, wait: true, two: false }, store.read(PRE + 'fallopt', {}));
  function songList() {
    const done = store.read(PRE + 'songs', {}), best = store.read(PRE + 'fall', {});
    bar.replaceChildren(...nameTools());
    top.replaceChildren(h('h2', { class: 'lrn-h' }, '\u{1F3B5} Play along'), h('p', { class: 'lrn-sub' }, 'Pick a tune. The key to press lights up, or coloured bars fall onto it. Easiest first: try the sargam ones.'),
      h('div', { class: 'lrn-grid pb-songs' }, P.songs.map(s => h('button', { type: 'button', class: 'lrn-card pb-song', 'data-song': s.id, onclick: () => song(s) },
        h('span', { class: 'lrn-icon' }, s.icon), h('b', null, s.name), h('span', { class: 'lrn-sub' }, P.songNotes(s).length + ' notes'),
        h('span', { class: 'lrn-tags' }, (s.tags || []).indexOf('indian') >= 0 ? h('i', null, 'Indian') : null, s.left ? h('i', null, '\u270B two hands') : null,
          done[s.id] ? h('i', null, '\u2714 played') : null, best[s.id] ? h('i', null, '\u2B50 ' + best[s.id]) : null)))));
  }
  function song(s) {
    const nm = m => P.name(m, style === 'off' ? 'letters' : style), save = () => store.write(PRE + 'fallopt', opt);
    let evs, steps, i, got;
    const strip = h('div', { class: 'pb-strip', 'aria-live': 'polite' }), msg = h('p', { class: 'pb-msg', 'aria-live': 'polite' }), score = h('b', { class: 'pb-scoreval' });
    const two = () => !!(s.left && opt.two);
    const show = () => {
      piano.clear(); piano.clear('pb-nextl');
      const st = steps[i];
      if (st) st.notes.forEach(n => { if (!got[n.hand + n.m]) piano.light(n.m, n.hand === 'L' ? 'pb-nextl' : 'pb-next'); });
      strip.replaceChildren(...steps.map((x, k) => h('span', { class: 'pb-n' + (k < i ? ' ok' : k === i ? ' cur' : '') },
        x.notes.map(n => n.hand === 'L' ? h('small', { class: 'pb-l' }, nm(n.m)) : nm(n.m)))));
      const cur = strip.children[i]; if (cur) strip.scrollLeft = cur.offsetLeft - strip.offsetLeft - strip.clientWidth / 2;   // sideways only
      const r = st && st.notes.find(n => n.hand === 'R'), l = st && st.notes.find(n => n.hand === 'L'), key = r && P.midiToKey(r.m);
      msg.textContent = st ? 'Note ' + (i + 1) + ' of ' + steps.length + (key ? '  \u00B7  key ' + key : '') + (l ? '  \u00B7  left hand: ' + nm(l.m) : '')
        : '\u{1F389} Well done! You played ' + s.name + '.';
    };
    const listen = () => {
      fall.stop(); setRun(false); stopTimers(); A.unlock(); const sec = 60 / s.bpm;
      steps.forEach(st => later(() => { piano.clear('pb-demo'); st.notes.forEach(n => { piano.light(n.m, 'pb-demo'); A.on(n.m, n.beats * sec * 0.9); }); }, st.t * sec * 1000));
      const end = Math.max(...evs.map(e => e.t + e.beats)); later(() => piano.clear('pb-demo'), end * sec * 1000);
    };
    const stopBtn = h('button', { type: 'button', class: 'lrn-qc pb-stop', onclick: () => { fall.stop(); setRun(false); score.textContent = 'Stopped'; } }, '\u25A0 Stop');
    const startFall = () => {
      stopTimers(); A.unlock(); msg.textContent = ''; score.textContent = 'Score 0'; setRun(true);
      fall.onJudge = S => { score.textContent = 'Score ' + S.score + (S.streak > 2 ? '  \u00B7  ' + S.streak + ' in a row!' : ''); };
      fall.onEnd = S => {
        setRun(false);
        const b = store.read(PRE + 'fall', {}), isBest = S.score > (b[s.id] || 0); if (isBest) { b[s.id] = S.score; store.write(PRE + 'fall', b); }
        const d = store.read(PRE + 'songs', {}); d[s.id] = 1; store.write(PRE + 'songs', d);
        msg.textContent = '\u{1F389} Done! Perfect ' + S.perfect + ', Good ' + S.good + ', Missed ' + S.miss + '.' + (isBest ? ' New best!' : ' Best: ' + b[s.id]);
      };
      fall.start(evs, s.bpm, { speed: opt.speed, wait: opt.wait });
    };
    function build() {
      fall.stop(); setRun(false); stopTimers();
      evs = P.songEvents(s, two()); steps = P.songSteps(evs); i = 0; got = {};
      const ms = evs.map(e => e.m), a = Math.min(...ms), b = Math.max(...ms);
      songFit = o => { let l = 12 * Math.floor(a / 12); if (o === 3 && l > 48 && b <= 84) l = 48; return l; };
      range(true); lastOct = oct;
      const pick = (key, list, label) => h('div', { class: 'lrn-mode', role: 'group', 'aria-label': label }, list.map(([v, t]) =>
        h('button', { type: 'button', 'aria-pressed': String(opt[key] === v), onclick: () => { opt[key] = v; save(); build(); } }, t)));
      const chk = (key, label) => h('label', { class: 'pb-chk' }, h('input', { type: 'checkbox', checked: !!opt[key], onchange: e => { opt[key] = e.target.checked; save(); build(); } }), label);
      const isFall = opt.view === 'fall';
      const row = h('div', { class: 'pb-opts2' }, pick('view', [['step', 'Step by step'], ['fall', 'Falling notes']], 'How to play'),
        isFall ? pick('speed', [[0.6, 'Slow'], [1, 'Normal']], 'Speed') : null, isFall ? chk('wait', 'Wait for me') : null, s.left ? chk('two', 'Two hands') : null);
      const tip = h('p', { class: 'lrn-sub pb-tip' }, (isFall ? 'Bars fall down. Press the key when its bar touches the yellow line.' + (opt.wait ? ' The song waits for you.' : '')
        : 'The blue key is next. Press it \u2013 the song waits for you.') + (two() ? ' Green keys and L bars are for your left hand.' : ''));
      const title = h('h2', { class: 'lrn-h' }, h('button', { type: 'button', class: 'lrn-crumb', onclick: () => go('songs') }, '\u2039 Songs'), s.icon + ' ' + s.name);
      top.className = 'pb-top' + (isFall ? ' pb-fallon' : '');
      if (isFall) { score.textContent = 'Tap Start'; top.replaceChildren(title, row, tip, h('div', { class: 'pb-score' }, stopBtn, score, msg), fall.cv); }
      else top.replaceChildren(title, row, tip, strip, msg);
      bar.replaceChildren(...[isFall ? h('button', { type: 'button', class: 'lrn-qc pb-go pb-start', onclick: startFall }, '\u25B6 Start') : null,
        h('button', { type: 'button', class: 'lrn-qc pb-listen', onclick: listen }, '\u{1F50A} Listen first'),
        isFall ? null : h('button', { type: 'button', class: 'lrn-qc', onclick: () => { stopTimers(); i = 0; got = {}; show(); } }, '\u21BA Restart')].filter(Boolean), ...nameTools());
      onNote = isFall ? m => { stopTimers(); fall.hit(m); } : m => {
        const st = steps[i]; if (!st) return; stopTimers();
        const n = st.notes.find(x => x.m === m && !got[x.hand + x.m]);
        if (n) {
          got[n.hand + n.m] = 1;
          if (st.notes.every(x => got[x.hand + x.m])) { i++; got = {}; if (i === steps.length) { const d = store.read(PRE + 'songs', {}); d[s.id] = 1; store.write(PRE + 'songs', d); } }
          show();
        } else if (!st.notes.some(x => x.m === m)) { piano.light(m, 'pb-wrong'); later(() => piano.clear('pb-wrong'), 300); }
      };
      songView = redo = isFall ? null : show;
      if (!isFall) show();
    }
    build();
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
    if (e.key === 'Escape' && !help.hidden) { help.hidden = true; return; }
    if (e.key === 'Escape' && mode !== 'play') { go(mode); return; }
    const m = P.keyToMidi(e.code); if (m == null || held[e.code]) return;
    held[e.code] = m; e.preventDefault(); piano.press(m);
  });
  addEventListener('keyup', e => { if (held[e.code] != null) { piano.release(held[e.code]); delete held[e.code]; } });
  addEventListener('blur', () => { for (const c in held) { piano.release(held[c]); delete held[c]; } });

  relabel();
  go(location.hash === '#songs' ? 'songs' : location.hash === '#quiz' ? 'quiz' : 'play');
})();
