/* Learn kit — app shell: header (breadcrumb, Basics/Expert toggle, in-topic Quick check button; in a Hub window: the title bar), view router, footer disclaimer, keyboard (Esc = back,
   arrows = steps). One call per Learn app: LRN.app({root, base, ver, prefix, title, fallback, disclaimer}). */
window.LRN = window.LRN || {};
(() => {
  const L = window.LRN, h = L.h;
  L.app = async function (cfg) {
    const root = cfg.root, progress = L.progress(cfg.prefix);
    root.className = 'lrn';
    const modeBtns = [['basics', 'Basics'], ['expert', 'Expert']].map(([m, t]) => h('button', { type: 'button', 'data-mode': m, onclick: () => { L.mode.set(m); sync(); if (S.view === 'card') draw(); } }, t));
    const qc = h('button', { type: 'button', class: 'lrn-qc', hidden: true, onclick: () => x.go('quiz', S.id) }, 'Quick check');
    const mode = h('div', { class: 'lrn-mode', role: 'group', 'aria-label': 'Detail level' }, modeBtns);
    // TB2: Hub desktop window: learn-hubbar.js moves this row into the title bar (Basics / Expert = tabs, Back + Quick check = buttons;
    // the app name is never sent). Back is title-bar only (display:none in the page, where the path links do the job).
    const back = h('button', { type: 'button', class: 'lrn-qc', 'data-hb': 'back', title: 'Back (Esc)', style: 'display:none', hidden: true, onclick: () => up() }, '\u2039 Back');
    const head = h('header', { class: 'lrn-head' }, h('h1', null, cfg.title), back, mode, qc);
    if (window.LearnHubBar) LearnHubBar.attach(head, { buttons: '.lrn-qc' });
    const main = h('main', { class: 'lrn-main', id: 'lrn-main' }, h('p', { class: 'lrn-note' }, 'Loading\u2026'));
    const foot = h('footer', { class: 'lrn-foot' }, cfg.disclaimer);
    root.replaceChildren(head, main, foot);

    let appTitle = cfg.title, data = { meta: {}, cards: [], notes: [] };
    const S = { view: 'home', id: null, step: 0, quiz: null };
    const x = {
      st: S, progress, data, MIXED: 'mixed:all',
      allQuiz: () => data.cards.flatMap(c => (c.card ? c.card.quiz : [])), mode: L.mode.get, redraw: () => draw(true),
      card: () => (data.cards.find(c => c.id === S.id) || {}).card,
      go(view, id) {
        S.view = view; S.id = id || null; S.step = 0;
        if (view === 'card') progress.markViewed(id);
        if (view === 'quiz') S.quiz = { qs: L.quiz.build(id ? x.card() : x.allQuiz()), i: 0, score: 0, picked: null };
        draw();
      },
      done(id) { progress.markViewed(id); toast('Well done!'); x.go('home'); }
    };
    function toast(msg) {                                           // brief, non-blocking, floats over the page
      const t = h('div', { class: 'lrn-toast', role: 'status' }, msg); root.append(t); setTimeout(() => t.remove(), 2200);
    }
    function sync() { const m = L.mode.get(); modeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m))); }
    // header: "App" | "App > icon Topic" | "App > icon Topic > Quick check" | "App > Quick check"; every part but the last is a link
    function crumb() {
      const c = S.id ? x.card() : null, h1 = head.querySelector('h1'), q = S.view === 'quiz', sep = () => h('span', { class: 'lrn-sep', 'aria-hidden': 'true' }, ' \u203A ');
      qc.hidden = S.view !== 'card' || !c.quiz.length; mode.hidden = q; back.hidden = S.view === 'home';
      if (S.view === 'home') return h1.replaceChildren(appTitle);
      const topic = h(q ? 'button' : 'span', q ? { type: 'button', class: 'lrn-crumb lrn-topic', onclick: () => x.go('card', S.id) } : { class: 'lrn-topic' }, c ? h('span', { 'aria-hidden': 'true' }, c.icon) : null, c ? ' ' + c.title : null);
      h1.replaceChildren(h('button', { type: 'button', class: 'lrn-crumb', onclick: () => x.go('home') }, appTitle), sep(), ...(c ? [topic] : []), ...(c && q ? [sep()] : []), ...(q ? [h('span', { class: 'lrn-here' }, 'Quick check')] : []));
    }
    function draw(keep) {
      const y = main.scrollTop, view = L.views[S.view](x);
      if (S.view === 'home' && data.notes.length) view.append(h('p', { class: 'lrn-note', role: 'status' }, 'Notice: ' + data.notes.join('; ') + '.'));
      main.replaceChildren(view); crumb(); sync();
      const f = main.querySelector('[data-focus]'); if (f) f.focus({ preventScroll: true });
      main.scrollTop = keep ? y : 0;
    }
    const up = () => { if (S.view === 'quiz' && S.id) x.go('card', S.id); else if (S.view !== 'home') x.go('home'); };
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') up();
      else if (S.view === 'card' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { const c = x.card(), s = S.step + (e.key === 'ArrowRight' ? 1 : -1); if (c && s >= 0 && s < c.basics.length) { S.step = s; draw(true); } }
    });

    try { data = await L.load(cfg.base, cfg.ver, cfg.fallback); } catch (e) { data.notes.push('content could not be loaded'); }
    data.cards = data.cards.filter(c => c && c.id);
    x.data = data;
    if (data.meta.title) appTitle = data.meta.title;
    if (data.meta.disclaimer) foot.textContent = data.meta.disclaimer;
    draw();
  };
})();
