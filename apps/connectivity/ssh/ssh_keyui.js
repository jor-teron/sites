/*
 * SSH — S4 UI for keys: the SSH keys panel (menu), import / generate dialog, public key + export dialog,
 * key choice selects (connect form, saved host editor) and the unlock prompt. All text goes in with textContent.
 * SSH.KeyUI: init(), panel(), fillSelect(select, fp), ensureUnlocked(fp) -> Promise<bool>, escape(), open
 */
SSH.KeyUI = (() => {
  const { $ } = SSH;
  const K = SSH.Keys, R = SSH.Ring;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (text, cls, title, fn) => { const b = el('button', 'pill ghost' + (cls ? ' ' + cls : ''), text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; };
  const MIN_PASS = 8;
  let mode = 'import', fileText = '', fileName = '', pubFp = null, selects = [];

  /* ---- selects (connect form, host editor) ---- */
  function fillSelect(sel, fp) {
    const cur = fp === undefined ? sel.value : fp;
    sel.replaceChildren();
    const o0 = el('option', null, 'Password'); o0.value = ''; sel.append(o0);
    R.list().forEach((k) => { const o = el('option', null, 'Key: ' + k.name + (k.saved && !k.jwk ? ' (locked)' : '')); o.value = k.fp; sel.append(o); });
    if (cur && !R.get(cur)) { const o = el('option', null, 'Key not on this device (' + cur.slice(7, 15) + '…)'); o.value = cur; sel.append(o); }
    sel.value = cur || '';
    sel.dispatchEvent(new Event('change'));
  }
  const refreshSelects = () => selects.forEach((s) => fillSelect(s));

  /* ---- unlock a remembered key (asks the device passphrase) ---- */
  async function ensureUnlocked(fp) {
    const k = R.get(fp);
    if (!k) return false;
    if (k.jwk) return true;
    let msg = '';
    for (;;) {
      const p = await SSH.ask({ title: 'Unlock key', password: true, yes: 'Unlock', text: (msg ? msg + '\n\n' : '') + 'Passphrase for "' + k.name + '" (saved on this device).\n' + k.alg + '\n' + k.fp });
      if (p == null) return false;
      try { await R.unlock(fp, p); return true; } catch (e) { msg = e.code === 'bad-pass' ? 'Wrong passphrase. Try again.' : (e.message || String(e)); }
    }
  }

  /* ---- keys panel ---- */
  function renderPanel() {
    const ul = $('y-list'), list = R.list();
    ul.replaceChildren();
    list.forEach((k) => {
      const li = el('li');
      const status = k.saved ? (k.jwk ? 'Saved on this device · unlocked' : 'Saved on this device · locked') : 'This visit only (not saved)';
      const btns = el('div', 'y-btns');
      btns.append(btn('Public key', null, 'Show / copy the public key, export the private key', () => showPub(k.fp)));
      if (k.saved && !k.jwk) btns.append(btn('Unlock', null, 'Enter the passphrase to use this key now', async () => { if (await ensureUnlocked(k.fp)) SSH.toast('Unlocked ' + k.name); }));
      if (k.saved && k.jwk) btns.append(btn('Lock', null, 'Remove the decrypted key from memory', () => { R.lock(k.fp); SSH.toast('Locked ' + k.name); }));
      if (!k.saved && R.canRemember) btns.append(btn('Remember…', null, 'Save this key on this device, encrypted with a passphrase', () => rememberExisting(k.fp)));
      btns.append(btn('Forget', 'red', 'Remove this key' + (k.saved ? ' from this device' : ''), () => forget(k.fp)));
      li.append(el('span', 'k-id', k.name), el('span', 'k-fp', k.alg + (k.bits ? ' ' + k.bits : '') + ' ' + k.fp), el('span', 'k-when', status), btns);
      ul.append(li);
    });
    $('y-empty').hidden = !!list.length;
    $('y-note').textContent = R.canRemember ? 'Keys are kept in memory for this visit. "Remember" saves a key on this device, encrypted with your passphrase (never in plain text).'
      : 'This browser cannot save keys here (no IndexedDB). Keys are kept in memory for this visit only.';
  }
  function panel() { SSH.menu(false); renderPanel(); $('ydlg').hidden = false; setTimeout(() => $('y-close').focus(), 0); }
  const closePanel = () => { $('ydlg').hidden = true; };

  async function forget(fp) {
    const k = R.get(fp);
    if (!k) return;
    const used = SSH.Store.hosts.list().filter((h) => h.key === fp).map((h) => h.name);
    if (!(await SSH.ask({ title: 'Forget key?', danger: true, yes: 'Forget',
      text: k.name + '\n' + k.fp + '\n\n' + (k.saved ? 'It is removed from this device. ' : '') + 'Keep a copy (Export) if you still need it.' + (used.length ? '\nUsed by: ' + used.join(', ') + ' (they will use the password).' : '') }))) return;
    try { await R.forget(fp); SSH.toast('Forgot ' + k.name); } catch (e) { SSH.ask({ title: 'Could not forget the key', no: false, text: e.message || String(e) }); }
  }

  async function askNewPass(title, text) {
    const a = await SSH.ask({ title, password: true, yes: 'Next', text: text + '\nAt least ' + MIN_PASS + ' characters.' });
    if (a == null) return null;
    if (a.length < MIN_PASS) { await SSH.ask({ title, no: false, text: 'The passphrase must have at least ' + MIN_PASS + ' characters.' }); return null; }
    const b = await SSH.ask({ title, password: true, yes: 'Save', text: 'Enter the same passphrase again.' });
    if (b == null) return null;
    if (a !== b) { await SSH.ask({ title, no: false, text: 'The passphrases do not match.' }); return null; }
    return a;
  }
  async function rememberExisting(fp) {
    const k = R.get(fp);
    if (!k) return;
    const p = await askNewPass('Remember key', 'Choose a passphrase to encrypt "' + k.name + '" on this device. You need it to unlock the key after a reload.');
    if (p == null) return;
    try { await R.remember(fp, p); SSH.toast('Saved ' + k.name + ' (encrypted)'); } catch (e) { SSH.ask({ title: 'Could not save the key', no: false, text: e.message || String(e) }); }
  }

  /* ---- import / generate dialog ---- */
  function openAdd(m) {
    mode = m; fileText = ''; fileName = '';
    $('i-title').textContent = m === 'gen' ? 'Generate key (ECDSA P-256)' : 'Import private key';
    ['i-text-row', 'i-file-row', 'i-kpass-row'].forEach((id) => { $(id).hidden = m === 'gen'; });
    $('i-name').value = ''; $('i-text').value = ''; $('i-file').value = ''; $('i-kpass').value = '';
    $('i-file-note').textContent = '';
    $('i-rem').checked = false; $('i-rem').disabled = !R.canRemember;
    $('i-rem-row').title = R.canRemember ? '' : 'Not available in this browser';
    $('i-dpass').value = ''; $('i-dpass2').value = ''; $('i-dpass-rows').hidden = true;
    $('i-err').hidden = true;
    $('i-yes').textContent = m === 'gen' ? 'Generate' : 'Import';
    $('i-yes').disabled = false;
    $('i-name').placeholder = m === 'gen' ? 'phone-browser' : 'from the key comment';
    $('idlg').hidden = false;
    setTimeout(() => $(m === 'gen' ? 'i-name' : 'i-text').focus(), 0);
  }
  function closeAdd() { $('idlg').hidden = true; fileText = ''; $('i-text').value = ''; $('i-kpass').value = ''; $('i-dpass').value = ''; $('i-dpass2').value = ''; }
  function addErr(msg, field) { $('i-err').textContent = msg; $('i-err').hidden = !msg; if (field) setTimeout(() => $(field).focus(), 0); }

  async function submitAdd() {
    const rem = $('i-rem').checked, dp = $('i-dpass').value;
    if (rem && dp.length < MIN_PASS) return addErr('The device passphrase must have at least ' + MIN_PASS + ' characters.', 'i-dpass');
    if (rem && dp !== $('i-dpass2').value) return addErr('The device passphrases do not match.', 'i-dpass2');
    addErr('');
    $('i-yes').disabled = true;
    const was = $('i-yes').textContent;
    $('i-yes').textContent = mode === 'gen' ? 'Generating…' : 'Reading…';
    try {
      let r;
      if (mode === 'gen') r = Object.assign(await K.generate(), { comment: '' });
      else r = await K.parse($('i-text').value.trim() || fileText, $('i-kpass').value);
      const name = $('i-name').value.trim() || r.comment || (mode === 'gen' ? 'browser key ' + new Date().toISOString().slice(0, 10) : fileName || r.alg);
      const k = await R.add({ jwk: r.jwk, comment: r.comment || (mode === 'gen' ? name : ''), name });
      if (rem) { $('i-yes').textContent = 'Encrypting…'; await R.remember(k.fp, dp); }
      closeAdd();
      SSH.toast((mode === 'gen' ? 'Generated ' : 'Imported ') + k.name + (rem ? ' (saved, encrypted)' : ''));
      if (mode === 'gen') showPub(k.fp);
    } catch (e) {
      const field = { 'need-pass': 'i-kpass', 'bad-pass': 'i-kpass' }[e.code] || (mode === 'gen' ? 'i-yes' : 'i-text');
      if (e.code === 'need-pass' || e.code === 'bad-pass') $('i-kpass-row').hidden = false;
      addErr(e.message || String(e), field);
    } finally { $('i-yes').disabled = false; $('i-yes').textContent = was; }
  }

  /* ---- public key / export dialog ---- */
  function showPub(fp) {
    const k = R.get(fp);
    if (!k) return;
    pubFp = fp;
    $('p-title').textContent = k.name;
    $('p-line').value = k.line;
    $('p-fp').textContent = k.alg + (k.bits ? ' ' + k.bits : '') + ' · ' + k.fp + '\nAdd this line to ~/.ssh/authorized_keys on the server, e.g.: echo \'<line>\' >> ~/.ssh/authorized_keys';
    $('p-epass').value = '';
    $('p-dl').textContent = k.jwk ? 'Download private key' : 'Unlock to export';
    $('pdlg').hidden = false;
    setTimeout(() => $('p-copy').focus(), 0);
  }
  const closePub = () => { $('pdlg').hidden = true; $('p-epass').value = ''; pubFp = null; };

  async function copyLine() {
    const t = $('p-line').value;
    try { await navigator.clipboard.writeText(t); SSH.toast('Public key copied'); return; } catch (_) { /* fall back */ }
    const ta = $('p-line'); ta.focus(); ta.select();
    try { SSH.toast(document.execCommand('copy') ? 'Public key copied' : 'Select the text and copy it'); } catch (_) { SSH.toast('Select the text and copy it'); }
  }

  async function download() {
    const fp = pubFp, k = R.get(fp);
    if (!k) return;
    if (!k.jwk) { if (await ensureUnlocked(fp)) showPub(fp); return; }
    const pass = $('p-epass').value;
    if (!pass && !(await SSH.ask({ title: 'Export without passphrase?', yes: 'Export', text: 'The file will hold the private key in plain text. Anyone with the file can log in as you. Set an export passphrase to protect it.' }))) return;
    let text;
    try { text = await R.exportText(fp, pass); } catch (e) { SSH.ask({ title: 'Export failed', no: false, text: e.message || String(e) }); return; }
    const base = (k.alg === 'ssh-rsa' ? 'id_rsa' : 'id_ecdsa') + '_' + (k.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 40) || 'key');
    const url = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
    const a = el('a'); a.href = url; a.download = base; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    $('p-epass').value = '';
    SSH.toast('Saved ' + base);
  }

  function init(o) {
    selects = (o && o.selects) || [];
    $('m-keys').addEventListener('click', panel);
    $('y-close').addEventListener('click', closePanel);
    $('ydlg').addEventListener('click', (e) => { if (e.target === $('ydlg')) closePanel(); });
    $('y-import').addEventListener('click', () => openAdd('import'));
    $('y-gen').addEventListener('click', () => openAdd('gen'));
    $('i-form').addEventListener('submit', (e) => { e.preventDefault(); submitAdd(); });
    $('i-no').addEventListener('click', closeAdd);
    $('idlg').addEventListener('click', (e) => { if (e.target === $('idlg')) closeAdd(); });
    $('i-rem').addEventListener('change', () => { $('i-dpass-rows').hidden = !$('i-rem').checked; if ($('i-rem').checked) setTimeout(() => $('i-dpass').focus(), 0); });
    $('i-file').addEventListener('change', async () => {
      const f = $('i-file').files && $('i-file').files[0];
      fileText = ''; fileName = '';
      if (!f) { $('i-file-note').textContent = ''; return; }
      if (f.size > 64 * 1024) { $('i-file-note').textContent = 'That file is too big for a key.'; return; }
      try { fileText = await f.text(); fileName = f.name.replace(/\.(pem|key)$/i, ''); $('i-text').value = ''; $('i-file-note').textContent = 'Loaded ' + f.name + ' (not shown).'; } catch (_) { $('i-file-note').textContent = 'Could not read the file.'; }
      $('i-file').value = '';
    });
    $('p-close').addEventListener('click', closePub);
    $('pdlg').addEventListener('click', (e) => { if (e.target === $('pdlg')) closePub(); });
    $('p-copy').addEventListener('click', copyLine);
    $('p-dl').addEventListener('click', download);
    R.onChange(() => { refreshSelects(); if (!$('ydlg').hidden) renderPanel(); if (pubFp && !R.get(pubFp)) closePub(); });
    refreshSelects();
  }

  /* Escape closes the top key dialog; returns true when it handled the key. */
  function escape() {
    if (!$('pdlg').hidden) { closePub(); return true; }
    if (!$('idlg').hidden) { closeAdd(); return true; }
    if (!$('ydlg').hidden) { closePanel(); return true; }
    return false;
  }

  return { init, panel, fillSelect, ensureUnlocked, escape, get open() { return !$('ydlg').hidden || !$('idlg').hidden || !$('pdlg').hidden; } };
})();
