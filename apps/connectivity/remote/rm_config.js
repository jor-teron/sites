/* Remote — rm_config.js: every constant for the RM4 connections list, SFTP browse and transfers, the SSH terminal, WebDAV, and the VNC viewer, each one commented. */
(function (root) {
  'use strict';

  /* Every tunable value lives here so the other modules stay free of magic numbers. */
  var RM_CONFIG = {
    /* Display name shown in the page header and title. */
    APP_NAME: 'Remote',
    /* Release tag shown next to the title. */
    RELEASE: 'RM4',
    /* localStorage key for the saved connections list. Passwords are never stored under this key. */
    LS_CONNS: 'remote-conns-v1',
    /* Shared Hub theme key — read only, never written by this app. */
    HUB_THEME_KEY: 'sites-hub.theme',
    /* Allowed protocol ids, in the order the picker shows them. SFTP is first because it is the default. */
    PROTOCOLS: ['sftp', 'ssh', 'vnc', 'webdav', 'ftp'],
    /* Protocol chosen when the add form first opens. */
    DEFAULT_PROTOCOL: 'sftp',
    /* Default TCP port for each protocol, filled in when the protocol changes unless the user edited the port. */
    DEFAULT_PORTS: {
      ssh: 22,
      vnc: 5900,
      sftp: 22,
      webdav: 443,
      ftp: 21
    },
    /* Short labels drawn on row badges and in the protocol picker. */
    PROTOCOL_LABELS: {
      ssh: 'SSH',
      vnc: 'VNC',
      sftp: 'SFTP',
      webdav: 'WebDAV',
      ftp: 'FTP'
    },
    /* Toast shown when an unknown / parked-viewer protocol is tapped. VNC no longer uses this. */
    TOAST_VIEWER_LATER: 'viewer coming in a later RM release',
    /* Kept for older tests and copy; RM2 opens an SFTP tab instead of this toast. */
    TOAST_SFTP: 'coming in RM2',
    /* Toast shown when an FTP row is tapped. Plain FTP is parked. */
    TOAST_FTP: 'parked',
    /* Maximum length of a connection name. */
    MAX_NAME: 60,
    /* Maximum length of a host name or IP address. */
    MAX_HOST: 255,
    /* Maximum length of a user name. */
    MAX_USER: 64,
    /* Maximum length of an optional group label. */
    MAX_GROUP: 60,
    /* Maximum length of optional notes. */
    MAX_NOTES: 240,
    /* Maximum length of an optional relay URL. */
    MAX_RELAY: 500,
    /* Lowest accepted TCP port. */
    PORT_MIN: 1,
    /* Highest accepted TCP port. */
    PORT_MAX: 65535,
    /* How long a toast stays visible, in milliseconds. */
    TOAST_MS: 2800,
    /* File name used when exporting the connections list as JSON. */
    EXPORT_FILENAME: 'remote-connections.json',
    /* Heading used for connections that have no group, only when at least one named group exists. */
    UNGROUPED_LABEL: 'Ungrouped',
    /* Suffix added to the name of a duplicated connection. */
    COPY_SUFFIX: ' (copy)',
    /* Path of the Connectivity tiles page, used by the header Back link. */
    BACK_HREF: '../connectivity.html',
    /* Maximum length of an optional saved relay token. Passwords are never stored. */
    MAX_TOKEN: 200,
    /* Id of the fixed first tab, which always shows the connections list. */
    CONNECTIONS_TAB_ID: 'connections',
    /* Label drawn on the fixed first tab. */
    CONNECTIONS_TAB_LABEL: 'Connections',
    /* How long to wait for the SFTP relay's open reply, in milliseconds. */
    SFTP_OPEN_MS: 25000,
    /* Suffix appended to relay errors so the user can find setup steps. */
    SFTP_README_HINT: ' See the README for how to run the SFTP relay.',
    /* Shown when the WebSocket to the relay never opens or drops before login. */
    SFTP_ERR_REACH_RELAY: "Can't reach the relay. Is sftp_relay.py running? From an https page the relay must be wss://.",
    /* Shown when the first message comes back with code token. */
    SFTP_ERR_TOKEN: 'Wrong relay token. Check the token printed when you start sftp_relay.py.',
    /* Shown when the relay refuses the target host (code allow). */
    SFTP_ERR_ALLOW: 'This host is not in the relay allowlist (apps/connectivity/ssh/relay/allowlist.txt).',
    /* Shown when the SFTP login is rejected (code auth). */
    SFTP_ERR_AUTH: 'Login failed. Check the user and password.',
    /* Shown when the relay reports a changed SSH host key (code hostkey). */
    SFTP_ERR_HOSTKEY: 'The server host key changed. If that is expected, remove its line from sftp_known_hosts next to the relay.',
    /* Short security warning drawn on the connect sheet and in the README. */
    SFTP_SECURITY_NOTE: 'This relay logs in for you and sees the password and files. Run it only on your own machine, LAN or VPN.',
    /* Hint under a file's details when a download is available. */
    SFTP_FILE_HINT: 'Save this file to this device.',
    /* Confirm text used if a tab is closed while a transfer is running. */
    TAB_CLOSE_BUSY: 'A transfer is running. Close this tab and disconnect anyway?',
    /* Maximum length of the optional start folder (sent as root on open). */
    MAX_FOLDER: 255,
    /* Minimum viewport width, in pixels, at which the local+server two-pane layout appears. */
    TWO_PANE_MIN: 900,
    /* Fallback relay file-size cap, in bytes, when the open reply has no max (relay default is 100 MB). */
    SFTP_DEFAULT_MAX: 100 * 1024 * 1024,
    /* Confirm text for deleting a file. */
    DELETE_FILE: 'Delete this file?',
    /* Confirm text for recursively deleting a folder (the relay supports recursive:true). */
    DELETE_FOLDER: 'Delete this folder and everything inside it?',
    /* Shown when a new-folder or rename name is illegal. */
    BAD_NAME: 'Enter a name without / or ..',
    /* Progress label for a cancelled queue. */
    XFER_CANCELLED: 'Cancelled.',
    /* Overwrite question; the name is filled in by the UI. */
    OVERWRITE_ASK: ' already exists. Overwrite it?',
    /* localStorage key for accepted SSH host-key fingerprints. Remote's own key, never the SSH app's. */
    LS_SSH_KNOWN: 'remote-known-hosts-v1',
    /* localStorage key for the SSH terminal font size. */
    LS_SSH_FONT: 'remote-ssh-font-v1',
    /* Default terminal font size, in pixels. */
    SSH_FONT_DEFAULT: 15,
    /* Smallest allowed terminal font size. */
    SSH_FONT_MIN: 9,
    /* Largest allowed terminal font size. */
    SSH_FONT_MAX: 28,
    /* Fallback terminal columns before the first fit. */
    SSH_DEFAULT_COLS: 80,
    /* Fallback terminal rows before the first fit. */
    SSH_DEFAULT_ROWS: 24,
    /* How long to wait for the SSH login, in milliseconds (paused during the host-key prompt). */
    SSH_OPEN_MS: 30000,
    /* Keepalive interval after login, in seconds. */
    SSH_KEEPALIVE_SEC: 30,
    /* Missed keepalives before the link is treated as dead. */
    SSH_KEEPALIVE_MISS: 2,
    /* Suffix appended to SSH relay errors so the user can find setup steps. */
    SSH_README_HINT: ' See the README for how to run the SSH relay.',
    /* Shown when the connection has no relay URL. */
    SSH_ERR_RELAY_URL: 'Add a Relay URL on this connection first (ws://192.168.x.x:8022 on a LAN, or wss:// on https). See the README for how to run the SSH relay.',
    /* Shown when the WebSocket to the SSH relay never opens. */
    SSH_ERR_REACH_RELAY: "Can't reach the SSH relay. Is start-relay running on port 8022? From an https page the relay must be wss://.",
    /* Shown when the relay is up but the target is refused (allowlist or the TCP open failed). */
    SSH_ERR_ALLOW: 'This host is not in the relay allowlist (apps/connectivity/ssh/relay/allowlist.txt), or the relay could not open it.',
    /* Shown when the SSH login is rejected. */
    SSH_ERR_AUTH: 'Login failed. Check the user and password.',
    /* Shown when the connection has no user name. */
    SSH_ERR_USER: 'Enter a user name on this connection first.',
    /* Shown when the page is not a secure context. */
    SSH_ERR_INSECURE: 'SSH needs a secure page (https or localhost) so the browser can use Web Crypto.',
    /* Shown when an https page is given a ws:// relay. */
    SSH_ERR_WS_ON_HTTPS: 'This https page cannot use a ws:// relay. Use wss://, or open the Hub over http on your LAN.',
    /* Shown when the library fails to load. */
    SSH_ERR_LIB: 'The SSH library failed to load.',
    /* Shown when the server offers only Ed25519 host keys. */
    SSH_ERR_ED25519_HOST: 'This server offers only host key types this app cannot check. Ed25519 host keys are not supported yet. Enable an ECDSA or RSA host key on the server, e.g. in /etc/ssh/sshd_config: HostKey /etc/ssh/ssh_host_ecdsa_key (then restart sshd).',
    /* Shown when the server offers only curve25519 key exchange. */
    SSH_ERR_ED25519_KEX: 'No common key exchange with this server. This app supports ecdh-sha2-nistp256/384 and diffie-hellman-group14/16; curve25519 only is not supported yet.',
    /* Shown when the SSH server does not answer in time. */
    SSH_ERR_TIMEOUT: 'The SSH server did not respond in time.',
    /* Short security note drawn on the SSH connect sheet and in the README. */
    SSH_SECURITY_NOTE: 'This relay only forwards encrypted SSH bytes. It never sees your password or what you type. Run it only on your own machine, LAN or VPN.',
    /* Maximum length of a WebDAV base URL. */
    MAX_URL: 500,
    /* Suffix appended to WebDAV CORS / method errors so the user can find setup steps. */
    DAV_README_HINT: ' See the README for how to allow CORS on the WebDAV server.',
    /* Shown when the WebDAV URL is missing or not http(s). */
    DAV_ERR_URL: 'Enter a WebDAV URL (https://host/dav/ or http://host/dav/).',
    /* Shown when fetch throws (CORS, mixed content, or the network failed). */
    DAV_ERR_CORS: "Can't reach the WebDAV server. If this page is on a different origin, the server must allow CORS. An https page also cannot call an http:// server.",
    /* Shown when the server returns 401. */
    DAV_ERR_AUTH: 'Login failed. Check the user and password.',
    /* Shown when the server returns 403. */
    DAV_ERR_DENIED: 'Access denied.',
    /* Shown when the server returns 404. */
    DAV_ERR_NOTFOUND: 'That file or folder was not found.',
    /* Shown when the server returns 405 or 501. */
    DAV_ERR_METHOD: 'The server does not allow that WebDAV method (405). PROPFIND, GET, PUT, MKCOL, MOVE and DELETE must be allowed, and CORS must list them.',
    /* Shown when the server returns 507. */
    DAV_ERR_STORAGE: 'The server is out of storage (507).',
    /* Shown when MOVE/MKCOL hits a name that already exists (409 or 412). */
    DAV_ERR_EXISTS: 'A file or folder with that name already exists.',
    /* Shown when an https page is given an http:// WebDAV URL. */
    DAV_ERR_MIXED: 'This https page cannot use an http:// WebDAV server. Use https://, or open the Hub over http on your LAN.',
    /* Short note drawn on the WebDAV connect sheet and in the README. */
    DAV_SECURITY_NOTE: 'The browser talks to the server directly. The password is sent as HTTP Basic authentication — use https. The server must allow this page with CORS. There is no relay.',
    /* Default Tight/JPEG quality (0 = lowest, 9 = highest). Matches noVNC's own default. */
    VNC_QUALITY_DEFAULT: 6,
    /* Default Tight compression (0 = off, 9 = strongest). Matches noVNC's own default. */
    VNC_COMPRESSION_DEFAULT: 2,
    /* Quality used by the Low-bandwidth preset. */
    VNC_QUALITY_LOW: 0,
    /* Compression used by the Low-bandwidth preset. */
    VNC_COMPRESSION_LOW: 9,
    /* Path of this app's noVNC RFB module, resolved against the page URL. */
    VNC_RFB_HREF: 'vendor/novnc/core/rfb.js',
    /* Suffix appended to VNC relay errors so the user can find setup steps. */
    VNC_README_HINT: ' See the README for how to run the VNC / SSH relay.',
    /* Shown when the connection has no relay URL. */
    VNC_ERR_RELAY_URL: 'Add a Relay URL on this connection first (ws://192.168.x.x:8022 on a LAN, or wss:// on https). See the README for how to run the VNC / SSH relay.',
    /* Shown when the WebSocket to the relay never opens, or the session never starts. */
    VNC_ERR_REACH_RELAY: "Can't reach the VNC relay or the VNC server. Is start-relay running on port 8022? Check the URL and allowlist.txt. From an https page the relay must be wss://.",
    /* Shown when the relay is up but the target is refused (allowlist or the TCP open failed). */
    VNC_ERR_ALLOW: 'This host is not in the relay allowlist (apps/connectivity/ssh/relay/allowlist.txt), or the relay could not open it.',
    /* Shown when VNC authentication fails. */
    VNC_ERR_AUTH: 'Login failed. Check the password.',
    /* Shown when an https page is given a ws:// relay. */
    VNC_ERR_WS_ON_HTTPS: 'This https page cannot use a ws:// relay. Use wss://, or open the Hub over http on your LAN.',
    /* Shown when the noVNC module fails to load. */
    VNC_ERR_LIB: 'The VNC viewer failed to load.',
    /* Shown after a clean disconnect. */
    VNC_ERR_CLOSED_CLEAN: 'Disconnected.',
    /* Shown when a live session drops. */
    VNC_ERR_CLOSED: 'Connection lost.',
    /* Short security note drawn on the VNC connect sheet and in the README. */
    VNC_SECURITY_NOTE: 'This relay forwards the VNC session as plain bytes. It can see the screen and, on most servers, the password. Run it only on your own machine, LAN or VPN.'
  };

  /* Attach to the global so script-tag loads can see it, and export for Node tests. */
  root.RM_CONFIG = RM_CONFIG;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RM_CONFIG;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
