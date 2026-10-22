/*
 * SSH — wiring: connect form, saved hosts, #host=user@host:22 hash, host key check (saved known_hosts),
 * states, reconnect, auto-reconnect, keys.
 * States: form -> busy -> live -> gone (Reconnect / Edit). The password lives only in memory (pw).
 * S3 auto-reconnect: after an unexpected drop ('lost': network, relay, server, keepalive) it retries after
 * 1, 2, 5, 10, 30 s (5 tries) with the in-memory password. Never after Disconnect or when the remote shell ends.
 * Explicit Disconnect also clears the in-memory password: Reconnect then asks for it in the form.
 * S4 key login: target.key = key fingerprint. The key is tried first; a remembered key is unlocked with its
 * passphrase before connecting. If the server refuses the key (or the key is missing / stays locked) the password
 * is used: the one typed in the form, else a prompt (not during auto-reconnect). Auto-reconnect works with an
 * unlocked key alone. Disconnect forgets the password but an unlocked key stays in memory until Lock / reload.
 */
(() => {
  const { $, P } = SSH;
  const S = SSH.Store, R = SSH.Ring;
  let unlocking = false;
  let state = 'form', conn = null, pw = '', target = null, attempt = 0, ctl = null;
  /* auto-reconnect: n = tries made, timer/tick for the countdown, reason = why the link dropped */
  const auto = { on: false, n: 0, timer: null, tick: null, reason: '', last: '' };

  function parseHash() {
    const m = /(?:^#|&)host=([^&]+)/.exec(location.hash);
    if (!m) return null;
    const v = decodeURIComponent(m[1]);
    const r = /^(?:([^@]+)@)?(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(v);
    if (!r) return null;
    return { user: r[1] || '', host: r[2].replace(/^\[|\]$/g, ''), port: r[3] || '22' };
  }

  function fill(t) {
    if (!t) return false;
    if (t.user) $('f-user').value = t.user;
    $('f-host').value = t.host; $('f-port').value = t.port;
    $('f-pass').value = '';
    let key = t.key;
    if (key === undefined) { const h = t.user ? S.hosts.find(t.user, t.host, t.port) : null; key = h && h.key ? h.key : ''; }
    SSH.KeyUI.fillSelect($('f-key'), key || '');
    return true;
  }
  const keyReady = () => !!(target && target.key && R.get(target.key) && R.get(target.key).jwk);
  const passFocus = () => ($('f-key').value ? 'f-go' : 'f-pass');

  function setState(s, msg) {
    state = s;
    $('form').hidden = s !== 'form';
    $('term-wrap').hidden = s === 'form';
    $('busy').hidden = s !== 'busy';
    $('gone').hidden = s !== 'gone';
    if (s === 'gone') $('gone-text').textContent = msg || 'Disconnected.';
    $('gone-cancel').hidden = !(s === 'gone' && auto.on);
    const live = s === 'live';
    document.querySelectorAll('[data-need]').forEach((b) => { b.disabled = b.dataset.need === 'live' ? !live : s === 'form'; });
    $('keys').hidden = !(live && $('b-keys').getAttribute('aria-pressed') === 'true');
    const go = $('b-go');
    go.disabled = s === 'busy' || live;
    go.title = s === 'gone' ? 'Reconnect' : 'Connect';
    go.setAttribute('aria-label', go.title);
    $('dot').className = 'dot' + (live ? ' live' : s === 'busy' || auto.on ? ' wait' : s === 'gone' ? ' bad' : '');
    $('dot').title = live ? 'Connected' : s === 'busy' ? 'Connecting' : auto.on ? 'Reconnecting' : 'Not connected';
    $('title').textContent = target && s !== 'form' ? target.user + '@' + target.host + (target.port !== '22' ? ':' + target.port : '') : 'SSH';
    $('size').textContent = live && SSH.Term.size ? SSH.Term.size.cols + '×' + SSH.Term.size.rows : '';
    if (s === 'form') SSH.Hosts.render();
    if (live) SSH.Term.refit();
  }

  function formError(msg, field) {
    $('f-err').textContent = msg; $('f-err').hidden = !msg;
    if (field) setTimeout(() => $(field).focus(), 0);
  }

  const when = (t) => { try { return new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' }); } catch (_) { return '?'; } };
  /* Saved known_hosts (S3): a matching key connects without a prompt; a new one asks; a changed one warns. */
  async function onHostKey(info, my) {
    const id = S.hostId(target.host, target.port);
    const c = S.known.check(id, info);
    if (c.status === 'known') { S.known.seen(id); return true; }
    const busyText = $('busy-text').textContent;
    SSH.busy(null);
    const ok = await SSH.ask(c.status === 'changed'
      ? { title: 'Host key changed!', danger: true, yes: 'Replace key', no: 'Cancel', focusNo: true,
        text: id + ' now shows a different key than the one you trusted. This can mean someone is intercepting the connection. Replace the key only if you know the server was reinstalled or its keys were changed.\n\n'
          + 'Saved (first seen ' + when(c.entry.first) + '):\n' + c.entry.alg + '\n' + c.entry.fp + '\n\nNow:\n' + info.alg + '\n' + info.fp }
      : { title: 'Trust this host?', yes: 'Trust and connect',
        text: 'First connection to ' + id + '. Check the fingerprint matches the server (ssh-keygen -lf /etc/ssh/ssh_host_*_key.pub). It is saved, so you are only asked again if it changes.\n\n' + info.alg + '\n' + info.fp });
    if (my !== attempt) return false; /* this attempt was cancelled or timed out meanwhile */
    if (ok) S.known.trust(id, info);
    SSH.busy(busyText.replace(/^Connecting/, 'Logging in'));
    return ok;
  }

  /* mode: 'form' (from the form), 're' (Reconnect button), 'auto' (auto-reconnect try) */
  async function connect(mode) {
    if (state === 'busy' || state === 'live') return;
    mode = mode || (state === 'form' ? 'form' : 're');
    if (mode === 'form') {
      const relay = $('f-relay').value.trim(), host = $('f-host').value.trim(), user = $('f-user').value.trim();
      const port = String(parseInt($('f-port').value, 10) || 22);
      if (!relay) return formError('Enter the relay address, for example ws://192.168.1.10:8022', 'f-relay');
      if (!host) return formError('Enter the host to connect to.', 'f-host');
      if (!user) return formError('Enter your user name.', 'f-user');
      const key = $('f-key').value;
      if (!key && !$('f-pass').value) return formError('Enter the password.', 'f-pass');
      target = { relay, host, port, user, key }; pw = $('f-pass').value;
      P.relay = relay; P.last = { user, host, port, key }; SSH.saveP();
    }
    /* S4: the login key (unlock a remembered key first; never prompts during auto-reconnect) */
    const keys = [];
    let keyNote = '';
    if (target.key) {
      let k = R.get(target.key);
      if (k && !k.jwk && mode !== 'auto') {
        if (unlocking) return;
        unlocking = true;
        try { await SSH.KeyUI.ensureUnlocked(target.key); } finally { unlocking = false; }
        if (state === 'busy' || state === 'live') return;
        k = R.get(target.key);
      }
      if (k && k.jwk) {
        try { keys.push({ kp: await R.libKey(k.fp), name: k.name }); } catch (e) { keyNote = 'The key "' + k.name + '" could not be loaded (' + (e.message || e) + ').'; }
      } else keyNote = k ? 'The key "' + k.name + '" is locked.' : 'The chosen key is not on this device (Menu → SSH keys → Import).';
      if (keyNote && !pw && mode === 'auto') { stopAuto(); setState('gone', keyNote); return; }
      if (keyNote) SSH.toast(keyNote + ' Using the password.', 3500);
    }
    if (mode !== 'auto') stopAuto();
    formError('');
    const my = ++attempt;
    ctl = new AbortController();
    setState('busy');
    SSH.busy(mode === 'auto' ? 'Reconnecting… (try ' + auto.n + ' of ' + S.BACKOFF.length + ')' : 'Connecting…');
    if (mode === 'form') SSH.Term.reset();
    const size = SSH.Term.show();
    let c;
    try {
      c = await SSH.Conn.open(Object.assign({}, target, {
        password: pw, keys, cols: size.cols, rows: size.rows, signal: ctl.signal,
        keepAliveSec: P.keepAliveSec > 0 ? P.keepAliveSec : 30,
        onHostKey: (info) => onHostKey(info, my),
        onPassword: mode === 'auto' ? null : () => askPassword(my, keys.length > 0),
        onData: (u8) => SSH.Term.write(u8),
        onClose: (msg, kind) => { if (conn === c) dropped(msg, kind); },
      }));
    } catch (err) {
      if (my !== attempt) return; /* superseded */
      ctl = null;
      SSH.cancelDialog(); /* S3-F2: no stale host key prompt after a failure */
      SSH.busy(null);
      const m = err.message || String(err);
      if (err.code === 'auth') pw = '';
      if (err.code === 'cancelled' && mode !== 'auto' && /^Login/.test(m)) { setState(mode === 'form' ? 'form' : 'gone', 'Login cancelled.'); if (mode === 'form') formError('Login cancelled.'); return; }
      if (mode === 'auto') {
        if (err.code === 'cancelled') return; /* cancelAuto() already showed the message */
        if (['auth', 'hostkey', 'bad-relay'].includes(err.code)) { stopAuto(); setState('gone', m); return; }
        auto.last = m; schedule(); return;
      }
      if (mode === 'form') {
        setState('form');
        if (err.code === 'cancelled') return formError('');
        const field = { auth: err.keyRefused && !err.pwRefused ? 'f-key' : 'f-pass', 'bad-relay': 'f-relay', 'relay-down': 'f-relay', 'relay-target': 'f-host' }[err.code] || 'f-go';
        if (err.code === 'auth') $('f-pass').value = '';
        formError(m, field);
      } else setState('gone', err.code === 'cancelled' ? 'Connection cancelled.' : m);
      return;
    }
    ctl = null;
    conn = c;
    const wasAuto = mode === 'auto';
    stopAuto();
    SSH.busy(null);
    $('f-pass').value = '';
    if (mode !== 'form') SSH.Term.write(new TextEncoder().encode('\r\n\x1b[2m--- ' + (wasAuto ? 'reconnected' : 'new session') + ' ---\x1b[0m\r\n'));
    setState('live');
    if (wasAuto) SSH.toast('Reconnected');
    SSH.Term.attach((d) => conn && conn.write(d), (cl, r) => { if (conn) conn.resize(cl, r); $('size').textContent = cl + '×' + r; });
    const s = SSH.Term.size; if (s && (s.cols !== size.cols || s.rows !== size.rows)) conn.resize(s.cols, s.rows);
  }

  /* The live session closed by itself. kind 'lost' -> auto-reconnect; 'exit' -> stay down. */
  function dropped(msg, kind) {
    if (state !== 'live') return;
    SSH.Term.detach(); conn = null;
    if (kind === 'lost' && (pw || keyReady())) { auto.on = true; auto.n = 0; auto.reason = msg || 'Connection lost.'; auto.last = ''; schedule(); return; }
    setState('gone', msg || 'The connection was closed.');
  }

  function schedule() {
    clearTimeout(auto.timer); clearInterval(auto.tick);
    const d = S.backoff(auto.n);
    if (d == null) {
      stopAuto();
      setState('gone', auto.reason + '\nCould not reconnect after ' + S.BACKOFF.length + ' tries.' + (auto.last ? '\n' + auto.last : ''));
      return;
    }
    auto.on = true;
    let left = d;
    const show = () => setState('gone', auto.reason + (auto.last ? '\nLast try: ' + auto.last.split('\n')[0] : '') + '\nReconnecting in ' + left + ' s (try ' + (auto.n + 1) + ' of ' + S.BACKOFF.length + ')…');
    show();
    auto.tick = setInterval(() => { left--; if (left > 0) show(); }, 1000);
    auto.timer = setTimeout(() => { clearInterval(auto.tick); auto.n++; connect('auto'); }, d * 1000);
  }

  function stopAuto() {
    clearTimeout(auto.timer); clearInterval(auto.tick);
    auto.timer = auto.tick = null; auto.on = false;
  }

  function cancelAuto() {
    if (!auto.on) return;
    const why = auto.reason;
    stopAuto();
    if (ctl) { ctl.abort(); ctl = null; }
    attempt++;
    SSH.cancelDialog();
    SSH.busy(null);
    setState('gone', why + '\nAuto-reconnect cancelled.');
  }

  /* Cancel on the busy overlay: abort the connect in progress. */
  function cancelBusy() {
    if (state !== 'busy') return;
    if (auto.on) return cancelAuto();
    if (ctl) ctl.abort();
  }

  function reconnect() {
    if (!target) return setState('form');
    if (!pw && !target.key) { /* password unknown (wrong last time, or cleared by Disconnect): ask again in the form */
      stopAuto(); setState('form'); fill(target); formError('Enter the password again.', 'f-pass'); return;
    }
    stopAuto();
    connect('re');
  }

  function disconnect() {
    if (!conn) return;
    stopAuto();
    SSH.Term.detach();
    conn.close(); conn = null;
    pw = ''; /* explicit Disconnect: forget the password (Reconnect asks for it again) */
    setState('gone', 'Disconnected.');
  }

  function edit() { stopAuto(); pw = ''; setState('form'); fill(target); setTimeout(() => $(passFocus()).focus(), 0); }

  /* S4: password fallback when the key is refused (or no password was typed). Resolves to the password or null. */
  async function askPassword(my, hadKey) {
    if (my !== attempt) return null;
    const busyText = $('busy-text').textContent;
    SSH.busy(null);
    const who = target.user + '@' + target.host;
    const p = await SSH.ask({ title: 'Password', password: true, yes: 'Log in',
      text: (hadKey ? 'The server did not accept the key for ' + who + '.\n' : '') + 'Password for ' + who + ':' });
    if (my !== attempt) return null;
    if (p) pw = p; /* kept in memory for Reconnect / auto-reconnect, like a typed password */
    SSH.busy(busyText.replace(/^Connecting/, 'Logging in'));
    return p || null;
  }

  function fromHash() {
    const t = parseHash();
    if (!t) return false;
    if (state === 'live' || state === 'busy') return true;
    stopAuto();
    setState('form'); fill(t); formError('');
    setTimeout(() => $(t.user ? passFocus() : 'f-user').focus(), 0);
    return true;
  }

  /* Quick connect from a saved host: fill the form, focus the password. */
  function pick(h) {
    fill(h); formError('');
    setTimeout(() => $(passFocus()).focus(), 0);
  }

  function saveFromForm() {
    const user = $('f-user').value.trim(), host = $('f-host').value.trim(), port = String(parseInt($('f-port').value, 10) || 22);
    const ex = host && user ? S.hosts.find(user, host, port) : null;
    SSH.Hosts.edit(ex ? Object.assign({}, ex, { key: $('f-key').value }) : { user, host, port, key: $('f-key').value });
  }

  SSH.init();
  SSH.KeyUI.init({ selects: [$('f-key'), $('h-key')] });
  $('f-key').addEventListener('change', () => {
    const k = $('f-key').value;
    $('f-pass-label').textContent = k ? 'Password (optional: used if the key is refused)' : 'Password';
  });
  SSH.Hosts.init({ pick });
  $('f-relay').value = P.relay || '';
  $('form').addEventListener('submit', (e) => { e.preventDefault(); connect('form'); });
  $('f-save').addEventListener('click', saveFromForm);
  $('b-go').addEventListener('click', () => (state === 'gone' ? reconnect() : connect()));
  $('gone-re').addEventListener('click', reconnect);
  $('gone-edit').addEventListener('click', edit);
  $('gone-cancel').addEventListener('click', cancelAuto);
  $('busy-cancel').addEventListener('click', cancelBusy);
  $('b-off').addEventListener('click', disconnect);
  $('b-copy').addEventListener('click', () => SSH.Term.copy());
  $('b-paste').addEventListener('click', () => SSH.Term.paste());
  $('b-keys').addEventListener('click', () => {
    const on = $('b-keys').getAttribute('aria-pressed') !== 'true';
    $('b-keys').setAttribute('aria-pressed', String(on));
    $('keys').hidden = !(on && state === 'live');
    SSH.Term.focus();
  });
  $('font-seg').addEventListener('click', (e) => { const d = +(e.target.dataset && e.target.dataset.d); if (d) SSH.Term.font(d); });
  addEventListener('hashchange', fromHash);
  addEventListener('keydown', (e) => {
    if (SSH.dialogOpen && e.key === 'Escape') { $('dlg-no').hidden ? $('dlg-yes').click() : $('dlg-no').click(); return; }
    if (e.key === 'Escape' && SSH.KeyUI.escape()) return;
    if (e.key === 'Escape' && SSH.Hosts.escape()) return;
    if (e.key === 'Escape') { SSH.menu(false); if (state === 'gone' && auto.on) cancelAuto(); }
    if (state === 'gone' && e.key === 'Enter' && !SSH.dialogOpen && !SSH.Hosts.open && !SSH.KeyUI.open) { e.preventDefault(); reconnect(); }
  });
  addEventListener('beforeunload', (e) => { if (state === 'live') { e.preventDefault(); e.returnValue = ''; } });
  if (matchMedia('(pointer: coarse)').matches) $('b-keys').setAttribute('aria-pressed', 'true');

  setState('form');
  if (!fromHash()) {
    if (P.last) fill(P.last); /* last used stays a prefill; it becomes a saved host only via Save host */
    setTimeout(() => $(!P.relay ? 'f-relay' : P.last ? passFocus() : 'f-host').focus(), 0);
  }
})();
