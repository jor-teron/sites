/*
  Project: print
  File: print_host.js
  Role: Host station (print.html). Registers peer id PEER_PREFIX + 4 digits
  and shows a QR of print-send.html?code=1234, the 4 digits big, and a
  short link to type on a phone. Header: title, short status, New code
  (idle) / Disconnect (linked). Transfer bar and history live in the body.
  Reconnect rules:
  - The code is kept in localStorage 'jtprint-host-code', so a reload keeps
    it; if the old tab still holds the id on the broker, the same code is
    retried with backoff, then a new one is picked.
  - 'jtprint-host-linked' is set while a phone is linked and kept when the
    link drops without a bye (phone reload, network), so after a drop or a
    host reload the station says 'Waiting for phone to reconnect…'; the phone
    reconnects by itself. A manual Disconnect on either side (bye) or New
    code clears it. Leaving the page only destroys the peer (no bye), which
    frees the code on the broker fast.
  - A new phone takes over from the old one (old one gets bye 'replaced').
  Files arrive in base64 chunks with a live 'Receiving … x / y MB' bar, are
  saved to history (print_store.js: localStorage list + IndexedDB blobs,
  last 50) and the browser print dialog opens on arrival. History rows show
  name · size · time · kind with a Print button; Clear empties it.
*/

/* localStorage key for this station's code. */
const HOST_CODE_KEY = 'jtprint-host-code';

/* localStorage flag: a phone was linked and has not manually disconnected. */
const HOST_LINKED_KEY = 'jtprint-host-linked';

/* Delays (ms) for re-trying a remembered code that the broker still holds. */
const ID_RETRY_MS = [1500, 3000, 5000, 8000];

/* Delays (ms) for broker / network trouble. Last value repeats. */
const NET_RETRY_MS = [2000, 4000, 8000, 15000];

/* Fresh random codes to try before giving up (each clash picks another). */
const MAX_NEW_CODES = 8;

/* Minimum ms between receive bar repaints. */
const BAR_EVERY_MS = 120;

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

/* File history rows {id,name,mime,size,ts}, oldest first. Loaded from storage. */
let fileHistory = [];

/* Blobs received this session, keyed by history id (saves an IndexedDB read). */
const sessionBlobs = {};

/* Object URL of the last printed file, revoked on the next print. */
let lastPrintUrl = '';

/* Counter for history ids. */
let historyCount = 0;

/*
  Shortcut for getElementById.
*/
function el(id) {
  return document.getElementById(id);
}

/*
  Short status line in the header.
*/
function setHostStatus(text) {
  el('host-status').textContent = text;
}

/*
  True while a phone was linked and has not manually disconnected.
*/
function phoneExpected() {
  return loadKey(HOST_LINKED_KEY) === '1';
}

/*
  Header status while idle: waiting for the known phone, or for a scan.
*/
function idleStatus() {
  return phoneExpected() ? 'Waiting for phone to reconnect…' : 'Waiting · code ' + hostCode;
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
  Open the browser print dialog for a blob.
  Images are written into the iframe. PDFs are loaded as the iframe src.
  print() may be blocked because the receive is not a click; history has a retry.
*/
function printBlob(blob, mime, name) {
  const frame = el('print-frame');
  if (lastPrintUrl) {
    URL.revokeObjectURL(lastPrintUrl);
  }
  const url = URL.createObjectURL(blob);
  lastPrintUrl = url;
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
    return;
  }
  frame.onload = null;
  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(
    '<!DOCTYPE html><html><head><title>' +
      String(name).replace(/[<>&"]/g, '') +
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
}

/*
  Print a history row. Uses this session's blob, else loads it from IndexedDB.
*/
async function printItem(item) {
  let blob = sessionBlobs[item.id];
  if (!blob) {
    try {
      blob = await PrintStore.getBlob(item.id);
    } catch (err) {
      blob = null;
    }
  }
  if (!blob) {
    PrintBar.set(el('host-bar'), { name: item.name, state: 'fail', sub: 'File is no longer stored on this PC' });
    return;
  }
  printBlob(blob, item.mime, item.name);
}

/*
  Paint the file history, newest first.
*/
function renderHistory() {
  const list = el('file-list');
  list.innerHTML = '';
  el('clear-history').hidden = !fileHistory.length;
  if (!fileHistory.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No files yet.';
    list.appendChild(empty);
    return;
  }
  fileHistory.slice().reverse().forEach(function (item) {
    const row = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'file-meta';
    const title = document.createElement('strong');
    title.textContent = item.name;
    const sub = document.createElement('span');
    sub.textContent = formatSize(item.size) + ' · ' + formatTime(item.ts) + ' · ' + formatKind(item.mime, item.name);
    meta.appendChild(title);
    meta.appendChild(sub);
    const again = document.createElement('button');
    again.type = 'button';
    again.textContent = 'Print';
    again.addEventListener('click', function () {
      printItem(item);
    });
    row.appendChild(meta);
    row.appendChild(again);
    list.appendChild(row);
  });
}

/*
  Store a finished file (session + IndexedDB), trim to the cap, and print it.
*/
function acceptFile(name, mime, blob) {
  historyCount += 1;
  const item = {
    id: 'f' + Date.now().toString(36) + '-' + historyCount,
    name: name,
    mime: mime,
    size: blob.size,
    ts: Date.now()
  };
  fileHistory.push(item);
  sessionBlobs[item.id] = blob;
  while (fileHistory.length > PrintStore.MAX_FILES) {
    const old = fileHistory.shift();
    delete sessionBlobs[old.id];
    PrintStore.deleteBlob(old.id).catch(function () {
      /* Already gone. */
    });
  }
  PrintStore.saveList(fileHistory);
  PrintStore.putBlob(item.id, blob).catch(function () {
    /* Storage full or blocked. Printable this session only. */
  });
  renderHistory();
  printBlob(blob, mime, name);
}

/*
  Clear button in the history heading. Empties the list and IndexedDB.
*/
function clearHistory() {
  if (!fileHistory.length) {
    return;
  }
  if (!window.confirm('Clear all ' + fileHistory.length + ' files from this station?')) {
    return;
  }
  fileHistory = [];
  Object.keys(sessionBlobs).forEach(function (id) {
    delete sessionBlobs[id];
  });
  PrintStore.clearAll().catch(function () {
    /* Nothing stored. */
  });
  renderHistory();
}

/*
  Paint the receive bar for one job.
*/
function paintReceive(job, force) {
  const now = Date.now();
  if (!force && now - job.painted < BAR_EVERY_MS) {
    return;
  }
  job.painted = now;
  const total = job.size || 1;
  const done = Math.min(job.size, job.bytes);
  const speed = formatSpeed(done, now - job.start);
  PrintBar.set(el('host-bar'), {
    name: 'Receiving ' + job.name + '…',
    pct: (done / total) * 100,
    sub: formatProgress(done, job.size) + (speed ? ' · ' + speed : ''),
    state: 'busy'
  });
}

/*
  Forget half-received files when the sender goes away; mark the bar stopped.
*/
function clearIncoming() {
  Object.keys(incoming).forEach(function (id) {
    PrintBar.set(el('host-bar'), { name: incoming[id].name, state: 'fail', sub: 'Stopped — phone link lost' });
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
    /* Only sent on a manual Disconnect (or by an old build). Forget the phone. */
    removeKey(HOST_LINKED_KEY);
    dropSender(conn);
    return;
  }
  if (data.t === 'meta') {
    incoming[data.id] = {
      name: data.name || 'file',
      mime: data.mime || '',
      size: Number(data.size) || 0,
      bytes: 0,
      start: Date.now(),
      painted: 0,
      parts: []
    };
    paintReceive(incoming[data.id], true);
    return;
  }
  if (data.t === 'chunk' && incoming[data.id]) {
    const job = incoming[data.id];
    job.parts.push(data.d);
    /* base64 length to bytes, about 3/4. */
    job.bytes += Math.floor(((data.d || '').length * 3) / 4);
    paintReceive(job, false);
    return;
  }
  if (data.t === 'end' && incoming[data.id]) {
    const job = incoming[data.id];
    delete incoming[data.id];
    const blob = blobFromBase64(job.parts.join(''), job.mime);
    PrintBar.set(el('host-bar'), {
      name: job.name,
      state: 'ok',
      sub: 'Received ✓ — printing · ' + formatSize(blob.size)
    });
    acceptFile(job.name, job.mime, blob);
  }
}

/*
  Host UI: idle shows QR + New code, linked shows Ready + Disconnect.
*/
function setHostLinked(linked) {
  el('qr-panel').hidden = linked;
  el('ready-panel').hidden = !linked;
  el('host-disconnect').hidden = !linked;
  el('new-code').hidden = linked;
  el('wait-note').hidden = linked || !phoneExpected();
  setHostStatus(linked ? 'Phone connected' : idleStatus());
}

/*
  Forget one sender connection. Only the active one changes the UI.
  The linked flag stays unless a bye cleared it, so the phone may come back.
*/
function dropSender(conn) {
  if (conn !== activeConn) {
    tryClose(conn);
    return;
  }
  activeConn = null;
  clearIncoming();
  tryClose(conn);
  setHostLinked(false);
}

/*
  Disconnect button. Never throws; tells the phone (bye) so it stops
  reconnecting, clears the linked flag, and returns to the QR.
*/
function hostDisconnect() {
  const conn = activeConn;
  activeConn = null;
  removeKey(HOST_LINKED_KEY);
  clearIncoming();
  if (conn) {
    trySend(conn, { t: 'bye', manual: true });
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
    saveKey(HOST_LINKED_KEY, '1');
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
    dropSender(conn);
  });
  conn.on('error', function () {
    dropSender(conn);
  });
}

/*
  Draw the QR, the big code and the short link for this code.
  qrcode-generator SVG with a 4-module white quiet zone.
*/
function showQr(code) {
  const url = senderUrl(code);
  const box = el('qr');
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
  el('host-code').textContent = code;
  el('join-url').textContent = senderLinkText();
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
    setHostStatus(activeConn ? 'Phone connected (broker offline)' : 'Reconnecting to broker…');
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
  New code button. Drops any sender, forgets it, and registers a fresh code.
*/
function newCode() {
  if (activeConn) {
    hostDisconnect();
  }
  removeKey(HOST_LINKED_KEY);
  codeRemembered = false;
  newCodeTries = 0;
  startPeer(randomCode(hostCode), false);
}

/*
  Load saved history rows and drop blobs nothing points at.
*/
function loadHistory() {
  fileHistory = PrintStore.loadList();
  while (fileHistory.length > PrintStore.MAX_FILES) {
    fileHistory.shift();
  }
  renderHistory();
  PrintStore.prune(fileHistory.map(function (item) {
    return item.id;
  })).catch(function () {
    /* No IndexedDB. History rows still show. */
  });
}

/*
  Start the host station. Reuse the remembered code when there is one.
*/
function startHost() {
  el('host-disconnect').addEventListener('click', hostDisconnect);
  el('new-code').addEventListener('click', newCode);
  el('clear-history').addEventListener('click', clearHistory);
  loadHistory();
  /* Leaving (or reloading): no bye, so the phone keeps trying; just free the id on the broker. */
  window.addEventListener('pagehide', function () {
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
