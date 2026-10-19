/*
 * System Monitor core (apps/tools/sysmon/sm_core.js) — window.SM: DOM helpers, number formats,
 * the Hub page (same origin) when we run inside it, the tab registry and a 1 s sampler.
 *   SM.tab({ id, title, icon, render(pane), sample?(), draw?(), show?(), hide?(), pause?() })
 *     pause() is called each second while sampling is paused (stop any own timers).
 *     sample() runs every second for EVERY tab (so graphs keep ~60 s of history); show / hide
 *     when the tab opens / closes. render(pane) builds the tab once.
 *   SM.paused(): sampling stops while the page is hidden or its Hub window is minimised.
 *   SM.hist(n) → ring buffer { push(v), list() } of the last n (60) values.
 */
window.SM = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(text, cls, fn) { const b = el('button', 'btn' + (cls ? ' ' + cls : ''), text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function bytes(n) {
    if (n == null || !isFinite(n)) return '\u2014';
    const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i ? n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) : n) + ' ' + u[i];
  }
  const pct = (v) => (v == null || !isFinite(v) ? '\u2014' : Math.round(v * 100) + '%');
  /** Label / value rows. rows: [[label, value]] → a <dl>. */
  function kv(rows) {
    const d = el('dl', 'kv');
    rows.forEach((r) => { if (!r) return; d.append(el('dt', '', r[0]), el('dd', '', r[1])); });
    return d;
  }
  function card(title, ...kids) { const c = el('section', 'card'); if (title) c.appendChild(el('h2', '', title)); c.append(...kids.filter(Boolean)); return c; }
  function na(text) { return el('p', 'na', text || 'Not available in this browser.'); }

  /** The Hub page around us (same origin), else null. */
  function hub() {
    try { const p = window.parent; return p !== window && p.document && p.HubWM ? p : null; } catch (_) { return null; }
  }
  /** Our own Hub window (Desktop mode) as listed by __hubTasks, else null. */
  function myTask() {
    const h = hub();
    if (!h || !h.__hubTasks) return null;
    const id = h.__hubTasks.idOf(window);
    return id ? h.__hubTasks.list().find((t) => t.id === id) || null : null;
  }

  function hist(n) {
    const a = [];
    return { push(v) { a.push(v); if (a.length > n) a.shift(); }, list: () => a.slice(), last: () => a[a.length - 1] };
  }

  const tabs = [];
  let cur = null, timer = 0;
  function tab(t) { tabs.push(t); }
  function paused() {
    if (document.hidden) return true;
    const me = myTask();
    return !!(me && me.min);
  }
  function tickAll() {
    if (paused()) { tabs.forEach((t) => { if (t.pause) t.pause(); }); return; }
    tabs.forEach((t) => { if (t.sample) { try { t.sample(); } catch (e) { console.warn('sysmon', t.id, e); } } });
    if (cur && cur.draw) { try { cur.draw(); } catch (e) { console.warn('sysmon draw', e); } }
  }
  function startSampler() { if (!timer) { timer = setInterval(tickAll, 1000); tickAll(); } }

  function open(id, fromHash) {
    const t = tabs.find((x) => x.id === id) || tabs[0];
    if (cur && cur !== t && cur.hide) cur.hide();
    cur = t;
    document.querySelectorAll('.tab').forEach((b) => {
      const on = b.dataset.id === t.id;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const pane = $('panel');
    if (!t.pane) { t.pane = el('div', 'pane'); t.render(t.pane); }
    pane.replaceChildren(t.pane);
    pane.classList.remove('pop'); void pane.offsetWidth; pane.classList.add('pop');
    if (t.show) t.show();
    if (t.draw) t.draw();
    if (!fromHash && location.hash !== '#' + t.id) {
      history.replaceState(null, '', '#' + t.id);
      try { if (window.parent !== window) window.parent.postMessage({ type: 'hub-wm-save' }, location.origin === 'null' ? '*' : location.origin); } catch (_) { /* ignore */ }
    }
  }
  function drawTabs() {
    $('tabs').replaceChildren(...tabs.map((t) => {
      const b = el('button', 'tab');
      b.type = 'button'; b.dataset.id = t.id; b.setAttribute('role', 'tab');
      b.append(el('span', 'tab-ico', t.icon), el('span', 'tab-name', t.title));
      b.addEventListener('click', () => open(t.id));
      return b;
    }));
  }

  return { $, el, btn, bytes, pct, kv, card, na, hub, myTask, hist, tab, tabs, open, drawTabs, startSampler, paused,
    get current() { return cur; } };
})();
