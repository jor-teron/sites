/*
 * Hub menu flyout (desktop/menu/hub_flyout.js) — GNOME 2 style cascading menu, DESKTOP MOUSE ONLY.
 *
 * H150 (sections step): category → sections → apps.
 * H156: when a category has only one section (e.g. Favourites, whose CSV section cells are
 *   all empty so everything lands in a single "Other"), skip the section column and show
 *   that category's apps directly in the next column, as before H150. Two or more sections
 *   are unchanged.
 * Hovering a category row in the open Hub menu (~100 ms) opens a second column beside the
 * menu with ONLY that category's sections (one row each: "Puzzle (12)" ›), read from its own CSV
 * (window.HUB_CAT_CSV in hub_config.js, parsed by window.TilesCsv from shared/tiles/tiles.js).
 * Hovering (or clicking) a section row (~100 ms) opens a third column (#menu-fly-apps) beside the
 * section column, aligned with that row, with only that section's apps.
 * - Sections keep the CSV order; apps with no section go into a last "Other"; Favorite shows
 *   "My favorites" first. Grouping is the pure window.HubFlyout.sectionsOf(list) (hub/tests).
 * - (before H150) apps were grouped in one column by TilesCsv.groups with small grey headings.
 * - Both columns grow up to the viewport height; scrollbar hidden (wheel still scrolls) and a
 *   soft fade at the bottom edge while more rows are below.
 * - Diagonal grace zone: while the mouse travels from the row towards the column (inside the
 *   triangle "last point → column's left edge") other rows don't steal the flyout. H150: the
 *   same for section row → apps column. Back on another category row = switch + apps column closes.
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
 * Styles: desktop/menu/hub_flyout.css (.menu-fly, .fly-row, .menu-fly-apps).
 * (before H150) Look in hub_main.css (.menu-fly).
 */
(function () {
  'use strict';
  const FAV_SEC = 'My favorites';
  /** H150: apps → [{section, apps}] for the sections step. Pure (no DOM, no TilesCsv): sections in
   *  CSV (first-appearance) order, apps with no section in a last "Other", "My favorites" first.
   *  No apps → []. */
  function sectionsOf(list) {
    const map = new Map(), rest = [];
    (list || []).forEach((a) => {
      const sec = a && a.section ? String(a.section).trim() : '';
      if (!sec) { rest.push(a); return; }
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec).push(a);
    });
    const out = Array.from(map, ([section, apps]) => ({ section, apps }));
    const fav = out.findIndex((g) => g.section === FAV_SEC);
    if (fav > 0) out.unshift(out.splice(fav, 1)[0]);
    if (rest.length) {
      const oi = out.findIndex((g) => g.section === 'Other');   // a CSV "Other" section: merge, keep it last
      const other = oi >= 0 ? out.splice(oi, 1)[0] : { section: 'Other', apps: [] };
      other.apps = other.apps.concat(rest);
      out.push(other);
    }
    return out;
  }
  /** H156: one section only → skip the section column and show those apps directly. */
  function skipSectionStep(groups) {
    return !!(groups && groups.length === 1);
  }
  // (before H156) window.HubFlyout = { sectionsOf };
  window.HubFlyout = { sectionsOf, skipSectionStep };

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
  // H150: third column, the apps of the hovered section (sibling of fly, same .menu-fly look)
  const appsCol = document.createElement('div');
  appsCol.id = 'menu-fly-apps';
  appsCol.className = 'menu-fly menu-fly-apps';
  appsCol.setAttribute('role', 'menu');
  appsCol.hidden = true;
  host.appendChild(appsCol);

  const csvCache = {};       // cat → Promise<[{name, entryUrl, icon, newTab}]>
  let curRow = null;         // row whose flyout is shown
  let openTimer = 0, closeTimer = 0, graceTries = 0;
  let last = null, anchor = null;   // mouse points (anchor = where it left curRow)
  let curSec = null, secAnchor = null, secTimer = 0, secTries = 0, secPending;   // H150: section row → apps column

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
        description: a.description || '',   // H48c: optional CSV description (hub.js → hub_appindex.js, Search)
        icon: a.icon ? joinPath(dir, a.icon).replace(/\/$/, '') : window.TilesCsv.defaultIcon(entryUrl)
      };
    });
  }
  /** Read the CSV; rebuild + save only when it changed. → Promise<list | null> */
  function check(cat) {
    if (fresh[cat]) return fresh[cat];
    // R47: hub_catalog.js (window.SITES_CSV, generated from the CSVs) is the no-server copy. file:// →
    // use it at once (fetch of local files is blocked); http(s) → fetch the CSV as before and use the
    // catalog only if the fetch fails, so online behaviour is unchanged and CSV edits show at once.
    const built = window.SITES_CSV && typeof window.SITES_CSV[cat] === 'string' ? window.SITES_CSV[cat] : null;
    const read = (location.protocol === 'file:' && built != null) ? Promise.resolve(built)
      : fetch(window.HUB_CAT_CSV[cat], { cache: 'no-cache' })
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
        .catch((e) => { if (built != null) return built; throw e; });
    fresh[cat] = read
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
  const FAV_CAT = 'Favorite';   // (H150: its "My favorites" section name is FAV_SEC, top)
  function withFavorites(cat, list) {
    const F = window.HubFavorites;
    if (cat !== FAV_CAT || !F) return list;
    const base = list || [];
    const mine = F.list().filter((f) => !base.some((a) => a.entryUrl === f.path)).map((f) => ({
      name: f.name, entryUrl: f.path, newTab: !!f.newTab, section: FAV_SEC,
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
    placeAt(fly, menu.getBoundingClientRect().right + 4, row);   // H150: shared with the apps column
  }
  /** H150: apps column right of the section column, top aligned with the section row. */
  function placeApps(secRow) {
    placeAt(appsCol, fly.getBoundingClientRect().right + 4, secRow, true);
  }
  /** col at viewport x, top aligned with row, kept on screen (clampX: also keep it inside the width). */
  function placeAt(col, x, row, clampX) {
    const h = host.getBoundingClientRect(), r = row.getBoundingClientRect();
    // (before H150) fly.style.left = (m.right - h.left + 4) + 'px';
    const tb = document.getElementById('wm-taskbar');   // Desktop mode taskbar (wm_taskbar.js), bottom or top
    const tr = tb && tb.offsetHeight ? tb.getBoundingClientRect() : null;
    const tbTop = !!tr && tr.top < window.innerHeight / 2;
    const bottom = tr && !tbTop ? tr.top : window.innerHeight;
    const hdr = document.getElementById('header');
    const topMin = Math.max(hdr ? hdr.getBoundingClientRect().bottom : h.bottom, tbTop ? tr.bottom : 0) + 2;   // below the Hub bar / top taskbar
    col.style.maxHeight = Math.max(120, bottom - topMin - 6) + 'px';
    const maxTop = bottom - col.offsetHeight - 6;
    col.style.top = (Math.max(topMin, Math.min(r.top - 7, maxTop)) - h.top) + 'px';
    if (clampX) x = Math.max(0, Math.min(x, window.innerWidth - col.offsetWidth - 4));
    col.style.left = (x - h.left) + 'px';
  }

  /** H150: one section row: name, "(count)", › (CSS). Hover / click opens its apps column. */
  function secRow(cat, g) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fly-row';
    b.dataset.sec = g.section;
    b.setAttribute('role', 'menuitem');
    b.setAttribute('aria-haspopup', 'menu');
    b.tabIndex = -1;   // keyboard stays in the main menu (hub.js)
    const n = document.createElement('span');
    n.className = 'fly-row-name';
    n.textContent = g.section;
    const c = document.createElement('span');
    c.className = 'fly-row-count';
    c.textContent = '(' + g.apps.length + ')';
    b.append(n, c);
    b._fly = { cat, apps: g.apps };
    b.addEventListener('click', (e) => { e.stopPropagation(); cancelSec(); showSec(b); });
    return b;
  }

  /** H150: open the apps column for a section row (already open → nothing to do). */
  function showSec(row) {
    if (!row || !row._fly || fly.hidden || !fly.contains(row)) return;
    if (row === curSec && !appsCol.hidden) return;
    if (curSec) curSec.classList.remove('fly-on');
    curSec = row;
    row.classList.add('fly-on');
    secAnchor = null; secTries = 0;
    const { cat, apps } = row._fly;
    appsCol.replaceChildren();
    const head = document.createElement('div');
    head.className = 'fly-head';
    head.textContent = row.dataset.sec;
    appsCol.appendChild(head);
    apps.forEach((a) => appsCol.appendChild(item(cat, a)));
    const again = !appsCol.hidden;
    appsCol.hidden = false;
    appsCol.scrollTop = 0;
    placeApps(row);
    fade(appsCol);
    if (!again) { appsCol.classList.remove('pop'); void appsCol.offsetWidth; appsCol.classList.add('pop'); }
  }
  function hideApps() {
    cancelSec();
    if (curSec) curSec.classList.remove('fly-on');
    curSec = null; secAnchor = null; secTries = 0;
    appsCol.hidden = true;
    appsCol.classList.remove('pop');
  }

  function show(row) {
    const cat = catOf(row);
    if (curRow) curRow.classList.remove('fly-on');
    if (curRow !== row) hideApps();   // H150: another category → its apps column closes
    curRow = row;
    row.classList.add('fly-on');
    anchor = null; graceTries = 0;
    loadCat(cat).then((csvList) => {
      if (curRow !== row || !menu.classList.contains('open')) return;
      const list = withFavorites(cat, csvList);
      const keep = curSec && fly.dataset.cat === cat ? curSec.dataset.sec : null;   // H150: a redraw keeps the open section
      hideApps();
      fly.dataset.cat = cat;
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
        // (before H150) window.TilesCsv.groups(list).forEach((g) => { if (g.section) fly.appendChild(<div.fly-sec>g.section); g.apps.forEach((a) => fly.appendChild(item(cat, a))); });
        // (before H156) sectionsOf(list).forEach((g) => fly.appendChild(secRow(cat, g)));
        const groups = sectionsOf(list);
        if (skipSectionStep(groups)) {
          // H156: one section only — apps go in this column, no section rows
          groups[0].apps.forEach((a) => fly.appendChild(item(cat, a)));
        } else {
          groups.forEach((g) => fly.appendChild(secRow(cat, g)));
        }
      }
      const again = !fly.hidden;
      fly.hidden = false;
      fly.scrollTop = 0;
      place(row);
      fade();
      if (!again) { fly.classList.remove('pop'); void fly.offsetWidth; fly.classList.add('pop'); }
      if (keep != null) {
        const back = Array.prototype.find.call(fly.querySelectorAll('.fly-row'), (r) => r.dataset.sec === keep);
        if (back) showSec(back);
      }
    });
  }

  /** Soft fade at the bottom edge while more apps are below. */
  function fade(col) {
    const el = col || fly;   // H150: either column
    el.classList.toggle('more', el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }
  // (before H150) fly.addEventListener('scroll', fade, { passive: true });
  fly.addEventListener('scroll', () => { fade(); if (curSec && !appsCol.hidden) placeApps(curSec); }, { passive: true });
  appsCol.addEventListener('scroll', () => fade(appsCol), { passive: true });

  function hide() {
    cancel(); clearTimeout(closeTimer);
    hideApps();   // H150
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

  /** H150: mouse is on its way from curSec into the open apps column. */
  function headingToApps() {
    if (appsCol.hidden || !secAnchor || !last) return false;
    const f = appsCol.getBoundingClientRect();
    return inTri(last, secAnchor, { x: f.left, y: f.top - 8 }, { x: f.left, y: f.bottom + 8 });
  }
  function cancelSec() { clearTimeout(secTimer); secTimer = 0; secPending = undefined; }
  /** H150: hover target in the section column changed to a section row (null = none); after OPEN_DELAY. */
  function wantSec(row) {
    if (secTimer && secPending === row) return;
    cancelSec();
    secPending = row;
    secTimer = setTimeout(function check() {
      if (!menu.classList.contains('open') || fly.hidden) { cancelSec(); return; }
      if (headingToApps() && secTries++ < GRACE_MAX) { secTimer = setTimeout(check, OPEN_DELAY); return; }
      cancelSec();
      if (row) showSec(row);
      else hideApps();
    }, OPEN_DELAY);
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
    cancelSec();   // H150
    const row = e.target.closest ? e.target.closest('.menu-cat, .home-item, button.app') : null;
    if (row && row === curRow) { anchor = null; graceTries = 0; cancel(); return; }
    if (curRow && !anchor) anchor = prev || last;   // the point where the mouse left the open row
    want(row && row.classList.contains('menu-cat') ? row : null);
  });
  fly.addEventListener('pointermove', (e) => {
    if (!isMouse(e)) return;
    const prev = last;   // H150
    last = { x: e.clientX, y: e.clientY };
    clearTimeout(closeTimer); cancel();
    anchor = null; graceTries = 0;
    // H150: section rows open the apps column (same delay + diagonal grace zone as category rows)
    const sec = e.target.closest ? e.target.closest('.fly-row') : null;
    if (sec && sec === curSec) { secAnchor = null; secTries = 0; cancelSec(); return; }
    if (curSec && !secAnchor) secAnchor = prev || last;   // where the mouse left the open section row
    wantSec(sec);
  });
  appsCol.addEventListener('pointermove', (e) => {   // H150
    if (!isMouse(e)) return;
    last = { x: e.clientX, y: e.clientY };
    clearTimeout(closeTimer); cancel(); cancelSec();
    anchor = null; graceTries = 0; secAnchor = null; secTries = 0;
  });
  const leave = (e) => {
    if (!isMouse(e) || fly.hidden) return;
    const to = e.relatedTarget;
    // (before H150) if (to && (menu.contains(to) || fly.contains(to))) return;
    if (to && (menu.contains(to) || fly.contains(to) || appsCol.contains(to))) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(hide, CLOSE_DELAY);
  };
  menu.addEventListener('pointerleave', leave);
  fly.addEventListener('pointerleave', leave);
  appsCol.addEventListener('pointerleave', leave);   // H150
  fly.addEventListener('click', (e) => e.stopPropagation());
  appsCol.addEventListener('click', (e) => e.stopPropagation());   // H150

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
  // (before H150) menu.addEventListener('scroll', () => { if (curRow && !fly.hidden) place(curRow); });
  menu.addEventListener('scroll', () => {
    if (curRow && !fly.hidden) place(curRow);
    if (curSec && !appsCol.hidden) placeApps(curSec);   // H150
  });
  window.addEventListener('resize', hide);
})();
