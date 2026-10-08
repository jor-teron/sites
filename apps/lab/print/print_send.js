/*
  Project: print
  File: print_send.js
  Role: Phone sender (print-send.html). Takes the 4-digit station code from
  ?code=1234 (or an older ?host=jtprint-1234) and connects to peer
  PEER_PREFIX + code. Header: title, short status, Disconnect.
  Views:
  - join: reason, Reconnect (last code), 4-digit code box + Connect, and
    Scan QR (in-page camera, print_scan.js). Hidden once connected.
  - retry: 'Link lost — reconnecting…' while auto-retrying a dropped link.
  - linked: Take photo (camera app), In-page camera (print_camera.js, A4
    guide), Pick image or PDF, a transfer bar (name, %, x.x / y.y MB, speed,
    then 'Sent ✓' or 'Failed — tap to retry', which resends the same file)
    and a small sent list. Send buttons are locked while a file is sending.
  Persistence / reconnect rules:
  - 'jtprint-last-code': last code tried (Reconnect, code box).
  - 'jtprint-linked': the code while linked. On load, if set, the page goes
    straight to 'Reconnecting…' and connects. If the link drops without a
    bye, it retries with backoff (1, 2, 4, 8, 15 s, then every 15 s while the
    page is open); after RETRY_SHOW_JOIN failed tries the join screen shows
    too (retries continue). Coming back to the tab retries at once.
  - Only a manual Disconnect (here: sends bye; or on the station) or a
    takeover by another phone clears the flag and stops retrying.
  - Leaving / reloading the page sends no bye; the peer is just destroyed.
  - 'jtprint-sent': last 20 sends {name,size,ts,ok}.
  One Peer is reused; a destroyed one is rebuilt.
*/

/* localStorage key for the last station code. */
const LAST_CODE_KEY = 'jtprint-last-code';

/* localStorage key holding the code while linked (cleared by manual Disconnect). */
const LINKED_KEY = 'jtprint-linked';

/* localStorage key for the sent list. */
const SENT_KEY = 'jtprint-sent';

/* Sent list length cap. */
const SENT_MAX = 20;

/* Give up on a connect that never opens after this many ms. */
const CONNECT_TIMEOUT_MS = 20000;

/* Auto-reconnect delays (ms). The last one repeats while the page is open. */
const RETRY_MS = [1000, 2000, 4000, 8000, 15000];

/* Failed auto tries before the join screen is shown (retries keep going). */
const RETRY_SHOW_JOIN = 4;

/* Minimum ms between send bar repaints. */
const BAR_EVERY_MS = 100;

/* Local PeerJS peer, reused across connects. */
let peer = null;

/* Data connection to the station. Null when idle. */
let conn = null;

/* Code waiting for the peer to open before connecting. */
let pendingCode = '';

/* Last code tried, for Reconnect and the code box. */
let lastCode = '';

/* Timer for CONNECT_TIMEOUT_MS. */
let connectTimer = 0;

/* Auto-reconnect state. */
let retryCount = 0;
let retryTimer = 0;

/* True while the page is being hidden / unloaded (no retries then). */
let leaving = false;

/* Send state: one file at a time; the last file is kept for retry. */
let sending = false;
let lastFile = null;

/*
  Shortcut for getElementById.
*/
function el(id) {
  return document.getElementById(id);
}

/*
  Short header status.
*/
function setStatus(text) {
  el('send-status').textContent = text;
}

/*
  True when code is the one we were linked to (auto-reconnect allowed).
*/
function isLinkedCode(code) {
  return !!code && loadKey(LINKED_KEY) === code;
}

/*
  Close the in-page scanner and show the Scan QR button again.
*/
function closeScanner() {
  PrintScan.stop();
  el('scan-panel').hidden = true;
  el('scan-open').hidden = false;
}

/*
  Close the in-page photo camera.
*/
function closeCamera() {
  PrintCamera.close();
  el('camera-panel').hidden = true;
}

/*
  Switch view: 'join', 'retry' or 'linked'. Only one body view is visible.
*/
function setView(view, status) {
  setStatus(status);
  el('join-panel').hidden = view !== 'join';
  el('retry-panel').hidden = view !== 'retry';
  el('send-actions').hidden = view !== 'linked';
  el('send-disconnect').hidden = view === 'join' && !retryTimer;
  if (view !== 'join') {
    closeScanner();
  }
  if (view !== 'linked') {
    closeCamera();
  }
}

/*
  Join screen with a reason line. Reconnect only appears when a last code exists.
*/
function showJoin(reason) {
  setView('join', retryTimer ? 'Reconnecting…' : 'Not connected');
  el('join-msg').textContent = reason;
  el('reconnect').hidden = !lastCode;
  el('reconnect-code').textContent = lastCode;
  if (lastCode && document.activeElement !== el('code-input')) {
    el('code-input').value = lastCode;
  }
}

/*
  Retry screen: shown during the first auto-reconnect tries.
*/
function showRetry(text) {
  setView('retry', 'Reconnecting…');
  el('retry-msg').textContent = text;
}

/*
  Stop auto-reconnect timers (not the flag).
*/
function stopRetry() {
  clearTimeout(retryTimer);
  retryTimer = 0;
}

/*
  Plan the next auto-reconnect try for lastCode.
*/
function scheduleRetry(reason) {
  stopRetry();
  retryCount += 1;
  const wait = RETRY_MS[Math.min(retryCount - 1, RETRY_MS.length - 1)];
  retryTimer = setTimeout(function () {
    retryTimer = 0;
    connectTo(lastCode, true);
  }, wait);
  if (retryCount <= RETRY_SHOW_JOIN) {
    showRetry('Link lost — reconnecting to ' + lastCode + '… (try ' + retryCount + ')');
  } else {
    showJoin(reason + ' Still trying ' + lastCode + ' every ' + Math.round(wait / 1000) + ' s.');
  }
}

/*
  End the current link (or attempt).
  lost = unexpected drop: auto-retry if this code was linked; else the join screen.
*/
function drop(reason, lost) {
  const c = conn;
  conn = null;
  pendingCode = '';
  clearTimeout(connectTimer);
  tryClose(c);
  if (leaving) {
    return;
  }
  if (lost && isLinkedCode(lastCode)) {
    scheduleRetry(reason);
    return;
  }
  stopRetry();
  showJoin(reason);
}

/*
  Final end from the station side (manual bye, takeover, busy): forget the link.
*/
function dropFinal(reason) {
  removeKey(LINKED_KEY);
  drop(reason, false);
}

/*
  Open the data connection on an open peer.
*/
function openConn(code) {
  pendingCode = '';
  let c = null;
  try {
    c = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
  } catch (err) {
    c = null;
  }
  if (!c) {
    drop('Link error.', true);
    return;
  }
  conn = c;
  clearTimeout(connectTimer);
  connectTimer = setTimeout(function () {
    if (conn === c && !c.open) {
      drop('Could not reach station ' + code + '. Check it is open, then Reconnect.', true);
    }
  }, CONNECT_TIMEOUT_MS);

  c.on('open', function () {
    if (conn !== c) {
      return;
    }
    clearTimeout(connectTimer);
    stopRetry();
    retryCount = 0;
    saveKey(LINKED_KEY, code);
    setView('linked', 'Connected · ' + code);
    /* Probe the data channel. Host answers with ready. */
    try {
      sendControl(c, { t: 'hello' });
    } catch (err) {
      setStatus('Connected · channel not ready');
    }
  });
  c.on('data', function (data) {
    if (conn !== c || !data) {
      return;
    }
    if (data.t === 'ready') {
      setStatus('Connected · ' + code + ' ✓');
    }
    if (data.t === 'busy') {
      dropFinal('Station is busy.');
    }
    if (data.t === 'bye') {
      dropFinal(data.reason === 'replaced' ? 'Another phone took over the station.' : 'Station disconnected.');
    }
  });
  c.on('close', function () {
    if (conn === c) {
      drop('Disconnected.', true);
    }
  });
  c.on('error', function () {
    if (conn === c) {
      drop('Link error.', true);
    }
  });
}

/*
  Make sure there is an open peer, then connect pendingCode.
  Reuses the peer; reconnects it if it lost the broker; rebuilds it if destroyed.
*/
function ensurePeer() {
  if (peer && !peer.destroyed) {
    if (peer.open) {
      if (pendingCode) {
        openConn(pendingCode);
      }
      return;
    }
    if (peer.disconnected) {
      try {
        peer.reconnect();
        /* The open handler picks up pendingCode. */
        return;
      } catch (err) {
        peer = null;
      }
    } else {
      /* Still opening. The open handler picks up pendingCode. */
      return;
    }
  }
  const myPeer = new Peer(peerOptions());
  peer = myPeer;
  myPeer.on('open', function () {
    if (peer === myPeer && pendingCode) {
      openConn(pendingCode);
    }
  });
  myPeer.on('error', function (err) {
    if (peer !== myPeer) {
      return;
    }
    const type = err && err.type;
    const linked = !!(conn && conn.open);
    if (type === 'peer-unavailable') {
      if (!linked) {
        /* Also seen while a reloading station re-registers, so it counts as lost. */
        drop('Code not found. Check the 4 digits on the station.', true);
      }
      return;
    }
    if (linked) {
      /* Broker trouble does not cut an open data channel. */
      return;
    }
    if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
      try {
        myPeer.destroy();
      } catch (e) {
        /* Already gone. */
      }
      peer = null;
      drop('Network problem. Check internet.', true);
      return;
    }
    drop('Link error (' + (type || 'unknown') + ').', true);
  });
  myPeer.on('close', function () {
    if (peer === myPeer) {
      peer = null;
    }
  });
}

/*
  Connect to a station code. Closes any earlier attempt first.
  auto = an automatic reconnect try (keeps the retry count and view).
*/
function connectTo(code, auto) {
  if (!CODE_RE.test(code)) {
    showJoin('Enter the 4-digit code shown on the station.');
    return;
  }
  stopRetry();
  if (!auto) {
    retryCount = 0;
  }
  lastCode = code;
  saveKey(LAST_CODE_KEY, code);
  closeScanner();
  const old = conn;
  conn = null;
  clearTimeout(connectTimer);
  tryClose(old);
  setStatus((auto ? 'Reconnecting · ' : 'Connecting · ') + code + '…');
  el('join-msg').textContent = 'Connecting to ' + code + '…';
  el('code-input').value = code;
  pendingCode = code;
  /* Covers a peer that never opens (broker unreachable). openConn restarts it. */
  connectTimer = setTimeout(function () {
    if (pendingCode === code) {
      drop('Could not reach the server. Check internet.', true);
    }
  }, CONNECT_TIMEOUT_MS);
  ensurePeer();
}

/*
  Disconnect button. Never throws. Sends bye (station forgets the phone),
  clears the linked flag, stops retrying, and shows the join screen.
*/
function senderDisconnect() {
  removeKey(LINKED_KEY);
  stopRetry();
  const c = conn;
  conn = null;
  if (c) {
    trySend(c, { t: 'bye', manual: true });
    /* Let the bye leave before the channel closes. */
    setTimeout(function () {
      tryClose(c);
    }, 150);
  }
  drop('Disconnected.', false);
}

/*
  Lock or unlock every send button while a file is going out.
*/
function lockSend(locked) {
  ['take-photo', 'open-camera', 'pick-file', 'snap'].forEach(function (id) {
    el(id).disabled = locked;
  });
}

/*
  Paint the sent list under the transfer bar, newest first.
*/
function renderSent() {
  const list = el('sent-list');
  const rows = loadJson(SENT_KEY, []);
  list.innerHTML = '';
  list.hidden = !Array.isArray(rows) || !rows.length;
  if (list.hidden) {
    return;
  }
  rows.forEach(function (row) {
    const item = document.createElement('li');
    item.className = row.ok ? 'ok' : 'fail';
    const name = document.createElement('strong');
    name.textContent = row.name;
    const sub = document.createElement('span');
    sub.textContent = formatSize(row.size) + ' · ' + formatTime(row.ts) + ' · ' + (row.ok ? 'Sent ✓' : 'Failed');
    item.appendChild(name);
    item.appendChild(sub);
    list.appendChild(item);
  });
}

/*
  Add one row to the sent list (cap SENT_MAX).
*/
function addSent(file, ok) {
  let rows = loadJson(SENT_KEY, []);
  if (!Array.isArray(rows)) {
    rows = [];
  }
  rows.unshift({ name: file.name || 'photo.jpg', size: file.size || 0, ts: Date.now(), ok: ok });
  saveJson(SENT_KEY, rows.slice(0, SENT_MAX));
  renderSent();
}

/*
  Send one file with the transfer bar. Ignored while another send runs.
*/
async function startSend(file) {
  if (sending || !file) {
    return;
  }
  const bar = el('send-bar');
  const name = file.name || 'photo.jpg';
  lastFile = file;
  if (!conn || !conn.open) {
    PrintBar.set(bar, { name: name, state: 'fail', sub: 'Not connected — tap to retry' });
    return;
  }
  sending = true;
  lockSend(true);
  const start = Date.now();
  let painted = 0;
  PrintBar.set(bar, { name: name, pct: 0, sub: formatProgress(0, file.size || 0), state: 'busy' });
  try {
    await sendFile(conn, file, function (done, total) {
      const now = Date.now();
      if (now - painted < BAR_EVERY_MS && done < total) {
        return;
      }
      painted = now;
      const speed = formatSpeed(done, now - start);
      PrintBar.set(bar, {
        name: name,
        pct: total ? (done / total) * 100 : 0,
        sub: formatProgress(done, total) + (speed ? ' · ' + speed : ''),
        state: 'busy'
      });
    });
    const secs = ((Date.now() - start) / 1000).toFixed(1);
    PrintBar.set(bar, { name: name, state: 'ok', sub: 'Sent ✓ · ' + formatSize(file.size || 0) + ' in ' + secs + ' s' });
    addSent(file, true);
  } catch (err) {
    PrintBar.set(bar, { name: name, state: 'fail', sub: 'Failed — tap to retry' });
    addSent(file, false);
  } finally {
    sending = false;
    lockSend(false);
  }
}

/*
  Open the in-page camera. Blocked or missing camera shows a message.
*/
async function openCamera() {
  const info = el('camera-info');
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    PrintBar.set(el('send-bar'), { name: 'Camera', state: 'fail', sub: 'Needs https. Use Take photo or Pick image.' });
    return;
  }
  el('camera-panel').hidden = false;
  el('camera-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  info.textContent = 'Starting camera…';
  try {
    await PrintCamera.open(el('camera'));
    info.textContent = 'Fit the page inside the A4 guide';
  } catch (err) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      info.textContent = 'Camera blocked. Allow it, or use Take photo.';
    } else if (name === 'NotFoundError') {
      info.textContent = 'No camera found. Use Pick image.';
    } else {
      info.textContent = 'Camera unavailable. Use Take photo.';
    }
  }
}

/*
  Snap with the in-page camera, show the resolution, and send it.
*/
async function snapAndSend() {
  if (sending) {
    return;
  }
  const info = el('camera-info');
  el('snap').disabled = true;
  info.textContent = 'Taking photo…';
  let shot = null;
  try {
    shot = await PrintCamera.snap();
  } catch (err) {
    info.textContent = 'Could not take photo: ' + err.message;
    el('snap').disabled = false;
    return;
  }
  info.textContent = describeShot(shot.width, shot.height);
  await startSend(shot.file);
  /* startSend may return early (not connected); never leave Snap stuck. */
  el('snap').disabled = sending;
}

/*
  Wire the join screen: Reconnect, code box, Scan QR.
*/
function bindJoin() {
  el('reconnect').addEventListener('click', function () {
    connectTo(lastCode);
  });
  el('code-input').addEventListener('input', function () {
    const clean = this.value.replace(/[^0-9]/g, '').slice(0, 4);
    if (clean !== this.value) {
      this.value = clean;
    }
  });
  /* Form submit covers the Connect button and Enter in the box. */
  el('code-form').addEventListener('submit', function (event) {
    event.preventDefault();
    connectTo(el('code-input').value.trim());
  });
  el('scan-open').addEventListener('click', function () {
    el('scan-open').hidden = true;
    el('scan-panel').hidden = false;
    PrintScan.start(el('scan-video'), el('scan-msg'), function (code) {
      connectTo(code);
    });
  });
  el('scan-cancel').addEventListener('click', closeScanner);
}

/*
  Wire the connected screen: camera app, in-page camera, file pick, retry, Disconnect.
*/
function bindSend() {
  el('send-disconnect').addEventListener('click', senderDisconnect);
  /* Phone camera app: hidden input with capture; the photo is sent right away. */
  el('take-photo').addEventListener('click', function () {
    el('photo-input').click();
  });
  el('pick-file').addEventListener('click', function () {
    el('file-input').click();
  });
  ['photo-input', 'file-input'].forEach(function (id) {
    el(id).addEventListener('change', function () {
      const file = this.files && this.files[0];
      this.value = '';
      if (file) {
        startSend(file);
      }
    });
  });
  el('open-camera').addEventListener('click', openCamera);
  el('close-camera').addEventListener('click', closeCamera);
  el('snap').addEventListener('click', snapAndSend);
  /* A failed bar is a button: tap resends the same file. */
  el('send-bar').addEventListener('click', function () {
    if (!sending && lastFile) {
      startSend(lastFile);
    }
  });
}

/*
  Page lifecycle: no bye on leave (a reload must keep the link), just free the peer.
  Coming back (page cache or tab switch) retries a pending reconnect at once.
*/
function bindLifecycle() {
  window.addEventListener('pagehide', function () {
    leaving = true;
    stopRetry();
    PrintScan.stop();
    PrintCamera.close();
    if (peer) {
      try {
        peer.destroy();
      } catch (err) {
        /* Already gone. */
      }
      peer = null;
    }
  });
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) {
      return;
    }
    leaving = false;
    const code = loadKey(LINKED_KEY);
    if (CODE_RE.test(code)) {
      lastCode = code;
      showRetry('Reconnecting to ' + code + '…');
      connectTo(code, true);
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && retryTimer && lastCode) {
      connectTo(lastCode, true);
    }
  });
}

/*
  Start the sender page. Linked code first (survives reload), then the
  code in the link, else the join screen.
*/
function startSender() {
  bindJoin();
  bindSend();
  bindLifecycle();
  renderSent();
  const saved = loadKey(LAST_CODE_KEY);
  lastCode = CODE_RE.test(saved) ? saved : '';
  const linked = loadKey(LINKED_KEY);
  const params = new URLSearchParams(window.location.search);
  const fromUrl = parseCode(window.location.search + window.location.hash);
  const code = fromUrl || (CODE_RE.test(linked) ? linked : '');
  if (code && isLinkedCode(code)) {
    lastCode = code;
    showRetry('Reconnecting to ' + code + '…');
    connectTo(code, true);
    return;
  }
  if (code) {
    showJoin('Connecting to ' + code + '…');
    connectTo(code);
    return;
  }
  if (params.get('host')) {
    showJoin('Old link. Type the 4-digit code shown on the station.');
    return;
  }
  showJoin('Type the code shown on the print station, or scan its QR.');
}

/* Boot only on the sender page. */
if (PAGE === 'send') {
  startSender();
}
