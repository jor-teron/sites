/* Remote — rm_ssh_term.js: xterm.js + fit addon wrapper for one SSH tab.
 * Copy: selecting text copies it; Ctrl+Shift+C; Copy in the overflow menu.
 * Paste: Ctrl+Shift+V; right-click; long-press on touch; Paste in the overflow menu.
 * If the clipboard cannot be read, onAskPaste() is called (the view opens a paste box).
 * Special-key sequences and Ctrl/Alt sticky handling are exported so node can test them.
 * This module loads vendor copies from Remote's own vendor/ folder, not from the SSH app.
 */
(function (root) {
  'use strict';

  /* Config is loaded first in the page; tests pass it in via the same global or require. */
  var C = root.RM_CONFIG || (typeof require === 'function' ? require('./rm_config.js') : {});

  /* Bytes (or escape sequences) sent by each named special key, not including Ctrl/Alt. */
  var KEY_SEQ = {
    esc: '\x1b',
    tab: '\t',
    up: '\x1b[A',
    down: '\x1b[B',
    right: '\x1b[C',
    left: '\x1b[D',
    '|': '|',
    '/': '/',
    '-': '-'
  };

  /* Look up a named special key, or return the raw character when it is a single glyph. */
  function keySeq(name) {
    var k = String(name || '');
    if (Object.prototype.hasOwnProperty.call(KEY_SEQ, k)) return KEY_SEQ[k];
    return k;
  }

  /**
   * Apply a sticky modifier to a single typed character.
   * Ctrl turns letters into control codes (Ctrl+C -> \x03). Alt prefixes ESC.
   * Returns { text, ctrl, alt } with the modifiers cleared once they have been used.
   */
  function applyModifiers(ch, ctrl, alt) {
    var s = String(ch == null ? '' : ch);
    var nextCtrl = !!ctrl;
    var nextAlt = !!alt;
    if (nextCtrl && s.length === 1) {
      var c = s.toUpperCase().charCodeAt(0);
      if (c >= 64 && c <= 95) {
        s = String.fromCharCode(c - 64);
        nextCtrl = false;
      }
    }
    if (nextAlt && s) {
      s = '\x1b' + s;
      nextAlt = false;
    }
    return { text: s, ctrl: nextCtrl, alt: nextAlt };
  }

  /* Light or dark xterm colour set, matching the Hub theme already applied to <html>. */
  function colors() {
    var dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    if (dark) {
      return {
        background: '#0f172a',
        foreground: '#e8eaee',
        cursor: '#e8eaee',
        selectionBackground: 'rgba(45,212,191,.35)'
      };
    }
    return {
      background: '#f8fafc',
      foreground: '#0f172a',
      cursor: '#0f172a',
      selectionBackground: 'rgba(15,118,110,.3)',
      black: '#0f172a',
      brightBlack: '#555',
      white: '#999',
      brightWhite: '#444',
      yellow: '#9a6a00',
      brightYellow: '#8a5a00'
    };
  }

  /**
   * Mount a terminal inside hostEl.
   * opts: { fontSize, onData(str), onResize(cols, rows), onAskPaste() -> Promise<string|null>, onCopied() }.
   * Returns a handle with write, reset, fit, focus, copy, paste, setFont, getSize, attach, detach,
   * dispose, sendKey, setCtrl, setAlt, theme, isCtrl, isAlt.
   */
  function mount(hostEl, opts) {
    opts = opts || {};
    /* The xterm constructor, loaded from vendor/xterm.min.js. */
    var TerminalCtor = root.Terminal || (typeof window !== 'undefined' ? window.Terminal : null);
    /* The fit addon namespace, loaded from vendor/xterm-addon-fit.min.js. */
    var FitNS = root.FitAddon || (typeof window !== 'undefined' ? window.FitAddon : null);
    if (!TerminalCtor || !FitNS || !hostEl) {
      throw new Error('xterm.js failed to load.');
    }
    /* The live xterm instance. */
    var term = new TerminalCtor({
      fontSize: opts.fontSize || C.SSH_FONT_DEFAULT || 15,
      fontFamily: 'ui-monospace, "Cascadia Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace',
      cursorBlink: true,
      scrollback: 5000,
      theme: colors(),
      allowProposedApi: false,
      rightClickSelectsWord: false
    });
    /* Fit addon so the terminal fills its host. */
    var fitAddon = new FitNS.FitAddon();
    term.loadAddon(fitAddon);
    /* Inner node xterm paints into. */
    var inner = document.createElement('div');
    inner.className = 'ssh-term';
    hostEl.appendChild(inner);
    term.open(inner);
    /* Callback that receives typed / pasted / special-key bytes, or null when detached. */
    var sink = opts.onData || null;
    /* Callback that receives cols/rows after a fit, or null when detached. */
    var onSize = opts.onResize || null;
    /* Sticky Ctrl, used by the phone key bar. */
    var ctrl = false;
    /* Sticky Alt, used by the phone key bar. */
    var alt = false;
    /* Resize observer so a tab resize refits the terminal. */
    var ro = null;
    /* Long-press timer used for touch paste. */
    var lp = null;
    /* Touch start point, so a scroll cancels the long-press. */
    var sx = 0;
    var sy = 0;

    /* Send bytes to the session, applying sticky Ctrl/Alt first. */
    function emit(raw) {
      if (!sink) return;
      var r = applyModifiers(raw, ctrl, alt);
      ctrl = r.ctrl;
      alt = r.alt;
      if (r.text) sink(r.text);
    }

    term.onData(function (d) { emit(d); });
    term.onResize(function (size) {
      if (onSize) onSize(size.cols, size.rows);
    });
    term.onSelectionChange(function () {
      if (term.hasSelection()) copy(true);
    });
    term.attachCustomKeyEventHandler(function (e) {
      if (e.type !== 'keydown' || !(e.ctrlKey && e.shiftKey)) return true;
      var k = e.key.toLowerCase();
      if (k === 'c') { e.preventDefault(); copy(false); return false; }
      if (k === 'v') { e.preventDefault(); paste(); return false; }
      return true;
    });

    hostEl.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      paste();
    }, true);
    hostEl.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      lp = setTimeout(function () { lp = null; paste(); }, 600);
    }, { passive: true });
    hostEl.addEventListener('touchmove', function (e) {
      if (lp && Math.hypot(e.touches[0].clientX - sx, e.touches[0].clientY - sy) > 10) {
        clearTimeout(lp);
        lp = null;
      }
    }, { passive: true });
    hostEl.addEventListener('touchend', function () {
      if (lp) { clearTimeout(lp); lp = null; }
    });
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(function () { fit(); });
      ro.observe(hostEl);
    }

    /* Copy the current selection. quiet skips the onCopied toast (used by select-to-copy). */
    function copy(quiet) {
      if (!term.hasSelection()) return Promise.resolve(false);
      var s = term.getSelection();
      var done = function () { if (!quiet && opts.onCopied) opts.onCopied(); return true; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(s).then(done, function () {
          return fallbackCopy(s) ? done() : false;
        });
      }
      return Promise.resolve(fallbackCopy(s) ? done() : false);
    }

    /* Fallback when the Clipboard API is blocked. */
    function fallbackCopy(s) {
      var ta = document.createElement('textarea');
      ta.value = s;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      term.focus();
      return ok;
    }

    /* Paste from the clipboard, or ask the view for a fallback box. */
    function paste() {
      var send = function (s) { if (s) term.paste(s); term.focus(); };
      if (navigator.clipboard && navigator.clipboard.readText) {
        return navigator.clipboard.readText().then(send, function () {
          if (opts.onAskPaste) return Promise.resolve(opts.onAskPaste()).then(send);
        });
      }
      if (opts.onAskPaste) return Promise.resolve(opts.onAskPaste()).then(send);
      return Promise.resolve();
    }

    /* Fit the terminal to its host and report the new size. */
    function fit() {
      if (hostEl.hidden || hostEl.offsetParent === null && hostEl.offsetWidth === 0) return;
      try { fitAddon.fit(); } catch (e) { /* not visible yet */ }
    }

    /* Public handle used by the SSH view. */
    var api = {
      write: function (u8) { term.write(u8); },
      reset: function () { term.reset(); term.clear(); },
      fit: fit,
      focus: function () { term.focus(); },
      copy: copy,
      paste: paste,
      setFont: function (n) {
        term.options.fontSize = n;
        fit();
      },
      getSize: function () { return { cols: term.cols, rows: term.rows }; },
      attach: function (write, resize) { sink = write; onSize = resize; term.focus(); },
      detach: function () { sink = null; onSize = null; },
      sendKey: function (name) {
        if (name === 'ctrl') { ctrl = !ctrl; return { ctrl: ctrl, alt: alt }; }
        if (name === 'alt') { alt = !alt; return { ctrl: ctrl, alt: alt }; }
        emit(keySeq(name));
        term.focus();
        return { ctrl: ctrl, alt: alt };
      },
      isCtrl: function () { return ctrl; },
      isAlt: function () { return alt; },
      clearMods: function () { ctrl = false; alt = false; },
      theme: function () { term.options.theme = colors(); },
      dispose: function () {
        if (ro) try { ro.disconnect(); } catch (e) { /* already gone */ }
        ro = null;
        try { term.dispose(); } catch (e) { /* already gone */ }
        if (inner.parentNode) inner.parentNode.removeChild(inner);
      }
    };
    return api;
  }

  /* Public API, also exported for Node tests (mount itself needs a document and xterm). */
  var api = { mount: mount, keySeq: keySeq, applyModifiers: applyModifiers, KEY_SEQ: KEY_SEQ, colors: colors };
  root.RMSshTerm = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
