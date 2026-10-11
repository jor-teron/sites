/*
 * Paper Scan — ps_pages.js
 * Thumbnail grid of PS.pages. Each tile: tap image = edit, big ↑ ↓ (reorder), ⟲ retake/replace,
 * ✕ delete. Tiles can also be dragged onto each other (mouse/pen; phones use ↑ ↓).
 * PS.list.render(); handlers come from paper-scan.js via PS.list.init({edit, move, retake, remove}).
 */
(function () {
  'use strict';
  const PS = window.PS = window.PS || {};
  const $ = (id) => document.getElementById(id);
  let h = null, dragId = null;
  const urls = new Map();   // page id → object URL of its current thumbnail blob

  function thumb(p) {
    const old = urls.get(p.id);
    if (old && old.blob === p.out) return old.url;
    if (old) URL.revokeObjectURL(old.url);
    if (!p.out) return '';
    const url = URL.createObjectURL(p.out);
    urls.set(p.id, { blob: p.out, url });
    return url;
  }

  function btn(txt, title, fn, dis) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = txt; b.title = title; b.setAttribute('aria-label', title); b.disabled = !!dis;
    b.addEventListener('click', fn);
    return b;
  }

  function render() {
    const ol = $('pages'), list = PS.pages;
    ol.textContent = '';
    $('empty').hidden = list.length > 0;
    list.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'ps-page'; li.dataset.id = p.id; li.draggable = true;
      const img = document.createElement('img');
      img.alt = 'Page ' + (i + 1); img.tabIndex = 0; img.src = thumb(p);
      if (!p.out) img.alt = 'Working…';
      img.addEventListener('click', () => h.edit(p));
      img.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); h.edit(p); } });
      const n = document.createElement('span'); n.className = 'n'; n.textContent = 'Page ' + (i + 1) + (p.busy ? ' · …' : '');
      const row = document.createElement('div'); row.className = 'row';
      row.append(btn('↑', 'Move up', () => h.move(p, -1), i === 0), btn('↓', 'Move down', () => h.move(p, 1), i === list.length - 1),
        btn('⟲', 'Retake / replace photo', () => h.retake(p)), btn('✕', 'Delete page', () => h.remove(p)));
      li.append(img, n, row);
      li.addEventListener('dragstart', () => { dragId = p.id; li.classList.add('drag'); });
      li.addEventListener('dragend', () => { dragId = null; li.classList.remove('drag'); });
      li.addEventListener('dragover', (e) => { if (dragId && dragId !== p.id) { e.preventDefault(); li.classList.add('over'); } });
      li.addEventListener('dragleave', () => li.classList.remove('over'));
      li.addEventListener('drop', (e) => {
        e.preventDefault(); li.classList.remove('over');
        const from = list.findIndex((x) => x.id === dragId); if (from < 0) return;
        h.move(list[from], list.indexOf(p) - from);
      });
      ol.append(li);
    });
    for (const [id, u] of urls) if (!list.some((p) => p.id === id)) { URL.revokeObjectURL(u.url); urls.delete(id); }
  }

  PS.list = { init: (handlers) => { h = handlers; }, render };
})();
