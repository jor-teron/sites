/*
 * SSH — core UI: settings + theme, small menu, own dialog (confirm / alert / text input), toast.
 * Settings (ssh-settings-v1): theme, relay URL, font size, last user/host/port (last used, prefills the form),
 * keepAliveSec (optional, default 30; no UI). Never the password.
 */
const SSH = (() => {
  const $ = (id) => document.getElementById(id);
  const SKEY = 'ssh-settings-v1';
  const P = Object.assign({ theme: 'dark', relay: '', font: 14, last: null },
    (() => { try { return JSON.parse(localStorage.getItem(SKEY) || '{}'); } catch (_) { return {}; } })());
  const saveP = () => { try { localStorage.setItem(SKEY, JSON.stringify(P)); } catch (_) { /* private mode */ } };

  function theme() {
    const t = localStorage.getItem('sites-hub.theme');
    const dark = P.theme === 'dark' || (P.theme === 'system' && (t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)));
    document.documentElement.classList.toggle('dark', dark);
    document.querySelectorAll('#theme-seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === P.theme));
    if (SSH.Term) SSH.Term.theme();
  }

  let tt;
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove('on'), ms || 2200);
  }

  /* ask({ title, text, yes, no, danger, input }) -> Promise<boolean | string | null>.
     no:false = alert. input:true shows a textarea and resolves to its text (null on cancel). */
  let pending = null;
  function ask(o) {
    if (pending) pending(false);
    $('dlg-title').textContent = o.title || '';
    $('dlg-text').textContent = o.text || '';
    const yes = $('dlg-yes'), no = $('dlg-no'), inp = $('dlg-input');
    yes.textContent = o.yes || 'OK';
    yes.classList.toggle('danger', !!o.danger);
    no.hidden = o.no === false;
    no.textContent = o.no || 'Cancel';
    inp.hidden = !o.input;
    inp.value = '';
    $('dlg').hidden = false;
    setTimeout(() => (o.input ? inp : (o.focusNo ? no : yes)).focus(), 0);
    return new Promise((res) => {
      pending = (v) => {
        pending = null; $('dlg').hidden = true;
        res(o.input ? (v ? inp.value : null) : v);
      };
    });
  }

  function menu(open) {
    const m = $('menu');
    const show = open === undefined ? m.hidden : open;
    m.hidden = !show;
    $('b-menu').setAttribute('aria-expanded', String(show));
  }

  function busy(text) {
    $('busy').hidden = !text;
    if (text) $('busy-text').textContent = text;
  }

  const RELAY_HELP = 'The browser cannot open SSH (TCP) connections itself, so a small relay (websockify) runs on your PC or an always-on machine and passes the encrypted bytes through.\n\n' +
    '1. Install Python 3, then: pip install websockify\n' +
    '2. Put the hosts you want to reach in relay/allowlist.txt (one host:port per line).\n' +
    '3. Run relay/start-relay.bat (Windows) or relay/start-relay.sh (Linux/macOS).\n' +
    '4. Relay URL here: ws://<PC address>:8022 (or wss:// with a certificate).\n\n' +
    'Only expose the relay on your home network or a VPN, never to the internet. The relay never sees your password or what you type: SSH encryption happens in this page.';

  function init() {
    theme();
    $('theme-seg').addEventListener('click', (e) => {
      const v = e.target.dataset && e.target.dataset.v;
      if (!v) return;
      P.theme = v; saveP(); theme();
    });
    $('b-menu').addEventListener('click', (e) => { e.stopPropagation(); menu(); });
    document.addEventListener('pointerdown', (e) => { if (!$('menu').hidden && !e.target.closest('#menu, #b-menu')) menu(false); });
    $('dlg-yes').addEventListener('click', () => pending && pending(true));
    $('dlg-no').addEventListener('click', () => pending && pending(false));
    $('dlg').addEventListener('click', (e) => { if (e.target === $('dlg') && pending) pending(false); });
    $('m-relay').addEventListener('click', () => { menu(false); ask({ title: 'Relay help', no: false, text: RELAY_HELP }); });
    $('m-about').addEventListener('click', () => {
      menu(false);
      ask({ title: 'SSH 1.3', no: false, text: 'SSH terminal: password login, resize, copy/paste, reconnect (S1); saved hosts, saved host keys (known hosts), keepalive and auto-reconnect (S3).\nEncryption runs in this page; the relay only forwards encrypted bytes. The password is never saved.\nxterm.js 6.0.0 (MIT) and Microsoft dev-tunnels-ssh 3.12.42 (MIT).' });
    });
    addEventListener('storage', (e) => { if (e.key === 'sites-hub.theme') theme(); });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
  }

  /* cancelDialog(): close an open ask() as if Cancel was pressed (e.g. the connection failed under a prompt). */
  const cancelDialog = () => { if (pending) pending(false); };

  return { $, P, saveP, toast, ask, cancelDialog, menu, busy, init, theme, get dialogOpen() { return !!pending; } };
})();
