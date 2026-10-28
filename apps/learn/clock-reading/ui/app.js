/* Clock Reading CR2 — screens: Explore (drag the hands, see digital 12 h / 24 h and the time in words), Read (a clock is
   shown, pick its time from 4), Set (drag the hands to a target time, then Check) and Match (clock + part of day -> pick
   the 24-hour time). Each quiz has 5 levels (o'clock ... any minute) and 10 questions.
   Saves in localStorage: learn.clock-reading.fmt ('12' / '24'), .snap (1 / 5), .sec (second hand, on unless turned off) and .best
   (per mode-level, via the Learn kit). CR2: real time is GMT (UTC): "Now (GMT)" sets the clock to GMT and keeps it live, labelled
   GMT, until you move it; the clock ticks once a second (no smooth sweep) on the whole second; AM / PM in capitals. */
(() => {
  const C = window.CR, VER = 'CR2', PRE = 'learn.clock-reading.', N = 10;
  const prog = LRN.progress(PRE), store = LRN.store;
  const root = document.getElementById('app');
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : String(c)));
    return el;
  };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const same12 = (a, b) => a % 720 === b % 720, same24 = (a, b) => a === b;

  let fmt = store.read(PRE + 'fmt', '12'), snap = +store.read(PRE + 'snap', 5) || 5, showSec = store.read(PRE + 'sec', true) !== false, mode = 'explore', tick = null, follow = false;
  const digital = h('div', { class: 'cr-dig', 'aria-live': 'polite' }), words = h('div', { class: 'cr-words' }), gmt = h('div', { class: 'cr-gmt', hidden: true }, '\u{1F30D} GMT time now (live)');
  const utcNow = () => { const d = new Date(); return { t: d.getUTCHours() * 60 + d.getUTCMinutes(), s: d.getUTCSeconds() }; };
  const stopTick = () => { clearTimeout(tick); tick = null; };
  const readout = t => { digital.textContent = fmt === '24' ? C.fmt24(t) : C.fmt12(t, true); words.textContent = C.words(t) + ' ' + C.part(t); };
  const clock = C.makeClock({ onChange: t => { if (mode === 'explore') { unfollow(); readout(t); } } });
  function unfollow() { follow = false; gmt.hidden = true; }
  const modes = { explore: 'Explore', read: 'Read', set: 'Set', match: 'Match' };
  const modeBar = h('div', { class: 'lrn-mode cr-modes', role: 'group', 'aria-label': 'Mode' },
    Object.keys(modes).map(m => h('button', { type: 'button', 'data-m': m, onclick: () => go(m) }, modes[m])));
  const head = h('header', { class: 'lrn-head' }, h('h1', null, h('span', { class: 'lrn-here' }, 'Clock Reading')), modeBar, h('span', { class: 'cr-ver' }, VER));
  const left = h('div', { class: 'cr-left' }, clock.el, digital, words, gmt), panel = h('div', { class: 'cr-panel' });
  const main = h('main', { class: 'lrn-main cr-main', id: 'lrn-main' }, left, panel);
  root.className = 'lrn cr'; root.replaceChildren(head, main);

  function go(m) {
    stopTick(); unfollow(); clock.seconds(null); mode = m;
    modeBar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    document.title = 'Clock Reading ' + VER + (m === 'explore' ? '' : ' \u2013 ' + modes[m]);
    if (m === 'explore') explore(); else levels(m);
  }

  // ---------- explore ----------
  function explore() {
    clock.lock(false); clock.snap(snap); digital.hidden = words.hidden = false;
    const t0 = store.read(PRE + 'last', 195); clock.set(t0);
    const set = (t, live) => { if (!live) unfollow(); clock.set(t); store.write(PRE + 'last', clock.get()); readout(clock.get()); };
    const tog = (label, on, fn) => h('button', { type: 'button', class: 'lrn-qc cr-tog', 'aria-pressed': String(on), onclick: fn }, label);
    // 1 frame per second: wake on each whole second (GMT seconds), move the second hand, and the minute when it wraps.
    // While following GMT the whole clock is read from the real time; otherwise it runs on from where you put it.
    const live = () => {
      stopTick(); clock.seconds(showSec ? utcNow().s : null);
      if (!showSec && !follow) return;
      const step = () => {
        const n = utcNow();
        if (follow) { if (n.t !== clock.get()) set(n.t, true); } else if (n.s === 0) set(clock.get() + 1, true);
        clock.seconds(showSec ? n.s : null); tick = setTimeout(step, 1000 - Date.now() % 1000 + 5);
      };
      tick = setTimeout(step, 1000 - Date.now() % 1000 + 5);
    };
    const draw = () => panel.replaceChildren(h('h2', { class: 'lrn-h' }, '\u{1F552} Explore'),
      h('p', { class: 'lrn-sub' }, 'Drag the long blue minute hand or the short black hour hand. The thin red hand counts the seconds. The hour hand moves slowly as the minutes go by.'),
      h('div', { class: 'cr-row' }, tog('12 hour', fmt === '12', () => { fmt = '12'; store.write(PRE + 'fmt', fmt); readout(clock.get()); draw(); }),
        tog('24 hour', fmt === '24', () => { fmt = '24'; store.write(PRE + 'fmt', fmt); readout(clock.get()); draw(); }),
        h('button', { type: 'button', class: 'lrn-qc', onclick: () => set(clock.get() + 720) }, 'AM \u21C4 PM')),
      h('div', { class: 'cr-row' }, ...[[-60, '\u2212 1 hour'], [-5, '\u2212 5 min'], [5, '+ 5 min'], [60, '+ 1 hour']].map(([d, l]) => h('button', { type: 'button', class: 'lrn-qc', onclick: () => set(clock.get() + d) }, l))),
      h('div', { class: 'cr-row' }, tog(snap === 5 ? 'Snap: 5 min' : 'Snap: 1 min', snap === 5, () => { snap = snap === 5 ? 1 : 5; store.write(PRE + 'snap', snap); clock.snap(snap); draw(); }),
        tog('Second hand', showSec, () => { showSec = !showSec; store.write(PRE + 'sec', showSec); live(); draw(); }),
        h('button', { type: 'button', class: 'lrn-qc cr-now', title: 'Set the clock to the time now in GMT (UTC) and keep it running', onclick: () => { set(utcNow().t, true); follow = true; gmt.hidden = false; live(); } }, '\u23F0 Now (GMT)')),
      h('p', { class: 'lrn-sub' }, 'Hint: the short hand tells the hour, the long hand the minutes. Each number on the clock is 5 minutes for the long hand.'));
    clock.el.onpointerup = () => { if (mode === 'explore') store.write(PRE + 'last', clock.get()); };
    readout(clock.get()); draw(); live();
  }

  // ---------- quizzes ----------
  const INFO = { read: 'Look at the clock and pick the right time.', set: 'Drag the hands to show the time, then press Check.', match: 'The clock and the part of the day are shown. Pick the 24-hour time.' };
  let Q = null;
  function levels(m) {
    clock.lock(true); digital.hidden = words.hidden = true; clock.set(m === 'read' ? 195 : m === 'set' ? 0 : 900);
    panel.replaceChildren(h('h2', { class: 'lrn-h' }, modes[m] + ' the clock'), h('p', { class: 'lrn-sub' }, INFO[m] + ' ' + N + ' questions.'),
      h('div', { class: 'cr-levels' }, C.levels.map(lv => { const b = prog.best(m + '-' + lv.id);
        return h('button', { type: 'button', class: 'lrn-card cr-lv', 'data-lv': lv.id, onclick: () => { Q = { m, lv, i: 0, score: 0 }; ask(); } },
          h('b', null, lv.name), h('span', { class: 'lrn-sub' }, b ? 'Best ' + b.score + ' / ' + b.of : 'Not played yet')); })));
  }
  function ask() {
    const { m, lv } = Q, t = C.pick(lv, m === 'match'), fb = h('p', { class: 'cr-fb', 'aria-live': 'polite' });
    Q.t = t; let done = false;
    const next = h('button', { type: 'button', class: 'lrn-qc cr-go', hidden: true, onclick: () => { Q.i++; Q.i < N ? ask() : results(); } }, 'Next \u203A');
    const answer = ok => { done = true; if (ok) Q.score++; clock.lock(true); clock.set(t);
      fb.textContent = (ok ? '\u2714 Right! ' : '\u2716 Not quite. ') + 'It is ' + (m === 'match' ? C.fmt24(t) + ', ' : C.fmt12(t) + ', ') + C.words(t) + '.';
      fb.className = 'cr-fb ' + (ok ? 'ok' : 'bad'); next.hidden = false; next.focus(); };
    const top = h('p', { class: 'lrn-sub' }, lv.name + ' \u00B7 Question ' + (Q.i + 1) + ' of ' + N + ' \u00B7 Score ' + Q.score);
    let body;
    if (m === 'set') {
      clock.set(0); clock.lock(false); clock.snap(lv.snap);
      body = [h('h2', { class: 'lrn-h' }, 'Show ' + C.fmt12(t)), h('p', { class: 'cr-target' }, C.words(t)),
        h('button', { type: 'button', class: 'lrn-qc cr-go cr-check', onclick: () => { if (!done) answer(same12(clock.get(), t)); } }, 'Check')];
    } else {
      clock.set(t); clock.lock(true);
      const eq = m === 'read' ? same12 : same24, show = m === 'read' ? x => C.fmt12(x) : C.fmt24;
      const opts = shuffle([...new Set([t].concat(m === 'match' ? [C.norm(t + 720)] : [], C.wrong(t, lv, eq)))].slice(0, 4));
      const btns = opts.map(x => h('button', { type: 'button', class: 'cr-opt', 'data-t': x, onclick: e => {
        if (done) return; btns.forEach(b => { if (+b.dataset.t === t) b.classList.add('ok'); }); if (x !== t) e.currentTarget.classList.add('bad'); answer(x === t); } }, show(x)));
      body = [h('h2', { class: 'lrn-h' }, m === 'read' ? 'What time is it?' : 'It is ' + C.part(t) + '. Which 24-hour time?'), h('div', { class: 'cr-opts' }, btns)];
    }
    panel.replaceChildren(top, ...body, fb, next);
  }
  function results() {
    const id = Q.m + '-' + Q.lv.id, best = prog.saveScore(id, Q.score, N), b = prog.best(id);
    panel.replaceChildren(h('h2', { class: 'lrn-h' }, Q.score >= 8 ? '\u{1F389} Great!' : '\u{1F552} Keep practising!'),
      h('p', { class: 'cr-big' }, Q.score + ' / ' + N), h('p', { class: 'lrn-sub' }, best ? 'New best score!' : 'Best: ' + b.score + ' / ' + b.of),
      h('div', { class: 'cr-row' }, h('button', { type: 'button', class: 'lrn-qc cr-go', onclick: () => { Q = { m: Q.m, lv: Q.lv, i: 0, score: 0 }; ask(); } }, 'Again'),
        h('button', { type: 'button', class: 'lrn-qc', onclick: () => levels(Q.m) }, 'Levels')));
  }
  go(({ '#read': 'read', '#set': 'set', '#match': 'match' })[location.hash] || 'explore');
})();
