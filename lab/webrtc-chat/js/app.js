/*
 * UI glue: setup name, chat box, QR generate / scan.
 */

/* Current local profile { uniqId, name }. */
let profile = getOrInitProfile();

/* Remote display name once hello arrives. */
let remoteName = "Peer";

/**
 * Short status text in the header.
 */
function setStatus(kind, text) {
  /* Status element. */
  const el = document.getElementById("status");
  el.className = kind === "ok" ? "ok" : kind === "bad" ? "bad" : "";
  el.textContent = text;
}

/**
 * Append a bubble or system line to the log.
 */
function addLine(kind, who, text) {
  /* Chat log container. */
  const log = document.getElementById("log");
  const div = document.createElement("div");
  div.className = "msg " + kind;
  if (kind === "sys") {
    div.textContent = text;
  } else {
    const w = document.createElement("span");
    w.className = "who";
    w.textContent = who;
    div.appendChild(w);
    div.appendChild(document.createTextNode(text));
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

/**
 * Shared PeerJS / channel callbacks.
 */
function makeHooks() {
  return {
    onStatus: setStatus,
    onHostReady: function onHostReady(code) {
      document.getElementById("session-code").textContent = code;
      drawQr(code);
    },
    onConnected: function onConnected() {
      hideOverlays();
      document.getElementById("msg").disabled = false;
      document.getElementById("send").disabled = false;
      addLine("sys", "", "Channel open");
    },
    onMessage: function onMessage(msg) {
      if (msg && msg.type === "hello") {
        remoteName = msg.name || "Peer";
        addLine("sys", "", remoteName + " joined");
        return;
      }
      if (msg && (msg.type === "chat" || msg.text)) {
        addLine("them", msg.name || remoteName, msg.text || "");
      }
    }
  };
}

/**
 * Hide QR + scan overlays and stop camera.
 */
function hideOverlays() {
  document.getElementById("qr-modal").classList.remove("show");
  document.getElementById("scan-modal").classList.remove("show");
  document.getElementById("choice-modal").classList.remove("show");
  stopScan();
}

/**
 * Show first-run name form if needed.
 */
function maybeSetup() {
  if (isValidName(profile.name) && /^\d{10}$/.test(profile.uniqId)) {
    saveProfile(profile.uniqId, profile.name);
    document.getElementById("me-name").textContent = profile.name;
    document.getElementById("me-id").textContent = profile.uniqId;
    return;
  }
  document.getElementById("setup").classList.add("show");
}

/**
 * Wire all buttons after DOM is ready.
 */
function init() {
  maybeSetup();

  /* Save name from setup card. */
  document.getElementById("save-name").addEventListener("click", function onSaveName() {
    const input = document.getElementById("name-input");
    const n = input.value.trim();
    const err = document.getElementById("name-err");
    if (!isValidName(n)) {
      err.textContent = "Name must be 3–10 characters.";
      return;
    }
    err.textContent = "";
    profile.name = n;
    if (!/^\d{10}$/.test(profile.uniqId)) {
      profile.uniqId = makeUniqId();
    }
    saveProfile(profile.uniqId, profile.name);
    document.getElementById("me-name").textContent = profile.name;
    document.getElementById("me-id").textContent = profile.uniqId;
    document.getElementById("setup").classList.remove("show");
  });

  /* Edit name later. */
  document.getElementById("edit-name").addEventListener("click", function onEdit() {
    document.getElementById("name-input").value = profile.name;
    document.getElementById("setup").classList.add("show");
  });

  /* QR button opens Generate / Scan choice. */
  document.getElementById("qr-btn").addEventListener("click", function onQrBtn() {
    document.getElementById("choice-modal").classList.add("show");
  });

  /* Generate: host a 6-digit room + QR. */
  document.getElementById("opt-generate").addEventListener("click", function onGen() {
    document.getElementById("choice-modal").classList.remove("show");
    document.getElementById("qr-modal").classList.add("show");
    startHost(profile, makeHooks());
  });

  /* Scan: camera then guest connect. */
  document.getElementById("opt-scan").addEventListener("click", function onScanOpt() {
    document.getElementById("choice-modal").classList.remove("show");
    document.getElementById("scan-modal").classList.add("show");
    startScan()
      .then(function onCode(code) {
        addLine("sys", "", "Joining " + code);
        startGuest(code, profile, makeHooks());
      })
      .catch(function onScanErr(err) {
        setStatus("bad", "Camera: " + err);
      });
  });

  /* Close buttons on modals. */
  document.querySelectorAll("[data-close]").forEach(function bindClose(btn) {
    btn.addEventListener("click", function onClose() {
      hideOverlays();
    });
  });

  /* Send chat line. */
  function sendChat() {
    const input = document.getElementById("msg");
    const text = input.value.trim();
    if (!text) {
      return;
    }
    const ok = sendPayload({
      type: "chat",
      name: profile.name,
      uniqId: profile.uniqId,
      text: text
    });
    if (!ok) {
      setStatus("bad", "Not connected");
      return;
    }
    addLine("me", profile.name, text);
    input.value = "";
  }

  document.getElementById("send").addEventListener("click", sendChat);
  document.getElementById("msg").addEventListener("keydown", function onKey(e) {
    if (e.key === "Enter") {
      sendChat();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
