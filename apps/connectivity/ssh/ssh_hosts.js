/*
 * SSH — S3 UI for saved hosts (list in the connect form + editor dialog) and the Known hosts panel (menu).
 * SSH.Hosts.init({ pick(h) }) ; SSH.Hosts.render() ; SSH.Hosts.edit(h) ; SSH.Hosts.known() ; SSH.Hosts.open
 * All text goes in with textContent. Saved hosts hold name, user, host, port only, never a password.
 */
SSH.Hosts = (() => {
  const { $ } = SSH;
  const S = SSH.Store;
  let onPick = () => {}, editing = null;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const label = (h) => h.user + '@' + (h.host.includes(':') ? '[' + h.host + ']' : h.host) + (h.port !== '22' ? ':' + h.port : '');

  function render() {
    const list = S.hosts.list(), ul = $('saved-list');
    ul.replaceChildren();
    list.forEach((h) => {
      const li = el('li');
      const go = el('button', 'sh-go');
      go.type = 'button'; go.title = 'Fill in ' + label(h);
      go.append(el('b', null, h.name), el('small', null, label(h)));
      go.addEventListener('click', () => onPick(h));
      const ed = el('button', 'sh-ed', '✎');
      ed.type = 'button'; ed.title = 'Edit ' + h.name; ed.setAttribute('aria-label', 'Edit ' + h.name);
      ed.addEventListener('click', () => edit(h));
      li.append(go, ed);
      ul.append(li);
    });
    $('saved').hidden = !list.length;
  }

  /* edit(h): h with id edits; without id adds (prefilled). */
  function edit(h) {
    h = h || {};
    editing = h.id || null;
    $('h-title').textContent = editing ? 'Edit saved host' : 'Save host';
    $('h-name').value = h.name || ''; $('h-user').value = h.user || ''; $('h-host').value = h.host || ''; $('h-port').value = h.port || '22';
    $('h-name').placeholder = h.user && h.host ? h.user + '@' + h.host : 'Raspberry Pi';
    $('h-err').hidden = true;
    $('h-del').hidden = !editing;
    $('hdlg').hidden = false;
    setTimeout(() => $(h.host && h.user ? 'h-name' : h.host ? 'h-user' : 'h-host').focus(), 0);
  }
  const closeEdit = () => { $('hdlg').hidden = true; editing = null; };

  function save() {
    const r = S.hosts.save({ id: editing || undefined, name: $('h-name').value, user: $('h-user').value, host: $('h-host').value, port: $('h-port').value });
    if (typeof r === 'string') { $('h-err').textContent = r; $('h-err').hidden = false; return; }
    closeEdit(); render(); SSH.toast('Saved ' + r.name);
  }

  async function del() {
    const h = S.hosts.list().find((x) => x.id === editing);
    if (!h) return closeEdit();
    if (!(await SSH.ask({ title: 'Delete saved host?', text: h.name + '\n' + label(h), yes: 'Delete', danger: true }))) return;
    S.hosts.remove(h.id); closeEdit(); render(); SSH.toast('Deleted ' + h.name);
  }

  const when = (t) => { try { return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch (_) { return '?'; } };
  function renderKnown() {
    const list = S.known.list(), ul = $('k-list');
    ul.replaceChildren();
    list.forEach((k) => {
      const li = el('li');
      const b = el('button', 'pill ghost', 'Forget');
      b.type = 'button'; b.title = 'Forget the key of ' + k.id + ' (you will be asked to trust it again)';
      b.addEventListener('click', () => { S.known.forget(k.id); renderKnown(); SSH.toast('Forgot ' + k.id); });
      li.append(el('span', 'k-id', k.id), b, el('span', 'k-fp', k.alg + ' ' + k.fp), el('span', 'k-when', 'First seen ' + when(k.first) + ' · last ' + when(k.last)));
      ul.append(li);
    });
    $('k-empty').hidden = !!list.length;
    $('k-all').disabled = !list.length;
  }
  function known() { SSH.menu(false); renderKnown(); $('kdlg').hidden = false; setTimeout(() => $('k-close').focus(), 0); }
  const closeKnown = () => { $('kdlg').hidden = true; };

  function init(o) {
    onPick = o.pick;
    $('h-form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
    $('h-no').addEventListener('click', closeEdit);
    $('h-del').addEventListener('click', del);
    $('hdlg').addEventListener('click', (e) => { if (e.target === $('hdlg')) closeEdit(); });
    $('m-known').addEventListener('click', known);
    $('k-close').addEventListener('click', closeKnown);
    $('kdlg').addEventListener('click', (e) => { if (e.target === $('kdlg')) closeKnown(); });
    $('k-all').addEventListener('click', async () => {
      const n = S.known.list().length;
      if (!(await SSH.ask({ title: 'Forget all host keys?', text: 'Forget ' + n + ' saved host key' + (n === 1 ? '' : 's') + '? You will be asked to trust each host again on the next connect.', yes: 'Forget all', danger: true }))) return;
      S.known.forgetAll(); renderKnown(); SSH.toast('Forgot all host keys');
    });
    addEventListener('storage', (e) => { if (e.key === S.KEYS.hosts) render(); if (e.key === S.KEYS.known && !$('kdlg').hidden) renderKnown(); });
    render();
  }

  /* Escape closes the top panel; returns true when it handled the key. */
  function escape() {
    if (!$('hdlg').hidden) { closeEdit(); return true; }
    if (!$('kdlg').hidden) { closeKnown(); return true; }
    return false;
  }

  return { init, render, edit, known, escape, label, get open() { return !$('hdlg').hidden || !$('kdlg').hidden; } };
})();
