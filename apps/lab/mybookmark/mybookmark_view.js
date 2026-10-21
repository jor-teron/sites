/* ============================================================
   FILE: mybookmark_view.js
   PROJECT: MyBookmark
   ROLE: Drawing — folder tree, breadcrumb, cards / list, favicons, search highlight.
     MBView.items(S)  → the nodes to show for state S (folder or search, filter, sort)
     MBView.tree(S), MBView.crumbs(S), MBView.list(S, items)
   S = state from mybookmark_logic.js {folder, query, domain, sort, view, edit, sel:Set, open:Set}
   ============================================================ */
const MBView = (() => {
  const D = MBData, $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  /* ---------- what to show ---------- */
  function matches(S) {
    const q = S.query.toLowerCase(), out = [];
    const folderHit = new Map();   // folder id → its path contains the query
    const inPath = (id) => {
      if (folderHit.has(id)) return folderHit.get(id);
      const n = D.node(id); const v = !!n && n.id !== D.ROOT && (n.title.toLowerCase().includes(q) || inPath(n.parent));
      folderHit.set(id, v); return v;
    };
    for (const n of D.all()) {
      if (n.id === D.ROOT) continue;
      if (n.type === 'folder') { if (n.title.toLowerCase().includes(q)) out.push(n); }
      else if (n.title.toLowerCase().includes(q) || n.url.toLowerCase().includes(q) || inPath(n.parent)) out.push(n);
    }
    return out;
  }
  function items(S) {
    if (S.dupes) {   // duplicates review: each group = the kept (oldest) one, then the others
      const g = D.dupGroups(S.dupes.scope === 'here' ? S.folder : null);
      S.groups = g; S.domains = []; S.total = g.reduce((a, x) => a + 1 + x.others.length, 0);
      return g.flatMap((x) => [x.keep].concat(x.others));
    }
    let list = S.query ? matches(S) : D.kids(S.folder).slice();
    const bms = list.filter((n) => n.type === 'bm');
    S.domains = countDomains(bms);
    if (S.domain) list = list.filter((n) => n.type === 'bm' && D.domain(n.url) === S.domain);   // a site filter shows bookmarks only
    const by = {
      name: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
      date: (a, b) => (b.added || 0) - (a.added || 0),
      domain: (a, b) => (a.type === 'bm' ? D.domain(a.url) : '').localeCompare(b.type === 'bm' ? D.domain(b.url) : '') || by.name(a, b),
    };
    const f = list.filter((n) => n.type === 'folder').sort(S.sort === 'date' ? by.date : by.name);
    const b = list.filter((n) => n.type === 'bm').sort(by[S.sort] || by.name);
    S.total = f.length + b.length;
    return f.concat(b).slice(0, MB_CONFIG.maxResults);
  }
  function countDomains(bms) {
    const m = new Map(); bms.forEach((n) => { const d = D.domain(n.url); if (d) m.set(d, (m.get(d) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  /* ---------- tree ---------- */
  function tree(S) {
    const box = $('tree'); box.textContent = '';
    const ul = el('ul'); ul.setAttribute('role', 'tree');
    ul.appendChild(treeNode(S, D.node(D.ROOT), 0));
    box.appendChild(ul);
  }
  function treeNode(S, n, depth) {
    const li = el('li'); li.setAttribute('role', 'treeitem');
    const subs = D.kids(n.id).filter((k) => k.type === 'folder').sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
    const open = n.id === D.ROOT || S.open.has(n.id);
    const row = el('div', 'trow' + (n.id === S.folder && !S.query ? ' on' : ''));
    row.dataset.id = n.id;
    const caret = el('button', 'caret' + (subs.length ? '' : ' leaf'), subs.length ? (open ? '▾' : '▸') : '');
    caret.type = 'button'; caret.tabIndex = -1; caret.dataset.toggle = n.id;
    caret.setAttribute('aria-label', open ? 'Collapse' : 'Expand');
    if (n.id === D.ROOT) caret.classList.add('leaf');
    const name = el('button', 'tname'); name.type = 'button'; name.dataset.folder = n.id;
    name.appendChild(el('span', null, (n.id === D.ROOT ? '📚 ' : '📁 ') + n.title));
    name.appendChild(el('span', 'count', String(D.count(n.id))));
    if (S.edit && n.id !== D.ROOT) row.draggable = true;
    row.appendChild(caret); row.appendChild(name); li.appendChild(row);
    if (subs.length && open) {
      li.setAttribute('aria-expanded', 'true');
      const ul = el('ul'); ul.setAttribute('role', 'group');
      subs.forEach((s) => ul.appendChild(treeNode(S, s, depth + 1)));
      li.appendChild(ul);
    } else if (subs.length) li.setAttribute('aria-expanded', 'false');
    return li;
  }

  /* ---------- breadcrumb ---------- */
  function crumbs(S) {
    const box = $('crumbs'); box.textContent = '';
    if (S.dupes) { box.appendChild(el('span', 'here', 'Duplicates' + (S.dupes.scope === 'here' ? ' in “' + D.node(S.folder).title + '”' : ' in all folders'))); return; }
    if (S.query) { box.appendChild(el('span', 'here', 'Search: “' + S.query + '”')); return; }
    const p = D.path(S.folder);
    p.forEach((n, i) => {
      if (i) box.appendChild(el('span', 'sep', '›'));
      if (i === p.length - 1) box.appendChild(el('span', 'here', n.title));
      else { const b = el('button', null, n.title); b.type = 'button'; b.dataset.folder = n.id; box.appendChild(b); }
    });
  }

  /* ---------- favicon ---------- */
  const COLORS = ['#4f6bed', '#e4572e', '#17a589', '#8e44ad', '#d68910', '#2e86c1', '#c0392b', '#16a085', '#7d6608', '#5d6d7e'];
  function tile(n) {
    const d = D.domain(n.url) || n.title || '?';
    let h = 0; for (const c of d) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const t = el('span', 'tile', (d.replace(/^www\./, '')[0] || '?'));
    t.style.background = COLORS[h % COLORS.length];
    t.setAttribute('aria-hidden', 'true');
    return t;
  }
  function favicon(n) {
    let src = n.icon || null;
    if (!src) { try { const u = new URL(n.url); if (/^https?:$/.test(u.protocol)) src = u.origin + '/favicon.ico'; } catch (_) { /* not a URL */ } }
    if (!src) return tile(n);
    const img = el('img', 'fav'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.replaceWith(tile(n)), { once: true });
    img.src = src;
    return img;
  }

  /* ---------- text with <mark> around the query ---------- */
  function hl(text, q) {
    const span = el('span');
    if (!q) { span.textContent = text; return span; }
    const low = text.toLowerCase(), ql = q.toLowerCase(); let i = 0, j;
    while ((j = low.indexOf(ql, i)) >= 0) {
      if (j > i) span.appendChild(document.createTextNode(text.slice(i, j)));
      span.appendChild(el('mark', null, text.slice(j, j + q.length)));
      i = j + q.length;
    }
    if (i < text.length) span.appendChild(document.createTextNode(text.slice(i)));
    return span;
  }

  /* ---------- cards / list ---------- */
  function list(S, nodes) {
    const box = $('items'); box.textContent = '';
    box.className = 'items ' + (S.view === 'list' || S.dupes ? 'list' : 'cards');
    if (!nodes.length) {
      box.appendChild(el('div', 'empty', S.dupes ? 'No duplicates left.' : S.query ? 'Nothing matches “' + S.query + '”.' : D.count(D.ROOT) ? 'This folder is empty.' : 'No bookmarks yet. Import a bookmarks .html file (Import, or drop it here) or press Edit → + Bookmark.'));
      return;
    }
    const frag = document.createDocumentFragment();
    const keepIds = S.dupes ? new Set(S.groups.map((g) => g.keep.id)) : null;
    nodes.forEach((n, i) => {
      if (keepIds && keepIds.has(n.id)) {   // group header before each kept bookmark
        const g = S.groups.find((x) => x.keep.id === n.id);
        const h = el('div', 'group-head', g.key.replace(/^https?:\/\/(www\.)?/, '') + ' · ' + (g.others.length + 1) + ' copies');
        frag.appendChild(h);
      }
      const isF = n.type === 'folder';
      const a = el(isF || S.edit ? 'div' : 'a', 'item' + (S.sel.has(n.id) ? ' sel' : ''));
      a.dataset.id = n.id; a.dataset.i = i; a.tabIndex = 0;
      if (isF) a.setAttribute('role', 'button');
      if (!isF && !S.edit) { a.href = n.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      if (S.edit) {
        const c = el('input', 'chk'); c.type = 'checkbox'; c.checked = S.sel.has(n.id); c.tabIndex = -1; c.setAttribute('aria-label', 'Select ' + n.title);
        a.appendChild(c); a.draggable = true;
      }
      if (isF) a.appendChild(el('span', 'folder-ico', '📁')); else a.appendChild(favicon(n));
      const txt = el('span', 'txt');
      const t = hl(n.title, S.query); t.className = 'title'; txt.appendChild(t);
      let subText;
      const showPath = S.query || S.dupes;
      if (isF) subText = D.count(n.id) + ' bookmarks' + (S.query ? ' · ' + D.path(n.parent).map((p) => p.title).join(' › ') : '');
      else subText = (showPath ? n.url.replace(/^https?:\/\/(www\.)?/, '') : (D.domain(n.url) || n.url)) + (showPath ? ' · ' + (n.added ? new Date(n.added).toISOString().slice(0, 10) + ' · ' : '') + D.path(n.parent).map((p) => p.title).join(' › ') : '');
      const sub = hl(subText, S.query); sub.className = 'sub'; txt.appendChild(sub);
      a.title = isF ? n.title : n.title + '\n' + n.url;
      a.appendChild(txt);
      if (keepIds && keepIds.has(n.id)) { a.appendChild(el('span', 'badge keep', 'Keep')); a.classList.add('kept'); }
      else if (!isF && D.isDup(n)) a.appendChild(el('span', 'badge', 'duplicate'));
      if (S.edit) { const e = el('button', 'edit-btn', isF ? 'Rename' : 'Edit'); e.type = 'button'; e.dataset.edit = n.id; a.appendChild(e); }
      frag.appendChild(a);
    });
    box.appendChild(frag);
  }
  return { items, tree, crumbs, list, favicon };
})();
