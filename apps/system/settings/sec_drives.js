/*
 * Settings → Network drives (apps/system/settings/sec_drives.js, H117). The saved WebDAV servers
 * (shared/fs/webdav_accounts.js, localStorage 'hub-webdav-accounts', this browser only) that Files and
 * the Hub list as drives 'webdav:<n>' (shared/fs/fs_drives.js, H116).
 * Card "🌐 Network drives": one row per server (name, URL, user) with Edit, Test, Remove (UiDialog.confirm);
 * then the Add / Edit form: Name, URL, User, Password (masked + 👁 Show, like Settings › API Keys), Test, Save.
 * Test = WebDavFs.test(account) (a PROPFIND of the folder): ✓ OK, wrong user / password, or can't reach
 * (offline, not https, or no CORS headers). Reuses the .key-* styles of sec_keys.js. Deep link: #drives.
 */
(function () {
  'use strict';
  const ui = window.Settings.ui;
  const A = window.WebDavAccounts, W = window.WebDavFs;

  function explain(r) {
    if (r.ok) return { ok: true, text: '\u2713 OK, connected' };
    if (r.name === 'NotAllowedError') return { ok: false, text: 'Wrong user or password (the server refused it)' };
    if (r.name === 'NotFoundError') return { ok: false, text: 'Folder not found at that URL' };
    if (/reach/.test(r.error || '')) return { ok: false, text: 'Can\u2019t reach the server. Is it on, https, and does it allow CORS (browser requests from this site)?' };
    return { ok: false, text: (r.error || 'Failed').replace(/^WebDAV: /, '') };
  }
  async function runTest(acc, say) {
    say('Testing\u2026');
    const r = explain(await W.test(acc));
    say(r.text, r.ok ? 'ok' : 'bad');
  }
  function input(cls, type, ph, label) {
    const i = ui.el('input', 'key-input ' + cls);
    Object.assign(i, { type, placeholder: ph, autocomplete: 'off', spellcheck: false });
    i.setAttribute('aria-label', label); i.setAttribute('autocapitalize', 'off');
    return i;
  }
  const btn = (text, cls) => { const b = ui.el('button', 'key-btn ' + (cls || ''), text); b.type = 'button'; return b; };

  function render(pane) {
    if (!A || !W) { pane.appendChild(ui.note('The Network drive files (shared/fs/webdav_*.js) did not load.')); return; }
    const card = ui.el('section', 'card key-row nd-card');
    const head = ui.el('div', 'key-head');
    head.append(ui.el('b', 'key-label', '\uD83C\uDF10 Network drives'));
    card.append(head, ui.el('p', 'key-hint', 'Works with WebDAV servers, e.g. Nextcloud or rclone serve webdav; must be https and allow CORS. Each one shows in Files as its own drive. Passwords stay only in this browser.'));
    const list = ui.el('div', 'nd-list');
    // form
    const form = ui.el('div', 'nd-form');
    const ftitle = ui.el('b', 'key-label', 'Add network drive');
    const name = input('nd-name', 'text', 'Name, e.g. Home PC', 'Name');
    const url = input('nd-url', 'url', 'https://\u2026 (server folder URL)', 'URL');
    const user = input('nd-user', 'text', 'User', 'User');
    const pass = input('nd-pass', 'password', '\u2022\u2022\u2022\u2022\u2022\u2022', 'Password');
    const eye = btn('\uD83D\uDC41', 'key-eye');
    eye.title = 'Show / hide'; eye.setAttribute('aria-label', 'Show or hide the password');
    eye.addEventListener('click', () => { pass.type = pass.type === 'password' ? 'text' : 'password'; eye.classList.toggle('on', pass.type === 'text'); });
    const ftest = btn('Test'), save = btn('Add', 'key-save'), cancel = btn('Cancel');
    const fout = ui.el('p', 'key-out', '');
    const l1 = ui.el('div', 'key-line'), l2 = ui.el('div', 'key-line'), l3 = ui.el('div', 'key-line');
    l1.append(name, url); l2.append(user, pass, eye); l3.append(ftest, save, cancel);
    form.append(ftitle, l1, l2, l3, fout);
    card.append(list, form);
    pane.appendChild(card);

    let editing = null;
    const fsay = (t, c) => { fout.textContent = t || ''; fout.className = 'key-out' + (c ? ' ' + c : ''); };
    const vals = () => ({ name: name.value.trim(), url: url.value.trim(), user: user.value.trim(), pass: pass.value });
    function reset() {
      editing = null; name.value = url.value = user.value = pass.value = '';
      pass.type = 'password'; eye.classList.remove('on');
      ftitle.textContent = 'Add network drive'; save.textContent = 'Add'; cancel.hidden = true;
    }
    function edit(a) {
      editing = a.id; name.value = a.name; url.value = a.url; user.value = a.user; pass.value = a.pass;
      ftitle.textContent = 'Edit \u201c' + a.name + '\u201d'; save.textContent = 'Save'; cancel.hidden = false; fsay('');
      name.focus();
    }
    function valid(v) {
      try { const u = new URL(v.url); if (!/^https?:$/.test(u.protocol)) throw 0; } catch (_) { fsay('Enter the full URL, e.g. https://host/dav/', 'bad'); return false; }
      return true;
    }
    ftest.addEventListener('click', async () => { const v = vals(); if (!valid(v)) return; ftest.disabled = true; await runTest(v, fsay); ftest.disabled = false; });
    save.addEventListener('click', () => {
      const v = vals(); if (!valid(v)) return;
      if (editing) { A.update(editing, v); fsay('Saved', 'ok'); } else { A.add(v); fsay('Added', 'ok'); }
      reset(); draw();
    });
    cancel.addEventListener('click', () => { reset(); fsay(''); });
    [name, url, user, pass].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save.click(); } }));

    function draw() {
      list.textContent = '';
      const all = A.list();
      if (!all.length) list.appendChild(ui.el('p', 'key-hint nd-empty', 'No network drives yet.'));
      all.forEach((a) => {
        const row = ui.el('div', 'nd-row');
        row.dataset.id = a.id;
        const info = ui.el('div', 'nd-info');
        info.append(ui.el('b', '', a.name), ui.el('small', 'nd-url', a.url + (a.user ? ' \u00b7 ' + a.user : '')));
        const line = ui.el('div', 'key-line');
        const e = btn('Edit'), t = btn('Test'), r = btn('Remove', 'key-del');
        line.append(e, t, r);
        const out = ui.el('p', 'key-out', '');
        const say = (s, c) => { out.textContent = s || ''; out.className = 'key-out' + (c ? ' ' + c : ''); };
        e.addEventListener('click', () => edit(A.get(a.id) || a));
        t.addEventListener('click', async () => { t.disabled = true; await runTest(A.get(a.id) || a, say); t.disabled = false; });
        r.addEventListener('click', async () => {
          const yes = window.UiDialog ? await window.UiDialog.confirm('Remove \u201c' + a.name + '\u201d?', 'Only the saved connection is removed; no files on the server are touched.', 'Remove', true) : true;
          if (!yes) return;
          A.remove(a.id); if (editing === a.id) reset(); draw();
        });
        row.append(info, line, out);
        list.appendChild(row);
      });
    }
    reset(); draw();
    window.addEventListener('storage', (e) => { if (e.key === 'hub-webdav-accounts' && pane.isConnected && !editing) draw(); });
  }

  Settings.add({ id: 'drives', title: 'Network drives', icon: '\uD83C\uDF10', render });
})();
