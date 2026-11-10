/* HT-1b: independent enhancements for the timeline and selected fact card. */
(function () {
  'use strict';
  const H = window.HT, $ = id => document.getElementById(id), el = H.el;
  const ids = new Set(H.events.map(e => e.id)), saved = H.read('bookmarks', []);
  H.bookmarks = Array.isArray(saved) ? [...new Set(saved.filter(id => ids.has(id)))] : [];
  const filterBar = el('section', null, 'filters'); filterBar.setAttribute('aria-label', 'Filter by topic');
  const chip = (text, topic) => {
    const b = el('button', text); b.dataset.topic = topic; b.setAttribute('aria-pressed', false); return b;
  };
  const all = chip('All topics', ''), chips = H.topics.map(topic => {
    const b = chip(topic.charAt(0).toUpperCase() + topic.slice(1), topic); b.prepend(H.icon(topic)); return b;
  });
  const bookmarks = chip('★ Bookmarks', 'bookmarks');
  filterBar.append(all, ...chips, bookmarks); $('eras').after(filterBar);
  function sync() {
    all.setAttribute('aria-pressed', !H.state.topics.length);
    chips.forEach(b => b.setAttribute('aria-pressed', H.state.topics.includes(b.dataset.topic)));
    bookmarks.setAttribute('aria-pressed', H.state.bookmarksOnly); bookmarks.textContent = '★ Bookmarks (' + H.bookmarks.length + ')';
  }
  all.onclick = () => { H.state.topics = []; sync(); H.update(); };
  chips.forEach(b => { b.onclick = () => {
    const topic = b.dataset.topic, active = H.state.topics;
    H.state.topics = active.includes(topic) ? active.filter(t => t !== topic) : active.concat(topic); sync(); H.update();
  }; });
  bookmarks.onclick = () => { H.state.bookmarksOnly = !H.state.bookmarksOnly; sync(); H.update(); };
  function save(id) {
    H.bookmarks = H.bookmarks.includes(id) ? H.bookmarks.filter(v => v !== id) : H.bookmarks.concat(id);
    H.write('bookmarks', H.bookmarks); sync(); H.update();
  }
  function svgEl(tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); return e;
  }
  // Coarse longitude/latitude continent silhouettes: no country borders or external map tiles.
  const continents = [
    [[-168,69],[-140,70],[-125,56],[-125,40],[-110,30],[-100,19],[-81,8],[-77,9],[-86,22],[-81,26],[-65,45],[-52,52],[-65,65],[-100,78],[-145,72]],
    [[-81,12],[-65,10],[-50,0],[-35,-6],[-40,-22],[-55,-53],[-70,-55],[-76,-25],[-80,0]],
    [[-52,60],[-42,60],[-20,76],[-40,84],[-62,78]],
    [[-10,36],[-17,18],[-10,5],[9,4],[12,-16],[18,-35],[32,-29],[42,-12],[50,12],[34,31],[10,37]],
    [[-10,36],[-10,60],[20,72],[58,70],[100,76],[140,66],[179,65],[165,50],[140,35],[120,20],[105,0],[95,5],[77,8],[68,25],[45,30],[35,40],[20,38],[0,45]],
    [[113,-22],[130,-11],[144,-15],[154,-28],[146,-40],[132,-34],[116,-35]],
    [[-180,-75],[-100,-80],[0,-73],[90,-80],[180,-75],[180,-89],[-180,-89]]
  ];
  H.map = e => {
    const wrap = el('figure', null, 'map'), svg = svgEl('svg', { viewBox: '0 0 360 180', role: 'img', 'aria-label': 'Schematic world map. Representative location: ' + e.place.name });
    svg.append(svgEl('rect', { width: 360, height: 180, fill: 'var(--soft)', rx: 8 }));
    for (const lat of [-60,0,60]) svg.append(svgEl('path', { d: 'M0 ' + (90 - lat) + 'H360', stroke: 'var(--line)', fill: 'none', 'stroke-dasharray': '3 4' }));
    for (const points of continents) svg.append(svgEl('path', { d: points.map(([lon,lat],i) => (i ? 'L' : 'M') + (lon + 180) + ',' + (90 - lat)).join(' ') + 'Z', fill: 'var(--line)' }));
    const x = e.place.lon + 180, y = 90 - e.place.lat;
    svg.append(svgEl('circle', { cx: x, cy: y, r: 9, fill: H.colours[e.topic], opacity: .25 }), svgEl('circle', { cx: x, cy: y, r: 4, fill: H.colours[e.topic], stroke: 'var(--ink)', 'stroke-width': 1 }));
    const global = e.place.name === 'Earth';
    wrap.append(svg, el('figcaption', global ? 'Global event · illustrative pin, not a single site' : 'Schematic map · ' + e.place.name + ' · ' + e.place.lat.toFixed(1) + '°, ' + e.place.lon.toFixed(1) + '°'));
    return wrap;
  };
  H.enrichCard = (card, e) => {
    const b = el('button', H.bookmarks.includes(e.id) ? '★ Bookmarked — remove' : '☆ Bookmark'); b.id = 'bookmark-event';
    b.setAttribute('aria-pressed', H.bookmarks.includes(e.id));
    b.onclick = () => { save(e.id); b.textContent = H.bookmarks.includes(e.id) ? '★ Bookmarked — remove' : '☆ Bookmark'; b.setAttribute('aria-pressed', H.bookmarks.includes(e.id)); };
    card.append(b, H.map(e));
    const related = H.contemporary(H.events, e), details = el('details'), summary = el('summary', 'At the same time · ±25 years (' + related.length + ')');
    details.id = 'contemporaries'; details.open = true; details.append(summary);
    details.append(el('p', 'All regions and topics, independent of your filters. Approximate dates remain approximate.', 'hint'));
    const list = el('div', null, 'related'); list.append(...related.slice(0, 6).map(H.eventButton));
    if (!related.length) list.append(el('p', 'No other records within this date window in this collection.'));
    details.append(list);
    if (related.length > 6) {
      const more = el('button', 'Show all ' + related.length); more.onclick = () => { list.replaceChildren(...related.map(H.eventButton)); more.remove(); }; details.append(more);
    }
    card.append(details);
  };
  window.addEventListener('storage', e => {
    if (e.key === 'learn.history-timeline.bookmarks') {
      const value = H.read('bookmarks', []); H.bookmarks = Array.isArray(value) ? [...new Set(value.filter(id => ids.has(id)))] : []; sync(); H.update();
      const selected = H.events.find(e => e.id === H.state.selected); if (selected) H.select(selected, false);
    }
  });
  sync(); H.update();
})();
