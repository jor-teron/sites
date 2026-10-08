/*
  Project: print
  File: print_send.js
  Role: Phone sender (print-send.html). Takes the 4-digit station code from
  ?code=1234 (or an older ?host=jtprint-1234) and connects to peer
  PEER_PREFIX + code. With no code, or whenever the link drops (disconnect,
  bye, close, error, code not found, timeout), the join screen is shown:
  what happened, Reconnect (last code), a 4-digit code box with Connect,
  and Scan QR (in-page camera, print_scan.js). The whole join screen hides
  once the data channel opens. While connected: Open camera, Pick image or
  PDF, progress, Disconnect. One Peer is reused; a destroyed one is rebuilt.
*/

/* localStorage key for the last station code. */
const LAST_CODE_KEY = 'jtprint-last-code';

/* Give up on a connect that never opens after this many ms. */
const CONNECT_TIMEOUT_MS = 20000;

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

/* Live photo camera stream, if opened. */
let cameraStream = null;

/*
  Shortcut for getElementById.
*/
function el(id) {
  return document.getElementById(id);
}

/*
  Header status line.
*/
function setStatus(text) {
  el('send-status').textContent = text;
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
  Stop the photo camera tracks.
*/
function stopCamera() {
  if (!cameraStream) {
    return;
  }
  cameraStream.getTracks().forEach(function (track) {
    track.stop();
  });
  cameraStream = null;
  el('camera').srcObject = null;
}

/*
  Linked shows the send actions; not linked shows the join screen.
  The join screen and its scanner are fully hidden while linked.
*/
function setSenderLinked(linked, text) {
  setStatus(text);
  el('join-panel').hidden = linked;
  el('send-actions').hidden = !linked;
  el('send-disconnect').hidden = !linked;
  if (linked) {
    closeScanner();
    el('send-progress').textContent = '';
  } else {
    el('camera-panel').hidden = true;
    stopCamera();
  }
}

/*
  Join screen with a reason line. Reconnect only appears when a last code exists.
*/
function showJoin(reason) {
  setSenderLinked(false, 'Not connected');
  el('join-msg').textContent = reason;
  el('reconnect').hidden = !lastCode;
  el('reconnect-code').textContent = lastCode;
  if (lastCode && document.activeElement !== el('code-input')) {
    el('code-input').value = lastCode;
  }
}

/*
  End the current link (or attempt) and go back to the join screen.
*/
function drop(reason) {
  const c = conn;
  conn = null;
  pendingCode = '';
  clearTimeout(connectTimer);
  tryClose(c);
  showJoin(reason);
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
    drop('Link error. Try again.');
    return;
  }
  conn = c;
  clearTimeout(connectTimer);
  connectTimer = setTimeout(function () {
    if (conn === c && !c.open) {
      drop('Could not reach station ' + code + '. Check it is open, then Reconnect.');
    }
  }, CONNECT_TIMEOUT_MS);

  c.on('open', function () {
    if (conn !== c) {
      return;
    }
    clearTimeout(connectTimer);
    setSenderLinked(true, 'Connected to ' + code);
    /* Probe the data channel. Host answers with ready. */
    try {
      sendControl(c, { t: 'hello' });
    } catch (err) {
      setStatus('Connected, send failed: ' + err.message);
    }
  });
  c.on('data', function (data) {
    if (conn !== c || !data) {
      return;
    }
    if (data.t === 'ready') {
      setStatus('Connected to ' + code + ' · channel ok');
    }
    if (data.t === 'busy') {
      drop('Station is busy.');
    }
    if (data.t === 'bye') {
      drop(data.reason === 'replaced' ? 'Another phone took over the station.' : 'Station disconnected.');
    }
  });
  c.on('close', function () {
    if (conn === c) {
      drop('Disconnected.');
    }
  });
  c.on('error', function () {
    if (conn === c) {
      drop('Link error.');
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
        drop('Code not found. Check the 4 digits on the station.');
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
      drop('Network problem. Check internet, then Reconnect.');
      return;
    }
    drop('Link error (' + (type || 'unknown') + ').');
  });
  myPeer.on('close', function () {
    if (peer === myPeer) {
      peer = null;
    }
  });
}

/*
  Connect to a station code. Closes any earlier attempt first.
*/
function connectTo(code) {
  if (!CODE_RE.test(code)) {
    showJoin('Enter the 4-digit code shown on the station.');
    return;
  }
  lastCode = code;
  saveKey(LAST_CODE_KEY, code);
  closeScanner();
  const old = conn;
  conn = null;
  clearTimeout(connectTimer);
  tryClose(old);
  setStatus('Connecting to ' + code + '…');
  el('join-msg').textContent = 'Connecting to ' + code + '…';
  el('code-input').value = code;
  pendingCode = code;
  /* Covers a peer that never opens (broker unreachable). openConn restarts it. */
  connectTimer = setTimeout(function () {
    if (pendingCode === code) {
      drop('Could not reach the server. Check internet, then Reconnect.');
    }
  }, CONNECT_TIMEOUT_MS);
  ensurePeer();
}

/*
  Disconnect button. Never throws; always returns to the join screen.
*/
function senderDisconnect() {
  const c = conn;
  conn = null;
  if (c) {
    trySend(c, { t: 'bye' });
    /* Let the bye leave before the channel closes. */
    setTimeout(function () {
      tryClose(c);
    }, 150);
  }
  drop('Disconnected.');
}

/*
  Capture the current video frame and send it as a JPEG.
*/
async function snapAndSend() {
  const video = el('camera');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const blob = await new Promise(function (resolve) {
    canvas.toBlob(resolve, CAMERA_MIME, 0.85);
  });
  if (!blob) {
    throw new Error('No frame');
  }
  blob.name = 'photo-' + Date.now() + '.jpg';
  await sendFile(conn, blob, function (done, total) {
    el('send-progress').textContent = 'Sending photo ' + Math.round((done / total) * 100) + '%';
  });
  el('send-progress').textContent = 'Photo sent';
}

/*
  Open the photo camera. Blocked or missing camera shows a message.
*/
async function openCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    el('send-progress').textContent = 'Camera needs https. Use Pick image instead.';
    return;
  }
  try {
    stopCamera();
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    el('camera').srcObject = cameraStream;
    el('camera-panel').hidden = false;
    el('send-progress').textContent = '';
  } catch (err) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      el('send-progress').textContent = 'Camera blocked. Allow it, or use Pick image.';
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      el('send-progress').textContent = 'No camera found. Use Pick image.';
    } else {
      el('send-progress').textContent = 'Camera unavailable. Use Pick image.';
    }
  }
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
    PrintScan.start(el('scan-video'), el('scan-msg'), connectTo);
  });
  el('scan-cancel').addEventListener('click', closeScanner);
}

/*
  Wire the connected screen: file pick, photo camera, Disconnect.
*/
function bindSend() {
  el('send-disconnect').addEventListener('click', senderDisconnect);
  el('pick-file').addEventListener('click', function () {
    el('file-input').click();
  });
  el('file-input').addEventListener('change', async function () {
    const file = this.files && this.files[0];
    this.value = '';
    if (!file) {
      return;
    }
    if (!conn || !conn.open) {
      el('send-progress').textContent = 'Not connected';
      return;
    }
    el('send-progress').textContent = 'Sending ' + file.name + '…';
    try {
      await sendFile(conn, file, function (done, total) {
        el('send-progress').textContent = file.name + ' ' + Math.round((done / total) * 100) + '%';
      });
      el('send-progress').textContent = file.name + ' sent';
    } catch (err) {
      el('send-progress').textContent = 'Send failed: ' + err.message;
    }
  });
  el('open-camera').addEventListener('click', openCamera);
  el('close-camera').addEventListener('click', function () {
    el('camera-panel').hidden = true;
    stopCamera();
  });
  el('snap').addEventListener('click', function () {
    if (!conn || !conn.open) {
      el('send-progress').textContent = 'Not connected';
      return;
    }
    snapAndSend().catch(function (err) {
      el('send-progress').textContent = 'Could not send photo: ' + err.message;
    });
  });
}

/*
  Start the sender page. Code from the link, else the join screen.
*/
function startSender() {
  bindJoin();
  bindSend();
  const saved = loadKey(LAST_CODE_KEY);
  lastCode = CODE_RE.test(saved) ? saved : '';
  /* Tell the station when this page goes away, so it returns to its QR fast. */
  window.addEventListener('pagehide', function () {
    if (conn && conn.open) {
      trySend(conn, { t: 'bye' });
    }
  });
  const params = new URLSearchParams(window.location.search);
  const fromUrl = parseCode(window.location.search + window.location.hash);
  if (fromUrl) {
    connectTo(fromUrl);
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
