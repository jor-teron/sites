/*
 * Files viewer (apps/tools/files/files_viewer.js) — full-window viewers inside the Files app:
 *   text   plain text (first 2 MB), "Open in Notely" + Download
 *   image  picture fitted to the window with ‹ › for the previous / next picture in this
 *          folder (as sorted / filtered), ← → keys, swipe on touch, counter "3 / 12"
 * Esc or Close returns to the folder.
 * API FX.viewer: text(entry), image(entry), close().
 */
(function () {
  'use strict';
  const { el, btn, kind, fail } = FX;
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

  async function image(e) {
    const pics = FX.st.shown.filter((x) => x.kind === 'file' && kind(x.name, x.type) === 'image');
    let i = Math.max(0, pics.findIndex((x) => x.name === e.name));
    const count = el('span', 'pv-count');
    const prev = btn('btn pv-nav', '\u2039', 'Previous picture', () => show(i - 1));
    const next = btn('btn pv-nav', '\u203A', 'Next picture', () => show(i + 1));
    const v = frame(e.name, [count, prev, next, btn('btn', '\u2B07', 'Download', async () => FX.act.saveBlob(await pics[i].handle.getFile()))]);
    v.body.classList.add('pv-img');
    const img = el('img');
    v.body.appendChild(img);
    async function show(n) {
      if (!pics.length) return;
      i = (n + pics.length) % pics.length;
      try {
        const f = await pics[i].handle.getFile();
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(f);
        img.src = url; img.alt = f.name;
        v.name.textContent = f.name;
        count.textContent = (i + 1) + ' / ' + pics.length;
        prev.disabled = next.disabled = pics.length < 2;
        img.classList.remove('pop'); void img.offsetWidth; img.classList.add('pop');
      } catch (err) { fail(err); }
    }
    keyFn = (k) => {
      if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); close(); }
      else if (k.key === 'ArrowLeft') { k.preventDefault(); show(i - 1); }
      else if (k.key === 'ArrowRight') { k.preventDefault(); show(i + 1); }
    };
    document.addEventListener('keydown', keyFn, true);
    let sx = 0;
    v.body.addEventListener('pointerdown', (p) => { sx = p.clientX; });
    v.body.addEventListener('pointerup', (p) => { const dx = p.clientX - sx; if (p.pointerType !== 'mouse' && Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1)); });
    show(i);
  }

  FX.viewer = { text, image, close, isOpen: () => !!box };
})();
