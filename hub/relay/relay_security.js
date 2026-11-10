/* RL1 shared target and token checks. Empty allowlists deny everything. */
'use strict';
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');
function equalSecret(a, b) {
  const digest = value => crypto.createHash('sha256').update(String(value)).digest();
  return crypto.timingSafeEqual(digest(a), digest(b));
}
function authorized(req, cfg, websocket = false) {
  if (!cfg.TOKEN) return true;
  const bearer = String(req.headers.authorization || '').match(/^Bearer (.+)$/i);
  const query = websocket ? new URL(req.url, 'http://relay').searchParams.get('relay_token') : '';
  return equalSecret((bearer && bearer[1]) || req.headers['x-relay-token'] || query || '', cfg.TOKEN);
}
function parseTarget(value, defaultPort) {
  const match = String(value || '').trim().match(/^(?:\[([a-fA-F0-9:.]+)\]|([a-zA-Z0-9._-]+))(?::(\d{1,5}))?$/);
  if (!match) return null;
  const host = (match[1] || match[2]).toLowerCase(), port = Number(match[3] || defaultPort);
  if (match[1] && net.isIP(host) !== 6) return null;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
}
function tcpAllowed(target, cfg) {
  let entries = cfg.TCP_ALLOWLIST;
  if (cfg.TCP_ALLOWLIST_FILE) {
    try { entries = entries.concat(fs.readFileSync(cfg.TCP_ALLOWLIST_FILE, 'utf8').split(/\r?\n/)); }
    catch { return false; }
  }
  return entries.some(line => {
    line = line.split('#', 1)[0].trim().toLowerCase();
    const match = line.match(/^(\[[a-f0-9:.]+\]|[a-z0-9.*_-]+)(?::(\d{1,5}))?$/);
    if (!match || Number(match[2] || 22) !== target.port) return false;
    const host = match[1].replace(/^\[|\]$/g, '');
    const pattern = '^' + host.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
    return new RegExp(pattern).test(target.host);
  });
}
function fetchTarget(value, cfg) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) return null;
  return cfg.FETCH_ALLOWLIST.includes(url.origin) ? url : null;
}
function websocketUrl(value, pathname) {
  const url = new URL(value);
  if (url.protocol === 'http:') url.protocol = 'ws:'; else if (url.protocol === 'https:') url.protocol = 'wss:';
  if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('Expected HTTP(S) or WS(S) URL');
  if (pathname !== undefined) url.pathname = pathname;
  return url.toString();
}
module.exports = { equalSecret, authorized, parseTarget, tcpAllowed, fetchTarget, websocketUrl };
