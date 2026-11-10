/* Web MCP — wm_main.js: boot the page, wire buttons, bind tools to the relay link. MCP2.1 */
(function (root) {
  'use strict';

  /* Modules loaded as earlier script tags. */
  var C = root.WM_CONFIG;
  var FS = root.WMFS;
  var Tools = root.WMTools;
  var Link = root.WMLink;
  var UI = root.WMUI;
  var Mask = root.WMMask;

  /**
   * Trimmed value of the PIN field, or '' when the field is missing.
   */
  function readPin() {
    var pinEl = document.getElementById('pin');
    return pinEl ? pinEl.value.trim() : '';
  }

  /**
   * Trimmed value of the relay URL field, or '' when the field is missing.
   */
  function readRelay() {
    var relayEl = document.getElementById('relay');
    return relayEl ? relayEl.value.trim() : '';
  }

  /**
   * Refresh the masked Grok URL line from the current form values.
   */
  function refreshGrokUrl() {
    UI.updateGrokUrl(readRelay(), readPin());
  }

  /**
   * Load the saved PIN and relay URL into the form, generating a PIN if none is saved.
   */
  function loadForm() {
    var pinEl = document.getElementById('pin');
    var relayEl = document.getElementById('relay');
    var savedPin = UI.lsGet(C.LS_PIN);
    var savedRelay = UI.lsGet(C.LS_RELAY);
    if (pinEl) pinEl.value = savedPin || Link.generatePin();
    if (relayEl) relayEl.value = savedRelay || C.DEFAULT_RELAY_URL;
    persistForm();
  }

  /**
   * Persist the current PIN and relay URL so a reload can reuse them, and refresh the Grok URL line.
   */
  function persistForm() {
    var pinEl = document.getElementById('pin');
    var relayEl = document.getElementById('relay');
    if (pinEl) UI.lsSet(C.LS_PIN, pinEl.value.trim());
    if (relayEl) UI.lsSet(C.LS_RELAY, relayEl.value.trim());
    refreshGrokUrl();
  }

  /**
   * Folder-state listener: refresh the label, Allow button, and status hint.
   */
  function onFolder(state, name) {
    UI.setFolder(state, name);
    if (state === 'unsupported') {
      UI.setUnsupported(true, C.UNSUPPORTED_MESSAGE);
      UI.setStatus('Folder access is not supported in this browser', 'error');
      return;
    }
    UI.setUnsupported(false);
    if (state === 'ready') {
      if (!Link.isWanted()) UI.setStatus('Folder ready. Connect when you want Grok to use it.', 'ok');
    } else if (state === 'need') {
      UI.setStatus(C.PERMISSION_ERROR, 'warn');
    } else if (!Link.isWanted()) {
      UI.setStatus('Pick a folder, then Connect.', 'idle');
    }
  }

  /**
   * Link-status listener: refresh the status line and Connect/Disconnect buttons.
   */
  function onLink(status, detail) {
    UI.setLinkButtons(Link.isWanted());
    if (status === 'connected') UI.setStatus(detail || 'Connected', 'ok');
    else if (status === 'connecting') UI.setStatus(detail || 'Connecting…', 'busy');
    else if (status === 'error') UI.setStatus(detail || 'Connection error', 'error');
    else UI.setStatus(detail || 'Disconnected', 'idle');
  }

  /**
   * Copy `text` and flash 'Copied' on `btn`, or show an error in the status line.
   */
  function copyAndFlash(text, btn, emptyMessage) {
    var value = text == null ? '' : String(text);
    if (!value) {
      UI.setStatus(emptyMessage || 'Nothing to copy', 'error');
      return;
    }
    UI.copyText(value).then(function (ok) {
      if (ok) UI.flashCopied(btn);
      else UI.setStatus('Could not copy', 'error');
    });
  }

  /**
   * Wire every control once the DOM is ready.
   */
  async function boot() {
    UI.bootTheme();
    UI.bootPinMask();
    loadForm();
    Link.onStatus(onLink);
    FS.onChange(onFolder);
    await FS.init();
    onFolder(FS.getState(), FS.folderName());

    var pick = document.getElementById('btn-pick');
    if (pick) {
      pick.addEventListener('click', async function () {
        try {
          await FS.pick();
        } catch (err) {
          if (err && err.name === 'AbortError') return;
          UI.setStatus(err && err.message ? err.message : 'Could not pick a folder', 'error');
        }
      });
    }

    var allow = document.getElementById('btn-allow');
    if (allow) {
      allow.addEventListener('click', async function () {
        try {
          await FS.allow();
        } catch (err) {
          if (err && err.name === 'AbortError') return;
          UI.setStatus(err && err.message ? err.message : 'Allow failed', 'error');
        }
      });
    }

    var gen = document.getElementById('btn-gen');
    if (gen) {
      gen.addEventListener('click', function () {
        var pinEl = document.getElementById('pin');
        if (pinEl) pinEl.value = Link.generatePin();
        UI.remaskPin();
        persistForm();
      });
    }

    var pinEl = document.getElementById('pin');
    var relayEl = document.getElementById('relay');
    if (pinEl) {
      pinEl.addEventListener('change', persistForm);
      pinEl.addEventListener('input', refreshGrokUrl);
    }
    if (relayEl) {
      relayEl.addEventListener('change', persistForm);
      relayEl.addEventListener('input', refreshGrokUrl);
    }

    var copyPin = document.getElementById('btn-pin-copy');
    if (copyPin) {
      copyPin.addEventListener('click', function () {
        copyAndFlash(readPin(), copyPin, 'Enter a PIN first');
      });
    }

    var copyUrl = document.getElementById('btn-copy-url');
    if (copyUrl) {
      copyUrl.addEventListener('click', function () {
        var url = Mask && Mask.grokUrl ? Mask.grokUrl(readRelay(), readPin()) : '';
        copyAndFlash(url, copyUrl, 'Set the relay URL and PIN first');
      });
    }

    var connect = document.getElementById('btn-connect');
    if (connect) {
      connect.addEventListener('click', function () {
        persistForm();
        UI.remaskPin();
        var pin = readPin();
        var url = readRelay();
        /* Bind the real filesystem tools for this session. */
        var tools = Tools.createTools(FS, root.WMCmd);
        Link.connect(url, pin, tools, UI.addLog);
      });
    }

    var disconnect = document.getElementById('btn-disconnect');
    if (disconnect) {
      disconnect.addEventListener('click', function () {
        Link.disconnect();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
