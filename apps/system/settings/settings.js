/*
 * Settings shell (apps/system/settings/settings.js) — sections list + option pane.
 * Sections register with Settings.add({ id, title, icon, render(el) }) (sec_*.js) and are
 * shown in that order. Wide screens: list left, options right. Narrow (< 700 px, phone):
 * list first; tapping a section opens it with ‹ Back. The open section is in the hash
 * (#wallpaper, #about …) so links like settings/#about work.
 * Helpers for sections: Settings.ui.choice(), .switch(), .title(), .note().
 */
window.Settings = (function () {
  'use strict';
  const sections = [];
  const nav = document.getElementById('nav');
  const pane = document.getElementById('pane');
  const paneTitle = document.getElementById('pane-title');
  const back = document.getElementById('back');
  const narrow = window.matchMedia('(max-width: 699px)');
  let current = '';

  function add(sec) { sections.push(sec); }

  function open(id, fromHash) {
    const sec = sections.find((s) => s.id === id);
    if (!sec) { showList(); return; }
    current = id;
    nav.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    paneTitle.textContent = sec.title;
    pane.replaceChildren();
    sec.render(pane);
    document.body.classList.add('in-section');
    pane.scrollTop = 0;
    if (!fromHash && location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
  }
  function showList() {
    document.body.classList.remove('in-section');
    if (narrow.matches) { current = ''; history.replaceState(null, '', location.pathname + location.search); }
    else if (sections[0]) open(sections[0].id);
  }

  function start() {
    sections.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'nav-item';
      b.dataset.id = s.id;
      b.innerHTML = '<span class="nav-ico" aria-hidden="true"></span><span class="nav-name"></span><span class="nav-chev" aria-hidden="true">\u203A</span>';
      b.querySelector('.nav-ico').textContent = s.icon;
      b.querySelector('.nav-name').textContent = s.title;
      b.addEventListener('click', () => open(s.id));
      nav.appendChild(b);
    });
    back.addEventListener('click', showList);
    window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && id !== current) open(id, true); });
    const id = location.hash.slice(1);
    if (id && sections.some((s) => s.id === id)) open(id, true);
    else showList();
  }

  /* ---------- small UI helpers ---------- */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const ui = {
    el,
    title(text) { return el('h3', 'opt-title', text); },
    note(text) { return el('p', 'opt-note', text); },
    /** Segmented choice: opts [{value, label, hint}], value, onPick(v). Returns the group. */
    choice(opts, value, onPick) {
      const g = el('div', 'seg');
      g.setAttribute('role', 'radiogroup');
      const paint = (v) => g.querySelectorAll('button').forEach((b) => {
        const on = b.dataset.v === String(v);
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      opts.forEach((o) => {
        const b = el('button', 'seg-btn');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.dataset.v = String(o.value);
        b.appendChild(el('b', '', o.label));
        if (o.hint) b.appendChild(el('small', '', o.hint));
        b.addEventListener('click', () => { paint(o.value); onPick(o.value); });
        g.appendChild(b);
      });
      paint(value);
      g.repaint = paint;
      return g;
    },
    /** On / off switch row. */
    switch(label, hint, on, onToggle) {
      const b = el('button', 'switch');
      b.type = 'button';
      b.setAttribute('role', 'switch');
      const t = el('span', 'switch-text');
      t.append(el('b', '', label), el('small', '', hint));
      const k = el('span', 'switch-knob'); k.appendChild(el('i'));
      b.append(t, k);
      const paint = (v) => { b.classList.toggle('on', v); b.setAttribute('aria-checked', v ? 'true' : 'false'); };
      paint(on);
      b.addEventListener('click', () => { on = !on; paint(on); onToggle(on); });
      return b;
    }
  };

  return { add, start, open, ui };
})();
