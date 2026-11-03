/*
 * Hub Photo Studio (HPS6) — ps_tip.js: the app's own hover tooltips (the browser's title tooltip waits
 * about a second and its delay can't be changed by a page).
 *  - ONE delegated pointerover listener on the document. On hover, an element's title moves into data-tip
 *    (so the native tooltip never also shows); icon-only elements without an aria-label get the text as
 *    aria-label so screen readers keep the name. Icon-only [aria-label] elements (no title) show that label.
 *  - Delay from Settings → "Hover tips": Off / 100 ms (default) / 500 ms / 1000 ms
 *    (PSSave settings key 'photo-studio-settings-v1', field tip: 0 | 100 | 500 | 1000; 0 = Off).
 *  - Mouse only: touch and pen never show tips. Hidden on press, key, wheel, scroll and when leaving.
 *  - One reused fixed <div id="ps-tip">, no timers while idle, no observers: light for a 4 GB Celeron.
 *  - Theme-aware (html.light), see photo-studio.css.
 */
(function () {
  'use strict';
  let tip = null, cur = null, timer = 0;
  const delay = () => { const P = window.PSSave ? PSSave.settings() : null; return P && P.tip != null ? +P.tip : 100; };

  // title → data-tip (once per element; code that sets title again is picked up on the next hover)
  function take(el) {
    const t = el.getAttribute('title');
    if (t != null) {
      el.removeAttribute('title');
      if (t) {
        el.dataset.tip = t;
        if (!el.hasAttribute('aria-label') && !(el.textContent || '').trim()) el.setAttribute('aria-label', t);
      }
    }
    if (el.dataset.tip) return el.dataset.tip;
    const a = el.getAttribute('aria-label');
    return a && !(el.textContent || '').trim() ? a : '';
  }
  function hide() {
    clearTimeout(timer); timer = 0; cur = null;
    if (tip && !tip.hidden) tip.hidden = true;
  }
  function show(el, text) {
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'ps-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
      document.body.appendChild(tip);
    }
    tip.textContent = text;
    tip.style.left = '0px'; tip.style.top = '0px';
    tip.hidden = false;
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    let x = r.left + r.width / 2 - w / 2, y = r.bottom + 6;
    if (y + h > vh - 4) y = r.top - h - 6;                     // no room below: above
    if (y < 4) { y = Math.max(4, r.top + r.height / 2 - h / 2); x = r.left - w - 8; if (x < 4) x = r.right + 8; }   // side (right toolbar)
    x = Math.max(4, Math.min(x, vw - w - 4));
    tip.style.left = Math.round(x) + 'px'; tip.style.top = Math.round(y) + 'px';
  }

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') { hide(); return; }
    const t = e.target && e.target.closest ? e.target.closest('[title], [data-tip], [aria-label]') : null;
    if (t === cur) return;
    hide();
    if (!t) return;
    const text = take(t);
    const d = delay();
    if (!text || !(d > 0)) return;                             // Off: no tips (and no native ones)
    cur = t;
    timer = setTimeout(() => { timer = 0; if (cur === t && t.isConnected) show(t, text); }, d);
  }, { passive: true });
  document.addEventListener('pointerout', (e) => {
    if (cur && (!e.relatedTarget || !cur.contains(e.relatedTarget))) hide();
  }, { passive: true });
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'blur']) window.addEventListener(ev, hide, { passive: true, capture: true });
  document.addEventListener('scroll', hide, { passive: true, capture: true });

  // one sweep after start-up (and after late tools mount), so disabled buttons never show the native tip either
  const sweep = () => { for (const el of document.querySelectorAll('[title]')) take(el); };
  if (document.readyState === 'complete') sweep(); else window.addEventListener('load', () => setTimeout(sweep, 0), { once: true });

  window.PSTip = { hide: hide, delay: delay, take: take, sweep: sweep };
})();
