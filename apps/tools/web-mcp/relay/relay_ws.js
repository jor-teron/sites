/* Web MCP — relay/relay_ws.js: minimal RFC 6455 WebSocket helpers. MCP2.2
 *
 * Zero-dep unfragmented text / ping / pong / close, used by the MCP module
 * today and ready for a later TCP-bridge module to reuse.
 */
'use strict';

const crypto = require('crypto');
const CONFIG = require('./relay_config.js');

/**
 * Encode a WebSocket frame. Server-to-client frames are not masked.
 * opcode is the RFC 6455 opcode (1 = text, 8 = close, 9 = ping, 10 = pong).
 * payload is a Buffer.
 */
function encodeFrame(opcode, payload) {
  /* Byte length of the payload that follows the header. */
  const len = payload.length;
  /* Header buffer, sized for the 7-bit, 16-bit, or 64-bit length form. */
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    /* 64-bit length; we never send frames near 4GB so the high 4 bytes stay 0. */
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, payload]);
}

/**
 * Wrap a raw TCP socket as a WebSocket connection with send / close / events.
 * maxFrame caps the accepted payload size (defaults to CONFIG.MAX_FRAME).
 */
function createWsConnection(socket, maxFrame) {
  /* Largest payload we will accept, in bytes. */
  const limit = maxFrame == null ? CONFIG.MAX_FRAME : maxFrame;
  /* Accumulated leftover bytes that are not yet a full frame. */
  let buf = Buffer.alloc(0);
  /* Set when we have sent or received a close, so we do not write again. */
  let closed = false;
  const conn = {
    /**
     * Send a UTF-8 text frame.
     */
    send: function (text) {
      if (closed) return;
      socket.write(encodeFrame(0x1, Buffer.from(String(text), 'utf8')));
    },
    /**
     * Send a close frame and end the socket.
     */
    close: function (code) {
      if (closed) return;
      closed = true;
      try {
        const payload = Buffer.alloc(2);
        payload.writeUInt16BE(code || 1000, 0);
        socket.write(encodeFrame(0x8, payload));
      } catch (_) { /* already gone */ }
      socket.end();
    },
    /* Set by the caller: function (text). */
    onMessage: null,
    /* Set by the caller: function (). */
    onClose: null
  };

  /**
   * Parse as many complete frames as possible from the buffer.
   */
  function consume() {
    while (buf.length >= 2) {
      /* First header byte: FIN flag and opcode. */
      const first = buf[0];
      /* Second header byte: mask flag and 7-bit length. */
      const second = buf[1];
      /* True when this frame is the last fragment (we reject fragments). */
      const fin = (first & 0x80) !== 0;
      /* RFC 6455 opcode of this frame. */
      const opcode = first & 0x0f;
      /* Client-to-server frames must be masked. */
      const masked = (second & 0x80) !== 0;
      /* Payload length, possibly extended below. */
      let len = second & 0x7f;
      /* Byte offset where the mask or payload starts. */
      let offset = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        /* High 32 bits of the 64-bit length; we reject anything this large. */
        const high = buf.readUInt32BE(2);
        /* Low 32 bits of the 64-bit length. */
        const low = buf.readUInt32BE(6);
        if (high !== 0 || low > limit) {
          conn.close(1009);
          return;
        }
        len = low;
        offset = 10;
      }
      if (len > limit) {
        conn.close(1009);
        return;
      }
      /* 4 extra header bytes when the frame is masked. */
      const maskLen = masked ? 4 : 0;
      if (buf.length < offset + maskLen + len) return;
      /* Payload bytes, still masked if the client sent a mask. */
      let payload = buf.slice(offset + maskLen, offset + maskLen + len);
      if (masked) {
        /* 4-byte masking key from the client. */
        const mask = buf.slice(offset, offset + 4);
        /* Unmasked copy of the payload. */
        const copy = Buffer.from(payload);
        for (let i = 0; i < copy.length; i++) copy[i] ^= mask[i % 4];
        payload = copy;
      }
      buf = buf.slice(offset + maskLen + len);
      /* We only accept unfragmented frames (FIN set). */
      if (!fin) {
        conn.close(1003);
        return;
      }
      if (opcode === 0x1) {
        /* Text. */
        const text = payload.toString('utf8');
        if (typeof conn.onMessage === 'function') {
          try { conn.onMessage(text); } catch (_) { /* handler bug */ }
        }
      } else if (opcode === 0x8) {
        conn.close(1000);
        return;
      } else if (opcode === 0x9) {
        /* Ping -> pong with the same payload. */
        if (!closed) socket.write(encodeFrame(0xa, payload));
      } else if (opcode === 0xa) {
        /* Pong, ignore. */
      } else if (opcode === 0x2) {
        /* Binary is unused; close. */
        conn.close(1003);
        return;
      }
    }
  }

  socket.on('data', function (chunk) {
    buf = Buffer.concat([buf, chunk]);
    consume();
  });
  socket.on('close', function () {
    closed = true;
    if (typeof conn.onClose === 'function') conn.onClose();
  });
  socket.on('error', function () {
    closed = true;
    if (typeof conn.onClose === 'function') conn.onClose();
  });
  socket.on('end', function () {
    closed = true;
  });
  return conn;
}

/**
 * Complete a WebSocket upgrade handshake and return the wrapped connection, or null.
 * opts may set maxFrame and wsGuid; both default to CONFIG.
 */
function upgradeWebSocket(req, socket, head, opts) {
  /* Optional overrides for the frame cap and the RFC GUID. */
  const options = opts || {};
  /* Header value the browser sent for the handshake. */
  const key = req.headers['sec-websocket-key'];
  /* Upgrade header, compared case-insensitively. */
  const upgrade = String(req.headers.upgrade || '').toLowerCase();
  if (!key || upgrade !== 'websocket') {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return null;
  }
  /* GUID used in the accept hash (RFC 6455). */
  const guid = options.wsGuid || CONFIG.WS_GUID;
  /* Base64 SHA-1 of the key plus the GUID, sent back as Sec-WebSocket-Accept. */
  const accept = crypto.createHash('sha1').update(key + guid).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n' +
    '\r\n'
  );
  if (head && head.length) socket.unshift(head);
  return createWsConnection(socket, options.maxFrame);
}

module.exports = {
  encodeFrame: encodeFrame,
  createWsConnection: createWsConnection,
  upgradeWebSocket: upgradeWebSocket
};
