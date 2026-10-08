/*
  qrprint / qrprint.js
  PC homepage: light theme by default, remembered toggles, one QR.
  LAN QR points at this PC. Internet QR is a PeerJS room.
  Phone opens the same file with role=send, picks a file, sends it.
  PC receives the blob and calls print(). Mobile never prints.

  LAN signaling is PeerJS. Internet is the same PeerJS broker.
  LAN uses host candidates only. Internet allows STUN.
*/

"use strict";

/* localStorage key for light or dark. Missing means light. */
const THEME_KEY = "qrprint-theme";

/* localStorage key for lan or internet. Missing means lan. */
const PATH_KEY = "qrprint-path";

/* PeerJS cloud broker used only when the path toggle is Internet. */
const PEER_HOST = "0.peerjs.com";

/* PeerJS broker port. */
const PEER_PORT = 443;

/* PeerJS broker path. */
const PEER_PATH = "/";

/* WebRTC data-channel chunk size in bytes. */
const CHUNK = 16384;

/* Homepage root. Hidden when this load is the phone sender. */
const homeEl = document.getElementById("home");

/* Sender root. Shown only when the QR opened role=send. */
const senderEl = document.getElementById("sender");

/* Theme toggle. Label shows the theme it will switch to. */
const themeBtn = document.getElementById("theme-toggle");

/* QR box. Filled by the vendored QRCode lib as a canvas. */
const qrEl = document.getElementById("qr");

/* File input on the sender view. Image or PDF. */
const fileEl = document.getElementById("file");

/* Camera input. Photo only. */
const cameraEl = document.getElementById("camera");

/* Sender status line. */
const sendStatusEl = document.getElementById("send-status");

/* File chosen before the data channel is open. Sent when it opens. */
let pendingFile = null;

/* Current path: "lan" or "internet". */
let pathMode = "internet";

/* Room id shared by the QR and the signaling join. */
let roomId = "";

/* LAN WebRTC peer connection on the PC receiver. */
let lanPc = null;

/* Internet PeerJS object on either side. */
let peer = null;

/* LAN signaling socket. Closed on a path switch so the old room is dropped. */
let signalWs = null;

/* Active data channel, sender or receiver. */
let channel = null;

/* Incoming file meta from the first JSON message. */
let incoming = null;

/* Incoming chunks, filled until size is reached. */
let incomingParts = [];

/* Bytes received so far for the open file. */
let incomingGot = 0;

/*
  True on a desktop PC. Android, iPhone, iPad are rejected.
  Printing is allowed only when this is true.
*/
function isPc() {
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|Mobile/i.test(ua)) return false;
  return /Windows|Macintosh|Linux|CrOS/i.test(ua);
}

/*
  Reads the query string into a plain object.
*/
function query() {
  const out = {};
  const q = new URLSearchParams(location.search);
  q.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/*
  Applies light or dark and stores it. Light is the default.
*/
function applyTheme(theme) {
  const dark = theme === "dark";
  document.body.classList.toggle("dark", dark);
  themeBtn.textContent = dark ? "Light" : "Dark";
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
}

/*
  Short room token. Not a secret. Just the meeting id.
*/
function makeRoom() {
  return Math.random().toString(36).slice(2, 8);
}

/*
  Asks the print server for the LAN address.
  Returns { ip, port } or an empty ip when no private address exists.
*/
async function lanInfo() {
  const res = await fetch("/api/info", { cache: "no-store" });
  return res.json();
}

/*
  Draws the QR from a full URL. Size follows the 60vw box.
  Clears the previous canvas so a path switch does not stack codes.
*/
async function drawQr(url) {
  const size = Math.round(Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7, 520));
  qrEl.innerHTML = "";
  new QRCode(qrEl, {
    text: url,
    width: size,
    height: size,
    correctLevel: QRCode.CorrectLevel.M
  });
  qrEl.setAttribute("aria-label", url);
}

/*
  PeerJS options. LAN skips STUN so the data channel stays on Wi-Fi.
*/
function peerOptions() {
  const opt = {
    host: PEER_HOST,
    port: PEER_PORT,
    path: PEER_PATH,
    secure: true
  };
  if (pathMode === "lan") opt.config = { iceServers: [] };
  return opt;
}

/*
  Marks the sender ready and flushes a file chosen during connect.
*/
function onChannelOpen() {
  if (sendStatusEl) sendStatusEl.textContent = "Ready";
  if (pendingFile) {
    const file = pendingFile;
    pendingFile = null;
    sendFile(file);
  }
}
function isPrivateHost(host) {
  const ip = String(host || "").split(":")[0];
  return ip.startsWith("10.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
}

/*
  Builds the URL encoded in the QR.
  LAN is http and the Wi-Fi address of this PC, never localhost.
  Internet is a peer link, not the print PC and not the PeerJS site.
*/
async function buildQrUrl() {
  const q = query();
  roomId = q.room || roomId || makeRoom();
  const origin = location.origin && location.origin !== "null" ? location.origin : "";
  if (!origin) return "";
  return origin + "/qrprint.html?role=send&mode=internet&room=" + roomId;
}

/*
  Refreshes the QR and restarts the receiver for the selected path.
  Does not run on the phone sender.
*/
async function showHome() {
  const url = await buildQrUrl();
  if (!url) {
    qrEl.innerHTML = "";
    qrEl.setAttribute("aria-label", "No LAN address");
    return;
  }
  await drawQr(url);
  startPeerRecv();
}

/*
  Sets the path, lights the active half green, stores it, rebuilds the QR.
*/
function setPath(mode) {
  pathMode = "internet";
  localStorage.setItem(PATH_KEY, pathMode);
  stopPeers();
  showHome();
}

/*
  Closes any open peer or data channel before a path switch.
*/
function stopPeers() {
  if (signalWs) {
    signalWs.close();
    signalWs = null;
  }
  if (channel) {
    channel.close();
    channel = null;
  }
  if (lanPc) {
    lanPc.close();
    lanPc = null;
  }
  if (peer) {
    peer.destroy();
    peer = null;
  }
  incoming = null;
  incomingParts = [];
  incomingGot = 0;
}

/*
  PC side. This browser is the PeerJS room id in the QR.
*/
function startPeerRecv() {
  peer = new Peer(roomId, peerOptions());
  peer.on("connection", (conn) => {
    channel = conn;
    conn.on("data", (payload) => onRecvData(payload));
  });
  peer.on("error", () => {
    qrEl.setAttribute("aria-label", "PeerJS failed");
  });
}

/*
  Phone side. Connects to the room as soon as the QR page opens.
*/
function startPeerConnect() {
  peer = new Peer(peerOptions());
  peer.on("open", () => {
    const conn = peer.connect(roomId, { reliable: true });
    channel = conn;
    conn.on("open", onChannelOpen);
  });
  peer.on("error", () => {
    if (sendStatusEl) sendStatusEl.textContent = "Not connected";
  });
}

/*
  Phone side, Internet. Connects to the room as soon as the QR page opens.
*/
function startInternetConnect() {
  peer = new Peer({
    host: PEER_HOST,
    port: PEER_PORT,
    path: PEER_PATH,
    secure: true
  });
  peer.on("open", () => {
    const conn = peer.connect(roomId, { reliable: true });
    channel = conn;
    conn.on("open", () => {
      if (sendStatusEl) sendStatusEl.textContent = "Ready";
      if (pendingFile) {
        const file = pendingFile;
        pendingFile = null;
        sendFile(file);
      }
    });
  });
  peer.on("error", () => {
    if (sendStatusEl) sendStatusEl.textContent = "Not connected";
  });
}

/*
  PC side, Internet. This browser is the PeerJS room id in the QR.
*/
function startInternetRecv() {
  peer = new Peer(roomId, {
    host: PEER_HOST,
    port: PEER_PORT,
    path: PEER_PATH,
    secure: true
  });
  peer.on("connection", (conn) => {
    channel = conn;
    conn.on("data", (payload) => onRecvData(payload));
  });
}

/*
  Phone side. Connect itself starts in startPeerConnect.
*/
function startInternetSend(file) {
  pendingFile = file;
  if (channel && channel.open) sendFile(file);
}

/*
  Queues a chosen file and sends it if the channel is already open.
*/
function queueFile(file) {
  if (!file) return;
  pendingFile = file;
  if (sendStatusEl) sendStatusEl.textContent = "Sending";
  if (channel && channel.readyState === "open") {
    pendingFile = null;
    sendFile(file);
  } else if (channel && channel.open) {
    pendingFile = null;
    sendFile(file);
  }
}
/*
  Sends meta, then chunks, then a done marker.
*/
function sendFile(file) {
  channel.send(JSON.stringify({
    kind: "meta",
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size
  }));
  const reader = new FileReader();
  reader.onload = () => {
    const buf = reader.result;
    for (let i = 0; i < buf.byteLength; i += CHUNK) {
      channel.send(buf.slice(i, i + CHUNK));
    }
    channel.send(JSON.stringify({ kind: "done" }));
    if (sendStatusEl) sendStatusEl.textContent = "Sent";
  };
  reader.readAsArrayBuffer(file);
}

/*
  Attaches the receive handler used by the LAN data channel.
*/
function bindRecv(ch) {
  channel = ch;
  ch.binaryType = "arraybuffer";
  ch.addEventListener("message", (ev) => onRecvData(ev.data));
}

/*
  Collects meta and chunks. On done, prints if this is a PC.
*/
function onRecvData(payload) {
  if (typeof payload === "string") {
    const msg = JSON.parse(payload);
    if (msg.kind === "meta") {
      incoming = msg;
      incomingParts = [];
      incomingGot = 0;
    }
    if (msg.kind === "done" && incoming) printIncoming();
    return;
  }
  incomingParts.push(payload);
  incomingGot += payload.byteLength;
  if (incoming && incomingGot >= incoming.size) printIncoming();
}

/*
  Builds the blob and opens the print dialog. No-op on a phone.
  Images are wrapped in a page so the dialog has something to print.
*/
function printIncoming() {
  if (!incoming || !isPc()) return;
  const blob = new Blob(incomingParts, { type: incoming.mime });
  const mime = incoming.mime || "";
  incoming = null;
  incomingParts = [];
  incomingGot = 0;
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.width = "1px";
  frame.style.height = "1px";
  if (mime.indexOf("image/") === 0) {
    frame.srcdoc = "<!DOCTYPE html><html><body style=\"margin:0\"><img src=\"" + url + "\" style=\"width:100%\"></body></html>";
    frame.onload = () => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    };
  } else {
    frame.src = url;
    frame.onload = () => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    };
  }
  document.body.appendChild(frame);
}

/*
  Homepage boot. Theme, path, QR. Refuses to present as a phone app.
*/
async function bootHome() {
  if (!isPc()) {
    homeEl.hidden = true;
    return;
  }
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  themeBtn.addEventListener("click", () => {
    applyTheme(document.body.classList.contains("dark") ? "light" : "dark");
  });
  setPath("internet");
}

/*
  Sender boot. Connects immediately from the QR, then offers Camera or Pick.
*/
function bootSender() {
  homeEl.hidden = true;
  senderEl.hidden = false;
  const q = query();
  roomId = q.room || "";
  pathMode = "internet";
  document.getElementById("camera-btn").addEventListener("click", () => cameraEl.click());
  document.getElementById("pick-btn").addEventListener("click", () => fileEl.click());
  cameraEl.addEventListener("change", () => queueFile(cameraEl.files && cameraEl.files[0]));
  fileEl.addEventListener("change", () => queueFile(fileEl.files && fileEl.files[0]));
  if (!roomId) {
    if (sendStatusEl) sendStatusEl.textContent = "No room";
    return;
  }
  startPeerConnect();
}

/* Role from the QR decides homepage or sender. */
const role = query().role;
if (role === "send") bootSender();
else bootHome();
