/*
  Project: print
  File: print_host.js
  Role: Host station (print.html). Registers peer id PEER_PREFIX + 4 digits
  and shows a QR of print-send.html?code=1234, the 4 digits big, and a
  short link to type on a phone. The code is kept in localStorage so a
  reload keeps it; if the old tab still holds the id on the broker, the
  same code is retried with backoff, then a new one is picked.
  On connect the QR hides and Ready is shown. A new sender takes over from
  the old one (no 'busy'). Files arrive in base64 chunks, are listed under
  Files with a Print button, and the browser print dialog opens on arrival.
*/

/* localStorage key for this station's code. */
const HOST_CODE_KEY = 'jtprint-host-code';

/* Delays (ms) for re-trying a remembered code that the broker still holds. */
const ID_RETRY_MS = [1500, 3000, 5000, 8000];

/* Delays (ms) for broker / network trouble. Last value repeats. */
const NET_RETRY_MS = [2000, 4000, 8000, 15000];

/* Fresh random codes to try before giving up (each clash picks another). */
const MAX_NEW_CODES = 8;

/* Local PeerJS peer. */
let peer = null;

/* Active sender connection. Null when idle. */
let activeConn = null;

/* Current 4-digit code. */
let hostCode = '';

/* True while the code came from storage and may still be held by an old tab. */
let codeRemembered = false;

/* Retry counters and timer. */
let idRetry = 0;
let netRetry = 0;
let newCodeTries = 0;
let retryTimer = 0;

/* In-progress file assemblies, keyed by transfer id. */
const incoming = {};

/* File history rows, newest last. */
const fileHistory = [];

/*
  Status line in the header.
*/
function setHostStatus(text) {
  document.getElementById('host-status').textContent = text;
}

/*
  Turn a finished base64 payload into a Blob.
*/
function blobFromBase64(b64, mime) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}

/*
  Open the browser print dialog for a received blob.
  Images are written into the iframe. PDFs are loaded as the iframe src.
  print() may be blocked because the receive is not a click; history has a retry.
*/
function printBlob(blob, mime, name) {
  const frame = document.getElementById('print-frame');
  const url = URL.createObjectURL(blob);
  if (mime === 'application/pdf') {
    frame.onload = function () {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch (err) {
        /* Dialog blocked or unsupported. Row button can retry. */
      }
    };
    frame.src = url;
    return url;
  }
  frame.onload = null;
  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(
    '<!DOCTYPE html><html><head><title>' +
      name.replace(/[<>&"]/g, '') +
      '</title><style>@page{margin:12mm}html,body{margin:0}img{max-width:100%;height:auto;display:block}</style></head><body><img src="' +
      url +
      '"></body></html>'
  );
  doc.close();
  const img = doc.querySelector('img');
  const fire = function () {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (err) {
      /* Dialog blocked. Row button can retry. */
    }
  };
  if (img && !img.complete) {
    img.onload = fire;
  } else {
    setTimeout(fire, 150);
  }
  return url;
}

/*
  Paint the file history under Ready.
*/
function renderHistory() {
  const list = document.getElementById('file-list');
  list.innerHTML = '';
  if (!fileHistory.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No files yet.';
    list.appendChild(empty);
    return;
  }
  fileHistory.forEach(function (item) {
    const row = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'file-meta';
    const title = document.createElement('strong');
    title.textContent = item.name;
    const sub = document.createElement('span');
    sub.textContent = item.when + ' · ' + item.mime;
    meta.appendChild(title);
    meta.appendChild(sub);
    const again = document.createElement('button');
    again.type = 'button';
    again.textContent = 'Print';
    again.addEventListener('click', function () {
      printBlob(item.blob, item.mime, item.name);
    });
    row.appendChild(meta);
    row.appendChild(again);
    list.appendChild(row);
  });
}

/*
  Store a finished file and try to print it.
*/
function acceptFile(name, mime, blob) {
  fileHistory.push({
    name: name,
    mime: mime,
    blob: blob,
    when: new Date().toLocaleTimeString()
  });
  renderHistory();
  printBlob(blob, mime, name);
}

/*
  Forget half-received files when the sender goes away.
*/
function clearIncoming() {
  Object.keys(incoming).forEach(function (id) {
    delete incoming[id];
  });
}

/*
  Handle one message from the active sender.
*/
function onHostData(conn, data) {
  if (!data || !data.t) {
    return;
  }
  if (data.t === 'hello') {
    trySend(conn, { t: 'ready' });
    return;
  }
  if (data.t === 'bye') {
    dropSender(conn, 'Sender disconnected');
    return;
  }
  if (data.t === 'meta') {
    incoming[data.id] = {
      name: data.name || 'file',
      mime: data.mime || '',
      parts: []
    };
    setHostStatus('Receiving ' + (data.name || 'file') + '…');
    return;
  }
  if (data.t === 'chunk' && incoming[data.id]) {
    incoming[data.id].parts.push(data.d);
    return;
  }
  if (data.t === 'end' && incoming[data.id]) {
    const job = incoming[data.id];
    delete incoming[data.id];
    const blob = blobFromBase64(job.parts.join(''), job.mime);
    setHostStatus('Received ' + job.name);
    acceptFile(job.name, job.mime, blob);
  }
}

/*
  Host UI: idle shows QR, linked shows Ready and Disconnect.
*/
function setHostLinked(linked, text) {
  document.getElementById('qr-panel').hidden = linked;
  document.getElementById('ready-panel').hidden = !linked;
  document.getElementById('host-disconnect').hidden = !linked;
  setHostStatus(text || (linked ? 'Sender connected' : 'Waiting for a scan · code ' + hostCode));
}

/*
  Forget one sender connection. Only the active one changes the UI.
*/
function dropSender(conn, text) {
  if (conn !== activeConn) {
    tryClose(conn);
    return;
  }
  activeConn = null;
  clearIncoming();
  tryClose(conn);
  setHostLinked(false, text ? text + ' · waiting for a scan' : '');
}

/*
  Disconnect button. Never throws; the UI always returns to the QR.
*/
function hostDisconnect() {
  const conn = activeConn;
  activeConn = null;
  clearIncoming();
  if (conn) {
    trySend(conn, { t: 'bye' });
    /* Let the bye leave before the channel closes. */
    setTimeout(function () {
      tryClose(conn);
    }, 150);
  }
  setHostLinked(false);
}

/*
  Bind a sender data connection. A new sender takes over from the old one,
  because the old link is usually a phone that reloaded or rescanned.
*/
function takeConnection(conn) {
  conn.on('open', function () {
    const old = activeConn;
    if (old && old !== conn) {
      trySend(old, { t: 'bye', reason: 'replaced' });
      setTimeout(function () {
        tryClose(old);
      }, 150);
    }
    activeConn = conn;
    clearIncoming();
    setHostLinked(true);
    /* Confirm the data channel, not only the peer link. */
    trySend(conn, { t: 'ready' });
  });
  conn.on('data', function (data) {
    if (conn === activeConn) {
      onHostData(conn, data);
    }
  });
  conn.on('close', function () {
    dropSender(conn, 'Sender left');
  });
  conn.on('error', function () {
    dropSender(conn, 'Link error');
  });
}

/*
  Draw the QR, the big code and the short link for this code.
  qrcode-generator SVG with a 4-module white quiet zone.
*/
function showQr(code) {
  const url = senderUrl(code);
  const box = document.getElementById('qr');
  box.innerHTML = '';
  if (typeof qrcode === 'undefined') {
    box.textContent = 'QR lib missing';
  } else {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    /* 6px cells, margin 24px = 4 modules of quiet zone. */
    box.innerHTML = qr.createSvgTag(6, 24);
    const svg = box.querySelector('svg');
    if (svg) {
      svg.removeAttribute('width');
      svg.removeAttribute('height');
    }
  }
  document.getElementById('host-code').textContent = code;
  document.getElementById('join-url').textContent = senderLinkText();
}

/*
  Destroy the current peer without throwing.
*/
function destroyPeer() {
  clearTimeout(retryTimer);
  const old = peer;
  peer = null;
  if (old) {
    try {
      old.destroy();
    } catch (err) {
      /* Already gone. */
    }
  }
}

/*
  Register PEER_PREFIX + code on the broker.
  isRetry keeps the retry counters (same code, backoff in progress).
*/
function startPeer(code, isRetry) {
  if (!isRetry) {
    idRetry = 0;
    netRetry = 0;
  }
  destroyPeer();
  hostCode = code;
  setHostStatus(isRetry ? 'Re-registering code ' + code + '…' : 'Starting code ' + code + '…');
  const myPeer = new Peer(PEER_PREFIX + code, peerOptions());
  peer = myPeer;

  myPeer.on('open', function () {
    if (peer !== myPeer) {
      return;
    }
    idRetry = 0;
    netRetry = 0;
    newCodeTries = 0;
    codeRemembered = true;
    saveKey(HOST_CODE_KEY, code);
    showQr(code);
    setHostLinked(!!(activeConn && activeConn.open));
  });

  myPeer.on('connection', function (conn) {
    if (peer !== myPeer) {
      return;
    }
    takeConnection(conn);
  });

  myPeer.on('error', function (err) {
    if (peer !== myPeer) {
      return;
    }
    const type = err && err.type;
    if (type === 'unavailable-id') {
      if (codeRemembered && idRetry < ID_RETRY_MS.length) {
        /* A reloaded tab may still hold this id for a few seconds. Keep the code. */
        const wait = ID_RETRY_MS[idRetry];
        idRetry += 1;
        setHostStatus('Code ' + code + ' still in use, retrying ' + idRetry + '/' + ID_RETRY_MS.length + '…');
        destroyPeer();
        retryTimer = setTimeout(function () {
          startPeer(code, true);
        }, wait);
        return;
      }
      /* Taken by someone else. Pick another code. */
      codeRemembered = false;
      newCodeTries += 1;
      if (newCodeTries > MAX_NEW_CODES) {
        destroyPeer();
        setHostStatus('Could not get a free code. Press New code.');
        return;
      }
      startPeer(randomCode(code), false);
      return;
    }
    if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
      const wait = NET_RETRY_MS[Math.min(netRetry, NET_RETRY_MS.length - 1)];
      netRetry += 1;
      setHostStatus('Network problem, retrying…');
      destroyPeer();
      retryTimer = setTimeout(function () {
        startPeer(code, true);
      }, wait);
      return;
    }
    if (type === 'peer-unavailable') {
      /* Only for outgoing connects. The host makes none. */
      return;
    }
    setHostStatus('Peer error: ' + (type || 'unknown'));
  });

  myPeer.on('disconnected', function () {
    if (peer !== myPeer || myPeer.destroyed) {
      return;
    }
    /* Lost the broker. An open sender link keeps working; re-register for new scans. */
    setHostStatus(activeConn ? 'Sender connected (broker offline)' : 'Reconnecting to broker…');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(function () {
      if (peer !== myPeer || myPeer.destroyed) {
        return;
      }
      try {
        myPeer.reconnect();
      } catch (err) {
        startPeer(code, true);
      }
    }, NET_RETRY_MS[Math.min(netRetry, NET_RETRY_MS.length - 1)]);
    netRetry += 1;
  });
}

/*
  New code button. Drops any sender and registers a fresh code.
*/
function newCode() {
  if (activeConn) {
    hostDisconnect();
  }
  codeRemembered = false;
  newCodeTries = 0;
  startPeer(randomCode(hostCode), false);
}

/*
  Start the host station. Reuse the remembered code when there is one.
*/
function startHost() {
  document.getElementById('host-disconnect').addEventListener('click', hostDisconnect);
  document.getElementById('new-code').addEventListener('click', newCode);
  renderHistory();
  /* Leaving: tell the sender, and free the id on the broker so a reload gets it back fast. */
  window.addEventListener('pagehide', function () {
    if (activeConn) {
      trySend(activeConn, { t: 'bye' });
    }
    destroyPeer();
  });
  /* Back from the browser page cache: register the same code again. */
  window.addEventListener('pageshow', function (event) {
    if (event.persisted && !peer && hostCode) {
      codeRemembered = true;
      startPeer(hostCode, false);
    }
  });
  const saved = loadKey(HOST_CODE_KEY);
  if (CODE_RE.test(saved)) {
    codeRemembered = true;
    startPeer(saved, false);
  } else {
    codeRemembered = false;
    startPeer(randomCode(''), false);
  }
}

/* Boot only on the host page. */
if (PAGE === 'host') {
  startHost();
}
