/* Web MCP — wm_config.js: all constants and magic values in one place. MCP1 */
(function (root) {
  'use strict';

  /* Every tunable value lives here so the other modules stay free of magic numbers. */
  var WM_CONFIG = {
    /* Display name shown in the page header. */
    APP_NAME: 'Web MCP',
    /* MCP initialize.serverInfo.name (stable id for clients). */
    SERVER_NAME: 'web-mcp',
    /* MCP initialize.serverInfo.version for this release. */
    SERVER_VERSION: '1.0.0',
    /* Release tag shown in the header. */
    RELEASE: 'MCP1',
    /* Protocol versions we accept, newest first. */
    PROTOCOL_VERSIONS: ['2025-06-18', '2025-03-26', '2024-11-05'],
    /* Fallback when the client omits a version or sends an unknown one. */
    DEFAULT_PROTOCOL_VERSION: '2025-03-26',

    /* Default outbound WebSocket URL on the Radxa Tailscale Funnel. */
    DEFAULT_RELAY_URL: 'wss://debian.tail94ffdb.ts.net/ws',
    /* localStorage key for the saved PIN. */
    LS_PIN: 'web-mcp.pin',
    /* localStorage key for the saved relay WebSocket URL. */
    LS_RELAY: 'web-mcp.relay',
    /* Shared Hub theme key — read only, never written by this app. */
    HUB_THEME_KEY: 'sites-hub.theme',
    /* Shared Hub auto-theme flag — read only. */
    HUB_THEME_AUTO_KEY: 'sites-hub.themeAuto',

    /* Minimum allowed PIN length in characters. */
    PIN_MIN_LEN: 6,
    /* Length of a generated PIN. */
    PIN_GEN_LEN: 8,
    /* Alphabet used to generate PINs. Ambiguous 0/O/1/I/l are omitted so a generated PIN is easier to read. */
    PIN_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789',
    /* Alphabet accepted when the user types a PIN: letters, digits, underscore, hyphen. */
    PIN_VALID_CHARS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-',

    /* IndexedDB database that stores the persisted folder handle. */
    IDB_NAME: 'web-mcp',
    /* IndexedDB schema version. */
    IDB_VERSION: 1,
    /* Object store that holds the root folder handle. */
    IDB_STORE: 'handles',
    /* Key of the saved root folder handle. */
    IDB_ROOT_KEY: 'root',
    /* showDirectoryPicker id so the browser can remember the last folder. */
    PICKER_ID: 'web-mcp-root',

    /* Max bytes returned by read_file (same cap as Linux MCP v2). */
    MAX_READ_BYTES: 1 * 1024 * 1024,
    /* Max entries list_dir will return. */
    MAX_LIST_ENTRIES: 2000,
    /* Max directory walk depth for recursive list_dir. */
    MAX_WALK_DEPTH: 8,
    /* Default max_depth when list_dir is recursive. */
    DEFAULT_RECURSIVE_DEPTH: 2,
    /* Reject user paths longer than this (characters). */
    MAX_PATH_CHARS: 2048,
    /* Max rows kept in the live tool-call log. */
    LOG_MAX: 200,

    /* First reconnect delay after a dropped WebSocket, in milliseconds. */
    RECONNECT_BASE_MS: 1000,
    /* Ceiling for the reconnect backoff, in milliseconds. */
    RECONNECT_MAX_MS: 30000,
    /* How long to wait for a hello-ok from the relay, in milliseconds. */
    HELLO_TIMEOUT_MS: 8000,

    /* Exact error text when the folder is missing or permission was not granted. */
    PERMISSION_ERROR: 'permission needed: click Allow in Web MCP',
    /* Shown when the browser has no File System Access directory picker. */
    UNSUPPORTED_MESSAGE:
      'This browser cannot pick a folder. Use Chrome or Edge on a desktop. Firefox, Safari, and most phone browsers are not supported.'
  };

  /* Attach to the global so script-tag loads can see it, and export for Node tests. */
  root.WM_CONFIG = WM_CONFIG;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WM_CONFIG;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
