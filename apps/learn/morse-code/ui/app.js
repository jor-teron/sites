/* Morse Code MC1 — screens: Chart (tap a character to hear and see it; optional dot/dash tree), Translate (text -> Morse with
   sound and lamp, Morse -> text), Tap key (send Morse yourself, live decoding) and Practice (graded lessons, 10 questions:
   listen and pick, or see and tap). SOS button in the header. Speed (WPM) and tone are shared by all screens.
   Saves in localStorage: learn.morse-code.wpm, .hz, .tree, .text and .best (per lesson and type, via the Learn kit). */
(() => {
  const M = window.MC, A = M.audio, VER = 'MC1', PRE = 'learn.morse-code.', N = 10;
  const prog = LRN.progress(PRE), store = LRN.store;
  const root = document.getElementById('app');
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : String(c)));
    return el;
  };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const marks = code => h('span', { class: 'mc-code', 'aria-label': code.split('').map(c => c === '.' ? 'dot' : 'dash').join(' ') },
    code.split('').map(c => h('i', { class: c === '.' ? 'dt' : 'ds' })));

  let wpm = +store.read(PRE + 'wpm', 12) || 12; A.hz = +store.read(PRE + 'hz', 600) || 600;
  let mode = 'chart', keyer = null;
  const lamp = h('span', { class: 'mc-lamp', 'aria-hidden': 'true' });
  const light = on => lamp.classList.toggle('on', on);
  const play = (code, done) => { A.unlock(); return A.play(code, wpm, light, done); };
  const wpmOut = h('output', null, wpm + ' WPM'), hzOut = h('output', null, A.hz + ' Hz');
  const settings = h('div', { class: 'mc-set' }, lamp,
    h('label', null, 'Speed ', h('input', { type: 'range', min: 5, max: 25, value: wpm, 'aria-label': 'Speed in words per minute', oninput: e => { wpm = +e.target.value; wpmOut.textContent = wpm + ' WPM'; store.write(PRE + 'wpm', wpm); if (keyer) keyer.setWpm(wpm); } }), wpmOut),
    h('label', null, 'Tone ', h('input', { type: 'range', min: 400, max: 1000, step: 50, value: A.hz, 'aria-label': 'Tone pitch', oninput: e => { A.hz = +e.target.value; hzOut.textContent = A.hz + ' Hz'; store.write(PRE + 'hz', A.hz); } }), hzOut));
  const modes = { chart: 'Chart', translate: 'Translate', tap: 'Tap key', practice: 'Practice' };
  const modeBar = h('div', { class: 'lrn-mode mc-modes', role: 'group', 'aria-label': 'Mode' },
    Object.keys(modes).map(m => h('button', { type: 'button', 'data-m': m, onclick: () => go(m) }, modes[m])));
  const sos = h('button', { type: 'button', class: 'lrn-qc mc-sos', title: 'Play SOS: ... --- ...', onclick: () => play(M.encode('SOS')) }, 'SOS');
  const head = h('header', { class: 'lrn-head' }, h('h1', null, h('span', { class: 'lrn-here' }, 'Morse Code')), modeBar, sos, h('span', { class: 'mc-ver' }, VER));
  const body = h('div', { class: 'mc-body' });
  const main = h('main', { class: 'lrn-main mc-main', id: 'lrn-main' }, settings, body);
  root.className = 'lrn mc'; root.replaceChildren(head, main);

  function go(m) {
    A.stop(); light(false); A.key(false); if (keyer) keyer.reset(); keyer = null; mode = m;
    modeBar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    document.title = 'Morse Code ' + VER + (m === 'chart' ? '' : ' \u2013 ' + modes[m]);
    ({ chart, translate, tap, practice })[m]();
  }

  // ---------- chart ----------
  function chart() {
    let tree = !!store.read(PRE + 'tree', false);
    const cell = c => h('button', { type: 'button', class: 'mc-cell', 'data-c': c, onclick: e => { const b = e.currentTarget; b.classList.add('lit'); play(M.table[c], () => b.classList.remove('lit')); } },
      h('b', null, c), marks(M.table[c]));
    const box = h('div');
    const draw = () => {
      tbtn.setAttribute('aria-pressed', String(tree));
      if (!tree) { box.replaceChildren(...[['Letters', M.letters], ['Numbers', M.digits], ['Punctuation', M.punct]].map(([n, list]) => h('section', null, h('h2', { class: 'mc-gh' }, n), h('div', { class: 'mc-grid' }, list.map(cell))))); return; }
      // tree: row n holds every code n symbols long, dot branch to the left, dash to the right
      box.replaceChildren(h('p', { class: 'lrn-sub' }, 'Start at the top. Go left for a dot, right for a dash.'), ...[1, 2, 3, 4].map(n => h('div', { class: 'mc-trow', style: '--n:' + (1 << n) },
        Array.from({ length: 1 << n }, (_, i) => { const code = i.toString(2).padStart(n, '0').replace(/0/g, '.').replace(/1/g, '-'), c = M.rev[code];
          return c ? cell(c) : h('span', { class: 'mc-cell mc-empty' }); }))));
    };
    const tbtn = h('button', { type: 'button', class: 'lrn-qc', onclick: () => { tree = !tree; store.write(PRE + 'tree', tree); draw(); } }, '\u{1F333} Tree view');
    body.replaceChildren(h('div', { class: 'mc-row' }, h('h2', { class: 'lrn-h' }, 'Tap a character to hear it'), tbtn),
      h('p', { class: 'lrn-sub' }, 'Hint: learn letters by their sound ("di-dah" = A), not by counting dots. E is one dot, T is one dash.'), box);
    draw();
  }

  // ---------- translator ----------
  function translate() {
    const txt = h('textarea', { class: 'mc-ta', rows: 2, 'aria-label': 'Text', placeholder: 'Type text here' });
    const out = h('textarea', { class: 'mc-ta mc-mono', rows: 3, 'aria-label': 'Morse code', placeholder: 'or paste Morse here: .... .. / - .... . .-. .' });
    txt.value = store.read(PRE + 'text', 'SOS HELLO 123');
    const note = h('p', { class: 'lrn-sub', 'aria-live': 'polite' });
    const toMorse = () => { out.value = M.encode(txt.value); store.write(PRE + 'text', txt.value); note.textContent = /#/.test(out.value) ? '# = a character Morse has no code for.' : ''; };
    const toText = () => { txt.value = M.decode(out.value); note.textContent = /#/.test(txt.value) ? '# = a code that is not a known letter.' : ''; };
    txt.addEventListener('input', toMorse); out.addEventListener('input', toText);
    const pbtn = h('button', { type: 'button', class: 'lrn-qc mc-go', onclick: () => { if (A.playing) { A.stop(); light(false); pbtn.textContent = '\u25B6 Play'; return; }
      pbtn.textContent = '\u25A0 Stop'; play(out.value, () => { pbtn.textContent = '\u25B6 Play'; }); } }, '\u25B6 Play');
    body.replaceChildren(h('h2', { class: 'lrn-h' }, 'Text \u21C4 Morse'), txt, h('div', { class: 'mc-row' }, pbtn, h('span', { class: 'lrn-sub' }, 'Use . and -, a space between letters, / between words.')), out, note);
    toMorse();
  }

  // ---------- tap key ----------
  function keyPad(onLetter, onSym) {               // big key + keyer; used by Tap key and the tap quiz
    const k = h('button', { type: 'button', class: 'mc-key', 'aria-label': 'Morse key: short press dot, long press dash' }, 'TAP');
    keyer = M.makeKeyer({ wpm, onSymbol: onSym, onLetter, onWord: () => onLetter(' ') });
    const dn = () => { A.unlock(); A.key(true); k.classList.add('down'); keyer.down(performance.now()); };
    const upk = () => { if (!k.classList.contains('down')) return; A.key(false); k.classList.remove('down'); keyer.up(performance.now()); };
    k.addEventListener('pointerdown', e => { e.preventDefault(); k.setPointerCapture && k.setPointerCapture(e.pointerId); dn(); });
    k.addEventListener('pointerup', upk); k.addEventListener('pointercancel', upk); k.addEventListener('contextmenu', e => e.preventDefault());
    k._dn = dn; k._up = upk; padKey = k; return k;
  }
  let padKey = null;
  function tap() {
    const text = h('div', { class: 'mc-out mc-mono', 'aria-live': 'polite' }), part = h('div', { class: 'mc-part mc-mono' });
    const k = keyPad(c => { text.textContent += c; part.textContent = ''; }, (s, p) => { part.textContent = p; });
    body.replaceChildren(h('div', { class: 'mc-row' }, h('h2', { class: 'lrn-h' }, 'Tap Morse yourself'),
      h('button', { type: 'button', class: 'lrn-qc', onclick: () => { text.textContent = ''; part.textContent = ''; keyer.reset(); } }, 'Clear')),
      h('p', { class: 'lrn-sub' }, 'Short press = dot, long press = dash (or hold the Space bar). Pause for a new letter, pause longer for a space. Slower speed = more time.'),
      text, part, k);
  }

  // ---------- practice ----------
  let Q = null;
  function practice() {
    body.replaceChildren(h('h2', { class: 'lrn-h' }, 'Lessons'), h('p', { class: 'lrn-sub' }, 'Each lesson adds a few characters and also asks the ones before it.'),
      h('div', { class: 'lrn-grid mc-lessons' }, M.lessons.map((l, i) => {
        const bl = prog.best('listen-' + l.id), bt = prog.best('tap-' + l.id);
        return h('div', { class: 'lrn-card mc-les' }, h('b', null, 'Lesson ' + (i + 1) + ': ' + l.add.join(' ')),
          h('span', { class: 'lrn-sub' }, 'Best: listen ' + (bl ? bl.score + '/' + bl.of : '\u2013') + ' \u00B7 tap ' + (bt ? bt.score + '/' + bt.of : '\u2013')),
          h('div', { class: 'mc-row' }, h('button', { type: 'button', class: 'lrn-qc', 'data-q': 'listen-' + l.id, onclick: () => startQ(i, 'listen') }, '\u{1F442} Listen'),
            h('button', { type: 'button', class: 'lrn-qc', 'data-q': 'tap-' + l.id, onclick: () => startQ(i, 'tap') }, '\u270B Tap')));
      })));
  }
  function startQ(li, type) {
    const pool = M.lessonPool(li), fresh = M.lessons[li].add;
    Q = { li, type, i: 0, score: 0, qs: Array.from({ length: N }, (_, k) => k % 2 === 0 ? fresh[Math.floor(Math.random() * fresh.length)] : pool[Math.floor(Math.random() * pool.length)]) };
    ask();
  }
  function ask() {
    const c = Q.qs[Q.i], code = M.table[c], fb = h('p', { class: 'mc-fb', 'aria-live': 'polite' });
    let done = false;
    const next = h('button', { type: 'button', class: 'lrn-qc mc-go', hidden: true, onclick: () => { Q.i++; Q.i < N ? ask() : results(); } }, 'Next \u203A');
    const answer = (ok, extra) => { if (done) return; done = true; if (ok) Q.score++; if (keyer) keyer.reset();
      fb.replaceChildren((ok ? '\u2714 Right! ' : '\u2716 Not quite' + (extra || '') + '. ') + c + ' = ', marks(code)); fb.className = 'mc-fb ' + (ok ? 'ok' : 'bad'); next.hidden = false; next.focus(); };
    const top = h('p', { class: 'lrn-sub' }, 'Lesson ' + (Q.li + 1) + ' \u00B7 Question ' + (Q.i + 1) + ' of ' + N + ' \u00B7 Score ' + Q.score);
    if (Q.type === 'listen') {
      const pool = M.lessonPool(Q.li), others = shuffle(pool.filter(x => x !== c)).concat(shuffle(M.letters.filter(x => pool.indexOf(x) < 0)));
      const opts = shuffle([c].concat(others.slice(0, 3)));
      const btns = opts.map(o => h('button', { type: 'button', class: 'mc-opt', 'data-c': o, onclick: e => { if (done) return; btns.forEach(b => b.dataset.c === c && b.classList.add('ok')); if (o !== c) e.currentTarget.classList.add('bad'); answer(o === c); } }, o));
      body.replaceChildren(h('div', { class: 'mc-quiz' }, top, h('h2', { class: 'lrn-h' }, 'Listen. Which character is it?'),
        h('button', { type: 'button', class: 'lrn-qc', onclick: () => play(code) }, '\u{1F50A} Play again'), h('div', { class: 'mc-opts' }, btns), h('div', { class: 'mc-row mc-ans' }, fb, next)));
      play(code);
    } else {
      const part = h('div', { class: 'mc-part mc-mono' });
      const k = keyPad(got => { if (got !== ' ') answer(got === c, got === '#' ? ' (not a letter)' : ', you sent ' + got); }, (s, p) => { if (!done) part.textContent = p; });
      body.replaceChildren(h('div', { class: 'mc-quiz' }, top, h('h2', { class: 'lrn-h' }, 'Tap this in Morse:'), h('div', { class: 'mc-row mc-ans' }, h('span', { class: 'mc-big' }, c),
        h('button', { type: 'button', class: 'lrn-qc', onclick: () => { if (!done) answer(false, ', skipped'); } }, 'Show me')), part, h('div', { class: 'mc-row mc-ans' }, fb, next), k));
    }
  }
  function results() {
    const id = Q.type + '-' + M.lessons[Q.li].id, best = prog.saveScore(id, Q.score, N), b = prog.best(id);
    store.write(PRE + 'last', { id, score: Q.score, of: N, at: Date.now() });
    body.replaceChildren(h('div', { class: 'mc-quiz' }, h('h2', { class: 'lrn-h' }, Q.score >= 8 ? '\u{1F389} Great!' : '\u{1F4E1} Keep practising!'),
      h('p', { class: 'mc-big' }, Q.score + ' / ' + N), h('p', { class: 'lrn-sub' }, best ? 'New best score!' : 'Best: ' + b.score + ' / ' + b.of),
      h('div', { class: 'mc-row' }, h('button', { type: 'button', class: 'lrn-qc mc-go', onclick: () => startQ(Q.li, Q.type) }, 'Again'),
        h('button', { type: 'button', class: 'lrn-qc', onclick: practice }, 'All lessons'))));
  }

  const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  addEventListener('keydown', e => { if (e.code === 'Space' && keyer && padKey && padKey.isConnected && !typing(e)) { e.preventDefault(); if (!e.repeat) padKey._dn(); } });
  addEventListener('keyup', e => { if (e.code === 'Space' && keyer && padKey && padKey.isConnected) { e.preventDefault(); padKey._up(); } });
  addEventListener('blur', () => { if (padKey) padKey._up(); });
  go(({ '#translate': 'translate', '#tap': 'tap', '#practice': 'practice' })[location.hash] || 'chart');
})();
