#!/usr/bin/env node
/* Web MCP — relay/web-mcp-relay.js: entry point for the modular relay. MCP2.2
 *
 * This is the file Jor runs (by path or by URL). It loads the config, the
 * core, and the MCP module, then starts listening. Routes stay the same as
 * MCP1: POST /mcp/<PIN>, WS /ws, GET /health. start-relay.sh downloads this
 * file together with its sibling modules into one folder.
 *
 * The process writes nothing to disk. Environment variables are the same
 * as MCP1 (WEB_MCP_HOST, WEB_MCP_PORT, WEB_MCP_CORS_ORIGINS, ...).
 */
'use strict';

const CONFIG = require('./relay_config.js');
const { createRelay } = require('./relay_core.js');
const Mcp = require('./mod_mcp.js');

/**
 * Start the relay. overrides may replace any CONFIG field (PORT: 0 picks a random port).
 * Resolves with { server, port, host, close, tabs, modules }.
 */
function startServer(overrides) {
  /* Effective config for this instance. */
  const cfg = Object.assign({}, CONFIG, overrides || {});
  /* HTTP core that modules register routes on. */
  const relay = createRelay(cfg);
  /* MCP forwarder with its own tab map. */
  const mcp = Mcp.createMcpModule();
  relay.register(mcp);
  return relay.listen().then(function (started) {
    /* Tab map, kept on the result so existing tests and callers can inspect it. */
    started.tabs = mcp.tabs;
    return started;
  });
}

/**
 * Print a short listen banner and start with the file-level CONFIG.
 */
async function main() {
  /* Bound server, including the port (useful when PORT is 0). */
  const started = await startServer();
  /* Module names shown in the banner, e.g. "mcp". */
  const names = (started.modules && started.modules.length) ? started.modules.join(', ') : 'mcp';
  process.stdout.write(
    'Web MCP relay listening on http://' + started.host + ':' + started.port +
    '  (modules: ' + names + ';  POST /mcp/<PIN>,  WS /ws,  GET /health)\n'
  );
  /**
   * Close every tab and the HTTP server, then exit.
   */
  const stop = async function () {
    await started.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (require.main === module) {
  main().catch(function (err) {
    process.stderr.write((err && err.stack) || String(err));
    process.stderr.write('\n');
    process.exit(1);
  });
}

module.exports = {
  CONFIG: CONFIG,
  startServer: startServer,
  pinsMatch: Mcp.pinsMatch,
  validPin: Mcp.validPin,
  parseMcpPin: Mcp.parseMcpPin,
  createRelay: createRelay,
  createMcpModule: Mcp.createMcpModule
};
