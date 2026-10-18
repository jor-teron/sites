/*
 * Shared category tiles page (shared/tiles/tiles.js). Reads the CSV named in <body data-csv>
 * and draws one square tile per app, grouped by section. Used by every category page
 * (Favorite, Games, Media, Office, Connectivity, Tools, Lab).
 *
 * CSV: name, path, icon, newtab, section   (# comments; blank lines ignored)
 *   - A header row starting with "name, path" is optional; when present, columns are found by
 *     header name (any order), so old 3- or 4-column CSVs without "section" still work.
 *   - path / icon are relative to the CSV's folder. Empty icon = <folder>/<folder>_icon.png
 *     (file x/name.ext → x/name_icon.png); a missing image shows the first letter instead.
 *   - newtab 1 = own tab on a desktop Hub (a phone joined to the Hub keeps it in the frame).
 *   - section: optional group name, per category (never shared). Sections appear in order of
 *     first appearance; apps without one go last under "Other". No sections at all = no headings.
 *
 * Also loaded by hub.html (no #grid there): it then only shares the reader as
 * window.TilesCsv = { parse, groups, defaultIcon } for the Hub menu flyout (hub/hub_flyout.js).
 */
(function () {
  'use strict';
  const grid = document.getElementById('grid'), msg = document.getElementById('msg');
  const COLS = ['name', 'path', 'icon', 'newtab', 'section'];   // default order (no header row)

  function parse(text) {
    const rows = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l[0] !== '#')
      .map((l) => l.split(',').map((c) => c.trim()));
    let cols = COLS;
    if (rows.length && rows[0][0].toLowerCase() === 'name' && (rows[0][1] || '').toLowerCase() === 'path') {
      cols = rows.shift().map((h) => h.toLowerCase());
    }
    const at = (r, k) => { const i = cols.indexOf(k); return i >= 0 ? r[i] || '' : ''; };
    return rows.filter((r) => at(r, 'name') && at(r, 'path')).map((r) => ({
      name: at(r, 'name'), path: at(r, 'path'), icon: at(r, 'icon'),
      newTab: at(r, 'newtab') === '1', section: at(r, 'section')
    }));
  }
  /** Apps → [{ section, apps }] in first-appearance order; unsectioned last as "Other".
   *  When no app has a section: one group with section '' (draw no heading). */
  function groups(list) {
    const map = new Map(), rest = [];
    list.forEach((a) => {
      if (!a.section) { rest.push(a); return; }
      if (!map.has(a.section)) map.set(a.section, []);
      map.get(a.section).push(a);
    });
    const out = Array.from(map, ([section, apps]) => ({ section, apps }));
    if (rest.length) out.push({ section: out.length ? 'Other' : '', apps: rest });
    return out;
  }
  function defaultIcon(path) {
    if (path.endsWith('/')) { const f = path.slice(0, -1).split('/').pop(); return path + f + '_icon.png'; }
    return path.replace(/\.[^./]+$/, '') + '_icon.png';
  }
  window.TilesCsv = { parse: parse, groups: groups, defaultIcon: defaultIcon };
  if (!grid) return;   // Hub page: reader only, no tiles grid

  function letter(name) {
    const d = document.createElement('span'); d.className = 'letter'; d.textContent = name[0].toUpperCase(); return d;
  }
  function tile(app) {
    const a = document.createElement('a'); a.className = 'tile'; a.href = app.path;
    let remote = false;
    try { remote = !!(window.parent !== window && window.parent.__hubRemote); } catch (_) { /* cross-origin */ }
    if (app.newTab && !remote) { a.target = '_blank'; a.rel = 'noopener'; }
    const img = document.createElement('img'); img.alt = ''; img.src = app.icon || defaultIcon(app.path);
    img.onerror = () => img.replaceWith(letter(app.name));
    const n = document.createElement('span'); n.className = 'name'; n.textContent = app.name;
    a.append(img, n); return a;
  }
  /** Section heading: small grey title + thin divider; spans the whole grid row. */
  function heading(text) {
    const h = document.createElement('h2'); h.className = 'sec'; h.textContent = text; return h;
  }
  function render(list) {
    const out = [];
    groups(list).forEach((g) => {
      if (g.section) out.push(heading(g.section));
      g.apps.forEach((a) => out.push(tile(a)));
    });
    grid.replaceChildren(...out);
  }
  const CSV = document.body.dataset.csv || 'apps.csv';
  fetch(CSV, { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then((t) => render(parse(t)))
    .catch(() => { msg.hidden = false; msg.textContent = 'Could not load ' + CSV + ' (open this page over http, not file://).'; });
})();
