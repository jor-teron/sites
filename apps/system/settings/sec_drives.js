/*
 * Settings → Network drives (apps/system/settings/sec_drives.js, H117). The saved WebDAV servers
 * (shared/fs/webdav_accounts.js, localStorage 'hub-webdav-accounts', this browser only) that Files and
 * the Hub list as drives 'webdav:<n>' (shared/fs/fs_drives.js, H116).
 * Card "🌐 Network drives": one row per server (name, URL, user) with Edit, Test, Remove (UiDialog.confirm);
 * then the Add / Edit form: Name, URL, User, Password (masked + 👁 Show, like Settings › API Keys), Test, Save.
 * Test = WebDavFs.test(account) (a PROPFIND of the folder): ✓ OK, wrong user / password, or can't reach
 * (offline, not https, or no CORS headers). Reuses the .key-* styles of sec_keys.js. Deep link: #drives.
 * H119: SFTP servers too (shared/fs/sftp_accounts.js, localStorage 'hub-sftp-accounts', drives 'sftp:<n>').
 *   The form has a Type (WebDAV / SFTP); SFTP asks Relay URL (ws:// or wss://, hub/relay/sftp_relay.py on the PC),
 *   Relay token (masked + 👁), Host, Port (22), User, Password (masked + 👁), Folder (optional, default the home folder).
 *   Test = SftpFs.test(account) (a fresh login + listing of the folder). The list shows both kinds, 🌐 WebDAV / 🔐 SFTP.
 *   Rows and the form keep a .nd-row / .nd-form look; lines that change with the type are hidden with style.display
 *   (.key-line's display beats [hidden], see H96).
 */
(function () {
  'use strict';
  const ui = window.Settings.ui;
  const A = window.WebDavAccounts, W = window.WebDavFs;
  const SA = window.SftpAccounts, SF = window.SftpFs;   // H119
  const hasS = !!(SA && SF);

  function explain(r) {
    if (r.ok) return { ok: true, text: '\u2713 OK, connected' };
    if (r.name === 'NotAllowedError') return { ok: false, text: 'Wrong user or password (the server refused it)' };
    if (r.name === 'NotFoundError') return { ok: false, text: 'Folder not found at that URL' };
    if (/reach/.test(r.error || '')) return { ok: false, text: 'Can\u2019t reach the server. Is it on, https, and does it allow CORS (browser requests from this site)?' };
    return { ok: false, text: (r.error || 'Failed').replace(/^WebDAV: /, '') };
  }
  /* H119: SFTP test results (codes from hub/relay/sftp_relay.py). */
  function explainS(r) {
    if (r.ok) return { ok: true, text: '\u2713 OK, connected' };
    const c = r.code || '';
    if (c === 'token') return { ok: false, text: 'The relay refused the token (see the Token line the relay printed, or sftp_token.txt next to it)' };
    if (c === 'auth') return { ok: false, text: 'Wrong user or password (the server refused it)' };
    if (c === 'allow') return { ok: false, text: 'The relay doesn\u2019t allow this host:port. Add it to the relay allowlist (apps/connectivity/ssh/relay/allowlist.txt)' };
    if (c === 'hostkey') return { ok: false, text: 'The server key changed, so the relay refused it. If that is expected, remove its line from sftp_known_hosts next to the relay' };
    if (c === 'notfound') return { ok: false, text: 'Folder not found on the server' };
    if (c === 'reach') return { ok: false, text: (r.error || '').replace(/^SFTP: /, '') + '. Start it with: python3 hub/relay/sftp_relay.py' };
    return { ok: false, text: (r.error || 'Failed').replace(/^SFTP: /, '') };
  }
  // (before H119) async function runTest(acc, say) {
  //   say('Testing\u2026');
  //   const r = explain(await W.test(acc));
  //   say(r.text, r.ok ? 'ok' : 'bad');
  // }
  async function runTest(acc, say, kind) {
    say('Testing\u2026');
    const r = kind === 'sftp' ? explainS(await SF.test(acc)) : explain(await W.test(acc));   // H119: + SFTP
    say(r.text, r.ok ? 'ok' : 'bad');
  }
  const kindOf = (id) => (/^sftp:/.test(String(id)) ? 'sftp' : 'webdav');   // H119
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
    // (before H119) card.append(head, ui.el('p', 'key-hint', 'Works with WebDAV servers, e.g. Nextcloud or rclone serve webdav; must be https and allow CORS. Each one shows in Files as its own drive. Passwords stay only in this browser.'));
    card.append(head, ui.el('p', 'key-hint', 'Works with WebDAV servers, e.g. Nextcloud or rclone serve webdav (must be https and allow CORS)' +
      (hasS ? ', and SFTP servers through the SFTP relay on your PC (python3 hub/relay/sftp_relay.py)' : '') +
      '. Each one shows in Files as its own drive. Passwords stay only in this browser.'));
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
    // (before H119) l1.append(name, url); l2.append(user, pass, eye); l3.append(ftest, save, cancel);
    // (before H119) form.append(ftitle, l1, l2, l3, fout);
    // H119: Type (WebDAV / SFTP) + the SFTP lines (relay + token, host + port + folder)
    const type = ui.el('select', 'key-input nd-type');
    type.setAttribute('aria-label', 'Type');
    [['webdav', '\uD83C\uDF10 WebDAV'], ['sftp', '\uD83D\uDD10 SFTP (through the relay)']].forEach(([v, l]) => { const o = ui.el('option', '', l); o.value = v; type.appendChild(o); });
    const relay = input('nd-relay', 'url', 'Relay, e.g. wss://pc.tailnet.ts.net:8023', 'Relay URL');
    const token = input('nd-token', 'password', 'Relay token', 'Relay token');
    const eye2 = btn('\uD83D\uDC41', 'key-eye');
    eye2.title = 'Show / hide'; eye2.setAttribute('aria-label', 'Show or hide the relay token');
    eye2.addEventListener('click', () => { token.type = token.type === 'password' ? 'text' : 'password'; eye2.classList.toggle('on', token.type === 'text'); });
    const host = input('nd-host', 'text', 'Host, e.g. 192.168.1.20', 'Host');
    const port = input('nd-port', 'number', '22', 'Port');
    port.min = '1'; port.max = '65535'; port.style.flex = '0 1 96px';
    const folder = input('nd-folder', 'text', 'Folder (optional, default: home)', 'Folder');
    const l0 = ui.el('div', 'key-line'), ls1 = ui.el('div', 'key-line'), ls2 = ui.el('div', 'key-line');
    l0.append(type); ls1.append(relay, token, eye2); ls2.append(host, port, folder);
    l1.append(name, url); l2.append(user, pass, eye); l3.append(ftest, save, cancel);
    if (!hasS) l0.style.display = 'none';
    form.append(ftitle, l0, l1, ls1, ls2, l2, l3, fout);
    const kind = () => (hasS && type.value === 'sftp' ? 'sftp' : 'webdav');
    function showKind() {
      const s = kind() === 'sftp';
      url.style.display = s ? 'none' : '';
      ls1.style.display = ls2.style.display = s ? '' : 'none';
    }
    type.addEventListener('change', () => { showKind(); fsay(''); });
    card.append(list, form);
    pane.appendChild(card);

    let editing = null;
    const fsay = (t, c) => { fout.textContent = t || ''; fout.className = 'key-out' + (c ? ' ' + c : ''); };
    /* ===== LEGACY (before H119, WebDAV only): vals / reset / edit / valid / Test / Save =====
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
    ===== end LEGACY ===== */
    const vals = () => (kind() === 'sftp'
      ? { name: name.value.trim(), relay: relay.value.trim(), token: token.value, host: host.value.trim(), port: +port.value || 22, user: user.value.trim(), pass: pass.value, folder: folder.value.trim() }
      : { name: name.value.trim(), url: url.value.trim(), user: user.value.trim(), pass: pass.value });
    function reset() {
      editing = null; name.value = url.value = user.value = pass.value = relay.value = token.value = host.value = folder.value = '';
      port.value = '22'; type.disabled = false;
      pass.type = token.type = 'password'; eye.classList.remove('on'); eye2.classList.remove('on');
      ftitle.textContent = 'Add network drive'; save.textContent = 'Add'; cancel.hidden = true;
      showKind();
    }
    function edit(a) {
      editing = a.id; name.value = a.name; user.value = a.user; pass.value = a.pass;
      type.value = kindOf(a.id); type.disabled = true;   // the type of a saved drive doesn't change
      if (kindOf(a.id) === 'sftp') { relay.value = a.relay; token.value = a.token; host.value = a.host; port.value = String(a.port || 22); folder.value = a.folder; url.value = ''; }
      else url.value = a.url;
      showKind();
      ftitle.textContent = 'Edit \u201c' + a.name + '\u201d'; save.textContent = 'Save'; cancel.hidden = false; fsay('');
      name.focus();
    }
    function valid(v) {
      if (kind() === 'sftp') {
        try { const u = new URL(v.relay); if (!/^wss?:$/.test(u.protocol)) throw 0; } catch (_) { fsay('Enter the relay URL, e.g. ws://192.168.1.10:8023 or wss://pc.tailnet.ts.net:8023', 'bad'); return false; }
        if (location.protocol === 'https:' && /^ws:/i.test(v.relay)) { fsay('This page is https, so the browser only allows a wss:// relay (cert.pem + key.pem next to the relay)', 'bad'); return false; }
        if (!/^[A-Za-z0-9._:\[\]-]+$/.test(v.host)) { fsay('Enter the server host, e.g. 192.168.1.20', 'bad'); return false; }
        if (!v.user) { fsay('Enter the user', 'bad'); return false; }
        return true;
      }
      try { const u = new URL(v.url); if (!/^https?:$/.test(u.protocol)) throw 0; } catch (_) { fsay('Enter the full URL, e.g. https://host/dav/', 'bad'); return false; }
      return true;
    }
    ftest.addEventListener('click', async () => { const v = vals(); if (!valid(v)) return; ftest.disabled = true; await runTest(v, fsay, kind()); ftest.disabled = false; });
    save.addEventListener('click', () => {
      const v = vals(); if (!valid(v)) return;
      const S = kind() === 'sftp' ? SA : A;
      if (editing) { if (kind() === 'sftp') SF.close(SA.get(editing) || {}); S.update(editing, v); fsay('Saved', 'ok'); } else { S.add(v); fsay('Added', 'ok'); }
      reset(); draw();
    });
    cancel.addEventListener('click', () => { reset(); fsay(''); });
    // (before H119) [name, url, user, pass].forEach(...)
    [name, url, user, pass, relay, token, host, port, folder].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save.click(); } }));

    function draw() {
      list.textContent = '';
      // (before H119) const all = A.list();
      const all = A.list().concat(hasS ? SA.list() : []);   // H119: + SFTP servers
      if (!all.length) list.appendChild(ui.el('p', 'key-hint nd-empty', 'No network drives yet.'));
      all.forEach((a) => {
        const row = ui.el('div', 'nd-row');
        row.dataset.id = a.id;
        const info = ui.el('div', 'nd-info');
        // (before H119) info.append(ui.el('b', '', a.name), ui.el('small', 'nd-url', a.url + (a.user ? ' \u00b7 ' + a.user : '')));
        const k = kindOf(a.id), Src = k === 'sftp' ? SA : A;   // H119
        const where = k === 'sftp' ? 'sftp://' + (a.user ? a.user + '@' : '') + a.host + (+a.port && +a.port !== 22 ? ':' + a.port : '') + '/' + (a.folder || '').replace(/^\/+/, '') + ' \u00b7 via ' + a.relay
          : a.url + (a.user ? ' \u00b7 ' + a.user : '');
        info.append(ui.el('b', '', (k === 'sftp' ? '\uD83D\uDD10 ' : '\uD83C\uDF10 ') + a.name), ui.el('small', 'nd-url', where));
        const line = ui.el('div', 'key-line');
        const e = btn('Edit'), t = btn('Test'), r = btn('Remove', 'key-del');
        line.append(e, t, r);
        const out = ui.el('p', 'key-out', '');
        const say = (s, c) => { out.textContent = s || ''; out.className = 'key-out' + (c ? ' ' + c : ''); };
        // (before H119) e.addEventListener('click', () => edit(A.get(a.id) || a));
        // (before H119) t.addEventListener('click', async () => { t.disabled = true; await runTest(A.get(a.id) || a, say); t.disabled = false; });
        e.addEventListener('click', () => edit(Src.get(a.id) || a));
        t.addEventListener('click', async () => { t.disabled = true; await runTest(Src.get(a.id) || a, say, k); t.disabled = false; });
        r.addEventListener('click', async () => {
          const yes = window.UiDialog ? await window.UiDialog.confirm('Remove \u201c' + a.name + '\u201d?', 'Only the saved connection is removed; no files on the server are touched.', 'Remove', true) : true;
          if (!yes) return;
          // (before H119) A.remove(a.id); if (editing === a.id) reset(); draw();
          if (k === 'sftp') SF.close(Src.get(a.id) || a);   // H119: log out of the relay session
          Src.remove(a.id); if (editing === a.id) reset(); draw();
        });
        row.append(info, line, out);
        list.appendChild(row);
      });
    }
    reset(); draw();
    // (before H119) window.addEventListener('storage', (e) => { if (e.key === 'hub-webdav-accounts' && pane.isConnected && !editing) draw(); });
    window.addEventListener('storage', (e) => { if ((e.key === 'hub-webdav-accounts' || e.key === 'hub-sftp-accounts') && pane.isConnected && !editing) draw(); });
  }

  Settings.add({ id: 'drives', title: 'Network drives', icon: '\uD83C\uDF10', render });
})();
