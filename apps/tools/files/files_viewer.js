/*
 * Files text view (apps/tools/files/files_viewer.js) — the full-window text view inside the
 * Files app: plain text (first 2 MB), "Open in Notely" + Download. Esc or Close returns to the
 * folder. Pictures and videos open in the Viewer app (apps/tools/viewer/, R12a) instead.
 * API FX.viewer: text(entry), close(), isOpen().
 */
(function () {
  'use strict';
  const { el, btn, fail } = FX;
  const MAX_TEXT = 2 * 1024 * 1024;
  let box = null, url = '', keyFn = null;

  function close() {
    if (!box) return;
    box.remove(); box = null;
    if (url) URL.revokeObjectURL(url); url = '';
    if (keyFn) document.removeEventListener('keydown', keyFn, true);
    keyFn = null;
    FX.view.focusFirst();
  }
  function frame(title, extra) {
    close();
    box = el('div', 'pv');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', title);
    const bar = el('div', 'pv-bar');
    const name = el('b', 'pv-name', title);
    bar.append(name, ...extra, btn('btn primary', 'Close', 'Close', close));
    const body = el('div', 'pv-body');
    box.append(bar, body);
    document.body.appendChild(box);
    return { body, name };
  }

  async function text(e) {
    try {
      const f = await e.handle.getFile();
      const v = frame(f.name, [btn('btn', '\uD83D\uDCDD Notely', 'Open in Notely', () => { close(); FX.act.toNotely(e); }),
        btn('btn', '\u2B07', 'Download', () => FX.act.saveBlob(f))]);
      const pre = el('pre');
      pre.textContent = (await f.slice(0, MAX_TEXT).text()) + (f.size > MAX_TEXT ? '\n\n\u2026 (only the first 2 MB is shown)' : '');
      v.body.appendChild(pre);
      keyFn = (k) => { if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); close(); } };
      document.addEventListener('keydown', keyFn, true);
    } catch (err) { fail(err); }
  }

  FX.viewer = { text, close, isOpen: () => !!box };
})();
