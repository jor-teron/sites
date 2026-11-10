/* RL1 binary WS-to-TCP bridge. Websockify paths /, /tcp and /websockify.
 * ?token=HOST:PORT is the target; ?relay_token=SECRET is separate optional auth. */
'use strict';
const net = require('node:net');
const { parseTarget, tcpAllowed } = require('./relay_security.js');
function createTcpModule() {
  const connections = new Set();
  return {
    name: 'tcp',
    register(api) {
      api.addUpgrade(path => ['/', '/tcp', '/websockify'].includes(api.cleanedPath(path)), ctx => {
        const query = new URL(ctx.req.url, 'http://relay').searchParams;
        const target = parseTarget(query.get('target') || query.get('token'));
        function refuse(status) {
          ctx.socket.end('HTTP/1.1 ' + status + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); ctx.socket.destroySoon();
        }
        if (!target || !tcpAllowed(target, api.cfg)) { refuse('403 Forbidden'); return; }
        const protocols = String(ctx.req.headers['sec-websocket-protocol'] || '').split(/\s*,\s*/).filter(Boolean);
        if (protocols.length && !protocols.includes('binary')) { refuse('400 Bad Request'); return; }
        const ws = api.upgradeWebSocket(ctx.req, ctx.socket, ctx.head, { protocol: protocols.includes('binary') ? 'binary' : '' });
        if (!ws) return;
        const tcp = new net.Socket();
        connections.add(tcp);
        let connecting = true;
        const connectTimer = setTimeout(() => tcp.destroy(), api.cfg.UPSTREAM_TIMEOUT_MS); connectTimer.unref();
        tcp.on('connect', () => { connecting = false; clearTimeout(connectTimer); });
        tcp.setNoDelay(true); tcp.setTimeout(api.cfg.IDLE_TIMEOUT_MS, () => tcp.destroy());
        tcp.on('data', bytes => {
          for (let i = 0; i < bytes.length; i += api.cfg.MAX_FRAME) {
            if (!ws.sendBinary(bytes.subarray(i, i + api.cfg.MAX_FRAME))) tcp.pause();
          }
        });
        ws.onDrain = () => tcp.resume();
        ws.onMessage = (bytes, binary) => {
          if (!binary) { ws.close(1003); tcp.destroy(); return; }
          if (tcp.writableLength + bytes.length > api.cfg.MAX_BUFFER) { ws.close(1009); tcp.destroy(); return; }
          if (!tcp.write(bytes)) ctx.socket.pause();
        };
        tcp.on('drain', () => ctx.socket.resume());
        ws.onClose = () => tcp.destroy();
        tcp.on('error', () => ws.close(1011));
        tcp.on('close', () => { clearTimeout(connectTimer); connections.delete(tcp); ws.close(connecting ? 1011 : 1000); });
        tcp.connect(target.port, target.host);
      });
    },
    shutdown() { for (const socket of connections) socket.destroy(); }
  };
}
module.exports = { createTcpModule };
