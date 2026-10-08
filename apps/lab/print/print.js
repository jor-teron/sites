/*
  Project: print
  File: print.js
  Role: Shared PeerJS session for host (print.html) and sender (print-send.html).
  Internet only. Host shows a QR of the sender URL. On connect the QR hides
  and Ready is shown. Files arrive in base64 chunks, then the host opens
  the browser print dialog. Either side may disconnect. One sender at a time.
*/

/* Raw slice size of the base64 payload. Kept small so one JSON message fits the data channel. */
const CHUNK_SIZE = 8000;

/* Pause when the browser data-channel buffer is above this many bytes. */
const BUFFER_HIGH = 64 * 1024;

/* Mime used when the camera capture has no file type. */
const CAMERA_MIME = 'image/jpeg';

/* Page role set on body: host or send. */
const PAGE = document.body.dataset.page;

/* Active data connection. Null when idle. */
let activeConn = null;

/* Local PeerJS peer. */
let peer = null;

/* In-progress file assemblies on the host, keyed by transfer id. */
const incoming = {};

/* Host file history rows, newest last. */
const history = [];

/*
  Build PeerJS options.
  JSON serialization so file chunks stay plain objects on both sides.
  Public broker plus Google STUN. No LAN addresses are used.
  TURN is not bundled; some mobile networks may still fail to connect.
*/
function peerOptions() {
  return {
    debug: 1,
    serialization: 'json',
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
  };
}

/*
  Absolute URL of the sender page for a host peer id.
  The QR encodes this so a scan opens the sender and auto-connects.
*/
function senderUrl(hostId) {
  const url = new URL('print-send.html', window.location.href);
  url.searchParams.set('host', hostId);
  return url.toString();
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
  const id = crypto.randomUUID();
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
  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(
    '<!DOCTYPE html><html><head><title>' +
      name.replace(/[<>]/g, '') +
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
  Paint the host file history under Ready.
*/
function renderHistory() {
  const list = document.getElementById('file-list');
  list.innerHTML = '';
  if (!history.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No files yet.';
    list.appendChild(empty);
    return;
  }
  history.forEach(function (item) {
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
  const when = new Date().toLocaleTimeString();
  history.push({
    name: name,
    mime: mime,
    blob: blob,
    when: when
  });
  renderHistory();
  printBlob(blob, mime, name);
}

/*
  Handle one sender message on the host.
*/
function onHostData(data) {
  if (!data || !data.t) {
    return;
  }
  if (data.t === 'hello' && activeConn) {
    try {
      sendControl(activeConn, { t: 'ready' });
    } catch (err) {
      /* Channel not writable yet. Sender will show the error on its next send. */
    }
    return;
  }
  if (data.t === 'meta') {
    incoming[data.id] = {
      name: data.name || 'file',
      mime: data.mime || '',
      parts: []
    };
    const status = document.getElementById('host-status');
    if (status) {
      status.textContent = 'Receiving ' + (data.name || 'file') + '…';
    }
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
    const status = document.getElementById('host-status');
    if (status) {
      status.textContent = 'Received ' + job.name;
    }
    acceptFile(job.name, job.mime, blob);
  }
}

/*
  Host UI: idle shows QR, linked shows Ready and Disconnect.
*/
function setHostLinked(linked) {
  document.getElementById('qr-panel').hidden = linked;
  document.getElementById('ready-panel').hidden = !linked;
  document.getElementById('host-disconnect').hidden = !linked;
  document.getElementById('host-status').textContent = linked
    ? 'Sender connected'
    : 'Waiting for a scan';
}

/*
  Drop the current sender and return the host to the QR.
*/
function hostDisconnect() {
  if (activeConn) {
    sendControl(activeConn, { t: 'bye' });
    activeConn.close();
  }
  activeConn = null;
  setHostLinked(false);
}

/*
  Bind a sender data connection. A second sender is refused.
*/
function takeConnection(conn) {
  conn.on('open', function () {
    if (activeConn && activeConn.open) {
      conn.send({ t: 'busy' });
      conn.close();
      return;
    }
    activeConn = conn;
    setHostLinked(true);
    conn.on('data', onHostData);
    /* Confirm the data channel, not only the peer link. */
    sendControl(conn, { t: 'ready' });
    conn.on('close', function () {
      if (activeConn === conn) {
        activeConn = null;
        setHostLinked(false);
      }
    });
  });
}

/*
  Draw the QR for this host peer id.
*/
function showQr(hostId) {
  const url = senderUrl(hostId);
  const box = document.getElementById('qr');
  box.innerHTML = '';
  new QRCode(box, {
    text: url,
    width: 220,
    height: 220
  });
  document.getElementById('join-url').textContent = url;
  setHostLinked(false);
}

/*
  Start the host station.
*/
function startHost() {
  peer = new Peer(peerOptions());
  peer.on('open', function (id) {
    showQr(id);
  });
  peer.on('connection', takeConnection);
  peer.on('error', function (err) {
    document.getElementById('host-status').textContent = 'Peer error: ' + err.type;
  });
  document.getElementById('host-disconnect').addEventListener('click', hostDisconnect);
  renderHistory();
}

/*
  Sender UI after the data channel opens or closes.
*/
function setSenderLinked(linked, text) {
  document.getElementById('send-status').textContent = text;
  document.getElementById('send-actions').hidden = !linked;
  document.getElementById('send-disconnect').hidden = !linked;
  if (!linked) {
    document.getElementById('camera-panel').hidden = true;
    stopCamera();
  }
}

/* Live camera stream, if the sender opened it. */
let cameraStream = null;

/*
  Stop the camera tracks.
*/
function stopCamera() {
  if (!cameraStream) {
    return;
  }
  cameraStream.getTracks().forEach(function (track) {
    track.stop();
  });
  cameraStream = null;
  const video = document.getElementById('camera');
  if (video) {
    video.srcObject = null;
  }
}

/*
  Capture the current video frame and send it as a JPEG.
*/
async function snapAndSend() {
  const video = document.getElementById('camera');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const blob = await new Promise(function (resolve) {
    canvas.toBlob(resolve, CAMERA_MIME, 0.85);
  });
  blob.name = 'photo-' + Date.now() + '.jpg';
  await sendFile(activeConn, blob, function (done, total) {
    document.getElementById('send-progress').textContent =
      'Sending photo ' + Math.round((done / total) * 100) + '%';
  });
  document.getElementById('send-progress').textContent = 'Photo sent';
}

/*
  Sender disconnect. Host returns to the QR.
*/
function senderDisconnect() {
  if (activeConn) {
    sendControl(activeConn, { t: 'bye' });
    activeConn.close();
  }
  activeConn = null;
  stopCamera();
  setSenderLinked(false, 'Disconnected. Scan the QR again.');
}

/*
  Start the sender page. Host id comes from ?host=
*/
function startSender() {
  const params = new URLSearchParams(window.location.search);
  const hostId = params.get('host');
  if (!hostId) {
    setSenderLinked(false, 'Missing host id. Scan the QR on the print station.');
    return;
  }
  peer = new Peer(peerOptions());
  peer.on('open', function () {
    const conn = peer.connect(hostId, { reliable: true, serialization: 'json' });
    activeConn = conn;
    conn.on('open', function () {
      setSenderLinked(true, 'Connected');
      /* Probe the data channel. Host answers with ready. */
      try {
        sendControl(conn, { t: 'hello' });
      } catch (err) {
        setSenderLinked(true, 'Connected, send failed: ' + err.message);
      }
    });
    conn.on('data', function (data) {
      if (data && data.t === 'ready') {
        setSenderLinked(true, 'Connected · channel ok');
      }
      if (data && data.t === 'busy') {
        setSenderLinked(false, 'Station is busy. One sender at a time.');
        conn.close();
      }
      if (data && data.t === 'bye') {
        senderDisconnect();
      }
    });
    conn.on('close', function () {
      if (activeConn === conn) {
        activeConn = null;
        setSenderLinked(false, 'Disconnected. Scan the QR again.');
      }
    });
    conn.on('error', function () {
      setSenderLinked(false, 'Link error. Scan the QR again.');
    });
  });
  peer.on('error', function (err) {
    setSenderLinked(false, 'Peer error: ' + err.type);
  });

  document.getElementById('send-disconnect').addEventListener('click', senderDisconnect);
  document.getElementById('pick-file').addEventListener('click', function () {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', async function () {
    const file = this.files && this.files[0];
    this.value = '';
    if (!file || !activeConn) {
      document.getElementById('send-progress').textContent = 'Not connected';
      return;
    }
    document.getElementById('send-progress').textContent = 'Sending ' + file.name + '…';
    try {
      await sendFile(activeConn, file, function (done, total) {
        document.getElementById('send-progress').textContent =
          file.name + ' ' + Math.round((done / total) * 100) + '%';
      });
      document.getElementById('send-progress').textContent = file.name + ' sent';
    } catch (err) {
      document.getElementById('send-progress').textContent = 'Send failed: ' + err.message;
    }
  });
  document.getElementById('open-camera').addEventListener('click', async function () {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    document.getElementById('camera').srcObject = cameraStream;
    document.getElementById('camera-panel').hidden = false;
  });
  document.getElementById('close-camera').addEventListener('click', function () {
    document.getElementById('camera-panel').hidden = true;
    stopCamera();
  });
  document.getElementById('snap').addEventListener('click', function () {
    snapAndSend().catch(function () {
      document.getElementById('send-progress').textContent = 'Could not send photo';
    });
  });
}

/* Boot the page that included this script. */
if (PAGE === 'host') {
  startHost();
}
if (PAGE === 'send') {
  startSender();
}
