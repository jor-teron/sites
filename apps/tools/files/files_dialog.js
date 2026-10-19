/*
 * Files dialogs (apps/tools/files/files_dialog.js) — small in-page ask / confirm boxes with
 * big buttons (no browser prompt()). Enter = OK, Esc / backdrop = Cancel.
 * API window.FilesDialog: ask(title, value, okText) → Promise<string | null>,
 *                         confirm(title, text, okText) → Promise<boolean>.
 */
window.FilesDialog = (function () {
  'use strict';
  function box(title, body, okText, danger) {
    return new Promise((done) => {
      const back = document.createElement('div');
      back.className = 'dlg-back';
      const d = document.createElement('div');
      d.className = 'dlg';
      d.setAttribute('role', 'dialog');
      d.setAttribute('aria-modal', 'true');
      const h = document.createElement('h2'); h.textContent = title;
      const row = document.createElement('div'); row.className = 'dlg-btns';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn'; cancel.textContent = 'Cancel';
      const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'btn ' + (danger ? 'danger' : 'primary'); ok.textContent = okText || 'OK';
      row.append(cancel, ok);
      d.append(h);
      if (body) d.append(body);
      d.append(row);
      back.appendChild(d);
      document.body.appendChild(back);
      const input = body && body.tagName === 'INPUT' ? body : null;
      const end = (v) => { back.remove(); document.removeEventListener('keydown', key, true); done(v); };
      const key = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); end(null); }
        else if (e.key === 'Enter') { e.preventDefault(); end(input ? input.value : true); }
      };
      document.addEventListener('keydown', key, true);
      cancel.addEventListener('click', () => end(null));
      ok.addEventListener('click', () => end(input ? input.value : true));
      back.addEventListener('pointerdown', (e) => { if (e.target === back) end(null); });
      setTimeout(() => { if (input) { input.focus(); const dot = input.value.lastIndexOf('.'); input.setSelectionRange(0, dot > 0 ? dot : input.value.length); } else ok.focus(); }, 0);
    });
  }
  return {
    ask(title, value, okText) {
      const i = document.createElement('input');
      i.type = 'text'; i.className = 'dlg-in'; i.value = value || ''; i.spellcheck = false;
      return box(title, i, okText).then((v) => (v == null ? null : String(v).trim()));
    },
    confirm(title, text, okText) {
      const p = document.createElement('p'); p.textContent = text || '';
      return box(title, p, okText, true).then((v) => v === true);
    }
  };
})();
