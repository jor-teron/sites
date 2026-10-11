/*
 * Lab page (lab.js). Reads lab-apps.csv (name, path, icon; # comments; header row optional)
 * and draws one square tile per app. Empty icon = <folder>/<folder>_icon.png (file x/name.ext →
 * x/name_icon.png); if that image is missing the tile shows the first letter instead.
 */
(function () {
  'use strict';
  const grid = document.getElementById('grid'), msg = document.getElementById('msg');

  function parse(text) {
    return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l[0] !== '#')
      .map((l) => l.split(',').map((c) => c.trim()))
      .filter((c) => c[0] && c[1] && !(c[0].toLowerCase() === 'name' && c[1].toLowerCase() === 'path'))
      .map((c) => ({ name: c[0], path: c[1], icon: c[2] || '' }));
  }
  function defaultIcon(path) {
    if (path.endsWith('/')) { const f = path.slice(0, -1).split('/').pop(); return path + f + '_icon.png'; }
    return path.replace(/\.[^./]+$/, '') + '_icon.png';
  }
  function letter(name) {
    const d = document.createElement('span'); d.className = 'letter'; d.textContent = name[0].toUpperCase(); return d;
  }
  function tile(app) {
    const a = document.createElement('a'); a.className = 'tile'; a.href = app.path;
    const img = document.createElement('img'); img.alt = ''; img.src = app.icon || defaultIcon(app.path);
    img.onerror = () => img.replaceWith(letter(app.name));
    const n = document.createElement('span'); n.className = 'name'; n.textContent = app.name;
    a.append(img, n); return a;
  }
  fetch('lab-apps.csv', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then((t) => { grid.replaceChildren(...parse(t).map(tile)); })
    .catch(() => { msg.hidden = false; msg.textContent = 'Could not load lab-apps.csv (open this page over http, not file://).'; });
})();
