/*
 * Hub search bar (shared/search/search_bar.js + search_bar.css), H151 — the result list and search box
 * of Hub Search (apps/system/search/, H48) as a reusable piece for Settings (H152) and the App Hub (H153).
 * Needs shared/search/search_core.js (window.HubSearchCore) loaded first. All text goes in with textContent.
 *
 * window.HubSearchBar.list({ input, out, root, idPrefix, onOpen })   the grouped result list only
 *   (Hub Search uses this one and keeps its own box, keys and look, so it looks the same as before).
 *   Rows: { name, icon (path from root or http/data/blob url), emoji, sub, desc, kind, run(alt) }.
 *   Methods: reset(), group(title, rows, qw), pick(i, scroll), go(i, alt), unpick(), size(), sel(), rows().
 *   Click opens, Shift+click / middle-click = alt (another window); mouse move picks.
 *   onOpen(row, alt) replaces row.run(alt) when given.
 * window.HubSearchBar.create(opts)   a whole box + list in opts.mount (class "hsb", look: search_bar.css)
 *   opts: mount (element), root, placeholder, label, groups(qw, text) → [[title, rows], …] (empty query:
 *   called with qw = [] — return [] to show nothing), onOpen(row, alt), noneText(text), delay (ms, 40).
 *   Keys in the box: ↑ / ↓ / PageUp / PageDown / Home / End pick (Home / End only while results show),
 *   Enter opens the picked (or first) row, Shift+Enter = alt, Esc clears (then blurs). × clears.
 *   Returns { el, input, refresh(), clear(), focus(), list }.
 */
(function () {
  'use strict';
  if (window.HubSearchBar) return;
  const C = () => window.HubSearchCore;

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function list(opts) {
    const o = opts || {};
    const input = o.input, out = o.out, ROOT = o.root || '', PRE = o.idPrefix || 'r';
    let flat = [], sel = -1;
    const marked = (text, qw) => C().marked(text, qw, document);

    function iconBox(src, emoji, name) {
      const box = el('span', 'ic');
      box.setAttribute('aria-hidden', 'true');
      const letter = () => { box.textContent = ''; box.classList.add('letter'); box.textContent = (name || '?').trim().charAt(0).toUpperCase(); };
      if (emoji) { box.classList.add('emoji'); box.textContent = emoji; return box; }
      if (!src) { letter(); return box; }
      const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.addEventListener('error', letter);
      img.src = /^(https?:|data:|blob:)/.test(src) ? src : ROOT + src;
      box.appendChild(img);
      return box;
    }
    function row(r, qw) {
      const b = el('button', 'res');
      b.type = 'button';
      b.id = PRE + flat.length;
      b.setAttribute('role', 'option');
      b.tabIndex = -1;
      b.appendChild(iconBox(r.icon, r.emoji, r.name));
      const t = el('span', 'txt');
      const nm = el('span', 'nm'); nm.appendChild(marked(r.name, qw)); t.appendChild(nm);
      if (r.sub) { const s = el('span', 'sub'); s.appendChild(marked(r.sub, qw)); t.appendChild(s); }
      if (r.desc) { const d = el('span', 'desc'); d.appendChild(marked(r.desc, qw)); t.appendChild(d); }
      b.appendChild(t);
      if (r.kind) b.appendChild(el('span', 'kind', r.kind));
      const i = flat.length;
      b.addEventListener('click', (e) => go(i, e.shiftKey));
      b.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
      b.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); go(i, true); } });
      b.addEventListener('mousemove', () => { if (sel !== i) pick(i, false); });
      flat.push({ r, b });
      return b;
    }
    function group(title, rows, qw) {
      if (!rows.length) return;
      const s = el('section', 'grp');
      s.setAttribute('role', 'group');
      s.setAttribute('aria-label', title);
      s.appendChild(el('h2', null, title));
      rows.forEach((r) => s.appendChild(row(r, qw)));
      out.appendChild(s);
    }
    function pick(i, scroll) {
      if (!flat.length) { sel = -1; if (input) input.removeAttribute('aria-activedescendant'); return; }
      sel = Math.max(0, Math.min(flat.length - 1, i));
      flat.forEach((f, k) => { f.b.classList.toggle('on', k === sel); f.b.setAttribute('aria-selected', k === sel ? 'true' : 'false'); });
      if (input) input.setAttribute('aria-activedescendant', flat[sel].b.id);
      if (scroll !== false) flat[sel].b.scrollIntoView({ block: 'nearest' });
    }
    function unpick() { flat.forEach((f) => f.b.classList.remove('on')); sel = -1; if (input) input.removeAttribute('aria-activedescendant'); }
    function go(i, alt) {
      const f = flat[i];
      if (!f) return;
      if (o.onOpen) o.onOpen(f.r, !!alt); else if (f.r.run) f.r.run(!!alt);
    }
    function reset() { out.textContent = ''; flat = []; }
    return { reset, group, pick, unpick, go, size: () => flat.length, sel: () => sel, rows: () => flat.map((f) => f.r) };
  }

  let n = 0;
  function create(opts) {
    const o = opts || {};
    const id = 'hsb' + (++n);
    const wrap = el('div', 'hsb');
    const box = el('div', 'hsb-box');
    const lens = el('span', 'hsb-lens', '\uD83D\uDD0D\uFE0E'); lens.setAttribute('aria-hidden', 'true');
    const input = el('input', 'hsb-q');
    input.type = 'search'; input.autocomplete = 'off'; input.spellcheck = false;
    input.placeholder = o.placeholder || 'Search';
    input.setAttribute('aria-label', o.label || o.placeholder || 'Search');
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-controls', id + '-res');
    input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
    const clearB = el('button', 'hsb-clear', '\u00D7');
    clearB.type = 'button'; clearB.title = 'Clear (Esc)'; clearB.setAttribute('aria-label', 'Clear'); clearB.hidden = true;
    box.append(lens, input, clearB);
    const res = el('div', 'hsb-results'); res.id = id + '-res'; res.setAttribute('role', 'listbox'); res.hidden = true;
    wrap.append(box, res);
    if (o.mount) o.mount.appendChild(wrap);
    const L = list({ input, out: res, root: o.root, idPrefix: id + '-r', onOpen: o.onOpen });

    function refresh() {
      const text = input.value, qw = C().words(text);
      clearB.hidden = !text;
      L.reset();
      const groups = (o.groups && o.groups(qw, text)) || [];
      groups.forEach((g) => L.group(g[0], g[1] || [], qw));
      if (qw.length && !L.size()) res.appendChild(el('p', 'hsb-none', o.noneText ? o.noneText(text) : 'Nothing found for \u201C' + text.trim() + '\u201D.'));
      res.hidden = !res.firstChild;
      input.setAttribute('aria-expanded', L.size() ? 'true' : 'false');
      if (qw.length) L.pick(0, true); else L.unpick();
    }
    function clear() { input.value = ''; refresh(); }
    let t = 0;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(refresh, o.delay == null ? 40 : o.delay); });
    clearB.addEventListener('click', () => { clear(); input.focus(); });
    input.addEventListener('keydown', (e) => {
      const s = L.sel(), open = !res.hidden && L.size();
      if (e.key === 'ArrowDown') { e.preventDefault(); L.pick(s + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); L.pick(s - 1); }
      else if (e.key === 'PageDown') { e.preventDefault(); L.pick(s + 5); }
      else if (e.key === 'PageUp') { e.preventDefault(); L.pick(s - 5); }
      else if (e.key === 'Home' && open) { e.preventDefault(); L.pick(0); }
      else if (e.key === 'End' && open) { e.preventDefault(); L.pick(L.size() - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); clearTimeout(t); if (!L.size() || L.sel() < 0) refresh(); L.go(L.sel() < 0 ? 0 : L.sel(), e.shiftKey); }
      else if (e.key === 'Escape') { if (input.value) { e.preventDefault(); e.stopPropagation(); clear(); } else input.blur(); }
    });
    return { el: wrap, input, refresh, clear, focus: () => input.focus(), list: L };
  }

  window.HubSearchBar = { list, create };
})();
