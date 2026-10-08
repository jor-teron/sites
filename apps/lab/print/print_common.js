/*
  Project: print
  File: print_common.js
  Role: Shared constants and helpers for the host (print.html) and the
  sender (print-send.html). Loaded first; print_host.js or print_send.js
  boots the page from body data-page (host | send).
  Peer ids are PEER_PREFIX + a 4-digit code, so the QR, the link and the
  manual code box all carry only the 4 digits.
  PeerJS runs with its default config (public broker + its free TURN relay),
  so phones on mobile data or another Wi-Fi can still reach the station.
*/

/* Raw slice size of the base64 payload. Kept small so one JSON message fits the data channel. */
const CHUNK_SIZE = 8000;

/* Pause when the browser data-channel buffer is above this many bytes. */
const BUFFER_HIGH = 64 * 1024;

/* Mime used when the camera capture has no file type. */
const CAMERA_MIME = 'image/jpeg';

/* Peer id prefix. Must differ from the hub controller's 'jtsites-'. */
const PEER_PREFIX = 'jtprint-';

/* A station code is exactly 4 digits. */
const CODE_RE = /^[0-9]{4}$/;

/* Page role set on body: host or send. */
const PAGE = document.body.dataset.page;

/* Counter for transfer ids. crypto.randomUUID needs https; this works on plain http too. */
let transferCount = 0;

/*
  Build PeerJS options.
  No config block on purpose: PeerJS then uses its own default ICE list,
  which includes STUN and the free PeerJS TURN relay.
*/
function peerOptions() {
  return {
    debug: 1
  };
}

/*
  Random 4-digit code, 0000-9999. Optional avoid skips one code (used by New code).
*/
function randomCode(avoid) {
  let code = avoid;
  while (code === avoid) {
    code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  }
  return code;
}

/*
  Safe localStorage read. Private mode or blocked storage returns ''.
*/
function loadKey(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch (err) {
    return '';
  }
}

/*
  Safe localStorage write. Failures are ignored.
*/
function saveKey(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    /* Storage blocked. The code just will not survive a reload. */
  }
}

/*
  Absolute URL of the sender page for a code.
  The QR encodes this so a scan opens the sender and auto-connects.
*/
function senderUrl(code) {
  const url = new URL('print-send.html', window.location.href);
  url.searchParams.set('code', code);
  return url.toString();
}

/*
  Short readable sender link with no scheme and no query, for typing on a phone.
*/
function senderLinkText() {
  const url = new URL('print-send.html', window.location.href);
  return url.host + url.pathname;
}

/*
  Pull a 4-digit code out of scanned or pasted text.
  Accepts a bare code, a link with ?code=1234, or an older ?host=jtprint-1234.
  Returns '' when nothing usable is found.
*/
function parseCode(text) {
  const raw = String(text || '').trim();
  if (CODE_RE.test(raw)) {
    return raw;
  }
  let match = raw.match(/[?&#]code=([0-9]{4})(?![0-9])/);
  if (match) {
    return match[1];
  }
  match = raw.match(/jtprint-([0-9]{4})(?![0-9])/);
  if (match) {
    return match[1];
  }
  return '';
}

/*
  Next transfer id. Time plus counter is unique enough for one link.
*/
function nextTransferId() {
  transferCount += 1;
  return Date.now().toString(36) + '-' + transferCount;
}

/*
  Send one object. Throws if the data channel is not open, so the sender UI can show it.
*/
function sendControl(conn, payload) {
  if (!conn || !conn.open) {
    throw new Error('Data channel is not open');
  }
  conn.send(payload);
}

/*
  Best-effort send that never throws. Used for bye on disconnect.
*/
function trySend(conn, payload) {
  try {
    sendControl(conn, payload);
  } catch (err) {
    /* Channel already gone. Nothing to tell the other side. */
  }
}

/*
  Close a connection without throwing.
*/
function tryClose(conn) {
  try {
    if (conn) {
      conn.close();
    }
  } catch (err) {
    /* Already closed. */
  }
}

/*
  Wait until the browser socket has drained enough to accept another chunk.
  Flooding send() drops messages and looks like the file never left the phone.
*/
async function waitForDrain(conn) {
  const channel = conn && conn.dataChannel;
  if (!channel) {
    return;
  }
  let spins = 0;
  while (channel.bufferedAmount > BUFFER_HIGH && spins < 200) {
    await new Promise(function (resolve) {
      setTimeout(resolve, 25);
    });
    spins += 1;
  }
}

/*
  Read a File or Blob as a data-URL string.
*/
function readAsDataUrl(blob) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () {
      resolve(reader.result);
    };
    reader.onerror = function () {
      reject(reader.error);
    };
    reader.readAsDataURL(blob);
  });
}

/*
  Push one file across the data channel.
  Meta, then base64 slices, then end. Each slice waits for the buffer to drain.
*/
async function sendFile(conn, file, onProgress) {
  const id = nextTransferId();
  const dataUrl = await readAsDataUrl(file);
  const comma = dataUrl.indexOf(',');
  const b64 = dataUrl.slice(comma + 1);
  const name = file.name || ('photo-' + Date.now() + '.jpg');
  const mime = file.type || CAMERA_MIME;
  await waitForDrain(conn);
  sendControl(conn, {
    t: 'meta',
    id: id,
    name: name,
    mime: mime,
    size: file.size || b64.length
  });
  let offset = 0;
  while (offset < b64.length) {
    await waitForDrain(conn);
    sendControl(conn, {
      t: 'chunk',
      id: id,
      d: b64.slice(offset, offset + CHUNK_SIZE)
    });
    offset += CHUNK_SIZE;
    if (onProgress) {
      onProgress(Math.min(offset, b64.length), b64.length);
    }
  }
  await waitForDrain(conn);
  sendControl(conn, { t: 'end', id: id });
}
