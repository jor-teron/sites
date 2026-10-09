/*
  Project: paper-keyboard
  File: paper-link.js
  Role: 4-digit code pairing over PeerJS, saved across reloads, auto-reconnect.
  Output (desktop) owns peer id 'jtpkb-' + code. Input (phone) connects to it.
  PeerJS default config is used on purpose: its built-in TURN relay is needed behind CGNAT.
*/
(function () {
  const PREFIX = "jtpkb-";
  const KEY_HOST = "jtpkb-host-code";
  const KEY_LAST = "jtpkb-last-code";
  const CODE_RE = /^[0-9]{4}$/;

  /* Backoff steps for reconnects, in ms. Last step repeats. */
  const BACKOFF = [1000, 2000, 4000, 8000, 15000];

  /* A reloaded desktop tab may still hold its id at the broker for a few seconds. */
  const ID_RETRY_MS = [2000, 4000, 6000];

  /* Give up on one connect attempt after this long and try again. */
  const OPEN_TIMEOUT = 10000;

  function loadKey(key) {
    try { return localStorage.getItem(key) || ""; } catch (err) { return ""; }
  }
  function saveKey(key, value) {
    try { localStorage.setItem(key, value); } catch (err) { /* blocked storage */ }
  }
  function removeKey(key) {
    try { localStorage.removeItem(key); } catch (err) { /* blocked storage */ }
  }

  function randomCode(avoid) {
    let code = avoid;
    while (!code || code === avoid) {
      code = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    }
    return code;
  }

  /*
    Pull a 4-digit code from typed or scanned text.
    Accepts bare digits, a URL with code=, or an old URL with peer=jtpkb-1234 / peer=1234.
  */
  function parseCode(text) {
    const raw = String(text || "").trim();
    if (CODE_RE.test(raw)) {
      return raw;
    }
    let match = raw.match(/[?&#]code=([0-9]{4})(?![0-9])/);
    if (match) {
      return match[1];
    }
    match = raw.match(/[?&#]peer=(?:jtpkb-)?([0-9]{4})(?![0-9])/);
    if (match) {
      return match[1];
    }
    match = raw.match(/jtpkb-([0-9]{4})(?![0-9])/);
    return match ? match[1] : "";
  }

  /* QR link: this page with role=input and code only. No version tag. */
  function inputUrl(code) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("role", "input");
    url.searchParams.set("code", code);
    return url.toString();
  }

  function backoff(step) {
    return BACKOFF[Math.min(step, BACKOFF.length - 1)];
  }

  function safeDestroy(peer) {
    try { if (peer && !peer.destroyed) { peer.destroy(); } } catch (err) { /* already gone */ }
  }

  /*
    Desktop side. hooks: onCode(code), onStatus(text, connected), onData(payload).
    Returns { stop() }.
  */
  function startOutput(hooks) {
    let code = loadKey(KEY_HOST);
    let remembered = CODE_RE.test(code);
    if (!remembered) {
      code = randomCode();
    }
    let peer = null;
    let timer = null;
    let idRetry = 0;
    let step = 0;
    let stopped = false;
    const conns = new Set();

    function status(text) {
      hooks.onStatus(text, conns.size > 0);
    }

    function schedule(fn, ms) {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    }

    function open() {
      if (stopped) {
        return;
      }
      safeDestroy(peer);
      status("Opening code " + code + "…");
      const me = new Peer(PREFIX + code, { debug: 1 });
      peer = me;
      me.on("open", function () {
        if (me !== peer) { return; }
        idRetry = 0;
        step = 0;
        saveKey(KEY_HOST, code);
        remembered = true;
        hooks.onCode(code);
        status("Ready. On the phone enter " + code + " or scan the QR.");
      });
      me.on("connection", function (conn) {
        conn.on("open", function () {
          conns.add(conn);
          status("Connected");
        });
        conn.on("data", function (payload) {
          hooks.onData(payload);
        });
        function drop() {
          if (conns.delete(conn)) {
            status(conns.size ? "Connected" : "Phone left. Waiting on code " + code + "…");
          }
        }
        conn.on("close", drop);
        conn.on("error", drop);
      });
      me.on("disconnected", function () {
        if (me !== peer || stopped) { return; }
        /* Lost the broker only. Open data links keep working; get the id back. */
        status("Broker lost. Reconnecting…");
        schedule(function () {
          try { me.reconnect(); } catch (err) { open(); }
        }, backoff(step++));
      });
      me.on("error", function (err) {
        if (me !== peer || stopped) { return; }
        const type = err && err.type;
        if (type === "unavailable-id") {
          if (remembered && idRetry < ID_RETRY_MS.length) {
            status("Code " + code + " still held, retrying…");
            schedule(open, ID_RETRY_MS[idRetry++]);
            return;
          }
          /* Taken by someone else. Pick another code. */
          remembered = false;
          idRetry = 0;
          code = randomCode(code);
          schedule(open, 200);
          return;
        }
        if (type === "peer-unavailable") {
          return;
        }
        status("PeerJS " + (type || "error") + ". Retrying…");
        schedule(open, backoff(step++));
      });
    }

    open();
    return {
      stop: function () {
        stopped = true;
        clearTimeout(timer);
        conns.forEach(function (c) { try { c.close(); } catch (err) { /* gone */ } });
        conns.clear();
        safeDestroy(peer);
        removeKey(KEY_HOST);
      }
    };
  }

  /*
    Phone side. hooks: onStatus(text, connected), onOpen(), onDrop().
    Keeps retrying with backoff until stop(). Returns { send(payload) -> bool, stop() }.
  */
  function startInput(code, hooks) {
    let peer = null;
    let conn = null;
    let timer = null;
    let openTimer = null;
    let step = 0;
    let stopped = false;
    let wasOpen = false;

    function retry(text) {
      if (stopped) { return; }
      clearTimeout(openTimer);
      if (wasOpen) {
        wasOpen = false;
        hooks.onDrop();
      }
      const wait = backoff(step++);
      hooks.onStatus(text + " Retrying in " + Math.round(wait / 1000) + " s…", false);
      clearTimeout(timer);
      timer = setTimeout(dial, wait);
    }

    function dial() {
      if (stopped) { return; }
      if (!peer || peer.destroyed) {
        hooks.onStatus("Opening PeerJS…", false);
        const me = new Peer(undefined, { debug: 1 });
        peer = me;
        me.on("open", function () { if (me === peer) { dial(); } });
        me.on("disconnected", function () {
          if (me !== peer || stopped) { return; }
          try { me.reconnect(); } catch (err) { /* handled by retry */ }
        });
        me.on("error", function (err) {
          if (me !== peer || stopped) { return; }
          const type = err && err.type;
          if (type === "peer-unavailable") {
            retry("Code " + code + " not online.");
            return;
          }
          safeDestroy(me);
          peer = null;
          retry("PeerJS " + (type || "error") + ".");
        });
        return;
      }
      if (!peer.open) {
        return;
      }
      hooks.onStatus("Connecting to " + code + "…", false);
      const c = peer.connect(PREFIX + code, { reliable: true });
      conn = c;
      clearTimeout(openTimer);
      openTimer = setTimeout(function () {
        if (c === conn && !c.open) {
          try { c.close(); } catch (err) { /* gone */ }
          retry("No answer.");
        }
      }, OPEN_TIMEOUT);
      c.on("open", function () {
        if (c !== conn) { return; }
        clearTimeout(openTimer);
        step = 0;
        wasOpen = true;
        saveKey(KEY_LAST, code);
        hooks.onStatus("Connected", true);
        hooks.onOpen();
      });
      function drop() {
        if (c !== conn || stopped) { return; }
        conn = null;
        retry("Link lost.");
      }
      c.on("close", drop);
      c.on("error", drop);
    }

    saveKey(KEY_LAST, code);
    dial();
    return {
      send: function (payload) {
        if (!conn || !conn.open) { return false; }
        try { conn.send(payload); return true; } catch (err) { return false; }
      },
      stop: function () {
        stopped = true;
        clearTimeout(timer);
        clearTimeout(openTimer);
        try { if (conn) { conn.close(); } } catch (err) { /* gone */ }
        conn = null;
        safeDestroy(peer);
        peer = null;
        removeKey(KEY_LAST);
      }
    };
  }

  window.PaperLink = {
    KEY_HOST: KEY_HOST,
    KEY_LAST: KEY_LAST,
    loadKey: loadKey,
    parseCode: parseCode,
    inputUrl: inputUrl,
    startOutput: startOutput,
    startInput: startInput
  };
})();
