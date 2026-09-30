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
 */
function startHost(profile, hooks) {
  teardownPeer();
  isHost = true;
  sessionCode = makeSessionCode();
  /* Peer id is the room code so guest can dial it. */
  peer = new Peer(sessionCode, { debug: 0 });
  peer.on("open", function onOpen() {
    hooks.onStatus("wait", "Waiting for scan… " + sessionCode);
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
      startHost(profile, hooks);
      return;
    }
    hooks.onStatus("bad", String(err));
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
  peer = new Peer({ debug: 0 });
  peer.on("open", function onOpen() {
    /* Dial the host peer id. */
    const c = peer.connect(code, { reliable: true });
    bindConn(c, profile, hooks);
    c.on("open", function onChanOpen() {
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
    hooks.onStatus("bad", String(err));
  });
}
