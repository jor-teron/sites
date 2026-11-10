/* Pure chronology and viewport operations. Classic script also usable by Node tests. */
(function (g) {
  'use strict';
  const H = g.HT = g.HT || {};
  H.MIN = -300000; H.MAX = new Date().getFullYear();
  H.topics = ['society', 'empires', 'conflict', 'leaders', 'science', 'culture'];
  H.colours = { society: '#009b88', empires: '#9170d8', conflict: '#d56855', leaders: '#c08b24', science: '#408fdb', culture: '#ce63a2' };
  H.eras = [
    ['Prehistory', -300000, -3200, '#4c9992'], ['Ancient', -3200, -800, '#bd9654'],
    ['Classical', -800, 500, '#a386c4'], ['Medieval', 500, 1500, '#588fb8'],
    ['Early Modern', 1500, 1800, '#b58472'], ['Modern', 1800, 1945, '#5d9e8b'],
    ['Contemporary', 1945, H.MAX, '#bc7599']
  ];
  // Bands are teaching conventions, not universal boundaries. Some Indian periods overlap.
  H.indiaEras = [
    ['Indus Valley · c.', -2600, -1900, '#6eafad'], ['Vedic · c.', -1500, -600, '#baa164'],
    ['Maurya · c.', -322, -185, '#a386c4'], ['Gupta · c.', 320, 550, '#689ac4'],
    ['Delhi Sultanate', 1206, 1526, '#b9876d'], ['Mughal', 1526, 1857, '#5d9e8b'],
    ['Colonial · overlapping', 1757, 1947, '#b5757b'], ['Independent India', 1947, H.MAX, '#bc7599']
  ];
  const astro = y => y < 0 ? y + 1 : y;
  const civil = y => y < 1 ? y - 1 : y;
  H.astro = astro;
  function encode(n, mode) { return mode === 'linear' ? n : Math.sign(n - 2000) * Math.log1p(Math.abs(n - 2000) / 100); }
  function decode(n, mode) { return mode === 'linear' ? n : 2000 + Math.sign(n) * 100 * Math.expm1(Math.abs(n)); }
  H.encode = (y, mode) => encode(astro(y), mode);
  H.decode = (n, mode) => civil(decode(n, mode));
  H.range = v => [H.decode(v.lo, v.mode), H.decode(v.hi, v.mode)];
  H.view = (mode = 'log', from = H.MIN, to = H.MAX) => ({ mode, lo: H.encode(from, mode), hi: H.encode(to, mode) });
  H.clampView = v => {
    const min = H.encode(H.MIN, v.mode), max = H.encode(H.MAX, v.mode), size = Math.min(max - min, v.hi - v.lo);
    let lo = Math.max(min, Math.min(max - size, v.lo)), hi = lo + size;
    if (decode(hi, v.mode) - decode(lo, v.mode) < 10) {
      const centre = (decode(lo, v.mode) + decode(hi, v.mode)) / 2;
      const start = Math.max(astro(H.MIN), Math.min(astro(H.MAX) - 10, centre - 5));
      lo = encode(start, v.mode); hi = encode(start + 10, v.mode);
    }
    return { mode: v.mode, lo, hi };
  };
  H.pan = (v, fraction) => H.clampView({ ...v, lo: v.lo + (v.hi - v.lo) * fraction, hi: v.hi + (v.hi - v.lo) * fraction });
  H.zoom = (v, factor, fraction = .5) => {
    fraction = Math.max(0, Math.min(1, fraction));
    const anchor = v.lo + fraction * (v.hi - v.lo), year = decode(anchor, v.mode);
    const minSpan = encode(year + 5, v.mode) - encode(year - 5, v.mode);
    const span = Math.max(minSpan, (v.hi - v.lo) / factor);
    return H.clampView({ mode: v.mode, lo: anchor - fraction * span, hi: anchor + (1 - fraction) * span });
  };
  H.x = (year, v, width) => (H.encode(year, v.mode) - v.lo) / (v.hi - v.lo) * width;
  H.yearAt = (x, v, width) => H.decode(v.lo + x / width * (v.hi - v.lo), v.mode);
  H.date = (y, approximate = false) => {
    let n = Math.round(y); if (!n) n = y < 0 ? -1 : 1;
    return (approximate ? 'c. ' : '') + (Math.abs(n) >= 10000 ? Math.abs(n).toLocaleString('en-US') : String(Math.abs(n))) + (n < 0 ? ' BCE' : ' CE');
  };
  H.dates = e => H.date(e.year, e.approximate) + (e.endYear ? ' – ' + H.date(e.endYear, e.approximate) : '');
  const normal = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  H.query = (events, { search = '', region = 'both', topics = [], ids = null } = {}) => {
    const q = normal(search);
    return events.filter(e => (!q || normal(e.title).includes(q)) &&
      (region === 'both' || region === e.region) && (!topics.length || topics.includes(e.topic)) && (!ids || ids.includes(e.id)))
      .sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  };
  H.contemporary = (events, e, years = 25) => events.filter(other => other.id !== e.id && Math.abs(astro(other.year) - astro(e.year)) <= years)
    .sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  H.ordered = events => [...events].sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  H.century = year => Math.ceil(Math.abs(year) / 100) * (year < 0 ? -1 : 1);
  H.centuryLabel = n => Math.abs(n) + (Math.abs(n) % 100 >= 11 && Math.abs(n) % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[Math.abs(n) % 10] || 'th')) + ' century ' + (n < 0 ? 'BCE' : 'CE');
})(typeof window !== 'undefined' ? window : globalThis);
