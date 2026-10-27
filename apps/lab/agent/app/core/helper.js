/* Agent — app/core/helper.js: client for the local bash helper (HR5, helper/agent-helper.sh).
   Settings: helper 'off' (default) | 'on', helperUrl (http://127.0.0.1:11500), helperToken. HR.helper.ready() is true only
   after a successful GET /health with the token (Test button, or on load when On). run({command,cwd,timeout,signal}) ->
   {code, stdout, stderr, stdout_bytes, stderr_bytes, truncated, timed_out, ms}. Output arrives base64 (UTF-8). */
HR.helper = (function () {
  var st = 'off', info = null, subs = [];
  function url() { return String(HR.set.get('helperUrl') || 'http://127.0.0.1:11500').replace(/\/+$/, ''); }
  function hdr() { return { 'Authorization': 'Bearer ' + (HR.set.get('helperToken') || '') }; }
  function set(s, i) { st = s; info = i || null; subs.forEach(function (f) { try { f(st, info); } catch (e) {} }); }
  function enc(s) { var u = new TextEncoder().encode(s), x = ''; for (var i = 0; i < u.length; i += 8192) x += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(x); }
  function dec(b) { if (!b) return ''; var x = atob(b), u = new Uint8Array(x.length); for (var i = 0; i < x.length; i++) u[i] = x.charCodeAt(i); return new TextDecoder().decode(u); }
  function err(r, j) { return new Error((j && j.error) || ('HTTP ' + r.status)); }
  async function test() {
    if (HR.set.get('helper') !== 'on') { set('off'); return st; }
    set('checking');
    try {
      var r = await fetch(url() + '/health', { headers: hdr() }), j = await r.json().catch(function () { return null; });
      if (!r.ok || !j || !j.ok) throw err(r, j);
      set('ok', j);
    } catch (e) { set('fail', { error: /fetch|network/i.test(e.message) ? 'Can\'t reach ' + url() + ' — is agent-helper.sh running?' : e.message }); }
    return st;
  }
  async function run(o) {
    var big = new TextEncoder().encode(o.command).length > 60000;
    if (big) throw new Error('Command too long');
    var body = { cmd_b64: enc(o.command), cwd_b64: o.cwd ? enc(o.cwd) : '', timeout: o.timeout || 30 };
    var r = await fetch(url() + '/run', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, hdr()), body: JSON.stringify(body), signal: o.signal });
    var j = await r.json().catch(function () { return null; });
    if (!r.ok || !j || !j.ok) { if (r.status === 401) set('fail', { error: 'Token rejected' }); throw err(r, j); }
    return { code: j.code, stdout: dec(j.stdout_b64), stderr: dec(j.stderr_b64), stdout_bytes: j.stdout_bytes, stderr_bytes: j.stderr_bytes, truncated: j.truncated, timed_out: j.timed_out, ms: j.ms };
  }
  return { test: test, run: run, url: url, state: function () { return st; }, info: function () { return info; }, ready: function () { return st === 'ok'; },
    onChange: function (f) { subs.push(f); }, enc: enc, dec: dec };
})();
