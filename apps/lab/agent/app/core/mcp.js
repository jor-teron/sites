/* Agent — app/core/mcp.js: remote MCP client (AG44). HR.mcp.
   Streamable HTTP only: one JSON-RPC 2.0 message per fetch POST. No stdio, no WebSocket, no helper bridge.
   Accept is application/json, text/event-stream. A JSON body or an SSE body (data: lines) both count.
   Mcp-Session-Id from the server is sent back on later posts. Protocol starts at 2025-06-18 and, if that
   initialize is refused, tries 2025-03-26 then 2024-11-05. An optional bearer key is Authorization: Bearer.
   Steps: initialize -> notifications/initialized -> tools/list (follows nextCursor) -> tools/call.
   tools/call content becomes one string: text parts joined, images and resources noted briefly
   (resource text is kept, then the whole string is cut at 8000 chars). isError becomes error text.
   Every JSON.parse goes through parseJson, which returns null instead of throwing.
   Sync registers each tool on HR.tools as <serverslug>__<toolname> ([a-zA-Z0-9_-], max 64).
   The description starts with the server name. parameters is the tool inputSchema.
   available() is true only while that server is on and this sync connected. HR.perms.allowed still applies
   inside HR.tools (same as built-ins). A server that is off, or that cannot be reached, is skipped:
   status is kept for Settings, and nothing is raised into the chat.
   Storage: localStorage 'agent.mcp' (array of {id, name, url, key, on, always}). The key stays on this device. */
HR.mcp = (function () {
  var KEY = 'agent.mcp', CAP = 8000, MAX_TOOLS = 64, MAX_PAGES = 8;
  var PROTO = ['2025-06-18', '2025-03-26', '2024-11-05'];
  var nextId = 1, gen = 0, status = {}, subs = [];

  function parseJson(text) {
    if (text == null) return null;
    var s = String(text).replace(/^\uFEFF/, '').trim();
    if (!s) return null;
    try { return JSON.parse(s); } catch (e) { return null; }
  }
  function clip(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n) : s;
  }
  function oneLine(s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function capText(s) {
    s = String(s == null ? '' : s);
    if (s.length <= CAP) return s;
    return s.slice(0, CAP) + '\n…[truncated]';
  }
  function piece(s, fallback) {
    var t = String(s || '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    return t || fallback;
  }
  /* Server slug is lowercased so "Web MCP" and "web mcp" share one prefix. The tool name keeps its case. */
  function toolName(server, tool) {
    var slug = piece(server, 'mcp').toLowerCase(), name = piece(tool, 'tool'), full = slug + '__' + name;
    if (full.length <= 64) return full;
    var slugLen = Math.min(slug.length, 24), nameLen = 64 - 2 - slugLen;
    if (nameLen > name.length) { nameLen = name.length; slugLen = Math.min(slug.length, 64 - 2 - nameLen); }
    if (slugLen < 1) slugLen = 1;
    if (nameLen < 1) { nameLen = 1; slugLen = Math.min(slug.length, 62); }
    full = slug.slice(0, slugLen) + '__' + name.slice(0, nameLen);
    return full.length > 64 ? full.slice(0, 64) : full;
  }
  function unique(base, used) {
    var n = base.slice(0, 64), i, suf, n2;
    if (!used[n]) return n;
    for (i = 2; i < 100; i++) {
      suf = '_' + i;
      n2 = base.slice(0, 64 - suf.length) + suf;
      if (!used[n2]) return n2;
    }
    return n;
  }
  function flag(v, def) {
    if (v === true || v === 'on' || v === 1) return true;
    if (v === false || v === 'off' || v === 0) return false;
    return def;
  }
  function norm(s) {
    s = s || {};
    var url = String(s.url || '').trim();
    if (url.length > 2000) url = url.slice(0, 2000);
    return {
      id: String(s.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40),
      name: oneLine(String(s.name || '').trim() || 'MCP', 80),
      url: url,
      key: String(s.key || '').slice(0, 500),
      on: flag(s.on != null ? s.on : s.enabled, true),
      always: flag(s.always != null ? s.always : s.allow, false)
    };
  }
  function load() {
    var raw = null;
    try { raw = parseJson(localStorage.getItem(KEY) || ''); } catch (e) { raw = null; }
    var arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.servers) ? raw.servers : []);
    return arr.map(norm).filter(function (s) { return s.id; });
  }
  function persist(list) {
    var out = list.slice(0, 30).map(function (s) {
      return { id: s.id, name: s.name, url: s.url, key: s.key || '', on: !!s.on, always: !!s.always };
    });
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (e) { /* private mode: this tab only */ }
  }
  function byId(id) {
    var list = load(), i;
    for (i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function nid() { return 'm' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  function emit() { var rows = servers(); subs.forEach(function (fn) { try { fn(rows); } catch (e) {} }); }
  function servers() {
    return load().map(function (s) {
      var st = status[s.id];
      if (!st) st = { state: s.on ? 'wait' : 'off', reason: '', tools: [] };
      return { id: s.id, name: s.name, url: s.url, on: s.on, always: s.always, hasKey: !!s.key, state: st.state, reason: st.reason || '', tools: st.tools || [] };
    });
  }
  function upsert(rec) {
    var list = load(), s = norm(rec), i, found = false;
    if (!s.id) s.id = nid();
    for (i = 0; i < list.length; i++) if (list[i].id === s.id) { list[i] = s; found = true; break; }
    if (!found) list.push(s);
    persist(list);
    return s.id;
  }
  function remove(id) { persist(load().filter(function (s) { return s.id !== id; })); delete status[id]; }
  function setOn(id, on) {
    var list = load();
    list.forEach(function (s) { if (s.id === id) s.on = !!on; });
    persist(list);
  }
  function setAlways(id, always) {
    var list = load();
    list.forEach(function (s) { if (s.id === id) s.always = !!always; });
    persist(list);
    emit();
  }

  function textOf(result) {
    if (result == null) return '';
    if (typeof result === 'string') return capText(result);
    var content = result.content, parts = [], i, c, r, note;
    if (!Array.isArray(content)) {
      try { return capText(JSON.stringify(result)); } catch (e) { return ''; }
    }
    for (i = 0; i < content.length; i++) {
      c = content[i] || {};
      if (c.type === 'text' || (c.text != null && c.type !== 'image' && c.type !== 'resource' && c.type !== 'resource_link')) parts.push(String(c.text));
      else if (c.type === 'image') parts.push('[image ' + (c.mimeType || 'image') + ']');
      else if (c.type === 'resource' || c.type === 'resource_link') {
        r = c.resource || c;
        note = '[resource ' + (r.uri || r.name || r.mimeType || 'resource') + ']';
        parts.push(r.text ? note + '\n' + String(r.text) : note);
      } else parts.push('[' + (c.type || 'content') + ']');
    }
    var text = parts.join('\n');
    if (result.isError) text = text ? (text.indexOf('Error') === 0 ? text : 'Error: ' + text) : 'Error';
    return capText(text);
  }
  function header(res, name) {
    try { return (res.headers && res.headers.get && (res.headers.get(name) || '')) || ''; } catch (e) { return ''; }
  }
  function link(signal, ms) {
    var ctrl = new AbortController(), timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms);
    var on = function () { try { ctrl.abort(); } catch (e) {} };
    if (signal) {
      if (signal.aborted) ctrl.abort();
      else if (signal.addEventListener) signal.addEventListener('abort', on);
    }
    return {
      signal: ctrl.signal,
      fromUser: function () { return !!(signal && signal.aborted); },
      finish: function () {
        clearTimeout(timer);
        if (signal && signal.removeEventListener) signal.removeEventListener('abort', on);
      }
    };
  }
  function httpError(res, text) {
    var j = parseJson(text), msg = '';
    if (j && j.error) msg = typeof j.error === 'string' ? j.error : (j.error.message || '');
    if (!msg && j && j.message) msg = String(j.message);
    var e = new Error(oneLine(msg || ('HTTP ' + res.status), 180) || ('HTTP ' + res.status));
    e.status = res.status;
    e.rpc = !!(j && j.error && typeof j.error === 'object' && j.error.code != null);
    return e;
  }
  function sseData(block) {
    var lines = String(block || '').split(/\r?\n/), out = [], i, line;
    for (i = 0; i < lines.length; i++) {
      line = lines[i];
      if (line.indexOf('data:') === 0) out.push(line.slice(5).replace(/^ /, ''));
    }
    return out.join('\n');
  }
  function pick(j, id) {
    if (Array.isArray(j)) {
      var i, hit = null, m;
      for (i = 0; i < j.length; i++) {
        m = j[i];
        if (!m || typeof m !== 'object') continue;
        if (id != null && String(m.id) === String(id)) return m;
        if (m.result || m.error) hit = m;
      }
      return hit || j[j.length - 1] || null;
    }
    return j && typeof j === 'object' ? j : null;
  }
  function fromSse(text, id) {
    var msgs = [], blocks = String(text || '').split(/\r?\n\r?\n/), i, data, j;
    for (i = 0; i < blocks.length; i++) {
      data = sseData(blocks[i]);
      if (!data || data === '[DONE]') continue;
      j = parseJson(data);
      if (j) msgs.push(j);
    }
    if (!msgs.length) {
      String(text || '').split(/\r?\n/).forEach(function (line) {
        var m = line.match(/^data:\s?(.*)$/), p;
        if (!m || m[1] === '[DONE]') return;
        p = parseJson(m[1]);
        if (p) msgs.push(p);
      });
    }
    return pick(msgs, id);
  }
  function decodeMessage(text, ctype, id) {
    ctype = String(ctype || '').toLowerCase();
    if (ctype.indexOf('text/event-stream') >= 0) return fromSse(text, id);
    var j = parseJson(text);
    if (j && (ctype.indexOf('json') >= 0 || j.jsonrpc || j.result || j.error || j.id != null || Array.isArray(j))) return pick(j, id);
    if (/^\s*(?:data:|event:|id:)/.test(text)) return fromSse(text, id);
    return j ? pick(j, id) : null;
  }
  function giveUp(e) {
    if (!e) return true;
    if (e.name === 'AbortError') return true;
    if (e.status === 401 || e.status === 403 || e.status === 404) return true;
    if (e.network && !e.rpc) return true;
    return false;
  }
  async function rpc(sess, method, params, opt) {
    opt = opt || {};
    var note = !!opt.notify, id = note ? null : nextId++, body = { jsonrpc: '2.0', method: method };
    if (!note) { body.id = id; body.params = params || {}; }
    var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
    if (sess.sessionId) headers['Mcp-Session-Id'] = sess.sessionId;
    if (method !== 'initialize' && sess.protocolVersion) headers['MCP-Protocol-Version'] = sess.protocolVersion;
    if (sess.key) headers.Authorization = 'Bearer ' + sess.key;
    var ms = opt.timeout || (method === 'tools/call' ? 30000 : 20000);
    var gate = link(opt.signal, ms);
    try {
      var res;
      try {
        res = await fetch(sess.url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: gate.signal, credentials: 'omit', cache: 'no-store' });
      } catch (e) {
        if (e && e.name === 'AbortError') {
          var stopped = gate.fromUser();
          var a = new Error(stopped ? 'Stopped' : 'Timed out');
          a.name = 'AbortError';
          a.network = !stopped;
          a.timeout = !stopped;
          throw a;
        }
        var n = new Error('Can\'t reach server');
        n.network = true;
        throw n;
      }
      var text = '';
      try { text = await res.text(); } catch (e2) { text = ''; }
      var sid = header(res, 'mcp-session-id');
      if (sid) sess.sessionId = sid;
      if (note && (res.status === 200 || res.status === 202 || res.status === 204)) return { notification: true };
      if (!res.ok) throw httpError(res, text);
      if (note) return { notification: true };
      var msg = decodeMessage(text, header(res, 'content-type'), id);
      if (!msg) throw new Error('Bad response from MCP server');
      if (msg.error) {
        var err = new Error(oneLine((msg.error && msg.error.message) || 'MCP error', 180) || 'MCP error');
        err.rpc = true;
        err.code = msg.error && msg.error.code;
        err.status = res.status;
        throw err;
      }
      return msg;
    } finally { gate.finish(); }
  }
  async function handshake(sess, opt) {
    var last, i, msg, ver;
    for (i = 0; i < PROTO.length; i++) {
      sess.sessionId = '';
      sess.protocolVersion = '';
      try {
        msg = await rpc(sess, 'initialize', {
          protocolVersion: PROTO[i],
          capabilities: {},
          clientInfo: { name: 'Agent', version: 'AG44' }
        }, opt);
        ver = (msg.result && msg.result.protocolVersion) || PROTO[i];
        sess.protocolVersion = String(ver);
        try { await rpc(sess, 'notifications/initialized', null, { notify: true, signal: opt && opt.signal, timeout: opt && opt.timeout }); }
        catch (e) { if (giveUp(e)) throw e; }
        return msg.result || {};
      } catch (e2) {
        last = e2;
        if (giveUp(e2) || i === PROTO.length - 1) throw e2;
      }
    }
    throw last || new Error('Initialize failed');
  }
  async function listTools(sess, opt) {
    var all = [], cursor = '', guard = 0, msg, result, tools, i;
    do {
      msg = await rpc(sess, 'tools/list', cursor ? { cursor: cursor } : {}, opt);
      result = (msg && msg.result) || {};
      tools = Array.isArray(result.tools) ? result.tools : [];
      for (i = 0; i < tools.length && all.length < MAX_TOOLS; i++) all.push(tools[i]);
      cursor = result.nextCursor ? String(result.nextCursor) : '';
      guard++;
    } while (cursor && guard < MAX_PAGES && all.length < MAX_TOOLS);
    return all;
  }
  async function callTool(sess, name, args, opt) {
    var msg = await rpc(sess, 'tools/call', { name: name, arguments: args && typeof args === 'object' && !Array.isArray(args) ? args : {} }, opt);
    return textOf(msg && msg.result);
  }
  function schemaOf(s) {
    if (s && typeof s === 'object' && !Array.isArray(s)) return s;
    return { type: 'object', properties: {} };
  }
  async function runTool(id, remoteName, args, ctx) {
    ctx = ctx || {};
    var rec = byId(id), st = status[id];
    if (!rec || !rec.on || !st || st.state !== 'ok' || !st.sess) return 'MCP server is not connected';
    if (!rec.always) {
      var info = { kind: 'mcp', server: rec.name, tool: remoteName, args: args || {} };
      try { info.preview = JSON.stringify(args || {}, null, 2); } catch (e) { info.preview = ''; }
      var yes = false;
      try { yes = ctx.approve ? await ctx.approve(info) : false; } catch (e2) { yes = false; }
      if (!yes) return 'User denied';
    }
    try { return await callTool(st.sess, remoteName, args || {}, { signal: ctx.signal }); }
    catch (e3) {
      if (e3 && e3.name === 'AbortError' && ctx.signal && ctx.signal.aborted) throw e3;
      if (e3 && (e3.network || e3.timeout)) {
        st.state = 'err';
        st.reason = oneLine(e3.message || 'Not connected', 140);
        st.sess = null;
        emit();
      }
      return 'Error: ' + oneLine((e3 && e3.message) || 'MCP call failed', 300);
    }
  }
  async function connect(rec, opt) {
    var sess = { url: rec.url, key: rec.key || '', sessionId: '', protocolVersion: '' };
    await handshake(sess, opt);
    var raw = await listTools(sess, opt), tools = [];
    raw.forEach(function (t) { if (t && typeof t.name === 'string' && t.name) tools.push(t); });
    return {
      sess: sess,
      raw: tools,
      tools: tools.map(function (t) { return { name: t.name, description: String(t.description || '') }; })
    };
  }
  function httpUrl(url) { return /^https?:\/\//i.test(url || ''); }
  async function sync(opt) {
    var my = ++gen;
    opt = opt || {};
    var list = load(), known = {};
    list.forEach(function (s) { known[s.id] = 1; });
    Object.keys(status).forEach(function (id) { if (!known[id]) delete status[id]; });
    if (HR.tools && HR.tools.forget) HR.tools.forget(function (t) { return !!(t && t.mcp); });
    list.forEach(function (s) {
      if (!s.on) { status[s.id] = { state: 'off', reason: '', tools: [] }; return; }
      if (!httpUrl(s.url)) { status[s.id] = { state: 'err', reason: 'URL must start with http:// or https://', tools: [] }; return; }
      var prev = status[s.id];
      status[s.id] = { state: 'wait', reason: '', tools: (prev && prev.tools) || [], sess: null };
    });
    emit();
    var jobs = list.map(function (rec) {
      if (!rec.on || !httpUrl(rec.url)) return Promise.resolve(null);
      return connect(rec, opt).then(function (got) {
        if (my !== gen) return null;
        status[rec.id] = { state: 'ok', reason: '', tools: got.tools, sess: got.sess };
        return { rec: rec, tools: got.raw };
      }).catch(function (e) {
        if (my !== gen) return null;
        if (e && e.name === 'AbortError' && opt.signal && opt.signal.aborted) {
          status[rec.id] = { state: 'err', reason: 'Stopped', tools: [] };
          return null;
        }
        status[rec.id] = { state: 'err', reason: oneLine((e && e.message) || 'Not connected', 140), tools: [] };
        return null;
      });
    });
    var got = await Promise.all(jobs);
    if (my !== gen) return servers();
    var used = {};
    if (HR.tools && HR.tools.names) HR.tools.names().forEach(function (n) { used[n] = 1; });
    got.forEach(function (g) {
      if (!g) return;
      g.tools.forEach(function (tool) {
        if (!tool || !tool.name) return;
        var regName = unique(toolName(g.rec.name, tool.name), used);
        used[regName] = 1;
        HR.tools.register({
          name: regName,
          mcp: g.rec.id,
          description: oneLine((g.rec.name || 'MCP') + ': ' + (tool.description || tool.name), 500),
          parameters: schemaOf(tool.inputSchema),
          available: function () {
            var live = byId(g.rec.id), st = status[g.rec.id];
            return !!(live && live.on && st && st.state === 'ok' && st.sess);
          },
          run: function (args, ctx) { return runTool(g.rec.id, String(tool.name), args, ctx); }
        });
      });
    });
    emit();
    return servers();
  }

  return {
    sync: sync, servers: servers, get: byId, upsert: upsert, remove: remove, setOn: setOn, setAlways: setAlways,
    onChange: function (fn) { if (typeof fn === 'function') subs.push(fn); },
    toolName: toolName, textOf: textOf
  };
})();
