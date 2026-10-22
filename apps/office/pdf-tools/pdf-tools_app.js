/*
 * PDF Tools — wiring: rail buttons, keyboard shortcuts, leave-page guard, start-up.
 */
(() => {
  const { $ } = PT;
  PT.init();
  PT.Load.init();
  PT.Thumbs.init();
  PT.Select.init();

  $('b-all').addEventListener('click', PT.Select.all);
  $('b-rl').addEventListener('click', () => PT.Edit.rotate(-90));
  $('b-rr').addEventListener('click', () => PT.Edit.rotate(90));
  $('b-del').addEventListener('click', () => PT.Edit.remove());
  $('b-undo').addEventListener('click', PT.Edit.undo);
  $('b-redo').addEventListener('click', PT.Edit.redo);
  $('b-save').addEventListener('click', () => PT.Edit.save());

  addEventListener('keydown', (e) => {
    if (PT.dialogOpen) { if (e.key === 'Escape') $('dlg-no').hidden ? $('dlg-yes').click() : $('dlg-no').click(); return; }
    if (e.target.closest && e.target.closest('input, textarea')) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'o') { e.preventDefault(); PT.Load.pick(); return; }
    if (e.key === 'Escape') { PT.menu(false); PT.Select.none(); return; }
    if (!PT.S.doc) return;
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); PT.Edit.undo(); }
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); PT.Edit.redo(); }
    else if (mod && k === 'a') { e.preventDefault(); PT.Select.all(); }
    else if (mod && k === 's') { e.preventDefault(); PT.Edit.save(); }
    else if (!mod && k === 'r') PT.Edit.rotate(e.shiftKey ? -90 : 90);
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); PT.Edit.remove(); }
  });

  addEventListener('beforeunload', (e) => { if (PT.S.doc && PT.Edit.dirty()) { e.preventDefault(); e.returnValue = ''; } });
  PT.refresh();
})();
