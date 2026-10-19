/*
 * Phone as a key — phone page logic (apps/tools/phonekey/phonekey.js).
 * 1. Join the Hub's SharedLink with ?hub=<code> (shared/link/link_core.js, same as the Gamepad).
 * 2. "Sign in with Google" → GoogleGis.token() (Mail's web client, drive + openid email).
 * 3. Send {type:'phonekey', k:<room from the QR>, access_token, expires_in, email, scope} to the
 *    Hub (waits until the link is up). The Hub answers phonekey-ok (+ a "next" room for Send
 *    again, kept only in this page's memory) or phonekey-bad (reason shown).
 * The token is never put in a URL or stored on the phone.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const code = (q.get('hub') || '').trim();
  let room = (q.get('k') || '').trim();
  let pending = null, busy = false;
  // drop the room from the address bar (it is single-use anyway)
  try { history.replaceState(null, '', location.pathname); } catch (_) { /* ignore */ }

  const msg = (t, cls) => { $('msg').textContent = t; $('msg').className = 'pk-msg ' + (cls || ''); };
  if (!code || !room) {
    $('link').textContent = 'Scan the QR on the computer first.';
    $('go').disabled = true;
    return;
  }

  function flush() {
    if (!pending || !SharedLink.connected) return;
    SharedLink.send(pending);
    pending = null;
    msg('Sending\u2026');
  }
  SharedLink.on('status', (t, state) => {
    $('link').textContent = state === 'linked' ? 'Connected to the Hub \u2713' : (t || 'Connecting\u2026');
    $('link').classList.toggle('ok', state === 'linked');
  });
  SharedLink.on('open', flush);
  SharedLink.on('message', (m) => {
    if (!m || !/^phonekey-/.test(m.type || '')) return;
    if (m.type === 'phonekey-ok') {
      room = m.next || '';
      msg('Sent \u2713 \u2014 you can close this', 'ok');
      $('go').hidden = true;
      $('again').hidden = !room;
    } else {
      msg(m.reason || 'The Hub did not accept it.', 'bad');
      $('go').disabled = false;
    }
  });
  SharedLink.join({ prefix: 'jtsites-', code, meta: { phonekey: 1 } });

  async function signIn(again) {
    if (busy) return;
    if (!room) { msg('Show a new QR on the computer.', 'bad'); return; }
    busy = true;
    $('go').disabled = true; $('again').disabled = true;
    msg('Opening Google\u2026');
    try {
      const r = await GoogleGis.token(again ? { prompt: '' } : {});
      if (r.partial) msg('Tip: tick "See, edit, create and delete all of your Google Drive files" for full Drive.', 'bad');
      pending = { type: 'phonekey', k: room, access_token: r.access_token, expires_in: +r.expires_in || 3600, email: r.email || '', scope: r.scope || '' };
      if (!SharedLink.connected) msg('Signed in \u2014 waiting for the Hub link\u2026');
      flush();
    } catch (e) {
      msg(String(e && e.message || e), 'bad');
      $('go').disabled = false;
    } finally {
      busy = false;
      $('again').disabled = false;
    }
  }
  $('go').addEventListener('click', () => signIn(false));
  $('again').addEventListener('click', () => signIn(true));
})();
