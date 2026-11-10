/* Web MCP — wm_mask.js: mask a PIN in the UI and build the Grok connector URL. MCP2.1 */
(function (root) {
  'use strict';

  /* Config holds the visible-end length, the bullet character, the min PIN length, and the /mcp/ path. */
  var C = root.WM_CONFIG;

  /**
   * Build a string of `count` copies of `ch` without assuming String.repeat.
   */
  function repeatChar(ch, count) {
    /* Character used for each position in the result. */
    var unit = ch == null ? '' : String(ch);
    /* How many copies to emit; negative or NaN becomes zero. */
    var n = count > 0 ? count : 0;
    /* Accumulator for the repeated string. */
    var out = '';
    /* Position in the output, advanced one copy at a time. */
    var i;
    for (i = 0; i < n; i++) out += unit;
    return out;
  }

  /**
   * Return a PIN with the middle (or all of it, when short) replaced by bullets.
   * A PIN of PIN_MIN_LEN or fewer characters is fully masked, so a 6-character
   * PIN does not leak most of itself as first-2 plus last-2.
   */
  function maskPin(pin) {
    /* Normalised PIN; null or undefined becomes an empty string. */
    var s = pin == null ? '' : String(pin);
    /* Nothing to mask when the field is empty. */
    if (!s) return '';
    /* How many characters stay visible at each end of a long PIN. */
    var ends = C.PIN_MASK_ENDS;
    /* Bullet used for the hidden stretch. */
    var ch = C.PIN_MASK_CHAR;
    /* Short PINs are all bullets. */
    if (s.length <= C.PIN_MIN_LEN) return repeatChar(ch, s.length);
    /* Hidden stretch between the visible ends. */
    var mid = repeatChar(ch, s.length - ends * 2);
    return s.slice(0, ends) + mid + s.slice(s.length - ends);
  }

  /**
   * Replace every occurrence of the raw PIN in text with its masked form.
   * Used so status and log lines never print the PIN in the clear.
   */
  function maskPinInText(text, pin) {
    /* The line that may contain the PIN. */
    var s = text == null ? '' : String(text);
    /* The raw PIN to strip out. */
    var raw = pin == null ? '' : String(pin);
    /* Skip when there is no PIN or no text. */
    if (!s || !raw) return s;
    /* Masked stand-in, built once. */
    var masked = maskPin(raw);
    /* Rebuilt line with every PIN occurrence replaced. */
    var out = '';
    /* Read index into the original line. */
    var i = 0;
    while (i < s.length) {
      if (s.substr(i, raw.length) === raw) {
        out += masked;
        i += raw.length;
      } else {
        out += s.charAt(i);
        i += 1;
      }
    }
    return out;
  }

  /**
   * Turn a relay WebSocket (or http) URL plus a PIN into the Grok connector URL.
   * `wss://host/ws` becomes `https://host/mcp/<PIN>`.
   */
  function grokUrl(relayUrl, pin) {
    /* Relay URL as typed in the form. */
    var raw = relayUrl == null ? '' : String(relayUrl).trim();
    /* PIN appended after /mcp/. */
    var pinStr = pin == null ? '' : String(pin).trim();
    /* No URL to build when the relay field is empty. */
    if (!raw) return '';
    try {
      /* Parsed relay URL, so the scheme and path can be swapped. */
      var u = new URL(raw);
      /* https for wss/https, http for ws/http, otherwise keep the scheme. */
      var proto = (u.protocol === 'wss:' || u.protocol === 'https:') ? 'https:'
                : (u.protocol === 'ws:' || u.protocol === 'http:') ? 'http:'
                : u.protocol;
      /* Path Grok posts to, always /mcp/<PIN> on this relay. */
      return proto + '//' + u.host + C.GROK_MCP_PATH + pinStr;
    } catch (_) {
      /* Invalid URL: nothing to copy or show. */
      return '';
    }
  }

  /**
   * Same as grokUrl, but the PIN in the path is masked for on-screen display.
   */
  function grokUrlMasked(relayUrl, pin) {
    /* Full connector URL with the raw PIN, then scrubbed for display. */
    var full = grokUrl(relayUrl, pin);
    /* Trimmed PIN, so the replacement matches the value placed in the path. */
    var raw = pin == null ? '' : String(pin).trim();
    return maskPinInText(full, raw);
  }

  /* Public helpers used by the UI and by Node tests. */
  var api = {
    maskPin: maskPin,
    maskPinInText: maskPinInText,
    grokUrl: grokUrl,
    grokUrlMasked: grokUrlMasked
  };
  root.WMMask = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
