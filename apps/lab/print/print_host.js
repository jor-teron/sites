/*
  Project: print
  File: print_host.js
  Role: Host station (print.html). Registers peer id PEER_PREFIX + 4 digits
  and shows a QR of print-send.html?code=1234, the 4 digits big, and a
  short link to type on a phone. Header: title, short status, New code
  (idle) / Disconnect (linked). Transfer bar and history live in the body.
  Connection (release 3): SharedLink host role (shared/link/link_core.js),
  prefix 'jtprint-'. Reconnect rules:
  - The code is kept in localStorage 'jtprint-host-code', so a reload keeps
    it; if the old tab still holds the id on the broker, SharedLink retries
    the same code with backoff (then asks for New code).
  - 'jtprint-host-linked' is set while a phone is linked and kept when the
    link drops without a bye (phone reload, network), so after a drop or a
    host reload the station says 'Waiting for phone to reconnect…'; the phone
    reconnects by itself. A manual Disconnect on either side (bye) or New
    code clears it. Leaving the page only destroys the peer (no bye), which
    frees the code on the broker fast.
  - Several phones may be linked; any of them can send.
  Files arrive in base64 chunks with a live 'Receiving … x / y MB' bar, are
  saved to history (print_store.js: localStorage list + IndexedDB blobs,
  last 50) and the browser print dialog opens on arrival. History rows show
  name · size · time · kind with a Print button; Clear empties it.
  Inside the Hub (release 2): the page posts {sharedLink:'ready', app:'print'}
  to the Hub. If the Hub answers {sharedLink:'hello', code}, Print uses the
  Hub's connection: no own peer, the QR opens print-send.html?hub=1&code=<hub
  code>, and files arrive as {sharedLink:'file', name, type, blob}. No answer
  within HUB_WAIT_MS = standalone station as before.
*/

/* Wait this long for the Hub's hello before running a standalone station. */
const HUB_WAIT_MS = 700;

/* True while Print rides on the Hub's shared connection. */
let viaHub = false;

/* localStorage key for this station's code. */
const HOST_CODE_KEY = 'jtprint-host-code';

/* localStorage flag: a phone was linked and has not manually disconnected. */
const HOST_LINKED_KEY = 'jtprint-host-linked';

/* Minimum ms between receive bar repaints. */
const BAR_EVERY_MS = 120;

/* Current 4-digit code. */
let hostCode = '';

/* In-progress receive bars, keyed by transfer id (SharedLink assembles the file). */
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
  Forget half-received bars when the sender goes away.
*/
function clearIncoming() {
  Object.keys(incoming).forEach(function (id) {
    PrintBar.set(el('host-bar'), { name: incoming[id].name, state: 'fail', sub: 'Stopped — phone link lost' });
    delete incoming[id];
  });
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

/* True while at least one SharedLink device (phone) is online. */
function phoneOnline() {
  return SharedLink.devices.some(function (d) { return d.online && !d.legacy; });
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
  Standalone station on SharedLink host role (release 3): prefix 'jtprint-',
  code kept in HOST_CODE_KEY (SharedLink retries a held id with backoff after a
  reload). Files arrive as SharedLink 'progress' / 'file' events.
*/
function hostStart() {
  return SharedLink.host({ prefix: PEER_PREFIX, codeKey: HOST_CODE_KEY }).then(function (code) {
    hostCode = code;
    showQr(code);
    setHostLinked(phoneOnline());
  });
}

/*
  Disconnect button: bye to the phone (it stops reconnecting), clear the linked
  flag, then listen again on the same code.
*/
function hostDisconnect() {
  removeKey(HOST_LINKED_KEY);
  clearIncoming();
  SharedLink.stop(true);
  setHostLinked(false);
  /* stop() destroys the peer after ~150 ms; register again after that. */
  setTimeout(function () {
    hostStart().catch(function () { setHostStatus('Could not load PeerJS. Check internet.'); });
  }, 400);
}

/*
  New code button. Forgets the phone and registers a fresh code.
*/
function newCode() {
  removeKey(HOST_LINKED_KEY);
  clearIncoming();
  SharedLink.newCode().then(function (code) {
    hostCode = code;
    showQr(code);
    setHostLinked(false);
  });
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
  Start the standalone station. SharedLink reuses the remembered code.
*/
function startHost() {
  el('host-disconnect').addEventListener('click', hostDisconnect);
  el('new-code').addEventListener('click', newCode);
  el('clear-history').addEventListener('click', clearHistory);
  loadHistory();
  SharedLink.on('status', function (text, state) {
    if (state === 'listening') {
      setHostLinked(phoneOnline());
    } else if (!phoneOnline()) {
      setHostStatus(text);
    }
  });
  SharedLink.on('devices', function () {
    const on = phoneOnline();
    if (on) {
      saveKey(HOST_LINKED_KEY, '1');
    } else {
      clearIncoming();
    }
    setHostLinked(on);
  });
  SharedLink.on('bye', function () {
    /* Manual Disconnect on the phone: forget it. */
    removeKey(HOST_LINKED_KEY);
  });
  SharedLink.on('progress', function (p) {
    if (p.out) {
      return;
    }
    const job = incoming[p.id] || (incoming[p.id] = { name: p.name || 'file', size: Number(p.size) || 0, bytes: 0, start: Date.now(), painted: 0 });
    job.bytes = p.done;
    paintReceive(job, p.done === 0);
  });
  SharedLink.on('file', function (f) {
    delete incoming[f.id];
    PrintBar.set(el('host-bar'), { name: f.name, state: 'ok', sub: 'Received ✓ — printing · ' + formatSize(f.size) });
    acceptFile(f.name, f.type || CAMERA_MIME, f.blob);
  });
  /* Leaving (or reloading): no bye, so the phone keeps trying; just free the id on the broker. */
  window.addEventListener('pagehide', function () {
    SharedLink.pause();
  });
  /* Back from the browser page cache: register the same code again. */
  window.addEventListener('pageshow', function (event) {
    if (event.persisted && !SharedLink.live) {
      SharedLink.restart();
    }
  });
  return hostStart();
}

/*
  Hub mode: show the Hub's code, take files from the Hub.
*/
function startViaHub(code) {
  viaHub = true;
  el('new-code').hidden = true;
  el('host-disconnect').hidden = true;
  el('host-code').textContent = code;
  showHubQr(code);
  setHostStatus('Using the Hub connection · scan to send');
}

function showHubQr(code) {
  const box = el('qr');
  box.innerHTML = '';
  if (typeof qrcode === 'undefined') {
    box.textContent = 'QR lib missing';
    return;
  }
  const qr = qrcode(0, 'M');
  qr.addData(senderUrl(code, true));
  qr.make();
  box.innerHTML = qr.createSvgTag(6, 24);
  const svg = box.querySelector('svg');
  if (svg) {
    svg.removeAttribute('width');
    svg.removeAttribute('height');
  }
  el('join-url').textContent = senderLinkText();
}

/*
  Ask the Hub (parent frame) for its connection; fall back to standalone.
*/
function bootHost() {
  const inFrame = window.parent && window.parent !== window;
  if (!inFrame) {
    SharedLink.loadPeer().catch(function () {
      setHostStatus('Could not load PeerJS. Check internet.');
    }).then(startHost);
    return;
  }
  let decided = false;
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) {
      return;
    }
    const d = event.data;
    if (!d || typeof d !== 'object') {
      return;
    }
    if (d.sharedLink === 'hello' && d.code && !decided) {
      decided = true;
      loadHistory();
      el('clear-history').addEventListener('click', clearHistory);
      startViaHub(String(d.code));
    } else if (d.sharedLink === 'file' && viaHub && d.blob) {
      acceptFile(String(d.name || 'file'), d.type || d.blob.type || CAMERA_MIME, d.blob);
      setHostStatus('Received ' + String(d.name || 'file') + ' via the Hub');
    }
  });
  window.parent.postMessage({ sharedLink: 'ready', app: 'print', types: ['image/', 'application/pdf'] }, '*');
  setTimeout(function () {
    if (!decided) {
      decided = true;
      SharedLink.loadPeer().catch(function () {
        setHostStatus('Could not load PeerJS. Check internet.');
      }).then(startHost);
    }
  }, HUB_WAIT_MS);
}

/* Boot only on the host page. */
if (PAGE === 'host') {
  bootHost();
}
