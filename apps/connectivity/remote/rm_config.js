/* Remote — rm_config.js: every constant for the RM1 connections list, each one commented. */
(function (root) {
  'use strict';

  /* Every tunable value lives here so the other modules stay free of magic numbers. */
  var RM_CONFIG = {
    /* Display name shown in the page header and title. */
    APP_NAME: 'Remote',
    /* Release tag shown next to the title. */
    RELEASE: 'RM1',
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
    /* Toast shown when an SFTP row is tapped. The file browser lands in RM2. */
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
    BACK_HREF: '../connectivity.html'
  };

  /* Attach to the global so script-tag loads can see it, and export for Node tests. */
  root.RM_CONFIG = RM_CONFIG;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RM_CONFIG;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
