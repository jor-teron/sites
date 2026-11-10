/* Web MCP — wm_config.js: all constants and magic values in one place. MCP2.1 */
(function (root) {
  'use strict';

  /* Every tunable value lives here so the other modules stay free of magic numbers. */
  var WM_CONFIG = {
    /* Display name shown in the page header. */
    APP_NAME: 'Web MCP',
    /* MCP initialize.serverInfo.name (stable id for clients). */
    SERVER_NAME: 'web-mcp',
    /* MCP initialize.serverInfo.version for this release. */
    SERVER_VERSION: '1.1.1',
    /* Release tag shown in the header. */
    RELEASE: 'MCP2.1',
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
    /* How many characters stay visible at each end of a masked PIN (when it is longer than PIN_MIN_LEN). */
    PIN_MASK_ENDS: 2,
    /* Bullet used to hide the middle (or all) of a PIN in the log, status, and Grok URL line. */
    PIN_MASK_CHAR: '\u2022',
    /* How long the PIN stays visible after Show is pressed, in milliseconds. It remasks earlier on Connect or page hide. */
    PIN_REMASK_MS: 30000,
    /* How long the Copy buttons show "Copied", in milliseconds. */
    COPY_FEEDBACK_MS: 1500,
    /* Path Grok posts to on the relay, written as origin + this path + PIN. */
    GROK_MCP_PATH: '/mcp/',

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

    /* Default run_command timeout, in seconds, when the caller omits timeout. */
    CMD_DEFAULT_TIMEOUT_SEC: 30,
    /* Hard cap, in seconds, on a run_command timeout. */
    CMD_MAX_TIMEOUT_SEC: 120,
    /* Combined stdout+stderr cap, in bytes, for one run_command call. */
    CMD_MAX_OUTPUT_BYTES: 200 * 1024,
    /* Marker appended to stdout when the combined output cap is hit. */
    CMD_TRUNC_MARK: '\n[truncated]\n',
    /* Max files copied into MEMFS for one command; extras are skipped. */
    CMD_MAX_STAGE_FILES: 2000,
    /* Max total bytes copied into MEMFS for one command; extras are skipped. */
    CMD_MAX_STAGE_BYTES: 16 * 1024 * 1024,
    /* A single file larger than this is skipped and mentioned in the result. */
    CMD_MAX_STAGE_FILE_BYTES: 2 * 1024 * 1024,
    /* MEMFS directory that mirrors the staged folder or cwd subtree. */
    CMD_MEMFS_ROOT: '/work',
    /* Exit code used when the worker is killed for exceeding the timeout (like GNU timeout). */
    CMD_TIMEOUT_EXIT: 124,
    /* Max characters accepted in a run_command command string. */
    CMD_MAX_COMMAND_CHARS: 8192,
    /* Worker script URL, relative to the Web MCP page. */
    CMD_WORKER: 'wm_cmd_worker.js',
    /* Vendored BusyBox loader, relative to the Web MCP page (and to the worker). */
    CMD_BUSYBOX_JS: 'vendor/busybox/busybox.js',
    /* Vendored BusyBox wasm, relative to the Web MCP page (and to the worker). */
    CMD_BUSYBOX_WASM: 'vendor/busybox/busybox.wasm',
    /* The 89 BusyBox 1.36.1 applets in this wasm (same list as vendor/busybox/APPLETS.txt). */
    CMD_APPLETS: [
      '[',
      '[[',
      'ascii',
      'awk',
      'base64',
      'basename',
      'bc',
      'bunzip2',
      'bzcat',
      'bzip2',
      'cal',
      'cat',
      'cksum',
      'cmp',
      'comm',
      'cp',
      'crc32',
      'cut',
      'date',
      'dc',
      'diff',
      'dirname',
      'dos2unix',
      'du',
      'echo',
      'egrep',
      'expand',
      'expr',
      'factor',
      'false',
      'fgrep',
      'find',
      'fold',
      'grep',
      'gunzip',
      'gzip',
      'head',
      'hexdump',
      'ln',
      'ls',
      'md5sum',
      'mkdir',
      'mktemp',
      'mv',
      'nl',
      'od',
      'paste',
      'printenv',
      'printf',
      'pwd',
      'readlink',
      'realpath',
      'rev',
      'rm',
      'rmdir',
      'sed',
      'seq',
      'sha1sum',
      'sha256sum',
      'sha3sum',
      'sha512sum',
      'shuf',
      'sleep',
      'sort',
      'split',
      'stat',
      'strings',
      'sum',
      'tac',
      'tail',
      'tar',
      'tee',
      'test',
      'touch',
      'tr',
      'true',
      'truncate',
      'tsort',
      'uname',
      'unexpand',
      'uniq',
      'unix2dos',
      'unzip',
      'usleep',
      'wc',
      'whoami',
      'xxd',
      'yes',
      'zcat'
    ],

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
