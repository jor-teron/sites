/* Remote — rm_main.js: start the RM4 connections list, tabs, SFTP/WebDAV browse and transfers, the SSH terminal, and the VNC viewer, once the page has loaded. */
(function (root) {
  'use strict';

  /* Constructors, loaded as script tags before this file. */
  var C = root.RM_CONFIG;
  var Store = root.RMStore;
  var Tabs = root.RMTabs;
  var UI = root.RMUI;
  var SftpView = root.RMSftpView;
  var SshView = root.RMSshView;
  var VncView = root.RMVncView;

  /* Bind the store to localStorage, with an in-memory fallback if it is blocked. */
  function storage() {
    try {
      /* Probe setItem so private mode that throws later is caught now. */
      var s = localStorage;
      var k = C.LS_CONNS + ':probe';
      s.setItem(k, '1');
      s.removeItem(k);
      return s;
    } catch (e) {
      /* Tiny memory store that matches the localStorage shape. */
      var mem = {};
      return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null; },
        setItem: function (key, val) { mem[key] = String(val); },
        removeItem: function (key) { delete mem[key]; }
      };
    }
  }

  /* Start the UI after the DOM is ready. */
  function start() {
    /* One storage object shared by the connections list and the SSH known-hosts / font store. */
    var mem = storage();
    /* Saved connections (no passwords). */
    var store = Store.make(mem);
    /* Remmina-style tab list; the Connections tab is always first. */
    var tabs = Tabs.make();
    /* Filled after UI.init so the open-connection callback can call into the session views. */
    var sftp = null;
    var ssh = null;
    var vnc = null;
    var ui = UI.init({
      store: store,
      tabs: tabs,
      onOpen: function (conn) {
        if (conn && conn.protocol === 'ssh') { if (ssh) ssh.startConnect(conn); }
        else if (conn && conn.protocol === 'vnc') { if (vnc) vnc.startConnect(conn); }
        else if (sftp) sftp.startConnect(conn);
      },
      onShowSession: function (tab) {
        if (tab && tab.protocol === 'ssh') { if (ssh) ssh.showSession(tab); }
        else if (tab && tab.protocol === 'vnc') { if (vnc) vnc.showSession(tab); }
        else if (sftp) sftp.showSession(tab);
      }
    });
    sftp = SftpView.init({
      store: store,
      tabs: tabs,
      toast: ui.toast,
      pageProtocol: ui.pageProtocol
    });
    ssh = SshView.init({
      store: store,
      tabs: tabs,
      toast: ui.toast,
      pageProtocol: ui.pageProtocol,
      storage: mem
    });
    vnc = VncView.init({
      store: store,
      tabs: tabs,
      toast: ui.toast,
      pageProtocol: ui.pageProtocol
    });
    /* Redraw the tab strip and the visible pane whenever a tab is opened, selected or closed. */
    tabs.onChange(function () {
      ui.renderTabs();
      ui.showPane();
    });
    ui.renderTabs();
    ui.showPane();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
