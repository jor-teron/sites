/*
 * PDF Tools — edit operations on PT.S.pages with undo / redo.
 * Every change goes through commit(newPages, label): it snapshots the old list first.
 * P2: duplicate, insert blank, append pages from added PDFs, extract, split.
 */
PT.Edit = (() => {
  const { S } = PT;
  let undo = [], redo = [], savedAt = 0, ver = 0;
  const copyPage = (p) => ({ ...p, crop: p.crop ? { ...p.crop } : null, annots: (p.annots || []).map((a) => ({ ...a })) });
  const snap = () => ({ pages: S.pages.map(copyPage), sel: [...S.sel], ver, name: S.doc && S.doc.name });

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
    if (S.doc && !S.pages.length) {
      /* should not happen; keep session if sources remain */
    }
    PT.emit('changed');
    PT.refresh();
    if (label) PT.toast(label);
  }
  function step(from, to, word) {
    if (!from.length) return;
    to.push(snap());
    const s = from.pop();
    S.pages = s.pages; S.sel = new Set(s.sel); ver = s.ver;
    if (S.doc && s.name) S.doc.name = s.name;
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

  /* Insert a copy of each selected page immediately after it (working from the end). */
  function duplicate() {
    if (!S.sel.size) return;
    const next = [];
    const copies = [];
    S.pages.forEach((p) => {
      next.push({ ...p });
      if (S.sel.has(p.id)) {
        const c = { ...p, id: S.nextId++ };
        next.push(c);
        copies.push(c.id);
      }
    });
    const n = copies.length;
    commit(next, 'Duplicated ' + n + (n === 1 ? ' page' : ' pages'));
    S.sel = new Set(copies);
    S.anchor = copies[copies.length - 1] || S.anchor;
    PT.refresh();
    PT.emit('changed');
  }

  function insertBlank() {
    if (!S.doc) return;
    const sel = selected();
    let at = S.pages.length;
    if (sel.length) {
      const last = sel[sel.length - 1];
      at = S.pages.findIndex((p) => p.id === last.id) + 1;
    }
    const size = PTUtil.neighbourSize(S.sources, S.pages, Math.max(0, at - 1));
    const src = {
      id: S.nextSrc++,
      kind: 'blank',
      name: 'Blank',
      color: '#7a828c',
      width: size.w,
      height: size.h,
    };
    S.sources.push(src);
    const page = { id: S.nextId++, srcId: src.id, src: 0, rot: 0 };
    const next = S.pages.slice(0, at).map((p) => ({ ...p })).concat([page], S.pages.slice(at).map((p) => ({ ...p })));
    commit(next, 'Inserted a blank page');
    S.sel = new Set([page.id]);
    S.anchor = page.id;
    PT.refresh();
    PT.emit('changed');
  }

  function append(pages, label) {
    if (!pages || !pages.length) return;
    commit(S.pages.concat(pages).map((p) => ({ ...p })), label);
  }

  function sessionName(kind) {
    const base = PTUtil.fileBase(S.doc && S.doc.name);
    const used = PT.usedSources().filter((s) => s.kind !== 'blank');
    if (kind === 'extract') return base + '-extract.pdf';
    if (used.length > 1) return base + '-merged.pdf';
    return PTSave.editedName(S.doc.name);
  }

  async function save() {
    if (!S.doc) return;
    PT.busy('Saving…');
    try {
      const st = PT.Stamp ? PT.Stamp.ensure() : null;
      if (st && st.shrink) PT.busy('Shrinking…');
      const blob = await PTSave.build(S.sources, S.pages, {
        stamp: st,
        meta: S.meta,
        shrink: !!(st && st.shrink),
        flatten: !!S.formFlatten,
        onProgress: (i, n) => PT.busy('Shrinking ' + i + ' of ' + n + '…'),
      });
      const name = await PTSave.save(blob, sessionName('save'));
      savedAt = ver;
      PT.toast('Saved ' + name);
    } catch (err) {
      console.info('PDF Tools: save failed:', err && err.message);
      await PT.ask({ title: 'Couldn\'t save', text: 'Something went wrong while building the PDF. Your edits are still here; try again.', no: false });
    } finally { PT.busy(null); }
  }

  async function extract() {
    if (!S.doc || !S.sel.size) return;
    const pages = selected();
    PT.busy('Saving extract…');
    try {
      const blob = await PTSave.build(S.sources, pages);
      const name = await PTSave.save(blob, sessionName('extract'));
      PT.toast('Saved ' + name);
    } catch (err) {
      console.info('PDF Tools: extract failed:', err && err.message);
      await PT.ask({ title: 'Couldn\'t extract', text: 'Something went wrong while building the PDF. Try again.', no: false });
    } finally { PT.busy(null); }
  }

  function groupsFrom(values) {
    const n = S.pages.length;
    if (values.mode === 'singles') return PTUtil.planSingles(n);
    if (values.mode === 'every') return PTUtil.planEvery(n, values.n);
    return PTUtil.parseRanges(values.ranges, n);
  }

  async function split() {
    if (!S.doc) return;
    const values = await PT.form({
      title: 'Split pages',
      text: 'Each part is saved as its own PDF. Several files are packed into a .zip. Pages you leave out of a range are not included.',
      yes: 'Split',
      fields: [
        { name: 'mode', type: 'radio', value: 'singles', options: [['singles', 'Single pages'], ['ranges', 'Ranges'], ['every', 'Every N pages']] },
        { name: 'ranges', type: 'text', label: 'Ranges', placeholder: '1-3, 7', when: (v) => v.mode === 'ranges' },
        { name: 'n', type: 'number', label: 'Pages per file', value: 2, min: 1, step: 1, when: (v) => v.mode === 'every' },
      ],
      watch: (v) => {
        const plan = groupsFrom(v);
        return plan.ok ? PTUtil.planHint(plan.groups) : '';
      },
      validate: (v) => {
        const plan = groupsFrom(v);
        return plan.ok ? null : plan.error;
      },
    });
    if (!values) return;
    const plan = groupsFrom(values);
    if (!plan.ok) return;
    const base = PTUtil.fileBase(S.doc.name);
    PT.busy('Splitting…');
    try {
      const files = [];
      for (let i = 0; i < plan.groups.length; i++) {
        const g = plan.groups[i];
        const pages = g.map((n) => S.pages[n - 1]);
        const blob = await PTSave.build(S.sources, pages);
        const data = new Uint8Array(await blob.arrayBuffer());
        files.push({ name: PTUtil.partName(base, g, i), data });
        PT.busy('Splitting ' + (i + 1) + ' of ' + plan.groups.length + '…');
        await new Promise((r) => setTimeout(r, 0));
      }
      if (files.length === 1) {
        const name = await PTSave.save(new Blob([files[0].data], { type: 'application/pdf' }), files[0].name);
        PT.toast('Saved ' + name);
      } else {
        const zip = PTZip.build(files);
        const name = await PTSave.save(zip, base + '-split.zip');
        PT.toast('Saved ' + name);
      }
    } catch (err) {
      console.info('PDF Tools: split failed:', err && err.message);
      await PT.ask({ title: 'Couldn\'t split', text: 'Something went wrong while building the files. Try again, or split into fewer parts.', no: false });
    } finally { PT.busy(null); }
  }

  function reset() { undo = []; redo = []; ver = 0; savedAt = 0; }
  function touch() { ver = Date.now() + Math.random(); PT.refresh(); }
  function setPages(pages, label) { commit(pages, label); }
  return {
    rotate, remove, move, save, reset, touch, setPages, selected, duplicate, insertBlank, append, extract, split,
    undo: () => step(undo, redo, 'Undo'), redo: () => step(redo, undo, 'Redo'),
    canUndo: () => undo.length > 0, canRedo: () => redo.length > 0,
    dirty: () => ver !== savedAt,
  };
})();
