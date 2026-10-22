/*
 * PDF Tools — thumbnail grid. One cell per page (reused by page id when the order changes).
 * Thumbnails render lazily: only cells near the viewport are drawn (IntersectionObserver),
 * one at a time, and cells that scroll away before their turn are skipped, so 100+ page
 * files stay responsive. Each source page is rendered once; rotation is a CSS transform.
 */
PT.Thumbs = (() => {
  const { S } = PT;
  const cells = new Map();   // page id -> element
  const urls = new Map();    // source page index -> object URL
  const near = new Set();    // source pages whose cell is near the viewport
  const queue = [];
  let io = null, running = false, gen = 0;

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
    if (urls.has(p.src)) setImg(el, urls.get(p.src));
    return el;
  }

  function setImg(el, url) {
    const box = el.firstChild;
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
      const src = queue.shift();
      if (urls.has(src) || !near.has(src)) continue;
      try {
        const page = await S.doc.pdf.getPage(src + 1);
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
        urls.set(src, url);
        S.pages.forEach((p) => { if (p.src === src && cells.has(p.id)) setImg(cells.get(p.id), url); });
      } catch (err) {
        console.info('PDF Tools: thumbnail ' + (src + 1) + ' failed:', err && err.message);
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
      if (e.isIntersecting) {
        near.add(p.src);
        if (!urls.has(p.src)) queue.push(p.src);
      } else near.delete(p.src);
    }
    pump();
  }

  /* Re-sync the grid with S.pages (order, numbers, rotation, selection). */
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
      el.title = 'Page ' + (i + 1) + (p.src !== i ? ' (was ' + (p.src + 1) + ')' : '');
      const img = el.querySelector('img');
      if (img) img.style.transform = p.rot ? 'rotate(' + p.rot + 'deg)' : '';
      let badge = el.querySelector('.rot');
      if (p.rot && !badge) { badge = document.createElement('span'); badge.className = 'rot'; el.appendChild(badge); }
      if (badge) { if (p.rot) badge.textContent = p.rot + '°'; else badge.remove(); }
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
  return { init, render, cellOf: (id) => cells.get(id), url: (src) => urls.get(src), rendered: () => urls.size };
})();
