/* RL1 configuration. Node >= 18; no npm packages. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const DEFAULTS = {
  HOST: '127.0.0.1', PORT: 8787, MODULES: ['mcp', 'tcp', 'fetch'],
  CORS_ORIGINS: ['https://jor-teron.github.io', 'http://localhost:8787', 'http://127.0.0.1:8787'],
  PUBLIC_HOSTS: [], TOKEN: '', TLS_CERT: '', TLS_KEY: '',
  TCP_ALLOWLIST: [], TCP_ALLOWLIST_FILE: '', FETCH_ALLOWLIST: [],
  MAX_BODY: 10 * 1024 * 1024, MAX_FRAME: 10 * 1024 * 1024, MAX_BUFFER: 20 * 1024 * 1024,
  MAX_CONNECTIONS: 64, RPC_MAX_PENDING: 128,
  RPC_TIMEOUT_MS: 60000, UPSTREAM_TIMEOUT_MS: 30000, IDLE_TIMEOUT_MS: 300000,
  RATE_MAX: 120, RATE_WINDOW_MS: 60000, RETRY_AFTER_SEC: 30, TRUST_PROXY: false,
  PIN_MIN_LEN: 6, PIN_CHARS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-',
  WS_GUID: '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', WS_PING_MS: 30000, WS_HELLO_MS: 8000,
  NOT_CONNECTED: 'Web MCP tab not connected'
};
function validateConfig(input) {
  const cfg = { ...DEFAULTS, ...input };
  for (const key of ['PORT', 'MAX_BODY', 'MAX_FRAME', 'MAX_BUFFER', 'MAX_CONNECTIONS', 'RPC_MAX_PENDING',
    'RPC_TIMEOUT_MS', 'UPSTREAM_TIMEOUT_MS', 'IDLE_TIMEOUT_MS', 'RATE_MAX', 'RATE_WINDOW_MS',
    'RETRY_AFTER_SEC', 'WS_PING_MS', 'WS_HELLO_MS']) {
    cfg[key] = Number(cfg[key]);
    if (!Number.isSafeInteger(cfg[key]) || cfg[key] < (key === 'PORT' || key === 'WS_PING_MS' ? 0 : 1)) throw new Error('Invalid ' + key);
  }
  if (cfg.PORT > 65535) throw new Error('Invalid PORT');
  for (const key of ['MODULES', 'CORS_ORIGINS', 'PUBLIC_HOSTS', 'TCP_ALLOWLIST', 'FETCH_ALLOWLIST']) {
    if (!Array.isArray(cfg[key]) || cfg[key].some(v => typeof v !== 'string')) throw new Error('Invalid ' + key);
    cfg[key] = [...new Set(cfg[key])];
  }
  if (cfg.MODULES.some(name => !['mcp', 'tcp', 'fetch'].includes(name))) throw new Error('Unknown module');
  if (typeof cfg.HOST !== 'string' || !cfg.HOST) throw new Error('HOST is required');
  for (const key of ['TOKEN', 'TLS_CERT', 'TLS_KEY', 'TCP_ALLOWLIST_FILE']) if (typeof cfg[key] !== 'string') throw new Error('Invalid ' + key);
  if (cfg.TOKEN && (cfg.TOKEN.length < 16 || cfg.TOKEN.length > 512)) throw new Error('TOKEN must be 16 to 512 characters');
  cfg.TRUST_PROXY = false; // Never trust client-supplied forwarded IPs.
  if (!['127.0.0.1', '::1', 'localhost'].includes(cfg.HOST) && !cfg.TOKEN) throw new Error('A non-loopback HOST requires a TOKEN (16 or more characters)');
  if (Boolean(cfg.TLS_CERT) !== Boolean(cfg.TLS_KEY)) throw new Error('Set both TLS_CERT and TLS_KEY');
  for (const origin of [...cfg.CORS_ORIGINS, ...cfg.FETCH_ALLOWLIST]) {
    let url;
    try { url = new URL(origin); } catch { throw new Error('Use exact HTTP(S) origins in allowlists'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) throw new Error('Use exact HTTP(S) origins without paths, wildcards or credentials');
  }
  for (const host of cfg.PUBLIC_HOSTS) if (!/^(?:\[[a-fA-F0-9:]+\]|[a-zA-Z0-9._-]+)$/.test(host)) throw new Error('PUBLIC_HOSTS are hostnames without ports');
  return cfg;
}
// JSON file < environment < command flags. Unknown options fail closed.
function loadConfig(args = [], env = process.env) {
  const flags = {};
  let file = env.HUB_RELAY_CONFIG || '';
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help' || flag === '-h') { flags.HELP = true; continue; }
    const key = { '--host': 'HOST', '--port': 'PORT', '--modules': 'MODULES', '--origin': 'CORS_ORIGINS',
      '--tcp-allowlist': 'TCP_ALLOWLIST_FILE', '--cert': 'TLS_CERT', '--key': 'TLS_KEY' }[flag];
    if (flag === '--config' || key) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing value for ' + flag);
      if (flag === '--config') file = args[++i]; else flags[key] = args[++i];
    } else if (/^--no-(mcp|tcp|fetch)$/.test(flag)) (flags.DISABLED ||= []).push(flag.slice(5));
    else throw new Error('Unknown option: ' + flag);
  }
  if (flags.HELP) return { HELP: true };
  const fromFile = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  if (!fromFile || Array.isArray(fromFile) || typeof fromFile !== 'object') throw new Error('Config must be a JSON object');
  for (const key of Object.keys(fromFile)) if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) throw new Error('Unknown config key: ' + key);
  const config = { ...DEFAULTS, ...fromFile };
  for (const key of Object.keys(DEFAULTS)) if (env['HUB_RELAY_' + key] !== undefined) config[key] = env['HUB_RELAY_' + key];
  Object.assign(config, flags);
  delete config.DISABLED;
  for (const key of ['MODULES', 'CORS_ORIGINS', 'PUBLIC_HOSTS', 'TCP_ALLOWLIST', 'FETCH_ALLOWLIST']) {
    if (typeof config[key] === 'string') config[key] = config[key].split(',').map(s => s.trim()).filter(Boolean);
  }
  if (Array.isArray(config.MODULES)) config.MODULES = config.MODULES.filter(name => !(flags.DISABLED || []).includes(name));
  for (const key of ['TCP_ALLOWLIST_FILE', 'TLS_CERT', 'TLS_KEY']) {
    if (config[key]) config[key] = path.resolve(file ? path.dirname(path.resolve(file)) : process.cwd(), config[key]);
  }
  return validateConfig(config);
}
module.exports = { ...DEFAULTS, DEFAULTS, validateConfig, loadConfig };
