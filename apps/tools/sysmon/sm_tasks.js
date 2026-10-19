/*
 * Tasks tab (apps/tools/sysmon/sm_tasks.js) — the Hub's open windows (Desktop mode), read from
 * the window manager's small API window.__hubTasks (hub/wm_windows.js; same origin only).
 * Each row: icon, name (+ "this window"), state (active / minimised / maximised), page nodes
 * (a rough size hint for same-origin apps), and Focus / Minimise / End task (= close the window;
 * ending a window with unsaved work asks first). Live: redraws on every window change + each second.
 * Phone mode / outside the Hub: explains that there is just one app at a time.
 */
(function () {
  'use strict';
  const { el, btn, card, hub } = SM;
  let list = null, note = null, off = null, lastSig = '';

  function api() { const h = hub(); return h && h.__hubTasks ? h.__hubTasks : null; }

  function row(t, me) {
    const r = el('div', 'task' + (t.active ? ' active' : '') + (t.min ? ' min' : ''));
    r.dataset.id = t.id;
    const img = el('img', 'task-ico'); img.alt = ''; img.src = t.icon || 'sysmon_icon.png';
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
    const name = el('div', 'task-name');
    name.append(el('b', '', t.name), el('span', 'task-sub',
      [t.active ? 'Active' : t.min ? 'Minimised' : 'Open', t.max ? 'maximised' : '', t.id === me ? 'this window' : '']
        .filter(Boolean).join(' \u00B7 ')));
    const nodes = el('div', 'task-nodes', t.nodes == null ? 'other site' : t.nodes.toLocaleString() + ' nodes');
    nodes.title = 'Elements on the app\u2019s page (a rough size hint; real memory per app is not visible to web pages)';
    const a = api();
    const acts = el('div', 'task-acts');
    acts.append(
      btn('Focus', '', () => a && a.focus(t.id)),
      btn('Minimise', '', () => a && a.minimise(t.id)),
      btn('End task', 'danger', async () => {
        if (!a) return;
        const ok = !window.UiDialog || await UiDialog.confirm('End \u201c' + t.name + '\u201d?', 'Its window closes. Unsaved work in it may be lost.', 'End task', true);
        if (ok) a.close(t.id);
      }));
    acts.children[1].disabled = t.min;
    r.append(img, name, nodes, acts);
    return r;
  }

  function draw() {
    if (!list) return;
    const a = api(), h = hub();
    if (!a || !h.HubMode || !h.HubMode.isDesktop()) {
      lastSig = '';
      note.textContent = h ? 'Phone mode shows one app at a time, so there is no task list. Switch to Desktop mode (Settings \u2192 Desktop) to see windows here.'
        : 'Open System Monitor from the Hub to see its windows here.';
      list.replaceChildren();
      return;
    }
    const tasks = a.list(), me = a.idOf(window);
    const sig = JSON.stringify(tasks.map((t) => Object.assign({}, t, { nodes: t.nodes == null ? -1 : 0, title: '' })));
    if (sig === lastSig) {            // same windows: only refresh the node counts (no re-render under the pointer)
      tasks.forEach((t) => {
        const n = list.querySelector('.task[data-id="' + t.id + '"] .task-nodes');
        if (n && t.nodes != null) n.textContent = t.nodes.toLocaleString() + ' nodes';
      });
      return;
    }
    lastSig = sig;
    note.textContent = tasks.length + (tasks.length === 1 ? ' window' : ' windows') + ' open in the Hub.';
    list.replaceChildren(...tasks.map((t) => row(t, me)));
  }

  SM.tab({
    id: 'tasks', title: 'Tasks', icon: '\uD83D\uDDC2',
    render(pane) {
      note = el('p', 'muted');
      list = el('div', 'tasks');
      pane.append(card('Hub windows', note, list,
        el('p', 'muted small', 'Only the Hub\u2019s own windows. Other programs and browser tabs are not visible to web pages.')));
      const a = api();
      if (a) {
        off = a.onChange(() => { if (SM.current && SM.current.id === 'tasks') draw(); });
        window.addEventListener('pagehide', () => { if (off) off(); off = null; });
      }
    },
    show() { lastSig = ''; draw(); },
    draw
  });
})();
