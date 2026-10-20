/*
 * Hub menu flyout (hub/menu/hub_flyout.js) — GNOME 2 style cascading menu, DESKTOP MOUSE ONLY.
 *
 * Hovering a category row in the open Hub menu (~100 ms) opens a second column beside the
 * menu with that category's apps, read from its own CSV (window.HUB_CAT_CSV in hub_config.js,
 * parsed by window.TilesCsv from shared/tiles/tiles.js — the same parser the category pages use).
 * - Apps are grouped by the CSV's optional section column (TilesCsv.groups): small grey
 *   headings with a thin divider between groups; no sections in the CSV = plain list.
 * - The column grows up to the viewport height; scrollbar hidden (wheel still scrolls) and a
 *   soft fade at the bottom edge while more apps are below.
 * - Diagonal grace zone: while the mouse travels from the row towards the column (inside the
 *   triangle "last point → column's left edge") other rows don't steal the flyout.
 * - Clicking an app opens it like a category-page tile (window.__hubFly.openFromCat in hub.js).
 *   Shift+click / middle-click = a new window of it (Desktop mode instances).
 * - Clicking the category row itself still opens its category page (hub.js, unchanged).
 * - Favorite: your own favorites (shared/favorites/favorites.js) are added under "My favorites".
 * - Touch / pen / phones: nothing here runs — only when (hover:hover) and (pointer:fine) match
 *   AND the event's pointerType is 'mouse'. A tap stays a tap.
 * - Keyboard / D-pad: untouched (hub.js menuKey); any key press just hides the flyout.
 * - R16c: built lists are cached in localStorage 'sites-hub.startList' (see loadCat below).
 * - R33a: window.HubStartList {cached(cat), load(cat)} hands the same lists to hub.js, which
 *   registers every CSV app (hash ids, last app, session restore, __hubOpenApp).
 * Look in hub_main.css (.menu-fly).
 */
(function () {
  'use strict';
  const menu = document.getElementById('menu');
  const host = menu && menu.parentElement;           // .header-left (menu scrolls, so the flyout is its sibling)
  const MQ = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;
  if (!menu || !host || !MQ || !window.fetch) return;

  const OPEN_DELAY = 100;    // ms hover before a row opens its flyout
  const CLOSE_DELAY = 350;   // ms after the mouse leaves menu + flyout
  const GRACE_MAX = 5;       // max re-checks while heading for the flyout (5 × 100 ms)

  const fly = document.createElement('div');
  fly.id = 'menu-fly';
  fly.className = 'menu-fly';
  fly.setAttribute('role', 'menu');
  fly.hidden = true;
  host.appendChild(fly);

  const csvCache = {};       // cat → Promise<[{name, entryUrl, icon, newTab}]>
  let curRow = null;         // row whose flyout is shown
  let openTimer = 0, closeTimer = 0, graceTries = 0;
  let last = null, anchor = null;   // mouse points (anchor = where it left curRow)

  const isMouse = (e) => MQ.matches && e.pointerType === 'mouse';
  const catOf = (row) => row && row.dataset.cat;
  const hasFly = (row) => !!(row && window.HUB_CAT_CSV && window.HUB_CAT_CSV[catOf(row)]);

  /** "a/b/../c/" → "a/c/"; folders keep (or get) a trailing slash. */
  function joinPath(dir, rel) {
    const out = [];
    (dir + rel).split('/').forEach((p, i, all) => {
      if (p === '..') out.pop();
      else if (p !== '.' && (p !== '' || i === all.length - 1)) out.push(p);
    });
    let u = out.join('/');
    if (!/\.[a-z0-9]+$/i.test(u) && !u.endsWith('/')) u += '/';
    return u;
  }

  // ---- R16c: cached Start list (localStorage 'sites-hub.startList') ----
  // {apps: hash of HUB_APPS_CSV, cats: {cat: {h: hash of its CSV text, list}}}. A cached list
  // shows at once; the CSV is still read in the background and the list is rebuilt (and the
  // open flyout redrawn) only when its hash changed. hub_apps.js changed → whole cache dropped.
  const LS = 'sites-hub.startList';
  const hash = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + '.' + t.length; };
  const appsHash = hash(String(window.HUB_APPS_CSV || ''));
  let store = null;
  try { store = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (_) { store = null; }
  if (!store || store.apps !== appsHash || !store.cats) store = { apps: appsHash, cats: {} };
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(store)); } catch (_) { /* full / blocked */ } };
  const fresh = {};          // cat → background CSV check done this page load

  function build(cat, text) {
    const dir = window.HUB_CAT_CSV[cat].replace(/[^/]*$/, '');
    return window.TilesCsv.parse(text).map((a) => {
      const entryUrl = joinPath(dir, a.path);
      return {
        name: a.name, entryUrl, newTab: !!a.newTab, section: a.section,
        icon: a.icon ? joinPath(dir, a.icon).replace(/\/$/, '') : window.TilesCsv.defaultIcon(entryUrl)
      };
    });
  }
  /** Read the CSV; rebuild + save only when it changed. → Promise<list | null> */
  function check(cat) {
    if (fresh[cat]) return fresh[cat];
    fresh[cat] = fetch(window.HUB_CAT_CSV[cat], { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then((t) => {
        const h = hash(t), had = store.cats[cat];
        if (had && had.h === h) return had.list;
        const list = build(cat, t);
        store.cats[cat] = { h, list };
        save();
        csvCache[cat] = Promise.resolve(list);
        window.dispatchEvent(new CustomEvent('hub-startlist', { detail: { cat, rebuilt: true } }));
        if (had && curRow && catOf(curRow) === cat && !fly.hidden) show(curRow);   // redraw the open flyout
        return list;
      })
      .catch(() => { delete fresh[cat]; return null; });
    return fresh[cat];
  }
  function loadCat(cat) {
    if (csvCache[cat]) return csvCache[cat];
    const had = store.cats[cat];
    if (had) { csvCache[cat] = Promise.resolve(had.list); check(cat); return csvCache[cat]; }
    csvCache[cat] = check(cat).then((l) => { if (!l) delete csvCache[cat]; return l; });
    return csvCache[cat];
  }
  // R33a: the same lists for hub.js (apps come from the category CSVs; hub_apps.js keeps only the
  // categories). cached(cat) → list | null at once (sites-hub.startList); load(cat) → Promise<list | null>.
  window.HubStartList = { cached: (cat) => (store.cats[cat] ? store.cats[cat].list : null), load: loadCat };
  window.dispatchEvent(new Event('hub-startlist-ready'));   // R33b: hub.js starts its lookups now

  // warm every category once the Hub is idle, so the first Start → hover is instant
  const warm = () => Object.keys(window.HUB_CAT_CSV || {}).forEach((c) => loadCat(c));
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 2000));
  if (document.readyState === 'complete') setTimeout(() => idle(warm), 2000);
  else window.addEventListener('load', () => setTimeout(() => idle(warm), 2000), { once: true });

  /** Favorite category: the CSV apps + your own (shared/favorites/favorites.js) under "My favorites". */
  const FAV_CAT = 'Favorite';
  function withFavorites(cat, list) {
    const F = window.HubFavorites;
    if (cat !== FAV_CAT || !F) return list;
    const base = list || [];
    const mine = F.list().filter((f) => !base.some((a) => a.entryUrl === f.path)).map((f) => ({
      name: f.name, entryUrl: f.path, newTab: !!f.newTab, section: 'My favorites',
      icon: f.icon || window.TilesCsv.defaultIcon(f.path)
    }));
    return mine.length ? base.concat(mine) : list;
  }
  // a change while the Favorite flyout is open: draw it again
  window.addEventListener('hub-favorites', () => { if (curRow && catOf(curRow) === FAV_CAT && !fly.hidden) show(curRow); });

  function item(cat, a) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fly-app';
    b.dataset.entryUrl = a.entryUrl;                 // right-click menu (hub_ctx_menus.js)
    if (a.newTab) b.dataset.newTab = '1';
    b.setAttribute('role', 'menuitem');
    b.tabIndex = -1;   // keyboard stays in the main menu (hub.js)
    const img = document.createElement('img');
    img.className = 'icon'; img.alt = ''; img.loading = 'lazy'; img.src = a.icon;
    img.addEventListener('error', () => {
      const l = document.createElement('span');
      l.className = 'icon letter'; l.textContent = a.name[0].toUpperCase();
      img.replaceWith(l);
    });
    const n = document.createElement('span');
    n.textContent = a.name;
    b.append(img, n);
    if (a.newTab) b.title = 'Opens in a new tab';
    const go = (newInstance) => {
      hide();
      if (window.__hubFly) window.__hubFly.openFromCat(cat, a.entryUrl, a.name, a.newTab, { newInstance });
    };
    b.addEventListener('click', (e) => { e.stopPropagation(); go(!!e.shiftKey); });
    b.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    b.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); go(true); } });
    return b;
  }

  /** Put the flyout beside the menu, top aligned with the row, kept on screen (up to full height). */
  function place(row) {
    const h = host.getBoundingClientRect(), m = menu.getBoundingClientRect(), r = row.getBoundingClientRect();
    fly.style.left = (m.right - h.left + 4) + 'px';
    const tb = document.getElementById('wm-taskbar');   // Desktop mode taskbar (wm_taskbar.js), bottom or top
    const tr = tb && tb.offsetHeight ? tb.getBoundingClientRect() : null;
    const tbTop = !!tr && tr.top < window.innerHeight / 2;
    const bottom = tr && !tbTop ? tr.top : window.innerHeight;
    const hdr = document.getElementById('header');
    const topMin = Math.max(hdr ? hdr.getBoundingClientRect().bottom : h.bottom, tbTop ? tr.bottom : 0) + 2;   // below the Hub bar / top taskbar
    fly.style.maxHeight = Math.max(120, bottom - topMin - 6) + 'px';
    const maxTop = bottom - fly.offsetHeight - 6;
    fly.style.top = (Math.max(topMin, Math.min(r.top - 7, maxTop)) - h.top) + 'px';
  }

  function show(row) {
    const cat = catOf(row);
    if (curRow) curRow.classList.remove('fly-on');
    curRow = row;
    row.classList.add('fly-on');
    anchor = null; graceTries = 0;
    loadCat(cat).then((csvList) => {
      if (curRow !== row || !menu.classList.contains('open')) return;
      const list = withFavorites(cat, csvList);
      fly.replaceChildren();
      const head = document.createElement('div');
      head.className = 'fly-head';
      head.textContent = cat;
      fly.appendChild(head);
      if (!list || !list.length) {
        const msg = document.createElement('div');
        msg.className = 'fly-msg';
        msg.textContent = list ? 'No apps yet' : 'Could not load the app list';
        fly.appendChild(msg);
      } else {
        window.TilesCsv.groups(list).forEach((g) => {
          if (g.section) {
            const sec = document.createElement('div');
            sec.className = 'fly-sec';
            sec.textContent = g.section;
            fly.appendChild(sec);
          }
          g.apps.forEach((a) => fly.appendChild(item(cat, a)));
        });
      }
      const again = !fly.hidden;
      fly.hidden = false;
      fly.scrollTop = 0;
      place(row);
      fade();
      if (!again) { fly.classList.remove('pop'); void fly.offsetWidth; fly.classList.add('pop'); }
    });
  }

  /** Soft fade at the bottom edge while more apps are below. */
  function fade() {
    fly.classList.toggle('more', fly.scrollTop + fly.clientHeight < fly.scrollHeight - 2);
  }
  fly.addEventListener('scroll', fade, { passive: true });

  function hide() {
    cancel(); clearTimeout(closeTimer);
    if (curRow) curRow.classList.remove('fly-on');
    curRow = null; anchor = null;
    fly.hidden = true;
    fly.classList.remove('pop');
  }

  /** Is p inside triangle a-b-c? */
  function inTri(p, a, b, c) {
    const s = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
    const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  }
  /** Mouse is on its way from curRow into the open flyout (diagonal grace zone). */
  function headingToFly() {
    if (fly.hidden || !anchor || !last) return false;
    const f = fly.getBoundingClientRect();
    return inTri(last, anchor, { x: f.left, y: f.top - 8 }, { x: f.left, y: f.bottom + 8 });
  }

  /** Hover target changed to row (null = a row without a flyout); opens after OPEN_DELAY. */
  let pending;               // row the open timer is waiting for (undefined = none)
  function cancel() { clearTimeout(openTimer); openTimer = 0; pending = undefined; }
  function want(row) {
    if (openTimer && pending === row) return;   // already waiting for this row
    cancel();
    pending = row;
    openTimer = setTimeout(function check() {
      if (!menu.classList.contains('open')) { cancel(); return; }
      if (headingToFly() && graceTries++ < GRACE_MAX) { openTimer = setTimeout(check, OPEN_DELAY); return; }
      cancel();
      if (row && hasFly(row)) show(row);
      else hide();
    }, OPEN_DELAY);
  }

  menu.addEventListener('pointermove', (e) => {
    if (!isMouse(e)) return;
    const prev = last;
    last = { x: e.clientX, y: e.clientY };
    clearTimeout(closeTimer);
    const row = e.target.closest ? e.target.closest('.menu-cat, .home-item, button.app') : null;
    if (row && row === curRow) { anchor = null; graceTries = 0; cancel(); return; }
    if (curRow && !anchor) anchor = prev || last;   // the point where the mouse left the open row
    want(row && row.classList.contains('menu-cat') ? row : null);
  });
  fly.addEventListener('pointermove', (e) => {
    if (!isMouse(e)) return;
    last = { x: e.clientX, y: e.clientY };
    clearTimeout(closeTimer); cancel();
    anchor = null; graceTries = 0;
  });
  const leave = (e) => {
    if (!isMouse(e) || fly.hidden) return;
    const to = e.relatedTarget;
    if (to && (menu.contains(to) || fly.contains(to))) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(hide, CLOSE_DELAY);
  };
  menu.addEventListener('pointerleave', leave);
  fly.addEventListener('pointerleave', leave);
  fly.addEventListener('click', (e) => e.stopPropagation());

  // Keys drive hub.js's menu; the mouse flyout just gets out of the way.
  document.addEventListener('keydown', (e) => {   // any key hides it, except a held modifier (Shift+click = new window)
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
    if (!fly.hidden || openTimer) hide();
  }, true);
  // Menu closed (any way) → flyout closes too.
  new MutationObserver(() => { if (!menu.classList.contains('open') && (curRow || openTimer)) hide(); })
    .observe(menu, { attributes: true, attributeFilter: ['class', 'hidden'] });
  // Rows with a flyout get a › arrow (CSS shows it on mouse devices only).
  const markRows = () => menu.querySelectorAll('.menu-cat').forEach((r) => r.classList.toggle('has-fly', hasFly(r)));
  markRows();   // hub.js (loaded first) has already drawn the menu
  menu.addEventListener('scroll', () => { if (curRow && !fly.hidden) place(curRow); });
  window.addEventListener('resize', hide);
})();
