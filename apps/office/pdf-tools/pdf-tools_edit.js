/*
 * PDF Tools — edit operations on PT.S.pages with undo / redo.
 * Every change goes through commit(newPages, label): it snapshots the old list first.
 */
PT.Edit = (() => {
  const { S } = PT;
  let undo = [], redo = [], savedAt = 0, ver = 0;
  const snap = () => ({ pages: S.pages.map((p) => ({ ...p })), sel: [...S.sel], ver });

  function commit(pages, label) {
    undo.push(snap());
    if (undo.length > 200) undo.shift();
    redo = [];
    S.pages = pages;
    ver = Date.now() + Math.random();
    changed(label);
  }
  function changed(label) {
    const ids = new Set(S.pages.map((p) => p.id));
    for (const id of [...S.sel]) if (!ids.has(id)) S.sel.delete(id);
    PT.emit('changed');
    PT.refresh();
    if (label) PT.toast(label);
  }
  function step(from, to, word) {
    if (!from.length) return;
    to.push(snap());
    const s = from.pop();
    S.pages = s.pages; S.sel = new Set(s.sel); ver = s.ver;
    changed(word);
  }

  const selected = () => S.pages.filter((p) => S.sel.has(p.id));

  function rotate(delta) {
    if (!S.sel.size) return;
    const n = S.sel.size;
    commit(S.pages.map((p) => (S.sel.has(p.id) ? { ...p, rot: (((p.rot + delta) % 360) + 360) % 360 } : { ...p })),
      'Rotated ' + n + (n === 1 ? ' page ' : ' pages ') + (delta > 0 ? 'right' : 'left'));
  }

  async function remove() {
    const n = S.sel.size;
    if (!n) return;
    if (n === S.pages.length) {
      await PT.ask({ title: 'Can\'t delete every page', text: 'A PDF needs at least one page. Keep one or more pages selected out.', no: false });
      return;
    }
    const ok = await PT.ask({ title: 'Delete ' + n + (n === 1 ? ' page?' : ' pages?'), text: 'You can undo this until you close the file.', yes: 'Delete', danger: true });
    if (!ok) return;
    commit(S.pages.filter((p) => !S.sel.has(p.id)).map((p) => ({ ...p })), 'Deleted ' + n + (n === 1 ? ' page' : ' pages'));
    S.sel.clear(); PT.refresh(); PT.emit('changed');
  }

  /* Move the pages with these ids so they sit before index `at` of the current list. */
  function move(ids, at) {
    const set = new Set(ids);
    const before = S.pages.slice(0, at).filter((p) => !set.has(p.id));
    const moving = S.pages.filter((p) => set.has(p.id));
    const after = S.pages.slice(at).filter((p) => !set.has(p.id));
    const next = before.concat(moving, after);
    if (next.every((p, i) => p.id === S.pages[i].id)) return false;
    commit(next.map((p) => ({ ...p })), 'Moved ' + moving.length + (moving.length === 1 ? ' page' : ' pages'));
    return true;
  }

  async function save() {
    if (!S.doc) return;
    PT.busy('Saving…');
    try {
      const blob = await PTSave.build(S.doc.bytes, S.pages);
      const name = await PTSave.save(blob, PTSave.editedName(S.doc.name));
      savedAt = ver;
      PT.toast('Saved ' + name);
    } catch (err) {
      console.info('PDF Tools: save failed:', err && err.message);
      await PT.ask({ title: 'Couldn\'t save', text: 'Something went wrong while building the PDF. Your edits are still here; try again.', no: false });
    } finally { PT.busy(null); }
  }

  function reset() { undo = []; redo = []; ver = 0; savedAt = 0; }
  return {
    rotate, remove, move, save, reset, selected,
    undo: () => step(undo, redo, 'Undo'), redo: () => step(redo, undo, 'Redo'),
    canUndo: () => undo.length > 0, canRedo: () => redo.length > 0,
    dirty: () => ver !== savedAt,
  };
})();
