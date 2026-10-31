/* Password Generator PG2 — core logic.
   Builds a random password from selected character sets. */
window.PG = window.PG || {};

PG.SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digit: '0123456789',
  symbol: '!@#$%^&*()-_=+[]{}|;:,.<>?'
};

// Secure random integer in [0, n) via crypto.getRandomValues (rejection sampling, no bias).
PG.randInt = function (n) {
  var limit = Math.floor(0x100000000 / n) * n;
  var buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % n;
};

// Generate a password of given length using the chosen sets.
// Guarantees at least one character from each selected set when possible.
PG.generate = function (opts) {
  var length = Math.max(8, Math.min(48, opts.length || 16));
  var pools = [];
  if (opts.lower) pools.push(PG.SETS.lower);
  if (opts.upper) pools.push(PG.SETS.upper);
  if (opts.digit) pools.push(PG.SETS.digit);
  if (opts.symbol) pools.push(PG.SETS.symbol);
  if (!pools.length) pools.push(PG.SETS.lower);

  var all = pools.join('');
  var result = [];

  // Ensure one from each pool
  for (var i = 0; i < pools.length && result.length < length; i++) {
    var pool = pools[i];
    result.push(pool.charAt(PG.randInt(pool.length)));
  }

  // Fill the rest
  while (result.length < length) {
    result.push(all.charAt(PG.randInt(all.length)));
  }

  // Shuffle
  for (var j = result.length - 1; j > 0; j--) {
    var k = PG.randInt(j + 1);
    var tmp = result[j];
    result[j] = result[k];
    result[k] = tmp;
  }

  return result.join('');
};

// Rough strength label
PG.strength = function (pw) {
  if (!pw) return { label: '', cls: '' };
  var score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 2) return { label: 'Weak', cls: 'weak' };
  if (score <= 4) return { label: 'Okay', cls: 'ok' };
  return { label: 'Strong', cls: 'strong' };
};
