/*
  Project: paper-keyboard
  File: paper-link.js
  Role: Pairing for Paper Keyboard on the one shared connection (shared/link, release 3).
  Same API as before: startOutput(hooks), startInput(code, hooks), parseCode, inputUrl.
  - Output (desktop) inside the Hub: uses the Hub's link (postMessage contract). The QR /
    code is the Hub's code (?role=input&hub=1&code=<Hub code>); phone payloads arrive as
    {sharedLink:'message', msg:{type:'pk', app:'paper-keyboard', payload}}.
  - Output standalone: SharedLink host role, 'jtpkb-' + 4-digit code kept in
    'jtpkb-host-code' across reloads (SharedLink retries a held id with backoff).
  - Input (phone): SharedLink join ('jtsites-' for hub=1, else 'jtpkb-'); code kept in
    'jtpkb-last-code'; SharedLink reconnects with backoff until stop().
  Payloads go as SharedLink messages {type:'pk', app:'paper-keyboard', payload}.
  Only a manual Disconnect (stop) ends a link. PeerJS comes from SharedLink's pinned loader.
*/
(function () {
  const PREFIX = "jtpkb-";
  const HUB_PREFIX = "jtsites-";
  const KEY_HOST = "jtpkb-host-code";
  const KEY_LAST = "jtpkb-last-code";
  const KEY_LAST_HUB = "jtpkb-last-hub";
  const CODE_RE = /^[0-9]{4}$/;
  const HUB_RE = /^[A-Z0-9]{4,8}$/;
  const HUB_WAIT_MS = 700;
  const inHub = window.parent && window.parent !== window;
  let hubCode = "";

  function loadKey(key) {
    try { return localStorage.getItem(key) || ""; } catch (err) { return ""; }
  }
  function saveKey(key, value) {
    try { localStorage.setItem(key, value); } catch (err) { /* blocked storage */ }
  }
  function removeKey(key) {
    try { localStorage.removeItem(key); } catch (err) { /* blocked storage */ }
  }

  /* True when the text / URL names a Hub code (hub=1). */
  function isHubText(text) {
    return /[?&#]hub=1/.test(String(text || ""));
  }

  /*
    Pull a code from typed or scanned text.
    Accepts bare digits, a URL with code=, an old URL with peer=jtpkb-1234 / peer=1234,
    or a Hub link (hub=1&code=<4-8 letters/digits>).
  */
  function parseCode(text) {
    const raw = String(text || "").trim();
    if (CODE_RE.test(raw)) {
      return raw;
    }
    if (isHubText(raw)) {
      const m = raw.match(/[?&#]code=([A-Za-z0-9]{4,8})(?![A-Za-z0-9])/);
      if (m && HUB_RE.test(m[1].toUpperCase())) {
        return m[1].toUpperCase();
      }
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

  /* QR link: this page with role=input and the code (hub=1 when it is the Hub's code). */
  function inputUrl(code) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("role", "input");
    if (hubCode && code === hubCode) {
      url.searchParams.set("hub", "1");
    }
    url.searchParams.set("code", code);
    return url.toString();
  }

  function payloadOf(m) {
    return m && m.type === "pk" ? m.payload : undefined;
  }

  /*
    Desktop side. hooks: onCode(code), onStatus(text, connected), onData(payload).
  */
  function startOutput(hooks) {
    let stopped = false;
    let mode = "";
    const subs = [];
    function sub(ev, fn) { subs.push([ev, SharedLink.on(ev, fn)]); }
    function online() {
      return SharedLink.devices.some(function (d) { return d.online && !d.legacy; });
    }
    function onHubMsg(e) {
      const d = e.data;
      if (stopped || e.source !== window.parent || !d || typeof d !== "object") { return; }
      if (d.sharedLink === "hello" && d.code && !mode) {
        mode = "hub";
        hubCode = String(d.code);
        hooks.onCode(hubCode);
        hooks.onStatus("Using the Hub connection · scan to type", true);
      } else if (d.sharedLink === "message" && mode === "hub") {
        const p = payloadOf(d.msg);
        if (p !== undefined) { hooks.onData(p); }
      }
    }
    function standalone() {
      if (stopped || mode) { return; }
      mode = "own";
      sub("status", function (text) { hooks.onStatus(online() ? "Phone connected" : text, online()); });
      sub("devices", function () { hooks.onStatus(online() ? "Phone connected" : "Waiting for phone · code " + SharedLink.code, online()); });
      sub("message", function (m) { const p = payloadOf(m); if (p !== undefined) { hooks.onData(p); } });
      SharedLink.host({ prefix: PREFIX, codeKey: KEY_HOST }).then(function (code) {
        if (!stopped) { hooks.onCode(code); }
      }, function () { hooks.onStatus("PeerJS could not load (offline?)", false); });
      window.addEventListener("pagehide", function () { SharedLink.pause(); });
    }
    if (inHub) {
      window.addEventListener("message", onHubMsg);
      window.parent.postMessage({ sharedLink: "ready", app: "paper-keyboard", types: ["x-none/"] }, "*");
      setTimeout(standalone, HUB_WAIT_MS);
    } else {
      standalone();
    }
    return {
      stop: function () {
        stopped = true;
        window.removeEventListener("message", onHubMsg);
        subs.forEach(function (s) { SharedLink.off(s[0], s[1]); });
        if (mode === "own") { SharedLink.stop(); }
        removeKey(KEY_HOST);
      }
    };
  }

  /*
    Phone side. hooks: onStatus(text, connected), onOpen(), onDrop().
    Returns { send(payload) -> bool, stop() }. hub: true for a Hub code.
  */
  function startInput(code, hooks, hub) {
    if (hub === undefined) {
      hub = isHubText(window.location.search) || (loadKey(KEY_LAST_HUB) === "1" && code === loadKey(KEY_LAST)) || !CODE_RE.test(code);
    }
    saveKey(KEY_LAST, code);
    saveKey(KEY_LAST_HUB, hub ? "1" : "0");
    const subs = [];
    function sub(ev, fn) { subs.push([ev, SharedLink.on(ev, fn)]); }
    sub("status", function (text) { if (!SharedLink.connected) { hooks.onStatus(text, false); } });
    sub("open", function () { hooks.onStatus("Connected", true); hooks.onOpen(); });
    sub("close", function () { hooks.onDrop(); });
    sub("bye", function () { hooks.onStatus("Desktop disconnected.", false); hooks.onDrop(); });
    hooks.onStatus("Connecting to " + code + "…", false);
    SharedLink.join({ prefix: hub ? HUB_PREFIX : PREFIX, code: code }).catch(function () {
      hooks.onStatus("PeerJS could not load (offline?)", false);
    });
    return {
      send: function (payload) {
        return SharedLink.send({ type: "pk", app: "paper-keyboard", payload: payload });
      },
      stop: function () {
        subs.forEach(function (s) { SharedLink.off(s[0], s[1]); });
        SharedLink.stop();
        removeKey(KEY_LAST);
        removeKey(KEY_LAST_HUB);
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
