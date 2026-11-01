/*
 * OCR — ocr_send.js  (computer side of "send from phone", release 3: SharedLink)
 * One Hub link (shared/link):
 * - Inside the Hub: posts {sharedLink:'ready', app:'ocr', types} to the Hub; the QR opens
 *   ocr_send.html#hub=<Hub code> so a phone joins the Hub's own link (or is already on it).
 *   Files tagged app:'ocr' arrive as {sharedLink:'file'} postMessages.
 * - Standalone: SharedLink host role with its own 4-digit code (FC5: Hub codes are 5 digits; prefix 'jtocr-', kept in
 *   localStorage 'jtocr-host-code' so a reload keeps it); the QR opens
 *   ocr_send.html#code=<code>&p=jtocr-. Phones may also type the code.
 * Only ✕ on the phone chip (manual Disconnect) ends the link. A received file goes through the
 * same path as a dropped one: image → OCR at once, PDF → page 1 (type checked by magic bytes).
 */
(function (OCR) {
  'use strict';

  const SND = OCR.send = {};
  const X = OCR.sendCommon;
  const S = OCR.state;
  const C = () => OCR.config.send;
  const A = () => OCR.config.accept;
  const ST = () => OCR.config.text.status;
  const $ = (id) => document.getElementById(id);
  const PREFIX = 'jtocr-';
  const CODE_KEY = 'jtocr-host-code';
  const inHub = window.parent && window.parent !== window;
  let hubCode = '';       // set when the Hub answered hello
  let started = false;    // standalone host running

  // ----- link + QR -----
  function isLocalHost(h) {
    return !h || h === 'localhost' || /^127\./.test(h) || h === '[::1]' || /^10\./.test(h) ||
      /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /\.local$/i.test(h);
  }
  SND.phoneUrl = () => {
    const base = (location.protocol === 'file:' || isLocalHost(location.hostname))
      ? new URL(C().phonePage, C().publicBaseUrl) : new URL(C().phonePage, location.href);
    base.search = '';
    base.hash = hubCode ? 'hub=' + hubCode : 'code=' + SharedLink.code + '&p=' + PREFIX;
    return base.href;
  };

  function renderQr(url) {
    const host = $('qr-img');
    host.innerHTML = '';
    if (typeof qrcode === 'undefined') { host.textContent = 'QR library missing'; return; }
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url); qr.make();
      host.innerHTML = qr.createSvgTag(4, 16);
      const svg = host.querySelector('svg');
      if (svg) {
        const px = Math.max(120, Math.min(200, window.innerHeight - 140));
        svg.setAttribute('width', px); svg.setAttribute('height', px);
        svg.style.display = 'block'; svg.style.background = '#fff';
      }
    } catch (err) { host.textContent = 'QR error'; console.warn('[ocr] qr', err); }
  }

  function qrState(msg, err) {
    const el = $('qr-state');
    el.textContent = msg;
    el.classList.toggle('err', !!err);
  }

  function phones() { return hubCode ? [] : SharedLink.devices.filter((d) => d.online && !d.legacy); }

  // ----- UI: QR box, phone chip -----
  function syncUi() {
    const on = phones().length > 0;
    $('qr-btn').hidden = on;
    $('phone-chip').hidden = !on;
    if (on) $('phone-chip-text').textContent = '📱 ' + phones().map((d) => d.name).join(', ');
  }

  function paintQr() {
    const code = hubCode || SharedLink.code;
    if (!code) return;
    const url = SND.phoneUrl();
    renderQr(url);
    const a = $('qr-link');
    a.textContent = (hubCode ? 'Hub code ' : 'Code ') + code + ' · ' + url; a.href = url;
  }

  function startHost() {
    if (started) return Promise.resolve();
    started = true;
    qrState('Starting…');
    return SharedLink.host({ prefix: PREFIX, codeKey: CODE_KEY }).then(paintQr,
      () => { started = false; qrState('PeerJS could not load (offline?)', true); });
  }

  SND.openQr = () => {
    if (typeof qrcode === 'undefined') { OCR.status('Send from phone is not available (files missing)', 'err'); return; }
    if (OCR.ui && OCR.ui.closeKey) OCR.ui.closeKey();
    if (hubCode) { paintQr(); qrState('Scan with the phone (uses the Hub link)'); }
    else startHost().then(paintQr);
    $('qr-pop').hidden = false;
  };
  SND.closeQr = () => { $('qr-pop').hidden = true; };
  SND.isQrOpen = () => !$('qr-pop').hidden;

  /* Manual Disconnect: bye to the phones, then listen again on the same code. */
  SND.disconnect = () => {
    if (hubCode) return;
    SharedLink.stop(true);
    started = false;
    try { localStorage.removeItem('jtocr-host-linked'); } catch (_) { /* blocked */ }
    OCR.status('Phone disconnected', '');
    setTimeout(() => { startHost(); syncUi(); }, 400);
  };
  SND.connected = () => phones().length > 0;
  SND.abort = () => {};

  // ----- receiving -----
  async function accept(blob, name) {
    if (S.busy) { OCR.status('Busy — file from phone refused', 'err'); return; }
    if (!(blob.size > 0) || blob.size > A().maxBytes) { OCR.status(ST().tooBig + ' (from phone)', 'err'); return; }
    const type = await X.sniffBlob(blob);
    if (!type || A().types.indexOf(type) === -1) { OCR.status(ST().wrongType + ' (from phone)', 'err'); return; }
    $('qr-pop').hidden = true;
    OCR.jobs.openFiles([new File([blob], X.safeName(name, type), { type: type })], [], { auto: true });
  }

  function bootStandalone() {
    SharedLink.on('devices', () => {
      syncUi();
      if (phones().length) { try { localStorage.setItem('jtocr-host-linked', '1'); } catch (_) { /* blocked */ } }
    });
    SharedLink.on('open', () => { $('qr-pop').hidden = true; OCR.status('📱 Phone connected — choose a file on the phone', 'ok'); });
    SharedLink.on('status', (t, st) => { if (SND.isQrOpen()) qrState(st === 'listening' ? 'Waiting for phone… code ' + SharedLink.code : t, st === 'error'); });
    SharedLink.on('progress', (p) => { if (!p.out && p.size) OCR.status('Receiving from phone… ' + Math.round(100 * p.done / p.size) + '%', 'work'); });
    SharedLink.on('file', (f) => accept(f.blob, f.name));
    window.addEventListener('pagehide', () => SharedLink.pause());
    // A phone was linked before this reload: listen again at once so it reconnects.
    let linked = '';
    try { linked = localStorage.getItem('jtocr-host-linked') || ''; } catch (_) { /* blocked */ }
    if (linked) startHost();
  }

  // ----- init -----
  SND.init = () => {
    const tap = OCR.ui.onTap;
    tap($('qr-btn'), () => (SND.isQrOpen() ? SND.closeQr() : SND.openQr()));
    tap($('qr-close'), () => SND.closeQr());
    tap($('phone-x'), () => SND.disconnect());
    document.addEventListener('pointerdown', (e) => {
      if (SND.isQrOpen() && !e.target.closest('#qr-pop, #qr-btn')) SND.closeQr();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && SND.isQrOpen()) { e.preventDefault(); e.stopImmediatePropagation(); SND.closeQr(); }
    }, true);
    if (!window.SharedLink) { syncUi(); return; }
    if (inHub) {
      let decided = false;
      window.addEventListener('message', (e) => {
        const d = e.data;
        if (e.source !== window.parent || !d || typeof d !== 'object') return;
        if (d.sharedLink === 'hello' && d.code) { decided = true; hubCode = String(d.code); if (SND.isQrOpen()) paintQr(); }
        else if (d.sharedLink === 'file' && d.blob) accept(d.blob, d.name);
      });
      window.parent.postMessage({ sharedLink: 'ready', app: 'ocr', types: ['image/', 'application/pdf'] }, '*');
      setTimeout(() => { if (!decided) bootStandalone(); }, 700);
    } else bootStandalone();
    syncUi();
  };
})(window.OCR);
