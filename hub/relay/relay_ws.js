/* RL1: small RFC 6455 server, based on Web MCP relay_ws.js.
 * Adds binary messages, fragments, mask checks, size caps and bounded writes.
 * No compression, extensions or base64 subprotocol. */
'use strict';
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const CONFIG = require('./relay_config.js');
const decoder = new TextDecoder('utf-8', { fatal: true });
function encodeFrame(opcode, payload) {
  const size = payload.length;
  const header = Buffer.alloc(size < 126 ? 2 : size < 65536 ? 4 : 10);
  header[0] = 0x80 | opcode;
  if (size < 126) header[1] = size;
  else if (size < 65536) { header[1] = 126; header.writeUInt16BE(size, 2); }
  else { header[1] = 127; header.writeBigUInt64BE(BigInt(size), 2); }
  return Buffer.concat([header, payload]);
}
function createWsConnection(socket, maxFrame = CONFIG.MAX_FRAME, maxBuffer = CONFIG.MAX_BUFFER) {
  let buffer = Buffer.alloc(0), closed = false, notified = false;
  let fragments = [], fragmentSize = 0, fragmentOpcode = 0, closeTimer;
  const conn = {
    socket, onMessage: null, onClose: null, onDrain: null,
    send(value) { return write(1, Buffer.from(String(value))); },
    sendBinary(value) { return write(2, Buffer.from(value)); },
    close(code = 1000) {
      if (closed) return;
      closed = true;
      const payload = Buffer.alloc(2); payload.writeUInt16BE(code);
      socket.end(encodeFrame(8, payload));
      closeTimer = setTimeout(() => socket.destroy(), 1000); closeTimer.unref();
    }
  };
  function write(opcode, payload) {
    if (closed || socket.destroyed) return false;
    if (payload.length > maxFrame || socket.writableLength + payload.length > maxBuffer) { conn.close(1009); return false; }
    return socket.write(encodeFrame(opcode, payload));
  }
  function notify() {
    closed = true; clearTimeout(closeTimer);
    if (notified) return;
    notified = true;
    if (conn.onClose) conn.onClose();
  }
  function deliver(opcode, payload) {
    try {
      const data = opcode === 1 ? decoder.decode(payload) : payload;
      if (conn.onMessage) conn.onMessage(data, opcode === 2);
    } catch { conn.close(1007); }
  }
  function consume() {
    while (!closed && buffer.length >= 2) {
      const first = buffer[0], second = buffer[1], fin = Boolean(first & 0x80), opcode = first & 15;
      let length = second & 127, offset = 2;
      if ((first & 0x70) || !(second & 0x80) || ![0, 1, 2, 8, 9, 10].includes(opcode)) { conn.close(1002); return; }
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2); offset = 4;
        if (length < 126) { conn.close(1002); return; }
      } else if (length === 127) {
        if (buffer.length < 10) return;
        const big = buffer.readBigUInt64BE(2);
        if (big > BigInt(maxFrame)) { conn.close(1009); return; }
        length = Number(big); offset = 10;
        if (length < 65536) { conn.close(1002); return; }
      }
      const control = opcode >= 8;
      if (control && (!fin || length > 125)) { conn.close(1002); return; }
      if (length > maxFrame || (!control && fragmentSize + length > maxFrame)) { conn.close(1009); return; }
      if (buffer.length < offset + 4 + length) return;
      const mask = buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < length; i++) payload[i] ^= mask[i % 4];
      buffer = buffer.subarray(offset + 4 + length);
      if (opcode === 8) {
        if (length === 1) { conn.close(1002); return; }
        if (length >= 2) {
          const code = payload.readUInt16BE(0);
          if (code < 1000 || code >= 5000 || [1004, 1005, 1006, 1015].includes(code) || (code >= 1016 && code < 3000)) { conn.close(1002); return; }
          try { decoder.decode(payload.subarray(2)); } catch { conn.close(1007); return; }
        }
        conn.close(1000); return;
      }
      if (opcode === 9) { write(10, payload); continue; }
      if (opcode === 10) continue;
      if (opcode === 0) { if (!fragmentOpcode) { conn.close(1002); return; } }
      else if (fragmentOpcode) { conn.close(1002); return; }
      else if (!fin) fragmentOpcode = opcode;
      if (fragmentOpcode) {
        fragments.push(payload); fragmentSize += length;
        if (fragments.length > 4096) { conn.close(1009); return; }
        if (!fin) continue;
        const message = Buffer.concat(fragments, fragmentSize), type = fragmentOpcode;
        fragments = []; fragmentSize = 0; fragmentOpcode = 0;
        deliver(type, message);
      } else deliver(opcode, payload);
    }
  }
  socket.on('data', chunk => {
    if (closed) return;
    if (buffer.length + chunk.length > maxFrame + 65536) { conn.close(1009); return; }
    buffer = Buffer.concat([buffer, chunk]); consume();
  });
  socket.on('drain', () => { if (conn.onDrain) conn.onDrain(); });
  socket.on('close', notify);
  socket.on('error', () => { socket.destroy(); notify(); });
  socket.on('end', () => { socket.end(); notify(); });
  return conn;
}
function upgradeWebSocket(req, socket, head, opts = {}) {
  const key = req.headers['sec-websocket-key'];
  const upgrade = String(req.headers.upgrade || '').toLowerCase();
  const connection = String(req.headers.connection || '').toLowerCase().split(/\s*,\s*/);
  if (req.method !== 'GET' || upgrade !== 'websocket' || !connection.includes('upgrade') ||
      req.headers['sec-websocket-version'] !== '13' || !/^[a-zA-Z0-9+/]{22}==$/.test(key || '')) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    socket.destroySoon(); return null;
  }
  const accept = crypto.createHash('sha1').update(key + CONFIG.WS_GUID).digest('base64');
  let response = 'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n';
  if (opts.protocol) response += 'Sec-WebSocket-Protocol: ' + opts.protocol + '\r\n';
  socket.write(response + '\r\n');
  const ws = createWsConnection(socket, opts.maxFrame, opts.maxBuffer);
  // Let the module install its hello handler before consuming a coalesced first frame.
  if (head && head.length) process.nextTick(() => socket.emit('data', head));
  return ws;
}
module.exports = { encodeFrame, createWsConnection, upgradeWebSocket };
