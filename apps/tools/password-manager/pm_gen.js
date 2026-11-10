/* Password Manager PW1 — password generator and a simple entropy estimate.
   Character sets and unbiased crypto random are copied from Password Generator
   (apps/tools/password-generator/core/generator.js) and extended (length 8–64,
   avoid look-alikes). That app is left unchanged. */
(function (root) {
  'use strict';

  var SETS = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digit: '0123456789',
    symbol: '!@#$%^&*()-_=+[]{}|;:,.<>?'
  };
  var LOOKALIKES = /[O0oIl1|S5sB8G6Z2]/g;

  function cryptoObj() {
    return root.crypto || (typeof crypto !== 'undefined' ? crypto : null);
  }

  // Secure random integer in [0, n) via rejection sampling (no bias).
  function randInt(n) {
    if (n <= 0) return 0;
    var c = cryptoObj();
    if (!c || !c.getRandomValues) throw new Error('crypto.getRandomValues is not available');
    var limit = Math.floor(0x100000000 / n) * n;
    var buf = new Uint32Array(1);
    do { c.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  }

  function filterSet(s, avoid) {
    if (!avoid) return s;
    return s.replace(LOOKALIKES, '');
  }

  function generate(opts) {
    opts = opts || {};
    var length = Math.max(8, Math.min(64, opts.length || 16));
    var avoid = !!opts.avoid;
    var pools = [];
    if (opts.lower !== false) pools.push(filterSet(SETS.lower, avoid));
    if (opts.upper !== false) pools.push(filterSet(SETS.upper, avoid));
    if (opts.digit !== false) pools.push(filterSet(SETS.digit, avoid));
    if (opts.symbol) pools.push(filterSet(SETS.symbol, avoid));
    pools = pools.filter(function (p) { return p.length > 0; });
    if (!pools.length) pools.push(filterSet(SETS.lower, avoid) || SETS.lower);

    var all = pools.join('');
    var result = [];
    var i, j, k, tmp, pool;

    for (i = 0; i < pools.length && result.length < length; i++) {
      pool = pools[i];
      result.push(pool.charAt(randInt(pool.length)));
    }
    while (result.length < length) {
      result.push(all.charAt(randInt(all.length)));
    }
    for (j = result.length - 1; j > 0; j--) {
      k = randInt(j + 1);
      tmp = result[j];
      result[j] = result[k];
      result[k] = tmp;
    }
    return result.join('');
  }

  function charsetSize(opts) {
    opts = opts || {};
    var avoid = !!opts.avoid;
    var n = 0;
    if (opts.lower !== false) n += filterSet(SETS.lower, avoid).length;
    if (opts.upper !== false) n += filterSet(SETS.upper, avoid).length;
    if (opts.digit !== false) n += filterSet(SETS.digit, avoid).length;
    if (opts.symbol) n += filterSet(SETS.symbol, avoid).length;
    return n || filterSet(SETS.lower, avoid).length || 26;
  }

  function bitsForLength(length, size) {
    if (!length || !size) return 0;
    return length * (Math.log(size) / Math.log(2));
  }

  // Estimate entropy of an existing password from the classes it uses.
  function estimateBits(pw) {
    pw = String(pw || '');
    if (!pw) return 0;
    var size = 0;
    if (/[a-z]/.test(pw)) size += 26;
    if (/[A-Z]/.test(pw)) size += 26;
    if (/\d/.test(pw)) size += 10;
    if (/[^a-zA-Z0-9]/.test(pw)) size += 24;
    if (!size) size = 26;
    return bitsForLength(pw.length, size);
  }

  function labelForBits(bits) {
    if (bits <= 0) return { label: '', cls: '', bits: 0 };
    if (bits < 40) return { label: 'Weak', cls: 'weak', bits: bits };
    if (bits < 60) return { label: 'Okay', cls: 'ok', bits: bits };
    if (bits < 80) return { label: 'Strong', cls: 'strong', bits: bits };
    return { label: 'Very strong', cls: 'great', bits: bits };
  }

  function strength(pw) {
    var bits = estimateBits(pw);
    var s = labelForBits(bits);
    s.bitsLabel = bits ? ('~' + Math.round(bits) + ' bits') : '';
    return s;
  }

  function strengthFromOpts(opts) {
    var length = Math.max(8, Math.min(64, (opts && opts.length) || 16));
    var bits = bitsForLength(length, charsetSize(opts));
    var s = labelForBits(bits);
    s.bitsLabel = bits ? ('~' + Math.round(bits) + ' bits') : '';
    return s;
  }

  var api = {
    SETS: SETS,
    randInt: randInt,
    generate: generate,
    charsetSize: charsetSize,
    bitsForLength: bitsForLength,
    estimateBits: estimateBits,
    strength: strength,
    strengthFromOpts: strengthFromOpts
  };

  root.PMGen = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
