/*
  Project: paper-keyboard
  File: paper-keyboard.js
  Role: Role pick, pairing UI (link logic in paper-link.js), screen keyboard send, paper panel switch.
  Output inserts received characters. Input sends them. Paper camera finds the corner shapes (paper-corners.js).
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
const codeInput = document.getElementById("code-input");
const disconnectBtn = document.getElementById("disconnect");
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

/* Active pairing from paper-link.js. Output or input, never both. */
let session = null;

/* Camera stream used only while scanning a QR. */
let scanStream = null;

/*
  Set the short status line.
*/
function setStatus(text, connected) {
  statusLine.textContent = text;
  statusLine.classList.toggle("connected", !!connected);
}

/*
  Show one panel: home, output, or input. Disconnect shows once a role runs.
*/
function showPanel(name) {
  home.classList.toggle("hidden", name !== "home");
  outputView.classList.toggle("hidden", name !== "output");
  inputView.classList.toggle("hidden", name !== "input");
  disconnectBtn.classList.toggle("hidden", name === "home");
}

/*
  Desktop: open the saved code (or a new one), draw the big code and the QR.
  The long link is never shown as text.
*/
function startOutput() {
  showPanel("output");
  session = window.PaperLink.startOutput({
    onCode: function (code) {
      document.getElementById("code-big").textContent = code;
      const box = document.getElementById("qr");
      box.replaceChildren();
      new QRCode(box, { text: window.PaperLink.inputUrl(code), width: 200, height: 200 });
      box.removeAttribute("title");
    },
    onStatus: setStatus,
    onData: applyIncoming
  });
}

/*
  Phone: connect to a 4-digit code. Retries until Disconnect.
*/
function startInput(code) {
  if (!code) {
    setStatus("Enter the 4-digit code from the desktop.");
    return;
  }
  stopScan();
  if (session) {
    session.stop();
  }
  showPanel("input");
  codeInput.value = code;
  session = window.PaperLink.startInput(code, {
    onStatus: setStatus,
    onOpen: function () {
      connectBox.classList.add("hidden");
      keyBox.classList.remove("hidden");
    },
    onDrop: function () {
      connectBox.classList.remove("hidden");
    }
  });
}

/*
  Manual Disconnect. The only thing that ends a link; clears the saved code.
*/
function disconnect() {
  stopScan();
  stopPaperCamera();
  if (session) {
    session.stop();
    session = null;
  }
  connectBox.classList.remove("hidden");
  keyBox.classList.add("hidden");
  document.getElementById("qr").replaceChildren();
  document.getElementById("code-big").textContent = "";
  showPanel("home");
  setStatus("Pick a role");
  history.replaceState(null, "", window.location.pathname);
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
  if (!session || !session.send || !session.send(payload)) {
    echo.textContent = "Not sent: not connected";
  }
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

/* Last time each corner shape was seen. Holds each light through a wobble. */
const cornerSeenAt = { tl: 0, tr: 0, bl: 0, br: 0 };

/* Last spot of each corner, kept for the hold. */
const cornerLast = { tl: null, tr: null, bl: null, br: null };

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
  Put the overlay exactly on the shown picture (video uses object-fit: contain).
*/
function fitOverlay(video, canvas) {
  const boxW = video.clientWidth;
  const boxH = video.clientHeight;
  const scale = Math.min(boxW / video.videoWidth, boxH / video.videoHeight);
  const w = video.videoWidth * scale;
  const h = video.videoHeight * scale;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.style.left = (boxW - w) / 2 + "px";
  canvas.style.top = (boxH - h) / 2 + "px";
}

/*
  Sample the viewfinder, find each corner shape, light its LED.
  All four held: green sheet outline. Otherwise dots on the found ones.
*/
function checkCorners() {
  const video = document.getElementById("paper-video");
  const canvas = document.getElementById("paper-overlay");
  if (!video.videoWidth) {
    return;
  }
  const width = 320;
  const height = Math.round(width * video.videoHeight / video.videoWidth);
  canvas.width = width;
  canvas.height = height;
  fitOverlay(video, canvas);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, width, height);
  const frame = ctx.getImageData(0, 0, width, height);
  const found = window.PaperCorners.detect(frame.data, width, height);
  const now = Date.now();
  const names = { tl: "circle", tr: "square", bl: "triangle", br: "diamond" };
  const have = [];
  const missing = [];
  Object.keys(names).forEach(function (key) {
    if (found[key]) {
      cornerSeenAt[key] = now;
      cornerLast[key] = found[key];
    }
    /* 800 ms hold rides over a frame or two of blur. */
    const held = now - cornerSeenAt[key] < 800;
    document.getElementById("led-" + key).classList.toggle("ok", held);
    (held ? have : missing).push(names[key]);
  });
  const locked = missing.length === 0;
  document.getElementById("paper-status").textContent = locked
    ? "Locked. All four corners found."
    : "Found: " + (have.join(", ") || "none") + ". Missing: " + missing.join(", ") +
      ". Keep all four shapes in view.";
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "#1d7a3a";
  ctx.lineWidth = 3;
  if (locked) {
    ctx.beginPath();
    ctx.moveTo(cornerLast.tl.x, cornerLast.tl.y);
    ctx.lineTo(cornerLast.tr.x, cornerLast.tr.y);
    ctx.lineTo(cornerLast.br.x, cornerLast.br.y);
    ctx.lineTo(cornerLast.bl.x, cornerLast.bl.y);
    ctx.closePath();
    ctx.stroke();
    return;
  }
  Object.keys(names).forEach(function (key) {
    if (found[key]) {
      ctx.beginPath();
      ctx.arc(found[key].x, found[key].y, Math.max(4, found[key].size / 2), 0, Math.PI * 2);
      ctx.stroke();
    }
  });
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
    setStatus("No QR detector in this browser. Type the 4-digit code.");
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
    let codes = [];
    try {
      codes = await detector.detect(scanVideo);
    } catch (err) {
      return;
    }
    const code = codes.length ? window.PaperLink.parseCode(codes[0].rawValue) : "";
    if (code) {
      clearInterval(timer);
      startInput(code);
    }
  }, 400);
}

document.getElementById("pick-output").addEventListener("click", startOutput);

document.getElementById("pick-input").addEventListener("click", function () {
  showPanel("input");
  setStatus("Enter the 4-digit code, or scan the QR.");
  codeInput.focus();
});

document.getElementById("scan-qr").addEventListener("click", function () {
  startScan().catch(function () {
    setStatus("Camera blocked. Type the 4-digit code.");
  });
});

document.getElementById("code-go").addEventListener("click", function () {
  startInput(window.PaperLink.parseCode(codeInput.value));
});
codeInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    startInput(window.PaperLink.parseCode(codeInput.value));
  }
});

disconnectBtn.addEventListener("click", disconnect);

modeTouch.addEventListener("click", function () {
  setMode("touch");
});
modePaper.addEventListener("click", function () {
  setMode("paper");
});

drawBoard();

/*
  Boot. A QR link (role=input&code=1234, or an old peer= link) connects at once.
  Otherwise a saved desktop code reopens Output, and a saved phone code reconnects Input.
*/
const params = new URLSearchParams(window.location.search);
const urlCode = window.PaperLink.parseCode(window.location.search);
if (params.get("role") === "input" && urlCode) {
  startInput(urlCode);
} else if (window.PaperLink.loadKey(window.PaperLink.KEY_HOST)) {
  startOutput();
} else if (window.PaperLink.loadKey(window.PaperLink.KEY_LAST)) {
  startInput(window.PaperLink.loadKey(window.PaperLink.KEY_LAST));
}
