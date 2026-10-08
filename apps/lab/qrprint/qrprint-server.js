/*
  qrprint / qrprint-server.js
  Local print host for the PC page.

  Serves the static files, reports the LAN address used in the QR,
  and relays WebRTC signaling for LAN mode only.
  Internet mode does not use this socket. That path is PeerJS.

  Start: npm install && npm start
  Default port: 8787
*/

"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { WebSocketServer } = require("ws");

/* TCP port the print PC listens on. Override with PORT= . */
const PORT = Number(process.env.PORT || 8787);

/* Folder that contains qrprint.html and the other static files. */
const ROOT = __dirname;

/* Map of file extension to Content-Type for the static server. */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

/* Rooms keyed by room id. Each value holds recv and send sockets. */
const rooms = new Map();

/*
  Returns private IPv4 addresses, Wi-Fi and Ethernet first.
  Skips docker, virtual, and tunnel adapters. Empty when none exist.
*/
function lanIps() {
  const nets = os.networkInterfaces();
  const ranked = [];
  for (const name of Object.keys(nets)) {
    if (isVirtual(name)) continue;
    for (const net of nets[name] || []) {
      const family = net.family;
      if (family !== "IPv4" && family !== 4) continue;
      if (net.internal) continue;
      if (!isPrivate(net.address)) continue;
      ranked.push({ ip: net.address, score: ifaceScore(name) });
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.map((row) => row.ip);
}

/*
  True for adapters that are not the LAN the phone can join.
*/
function isVirtual(name) {
  return /docker|veth|br-|virbr|vmnet|vbox|tun|tap|tailscale|zt|wg|lo/i.test(name);
}

/*
  Higher score wins. Wi-Fi before Ethernet before anything else.
*/
function ifaceScore(name) {
  if (/wi-?fi|wlan|wlp|wl/i.test(name)) return 3;
  if (/eth|enp|eno|ethernet/i.test(name)) return 2;
  return 1;
}

/*
  True when the address is RFC1918.
  Link-local and public addresses are rejected.
*/
function isPrivate(ip) {
  return (
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}

/*
  Sends a JSON body and closes the response.
*/
function sendJson(res, code, body) {
  const raw = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(raw)
  });
  res.end(raw);
}

/*
  Serves one file from ROOT. Rejects paths that escape the folder.
*/
function serveStatic(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const type = MIME[path.extname(file)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(buf);
  });
}

/*
  Joins a socket to a room as recv or send.
  A second join of the same role replaces the old socket.
*/
function joinRoom(ws, room, role) {
  let bucket = rooms.get(room);
  if (!bucket) {
    bucket = { recv: null, send: null };
    rooms.set(room, bucket);
  }
  bucket[role] = ws;
  ws._room = room;
  ws._role = role;
}

/*
  Forwards a signaling payload to the other role in the same room.
*/
function relay(ws, msg) {
  const bucket = rooms.get(ws._room);
  if (!bucket) return;
  const other = ws._role === "recv" ? bucket.send : bucket.recv;
  if (other && other.readyState === 1) {
    other.send(JSON.stringify({ type: "signal", data: msg.data }));
  }
}

/*
  Drops a socket from its room and deletes the room when empty.
*/
function leave(ws) {
  const bucket = rooms.get(ws._room);
  if (!bucket) return;
  if (bucket[ws._role] === ws) bucket[ws._role] = null;
  if (!bucket.recv && !bucket.send) rooms.delete(ws._room);
}

/* HTTP server: /api/info for the QR, everything else is a static file. */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/api/info") {
    const ips = lanIps();
    sendJson(res, 200, {
      ip: ips[0] || "",
      ips: ips,
      port: PORT,
      host: req.headers.host || ""
    });
    return;
  }
  serveStatic(req, res);
});

/* WebSocket signaling. One path, /signal, used only in LAN mode. */
const wss = new WebSocketServer({ server, path: "/signal" });

wss.on("connection", (ws) => {
  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(String(buf));
    } catch (err) {
      return;
    }
    if (msg.type === "join" && msg.room && (msg.role === "recv" || msg.role === "send")) {
      joinRoom(ws, String(msg.room), msg.role);
      ws.send(JSON.stringify({ type: "joined", role: msg.role }));
      return;
    }
    if (msg.type === "signal" && ws._room) {
      relay(ws, msg);
    }
  });
  ws.on("close", () => leave(ws));
});

server.listen(PORT, "0.0.0.0", () => {
  const ips = lanIps();
  console.log("qrprint LAN  http://" + (ips[0] || "127.0.0.1") + ":" + PORT + "/");
  console.log("qrprint local http://127.0.0.1:" + PORT + "/");
});
