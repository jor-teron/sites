/* Learn kit — the three views (card grid, step viewer, quiz). Each takes the app context `x` and returns a DOM node. All text from the
   .txt files goes in through textContent, never innerHTML. x = {data, progress, mode(), go(view,id), card(), st (view state), redraw()}. */
window.LRN = window.LRN || {};
(() => {
  const L = window.LRN;
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : String(c)); });
    return e;
  };
  const btn = (label, onclick, cls, extra) => h('button', Object.assign({ type: 'button', class: 'lrn-btn ' + (cls || ''), onclick }, extra), label);
  const title = (text, icon, cls) => h('h2', { class: 'lrn-h ' + (cls || ''), tabindex: '-1', 'data-focus': '1' }, icon ? h('span', { class: 'lrn-icon', 'aria-hidden': 'true' }, icon) : null, text);
  L.h = h;

  L.views = {
    home(x) {
      const viewed = x.progress.viewed();
      const cards = x.data.cards.map(({ id, card }) => {
        if (!card) return h('div', { class: 'lrn-card lrn-missing', role: 'note' }, h('b', null, id), h('span', { class: 'lrn-sub' }, 'This card could not be loaded'));
        const best = x.progress.best(id);
        return h('button', { type: 'button', class: 'lrn-card', onclick: () => x.go('card', id) },
          h('span', { class: 'lrn-icon', 'aria-hidden': 'true' }, card.icon), h('b', null, card.title),
          card.summary ? h('span', { class: 'lrn-sub' }, card.summary) : null,
          h('span', { class: 'lrn-tags' }, viewed[id] ? h('i', null, '\u2713 Viewed') : null, best ? h('i', null, 'Best ' + best.score + '/' + best.of) : null));
      });
      if (x.allQuiz().length) {                                       // optional mixed check, always the last tile
        const best = x.progress.best(x.MIXED);
        cards.push(h('button', { type: 'button', class: 'lrn-card lrn-light', onclick: () => x.go('quiz') }, h('span', { class: 'lrn-icon', 'aria-hidden': 'true' }, '\uD83C\uDFAF'),
          h('b', null, 'Quick check'), h('span', { class: 'lrn-sub' }, 'optional'), best ? h('span', { class: 'lrn-tags' }, h('i', null, 'best ' + best.score + '/' + best.of)) : null));
      }
      return h('section', null, h('div', { class: 'lrn-grid' }, cards));
    },

    card(x) {
      const c = x.card(), st = x.st, n = c.basics.length, i = Math.min(st.step || 0, Math.max(n - 1, 0)), last = i >= n - 1;
      const sec = h('section', null, title(c.title, c.icon, 'lrn-sr'));
      if (c.call) sec.append(h('div', { class: 'lrn-call', role: 'note' }, h('b', null, 'Call emergency services'), h('span', null, c.call)));
      if (n) {
        sec.append(h('div', { class: 'lrn-step' },
          h('div', { class: 'lrn-count', 'aria-live': 'polite' }, 'Step ' + (i + 1) + ' of ' + n),
          h('div', { class: 'lrn-dots', 'aria-hidden': 'true' }, c.basics.map((_, k) => h('span', { class: k <= i ? 'on' : '' }))),
          h('p', { class: 'lrn-text' }, c.basics[i].text)));          // c.basics[i].drawing is parsed but not shown yet
        sec.append(h('div', { class: 'lrn-nav' },
          btn('\u25C0 Back', () => { st.step = i - 1; x.redraw(); }, '', i ? null : { disabled: true }),
          last ? btn('Done', () => x.done(c.id), 'primary')
               : btn('Next \u25B6', () => { st.step = i + 1; x.redraw(); }, 'primary')));
      } else sec.append(h('p', { class: 'lrn-note' }, 'This card has no steps yet.'));
      if (x.mode() === 'expert') sec.append(h('div', { class: 'lrn-expert' }, h('h3', null, 'Expert detail'),
        c.expert.length ? h('ul', null, c.expert.map(s => h('li', null, s.text))) : h('p', { class: 'lrn-note' }, 'No extra detail for this card.')));
      return sec;
    },

    // a quick check: this topic's questions (x.st.id set) or a mixed set (x.st.id null); starts straight under the header
    quiz(x) {
      const c = x.card(), id = c ? c.id : x.MIXED, q = x.st.quiz, sec = h('section');
      if (q.i >= q.qs.length) {                                       // result
        const best = x.progress.best(id), back = () => c ? x.go('card', c.id) : x.go('home');
        sec.append(h('p', { class: 'lrn-score', role: 'status', tabindex: '-1', 'data-focus': '1' }, 'You scored ' + q.score + ' of ' + q.qs.length),
          h('p', { class: 'lrn-note' }, best ? 'Best: ' + best.score + ' of ' + best.of : ''),
          h('div', { class: 'lrn-nav' }, btn('Done', back, 'primary')));
        return sec;
      }
      const cur = q.qs[q.i], done = q.picked != null;
      sec.append(h('div', Object.assign({ class: 'lrn-count' }, done ? null : { tabindex: '-1', 'data-focus': '1' }), 'Question ' + (q.i + 1) + ' of ' + q.qs.length), h('p', { class: 'lrn-text' }, cur.q),
        h('div', { class: 'lrn-opts', role: 'group', 'aria-label': 'Answers' }, cur.options.map((o, k) => h('button', {
          type: 'button', class: 'lrn-opt' + (done && k === cur.answer ? ' right' : '') + (done && k === q.picked && k !== cur.answer ? ' wrong' : ''), disabled: done || null,
          onclick: () => { q.picked = k; if (k === cur.answer) q.score++; x.redraw(); } }, o))));
      if (done) {
        sec.append(h('p', { class: 'lrn-feedback', role: 'status' }, q.picked === cur.answer ? 'Correct!' : 'Not quite. The right answer is highlighted.'),
          btn(q.i + 1 < q.qs.length ? 'Next question \u25B6' : 'See result', () => { q.i++; q.picked = null; if (q.i >= q.qs.length) x.progress.saveScore(id, q.score, q.qs.length); x.redraw(); }, 'primary', { 'data-focus': '1' }));
      }
      return sec;
    }
  };
})();
