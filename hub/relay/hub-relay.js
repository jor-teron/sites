#!/usr/bin/env node
/* RL1 shared relay: one listener, independently switchable modules. */
'use strict';
const { loadConfig, validateConfig } = require('./relay_config.js');
const { createRelay } = require('./relay_core.js');
const { websocketUrl } = require('./relay_security.js');
async function startServer(overrides = {}) {
  const cfg = validateConfig(overrides), relay = createRelay(cfg);
  const factories = {
    mcp: () => require('./mod_mcp.js').createMcpModule(),
    tcp: () => require('./mod_tcp.js').createTcpModule(),
    fetch: () => require('./mod_fetch.js').createFetchModule()
  };
  for (const name of cfg.MODULES) relay.register(factories[name]());
  return relay.listen();
}
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 18) throw new Error('Node 18 or newer is required');
  const cfg = loadConfig(process.argv.slice(2));
  if (cfg.HELP) {
    console.log(`Hub shared relay (RL1), Node >= 18, no npm install.
Usage: node hub-relay.js [--config FILE] [--host HOST] [--port PORT]
  --modules mcp,tcp,fetch  Choose loaded modules (default: all three)
  --no-mcp / --no-tcp / --no-fetch  Disable a module
  --origin ORIGIN,ORIGIN  Exact allowed browser origins (no wildcards)
  --tcp-allowlist FILE    Re-read host:port entries for each connection
  --cert FILE --key FILE  Serve HTTPS/WSS using your trusted certificate
Environment: HUB_RELAY_<CONFIG_KEY>, e.g. HUB_RELAY_TOKEN or HUB_RELAY_PORT.
See README.md and config.example.json. Ctrl+C to stop. No services or network routes are installed.`);
    return;
  }
  const started = await startServer(cfg);
  const host = started.host.includes(':') ? '[' + started.host + ']' : started.host;
  const base = (cfg.TLS_CERT ? 'https' : 'http') + '://' + host + ':' + started.port;
  console.log('Hub relay (RL1): ' + base + '  modules: ' + started.modules.join(', '));
  console.log('Health: ' + base + '/health');
  if (started.modules.includes('mcp')) console.log('MCP: POST ' + base + '/mcp/<PIN>; tab: ' + websocketUrl(base, '/ws'));
  if (started.modules.includes('tcp')) console.log('TCP: ' + websocketUrl(base, '/tcp') + '?token=HOST:PORT (allowlist required)');
  if (started.modules.includes('fetch')) console.log('Fetch: POST ' + base + '/fetch (allowlist required)');
  console.log('Relay token: ' + (cfg.TOKEN ? 'required (not printed)' : 'off; MCP still needs its tab PIN'));
  let stopping = false;
  const stop = async () => { if (!stopping) { stopping = true; await started.close(); } };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
if (require.main === module) main().catch(err => { console.error(err.message); process.exitCode = 1; });
module.exports = { startServer, main };
