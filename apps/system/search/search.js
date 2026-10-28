/*
 * Hub Search (apps/system/search/search.js), H48 — live search over the Hub's apps and Hub items.
 *
 * Sources:
 *   apps        hub/core/hub_appindex.js (id → [category, entry, name, icon, newTab, description?]) right
 *               away, then every category CSV (hub_config.js HUB_CAT_CSV, read with TilesCsv.parse like
 *               the App Hub; hub_catalog.js SITES_CSV on file:// and as the fallback) for sections and the
 *               optional description (H48c adds the CSV column; absent = ''). One row per entry; an app
 *               listed in Favorite keeps its real category.
 *   categories  hub_apps.js "<Category> Page" rows (not hidden, not Favorite) → App Hub #cat=<name>.
 *   settings    search_items.js → Settings #<section>[/<sub>].
 *   actions     search_items.js, run on parent.HubWM; only inside the Hub in Desktop mode.
 *   windows     parent.__hubTasks (wm_windows.js) list / focus; only inside the Hub in Desktop mode.
 * Matching: every word of the query must match (name, category, section, description, words);
 * a name hit scores higher than a category / description hit. Empty query = open windows, actions,
 * Settings pages and categories to browse.
 * Results are grouped (Apps, Settings, Categories, Hub actions, Open windows), live as you type.
 * Keys: ↑ / ↓ move, Enter opens (Shift+Enter: an app in another window), Esc clears (then blurs),
 * Home / End on the list. Click / tap opens; middle-click / Shift+click = another window.
 * Open: parent.__hubFly.openFromCat (same as the Start flyout / App Hub); Settings and App Hub via
 * parent.__hubOpenApp(entry, {hash}); other frames / file:// a {type:'hub-open-app'} message;
 * standalone (no Hub) the page is opened in this tab.
 * All text goes in with textContent.
 */
(function () {
  'use strict';
  const ROOT = '../../../';
  const IS_FILE = location.protocol === 'file:';
  const FAV = 'Favorite';
  const SETTINGS = 'apps/system/settings/', APPHUB = 'apps/system/apphub/';
  const MAX_APPS = 40;
  const $ = (id) => document.getElementById(id);
  const q = $('q'), out = $('results'), countEl = $('count');
  const ITEMS = window.HUB_SEARCH_ITEMS || { settings: [], actions: [] };

  // ---- Hub link (same origin only; null when standalone or cross-origin) ----
  const inHub = window.parent !== window;
  function hub() {
    if (!inHub) return null;
    try { return window.parent.__hubFly ? window.parent : null; } catch (_) { return null; }
  }
  function wm() {   // the Hub's window manager, only when it is in Desktop mode
    const h = hub();
    try { return h && h.HubWM && h.HubMode && h.HubMode.isDesktop() ? h.HubWM : null; } catch (_) { return null; }
  }
  function tasks() { const h = hub(); try { return wm() && h.__hubTasks ? h.__hubTasks : null; } catch (_) { return null; } }

  // ---- data: apps ----
  function joinPath(dir, rel) {   // as hub_flyout.js / apphub.js: resolve '..', folders end in '/'
    const o = [];
    (dir + rel).split('/').forEach((p, i, all) => {
      if (p === '..') o.pop();
      else if (p !== '.' && (p !== '' || i === all.length - 1)) o.push(p);
    });
    let u = o.join('/');
    if (!/\.[a-z0-9]+$/i.test(u) && !u.endsWith('/')) u += '/';
    return u;
  }
  const apps = new Map();   // entryUrl → { name, entryUrl, cat, section, icon, newTab, desc }
  function putApp(a) {
    const old = apps.get(a.entryUrl);
    if (!old) { apps.set(a.entryUrl, a); return; }
    // keep the real category over Favorite; fill section / description / icon when missing
    if (old.cat === FAV && a.cat !== FAV) { old.cat = a.cat; old.section = a.section || old.section; }
    else if (!old.section && a.section && a.cat === old.cat) old.section = a.section;
    if (!old.desc && a.desc) old.desc = a.desc;
    if (!old.icon && a.icon) old.icon = a.icon;
  }
  function fromIndex() {
    const idx = window.HUB_APP_INDEX || {};
    Object.keys(idx).forEach((id) => {
      const r = idx[id];
      if (!Array.isArray(r) || !r[1] || !r[2]) return;
      putApp({ name: String(r[2]), entryUrl: String(r[1]), cat: String(r[0] || ''), section: '', icon: String(r[3] || ''), newTab: !!r[4], desc: String(r[5] || '') });
    });
  }
  function csvText(cat, path) {
    const fallback = () => (window.SITES_CSV && window.SITES_CSV[cat]) || '';
    if (IS_FILE || !window.fetch) return Promise.resolve(fallback());
    return fetch(ROOT + path, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .catch(fallback);
  }
  function fromCsvs() {
    const map = window.HUB_CAT_CSV || {}, T = window.TilesCsv;
    if (!T) return Promise.resolve();
    // real categories first, Favorite last, so a favourite keeps its own category and section
    const cats = Object.keys(map).sort((a, b) => (a === FAV) - (b === FAV));
    return Promise.all(cats.map((cat) => csvText(cat, map[cat]).then((text) => ({ cat, text }))))
      .then((all) => all.forEach(({ cat, text }) => {
        if (!text) return;
        const dir = map[cat].replace(/[^/]*$/, '');
        T.parse(text).forEach((a) => {
          if (!a.name || !a.path) return;
          const entryUrl = joinPath(dir, a.path);
          putApp({ name: a.name, entryUrl, cat, section: a.section || '', newTab: !!a.newTab,
            icon: a.icon ? joinPath(dir, a.icon) : T.defaultIcon(entryUrl), desc: a.description || '' });   // description: H48c (optional)
        });
      }))
      .catch(() => { /* keep the index list */ });
  }

  // ---- data: categories ----
  function categories() {
    const rows = String(window.HUB_APPS_CSV || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l[0] !== '#');
    const head = (rows.shift() || '').split(',').map((s) => s.trim().toUpperCase());
    const ix = (k) => head.indexOf(k);
    const out = [];
    rows.forEach((l) => {
      const c = l.split(',').map((s) => s.trim());
      const cat = c[ix('CATEGORY')], name = c[ix('NAME')], page = c[ix('ENTRY_URL')] || '';
      if (!cat || name !== cat + ' Page' || c[ix('HIDDEN')] === '1' || cat === FAV) return;
      out.push({ name: cat, order: +c[ix('ORDER')] || 0, icon: page.replace(/\.html$/i, '_icon.png') });
    });
    return out.sort((a, b) => a.order - b.order);
  }

  // ---- matching ----
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const words = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
  /** Score one item for the query words: 0 = no match. fields: { name, more: [[text, weight]] } */
  function score(qw, name, more) {
    const n = norm(name), nw = words(name);
    let total = 0;
    for (const w of qw) {
      let s = 0;
      if (n === w) s = 100;
      else if (n.startsWith(w)) s = 80;
      else if (nw.some((x) => x.startsWith(w))) s = 60;
      else if (n.replace(/[^a-z0-9]/g, '').includes(w)) s = 40;
      else {
        for (const [text, wt] of more) {
          const t = norm(text);
          if (!t) continue;
          if (words(text).some((x) => x.startsWith(w))) s = Math.max(s, wt);
          else if (t.includes(w)) s = Math.max(s, wt / 2);
        }
      }
      if (!s) return 0;
      total += s;
    }
    return total;
  }

  // ---- open / run ----
  let msgT = 0;
  function say(text) {
    const m = $('msg');
    m.textContent = text;
    m.hidden = false; clearTimeout(msgT); msgT = setTimeout(() => { m.hidden = true; }, 5000);
  }
  function postOpen(entryUrl, name, newInstance) {
    const url = new URL(ROOT + entryUrl, location.href).href;
    try { window.parent.postMessage({ type: 'hub-open-app', url, name, newInstance: !!newInstance }, IS_FILE ? '*' : location.origin); return true; } catch (_) { return false; }
  }
  function openApp(app, newInstance) {
    const h = hub();
    if (h) { h.__hubFly.openFromCat(app.cat, app.entryUrl, app.name, app.newTab, { newInstance: !!newInstance }); return; }
    if (inHub && postOpen(app.entryUrl, app.name, newInstance)) return;
    if (app.newTab) window.open(ROOT + app.entryUrl, '_blank', 'noopener'); else location.href = ROOT + app.entryUrl;
  }
  function openWithHash(entry, hash) {   // Settings #section[/sub], App Hub #cat=…
    const h = hub();
    if (h && h.__hubOpenApp) { h.__hubOpenApp(entry, { hash }); return; }
    location.href = ROOT + entry + '#' + hash;
  }
  function runAction(id) {
    const W = wm();
    if (!W) { say('Hub actions work inside the Hub in Desktop mode.'); return; }
    if (id === 'showdesk') W.minimiseAll();
    else if (id === 'ws1' || id === 'ws2') W.setWs(id === 'ws1' ? 1 : 2);
  }

  // ---- results ----
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  /** Text with the query words marked (<mark>, built with text nodes only). */
  function marked(text, qw) {
    const span = el('span');
    const t = String(text || ''), low = norm(t);
    if (!qw.length || low.length !== t.length) { span.textContent = t; return span; }
    const hits = [];
    qw.forEach((w) => { let i = low.indexOf(w); while (i >= 0) { hits.push([i, i + w.length]); i = low.indexOf(w, i + w.length); } });
    hits.sort((a, b) => a[0] - b[0]);
    let at = 0;
    hits.forEach(([a, b]) => {
      if (a < at) a = at;
      if (b <= a) return;
      if (a > at) span.appendChild(document.createTextNode(t.slice(at, a)));
      span.appendChild(el('mark', null, t.slice(a, b)));
      at = b;
    });
    if (at < t.length) span.appendChild(document.createTextNode(t.slice(at)));
    return span;
  }
  function iconBox(src, emoji, name) {
    const box = el('span', 'ic');
    box.setAttribute('aria-hidden', 'true');
    const letter = () => { box.textContent = ''; box.classList.add('letter'); box.textContent = (name || '?').trim().charAt(0).toUpperCase(); };
    if (emoji) { box.classList.add('emoji'); box.textContent = emoji; return box; }
    if (!src) { letter(); return box; }
    const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', letter);
    img.src = /^(https?:|data:|blob:)/.test(src) ? src : ROOT + src;
    box.appendChild(img);
    return box;
  }

  let flat = [], sel = -1;
  function row(r, qw) {
    const b = el('button', 'res');
    b.type = 'button';
    b.id = 'r' + flat.length;
    b.setAttribute('role', 'option');
    b.tabIndex = -1;
    b.appendChild(iconBox(r.icon, r.emoji, r.name));
    const t = el('span', 'txt');
    const nm = el('span', 'nm'); nm.appendChild(marked(r.name, qw)); t.appendChild(nm);
    if (r.sub) { const s = el('span', 'sub'); s.appendChild(marked(r.sub, qw)); t.appendChild(s); }
    if (r.desc) { const d = el('span', 'desc'); d.appendChild(marked(r.desc, qw)); t.appendChild(d); }
    b.appendChild(t);
    if (r.kind) b.appendChild(el('span', 'kind', r.kind));
    const i = flat.length;
    b.addEventListener('click', (e) => go(i, e.shiftKey));
    b.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    b.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); go(i, true); } });
    b.addEventListener('mousemove', () => { if (sel !== i) pick(i, false); });
    flat.push({ r, b });
    return b;
  }
  function group(title, list, qw) {
    if (!list.length) return;
    const s = el('section', 'grp');
    s.setAttribute('role', 'group');
    s.setAttribute('aria-label', title);
    s.appendChild(el('h2', null, title));
    list.forEach((r) => s.appendChild(row(r, qw)));
    out.appendChild(s);
  }
  function pick(i, scroll) {
    if (!flat.length) { sel = -1; q.removeAttribute('aria-activedescendant'); return; }
    sel = Math.max(0, Math.min(flat.length - 1, i));
    flat.forEach((f, k) => { f.b.classList.toggle('on', k === sel); f.b.setAttribute('aria-selected', k === sel ? 'true' : 'false'); });
    q.setAttribute('aria-activedescendant', flat[sel].b.id);
    if (scroll !== false) flat[sel].b.scrollIntoView({ block: 'nearest' });
  }
  function go(i, alt) {
    const f = flat[i];
    if (!f) return;
    f.r.run(!!alt);
  }

  function windowsList() {
    const T = tasks();
    if (!T) return [];
    let me = 0;
    try { me = T.idOf(window); } catch (_) { me = 0; }
    let list = [];
    try { list = T.list(); } catch (_) { list = []; }
    return list.filter((w) => w.id !== me).map((w) => ({
      name: w.name, icon: w.icon, sub: (w.min ? 'Minimised' : w.hidden ? 'Workspace ' + w.ws : w.active ? 'Focused' : 'Open') + (w.wsCount > 1 ? ' \u00B7 workspace ' + w.ws : ''),
      words: w.title || '', kind: 'Window', run: () => { try { T.focus(w.id); } catch (_) { /* gone */ } }
    }));
  }
  function actionsList() {
    const W = wm();
    if (!W) return [];
    const two = (() => { try { return W.wsCount() > 1; } catch (_) { return false; } })();
    return ITEMS.actions.filter((a) => (a.id === 'ws1' || a.id === 'ws2') ? two && W.ws !== (a.id === 'ws1' ? 1 : 2) : true)
      .map((a) => ({ name: a.name, emoji: a.icon, words: a.words, kind: 'Action', run: () => runAction(a.id) }));
  }
  function settingsList() {
    return ITEMS.settings.map((s) => ({ name: s.name, emoji: s.icon, sub: s.where, words: s.words, kind: 'Settings', top: s.where === 'Settings',
      run: () => openWithHash(SETTINGS, s.hash) }));
  }
  function catsList() {
    return categories().map((c) => {
      const n = Array.from(apps.values()).filter((a) => a.cat === c.name).length;
      return { name: c.name, icon: c.icon, sub: 'Category' + (n ? ' \u00B7 ' + n + (n === 1 ? ' app' : ' apps') : ''), words: 'category apps', kind: 'Category',
        run: () => openWithHash(APPHUB, 'cat=' + encodeURIComponent(c.name)) };
    });
  }
  function appsList() {
    return Array.from(apps.values()).map((a) => ({
      name: a.name, icon: a.icon, sub: a.cat + (a.section ? ' \u203A ' + a.section : ''), desc: a.desc, cat: a.cat, section: a.section,
      kind: 'App', run: (alt) => openApp(a, alt)
    }));
  }
  /** Matching rows, best first; each row keeps its score in r.score. Whole query at the start of the
   *  name ('show desk' → Show desktop) gets a bonus so it beats rows that only match word by word. */
  function filter(list, qw, weights) {
    const whole = qw.join(' ');
    return list.map((r) => {
      let s = score(qw, r.name, weights(r));
      if (s && qw.length > 1 && words(r.name).join(' ').startsWith(whole)) s += 50;
      r.score = s;
      return r;
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  function draw() {
    const text = q.value;
    const qw = words(text);
    $('clear').hidden = !text;
    out.textContent = '';
    flat = [];
    let more = 0;
    if (!qw.length) {
      group('Open windows', windowsList(), qw);
      group('Hub actions', actionsList(), qw);
      group('Settings', settingsList().filter((s) => s.top), qw);
      group('Categories', catsList(), qw);
      countEl.textContent = apps.size ? 'Type to search ' + apps.size + ' apps, Settings and the Hub.' : 'Loading apps\u2026';
    } else {
      const ap = filter(appsList(), qw, (r) => [[r.cat, 30], [r.section, 30], [r.desc, 20]]);
      if (ap.length > MAX_APPS) { more = ap.length - MAX_APPS; ap.length = MAX_APPS; }
      // groups in this order, but a group whose best row scores higher moves up (Enter = best row)
      const groups = [
        ['Apps', ap],
        ['Settings', filter(settingsList(), qw, (r) => [[r.words, 30]])],   // not r.sub: 'Settings › …' would match every option
        ['Categories', filter(catsList(), qw, (r) => [[r.words, 10]])],
        ['Hub actions', filter(actionsList(), qw, (r) => [[r.words, 30]])],
        ['Open windows', filter(windowsList(), qw, (r) => [[r.words, 10]])]   // r.words = the page title
      ];
      const top = (g) => (g[1][0] ? g[1][0].score : 0);
      groups.map((g, i) => ({ g, i })).sort((a, b) => top(b.g) - top(a.g) || a.i - b.i).forEach(({ g }) => group(g[0], g[1], qw));
      if (!flat.length) {
        const p = el('p', 'none');
        p.textContent = 'Nothing found for \u201C' + text.trim() + '\u201D.';
        out.appendChild(p);
      }
      countEl.textContent = flat.length ? (flat.length + (flat.length === 1 ? ' result' : ' results') + (more ? ' (' + more + ' more apps, type more to narrow)' : '')) : '';
    }
    q.setAttribute('aria-expanded', flat.length ? 'true' : 'false');
    pick(qw.length ? 0 : -1, true);
    if (!qw.length) { flat.forEach((f) => f.b.classList.remove('on')); sel = -1; q.removeAttribute('aria-activedescendant'); }
  }

  // ---- input + keys ----
  let t = 0;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 40); });
  $('clear').addEventListener('click', () => { q.value = ''; draw(); q.focus(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); pick(sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); pick(sel - 1); }
    else if (e.key === 'PageDown') { e.preventDefault(); pick(sel + 5); }
    else if (e.key === 'PageUp') { e.preventDefault(); pick(sel - 5); }
    else if (e.key === 'Enter') { e.preventDefault(); clearTimeout(t); if (!flat.length || sel < 0) draw(); go(sel < 0 ? 0 : sel, e.shiftKey); }
    else if (e.key === 'Escape') { if (q.value) { e.preventDefault(); e.stopPropagation(); q.value = ''; draw(); } else q.blur(); }
  });
  // typing anywhere goes to the box
  document.addEventListener('keydown', (e) => {
    if (e.target === q || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1 || e.key === 'Backspace') q.focus();
  });
  // focus the box when the window is focused / the page is shown again
  window.addEventListener('focus', () => { if (document.activeElement !== q) q.focus({ preventScroll: true }); });
  window.addEventListener('pageshow', () => q.focus({ preventScroll: true }));

  // live: windows / workspace changes in the Hub redraw (debounced)
  let liveT = 0;
  const redrawSoon = () => { clearTimeout(liveT); liveT = setTimeout(draw, 120); };
  try { const T = hub() && hub().__hubTasks; if (T) T.onChange(redrawSoon); } catch (_) { /* no Hub */ }
  try { const h = hub(); if (h) { h.addEventListener('hub-wm-ws', redrawSoon); h.addEventListener('hub-wm-mode', redrawSoon); } } catch (_) { /* no Hub */ }

  // ?q=… prefills (e.g. a later taskbar button, H48b)
  try { const pre = new URLSearchParams(location.search).get('q'); if (pre) q.value = pre; } catch (_) { /* old browser */ }
  fromIndex();
  draw();
  q.focus();
  fromCsvs().then(draw);
})();
