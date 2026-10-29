/* Typing Tutor TT1 — screens: home (lessons by stage + free test), practice (text, live stats, hint, hands, keyboard) and results.
   Keys: type the text on a physical keyboard; Backspace fixes the last character; Esc goes back; Enter on results = next / retry.
   On phones a hidden input brings up the on-screen keyboard (tap the text). Uses the Learn kit look (learn.css) and the Hub theme. */
(() => {
  const T = window.TT, VER = 'TT1';
  const root = document.getElementById('app');
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : String(c)));
    return el;
  };
  const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const keyLabel = c => c === ' ' ? 'Space' : c;

  const back = h('button', { type: 'button', class: 'lrn-crumb', hidden: true, onclick: () => home() }, '\u2039 Lessons');
  const title = h('span', { class: 'lrn-here' }, 'Typing Tutor');
  const head = h('header', { class: 'lrn-head' }, h('h1', null, back, title), h('span', { class: 'tt-ver' }, VER));
  const main = h('main', { class: 'lrn-main tt-main', id: 'lrn-main' });
  const foot = h('footer', { class: 'lrn-foot' }, 'Rest your fingers on the home row: the F and J keys have small bumps. Accuracy first, speed comes later.');
  root.className = 'lrn tt'; root.replaceChildren(head, main, foot);
  if (window.LearnHubBar) LearnHubBar.attach(root.querySelector('.lrn-head'), { buttons: '.lrn-crumb' });   // TB2: Hub desktop window: the Lessons back button (only in a lesson)

  let S = null;              // current practice session
  let ticker = 0;
  const stop = () => { clearInterval(ticker); ticker = 0; };

  // ---------- home ----------
  function home() {
    stop(); S = null; back.hidden = true; title.textContent = 'Typing Tutor'; document.title = 'Typing Tutor ' + VER;
    const kids = [];
    const tests = [60, 120, 300].map(sec => {
      const b = T.save.test(sec);
      return h('button', { type: 'button', class: 'lrn-card tt-test', 'data-test': sec, onclick: () => start({ test: sec }) },
        h('b', null, sec / 60 + ' min test'), h('span', { class: 'lrn-sub' }, b ? 'Best ' + b.wpm + ' WPM, ' + b.acc + '%' : 'Common words'));
    });
    kids.push(h('h2', { class: 'tt-stage' }, 'Free test'), h('div', { class: 'lrn-grid tt-grid' }, tests));
    let idx = 0;
    T.STAGES.forEach((st, si) => {
      const cards = st.lessons.map(l => {
        const i = idx++, open = T.save.unlocked(i), b = T.save.best(l.id), pass = b && b.acc >= T.PASS;
        return h('button', { type: 'button', class: 'lrn-card tt-lesson' + (open ? '' : ' locked') + (pass ? ' passed' : ''), 'data-lesson': l.id, disabled: !open,
          title: open ? '' : 'Reach ' + T.PASS + '% accuracy on the lesson before to unlock', onclick: () => start({ lesson: l.id }) },
          h('span', { class: 'tt-num' }, (pass ? '\u2713 ' : open ? '' : '\uD83D\uDD12 ') + 'Lesson ' + (i + 1)),
          h('b', null, l.title),
          l.keys ? h('span', { class: 'tt-keys' }, [...l.keys].map(c => h('kbd', null, c))) : null,
          h('span', { class: 'lrn-sub' }, b ? 'Best ' + b.wpm + ' WPM, ' + b.acc + '%' : open ? 'Not tried yet' : 'Locked'));
      });
      kids.push(h('h2', { class: 'tt-stage' }, (si + 1) + '. ' + st.name), h('div', { class: 'lrn-grid tt-grid' }, cards));
    });
    kids.push(h('p', { class: 'lrn-note' }, 'A lesson unlocks when you reach ' + T.PASS + '% accuracy on the one before. ',
      h('button', { type: 'button', class: 'lrn-btn link', onclick: () => { if (confirm('Clear all best scores and locks?')) { T.save.reset(); home(); } } }, 'Reset progress')));
    main.replaceChildren(...kids); main.scrollTop = 0;
  }

  // ---------- practice ----------
  function start(opt) {
    stop();
    const lesson = opt.lesson ? T.lesson(opt.lesson) : null, test = opt.test || 0;
    const text = lesson ? lesson.make() : T.testText(60);
    back.hidden = false;
    title.textContent = lesson ? 'Lesson ' + (T.LESSONS.indexOf(lesson) + 1) + ': ' + lesson.title : test / 60 + ' minute test';
    document.title = title.textContent + ' \u2013 Typing Tutor ' + VER;

    const stat = (k, label) => h('div', { class: 'tt-stat' }, h('b', { 'data-stat': k }, '0'), h('span', null, label));
    const stats = h('div', { class: 'tt-stats' }, stat('wpm', 'WPM'), stat('acc', 'Accuracy'), stat('err', 'Errors'), stat('time', test ? 'Time left' : 'Time'));
    const box = h('div', { class: 'tt-text', tabindex: '0', 'aria-label': 'Text to type. Start typing.' });
    const inp = h('input', { class: 'tt-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', 'aria-label': 'Typing input' });
    const hint = h('p', { class: 'tt-hint', 'aria-live': 'polite' });
    const hands = h('div', { class: 'tt-hands' }), kbEl = h('div', { class: 'tt-kb' });
    const tools = h('div', { class: 'lrn-nav tt-tools' },
      h('button', { type: 'button', class: 'lrn-btn', onclick: () => start(opt) }, 'Restart'),
      test ? h('button', { type: 'button', class: 'lrn-btn', onclick: () => S && S.e.finish() }, 'Stop') : null,
      h('span', { class: 'lrn-note tt-tip' }, 'Esc = back, Backspace = fix'));
    main.replaceChildren(stats, h('div', { class: 'tt-textwrap', onclick: () => inp.focus({ preventScroll: true }) }, box, inp), hint, h('div', { class: 'tt-board' }, hands, kbEl), tools);
    main.scrollTop = 0;

    const kb = T.keyboard(kbEl, hands);
    const spans = [];
    function addText(str, from) {               // words wrap as a whole: chars inside a nowrap word span, spaces between
      const frag = document.createDocumentFragment(); let word = null;
      for (let i = 0; i < str.length; i++) {
        const c = str[i], sp = document.createElement('span'); sp.textContent = c; spans[from + i] = sp;
        if (c === ' ') { word = null; sp.className = 'sp'; frag.append(sp); continue; }
        if (!word) { word = document.createElement('span'); word.className = 'w'; frag.append(word); }
        word.append(sp);
      }
      box.append(frag);
    }
    const e = T.engine(text, { endless: !!test, onMark: i => paint(i), onDone: () => done() });
    S = { e, opt, lesson, test };
    addText(text, 0);

    function paint(i) {
      const sp = spans[i]; if (sp) sp.className = (sp.textContent === ' ' ? 'sp' : '') + (e.marks[i] === 1 ? ' ok' : e.marks[i] === 2 ? ' bad' : '');
      cursor();
    }
    let curEl = null;
    function cursor() {
      if (curEl) curEl.classList.remove('cur');
      curEl = spans[e.pos] || null;
      if (curEl) {
        curEl.classList.add('cur');
        const lh = curEl.offsetHeight || 30, top = curEl.offsetTop - box.offsetTop;
        if (top - box.scrollTop > lh * 1.5 || top < box.scrollTop) box.scrollTop = Math.max(0, top - lh);
      }
      const ch = e.expected(), info = kb.show(ch);
      hint.replaceChildren();
      if (ch != null) {
        hint.append('Next: ', h('kbd', null, keyLabel(ch)), info ? ' \u2014 ' + T.fingerName(info.finger) : '');
        if (info && info.shift) hint.append(', hold ', h('kbd', null, (info.finger[0] === 'l' ? 'right' : 'left') + ' Shift'));
      }
      if (test && e.text.length - e.pos < 120) { const more = ' ' + T.testText(30), from = e.text.length; e.append(more); addText(more, from); }
    }
    function live() {
      if (!S || S.e !== e) return;
      const r = T.calc(Object.assign({}, e.run, { goodChars: e.run.goodChars, end: e.run.start ? Date.now() : 0 }));
      const q = k => stats.querySelector('[data-stat="' + k + '"]');
      q('wpm').textContent = e.run.start ? r.wpm : 0; q('acc').textContent = r.acc + '%'; q('err').textContent = e.run.wrong;
      const el = e.run.start ? Math.floor((Date.now() - e.run.start) / 1000) : 0;
      q('time').textContent = fmt(test ? Math.max(0, test - el) : el);
      if (test && e.run.start && Date.now() - e.run.start >= test * 1000) e.finish();
    }
    S.input = ch => {
      if (ch === '\b') { e.back(); return; }
      if (ch.length !== 1) return;
      const ok = e.type(ch); if (ok != null) kb.flash(ch, ok); live();
    };
    S.live = live;
    inp.addEventListener('input', () => { const v = inp.value; inp.value = ''; for (const c of v) S && S.input(c === '\n' ? ' ' : c); });
    cursor(); live(); ticker = setInterval(live, 500);
    if (!matchMedia('(pointer: coarse)').matches) box.focus({ preventScroll: true });
  }

  // ---------- results ----------
  function done() {
    stop();
    const s = S, r = T.calc(s.e.run);
    if (s.test) r.secs = Math.min(r.secs, s.test);
    let note = '', next = null, isBest = false;
    if (s.lesson) {
      const i = T.LESSONS.indexOf(s.lesson), wasOpen = i + 1 < T.LESSONS.length && T.save.unlocked(i + 1);
      isBest = T.save.lesson(s.lesson.id, r);
      const pass = r.acc >= T.PASS;
      if (i + 1 < T.LESSONS.length && T.save.unlocked(i + 1)) next = T.LESSONS[i + 1];
      note = pass ? (next && !wasOpen ? 'Next lesson unlocked: ' + next.title + '!' : 'Passed. Well done!') : 'Reach ' + T.PASS + '% accuracy to unlock the next lesson. Slow down a little and try again.';
    } else {
      isBest = T.save.testRun(s.test, r);
      note = r.acc >= T.PASS ? 'Good accuracy. Keep it up!' : 'Try to keep accuracy at ' + T.PASS + '% or more.';
    }
    S = { results: true, retry: () => start(s.opt), next: next ? () => start({ lesson: next.id }) : null };
    const big = (v, l) => h('div', { class: 'tt-stat big' }, h('b', null, v), h('span', null, l));
    main.replaceChildren(
      h('h2', { class: 'lrn-h tt-done', tabindex: '-1' }, s.lesson ? 'Lesson complete' : 'Time up', isBest ? h('span', { class: 'tt-best' }, 'New best!') : null),
      h('div', { class: 'tt-stats' }, big(r.wpm, 'WPM'), big(r.acc + '%', 'Accuracy'), big(fmt(r.secs), 'Time'), big(r.errors, 'Errors')),
      h('div', { class: 'lrn-call ' + (r.acc >= T.PASS ? 'tt-pass' : 'tt-fail') }, h('b', null, r.acc >= T.PASS ? 'Passed' : 'Not yet'), h('span', { 'data-note': '' }, note)),
      h('div', { class: 'tt-missed' }, h('span', { class: 'lrn-sub' }, 'Most-missed keys: '),
        r.missed.length ? r.missed.map(([k, n]) => h('span', { class: 'tt-chip' }, h('kbd', null, k), ' \u00D7' + n)) : h('span', null, 'none \u2014 perfect!')),
      h('div', { class: 'lrn-nav' },
        h('button', { type: 'button', class: 'lrn-btn', onclick: home }, 'Lessons'),
        h('button', { type: 'button', class: 'lrn-btn' + (next ? '' : ' primary'), 'data-act': 'retry', onclick: S.retry }, 'Retry'),
        next ? h('button', { type: 'button', class: 'lrn-btn primary', 'data-act': 'next', onclick: S.next }, 'Next lesson') : null)
    );
    main.querySelector('.tt-done').focus({ preventScroll: true });
  }

  // ---------- keys ----------
  window.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { if (S) { ev.preventDefault(); home(); } return; }
    if (!S) return;
    if (S.results) { if (ev.key === 'Enter' && !(ev.target && ev.target.tagName === 'BUTTON')) { ev.preventDefault(); (S.next || S.retry)(); } return; }
    if (ev.ctrlKey || ev.metaKey || (ev.altKey && !ev.getModifierState('AltGraph'))) return;
    if (ev.key === 'Backspace') { ev.preventDefault(); S.input('\b'); return; }
    if (ev.key.length === 1) { ev.preventDefault(); S.input(ev.key); }
  });
  document.addEventListener('visibilitychange', () => { if (S && S.live) S.live(); });

  window.TT.app = { home, start };                       // for tests and deep links
  const m = /[?&](lesson|test)=(\w+)/.exec(location.search);
  if (m && m[1] === 'lesson' && T.lesson(m[2]) && T.save.unlocked(T.LESSONS.indexOf(T.lesson(m[2])))) start({ lesson: m[2] });
  else if (m && m[1] === 'test' && [60, 120, 300].includes(+m[2])) start({ test: +m[2] });
  else home();
})();
