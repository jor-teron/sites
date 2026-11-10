/* Web MCP — wm_link.js: outbound WebSocket to the Radxa relay, hello, auto-reconnect. MCP1 */
(function (root) {
  'use strict';

  /* Config and RPC dispatcher, loaded as earlier script tags. */
  var C = root.WM_CONFIG;
  var Rpc = root.WMRpc;

  /* Active WebSocket, or null when idle. */
  var socket = null;
  /* True while the user wants a connection (Connect pressed, Disconnect not pressed). */
  var wanted = false;
  /* In-flight hello timer, cleared when hello-ok arrives or the socket closes. */
  var helloTimer = null;
  /* Current backoff delay in milliseconds. */
  var backoff = C.RECONNECT_BASE_MS;
  /* Pending reconnect timer id. */
  var reconnectTimer = null;
  /* Last URL and PIN used, so a reconnect can repeat the same hello. */
  var lastUrl = '';
  var lastPin = '';
  /* Status listeners: (status, detail) where status is idle|connecting|connected|error. */
  var listeners = [];
  /* Bound tools map, set by start() so incoming rpc messages can be dispatched. */
  var tools = null;
  /* Log callback for tools/call rows, set by start(). */
  var onLog = null;

  /**
   * Notify status listeners.
   */
  function emit(status, detail) {
    listeners.forEach(function (fn) {
      try { fn(status, detail || ''); } catch (_) { /* listener bug */ }
    });
  }

  /**
   * Subscribe to connection status changes.
   */
  function onStatus(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  /**
   * Clear the hello timeout handle if one is running.
   */
  function clearHello() {
    if (helloTimer) {
      clearTimeout(helloTimer);
      helloTimer = null;
    }
  }

  /**
   * Clear the reconnect timer if one is pending.
   */
  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  /**
   * Close the current socket without changing the "wanted" flag.
   */
  function dropSocket() {
    clearHello();
    var s = socket;
    socket = null;
    if (s) {
      try { s.onopen = s.onmessage = s.onerror = s.onclose = null; } catch (_) { /* ok */ }
      try { s.close(); } catch (_) { /* already closed */ }
    }
  }

  /**
   * Schedule a reconnect if the user still wants to be connected.
   */
  function scheduleReconnect() {
    if (!wanted) return;
    clearReconnect();
    var delay = backoff;
    backoff = Math.min(backoff * 2, C.RECONNECT_MAX_MS);
    emit('connecting', 'Reconnecting in ' + Math.round(delay / 1000) + 's');
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      if (wanted) open(lastUrl, lastPin);
    }, delay);
  }

  /**
   * Validate a PIN: at least PIN_MIN_LEN characters from the allowed alphabet.
   */
  function validatePin(pin) {
    var s = pin == null ? '' : String(pin).trim();
    if (s.length < C.PIN_MIN_LEN) {
      return { ok: false, pin: s, reason: 'PIN must be at least ' + C.PIN_MIN_LEN + ' characters' };
    }
    var i;
    var allowed = C.PIN_VALID_CHARS || C.PIN_CHARS;
    for (i = 0; i < s.length; i++) {
      if (allowed.indexOf(s.charAt(i)) < 0) {
        return { ok: false, pin: s, reason: 'PIN may only use letters, digits, underscore or hyphen' };
      }
    }
    return { ok: true, pin: s, reason: '' };
  }

  /**
   * Generate a random PIN of PIN_GEN_LEN characters from PIN_CHARS.
   */
  function generatePin() {
    var chars = C.PIN_CHARS;
    var out = '';
    var buf = new Uint32Array(C.PIN_GEN_LEN);
    (root.crypto || root.msCrypto).getRandomValues(buf);
    var i;
    for (i = 0; i < buf.length; i++) {
      out += chars.charAt(buf[i] % chars.length);
    }
    return out;
  }

  /**
   * Handle one message from the relay (hello-ok, replaced, or a forwarded rpc).
   */
  async function onMessage(ev) {
    var msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (_) {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello-ok') {
      clearHello();
      backoff = C.RECONNECT_BASE_MS;
      emit('connected', 'Connected');
      return;
    }
    if (msg.type === 'hello-error') {
      wanted = false;
      clearHello();
      dropSocket();
      emit('error', msg.error || 'Relay rejected the PIN');
      return;
    }
    if (msg.type === 'replaced') {
      wanted = false;
      clearHello();
      dropSocket();
      emit('error', 'Another tab connected with the same PIN');
      return;
    }
    if (msg.type === 'rpc') {
      var result = await Rpc.dispatch(msg.payload, tools);
      if (result.log && typeof onLog === 'function') {
        try { onLog(result.log); } catch (_) { /* ui bug */ }
      }
      /* Notifications are already accepted by the relay (HTTP 202); no reply frame. */
      if (result.notification) return;
      if (socket && socket.readyState === 1) {
        socket.send(JSON.stringify({
          type: 'rpc-result',
          id: msg.id,
          payload: result.reply
        }));
      }
    }
  }

  /**
   * Open a WebSocket to the relay and send the hello frame with the PIN.
   */
  function open(url, pin) {
    lastUrl = url;
    lastPin = pin;
    dropSocket();
    clearReconnect();
    emit('connecting', 'Connecting…');
    var ws;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      emit('error', err && err.message ? err.message : 'Invalid relay URL');
      if (wanted) scheduleReconnect();
      return;
    }
    socket = ws;
    ws.onopen = function () {
      if (socket !== ws) return;
      try {
        ws.send(JSON.stringify({ type: 'hello', pin: pin }));
      } catch (err) {
        emit('error', err && err.message ? err.message : 'Failed to send hello');
        return;
      }
      clearHello();
      helloTimer = setTimeout(function () {
        helloTimer = null;
        emit('error', 'Relay did not accept the hello');
        dropSocket();
        if (wanted) scheduleReconnect();
      }, C.HELLO_TIMEOUT_MS);
    };
    ws.onmessage = function (ev) {
      onMessage(ev).catch(function (err) {
        emit('error', err && err.message ? err.message : 'Tool dispatch failed');
      });
    };
    ws.onerror = function () {
      /* onclose will follow and handle reconnect. */
    };
    ws.onclose = function () {
      if (socket === ws) socket = null;
      clearHello();
      if (wanted) {
        emit('error', 'Disconnected from the relay');
        scheduleReconnect();
      } else {
        emit('idle', 'Disconnected');
      }
    };
  }

  /**
   * User pressed Connect: start (or restart) the link with this URL and PIN.
   */
  function connect(url, pin, boundTools, logFn) {
    var check = validatePin(pin);
    if (!check.ok) {
      emit('error', check.reason);
      return false;
    }
    var trimmed = (url || '').trim();
    if (!trimmed) {
      emit('error', 'Relay URL is required');
      return false;
    }
    tools = boundTools;
    onLog = logFn;
    wanted = true;
    backoff = C.RECONNECT_BASE_MS;
    open(trimmed, check.pin);
    return true;
  }

  /**
   * User pressed Disconnect: stop reconnecting and close the socket.
   */
  function disconnect() {
    wanted = false;
    clearReconnect();
    dropSocket();
    emit('idle', 'Disconnected');
  }

  /**
   * True when a socket is open and hello has been accepted (status is connected).
   */
  function isConnected() {
    return !!(socket && socket.readyState === 1);
  }

  /**
   * True when the user wants a connection (even if we are mid-reconnect).
   */
  function isWanted() {
    return wanted;
  }

  /* Public link API used by wm_main. */
  var api = {
    onStatus: onStatus,
    validatePin: validatePin,
    generatePin: generatePin,
    connect: connect,
    disconnect: disconnect,
    isConnected: isConnected,
    isWanted: isWanted
  };
  root.WMLink = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
