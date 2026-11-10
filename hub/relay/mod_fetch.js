/* RL1 bounded HTTP(S) proxy: POST /fetch with a JSON envelope.
 * An exact origin allowlist is always required. Redirects are never followed. */
'use strict';
const http = require('node:http');
const https = require('node:https');
const { fetchTarget } = require('./relay_security.js');
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS',
  'PROPFIND', 'PROPPATCH', 'MKCOL', 'COPY', 'MOVE', 'LOCK', 'UNLOCK', 'REPORT']);
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length']);
function proxyHeaders(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('headers must be an object');
  const headers = {};
  for (const [name, value] of Object.entries(input)) {
    const key = name.toLowerCase();
    if (HOP.has(key) || key.startsWith('proxy-') || key.startsWith('sec-') || key.startsWith('x-forwarded-') ||
      ['cookie', 'origin', 'referer', 'x-relay-token'].includes(key)) continue;
    if (typeof value !== 'string') throw new Error('header values must be strings');
    http.validateHeaderName(key); http.validateHeaderValue(key, value); headers[key] = value;
  }
  for (const [name, value] of Object.entries(input)) {
    if (name.toLowerCase() === 'connection') for (const key of String(value).toLowerCase().split(',')) delete headers[key.trim()];
  }
  return headers;
}
function upstream(url, method, headers, body, cfg, active) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, { method, headers, agent: false });
    active.add(req);
    const timer = setTimeout(() => req.destroy(new Error('upstream timeout')), cfg.UPSTREAM_TIMEOUT_MS); timer.unref();
    req.on('close', () => { clearTimeout(timer); active.delete(req); });
    req.on('error', reject);
    req.on('response', res => {
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > cfg.MAX_BODY) { res.destroy(); req.destroy(new Error('upstream body too large')); return; }
        chunks.push(chunk);
      });
      res.on('aborted', () => reject(new Error('upstream response aborted')));
      res.on('error', reject);
      res.on('end', () => {
        const resultHeaders = {};
        const hop = new Set([...HOP, ...String(res.headers.connection || '').toLowerCase().split(',').map(s => s.trim())]);
        for (const [key, value] of Object.entries(res.headers)) if (!hop.has(key) && key !== 'set-cookie') resultHeaders[key] = value;
        resolve({ status: res.statusCode, statusText: res.statusMessage, headers: resultHeaders, bodyBase64: Buffer.concat(chunks).toString('base64') });
      });
    });
    req.end(body);
  });
}
function createFetchModule() {
  const active = new Set();
  return {
    name: 'fetch',
    register(api) {
      api.addHttpRoute('/fetch', async ctx => {
        const reply = (status, value) => ctx.send(ctx.req, ctx.res, status, JSON.stringify(value), null, ctx.origin);
        if (ctx.method !== 'POST') { reply(405, { error: 'use POST /fetch' }); return; }
        let input;
        const raw = await api.readBody(ctx.req, api.cfg.MAX_BODY);
        try { input = JSON.parse(raw.toString('utf8')); } catch { reply(400, { error: 'invalid JSON' }); return; }
        if (!input || typeof input !== 'object' || Array.isArray(input)) { reply(400, { error: 'expected an object' }); return; }
        const url = fetchTarget(input.url, api.cfg);
        if (!url) { reply(403, { error: 'fetch target not allowed' }); return; }
        const method = String(input.method || 'GET').toUpperCase();
        if (!METHODS.has(method)) { reply(400, { error: 'method not supported' }); return; }
        let headers, body;
        try {
          headers = proxyHeaders(input.headers || {});
          if (headers.destination && !fetchTarget(headers.destination, api.cfg)) throw new Error('destination not allowed');
          if (input.body !== undefined && input.bodyBase64 !== undefined) throw new Error('use one body format');
          if (input.bodyBase64 !== undefined) {
            if (typeof input.bodyBase64 !== 'string' || input.bodyBase64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.bodyBase64)) throw new Error('invalid base64');
            body = Buffer.from(input.bodyBase64, 'base64');
            if (body.toString('base64') !== input.bodyBase64) throw new Error('noncanonical base64');
          } else {
            if (input.body !== undefined && typeof input.body !== 'string') throw new Error('body must be text');
            body = Buffer.from(input.body || '', 'utf8');
          }
          if ((method === 'GET' || method === 'HEAD') && body.length) throw new Error('no body for GET/HEAD');
          if (body.length > api.cfg.MAX_BODY) throw new Error('body too large');
          if (body.length || !['GET', 'HEAD'].includes(method)) headers['content-length'] = String(body.length);
        } catch { reply(400, { error: 'invalid proxy headers or body' }); return; }
        try { reply(200, await upstream(url, method, headers, body, api.cfg, active)); }
        catch { reply(502, { error: 'upstream failed, timed out or exceeded size limit' }); }
      });
    },
    shutdown() { for (const request of active) request.destroy(); }
  };
}
module.exports = { createFetchModule, proxyHeaders };
