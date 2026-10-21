/* ============================================================
   FILE: mybookmark_data.js
   PROJECT: MyBookmark
   ROLE: The bookmark tree in memory + every change (each change is saved through MBStore).
     MBData.load(), .node(id), .kids(id), .path(id), .count(id), .all()
     .addFolder(parent, title), .addBookmark(parent, {title, url}), .update(id, fields)
     .move(ids, parent) → moved count, .remove(ids)
     .importTree(tree, {into:'new'|'merge', dups:'skip'|'flag', name}) → {added, folders, skipped, flagged, folderId}
     .exportTree(id) → nested items for MBNetscape.build
     .migrateLegacy() → number of bookmarks copied from the old Bookmark Manager (once)
   ============================================================ */
const MBData = (() => {
  const C = MB_CONFIG, ROOT = C.rootId;
  const nodes = new Map();
  let kidsIdx = null;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* Same page = same URL after dropping the #hash, a trailing slash and host case. */
  function normUrl(u) {
    try {
      const x = new URL(u);
      x.hash = '';
      let s = x.protocol + '//' + x.host.toLowerCase() + x.pathname.replace(/\/+$/, '') + x.search;
      return s;
    } catch (_) { return String(u || '').trim().toLowerCase(); }
  }
  function domain(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; } }

  function index() {
    kidsIdx = new Map();
    for (const n of nodes.values()) {
      if (n.id === ROOT) continue;
      if (!kidsIdx.has(n.parent)) kidsIdx.set(n.parent, []);
      kidsIdx.get(n.parent).push(n);
    }
    for (const list of kidsIdx.values()) list.sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  const kids = (id) => { if (!kidsIdx) index(); return kidsIdx.get(id) || []; };
  const node = (id) => nodes.get(id);
  function path(id) { const out = []; let n = nodes.get(id); while (n) { out.unshift(n); n = n.parent ? nodes.get(n.parent) : null; } return out; }
  const countCache = new Map();
  function count(id) {
    if (countCache.has(id)) return countCache.get(id);
    let c = 0; for (const k of kids(id)) c += k.type === 'bm' ? 1 : count(k.id);
    countCache.set(id, c); return c;
  }
  const changed = () => { kidsIdx = null; countCache.clear(); };
  const nextOrder = (parent) => { const k = kids(parent); return k.length ? (k[k.length - 1].order || 0) + 1 : 0; };
  function isInside(id, folder) { let n = nodes.get(folder); while (n) { if (n.id === id) return true; n = nodes.get(n.parent); } return false; }

  async function load() {
    await MBStore.open();
    nodes.clear();
    for (const n of await MBStore.all()) nodes.set(n.id, n);
    if (!nodes.has(ROOT)) { const r = { id: ROOT, type: 'folder', parent: null, title: 'All bookmarks', order: 0 }; nodes.set(ROOT, r); await MBStore.put([r]); }
    /* orphans (parent missing) go to the root */
    const fix = [];
    for (const n of nodes.values()) if (n.id !== ROOT && !nodes.has(n.parent)) { n.parent = ROOT; fix.push(n); }
    await MBStore.put(fix);
    changed();
  }
  async function save(list) { list.forEach((n) => nodes.set(n.id, n)); changed(); await MBStore.put(list); }

  async function addFolder(parent, title) {
    const n = { id: uid(), type: 'folder', parent, title, added: Date.now(), order: nextOrder(parent) };
    await save([n]); return n;
  }
  async function addBookmark(parent, f) {
    const n = { id: uid(), type: 'bm', parent, title: f.title || f.url, url: f.url, added: Date.now(), order: nextOrder(parent) };
    await save([n]); return n;
  }
  async function update(id, f) { const n = { ...nodes.get(id), ...f }; await save([n]); return n; }
  async function move(ids, parent) {
    const list = []; let o = nextOrder(parent);
    for (const id of ids) {
      const n = nodes.get(id);
      if (!n || id === ROOT || n.parent === parent) continue;
      if (n.type === 'folder' && isInside(id, parent)) continue;   // not into itself
      list.push({ ...n, parent, order: o++ });
    }
    await save(list); return list.length;
  }
  async function remove(ids) {
    const gone = new Set();
    (function walk(list) { for (const id of list) { if (id === ROOT || gone.has(id)) continue; gone.add(id); walk(kids(id).map((k) => k.id)); } })(ids);
    gone.forEach((id) => nodes.delete(id)); changed();
    await MBStore.del([...gone]); return gone.size;
  }

  async function importTree(tree, opt) {
    const st = { added: 0, folders: 0, skipped: 0, flagged: 0, folderId: ROOT };
    const known = new Set([...nodes.values()].filter((n) => n.type === 'bm').map((n) => normUrl(n.url)));
    const out = []; const local = new Map();   // folder id → kids added here (for merge lookups)
    const kidsOf = (id) => (local.get(id) || []).concat(kids(id));
    let base = ROOT, order = nextOrder(ROOT);
    if (opt.into === 'new') {
      const f = { id: uid(), type: 'folder', parent: ROOT, title: opt.name, added: Date.now(), order: order++ };
      out.push(f); base = f.id; st.folderId = f.id; st.folders++;
    }
    const orders = new Map();
    const ord = (p) => { const v = orders.has(p) ? orders.get(p) : (p === ROOT ? order : nextOrder(p)); orders.set(p, v + 1); return v; };
    (function walk(items, parent) {
      for (const it of items) {
        if (it.type === 'folder') {
          let f = opt.into === 'merge' ? kidsOf(parent).find((k) => k.type === 'folder' && k.title === it.title) : null;
          if (!f) {
            f = { id: uid(), type: 'folder', parent, title: it.title, added: it.added || Date.now(), order: ord(parent) };
            out.push(f); st.folders++;
            if (!local.has(parent)) local.set(parent, []); local.get(parent).push(f);
          }
          walk(it.children || [], f.id);
        } else {
          if (!/^[a-z][a-z0-9+.-]*:/i.test(it.url || '')) { st.skipped++; continue; }
          const key = normUrl(it.url), dup = known.has(key);
          if (dup && opt.dups === 'skip') { st.skipped++; continue; }
          known.add(key);
          const n = { id: uid(), type: 'bm', parent, title: it.title || it.url, url: it.url, added: it.added || Date.now(), order: ord(parent) };
          if (it.icon) n.icon = it.icon;
          if (dup) { n.dup = true; st.flagged++; }
          out.push(n); st.added++;
        }
      }
    })(tree.children, base);
    await save(out);
    return st;
  }

  function exportTree(id) {
    return kids(id).map((n) => (n.type === 'folder'
      ? { type: 'folder', title: n.title, added: n.added, children: exportTree(n.id) }
      : { type: 'bm', title: n.title, url: n.url, added: n.added, icon: n.icon }));
  }

  /* Old app data: {folders:[{name, bookmarks:[{name, url, id}]}]}. Empty folders are skipped. */
  async function migrateLegacy() {
    if (await MBStore.getMeta(C.migratedFlag)) return 0;
    let n = 0;
    try {
      const raw = localStorage.getItem(C.legacyKey);
      const old = raw ? JSON.parse(raw) : null;
      if (old && Array.isArray(old.folders)) {
        const tree = { children: old.folders.filter((f) => f && Array.isArray(f.bookmarks) && f.bookmarks.length)
          .map((f) => ({ type: 'folder', title: String(f.name || 'Folder'), children: f.bookmarks.map((b) => ({ type: 'bm', title: String(b.name || b.url || ''), url: String(b.url || '') })) })) };
        if (tree.children.length) n = (await importTree(tree, { into: 'new', name: 'From Bookmark Manager', dups: 'flag' })).added;
      }
    } catch (e) { console.warn('MyBookmark: old data could not be read', e); }
    await MBStore.setMeta(C.migratedFlag, Date.now());
    return n;
  }

  return { load, node, kids, path, count, all: () => [...nodes.values()], addFolder, addBookmark, update, move, remove, importTree, exportTree, migrateLegacy, normUrl, domain, isInside, ROOT };
})();
