/*
 * PDF Tools — thumbnail grid. One cell per page (reused by page id when the order changes).
 * Thumbnails render lazily: only cells near the viewport are drawn (IntersectionObserver),
 * one at a time, and cells that scroll away before their turn are skipped, so 100+ page
 * files stay responsive. Each source page is rendered once; rotation is a CSS transform.
 * P2: colour source badges when more than one file is in the grid; blank pages skip render.
 * P3: image pages use the source thumbnail, no pdf.js render.
 */
PT.Thumbs = (() => {
  const { S } = PT;
  const cells = new Map();   // page id -> element
  const urls = new Map();    // "srcId:src" -> object URL
  const near = new Set();    // keys whose cell is near the viewport
  const queue = [];
  let io = null, running = false, gen = 0;

  const keyOf = (p) => PTUtil.pageKey(p);

  function cell(p) {
    let el = cells.get(p.id);
    if (el) return el;
    el = document.createElement('div');
    el.className = 'cell';
    el.dataset.id = p.id;
    el.setAttribute('role', 'option');
    el.innerHTML = '<div class="box"><span class="ph"></span></div><span class="no"></span>';
    cells.set(p.id, el);
    io.observe(el);
    const src = PT.sourceOf(p);
    if (src && src.kind === 'blank') markBlank(el, p);
    else if (src && src.kind === 'image' && src.thumb) setImg(el, src.thumb);
    else if (urls.has(keyOf(p))) setImg(el, urls.get(keyOf(p)));
    return el;
  }

  function markBlank(el, p) {
    const box = el.firstChild;
    box.classList.add('blank');
    const src = PT.sourceOf(p);
    const size = PTUtil.displaySize(src, p);
    const ph = box.querySelector('.ph') || document.createElement('span');
    ph.className = 'ph blank-ph';
    ph.style.aspectRatio = size.w + ' / ' + size.h;
    if (!ph.parentNode) box.replaceChildren(ph);
  }

  function setImg(el, url) {
    const box = el.firstChild;
    box.classList.remove('blank');
    if (box.querySelector('img') && box.querySelector('img').src === url) return;
    if (box.querySelector('img')) return;
    const img = new Image();
    img.alt = '';
    img.src = url;
    box.replaceChildren(img);
    const p = byId(+el.dataset.id);
    if (p) img.style.transform = p.rot ? 'rotate(' + p.rot + 'deg)' : '';
  }

  const byId = (id) => S.pages.find((p) => p.id === id);

  async function pump() {
    if (running) return;
    running = true;
    const g = gen;
    while (queue.length && g === gen) {
      const key = queue.shift();
      if (urls.has(key) || !near.has(key)) continue;
      const sample = S.pages.find((p) => keyOf(p) === key);
      const src = sample && PT.sourceOf(sample);
      if (!src || src.kind !== 'pdf' || !src.pdf) continue;
      try {
        const page = await src.pdf.getPage(sample.src + 1);
        if (g !== gen) break;
        const v1 = page.getViewport({ scale: 1 });
        const target = 220 * Math.min(2, window.devicePixelRatio || 1);
        const vp = page.getViewport({ scale: target / Math.max(v1.width, v1.height) });
        const c = document.createElement('canvas');
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        page.cleanup();
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
        if (g !== gen) break;
        const url = URL.createObjectURL(blob);
        urls.set(key, url);
        S.pages.forEach((p) => { if (keyOf(p) === key && cells.has(p.id)) setImg(cells.get(p.id), url); });
      } catch (err) {
        console.info('PDF Tools: thumbnail ' + key + ' failed:', err && err.message);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    running = false;
    if (queue.length && g === gen) pump();
  }

  function onSeen(entries) {
    for (const e of entries) {
      const p = byId(+e.target.dataset.id);
      if (!p) continue;
      const src = PT.sourceOf(p);
      const key = keyOf(p);
      if (src && src.kind !== 'pdf') continue;
      if (e.isIntersecting) {
        near.add(key);
        if (!urls.has(key)) queue.push(key);
      } else near.delete(key);
    }
    pump();
  }

  function syncBadge(el, p) {
    const used = PT.usedSources();
    let badge = el.querySelector('.src');
    if (used.length <= 1) { if (badge) badge.remove(); return; }
    const src = PT.sourceOf(p);
    if (!src) { if (badge) badge.remove(); return; }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'src';
      el.querySelector('.box').appendChild(badge);
    }
    badge.style.background = src.color || '#888';
    badge.textContent = src.kind === 'blank' ? 'Blank' : PTUtil.shortName(src.name, 12);
  }

  /* Re-sync the grid with S.pages (order, numbers, rotation, selection, badges). */
  function render() {
    const grid = PT.$('grid');
    const live = new Set(S.pages.map((p) => p.id));
    for (const [id, el] of cells) if (!live.has(id)) { io.unobserve(el); el.remove(); cells.delete(id); }
    const frag = [];
    S.pages.forEach((p, i) => {
      const el = cell(p);
      el.querySelector('.no').textContent = String(i + 1);
      const sel = S.sel.has(p.id);
      el.classList.toggle('sel', sel);
      el.setAttribute('aria-selected', String(sel));
      const src = PT.sourceOf(p);
      const from = src ? (src.kind === 'blank' ? 'Blank' : src.name + ' p.' + (p.src + 1)) : '';
      el.title = 'Page ' + (i + 1) + (from ? ' · ' + from : '');
      const img = el.querySelector('img');
      if (img) img.style.transform = p.rot ? 'rotate(' + p.rot + 'deg)' : '';
      let badge = el.querySelector('.rot');
      if (p.rot && !badge) { badge = document.createElement('span'); badge.className = 'rot'; el.appendChild(badge); }
      if (badge) { if (p.rot) badge.textContent = p.rot + '°'; else badge.remove(); }
      if (src && src.kind === 'blank') markBlank(el, p);
      else if (src && src.kind === 'image' && (src.thumb || urls.has(keyOf(p)))) setImg(el, src.thumb || urls.get(keyOf(p)));
      else if (urls.has(keyOf(p))) setImg(el, urls.get(keyOf(p)));
      syncBadge(el, p);
      frag.push(el);
    });
    // Only move nodes that are out of place (keeps scroll and avoids layout thrash).
    let ref = grid.firstChild;
    for (const el of frag) {
      if (el === ref) { ref = ref.nextSibling; continue; }
      grid.insertBefore(el, ref);
    }
  }

  function reset() {
    gen++;
    queue.length = 0; near.clear();
    for (const el of cells.values()) { if (io) io.unobserve(el); el.remove(); }
    cells.clear();
    for (const u of urls.values()) URL.revokeObjectURL(u);
    urls.clear();
    PT.$('grid').scrollTop = 0;
  }

  function init() {
    io = new IntersectionObserver(onSeen, { root: PT.$('grid'), rootMargin: '400px 0px' });
    PT.on('opened', () => { reset(); render(); });
    PT.on('closing', reset);
    PT.on('changed', render);
  }
  function url(p) {
    if (!p) return null;
    if (urls.has(keyOf(p))) return urls.get(keyOf(p));
    const src = PT.sourceOf(p);
    return (src && src.thumb) || null;
  }
  return { init, render, cellOf: (id) => cells.get(id), url, rendered: () => urls.size };
})();
