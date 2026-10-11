/*
 * File Drop — filedrop_hub.js (release 3)
 * File Drop is the default general sender to the Hub. Joins the Hub with SharedLink
 * (shared/link) using the shared saved code ('shared-link-join-code', also written by the
 * Gamepad / OCR / Print phones), ?hub=CODE or #hub=CODE, the code box, or a scanned Hub QR.
 * - Pick files (bulk) → "Send to" list of connected devices by name (Hub first). Only the
 *   Hub connected → sent to it at once. Files go as app:'' (generic) so the Hub routes them
 *   (open app or viewer). Another device → SharedLink relay through the Hub (to: id).
 * - Received files (mesh from another device, or the Hub iframe contract when File Drop is
 *   open inside the Hub) → list with Save + Print; auto-download per device
 *   ('shared-link-auto-download', on by default).
 * - Disconnect (Hub panel) is the only thing that forgets the code.
 * The classic device ↔ device File Drop pairing below keeps working unchanged.
 */
(function (FD) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const AUTO_KEY = 'shared-link-auto-download';
  const inHub = window.parent && window.parent !== window;
  let queue = [];          // files waiting for a "Send to" choice
  let joined = false;

  const autoOn = () => { try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch (_) { return true; } };
  const fmt = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function btn(text, cls, fn) { const b = el('button', 'btn ' + (cls || ''), text); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function toast(t, k) { if (FD.ui) FD.ui.toast(t, k); }

  /* Hub code from the URL (?hub= / #hub=), else the shared saved one. */
  function startCode() {
    const q = new URLSearchParams(location.search).get('hub');
    const h = new URLSearchParams(location.hash.replace(/^#/, '')).get('hub');
    return String(q || h || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /* Code from a scanned Hub / Gamepad QR (…#code=1234, ?code=, ?hub=). '' when not a Hub QR. */
  function codeFromText(text) {
    try {
      const u = new URL(String(text).trim());
      if (!/controller|hub=|print-send|ocr_send|paper-keyboard/.test(u.href)) return '';
      const hp = new URLSearchParams(u.hash.replace(/^#/, ''));
      const c = hp.get('code') || hp.get('hub') || u.searchParams.get('code') || u.searchParams.get('hub') || '';
      return /^[A-Z0-9]{4,8}$/i.test(c) ? c.toUpperCase() : '';
    } catch (_) { return ''; }
  }

  function others() {
    const me = SharedLink.id;
    return SharedLink.devices.filter((d) => d.online && d.id !== me && d.id !== 'host');
  }

  /* ---------- UI ---------- */
  function paint() {
    const st = $('hub-state');
    const on = SharedLink.connected;
    $('hub').classList.toggle('on', on);
    st.textContent = inHub ? 'Inside the Hub · phones send here with the Hub QR' : (joined ? (on ? 'Hub connected · ' + SharedLink.code : SharedLink.status || 'Connecting…') : 'Not connected to a Hub');
    $('hub-join').hidden = inHub || joined;
    $('hub-send').hidden = inHub || !joined;
    $('hub-disc').hidden = inHub || !joined;
    paintTargets();
  }

  function paintTargets() {
    const box = $('hub-to');
    box.textContent = '';
    box.hidden = !queue.length;
    if (!queue.length) return;
    box.append(el('div', 'hub-to-title', 'Send ' + queue.length + (queue.length === 1 ? ' file' : ' files') + ' to:'));
    const hub = (SharedLink.devices.find((d) => d.id === 'host') || {}).name || 'Hub';
    box.append(btn('🖥 ' + hub, 'primary big', () => sendAll(undefined)));
    others().forEach((d) => box.append(btn('📱 ' + d.name, 'big', () => sendAll(d.id))));
    box.append(btn('Cancel', 'ghost', () => { queue = []; paintTargets(); }));
  }

  function choose(files) {
    queue = Array.from(files || []);
    if (!queue.length) return;
    if (!SharedLink.connected) { toast('Not connected to the Hub yet — files wait here.'); paintTargets(); return; }
    if (!others().length) sendAll(undefined);   // only the Hub: send at once
    else paintTargets();
  }

  async function sendAll(to) {
    const files = queue; queue = []; paintTargets();
    const bar = $('hub-bar');
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      bar.hidden = false;
      try {
        await SharedLink.sendFile(f, { app: '', to: to, onProgress: (d, t) => {
          bar.firstChild.textContent = (i + 1) + '/' + files.length + ' · ' + f.name + ' · ' + fmt(d) + ' / ' + fmt(t);
          bar.lastChild.firstChild.style.width = (t ? (100 * d / t) : 100) + '%';
        } });
      } catch (err) { toast('Could not send ' + f.name + ' (' + err.message + ')', 'err'); break; }
    }
    bar.firstChild.textContent = 'Sent ' + files.length + (files.length === 1 ? ' file ✓' : ' files ✓');
    setTimeout(() => { bar.hidden = true; }, 3000);
  }

  /* Received file → list row with Save + Print, auto-download when on. */
  function received(name, type, blob, from) {
    const file = new File([blob], name || 'file', { type: type || blob.type || '' });
    const url = URL.createObjectURL(file);
    const save = () => { const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove(); };
    const li = el('li', 'hub-rx');
    li.append(el('span', 'hub-rx-name', file.name + ' · ' + fmt(file.size)));
    li.append(btn('Save', '', save));
    if (window.FD_PRINT && FD_PRINT.can(file)) li.append(btn('Print 🖨', '', () => FD_PRINT.print(file)));
    $('hub-rx').prepend(li);
    $('hub-rx').hidden = false;
    if (autoOn() && !(FD.send && FD.send.isIOS)) save();
    toast('Received ' + file.name + (from ? ' from ' + from : ''));
  }

  function join(code) {
    if (!code) return;
    joined = true;
    SharedLink.join({ prefix: 'jtsites-', code: code }).catch(() => toast('PeerJS could not load (offline?)', 'err'));
    paint();
  }

  function build() {
    const sec = el('section', 'card hub');
    sec.id = 'hub';
    sec.innerHTML =
      '<div class="hub-head"><span class="dot" aria-hidden="true"></span><b>Hub</b> <span id="hub-state" role="status"></span></div>' +
      '<form id="hub-join" class="code-form" autocomplete="off"><input id="hub-code" maxlength="8" placeholder="Hub code" aria-label="Hub code" autocapitalize="characters">' +
      '<button class="btn primary" type="submit">Connect</button></form>' +
      '<div class="hub-actions"><button id="hub-send" class="btn primary big" type="button">Send files to Hub…</button>' +
      '<button id="hub-disc" class="btn ghost" type="button">Disconnect</button>' +
      '<label class="hub-auto"><input id="hub-auto" type="checkbox"> Auto-download</label></div>' +
      '<div id="hub-to" class="hub-to" hidden></div>' +
      '<div id="hub-bar" class="hub-bar" hidden><span></span><div class="track"><span></span></div></div>' +
      '<ul id="hub-rx" class="list" hidden></ul>' +
      '<input id="hub-file" type="file" multiple hidden>';
    $('main').prepend(sec);
    $('hub-auto').checked = autoOn();
    $('hub-auto').addEventListener('change', (e) => { try { localStorage.setItem(AUTO_KEY, e.target.checked ? '1' : '0'); } catch (_) { /* blocked */ } });
    $('hub-join').addEventListener('submit', (e) => { e.preventDefault(); join($('hub-code').value.trim().toUpperCase()); });
    $('hub-send').addEventListener('click', () => $('hub-file').click());
    $('hub-file').addEventListener('change', () => { choose($('hub-file').files); $('hub-file').value = ''; });
    $('hub-disc').addEventListener('click', () => { SharedLink.stop(); joined = false; queue = []; paint(); });
  }

  FD.hub = {
    /* filedrop_scan.js asks first: a Hub QR joins the Hub. */
    tryText(text) { const c = codeFromText(text); if (!c) return false; join(c); toast('Connecting to Hub ' + c + '…'); return true; },
  };

  function boot() {
    if (!window.SharedLink) return;
    build();
    ['status', 'devices', 'open', 'close'].forEach((ev) => SharedLink.on(ev, paint));
    SharedLink.on('file', (f) => received(f.name, f.type, f.blob, ((SharedLink.devices.find((d) => d.id === f.from) || {}).name) || ''));
    SharedLink.on('bye', () => { joined = false; SharedLink.stop(); paint(); toast('The Hub disconnected.'); });
    if (inHub) {
      // Desktop inside the Hub: the Hub owns the link; generic files open in the viewer, files
      // tagged app:'filedrop' come here.
      window.addEventListener('message', (e) => {
        const d = e.data;
        if (e.source === window.parent && d && d.sharedLink === 'file' && d.blob) received(d.name, d.type, d.blob, '');
      });
      window.parent.postMessage({ sharedLink: 'ready', app: 'filedrop', types: [] }, '*');
    } else {
      let code = startCode();
      if (!code) { try { code = localStorage.getItem('shared-link-join-code') || ''; } catch (_) { code = ''; } }
      if (code) join(code);
    }
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.FD);
