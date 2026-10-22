/*
 * SSH — wiring: connect form, #host=user@host:22 hash, host key prompt, states, reconnect, keys.
 * States: form -> busy -> live -> gone (Reconnect / Edit). The password lives only in memory (pw).
 */
(() => {
  const { $, P } = SSH;
  let state = 'form', conn = null, pw = '', target = null, fromForm = true;
  const known = {}; /* host:port -> fingerprint accepted this visit (saving known_hosts comes in S2) */

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
    return true;
  }

  function setState(s, msg) {
    state = s;
    $('form').hidden = s !== 'form';
    $('term-wrap').hidden = s === 'form';
    $('busy').hidden = s !== 'busy';
    $('gone').hidden = s !== 'gone';
    if (s === 'gone') $('gone-text').textContent = msg || 'Disconnected.';
    const live = s === 'live';
    document.querySelectorAll('[data-need]').forEach((b) => { b.disabled = b.dataset.need === 'live' ? !live : s === 'form'; });
    $('keys').hidden = !(live && $('b-keys').getAttribute('aria-pressed') === 'true');
    const go = $('b-go');
    go.disabled = s === 'busy' || live;
    go.title = s === 'gone' ? 'Reconnect' : 'Connect';
    go.setAttribute('aria-label', go.title);
    $('dot').className = 'dot' + (live ? ' live' : s === 'busy' ? ' wait' : s === 'gone' ? ' bad' : '');
    $('dot').title = live ? 'Connected' : s === 'busy' ? 'Connecting' : 'Not connected';
    $('title').textContent = target && s !== 'form' ? target.user + '@' + target.host + (target.port !== '22' ? ':' + target.port : '') : 'SSH';
    $('size').textContent = live && SSH.Term.size ? SSH.Term.size.cols + '×' + SSH.Term.size.rows : '';
    if (live) SSH.Term.refit();
  }

  function formError(msg, field) {
    $('f-err').textContent = msg; $('f-err').hidden = !msg;
    if (field) setTimeout(() => $(field).focus(), 0);
  }

  async function onHostKey(info) {
    const id = target.host + ':' + target.port;
    if (known[id] === info.fp) return true;
    const changed = !!known[id];
    SSH.busy(null);
    const ok = await SSH.ask(changed
      ? { title: 'Host key changed!', danger: true, yes: 'Connect anyway', focusNo: true, text: id + ' now shows a different key than earlier. This can mean someone is intercepting the connection.\n\n' + info.alg + '\n' + info.fp }
      : { title: 'Trust this host?', yes: 'Trust and connect', text: 'First connection to ' + id + ' this time. Check the fingerprint matches the server (ssh-keygen -lf /etc/ssh/ssh_host_*_key.pub).\n\n' + info.alg + '\n' + info.fp });
    if (ok) known[id] = info.fp;
    SSH.busy('Logging in…');
    return ok;
  }

  async function connect() {
    if (state === 'busy' || state === 'live') return;
    if (state === 'form') {
      const relay = $('f-relay').value.trim(), host = $('f-host').value.trim(), user = $('f-user').value.trim();
      const port = String(parseInt($('f-port').value, 10) || 22);
      if (!relay) return formError('Enter the relay address, for example ws://192.168.1.10:8022', 'f-relay');
      if (!host) return formError('Enter the host to connect to.', 'f-host');
      if (!user) return formError('Enter your user name.', 'f-user');
      if (!$('f-pass').value) return formError('Enter the password.', 'f-pass');
      target = { relay, host, port, user }; pw = $('f-pass').value; fromForm = true;
      P.relay = relay; P.last = { user, host, port }; SSH.saveP();
    } else fromForm = false;
    formError('');
    setState('busy');
    SSH.busy('Connecting…');
    SSH.Term.reset();
    const size = SSH.Term.show();
    try {
      conn = await SSH.Conn.open(Object.assign({}, target, {
        password: pw, cols: size.cols, rows: size.rows, onHostKey,
        onData: (u8) => SSH.Term.write(u8),
        onClose: (msg) => { if (state === 'live') { SSH.Term.detach(); conn = null; setState('gone', msg || 'The connection was closed.'); } },
      }));
    } catch (err) {
      conn = null;
      SSH.busy(null);
      const m = err.message || String(err);
      if (fromForm) {
        setState('form');
        const field = { auth: 'f-pass', 'bad-relay': 'f-relay', 'relay-down': 'f-relay', 'relay-target': 'f-host' }[err.code] || 'f-go';
        if (err.code === 'auth') { $('f-pass').value = ''; pw = ''; }
        formError(m, field);
      } else {
        if (err.code === 'auth') pw = '';
        setState('gone', m);
      }
      return;
    }
    SSH.busy(null);
    $('f-pass').value = '';
    setState('live');
    SSH.Term.attach((d) => conn && conn.write(d), (c, r) => { if (conn) conn.resize(c, r); $('size').textContent = c + '×' + r; });
    const s = SSH.Term.size; if (s && (s.cols !== size.cols || s.rows !== size.rows)) conn.resize(s.cols, s.rows);
  }

  function reconnect() {
    if (!target) return setState('form');
    if (!pw) { /* password unknown (wrong last time): ask again in the form */
      setState('form'); fill(target); formError('Enter the password again.', 'f-pass'); return;
    }
    connect();
  }

  function disconnect() {
    if (!conn) return;
    SSH.Term.detach();
    conn.close(); conn = null;
    setState('gone', 'Disconnected.');
  }

  function fromHash() {
    const t = parseHash();
    if (!t) return false;
    if (state === 'live' || state === 'busy') return true;
    setState('form'); fill(t); formError('');
    setTimeout(() => $(t.user ? 'f-pass' : 'f-user').focus(), 0);
    return true;
  }

  SSH.init();
  $('f-relay').value = P.relay || '';
  $('form').addEventListener('submit', (e) => { e.preventDefault(); connect(); });
  $('b-go').addEventListener('click', () => (state === 'gone' ? reconnect() : connect()));
  $('gone-re').addEventListener('click', reconnect);
  $('gone-edit').addEventListener('click', () => { setState('form'); fill(target); setTimeout(() => $('f-pass').focus(), 0); });
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
    if (e.key === 'Escape') SSH.menu(false);
    if (state === 'gone' && e.key === 'Enter' && !SSH.dialogOpen) { e.preventDefault(); reconnect(); }
  });
  addEventListener('beforeunload', (e) => { if (state === 'live') { e.preventDefault(); e.returnValue = ''; } });
  if (matchMedia('(pointer: coarse)').matches) $('b-keys').setAttribute('aria-pressed', 'true');

  setState('form');
  if (!fromHash()) {
    if (P.last) fill(P.last);
    setTimeout(() => $(!P.relay ? 'f-relay' : P.last ? 'f-pass' : 'f-host').focus(), 0);
  }
})();
