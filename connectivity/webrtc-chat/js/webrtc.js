/*
 * PeerJS handshake + DataChannel chat.
 * Host listens on 6-digit peer id.
 * Guest connects to that id.
 * Chat payload is JSON over the data connection.
 */

/* Active PeerJS Peer instance. */
let peer = null;
/* Active DataConnection. */
let conn = null;
/* True when this tab created the 6-digit room. */
let isHost = false;
/* Current 6-digit session code, or empty. */
let sessionCode = "";
/* Guest retry timer id. */
let joinRetryTimer = null;
/* Guest retry count. */
let joinTries = 0;

/**
 * PeerJS cloud + STUN. Same options for host and guest.
 */
const PEER_OPTS = {
  host: "0.peerjs.com",
  port: 443,
  path: "/",
  secure: true,
  debug: 1,
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" }
    ]
  }
};

/**
 * Map 6-digit UI code to a PeerJS id (short numeric ids are flaky).
 */
function peerIdFromCode(code) {
  return "p2pc" + String(code);
}

/**
 * Build a random 6-digit session code (string).
 */
function makeSessionCode() {
  /* Six digits. */
  let code = "";
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 6; i++) {
    code += String(buf[i] % 10);
  }
  return code;
}

/**
 * Tear down peer and connection.
 */
function teardownPeer() {
  /* Close data connection first. */
  if (conn) {
    try {
      conn.close();
    } catch (e) {
      /* Ignore. */
    }
    conn = null;
  }
  /* Destroy PeerJS peer. */
  if (peer) {
    try {
      peer.destroy();
    } catch (e) {
      /* Ignore. */
    }
    peer = null;
  }
  isHost = false;
  sessionCode = "";
  if (joinRetryTimer) {
    clearTimeout(joinRetryTimer);
    joinRetryTimer = null;
  }
  joinTries = 0;
}

/**
 * Wire events on an open DataConnection.
 */
function bindConn(c, profile, hooks) {
  conn = c;
  /* Incoming JSON messages. */
  c.on("data", function onData(raw) {
    let msg = raw;
    if (typeof raw === "string") {
      try {
        msg = JSON.parse(raw);
      } catch (e) {
        msg = { type: "chat", text: raw, name: "?" };
      }
    }
    hooks.onMessage(msg);
  });
  /* Peer closed the channel. */
  c.on("close", function onClose() {
    hooks.onStatus("disconnected", "Disconnected");
  });
  /* Transport error. */
  c.on("error", function onErr(err) {
    hooks.onStatus("bad", String(err));
  });
}

/**
 * Send a JS object over the data connection.
 */
function sendPayload(obj) {
  if (!conn || !conn.open) {
    return false;
  }
  conn.send(JSON.stringify(obj));
  return true;
}

/**
 * Host: listen as peer id = 6-digit code.
 * code may be passed in so the QR can show before PeerJS opens.
 */
function startHost(profile, hooks, code) {
  teardownPeer();
  isHost = true;
  sessionCode = code || makeSessionCode();
  /* Peer id is prefixed room code so guest can dial it. */
  peer = new Peer(peerIdFromCode(sessionCode), PEER_OPTS);
  peer.on("open", function onOpen() {
    hooks.onStatus("wait", "Ready. Code " + sessionCode);
    hooks.onHostReady(sessionCode);
  });
  peer.on("connection", function onIncoming(c) {
    bindConn(c, profile, hooks);
    c.on("open", function onChanOpen() {
      /* Introduce ourselves. */
      sendPayload({
        type: "hello",
        name: profile.name,
        uniqId: profile.uniqId
      });
      hooks.onStatus("ok", "Connected");
      hooks.onConnected();
    });
  });
  peer.on("error", function onPeerErr(err) {
    /* Id taken: make a new code. */
    if (err && err.type === "unavailable-id") {
      hooks.onStatus("bad", "Code busy, new code…");
      startHost(profile, hooks);
      return;
    }
    hooks.onStatus("bad", (err && err.type) || String(err));
  });
  return sessionCode;
}

/**
 * Guest: own random peer id, connect to host's 6-digit id.
 */
function startGuest(code, profile, hooks) {
  teardownPeer();
  isHost = false;
  sessionCode = code;
  peer = new Peer(PEER_OPTS);
  peer.on("open", function onOpen() {
    hooks.onStatus("wait", "Dialing " + code);
    tryConnectGuest(code, profile, hooks);
  });
  peer.on("error", function onPeerErr(err) {
    const typ = (err && err.type) || "";
    /* Host not on broker yet — retry a few times. */
    if (typ === "peer-unavailable" && joinTries < 8) {
      scheduleGuestRetry(code, profile, hooks);
      return;
    }
    hooks.onStatus("bad", typ || String(err));
  });
}

/**
 * Guest: open a data connection to the host peer id.
 */
function tryConnectGuest(code, profile, hooks) {
  joinTries += 1;
  /* Dial prefixed id, reliable data channel. */
  const c = peer.connect(peerIdFromCode(code), { reliable: true });
  bindConn(c, profile, hooks);
  c.on("open", function onChanOpen() {
    if (joinRetryTimer) {
      clearTimeout(joinRetryTimer);
      joinRetryTimer = null;
    }
    sendPayload({
      type: "hello",
      name: profile.name,
      uniqId: profile.uniqId
    });
    hooks.onStatus("ok", "Connected");
    hooks.onConnected();
  });
}

/**
 * Wait, then dial the host again.
 */
function scheduleGuestRetry(code, profile, hooks) {
  hooks.onStatus("wait", "Host not ready, retry " + joinTries);
  joinRetryTimer = setTimeout(function retryJoin() {
    if (!peer || peer.destroyed) {
      return;
    }
    tryConnectGuest(code, profile, hooks);
  }, 1500);
}
