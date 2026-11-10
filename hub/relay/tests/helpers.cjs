/* RL1 local-only test helpers, including a masked WS client. */
'use strict';
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const { encodeFrame } = require('../relay_ws.js');
function request(port, path = '/health', { method = 'GET', headers = {}, body, tls = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = (tls ? https : http).request({ host: '127.0.0.1', port, path, method, headers, agent: false, rejectUnauthorized: !tls }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, headers: res.headers, text, json() { return JSON.parse(text); } });
      });
    });
    req.setTimeout(3000, () => req.destroy(new Error('test HTTP timeout')));
    req.on('error', reject); req.end(body);
  });
}
function frame(opcode, value, { fin = true, masked = true } = {}) {
  const payload = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  const encoded = encodeFrame(opcode, payload);
  if (!fin) encoded[0] &= 0x7f;
  if (!masked) return encoded;
  const offset = encoded.length - payload.length, mask = crypto.randomBytes(4);
  const header = Buffer.from(encoded.subarray(0, offset)); header[1] |= 0x80;
  const bytes = Buffer.from(payload);
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= mask[i % 4];
  return Buffer.concat([header, mask, bytes]);
}
function openWs(port, path = '/ws', { origin = 'https://jor-teron.github.io', protocols, headers = {}, version = '13', early, tls = false } = {}) {
  return new Promise((resolve, reject) => {
    const allHeaders = { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': version,
      'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), ...headers };
    if (origin !== null) allHeaders.Origin = origin;
    if (protocols) allHeaders['Sec-WebSocket-Protocol'] = protocols;
    const req = (tls ? https : http).request({ host: '127.0.0.1', port, path, headers: allHeaders, agent: false, rejectUnauthorized: !tls });
    req.on('error', reject);
    req.on('response', res => { res.resume(); resolve({ status: res.statusCode, headers: res.headers }); });
    req.on('upgrade', (res, socket, head) => {
      let buffer = Buffer.alloc(0), ended = false;
      const messages = [], waits = [];
      const client = {
        status: res.statusCode, headers: res.headers, socket,
        send(value) { socket.write(frame(typeof value === 'string' ? 1 : 2, value)); },
        json(value) { this.send(JSON.stringify(value)); }, close() { socket.destroy(); },
        next() {
          if (messages.length) return Promise.resolve(messages.shift());
          if (ended) return Promise.reject(new Error('WebSocket ended'));
          return new Promise((ok, fail) => waits.push({ ok, fail, timer: setTimeout(() => fail(new Error('test WS timeout')), 2000) }));
        }
      };
      function parse(chunk) {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 2) {
          let length = buffer[1] & 127, offset = 2;
          if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
          else if (length === 127) { if (buffer.length < 10) return; length = Number(buffer.readBigUInt64BE(2)); offset = 10; }
          if (buffer.length < offset + length) return;
          const message = { opcode: buffer[0] & 15, data: Buffer.from(buffer.subarray(offset, offset + length)) };
          message.text = message.data.toString(); buffer = buffer.subarray(offset + length);
          if (waits.length) { const item = waits.shift(); clearTimeout(item.timer); item.ok(message); } else messages.push(message);
        }
      }
      socket.on('data', parse); socket.on('error', () => {});
      socket.on('close', () => {
        ended = true;
        for (const item of waits.splice(0)) { clearTimeout(item.timer); item.fail(new Error('WebSocket ended')); }
      });
      if (head.length) parse(head);
      resolve(client);
    });
    if (early) {
      req.flushHeaders();
      req.on('socket', socket => socket.on('connect', () => socket.write(early)));
    }
    req.end();
  });
}
async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server.address().port;
}
function closeServer(server) { return new Promise(resolve => server.close(resolve)); }
module.exports = { request, frame, openWs, listen, closeServer };
