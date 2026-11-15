/* Relay (RY1) — page logic. Uses HubRelay from relay_shared.js. The only network call is Test (GET <address>/health). */
(function () {
  'use strict';
  var R = window.HubRelay;
  var $ = function (id) { return document.getElementById(id); };
  var store = null;
  try { store = window.localStorage; } catch (_) { /* blocked */ }
  var showToken = false;
  var allow = { tcp: [], fetch: [], hosts: [] };

  function current() { return { url: R.normalizeUrl($('url').value) || R.DEFAULT_URL, token: $('token').value.trim() }; }

  function copy(text, btn) {
    function done(ok) { if (!btn) return; var t = btn.textContent; btn.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(function () { btn.textContent = t; }, 1200); }
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); }); return; }
    fallback();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (_) { /* old browser */ }
      ta.remove(); done(ok);
    }
  }
  function copyBtn(getText) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.textContent = 'Copy';
    b.addEventListener('click', function () { copy(getText(), b); }); return b;
  }

  function setStatus(state, text, modules) {
    $('status').className = 'status ' + (state || 'mut'); $('status').textContent = text;
    $('dot').className = 'dot ' + (state || ''); $('dot').title = text;
    var ul = $('mods'); ul.textContent = '';
    if (!modules) return;
    R.MODULES.forEach(function (m) {
      var li = document.createElement('li'); var on = modules.indexOf(m) >= 0;
      li.className = on ? 'on' : 'off'; li.textContent = { mcp: 'Web MCP', tcp: 'SSH / VNC', fetch: 'Fetch' }[m] + (on ? ' on' : ' off');
      ul.appendChild(li);
    });
  }

  function renderEnds() {
    var c = current(), box = $('ends'); box.textContent = '';
    var host = $('tHost').value.trim(), port = $('tPort').value.trim();
    var rows = [
      ['Web MCP (WebSocket)', R.wsUrl(c)],
      ['Web MCP for Grok (POST)', R.mcpUrl(c)],
      ['SSH / VNC (WebSocket)', R.tcpUrl(c, host, port)],
      ['Fetch (POST JSON)', R.fetchUrl(c)],
      ['Health (GET)', R.healthUrl(c)]
    ];
    rows.forEach(function (r) {
      var d = document.createElement('div'); d.className = 'end';
      var b = document.createElement('b'); b.textContent = r[0];
      var row = document.createElement('div'); row.className = 'row';
      var u = document.createElement('span'); u.className = 'url'; u.textContent = showToken ? r[1] : R.mask(r[1], c.token);
      row.appendChild(u); row.appendChild(copyBtn(function () { return r[1]; }));
      d.appendChild(b); d.appendChild(row); box.appendChild(d);
    });
  }

  function renderSaved() {
    var s = store && R.load(store);
    $('savedInfo').textContent = s ? 'Saved: ' + s.url + (s.token ? ' with a token' : '') + (s.savedAt ? ' (' + new Date(s.savedAt).toLocaleString() + ')' : '') : 'Nothing saved yet.';
  }

  function save() {
    if (!store) { setStatus('blocked', 'This browser blocks storage, so the address cannot be saved.'); return; }
    try { var s = R.save(store, { url: $('url').value || R.DEFAULT_URL, token: $('token').value.trim() }); $('url').value = s.url; setStatus('', 'Saved.'); }
    catch (e) { setStatus('blocked', e.message); }
    renderSaved(); renderEnds();
  }

  function test() {
    var raw = $('url').value.trim();
    if (raw && !R.normalizeUrl(raw)) { setStatus('blocked', 'Enter a relay address like ' + R.DEFAULT_URL); return; }
    var c = current(), bad = R.tokenProblem(c.token);
    if (bad) { setStatus('auth', bad); return; }
    if (R.mixedContent(location.protocol, c)) { var m = R.classify({ mixed: true }); setStatus(m.state, m.text); return; }
    setStatus('', 'Testing ' + R.healthUrl(c) + ' …');
    var ctl = window.AbortController ? new AbortController() : null, timedOut = false;
    var timer = setTimeout(function () { timedOut = true; if (ctl) ctl.abort(); }, 6000);
    fetch(R.healthUrl(c), { headers: R.authHeaders(c), cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (res) { return res.text().then(function (body) { return { status: res.status, body: body }; }); })
      .catch(function () { return { status: 0, timeout: timedOut }; })
      .then(function (r) { clearTimeout(timer); var v = R.classify(r); setStatus(v.state, v.text, v.modules); });
  }

  function renderAllow() {
    var ul = $('chips'); ul.textContent = '';
    [['tcp', 'TCP'], ['fetch', 'Fetch'], ['hosts', 'Host']].forEach(function (k) {
      allow[k[0]].forEach(function (v, i) {
        var li = document.createElement('li'); li.textContent = k[1] + ': ' + v;
        var x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Remove ' + v);
        x.addEventListener('click', function () { allow[k[0]].splice(i, 1); renderAllow(); });
        li.appendChild(x); ul.appendChild(li);
      });
    });
    var s = R.snippet(allow);
    $('snip').textContent = s === '{}' ? 'Add entries above to build a relay.json snippet.' : s;
  }
  function addForm(formId, inputId, list, check) {
    $(formId).addEventListener('submit', function (e) {
      e.preventDefault();
      var r = check($(inputId).value);
      if (!r.ok) { $('allowErr').textContent = r.error; return; }
      $('allowErr').textContent = '';
      if (allow[list].indexOf(r.value) < 0) allow[list].push(r.value);
      $(inputId).value = ''; renderAllow();
    });
  }

  // Start
  var saved = store && R.load(store);
  $('url').value = saved ? saved.url : R.DEFAULT_URL;
  $('token').value = saved ? saved.token : '';
  $('showTok').addEventListener('click', function () {
    showToken = !showToken; $('token').type = showToken ? 'text' : 'password';
    this.textContent = showToken ? 'Hide' : 'Show'; this.setAttribute('aria-pressed', String(showToken)); renderEnds();
  });
  $('save').addEventListener('click', save);
  $('test').addEventListener('click', test);
  $('reset').addEventListener('click', function () { $('url').value = R.DEFAULT_URL; $('token').value = ''; renderEnds(); });
  ['url', 'token', 'tHost', 'tPort'].forEach(function (id) { $(id).addEventListener('input', renderEnds); });
  document.querySelectorAll('.cmd pre').forEach(function (pre) { var b = copyBtn(function () { return pre.textContent; }); pre.parentNode.insertBefore(b, pre.nextSibling); });
  addForm('fTcp', 'iTcp', 'tcp', R.checkTcp);
  addForm('fFetch', 'iFetch', 'fetch', R.checkOrigin);
  addForm('fHost', 'iHost', 'hosts', R.checkHost);
  $('copySnip').addEventListener('click', function () { copy(R.snippet(allow), this); });
  $('clrAllow').addEventListener('click', function () { allow = { tcp: [], fetch: [], hosts: [] }; $('allowErr').textContent = ''; renderAllow(); });
  // Suggest the relay's own hostname for PUBLIC_HOSTS when it is not loopback.
  try { var h = new URL(current().url).hostname; if (!R.isLoopback(h)) $('iHost').value = h; } catch (_) { /* ignore */ }
  renderSaved(); renderEnds(); renderAllow();
})();
