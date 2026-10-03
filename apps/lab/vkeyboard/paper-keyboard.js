/*
  Project: paper-keyboard
  File: paper-keyboard.js
  Role: Role pick, PeerJS link, QR url, screen keyboard send, paper panel switch.
  Output inserts received characters. Input sends them. Paper camera is not in this test.
*/

/* Home, output, and input panels. */
const home = document.getElementById("home");
const outputView = document.getElementById("output-view");
const inputView = document.getElementById("input-view");

/* Status line and the desktop text box. */
const statusLine = document.getElementById("status");
const note = document.getElementById("note");

/* Connect controls on the phone. */
const connectBox = document.getElementById("connect-box");
const keyBox = document.getElementById("key-box");
const peerManual = document.getElementById("peer-manual");
const scanVideo = document.getElementById("scan-video");
const echo = document.getElementById("echo");

/* Touch board and paper panel. Only one is visible after connect. */
const touchBoard = document.getElementById("touch-board");
const paperBoard = document.getElementById("paper-board");
const modeTouch = document.getElementById("mode-touch");
const modePaper = document.getElementById("mode-paper");

/* Letter layer. Phone order, not the paper-sheet order. */
const ROW_TOP = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"];
const ROW_MID = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
const ROW_LOW = ["z", "x", "c", "v", "b", "n", "m"];

/* Number and symbol layer. */
const NUM_TOP = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const NUM_MID = ["-", "/", ":", ";", "(", ")", "$", "&", "@", "\""];
const NUM_LOW = [".", ",", "?", "!", "'", "+"];

/* True while the number layer is showing. */
let numbersOn = false;

/* True while Shift is latched for one letter. */
let shiftOn = false;

/* Public PeerJS broker. Not a server on the Debian machine. */
const PEER_CLOUD = {
  host: "0.peerjs.com",
  port: 443,
  path: "/",
  secure: true
};

/* This browser's PeerJS node. */
let peer = null;

/* Data channel to the other role. Output receives. Input sends. */
let link = null;

/* Camera stream used only while scanning a QR. */
let scanStream = null;

/*
  Set the short status line.
*/
function setStatus(text) {
  statusLine.textContent = text;
  statusLine.classList.toggle("connected", text === "Connected");
}

/*
  Show one panel: home, output, or input.
*/
function showPanel(name) {
  home.classList.toggle("hidden", name !== "home");
  outputView.classList.toggle("hidden", name !== "output");
  inputView.classList.toggle("hidden", name !== "input");
}

/*
  Build the URL any QR scanner can open.
  The phone browser loads this page as input and connects to the desktop id.
*/
function outputUrl(peerId) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("role", "input");
  url.searchParams.set("peer", peerId);
  return url.toString();
}

/*
  Pull a PeerJS id from a scanned or pasted value.
  Accepts a full URL or a bare id.
*/
function peerFromText(raw) {
  const text = (raw || "").trim();
  if (!text) {
    return "";
  }
  try {
    const url = new URL(text);
    return url.searchParams.get("peer") || "";
  } catch (err) {
    return text;
  }
}

/*
  Start PeerJS. Output shows a QR when the id is ready.
  Input connects after the id is known.
*/
function startPeer(role, remoteId) {
  setStatus("Opening PeerJS…");
  peer = new Peer(undefined, PEER_CLOUD);
  peer.on("open", function (id) {
    if (role === "output") {
      const linkText = outputUrl(id);
      const box = document.getElementById("qr");
      box.replaceChildren();
      new QRCode(box, { text: linkText, width: 200, height: 200 });
      document.getElementById("qr-link").textContent = linkText;
      setStatus("Output ready. Scan the QR on the phone.");
    } else {
      setStatus("Input ready. Connecting…");
      connectTo(remoteId);
    }
  });
  peer.on("connection", function (conn) {
    bindLink(conn, "Output");
  });
  peer.on("error", function (err) {
    setStatus("PeerJS error: " + err.type);
  });
}

/*
  Connect the phone to the desktop peer id.
*/
function connectTo(remoteId) {
  if (!remoteId) {
    setStatus("No peer id.");
    return;
  }
  link = peer.connect(remoteId, { reliable: true });
  bindLink(link, "Input");
}

/*
  Attach data handlers. Output writes the text box. Input marks the link open.
*/
function bindLink(conn, side) {
  link = conn;
  conn.on("open", function () {
    setStatus("Connected");
    if (side === "Input") {
      connectBox.classList.add("hidden");
      keyBox.classList.remove("hidden");
      stopScan();
    }
  });
  conn.on("data", function (payload) {
    if (side === "Output") {
      applyIncoming(payload);
    }
  });
  conn.on("close", function () {
    setStatus("Link closed.");
  });
  conn.on("error", function () {
    setStatus("Link error.");
  });
}

/*
  Apply a message from the phone to the desktop text box.
*/
function applyIncoming(payload) {
  if (!payload || payload.op === "text") {
    insertText(payload && payload.v ? payload.v : "");
    return;
  }
  if (payload.op === "backspace") {
    runAction("backspace");
    return;
  }
  if (payload.op === "enter") {
    insertText("\n");
    return;
  }
  if (payload.op === "del") {
    runAction("del");
    return;
  }
  if (payload.op === "left" || payload.op === "right" || payload.op === "up" || payload.op === "down") {
    moveCaret(payload.op);
  }
}

/*
  Send one message if the link is open. Also echo it on the phone.
*/
function sendPayload(payload) {
  echo.textContent = "Sent: " + (payload.v || payload.op);
  if (!link || !link.open) {
    setStatus("Not connected.");
    return;
  }
  link.send(payload);
}

/*
  Insert one character at the caret, or replace the selection.
  Keeps the caret after the inserted text.
*/
function insertText(value) {
  const start = note.selectionStart;
  const end = note.selectionEnd;
  const before = note.value.slice(0, start);
  const after = note.value.slice(end);
  note.value = before + value + after;
  const caret = start + value.length;
  note.selectionStart = caret;
  note.selectionEnd = caret;
}

/*
  Apply a named key on the output box.
  Used for backspace and delete received from the phone.
*/
function runAction(action) {
  const start = note.selectionStart;
  const end = note.selectionEnd;
  if (action === "backspace") {
    if (start !== end) {
      insertText("");
      return;
    }
    if (start === 0) {
      return;
    }
    note.value = note.value.slice(0, start - 1) + note.value.slice(end);
    note.selectionStart = start - 1;
    note.selectionEnd = start - 1;
    return;
  }
  if (action === "del") {
    if (start !== end) {
      insertText("");
      return;
    }
    if (start >= note.value.length) {
      return;
    }
    note.value = note.value.slice(0, start) + note.value.slice(start + 1);
    note.selectionStart = start;
    note.selectionEnd = start;
  }
}

/*
  Move the caret by one character, or by one line for up and down.
*/
function moveCaret(direction) {
  const pos = note.selectionStart;
  const value = note.value;
  if (direction === "left") {
    const next = Math.max(0, pos - 1);
    note.selectionStart = next;
    note.selectionEnd = next;
  } else if (direction === "right") {
    const next = Math.min(value.length, pos + 1);
    note.selectionStart = next;
    note.selectionEnd = next;
  } else if (direction === "up" || direction === "down") {
    const lineStart = value.lastIndexOf("\n", pos - 1) + 1;
    const col = pos - lineStart;
    if (direction === "up") {
      const prevEnd = lineStart - 1;
      if (prevEnd < 0) {
        note.selectionStart = 0;
        note.selectionEnd = 0;
      } else {
        const prevStart = value.lastIndexOf("\n", prevEnd - 1) + 1;
        const next = Math.min(prevEnd, prevStart + col);
        note.selectionStart = next;
        note.selectionEnd = next;
      }
    } else {
      const lineEnd = value.indexOf("\n", pos);
      const nextLine = lineEnd === -1 ? value.length : lineEnd + 1;
      if (lineEnd === -1) {
        note.selectionStart = value.length;
        note.selectionEnd = value.length;
      } else {
        const nextEnd = value.indexOf("\n", nextLine);
        const limit = nextEnd === -1 ? value.length : nextEnd;
        const next = Math.min(limit, nextLine + col);
        note.selectionStart = next;
        note.selectionEnd = next;
      }
    }
  }
}

/*
  Make one touch key button.
  label is what the user sees. onPress runs on tap.
*/
function makeKey(label, className, onPress) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "key" + (className ? " " + className : "");
  button.textContent = label;
  button.addEventListener("click", function () {
    button.classList.add("lit");
    setTimeout(function () {
      button.classList.remove("lit");
    }, 400);
    onPress();
  });
  return button;
}

/*
  Fill one row with character keys.
  Letters respect Shift. Each tap is sent to the desktop.
*/
function fillChars(row, chars) {
  chars.forEach(function (ch) {
    row.appendChild(makeKey(shiftOn ? ch.toUpperCase() : ch, "", function () {
      const value = shiftOn ? ch.toUpperCase() : ch;
      sendPayload({ op: "text", v: value });
      if (shiftOn && !numbersOn) {
        shiftOn = false;
        drawBoard();
      }
    }));
  });
}

/*
  Draw the touch keyboard for the current layer.
*/
function drawBoard() {
  const top = document.getElementById("row-top");
  const mid = document.getElementById("row-mid");
  const low = document.getElementById("row-low");
  const bottom = document.getElementById("row-bottom");
  const arrows = document.getElementById("row-arrows");

  top.replaceChildren();
  mid.replaceChildren();
  low.replaceChildren();
  bottom.replaceChildren();
  arrows.replaceChildren();

  fillChars(top, numbersOn ? NUM_TOP : ROW_TOP);
  fillChars(mid, numbersOn ? NUM_MID : ROW_MID);
  if (!numbersOn) {
    low.appendChild(makeKey(shiftOn ? "SHIFT" : "Shift", "wide small-label", function () {
      shiftOn = !shiftOn;
      drawBoard();
    }));
  }
  fillChars(low, numbersOn ? NUM_LOW : ROW_LOW);
  low.appendChild(makeKey("⌫", "wide", function () {
    sendPayload({ op: "backspace" });
  }));

  bottom.appendChild(makeKey(numbersOn ? "ABC" : "123", "wide small-label", function () {
    numbersOn = !numbersOn;
    shiftOn = false;
    drawBoard();
  }));
  bottom.appendChild(makeKey("Space", "space small-label", function () {
    sendPayload({ op: "text", v: " " });
  }));
  bottom.appendChild(makeKey("Enter", "wide small-label", function () {
    sendPayload({ op: "enter" });
  }));

  arrows.appendChild(makeKey("←", "", function () { sendPayload({ op: "left" }); }));
  arrows.appendChild(makeKey("↑", "", function () { sendPayload({ op: "up" }); }));
  arrows.appendChild(makeKey("↓", "", function () { sendPayload({ op: "down" }); }));
  arrows.appendChild(makeKey("→", "", function () { sendPayload({ op: "right" }); }));
  arrows.appendChild(makeKey("Del", "small-label", function () { sendPayload({ op: "del" }); }));
}

/*
  Show Screen keyboard or Paper panel. Does not leave the page.
  Paper mode opens the back camera. Screen mode stops it.
*/
function setMode(mode) {
  const paper = mode === "paper";
  touchBoard.classList.toggle("hidden", paper);
  paperBoard.classList.toggle("hidden", !paper);
  modeTouch.classList.toggle("active", !paper);
  modePaper.classList.toggle("active", paper);
  if (paper) {
    startPaperCamera().catch(function () {
      document.getElementById("paper-status").textContent = "Camera blocked. Allow the camera, then open Paper again.";
    });
  } else {
    stopPaperCamera();
  }
}

/* Back-camera stream for the paper sheet. Separate from the QR scan stream. */
let paperStream = null;

/* Timer for the corner check. Not every video frame. */
let paperTimer = null;

/*
  Open the back camera into the half-screen viewfinder.
*/
async function startPaperCamera() {
  if (paperStream) {
    return;
  }
  paperStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  });
  const track = paperStream.getVideoTracks()[0];
  if (track.applyConstraints) {
    track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(function () {});
  }
  const video = document.getElementById("paper-video");
  video.srcObject = paperStream;
  await video.play();
  paperTimer = setInterval(checkCorners, 300);
}

/* Last time all four marks were seen. Keeps the quad green through a wobble. */
let marksSeenAt = 0;

/*
  Stop the paper camera when the user leaves the panel.
*/
function stopPaperCamera() {
  if (paperTimer) {
    clearInterval(paperTimer);
    paperTimer = null;
  }
  if (paperStream) {
    paperStream.getTracks().forEach(function (track) {
      track.stop();
    });
    paperStream = null;
  }
}

/*
  Find dark squares with a bright hole anywhere in the frame.
  Returns center points. Marks do not have to sit in the camera corners.
*/
function findMarks(data, width, height) {
  const seen = new Uint8Array(width * height);
  const marks = [];
  const step = 2;
  for (let y = 2; y < height - 2; y += step) {
    for (let x = 2; x < width - 2; x += step) {
      const start = y * width + x;
      if (seen[start]) {
        continue;
      }
      const i = start * 4;
      const lum = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
      if (lum > 75) {
        continue;
      }
      const stack = [start];
      seen[start] = 1;
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      while (stack.length && count < 400) {
        const p = stack.pop();
        const px = p % width;
        const py = (p - px) / width;
        count += 1;
        sumX += px;
        sumY += py;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        const near = [p - 1, p + 1, p - width, p + width];
        near.forEach(function (n) {
          if (n < 0 || n >= seen.length || seen[n]) {
            return;
          }
          const nx = n % width;
          const ny = (n - nx) / width;
          if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1) {
            return;
          }
          const k = n * 4;
          const nLum = data[k] * 0.3 + data[k + 1] * 0.59 + data[k + 2] * 0.11;
          if (nLum < 75) {
            seen[n] = 1;
            stack.push(n);
          }
        });
      }
      const bw = maxX - minX;
      const bh = maxY - minY;
      if (count < 8 || count > 180 || bw < 3 || bh < 3 || bw > 28 || bh > 28) {
        continue;
      }
      const cx = Math.round(sumX / count);
      const cy = Math.round(sumY / count);
      const j = (cy * width + cx) * 4;
      const center = data[j] * 0.3 + data[j + 1] * 0.59 + data[j + 2] * 0.11;
      if (center > 150) {
        marks.push({ x: cx, y: cy });
      }
    }
  }
  return marks;
}

/*
  Name four points from their own layout, not from the camera edges.
*/
function nameMarks(marks) {
  const tl = marks.slice().sort(function (a, b) { return (a.x + a.y) - (b.x + b.y); })[0];
  const br = marks.slice().sort(function (a, b) { return (b.x + b.y) - (a.x + a.y); })[0];
  const tr = marks.slice().sort(function (a, b) { return (b.x - b.y) - (a.x - a.y); })[0];
  const bl = marks.slice().sort(function (a, b) { return (a.x - a.y) - (b.x - b.y); })[0];
  return { tl: tl, tr: tr, bl: bl, br: br };
}

/*
  Sample the viewfinder, find marks anywhere, draw the sheet quad.
  The quad stays green for a short hold after the marks were last seen.
*/
function checkCorners() {
  const video = document.getElementById("paper-video");
  const canvas = document.getElementById("paper-overlay");
  if (!video.videoWidth) {
    return;
  }
  const width = 160;
  const height = Math.round(width * video.videoHeight / video.videoWidth);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, width, height);
  const frame = ctx.getImageData(0, 0, width, height);
  const found = findMarks(frame.data, width, height);
  const named = found.length >= 4 ? nameMarks(found) : null;
  if (named) {
    marksSeenAt = Date.now();
  }
  const held = Date.now() - marksSeenAt < 600;
  ["tl", "tr", "bl", "br"].forEach(function (name) {
    document.getElementById("led-" + name).classList.toggle("ok", held);
  });
  document.getElementById("paper-status").textContent = held
    ? "Aligned. Marks found anywhere in frame."
    : "Turn the phone landscape. Tap the sheet to focus.";
  ctx.clearRect(0, 0, width, height);
  if (named) {
    ctx.beginPath();
    ctx.moveTo(named.tl.x, named.tl.y);
    ctx.lineTo(named.tr.x, named.tr.y);
    ctx.lineTo(named.br.x, named.br.y);
    ctx.lineTo(named.bl.x, named.bl.y);
    ctx.closePath();
    ctx.strokeStyle = held ? "#1d7a3a" : "#c44747";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

/*
  Stop the QR camera if it is running.
*/
function stopScan() {
  if (scanStream) {
    scanStream.getTracks().forEach(function (track) {
      track.stop();
    });
    scanStream = null;
  }
  scanVideo.classList.add("hidden");
}

/*
  Scan a QR with the phone camera. Any URL QR also works outside this page.
*/
async function startScan() {
  if (!("BarcodeDetector" in window)) {
    setStatus("This browser has no QR detector. Paste the link.");
    return;
  }
  scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  scanVideo.srcObject = scanStream;
  scanVideo.classList.remove("hidden");
  await scanVideo.play();
  const detector = new BarcodeDetector({ formats: ["qr_code"] });
  const timer = setInterval(async function () {
    if (!scanStream) {
      clearInterval(timer);
      return;
    }
    const codes = await detector.detect(scanVideo);
    if (codes.length && codes[0].rawValue) {
      clearInterval(timer);
      stopScan();
      const remoteId = peerFromText(codes[0].rawValue);
      startPeer("input", remoteId);
    }
  }, 400);
}

document.getElementById("pick-output").addEventListener("click", function () {
  showPanel("output");
  startPeer("output");
});

document.getElementById("pick-input").addEventListener("click", function () {
  showPanel("input");
  setStatus("Scan the desktop QR, or paste the link.");
});

document.getElementById("scan-qr").addEventListener("click", function () {
  startScan().catch(function () {
    setStatus("Camera blocked. Paste the link.");
  });
});

document.getElementById("peer-go").addEventListener("click", function () {
  startPeer("input", peerFromText(peerManual.value));
});

modeTouch.addEventListener("click", function () {
  setMode("touch");
});
modePaper.addEventListener("click", function () {
  setMode("paper");
});

drawBoard();

/*
  QR open path. role=input and peer=id skips the home pick and connects.
*/
const params = new URLSearchParams(window.location.search);
if (params.get("role") === "input" && params.get("peer")) {
  showPanel("input");
  startPeer("input", params.get("peer"));
}
