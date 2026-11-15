/*
 * Settings shell (apps/system/settings/settings.js) — sections list + option pane.
 * Sections register with Settings.add({ id, title, icon, render(el) }) (sec_*.js) and are
 * shown in that order. Wide screens: list left, options right. Narrow (< 700 px, phone):
 * list first; tapping a section opens it with ‹ Back. The open section is in the hash
 * (#wallpaper, #about …) so links like settings/#about work. H28: '#<section>/<sub>' (e.g. #keys/tavily)
 * opens the section and passes sub to render(el, sub) (the row to scroll to).
 * Helpers for sections: Settings.ui.choice(), .switch() (H142: + .set(v)), .title(), .note().
 * H152: a search box above the sections list (startSearch; shared/search/ + apps/system/search/search_items.js,
 *   Settings items only). Typing swaps the list for matching pages and switches, grouped by section; click / Enter
 *   opens it like a #section[/sub] link, scrolls to the item and flashes it (reveal). Esc / × brings the list back.
 * H29.2b: ALIASES rewrites old deep links of cards that moved section (#about/device → #devices/device,
 *   #about/profile → #devices/profile, #about/sync → #devices/sync); the hash is replaced, so Back skips the old one.
 */
window.Settings = (function () {
  'use strict';
  const sections = [];
  const nav = document.getElementById('nav');
  const pane = document.getElementById('pane');
  const paneTitle = document.getElementById('pane-title');
  const back = document.getElementById('back');
  const narrow = window.matchMedia('(max-width: 699px)');
  let current = '';
  /* H29.2b: cards that moved from About to Devices; old links (bookmarks, other apps, older Hub builds) still land */
  const ALIASES = { 'about/device': 'devices/device', 'about/profile': 'devices/profile', 'about/sync': 'devices/sync',
    'about/devices': 'devices', 'about/connected': 'devices/connected' };
  const alias = (full) => { const f = String(full || ''); return Object.prototype.hasOwnProperty.call(ALIASES, f) ? ALIASES[f] : f; };

  function add(sec) { sections.push(sec); }

  function open(full, fromHash) {
    const was = full;
    full = alias(full);   // H29.2b
    if (fromHash && full !== was) fromHash = false;   // H29.2b: rewrite the old hash to the new anchor
    const cut = String(full || '').indexOf('/');
    const id = cut < 0 ? full : full.slice(0, cut);
    let sub = cut < 0 ? '' : full.slice(cut + 1);
    try { sub = decodeURIComponent(sub); } catch (_) { /* keep raw */ }
    const sec = sections.find((s) => s.id === id);
    if (!sec) { showList(); return; }
    current = full;
    nav.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    paneTitle.textContent = sec.title;
    pane.replaceChildren();
    sec.render(pane, sub);
    document.body.classList.add('in-section');
    if (!sub) pane.scrollTop = 0;
    if (!fromHash && location.hash !== '#' + full) history.replaceState(null, '', '#' + full);
  }
  function showList() {
    document.body.classList.remove('in-section');
    if (narrow.matches) { current = ''; history.replaceState(null, '', location.pathname + location.search); }
    else if (sections[0]) open(sections[0].id);
  }

  function start() {
    sections.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'nav-item';
      b.dataset.id = s.id;
      b.innerHTML = '<span class="nav-ico" aria-hidden="true"></span><span class="nav-name"></span><span class="nav-chev" aria-hidden="true">\u203A</span>';
      b.querySelector('.nav-ico').textContent = s.icon;
      b.querySelector('.nav-name').textContent = s.title;
      b.addEventListener('click', () => open(s.id));
      nav.appendChild(b);
    });
    startSearch();   // H152: before the first open(), so the box is there whatever the hash does
    back.addEventListener('click', showList);
    // window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && id !== current) open(id, true); });   // (before H29.2b)
    window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && alias(id) !== current) open(id, true); });   // H29.2b
    // const id = location.hash.slice(1);   // (before H29.2b)
    const id = alias(location.hash.slice(1));   // H29.2b: old #about/device etc.
    if (id && sections.some((s) => s.id === id.split('/')[0])) open(location.hash.slice(1), true);   // H29.2b: raw hash, so open() rewrites an old one
    else showList();
  }

  /* ---------- H152: Settings search (box above the sections list) ---------- */
  /** search_items.js rows → search rows; sec = the Settings section the hash opens (skipped when missing). */
  function searchRows(items, secs) {
    return (items || []).map((s) => {
      const id = String(s.hash || '').split('/')[0];
      const sec = (secs || sections).find((x) => x.id === id);
      if (!sec) return null;
      const top = s.where === 'Settings';
      return { name: s.name, emoji: s.icon, sub: top ? 'Page' : String(s.where || '').replace(/^Settings \u203A /, ''),
        words: s.words || '', hash: s.hash, find: s.find || '', secId: sec.id, secTitle: sec.title };
    }).filter(Boolean);
  }
  /** Matching rows grouped by section, the group with the best row first: [[title, rows], …] ([] for no words). */
  function searchGroups(rows, qw, C) {
    if (!qw.length) return [];
    const hit = C.filter(rows.slice(), qw, (r) => [[r.words, 30], [r.secTitle, 20]]);
    const by = new Map();
    hit.forEach((r) => { if (!by.has(r.secTitle)) by.set(r.secTitle, []); by.get(r.secTitle).push(r); });
    return Array.from(by.entries());
  }
  /** The element on the open page for a search row: [data-key=sub], #sub, else a title / switch / button label. */
  function findTarget(root, r, C) {
    const cut = String(r.hash || '').indexOf('/');
    const sub = cut < 0 ? '' : r.hash.slice(cut + 1);
    if (sub) {
      const k = Array.from(root.querySelectorAll('[data-key]')).find((e) => e.dataset.key === sub)
        || Array.from(root.querySelectorAll('[id]')).find((e) => e.id === sub);
      if (k) return k;
    }
    const want = String(r.find || r.name).split('|').map((x) => C.norm(x).trim()).filter(Boolean);
    const els = Array.from(root.querySelectorAll('.switch-text b, .opt-title, h3, h4, .seg-btn b, button'));
    const txt = (e) => C.norm(e.textContent).replace(/\s+/g, ' ').trim();
    for (const w of want) { const e = els.find((x) => txt(x) === w); if (e) return e; }
    for (const w of want) { const e = els.find((x) => { const t = txt(x); return t.length > 3 && (w.startsWith(t) || t.startsWith(w)); }); if (e) return e; }
    return null;
  }
  let flashT = 0;
  function reveal(r) {
    const C = window.HubSearchCore;
    if (!C) return;
    setTimeout(() => {   // after the section's own #sub scroll (50 ms)
      const t = findTarget(pane, r, C);
      if (!t) return;   // none: open() already left the page at the top
      const box = t.closest('.switch, .card, .seg') || t;
      try { box.scrollIntoView({ block: 'center' }); } catch (_) { /* old browser */ }
      pane.querySelectorAll('.search-hit').forEach((e) => e.classList.remove('search-hit'));
      box.classList.add('search-hit');
      clearTimeout(flashT); flashT = setTimeout(() => box.classList.remove('search-hit'), 1800);
    }, 90);
  }
  function startSearch() {
    const B = window.HubSearchBar, C = window.HubSearchCore, S = window.HubSearchSources;
    if (!B || !C || !S || !nav.parentNode) return;   // shared files missing: the plain list, as before H152
    const rows = searchRows((S.settingsItems() || {}).settings);
    const host = el('div', 'side-search');
    nav.parentNode.insertBefore(host, nav);
    B.create({ mount: host, root: '../../../', placeholder: 'Search settings', label: 'Search settings',
      groups: (qw) => searchGroups(rows, qw, C),
      onOpen: (r) => { open(r.hash); if (r.sub !== 'Page') reveal(r); },   // a page: its top, nothing flashed
      onRefresh: (qw) => { nav.hidden = qw.length > 0; } });
  }

  /* ---------- small UI helpers ---------- */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const ui = {
    el,
    title(text) { return el('h3', 'opt-title', text); },
    note(text) { return el('p', 'opt-note', text); },
    /** Segmented choice: opts [{value, label, hint}], value, onPick(v). Returns the group. */
    choice(opts, value, onPick) {
      const g = el('div', 'seg');
      g.setAttribute('role', 'radiogroup');
      const paint = (v) => g.querySelectorAll('button').forEach((b) => {
        const on = b.dataset.v === String(v);
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      opts.forEach((o) => {
        const b = el('button', 'seg-btn');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.dataset.v = String(o.value);
        b.appendChild(el('b', '', o.label));
        if (o.hint) b.appendChild(el('small', '', o.hint));
        b.addEventListener('click', () => { paint(o.value); onPick(o.value); });
        g.appendChild(b);
      });
      paint(value);
      g.repaint = paint;
      return g;
    },
    /** On / off switch row. H142: b.set(v) repaints it without onToggle (a refused change snaps back). */
    switch(label, hint, on, onToggle) {
      const b = el('button', 'switch');
      b.type = 'button';
      b.setAttribute('role', 'switch');
      const t = el('span', 'switch-text');
      t.append(el('b', '', label), el('small', '', hint));
      const k = el('span', 'switch-knob'); k.appendChild(el('i'));
      b.append(t, k);
      const paint = (v) => { b.classList.toggle('on', v); b.setAttribute('aria-checked', v ? 'true' : 'false'); };
      paint(on);
      b.addEventListener('click', () => { on = !on; paint(on); onToggle(on); });
      b.set = (v) => { on = !!v; paint(on); };   // H142
      return b;
    }
  };

  // return { add, start, open, ui };   (before H152)
  return { add, start, open, ui, search: { rows: searchRows, groups: searchGroups, findTarget } };   // H152
})();
