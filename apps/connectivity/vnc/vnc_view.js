/* vnc_view.js — VNC1 viewer: noVNC RFB over the relay (?token=host:port), status/errors, Reconnect, pop-up toolbar. */
import RFB from './vendor/novnc/core/rfb.js';

const $ = (id) => document.getElementById(id);
let rfb = null, cur = null, ok = false, authFail = false;

function status(msg, canRetry) {
  $('status').hidden = !msg; $('statusText').textContent = msg || '';
  $('reconnect').hidden = !canRetry;
}
export function toast(t) { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (e.hidden = true), 2500); }

/** Build the relay URL the SSH relay expects: ws(s)://relay/?token=host:port */
export function relayUrl(h) {
  const u = new URL(h.relay.trim());
  if (u.protocol === 'https:') u.protocol = 'wss:'; if (u.protocol === 'http:') u.protocol = 'ws:';
  if (!/^wss?:$/.test(u.protocol)) throw new Error('The relay URL must start with ws:// or wss://');
  if (location.protocol === 'https:' && u.protocol === 'ws:') throw new Error('This page is on https, so the relay must be wss:// (see readme).');
  u.searchParams.set('token', (h.host.includes(':') ? '[' + h.host + ']' : h.host) + ':' + h.port);
  return u.href;
}

const askPw = () => new Promise((res) => {
  const d = $('pw'); $('pwInput').value = ''; d.showModal();
  d.addEventListener('close', () => res(d.returnValue === 'ok' ? $('pwInput').value : null), { once: true });
});

export function connect(h) {
  cur = h; ok = false; authFail = false; disconnect(true);
  $('home').hidden = true; $('view').hidden = false; $('tools').hidden = true;
  let url; try { url = relayUrl(h); } catch (e) { status(e.message, false); return; }
  status('Connecting to ' + h.name + '…', false);
  try { rfb = new RFB($('screen'), url, { credentials: { password: h.password || '' } }); }
  catch (e) { status('Could not start: ' + e.message, true); return; }
  rfb.scaleViewport = true; rfb.resizeSession = false; rfb.showDotCursor = true;
  rfb.addEventListener('connect', () => { ok = true; status(''); toast('Connected'); });
  rfb.addEventListener('credentialsrequired', async () => {
    const p = h.password && !authFail ? h.password : await askPw();
    if (p == null) { disconnect(); status('Cancelled.', true); return; }
    rfb.sendCredentials({ password: p });
  });
  rfb.addEventListener('securityfailure', (e) => { authFail = true; status('Login failed: ' + (e.detail.reason || 'wrong password'), true); });
  rfb.addEventListener('disconnect', (e) => {
    rfb = null; if (authFail) return;
    if (!ok) status('Could not reach the relay or the VNC server. Check the relay is running, the URL, and allowlist.txt.', true);
    else status(e.detail.clean ? 'Disconnected.' : 'Connection lost.', true);
  });
  rfb.addEventListener('clipboard', (e) => navigator.clipboard && navigator.clipboard.writeText(e.detail.text).catch(() => {}));
}

export function disconnect(silent) { if (rfb) { const r = rfb; rfb = null; try { r.disconnect(); } catch (_) {} } if (!silent) status('Disconnected.', true); }

export function initView(goHome) {
  $('reconnect').onclick = () => cur && connect(cur);
  $('back').onclick = () => { disconnect(true); goHome(); };
  $('handle').onclick = () => { $('tools').hidden = !$('tools').hidden; };
  const kbd = $('kbdInput');
  kbd.addEventListener('input', () => { if (rfb) for (const ch of kbd.value) rfb.sendKey(ch.codePointAt(0) < 256 ? ch.codePointAt(0) : 0x1000000 + ch.codePointAt(0)); kbd.value = ''; });
  kbd.addEventListener('keydown', (e) => {
    const m = { Backspace: [0xff08, 'Backspace'], Enter: [0xff0d, 'Enter'], Tab: [0xff09, 'Tab'], Escape: [0xff1b, 'Escape'] }[e.key];
    if (m && rfb) { rfb.sendKey(m[0], m[1]); e.preventDefault(); }
  });
  $('tools').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'bye') { disconnect(true); $('tools').hidden = true; goHome(); return; }
    if (a === 'full') { document.fullscreenElement ? document.exitFullscreen() : $('view').requestFullscreen().catch(() => toast('Fullscreen not allowed')); }
    if (!rfb) { if (a !== 'full') toast('Not connected'); return; }
    if (a === 'cad') { rfb.sendCtrlAltDel(); toast('Sent Ctrl-Alt-Del'); }
    if (a === 'kbd') { $('tools').hidden = true; kbd.focus(); }
    if (a === 'clip') {
      let t = null; try { t = await navigator.clipboard.readText(); } catch (_) { t = prompt('Text to send to the remote clipboard:'); }
      if (t) { rfb.clipboardPasteFrom(t); toast('Clipboard sent'); }
    }
    if (a === 'scale') { rfb.scaleViewport = !rfb.scaleViewport; rfb.clipViewport = !rfb.scaleViewport; b.textContent = 'Scale: ' + (rfb.scaleViewport ? 'fit' : '1:1'); }
    if (a === 'viewonly') { rfb.viewOnly = !rfb.viewOnly; b.textContent = 'View only: ' + (rfb.viewOnly ? 'on' : 'off'); }
  };
}
