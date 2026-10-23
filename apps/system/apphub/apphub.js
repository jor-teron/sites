/*
 * App Hub (apps/system/apphub/apphub.js), AH1 — home (Favourites row + category tiles) and a page
 * per category, for the apps already in the Hub. Not an app store: it only lists and opens.
 *
 * Data (all the Hub's own lists, works on http and file://):
 *   categories  window.HUB_APPS_CSV "<Category> Page" rows that are not HIDDEN, by ORDER (hub_apps.js);
 *               Favorite is never a tile (it stays hidden in Start too).
 *   apps        window.HUB_CAT_CSV[cat] (hub_config.js), read with TilesCsv.parse (shared/tiles/tiles.js);
 *               on http the CSV is fetched (no-cache) with hub_catalog.js SITES_CSV as the fallback,
 *               on file:// SITES_CSV is used directly. Paths are resolved like hub_flyout.js.
 *   favourites  apps/favorite/favorite-apps.csv, in that file's order.
 * Routing: '' = home, '#cat=<name>' = that category's page (hashchange: browser back + deep links).
 * AH3: a breadcrumb (App Hub › Category) replaces the Back button; the "App Hub" crumb goes up one level
 * (same as Escape / Backspace / Alt+Left).
 * AH2: the Hub's category rows (Start menu / Phone Home menu, hub.js openCat) open this page at
 * #cat=<Category> instead of the old apps/<cat>/<cat>.html pages (those stay for old deep links).
 * Shift+click / middle-click on an app = another window in Desktop mode, like the old pages.
 * Open: parent.__hubFly.openFromCat (same-origin Hub, as the Start flyout does); otherwise a
 * {type:'hub-open-app', url, name} message to the Hub (file://, as T1 / category pages do);
 * standalone (no Hub) a friendly message with a link to the Hub.
 * Theme: html.light + --accent from localStorage sites-hub.theme / sites-hub.accent, live via the
 * 'storage' event and a {type:'hub-prefs'} message. All text goes in with textContent.
 */
(function () {
  'use strict';
  const ROOT = '../../../';
  const IS_FILE = location.protocol === 'file:';
  const FAV = 'Favorite';
  const $ = (id) => document.getElementById(id);
  const view = $('view');

  // ---- theme (same keys as Settings / Disk) ----
  function theme() {
    const r = document.documentElement;
    const get = (k) => { try { return localStorage.getItem('sites-hub.' + k) || ''; } catch (_) { return ''; } };
    const acc = get('accent');
    if (/^#[0-9a-f]{6}$/i.test(acc)) r.style.setProperty('--accent', acc); else r.style.removeProperty('--accent');
    r.classList.toggle('light', get('theme') === 'light');
  }
  theme();
  window.addEventListener('storage', (e) => { if (!e.key || e.key.indexOf('sites-hub.') === 0) theme(); });
  window.addEventListener('message', (e) => {
    if (!IS_FILE && e.origin !== location.origin) return;
    if (e.data && e.data.type === 'hub-prefs') theme();
  });
  window.addEventListener('focus', theme);

  // ---- Hub link ----
  function hubWin() {
    if (window.parent === window) return null;
    try { return window.parent.__hubFly ? window.parent : null; } catch (_) { return null; }
  }
  const inHub = window.parent !== window;

  // ---- data ----
  function joinPath(dir, rel) {   // as hub_flyout.js: resolve '..', folders end in '/'
    const out = [];
    (dir + rel).split('/').forEach((p, i, all) => {
      if (p === '..') out.pop();
      else if (p !== '.' && (p !== '' || i === all.length - 1)) out.push(p);
    });
    let u = out.join('/');
    if (!/\.[a-z0-9]+$/i.test(u) && !u.endsWith('/')) u += '/';
    return u;
  }
  function categories() {
    const rows = String(window.HUB_APPS_CSV || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l[0] !== '#');
    const head = (rows.shift() || '').split(',').map((s) => s.trim().toUpperCase());
    const ix = (k) => head.indexOf(k);
    const map = window.HUB_CAT_CSV || {};
    const cats = [];
    rows.forEach((l) => {
      const c = l.split(',').map((s) => s.trim());
      const cat = c[ix('CATEGORY')], name = c[ix('NAME')], page = c[ix('ENTRY_URL')] || '';
      if (!cat || name !== cat + ' Page' || c[ix('HIDDEN')] === '1' || cat === FAV || !map[cat]) return;
      cats.push({ name: cat, order: +c[ix('ORDER')] || 0, icon: page.replace(/\.html$/i, '_icon.png') });
    });
    return cats.sort((a, b) => a.order - b.order);
  }
  const cache = {};
  function csvText(cat) {
    const path = (window.HUB_CAT_CSV || {})[cat];
    const fallback = () => (window.SITES_CSV && window.SITES_CSV[cat]) || '';
    if (!path) return Promise.resolve('');
    if (IS_FILE || !window.fetch) return Promise.resolve(fallback());
    return fetch(ROOT + path, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .catch(fallback);
  }
  function load(cat) {
    if (cache[cat]) return cache[cat];
    const path = (window.HUB_CAT_CSV || {})[cat] || '';
    const dir = path.replace(/[^/]*$/, '');
    cache[cat] = csvText(cat).then((text) => {
      const T = window.TilesCsv;
      if (!T || !text) return [];
      return T.parse(text).map((a) => {
        const entryUrl = joinPath(dir, a.path);
        return { name: a.name, entryUrl, newTab: !!a.newTab, section: a.section || '',
          icon: a.icon ? joinPath(dir, a.icon) : T.defaultIcon(entryUrl), cat };
      }).filter((a) => a.name && a.entryUrl);
    });
    return cache[cat];
  }

  // ---- open an app ----
  let msgT = 0;
  function say(text, link) {
    const m = $('msg');
    m.textContent = text;
    if (link) {
      m.appendChild(document.createTextNode(' '));
      const a = document.createElement('a'); a.href = ROOT + 'hub.html'; a.textContent = link; m.appendChild(a);
    }
    m.hidden = false; clearTimeout(msgT); msgT = setTimeout(() => { m.hidden = true; }, 6000);
  }
  function openApp(app, newInstance) {
    const hub = hubWin();
    if (hub) { hub.__hubFly.openFromCat(app.cat, app.entryUrl, app.name, app.newTab, { newInstance: !!newInstance }); return; }
    if (inHub) {
      const url = new URL(ROOT + app.entryUrl, location.href).href;
      try { window.parent.postMessage({ type: 'hub-open-app', url, name: app.name, newInstance: !!newInstance }, IS_FILE ? '*' : location.origin); return; } catch (_) { /* fall through */ }
    }
    say('App Hub opens apps inside the Hub. Open the Hub to launch \u201C' + app.name + '\u201D:', 'Open the Hub');
  }

  // ---- drawing ----
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function icon(src, name, cls) {
    const box = el('span', 'ic ' + (cls || ''));
    box.setAttribute('aria-hidden', 'true');
    const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => { img.remove(); box.classList.add('letter'); box.textContent = (name || '?').trim().charAt(0).toUpperCase(); });
    img.src = ROOT + src;
    box.appendChild(img);
    return box;
  }
  function appCard(app) {
    const b = el('button', 'card app');
    b.type = 'button';
    b.dataset.entry = app.entryUrl;
    b.title = 'Open ' + app.name;
    b.appendChild(icon(app.icon, app.name));
    b.appendChild(el('span', 'nm', app.name));
    b.addEventListener('click', (e) => openApp(app, e.shiftKey));   // AH2: Shift+click / middle-click = another window (Desktop), as on the category pages
    b.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    b.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); openApp(app, true); } });
    return b;
  }
  function catCard(cat, count) {
    const b = el('button', 'card cat');
    b.type = 'button';
    b.dataset.cat = cat.name;
    b.setAttribute('aria-label', cat.name + ', ' + count + (count === 1 ? ' app' : ' apps'));
    b.appendChild(icon(cat.icon, cat.name, 'big'));
    const t = el('span', 'txt');
    t.appendChild(el('span', 'nm', cat.name));
    t.appendChild(el('span', 'ct', count + (count === 1 ? ' app' : ' apps')));
    b.appendChild(t);
    b.addEventListener('click', () => go(cat.name));
    return b;
  }
  function section(title, cls) {
    const s = el('section', 'sec ' + (cls || ''));
    if (title) { const h = el('h2', null, title); s.appendChild(h); }
    const g = el('div', 'grid');
    g.setAttribute('role', 'list');
    s.appendChild(g);
    return { s, g };
  }
  function add(g, card) { const li = el('div', 'li'); li.setAttribute('role', 'listitem'); li.appendChild(card); g.appendChild(li); }

  let token = 0, page = null;
  /** AH3: File-Explorer-style breadcrumb: "App Hub" (the title on home) or "App Hub › <Category>".
   *  Every part but the last is a button; the last is plain text (aria-current), the page's h1. */
  function crumbs(cat) {
    const ol = $('crumbs');
    ol.textContent = '';
    const li = (child, sep) => { const x = el('li'); if (sep) x.className = 'sep'; x.appendChild(child); ol.appendChild(x); };
    const cur = (text) => { const h = el('h1', 'crumb cur', text); h.setAttribute('aria-current', 'page'); return h; };
    if (!cat) { li(cur('App Hub')); return; }
    const up = el('button', 'crumb up', 'App Hub');
    up.type = 'button';
    up.title = 'Go to the App Hub main page';
    up.addEventListener('click', back);
    li(up);
    const s = el('span', null, '\u203A'); s.setAttribute('aria-hidden', 'true');
    li(s, true);
    li(cur(cat.name));
  }
  function setTop(cat) {
    crumbs(cat);
    $('top-icon').src = cat ? ROOT + cat.icon : 'apphub_icon.png';
    document.title = cat ? cat.name + ' - App Hub' : 'App Hub';
  }
  async function home(focusCat) {
    const my = ++token;
    page = null;
    setTop(null);
    const cats = categories();
    const [favs, lists] = await Promise.all([load(FAV), Promise.all(cats.map((c) => load(c.name)))]);
    if (my !== token) return;
    view.textContent = '';
    view.className = 'home';
    const f = section('Favourites', 'favs');
    f.g.classList.add('row');
    if (favs.length) favs.forEach((a) => add(f.g, appCard(a)));
    else f.s.appendChild(el('p', 'muted', 'No favourites yet.'));
    view.appendChild(f.s);
    const c = section('Categories', 'cats');
    cats.forEach((cat, i) => add(c.g, catCard(cat, lists[i].length)));
    view.appendChild(c.s);
    if (focusCat) { const b = view.querySelector('.card.cat[data-cat="' + CSS.escape(focusCat) + '"]'); if (b) b.focus(); }
  }
  async function category(name) {
    const cat = categories().find((c) => c.name === name);
    if (!cat) { say('There is no category \u201C' + name + '\u201D.'); history.replaceState(null, '', location.pathname + location.search); home(); return; }
    const my = ++token;
    const kb = !!document.activeElement && document.activeElement !== document.body;
    page = cat.name;
    setTop(cat);
    const list = await load(cat.name);
    if (my !== token) return;
    view.textContent = '';
    view.className = 'catpage';
    view.appendChild(el('p', 'muted count', list.length + (list.length === 1 ? ' app' : ' apps')));
    if (!list.length) view.appendChild(el('p', 'muted', 'No apps here yet.'));
    const groups = list.length ? window.TilesCsv.groups(list) : [];
    groups.forEach((gr) => {
      const named = groups.length > 1 || gr.section;
      const s = section(named ? (gr.section || 'Other') : '', 'apps');
      gr.apps.forEach((a) => add(s.g, appCard(a)));
      view.appendChild(s.s);
    });
    const first = view.querySelector('.card');
    if (first && kb) first.focus();
  }

  // ---- routing ----
  let pushed = false;   // a category page was opened from home in this document (Back = history.back)
  function hashCat() {
    const m = /^#cat=(.+)$/.exec(location.hash);
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (_) { return ''; }
  }
  function route() {
    const cat = hashCat();
    const was = page;
    if (cat) category(cat); else home(was);
  }
  function go(name) { pushed = true; location.hash = 'cat=' + encodeURIComponent(name); }
  function back() {
    if (!page) return;
    if (pushed) { pushed = false; history.back(); return; }
    const was = page;
    history.replaceState(null, '', location.pathname + location.search);
    home(was);
  }
  window.addEventListener('hashchange', route);

  // ---- keyboard: arrows move between cards, Escape / Backspace / Alt+Left go back ----
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if ((e.key === 'Escape' || e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) && page) { e.preventDefault(); back(); return; }
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = dirs[e.key];
    if (!d || e.altKey || e.ctrlKey || e.metaKey) return;
    const cards = Array.from(view.querySelectorAll('.card'));
    if (!cards.length) return;
    e.preventDefault();
    const cur = cards.indexOf(document.activeElement);
    if (cur < 0) { cards[0].focus(); return; }
    const r0 = cards[cur].getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bestD = Infinity;
    cards.forEach((c, i) => {
      if (i === cur) return;
      const r = c.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
      const along = dx * d[0] + dy * d[1];
      if (along <= 4) return;
      const across = Math.abs(d[0] ? dy : dx);
      const score = along + across * 3;
      if (score < bestD) { bestD = score; best = c; }
    });
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  });

  route();
})();
