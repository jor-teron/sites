/* Remote — rm_config.js: every constant for the RM3 connections list, SFTP browse and transfers, each one commented. */
(function (root) {
  'use strict';

  /* Every tunable value lives here so the other modules stay free of magic numbers. */
  var RM_CONFIG = {
    /* Display name shown in the page header and title. */
    APP_NAME: 'Remote',
    /* Release tag shown next to the title. */
    RELEASE: 'RM3',
    /* localStorage key for the saved connections list. Passwords are never stored under this key. */
    LS_CONNS: 'remote-conns-v1',
    /* Shared Hub theme key — read only, never written by this app. */
    HUB_THEME_KEY: 'sites-hub.theme',
    /* Allowed protocol ids, in the order the picker shows them. SFTP is first because it is the default. */
    PROTOCOLS: ['sftp', 'ssh', 'vnc', 'ftp'],
    /* Protocol chosen when the add form first opens. */
    DEFAULT_PROTOCOL: 'sftp',
    /* Default TCP port for each protocol, filled in when the protocol changes unless the user edited the port. */
    DEFAULT_PORTS: {
      ssh: 22,
      vnc: 5900,
      sftp: 22,
      ftp: 21
    },
    /* Short labels drawn on row badges and in the protocol picker. */
    PROTOCOL_LABELS: {
      ssh: 'SSH',
      vnc: 'VNC',
      sftp: 'SFTP',
      ftp: 'FTP'
    },
    /* Toast shown when an SSH or VNC row is tapped. Those viewers arrive in a later RM release, in this app. */
    TOAST_VIEWER_LATER: 'viewer coming in a later RM release',
    /* Kept for older tests and copy; RM2 opens an SFTP tab instead of this toast. */
    TOAST_SFTP: 'coming in RM2',
    /* Toast shown when an FTP row is tapped. Plain FTP lands in RM4. */
    TOAST_FTP: 'coming in RM4',
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
    OVERWRITE_ASK: ' already exists. Overwrite it?'
  };

  /* Attach to the global so script-tag loads can see it, and export for Node tests. */
  root.RM_CONFIG = RM_CONFIG;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RM_CONFIG;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
