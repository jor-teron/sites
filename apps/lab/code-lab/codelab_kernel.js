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

  async function connect(url, token) {
    await disconnect();
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
    settings = s; specs = data;
    km = new L.KernelManager({ serverSettings: s });
    emit();
    return data;
  }

  async function disconnect() {
    if (kernel) { try { kernel.dispose(); } catch (_) { /* */ } }
    if (km) { try { km.dispose(); } catch (_) { /* */ } }
    kernel = null; km = null; settings = null; specs = null; emit();
  }

  function wire(k) {
    k.statusChanged.connect(emit);
    k.connectionStatusChanged.connect(emit);
  }

  async function start(name) {
    if (!km) throw new Error('Not connected');
    if (kernel) { const old = kernel; kernel = null; try { await old.shutdown(); } catch (_) { try { old.dispose(); } catch (__) { /* */ } } }
    kernel = await km.startNew({ name });
    wire(kernel); emit();
    return kernel;
  }

  async function restart() { if (!kernel) throw new Error('No kernel'); await kernel.restart(); emit(); }
  async function interrupt() { if (!kernel) throw new Error('No kernel'); await kernel.interrupt(); }

  /* run code; onMsg(kind, payload) gets 'output' (nbformat-like output object), 'clear', 'count'. Resolves with reply status. */
  async function execute(code, onMsg) {
    if (!kernel) throw new Error('Start a kernel first');
    const fut = kernel.requestExecute({ code, stop_on_error: true, allow_stdin: false });
    fut.onIOPub = (msg) => {
      const t = msg.header.msg_type, c = msg.content;
      if (t === 'stream') onMsg('output', { output_type: 'stream', name: c.name, text: c.text });
      else if (t === 'execute_result' || t === 'display_data' || t === 'update_display_data') {
        onMsg('output', { output_type: t === 'update_display_data' ? 'display_data' : t, data: c.data || {}, execution_count: c.execution_count });
      } else if (t === 'error') onMsg('output', { output_type: 'error', ename: c.ename, evalue: c.evalue, traceback: c.traceback || [] });
      else if (t === 'execute_input') onMsg('count', c.execution_count);
      else if (t === 'clear_output') onMsg('clear', c.wait);
    };
    const reply = await fut.done;
    const rc = reply && reply.content || {};
    if (rc.execution_count != null) onMsg('count', rc.execution_count);
    return rc.status || 'ok';
  }

  const api = {
    connect, disconnect, start, restart, interrupt, execute,
    onChange(f) { listeners.add(f); },
    state() {
      return {
        connected: !!settings, specs,
        kernel: kernel ? { name: kernel.name, id: kernel.id, status: kernel.status, conn: kernel.connectionStatus } : null
      };
    }
  };
  window.CodeLabKernel = api;
})();
