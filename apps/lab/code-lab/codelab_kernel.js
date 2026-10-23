/* Code Lab — server + kernel layer. Uses the official @jupyterlab/services (window.CodeLabLib) only;
   no hand-rolled websockets. Exposes window.CodeLabKernel. */
(function () {
  'use strict';
  const L = window.CodeLabLib;
  let settings = null, km = null, kernel = null, specs = null;
  const listeners = new Set();
  function emit() { listeners.forEach((f) => { try { f(api.state()); } catch (_) { /* */ } }); }

  function norm(url) {
    url = String(url || '').trim();
    if (!url) throw new Error('Enter the server URL');
    if (!/^https?:\/\//i.test(url)) url = (/^(localhost|127\.|\[::1\])/.test(url) ? 'http://' : 'https://') + url;
    return url.replace(/\/+$/, '') + '/'; /* trailing slashes stripped, one added for the library */
  }

  /* Every request (ping included) goes through makeRequest with the token-carrying settings, which adds
     "Authorization: token <t>" itself (adding it here too would send it twice and get rejected); appendToken:true
     adds ?token= to the kernel websockets. Jupyter answers a tokenless request from a non-allowed origin with 404,
     so nothing here is ever sent without the token. */
  async function req(s, token, path) {
    try { return await L.ServerConnection.makeRequest(s.baseUrl + path, { cache: 'no-store' }, s); }
    catch (e) { return null; } /* network / CORS failure */
  }

  /* ---- connection health ----
     link: 'ok' | 'reconnecting' (kernel websocket dropped, library is retrying) | 'lost' (gave up / server unreachable).
     Running executes are rejected with err.abort = 'link' | 'lost' | 'kernel' | <caller reason> so the UI never waits forever. */
  let creds = null, link = 'ok', reason = '', back = false, pollT = null, downT = null, pollFail = 0;
  const pend = new Set();
  const abortAll = (why) => { pend.forEach((f) => f(why)); };
  const POLL_MS = 8000, DOWN_MS = 10000, REQ_TIMEOUT = 6000;

  function isNet(e) { return !!e && (e.name === 'NetworkError' || e instanceof TypeError || /network|failed to fetch|load failed/i.test(String(e.message || ''))); }

  function dropKernel() { if (kernel) { try { kernel.dispose(); } catch (_) { /* */ } } kernel = null; }

  function markLost(why) {
    if (link === 'lost') return;
    link = 'lost'; reason = why || 'Connection lost'; back = false; clearTimeout(downT); downT = null;
    abortAll('lost'); dropKernel(); emit(); startPoll();
  }

  /* every few seconds: is the server reachable, and is our kernel still there? (also catches a hung network that never closes the websocket) */
  function startPoll() {
    stopPoll();
    pollT = setInterval(async () => {
      if (!settings) return;
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const to = ctl && setTimeout(() => ctl.abort(), REQ_TIMEOUT);
      let r = null;
      try { r = await L.ServerConnection.makeRequest(settings.baseUrl + 'api/kernels', { cache: 'no-store', signal: ctl && ctl.signal }, settings); } catch (_) { r = null; }
      clearTimeout(to);
      if (!settings) return;
      const ok = !!r && r.ok;
      if (link === 'lost') { if (ok && !back) { back = true; emit(); } return; }
      if (!ok) { if (++pollFail >= 2) markLost(r ? 'Server error HTTP ' + r.status : 'Server not reachable'); return; }
      pollFail = 0;
      if (kernel) {
        let list = null; try { list = await r.json(); } catch (_) { /* */ }
        if (list && Array.isArray(list) && kernel && !list.some((m) => m.id === kernel.id)) {
          abortAll('gone'); dropKernel(); gone = true; emit();
        }
      }
    }, POLL_MS);
  }
  function stopPoll() { if (pollT) clearInterval(pollT); pollT = null; clearTimeout(downT); downT = null; pollFail = 0; }
  let gone = false;

  async function connect(url, token) {
    token = String(token || '').trim();
    const baseUrl = norm(url);
    const wsUrl = baseUrl.replace(/^http/i, 'ws');
    const s = L.ServerConnection.makeSettings({ baseUrl, wsUrl, token, appendToken: true,
      init: { cache: 'no-store', credentials: 'omit' } });
    const ping = await req(s, token, 'api');
    if (!ping) throw new Error('Cannot reach server (offline, wrong URL, or this site is not in allow_origin)');
    if (ping.status === 401 || ping.status === 403) throw new Error('Wrong token (HTTP ' + ping.status + ')');
    if (ping.status === 404) throw new Error('Not found (HTTP 404): check the URL / base path, or the token and allow_origin');
    if (!ping.ok) throw new Error('Server error HTTP ' + ping.status);
    const res = await req(s, token, 'api/kernelspecs');
    /* server answered the ping, so a failed/CORS-less kernelspecs call means the token was rejected */
    if (!res || res.status === 401 || res.status === 403) throw new Error('Wrong token' + (res ? ' (HTTP ' + res.status + ')' : ' (server rejected it)'));
    if (res.status === 404) throw new Error('Not found (HTTP 404): check the URL / base path');
    if (!res.ok) throw new Error('Server error HTTP ' + res.status);
    let data = null; try { data = await res.json(); } catch (_) { /* */ }
    if (!data || !data.kernelspecs) throw new Error('Not a Jupyter Server');
    await disconnect({ shutdown: false }); /* only now: a failed Reconnect leaves the 'lost' state intact */
    settings = s; specs = data; creds = { url, token }; link = 'ok'; reason = ''; back = false; gone = false;
    km = new L.KernelManager({ serverSettings: s });
    startPoll();
    emit();
    return data;
  }

  /* disconnect from the server. shutdown:true also shuts the kernel down on the server (the app started it);
     false just closes our connection and leaves it running so a later Connect can reattach. */
  async function disconnect(opt) {
    const kill = !!(opt && opt.shutdown);
    stopPoll(); abortAll('disconnect');
    let err = null;
    if (kernel) {
      if (kill) { try { await kernel.shutdown(); } catch (e) { err = e; } }
      try { kernel.dispose(); } catch (_) { /* */ }
    }
    if (km) { try { km.dispose(); } catch (_) { /* */ } }
    kernel = null; km = null; settings = null; specs = null; creds = null; link = 'ok'; reason = ''; back = false; gone = false; emit();
    if (err) throw err;
  }

  /* update_display_data for a display made in an EARLIER cell is routed by the services library to that older (finished) request, so the running
     request never sees it. The kernel-level iopubMessage signal does see it; both paths go through once() so each message is handled one time. */
  const seenUpd = []; 
  function once(msg) { const id = msg.header.msg_id; if (seenUpd.indexOf(id) >= 0) return false; seenUpd.push(id); if (seenUpd.length > 200) seenUpd.shift(); return true; }
  function updOut(msg) { const c = msg.content; return { output_type: 'display_data', data: c.data || {}, display_id: c.transient && c.transient.display_id || undefined, update: true }; }

  function wire(k) {
    k.iopubMessage.connect((_, msg) => {
      if (k !== kernel || msg.header.msg_type !== 'update_display_data') return;
      setTimeout(() => { if (once(msg) && api.onDisplayUpdate) api.onDisplayUpdate(updOut(msg)); }, 0); /* after the running request had its chance */
    });
    k.statusChanged.connect(() => {
      if (k !== kernel) return;
      if (k.status === 'dead' || k.status === 'restarting' || k.status === 'autorestarting') abortAll(k.status === 'dead' ? 'dead' : 'restarted');
      emit();
    });
    k.connectionStatusChanged.connect((_, st) => {
      if (k !== kernel) return;
      if (st === 'connected') { if (link === 'reconnecting') { link = 'ok'; clearTimeout(downT); downT = null; } emit(); return; }
      if (link === 'ok') {
        link = 'reconnecting'; abortAll('link'); emit();
        downT = setTimeout(() => { if (link === 'reconnecting') markLost('Lost connection to the kernel'); }, DOWN_MS);
      }
      emit();
    });
  }

  /* reconnect to a kernel this app started earlier (id remembered by the app). Resolves with the kernel, or null if it is gone. */
  async function attach(id) {
    if (!km || !settings || !id) return null;
    let list = null;
    try { const r = await req(settings, '', 'api/kernels'); if (r && r.ok) list = await r.json(); } catch (_) { /* */ }
    const m = Array.isArray(list) && list.find((x) => x && x.id === id);
    if (!m) return null;
    let k = null;
    try {
      k = km.connectTo({ model: m }); kernel = k; wire(k);
      await Promise.race([k.info, new Promise((_, rej) => setTimeout(() => rej(new Error('kernel did not answer')), 8000))]);
    } catch (_) { if (kernel === k) kernel = null; try { k && k.dispose(); } catch (__) { /* */ } emit(); return null; }
    gone = false; emit();
    return k;
  }

  async function start(name) {
    if (!km) throw new Error('Not connected');
    if (link === 'lost') throw new Error('Connection lost: press Reconnect');
    if (kernel) { const old = kernel; kernel = null; try { await old.shutdown(); } catch (_) { /* gone already */ } try { old.dispose(); } catch (_) { /* */ } }
    try { kernel = await km.startNew({ name }); } catch (e) { if (isNet(e)) markLost('Request failed: server not reachable'); throw e; }
    gone = false; wire(kernel); emit();
    return kernel;
  }

  async function restart() {
    if (!kernel) throw new Error('No kernel');
    await kernel.restart(); /* a failed request is only reported by the caller (toast); the health poll decides if the link is lost */
    emit();
  }
  async function interrupt() {
    if (!kernel) throw new Error('No kernel');
    await kernel.interrupt(); /* a failed request is only reported by the caller (toast); the health poll decides if the link is lost */
  }

  /* run code; onMsg(kind, payload) gets 'output' (nbformat-like output object), 'clear', 'count'. Resolves with reply status.
     ctl (optional) receives ctl.abort(why) to stop waiting (used for the run timeout). Rejects with err.abort set when the
     wait was cut short: 'lost' | 'link' | 'dead' | 'restarted' | 'gone' | 'disconnect' | <ctl.abort reason>. */
  async function execute(code, onMsg, ctl) {
    const fail = (why) => Object.assign(new Error(why === 'lost' || why === 'link' ? 'Connection to the server was lost' : 'Stopped: ' + why), { abort: why });
    if (link !== 'ok') throw fail(link === 'lost' ? 'lost' : 'link');
    if (!kernel) throw new Error('Start a kernel first');
    const fut = kernel.requestExecute({ code, stop_on_error: true, allow_stdin: false });
    fut.onIOPub = (msg) => {
      const t = msg.header.msg_type, c = msg.content;
      if (t === 'stream') onMsg('output', { output_type: 'stream', name: c.name, text: c.text });
      else if (t === 'update_display_data') { if (once(msg)) onMsg('output', updOut(msg)); } /* same display_id = update that display in place */
      else if (t === 'execute_result' || t === 'display_data') {
        const did = c.transient && c.transient.display_id;
        onMsg('output', { output_type: t, data: c.data || {}, execution_count: c.execution_count, display_id: did || undefined });
      } else if (t === 'error') onMsg('output', { output_type: 'error', ename: c.ename, evalue: c.evalue, traceback: c.traceback || [] });
      else if (t === 'execute_input') onMsg('count', c.execution_count);
      else if (t === 'clear_output') onMsg('clear', c.wait);
    };
    let rej; const aborted = new Promise((_, r) => { rej = (why) => r(fail(why)); });
    pend.add(rej); if (ctl) ctl.abort = rej;
    fut.done.catch(() => {}); /* a canceled future must not become an unhandled rejection */
    try {
      const reply = await Promise.race([fut.done, aborted]);
      const rc = reply && reply.content || {};
      if (rc.execution_count != null) onMsg('count', rc.execution_count);
      return rc.status || 'ok';
    } catch (e) {
      if (e && e.abort) throw e;
      /* the library cancels futures when the kernel restarts or the socket closes */
      if (/Canceled future/i.test(String(e && e.message))) throw fail(link === 'ok' ? 'restarted' : 'link');
      throw e;
    } finally { pend.delete(rej); if (ctl) ctl.abort = null; }
  }

  const api = {
    onDisplayUpdate: null, /* app sets: (output) => void, for updates to displays of earlier cells */
    connect, disconnect, start, restart, interrupt, execute,
    attach, onChange(f) { listeners.add(f); },
    state() {
      return {
        connected: !!settings && link !== 'lost', specs, baseUrl: settings && settings.baseUrl || '',
        link, lost: link === 'lost', reconnecting: link === 'reconnecting', reason, serverBack: back, kernelGone: gone,
        kernel: kernel ? { name: kernel.name, id: kernel.id, status: kernel.status, conn: kernel.connectionStatus } : null
      };
    }
  };
  window.CodeLabKernel = api;
})();
