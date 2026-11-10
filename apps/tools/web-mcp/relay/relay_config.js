/* Web MCP — relay/relay_config.js: all relay constants in one place. MCP2.2
 *
 * Every tunable value lives here so the core and the modules stay free of
 * magic numbers. Environment variables override the listen address, body
 * cap, timeouts, rate limit, CORS, and WebSocket ping interval.
 *
 * Later modules (TCP bridge, fetch proxy) should add their constants here
 * too, rather than declaring new ones in the module file.
 */
'use strict';

const CONFIG = {
  /* Interface to bind. 127.0.0.1 keeps the port off the public LAN; Funnel/Serve proxies to it. */
  HOST: process.env.WEB_MCP_HOST || '127.0.0.1',
  /* Listen port. Default 8787 is free of the Linux MCP server, which uses 10001. */
  PORT: parseInt(process.env.WEB_MCP_PORT || '8787', 10),
  /* Max JSON-RPC body size in bytes. */
  MAX_BODY: parseInt(process.env.WEB_MCP_BODY_MAX || String(10 * 1024 * 1024), 10),
  /* How long to wait for the tab to answer one tools/call, in milliseconds. */
  RPC_TIMEOUT_MS: parseInt(process.env.WEB_MCP_RPC_TIMEOUT_MS || '60000', 10),
  /* Max requests per IP per rate-limit window. */
  RATE_MAX: parseInt(process.env.WEB_MCP_RATE_MAX || '120', 10),
  /* Rate-limit window in milliseconds. */
  RATE_WINDOW_MS: parseInt(process.env.WEB_MCP_RATE_WINDOW_MS || '60000', 10),
  /* Honour X-Forwarded-For only when we bind localhost (Tailscale Serve sets it). */
  TRUST_PROXY: (process.env.WEB_MCP_TRUST_PROXY || '1') === '1',
  /* CORS origins: '*' or a comma-separated list. */
  CORS_ORIGINS: (process.env.WEB_MCP_CORS_ORIGINS || '*').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
  /* Minimum PIN length, must match the tab (wm_config.js PIN_MIN_LEN). */
  PIN_MIN_LEN: 6,
  /* Allowed PIN alphabet, must match the tab (wm_config.js PIN_VALID_CHARS). */
  PIN_CHARS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-',
  /* RFC 6455 WebSocket GUID used to compute Sec-WebSocket-Accept. */
  WS_GUID: '258EAFA5-E914-47DA-95CA-C5AB0DC85B11',
  /* Max WebSocket frame size (same cap as the HTTP body). */
  MAX_FRAME: parseInt(process.env.WEB_MCP_BODY_MAX || String(10 * 1024 * 1024), 10),
  /* Interval for server-initiated WebSocket pings, in milliseconds. 0 disables them. */
  WS_PING_MS: parseInt(process.env.WEB_MCP_WS_PING_MS || '30000', 10),
  /* How long a new /ws client has to send a hello before the socket is closed, in milliseconds. */
  WS_HELLO_MS: parseInt(process.env.WEB_MCP_WS_HELLO_MS || '8000', 10),
  /* Retry-After value (seconds) sent with a 429 response. */
  RETRY_AFTER_SEC: 30,
  /* JSON-RPC error message when no tab is connected for that PIN. */
  NOT_CONNECTED: 'Web MCP tab not connected'
};

module.exports = CONFIG;
