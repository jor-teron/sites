/*
  File: modules/picker.js
  Project: tower-defence
  Purpose: Map select UI: the title row (◀ preview ▶) and the 00-99 picker
           grid with small path previews and saved best wave.
           Game logic stays in main.js; this file only reports a choice.
*/

import { COLS, ROWS, MAP_COUNT } from './config.js';
import { getMap, mapLabel } from './maps.js';
import { loadBestWaves } from './progress.js';
import { themeFor } from './themes.js';

/*
  Draw a map's road into a small canvas in its theme colours: grass, road, green IN, red OUT.
*/
export function drawPreview(canvas, map) {
  const g = canvas.getContext('2d');
  const s = Math.min(canvas.width / COLS, canvas.height / ROWS);
  const th = themeFor(map.id);
  g.fillStyle = th.grass;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = th.preview;
  for (const p of map.cells) g.fillRect(p.c * s, p.r * s, s, s);
  const a = map.cells[0], b = map.cells[map.cells.length - 1];
  g.fillStyle = '#4CFF7A'; g.fillRect(a.c * s, a.r * s, s, s);
  g.fillStyle = '#FF5B5B'; g.fillRect(b.c * s, b.r * s, s, s);
}

/*
  Wire the title row and picker.
  opts: { getMap: () => current id, onChange: id => void }
  Returns { refresh } to redraw after a run (best waves change).
*/
export function bindPicker(opts) {
  const $ = id => document.getElementById(id);
  const thumb = $('map-thumb'), nameEl = $('map-name'), subEl = $('map-sub');
  const picker = $('picker'), grid = $('pickgrid');

  /* Update the title row for the current map. */
  function refresh() {
    const id = opts.getMap();
    const best = loadBestWaves()[id] || 0;
    nameEl.textContent = 'MAP ' + mapLabel(id);
    subEl.textContent = (id === 0 ? 'DEMO • ' : '') + themeFor(id).name.toUpperCase() + ' • ' + (best ? 'BEST WAVE ' + best : 'NEW');
    drawPreview(thumb, getMap(id));
  }

  /* Build all 100 cells. Previews are tiny, so this is fast even on a Celeron. */
  function openPicker() {
    const best = loadBestWaves();
    const cur = opts.getMap();
    grid.textContent = '';
    for (let n = 0; n < MAP_COUNT; n++) {
      const cell = document.createElement('button');
      cell.title = 'Map ' + mapLabel(n) + ' - ' + themeFor(n).name;
      cell.className = 'pcell' + (best[n] ? ' has' : '') + (n === cur ? ' cur' : '');
      cell.dataset.map = n;
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 48;
      drawPreview(cv, getMap(n));
      const label = document.createElement('b');
      label.textContent = mapLabel(n) + (n === 0 ? ' DEMO' : '');
      const pt = document.createElement('span');
      pt.className = 'pt';
      pt.textContent = best[n] ? 'W' + best[n] : '—';
      cell.append(cv, label, pt);
      cell.addEventListener('click', () => {
        opts.onChange(n);
        picker.classList.add('hidden');
        refresh();
      });
      grid.appendChild(cell);
    }
    picker.classList.remove('hidden');
    const curCell = grid.querySelector('.cur');
    if (curCell) curCell.scrollIntoView({ block: 'nearest' });
  }

  /* Step the title row by +1 / -1, wrapping 99 <-> 00. */
  function step(d) {
    opts.onChange((opts.getMap() + d + MAP_COUNT) % MAP_COUNT);
    refresh();
  }

  $('map-prev').addEventListener('click', () => step(-1));
  $('map-next').addEventListener('click', () => step(1));
  $('maps-btn').addEventListener('click', openPicker);
  $('picker-close').addEventListener('click', () => picker.classList.add('hidden'));

  refresh();
  return { refresh, openPicker };
}
