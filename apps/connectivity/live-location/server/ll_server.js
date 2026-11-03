#!/usr/bin/env node
/* Live Location LL2 — optional home history server.
   A light always-on member of one private Live Location group (same PeerJS lobby protocol as ../ll_peer.js):
   it never shares a position of its own; it records every {k:'pos'} it hears into SQLite and answers history requests.
     • WebRTC in Node: node-datachannel/polyfill (prebuilt for x64, arm64, armv7) + the same peerjs 1.5.4 client as the app.
     • SQLite: built-in node:sqlite (Node 22.13+ / 23.4+); falls back to better-sqlite3 when that is installed.
     • Same throttle as the app: a live point is stored only after >= 15 m or >= 60 s since that member's last stored point.
   Messages (inside the lobby relay {t:'all'|'to', msg}):
     out  {k:'srv', v:'LL2', days}                                  to newcomers (lobby provide) and to all on roster changes
     in   {k:'pos', lat, lon, acc, at, name, dev}                  live, recorded (key = dev, or 'n:'+name for LL1 senders)
     in   {k:'hreq', since, from, dev}                             → out {k:'hist', pts:[[k,lat,lon,acc,at]...], names, part, parts, done, now}
          since = the asker's cursor in SERVER time (rx: when the server received a point; 0 = everything), from = oldest point time it keeps.
          The last part carries now (server clock) = the asker's next cursor. Using rx, not the point time, means points that reached the
          server late (an hput gap upload) still reach everyone, and device clock skew doesn't matter.
     in   {k:'hput', dev, name, pts:[[lat,lon,acc,at]...]}          the sender's own points the server missed (stored as key = dev)
   Usage: node ll_server.js --code 12345 [--db ./ll-history.db] [--days 30] [--name "History server"]
          [--peer-host h --peer-port 443 --peer-path / --peer-key peerjs --peer-insecure]   (self-hosted PeerJS server; default = PeerJS cloud)
   Env: LL_CODE, LL_DB, LL_DAYS, LL_NAME work too. */
'use strict';
const VERSION = 'LL2';
const PART = 300, MIN_M = 15, MIN_MS = 60000, DAY = 86400000, MAX_PUT = 2000;

/* ---- args ---- */
function arg(name, env, def) {
  const i = process.argv.indexOf('--' + name);
  if (i > 0 && process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  if (i > 0) return true;
  return process.env[env] !== undefined ? process.env[env] : def;
}
const CODE = String(arg('code', 'LL_CODE', ''));
const DBFILE = String(arg('db', 'LL_DB', require('path').join(__dirname, 'll-history.db')));
const DAYS = Math.max(1, Math.min(365, +arg('days', 'LL_DAYS', 30) || 30));
const NAME = String(arg('name', 'LL_NAME', 'History server')).slice(0, 40);
const QUIET = !!arg('quiet', 'LL_QUIET', false);
if (!/^\d{5}$/.test(CODE) || CODE === '00000') { console.error('Need a 5-digit private code: node ll_server.js --code 12345 (public 00000 is refused)'); process.exit(2); }
const peerOpts = {};
if (arg('peer-host', 'LL_PEER_HOST', '')) {
  peerOpts.host = String(arg('peer-host', 'LL_PEER_HOST', ''));
  peerOpts.port = +arg('peer-port', 'LL_PEER_PORT', 443);
  peerOpts.path = String(arg('peer-path', 'LL_PEER_PATH', '/'));
  peerOpts.key = String(arg('peer-key', 'LL_PEER_KEY', 'peerjs'));
  peerOpts.secure = !arg('peer-insecure', 'LL_PEER_INSECURE', false);
}
function log() { if (!QUIET) console.log(new Date().toISOString(), ...arguments); }

/* ---- SQLite ---- */
function openDb(file) {
  let db;
  try { const { DatabaseSync } = require('node:sqlite'); db = new DatabaseSync(file); log('sqlite: node:sqlite'); }
  catch (e) {
    try { const B = require('better-sqlite3'); db = new B(file); log('sqlite: better-sqlite3'); }
    catch (e2) { console.error('No SQLite: use Node 22.13+ (built-in node:sqlite) or run: npm i better-sqlite3'); process.exit(3); }
  }
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
    CREATE TABLE IF NOT EXISTS pts (k TEXT NOT NULL, at INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, acc INTEGER, rx INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (k, at)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS pts_at ON pts(at);
    CREATE TABLE IF NOT EXISTS who (k TEXT PRIMARY KEY, n TEXT, at INTEGER, lat REAL, lon REAL);`);
  const cols = db.prepare('PRAGMA table_info(pts)').all().map(c => c.name);
  if (cols.indexOf('rx') < 0) db.exec('ALTER TABLE pts ADD COLUMN rx INTEGER NOT NULL DEFAULT 0');
  db.exec('CREATE INDEX IF NOT EXISTS pts_rx ON pts(rx)');
  return db;
}
const db = openDb(DBFILE);
const q = {
  ins: db.prepare('INSERT OR IGNORE INTO pts (k, at, lat, lon, acc, rx) VALUES (?, ?, ?, ?, ?, ?)'),
  who: db.prepare('INSERT INTO who (k, n, at, lat, lon) VALUES (?, ?, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET n = excluded.n, at = MAX(who.at, excluded.at), lat = CASE WHEN excluded.at >= who.at THEN excluded.lat ELSE who.lat END, lon = CASE WHEN excluded.at >= who.at THEN excluded.lon ELSE who.lon END'),
  allWho: db.prepare('SELECT k, n, at, lat, lon FROM who'),
  since: db.prepare('SELECT k, lat, lon, acc, at FROM pts WHERE rx >= ? AND at >= ? ORDER BY rx, k, at'),
  prune: db.prepare('DELETE FROM pts WHERE at < ?'),
  pruneWho: db.prepare('DELETE FROM who WHERE at < ?'),
  count: db.prepare('SELECT COUNT(*) AS c FROM pts'),
};
const last = {};   // throttle seed: newest stored point per member
q.allWho.all().forEach(w => { last[w.k] = w; });

function dist(a, b) {
  const R = 6371000, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function clean(k, n, lat, lon, acc, at) {
  k = String(k || '').slice(0, 64); at = Math.round(+at); lat = +lat; lon = +lon; acc = Math.round(+acc || 0);
  if (!k || !isFinite(at) || !isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (at < Date.now() - DAYS * DAY || at > Date.now() + DAY) return null;
  return { k, n: String(n || 'Device').slice(0, 40), lat, lon, acc, at };
}
function store(o, throttle) {
  const prev = last[o.k];
  if (throttle && prev && (o.at <= prev.at || (o.at - prev.at < MIN_MS && dist(prev, o) < MIN_M))) return false;
  const r = q.ins.run(o.k, o.at, o.lat, o.lon, o.acc, Date.now());
  q.who.run(o.k, o.n, o.at, o.lat, o.lon);
  if (!prev || o.at >= prev.at) last[o.k] = o;
  return r.changes > 0;
}
function prune() {
  const c = Date.now() - DAYS * DAY, r = q.prune.run(c); q.pruneWho.run(c);
  Object.keys(last).forEach(k => { if (last[k].at < c) delete last[k]; });
  if (r.changes) log('pruned', r.changes, 'points older than', DAYS, 'days');
}
prune(); setInterval(prune, 3600000).unref();

/* ---- PeerJS in Node ---- */
const poly = require('node-datachannel/polyfill');
for (const k of ['RTCPeerConnection', 'RTCSessionDescription', 'RTCIceCandidate', 'RTCDataChannel', 'MediaStream']) if (poly[k] && !globalThis[k]) globalThis[k] = poly[k];
const { Peer } = require('peerjs');

let me = null, lobby = null, lconn = null, clients = {}, dead = false, retryT = null, rosterIds = [];
const rid = () => Math.random().toString(36).slice(2, 10);
const lobbyId = () => 'jtsites-' + CODE + '-ll-0';
const hello = () => ({ k: 'srv', v: VERSION, days: DAYS, name: NAME });

function start() {
  dead = false;
  me = new Peer('jtsites-' + CODE + '-ll-' + rid(), peerOpts);
  me.on('open', id => { log('peer open', id); claimLobby(); });
  me.on('disconnected', () => { if (!dead) setTimeout(() => { try { if (me && !me.destroyed) me.reconnect(); } catch (_) { /* */ } }, 3000); });
  me.on('error', e => { if (e.type !== 'peer-unavailable') log('peer error', e.type); });
}
function claimLobby() {
  if (dead) return;
  const p = new Peer(lobbyId(), peerOpts);
  let settled = false;
  p.on('open', () => { settled = true; lobby = p; clients = {}; log('holding the lobby'); p.on('connection', hostConn); joinLobby(0); });
  p.on('disconnected', () => { if (lobby === p && !dead) setTimeout(() => { try { if (!p.destroyed) p.reconnect(); } catch (_) { /* */ } }, 3000); });
  p.on('error', e => {
    if (settled) return; settled = true;
    try { p.destroy(); } catch (_) { /* */ }
    joinLobby(e.type === 'unavailable-id' ? 0 : 1500);
  });
}
/* lobby owner side: same relay as ../ll_peer.js hostConn() */
function hostConn(conn) {
  conn.on('data', m => {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hi') {
      const isNew = !clients[m.id] || clients[m.id].conn !== conn;
      clients[m.id] = { conn, name: String(m.name || '').slice(0, 40) }; conn._cbid = m.id; broadcast();
      if (isNew && me && m.id !== me.id) { try { conn.send({ t: 'sig', from: me.id, msg: hello() }); } catch (_) { /* */ } }
    } else if (m.t === 'all') {
      Object.keys(clients).forEach(id => { if (id !== conn._cbid) { try { clients[id].conn.send({ t: 'sig', from: conn._cbid, msg: m.msg }); } catch (_) { /* */ } } });
    } else if (m.t === 'to' && clients[m.to]) { try { clients[m.to].conn.send({ t: 'sig', from: conn._cbid, msg: m.msg }); } catch (_) { /* */ } }
  });
  conn.on('close', () => { if (conn._cbid && clients[conn._cbid] && clients[conn._cbid].conn === conn) { delete clients[conn._cbid]; broadcast(); } });
}
function broadcast() {
  const list = Object.keys(clients).map(id => ({ id, name: clients[id].name }));
  Object.keys(clients).forEach(id => { try { clients[id].conn.send({ t: 'roster', list }); } catch (_) { /* */ } });
}
/* member side */
function joinLobby(delay) {
  clearTimeout(retryT);
  retryT = setTimeout(() => {
    if (dead) return;
    if (!me || me.disconnected || !me.open) { joinLobby(2000); return; }
    const c = me.connect(lobbyId(), { reliable: true, metadata: { kind: 'll', srv: VERSION } });
    let opened = false;
    const to = setTimeout(() => { if (!opened) { try { c.close(); } catch (_) { /* */ } relobby(); } }, 8000);
    c.on('open', () => { opened = true; clearTimeout(to); lconn = c; log('online in group', CODE); c.send({ t: 'hi', id: me.id, name: NAME }); });
    c.on('data', m => {
      if (m && m.t === 'roster') {
        const ids = m.list.map(d => d.id).filter(id => id !== me.id);
        const added = ids.some(id => rosterIds.indexOf(id) < 0);
        rosterIds = ids;
        if (added) send({ t: 'all', msg: hello() });   // a newcomer (when we don't hold the lobby) learns we're here
      } else if (m && m.t === 'sig') onSig(m.msg, m.from);
    });
    c.on('close', () => { if (lconn === c) { lconn = null; rosterIds = []; relobby(); } });
    c.on('error', () => { /* close follows */ });
  }, delay || 0);
}
function relobby() { if (dead) return; log('lobby lost, reconnecting'); setTimeout(claimLobby, 300 + Math.random() * 1500); }
function send(x) { if (lconn && lconn.open) { try { lconn.send(x); return true; } catch (_) { /* */ } } return false; }
function sendTo(to, msg) { return send({ t: 'to', to, msg }); }

/* ---- history protocol ---- */
function onSig(m, from) {
  if (!m || typeof m !== 'object') return;
  if (m.k === 'pos') {
    const key = typeof m.dev === 'string' && m.dev ? m.dev : (m.name ? 'n:' + String(m.name).slice(0, 40) : '');
    const o = clean(key, m.name, m.lat, m.lon, m.acc, m.at);
    if (o && store(o, true) && !QUIET) log('pos', o.n, o.lat.toFixed(5), o.lon.toFixed(5));
  } else if (m.k === 'hreq') {
    reply(from, m);
  } else if (m.k === 'hput' && typeof m.dev === 'string' && m.dev && Array.isArray(m.pts)) {
    let n = 0;
    m.pts.slice(0, MAX_PUT).forEach(a => { if (Array.isArray(a)) { const o = clean(m.dev, m.name, a[0], a[1], a[2], a[3]); if (o && store(o, false)) n++; } });
    if (n) log('hput', String(m.name || m.dev).slice(0, 40), n, 'points');
  }
}
function reply(to, m) {
  const now = Date.now(), since = Math.max(0, +m.since || 0), from = Math.max(+m.from || 0, now - DAYS * DAY);
  const rows = q.since.all(since, from);
  const names = {}; q.allWho.all().forEach(w => { names[w.k] = w.n; });
  const parts = Math.max(1, Math.ceil(rows.length / PART));
  log('hreq from', String(m.name || to).slice(0, 40), 'cursor', since, '→', rows.length, 'points');
  let i = 0;
  (function next() {
    if (i >= parts) return;
    const chunk = rows.slice(i * PART, (i + 1) * PART).map(r => [r.k, r.lat, r.lon, r.acc, r.at]);
    const usedNames = {}; chunk.forEach(a => { if (names[a[0]] !== undefined) usedNames[a[0]] = names[a[0]]; });
    const done = i === parts - 1;
    sendTo(to, { k: 'hist', pts: chunk, names: usedNames, part: i, parts, done, now: done ? now : undefined });
    i++; setTimeout(next, 25);   // pace parts so the data channel doesn't bunch up
  })();
}

function stop() {
  dead = true; clearTimeout(retryT);
  try { lconn && lconn.close(); } catch (_) { /* */ }
  try { lobby && lobby.destroy(); } catch (_) { /* */ }
  try { me && me.destroy(); } catch (_) { /* */ }
}
/* watchdog: a destroyed peer (fatal error) is rebuilt; a lost lobby link is re-joined */
setInterval(() => {
  if (dead) return;
  if (!me || me.destroyed) { log('peer gone, restarting'); try { lobby && lobby.destroy(); } catch (_) { /* */ } lobby = null; lconn = null; start(); }
}, 30000).unref();
process.on('SIGINT', () => { stop(); try { db.close(); } catch (_) { /* */ } process.exit(0); });
process.on('SIGTERM', () => { stop(); try { db.close(); } catch (_) { /* */ } process.exit(0); });
log('Live Location history server', VERSION, '· group', CODE, '· db', DBFILE, '· keep', DAYS, 'days · points', q.count.get().c);
start();
setInterval(() => {}, 1 << 30);   // keep alive
