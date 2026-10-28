/* Human Body Explorer HBE1 — screens: Explore (body + group picker + info card), List (parts by group) and Quiz.
   Tap or hover a part to light it up and read its card. Quiz: 8 questions, tap-the-part and what-does-it-do.
   Uses the Learn kit look (learn.css), the Hub theme and LRN.store. Esc closes the card / leaves the quiz. */
(() => {
  const H = window.HB, VER = 'HBE1';
  const root = document.getElementById('app');
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : String(c)));
    return el;
  };
  const viewKey = 'learn.human-body.view';
  let view = (LRN.store.read(viewKey, 'organs'));
  if (!H.views.some(v => v.id === view)) view = 'organs';
  let mode = 'explore', sel = null;

  const modes = ['explore', 'list', 'quiz'], modeNames = { explore: 'Explore', list: 'List', quiz: 'Quiz' };
  const modeBar = h('div', { class: 'lrn-mode hb-modes', role: 'group', 'aria-label': 'Mode' },
    modes.map(m => h('button', { type: 'button', 'data-m': m, onclick: () => go(m) }, modeNames[m])));
  const head = h('header', { class: 'lrn-head' }, h('h1', null, h('span', { class: 'lrn-here' }, 'Human Body')), modeBar, h('span', { class: 'hb-ver' }, VER));
  const main = h('main', { class: 'lrn-main hb-main', id: 'lrn-main' });
  const foot = h('footer', { class: 'lrn-foot' }, 'Front view, simplified. Tap a part to learn what it does.');
  root.className = 'lrn hb'; root.replaceChildren(head, main, foot);

  function go(m) {
    mode = m; sel = m === 'quiz' ? null : sel;
    modeBar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    document.title = 'Human Body Explorer ' + VER + (m === 'explore' ? '' : ' \u2013 ' + modeNames[m]);
    if (m === 'explore') explore(); else if (m === 'list') list(); else quizStart();
  }

  const picker = onPick => h('div', { class: 'hb-picker', role: 'group', 'aria-label': 'Body system' },
    H.views.map(v => h('button', { type: 'button', class: 'hb-chip', 'aria-pressed': String(v.id === view), onclick: () => { view = v.id; LRN.store.write(viewKey, view); sel = null; onPick(); } }, v.icon + ' ' + v.name)));

  function card(p, onClose) {
    if (!p) return h('div', { class: 'hb-card hb-empty' }, h('b', null, 'Tap a part'), h('p', null, 'Pick a system above, then tap a part of the body to see what it does.'));
    H.quiz.markViewed(p.id);
    const g = H.groupOf(p);
    return h('article', { class: 'hb-card', style: '--pc:' + p.color, 'aria-live': 'polite' },
      h('div', { class: 'hb-card-h' }, h('i', { class: 'hb-dot' }), h('b', null, p.name), h('span', { class: 'lrn-sub' }, g.icon + ' ' + g.name),
        h('button', { type: 'button', class: 'hb-x', 'aria-label': 'Close', onclick: onClose }, '\u00D7')),
      h('p', { class: 'hb-job' }, p.job + '.'),
      h('p', null, p.info),
      h('b', { class: 'hb-ff' }, 'Fun facts'),
      h('ul', null, p.facts.map(f => h('li', null, f))));
  }

  // ---------- explore ----------
  function explore() {
    const slot = h('div', { class: 'hb-side' });
    const svg = H.drawBody(view, { onPick: id => show(id) });
    const show = id => { sel = id; H.highlight(svg, id); slot.replaceChildren(card(H.byId[id], () => show(null))); };
    svg.addEventListener('pointerover', e => { const g = e.target.closest('.hb-part'); if (g && e.pointerType === 'mouse') H.highlight(svg, g.dataset.id, 'hover'); });
    svg.addEventListener('pointerleave', () => H.highlight(svg, null, 'hover'));
    main.replaceChildren(picker(explore), h('div', { class: 'hb-stage' }, h('div', { class: 'hb-fig' }, svg), slot));
    show(sel && H.partsOf(view).some(p => p.id === sel) ? sel : null);
  }

  // ---------- list ----------
  function list() {
    const seen = H.quiz.viewed();
    main.replaceChildren(picker(list), ...H.groups.filter(g => H.partsOf(view).some(p => p.sys === g.id)).map(g =>
      h('section', { class: 'hb-sec' }, h('h2', { class: 'hb-gh' }, g.icon + ' ' + g.name),
        h('div', { class: 'lrn-grid hb-grid' }, H.parts.filter(p => p.sys === g.id).map(p =>
          h('button', { type: 'button', class: 'lrn-card hb-item', style: '--pc:' + p.color, onclick: () => { sel = p.id; view = p.sys; go('explore'); } },
            h('b', null, h('i', { class: 'hb-dot' }), ' ', p.name), h('span', { class: 'lrn-sub' }, p.job),
            seen[p.id] ? h('span', { class: 'lrn-tags' }, h('i', null, 'seen')) : null))))));
  }

  // ---------- quiz ----------
  let Q = null;
  function quizStart() {
    const b = H.quiz.best();
    main.replaceChildren(h('div', { class: 'hb-qhome' },
      h('h2', { class: 'lrn-h' }, '\u{1F9E0} Body quiz'),
      h('p', null, H.quiz.N + ' questions: find parts on the body and pick what they do.'),
      h('p', { class: 'lrn-sub' }, b ? 'Best: ' + b.score + ' / ' + b.of : 'No best score yet.'),
      h('button', { type: 'button', class: 'lrn-qc hb-go', onclick: () => { Q = H.quiz.start(); ask(); } }, 'Start quiz')));
  }
  function ask() {
    const q = Q.cur(), p = q.part, n = h('p', { class: 'lrn-sub' }, 'Question ' + (Q.i + 1) + ' of ' + H.quiz.N + ' \u00B7 Score ' + Q.score);
    const fb = h('p', { class: 'hb-fb', 'aria-live': 'polite' });
    let locked = false;
    const nextBtn = h('button', { type: 'button', class: 'lrn-qc hb-go', hidden: true, onclick: () => Q.next() ? ask() : results() }, 'Next \u203A');
    const done = (ok, extra) => { locked = true; fb.textContent = (ok ? '\u2714 Right! ' : '\u2716 Not quite. ') + extra; fb.className = 'hb-fb ' + (ok ? 'ok' : 'bad'); nextBtn.hidden = false; nextBtn.focus(); };
    if (q.type === 'tap') {
      const svg = H.drawBody(q.view, { onPick: id => {
        if (locked) return; const ok = Q.answer(id);
        H.highlight(svg, p.id); if (!ok) H.highlight(svg, id, 'wrong');
        done(ok, (p.pl ? 'These are the ' : 'This is the ') + p.name.toLowerCase() + '.');
      } });
      main.replaceChildren(h('div', { class: 'hb-q' }, n, h('h2', { class: 'lrn-h' }, 'Tap the ' + p.name.toLowerCase()), fb, nextBtn), h('div', { class: 'hb-fig hb-qfig' }, svg));
    } else {
      const btns = q.choices.map(c => h('button', { type: 'button', class: 'hb-opt', onclick: e => {
        if (locked) return; const ok = Q.answer(c.id);
        btns.forEach((b, i) => { if (q.choices[i].id === p.id) b.classList.add('ok'); });
        if (!ok) e.currentTarget.classList.add('bad');
        done(ok, p.name + ': ' + p.job.toLowerCase() + '.');
      } }, c.text));
      main.replaceChildren(h('div', { class: 'hb-q' }, n, h('h2', { class: 'lrn-h' }, 'What ' + (p.pl ? 'do' : 'does') + ' the ' + p.name.toLowerCase() + ' do?'), h('div', { class: 'hb-opts' }, btns), fb, nextBtn));
    }
  }
  function results() {
    const b = H.quiz.best(), pct = Math.round(Q.score / H.quiz.N * 100);
    main.replaceChildren(h('div', { class: 'hb-qhome hb-res' },
      h('h2', { class: 'lrn-h' }, pct >= 75 ? '\u{1F389} Great job!' : pct >= 50 ? '\u{1F44D} Good try!' : '\u{1F4AA} Keep exploring!'),
      h('p', { class: 'hb-big' }, Q.score + ' / ' + H.quiz.N),
      h('p', { class: 'lrn-sub' }, Q.isBest ? 'New best score!' : b ? 'Best: ' + b.score + ' / ' + b.of : ''),
      h('div', { class: 'hb-row' }, h('button', { type: 'button', class: 'lrn-qc hb-go', onclick: () => { Q = H.quiz.start(); ask(); } }, 'Play again'),
        h('button', { type: 'button', class: 'lrn-qc', onclick: () => go('explore') }, 'Explore'))));
  }

  document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (mode === 'quiz') quizStart(); else if (sel) { sel = null; go(mode); } });
  go(location.hash === '#quiz' ? 'quiz' : location.hash === '#list' ? 'list' : 'explore');
})();
