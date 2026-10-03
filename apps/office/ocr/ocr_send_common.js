/*
 * OCR — ocr_send_common.js
 * Shared by the computer page (ocr_send.js) and the phone page (ocr_send_phone.js):
 * file-type check by magic bytes and random ids. No DOM.
 *
 * Protocol (PeerJS data connection, default binary serialization, ordered + reliable):
 *   phone → computer  {t:'hello', token, client}         first message, else the link is closed
 *   computer → phone  {t:'welcome'} | {t:'bad'} | {t:'refused'}
 *   phone → computer  {t:'file', id, name, type, size, chunks}
 *   computer → phone  {t:'go', id} | {t:'busy', id} | {t:'err', id, msg}
 *   phone → computer  ArrayBuffer chunks (config.send.chunkBytes each), then {t:'end', id}
 *   computer → phone  {t:'ack', id, n} every ackEvery chunks, then {t:'got', id} | {t:'err', id, msg}
 *   computer → phone  {t:'bye', reason}                  session ended (✕ / idle) — no reconnect
 */
(function (OCR) {
  'use strict';

  const X = OCR.sendCommon = {};

  // bytes: Uint8Array of the first ≥1 KB of the file. Returns a MIME type or ''.
  X.sniff = (b) => {
    if (!b || b.length < 4) return '';
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) return 'image/png';
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    // "%PDF-" must be in the first 1 KB (readers allow a little junk before it)
    const n = Math.min(b.length, 1024) - 5;
    for (let i = 0; i <= n; i++) {
      if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46 && b[i + 4] === 0x2D) return 'application/pdf';
    }
    return '';
  };

  X.sniffBlob = async (blob) => X.sniff(new Uint8Array(await blob.slice(0, 1024).arrayBuffer()));

  X.ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };

  // Random [a-z0-9] string from crypto.getRandomValues
  X.rand = (len) => {
    const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const a = new Uint8Array(len);
    crypto.getRandomValues(a);
    let s = '';
    for (let i = 0; i < len; i++) s += abc[a[i] % 36];
    return s;
  };

  X.safeName = (name, type) => {
    let n = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 120);
    if (!n) n = 'phone-' + new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    const want = X.ext[type];
    if (want && !/\.[a-z0-9]{2,5}$/i.test(n)) n += want;
    return n;
  };
})(window.OCR = window.OCR || {});
