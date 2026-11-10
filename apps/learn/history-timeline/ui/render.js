(function () {
  'use strict';
  const H = window.HT;
  // The same hand-drawn glyph paths are used in the accessible event list and on canvas.
  H.paths = {
    society: 'M-8 7 L-8 -3 L0 -9 L8 -3 L8 7 Z M-2 7 L-2 0 L2 0 L2 7',
    empires: 'M-9 7 L-9 -8 L-5 -8 L-5 -4 L-1 -4 L-1 -8 L3 -8 L3 -4 L7 -4 L7 -8 L10 -8 L10 7 Z',
    conflict: 'M-7 -8 L7 6 M-8 -5 L-5 -8 M3 8 L9 2 M7 -8 L-7 6 M5 -8 L8 -5 M-9 2 L-3 8',
    leaders: 'M-8 8 Q-8 1 0 1 Q8 1 8 8 M0 -9 A4 4 0 1 0 0 -1 A4 4 0 1 0 0 -9',
    science: 'M-3 -9 L3 -9 M-1 -9 L-1 -2 L-8 7 Q0 11 8 7 L1 -2 L1 -9 M-5 3 L5 3',
    culture: 'M-9 5 Q-1 -3 8 -8 Q9 0 1 7 L-4 8 Z M-4 8 L-9 10 M1 -1 L4 2'
  };
  H.icon = topic => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '-13 -13 26 26'); svg.setAttribute('width', 26); svg.setAttribute('height', 26); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(svg.namespaceURI, 'path'); p.setAttribute('d', H.paths[topic]);
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', H.colours[topic]); p.setAttribute('stroke-width', '1.8'); p.setAttribute('stroke-linecap', 'round'); svg.append(p); return svg;
  };
  H.draw = (canvas, state) => {
    const box = canvas.getBoundingClientRect(), w = box.width, h = box.height, dpr = Math.min(3, devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement), ink = css.getPropertyValue('--ink').trim(), muted = css.getPropertyValue('--muted').trim(), line = css.getPropertyValue('--line').trim();
    ctx.clearRect(0, 0, w, h); ctx.lineWidth = 1; ctx.font = '11px system-ui';
    const left = 14, width = w - 28, x = y => left + H.x(y, state.view, width), ranges = H.range(state.view);
    const span = H.astro(ranges[1]) - H.astro(ranges[0]);
    let years;
    if (span < 15000 || state.view.mode === 'linear') {
      const rough = span / Math.max(2, Math.floor(w / 110)), power = 10 ** Math.floor(Math.log10(rough));
      const step = [1, 2, 5, 10].map(v => v * power).find(v => v >= rough);
      years = []; for (let n = Math.ceil(ranges[0] / step) * step; n <= ranges[1]; n += step) if (Math.round(n) !== 0) years.push(n);
    } else years = [-300000,-100000,-50000,-20000,-10000,-5000,-2000,-1000,1,500,1000,1500,1800,1900,2000];
    let lastTick = -100;
    for (const y of years) {
      const px = x(y); if (px < left || px > w - left || px - lastTick < 75) continue; lastTick = px;
      ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(px, 30); ctx.lineTo(px, h); ctx.stroke();
      ctx.fillStyle = muted; ctx.fillText(H.date(y), Math.max(3, Math.min(w - 76, px)), 19);
    }
    const lanes = state.region === 'both' ? ['world', 'india'] : [state.region], top = 35, laneH = (h - top) / lanes.length;
    const hits = [];
    lanes.forEach((lane, li) => {
      const y0 = top + li * laneH;
      ctx.fillStyle = ink; ctx.font = 'bold 12px system-ui'; ctx.fillText(lane === 'world' ? 'WORLD' : 'INDIA · SUBCONTINENT', 12, y0 + 15);
      const bands = lane === 'world' ? H.eras : H.indiaEras;
      for (let i = 0; i < bands.length; i++) {
        const [name, start, end, colour] = bands[i], a = Math.max(0, x(start)), b = Math.min(w, x(end));
        if (b < 0 || a > w || b <= a) continue;
        const by = y0 + 22 + (lane === 'india' && i % 2 ? 17 : 0);
        ctx.globalAlpha = .22; ctx.fillStyle = colour; ctx.fillRect(a, by, b - a, 16); ctx.globalAlpha = 1;
        ctx.save(); ctx.beginPath(); ctx.rect(a + 3, by, Math.max(0, b - a - 6), 16); ctx.clip(); ctx.fillStyle = ink; ctx.font = '10px system-ui'; ctx.fillText(name, a + 5, by + 12); ctx.restore();
      }
      const slots = Math.max(2, Math.floor((laneH - 65) / 34)), occupied = Array(slots).fill(-1000);
      const candidates = state.events.filter(e => e.region === lane && x(e.year) >= 4 && x(e.year) <= w - 4);
      // Selected marker wins its slot even at whole-history scale.
      candidates.sort((a, b) => (b.id === state.selected) - (a.id === state.selected) || a.year - b.year);
      for (const e of candidates) {
        const px = x(e.year); let row = occupied.findIndex(v => Math.abs(px - v) > 65);
        if (row < 0 && e.id !== state.selected) continue; if (row < 0) row = 0;
        occupied[row] = px; const py = y0 + 65 + row * 34;
        ctx.strokeStyle = H.colours[e.topic]; ctx.lineWidth = e.id === state.selected ? 3 : 1.5;
        ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI * 2); ctx.stroke();
        ctx.save(); ctx.translate(px, py); ctx.scale(.68, .68); ctx.stroke(new Path2D(H.paths[e.topic])); ctx.restore();
        ctx.font = '10px system-ui'; ctx.fillStyle = ink;
        const label = e.title.length > 19 ? e.title.slice(0, 17) + '…' : e.title;
        if (span < 600 || candidates.length < slots * 3) ctx.fillText(label, Math.max(3, Math.min(w - 115, px + 16)), py + 3);
        hits.push({ x: px, y: py, e });
      }
      ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(0, y0 + laneH - 1); ctx.lineTo(w, y0 + laneH - 1); ctx.stroke();
    });
    return hits;
  };
})();
