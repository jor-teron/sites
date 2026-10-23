/* Learn kit — app shell: header (back button, title, Basics/Expert toggle), view router, footer disclaimer, keyboard (Esc = back,
   arrows = steps). One call per Learn app: LRN.app({root, base, ver, prefix, title, fallback, disclaimer}). */
window.LRN = window.LRN || {};
(() => {
  const L = window.LRN, h = L.h;
  L.app = async function (cfg) {
    const root = cfg.root, progress = L.progress(cfg.prefix);
    root.className = 'lrn';
    const back = h('button', { type: 'button', class: 'lrn-back', 'aria-label': 'Back', hidden: true }, '\u25C0');
    const modeBtns = [['basics', 'Basics'], ['expert', 'Expert']].map(([m, t]) => h('button', { type: 'button', 'data-mode': m, onclick: () => { L.mode.set(m); sync(); if (S.view === 'card') draw(); } }, t));
    const head = h('header', { class: 'lrn-head' }, back, h('h1', null, cfg.title), h('div', { class: 'lrn-mode', role: 'group', 'aria-label': 'Detail level' }, modeBtns));
    const main = h('main', { class: 'lrn-main', id: 'lrn-main' }, h('p', { class: 'lrn-note' }, 'Loading\u2026'));
    const foot = h('footer', { class: 'lrn-foot' }, cfg.disclaimer);
    root.replaceChildren(head, main, foot);

    let data = { meta: {}, cards: [], notes: [] };
    const S = { view: 'home', id: null, step: 0, quiz: null };
    const x = {
      st: S, progress, data, mode: L.mode.get, redraw: () => draw(true),
      card: () => (data.cards.find(c => c.id === S.id) || {}).card,
      go(view, id) {
        S.view = view; S.id = id || null; S.step = 0;
        if (view === 'card') progress.markViewed(id);
        if (view === 'quiz') S.quiz = { qs: L.quiz.build(x.card()), i: 0, score: 0, picked: null };
        draw();
      }
    };
    function sync() { const m = L.mode.get(); modeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m))); }
    function draw(keep) {
      const y = main.scrollTop, view = L.views[S.view](x);
      if (S.view === 'home' && data.notes.length) view.append(h('p', { class: 'lrn-note', role: 'status' }, 'Notice: ' + data.notes.join('; ') + '.'));
      main.replaceChildren(view); back.hidden = S.view === 'home'; sync();
      const f = main.querySelector('[data-focus]'); if (f) f.focus({ preventScroll: true });
      main.scrollTop = keep ? y : 0;
    }
    const up = () => { if (S.view === 'quiz') x.go('card', S.id); else if (S.view === 'card') x.go('home'); };
    back.addEventListener('click', up);
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') up();
      else if (S.view === 'card' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { const c = x.card(), s = S.step + (e.key === 'ArrowRight' ? 1 : -1); if (c && s >= 0 && s < c.basics.length) { S.step = s; draw(true); } }
    });

    try { data = await L.load(cfg.base, cfg.ver, cfg.fallback); } catch (e) { data.notes.push('content could not be loaded'); }
    data.cards = data.cards.filter(c => c && c.id);
    x.data = data;
    if (data.meta.title) { head.querySelector('h1').textContent = data.meta.title; }
    if (data.meta.disclaimer) foot.textContent = data.meta.disclaimer;
    draw();
  };
})();
