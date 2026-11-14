/* Agent — tests/ag44.test.cjs: AG44 remote MCP client.
   Node only: mocked fetch, no browser, no network, no paid API. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { execFileSync } = require('node:child_process');
const base = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');

function reply(status, body, headers) {
  const h = {};
  Object.keys(headers || {}).forEach(k => { h[k.toLowerCase()] = headers[k]; });
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status: status,
    headers: { get(name) { return h[String(name).toLowerCase()] || ''; } },
    text: async () => text
  };
}

function boot(fetchImpl, extra) {
  const mem = Object.assign({}, extra || {});
  const localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem(k, v) { mem[k] = String(v); }
  };
  const ctx = {
    HR: {}, localStorage, fetch: fetchImpl, AbortController, TextDecoder, TextEncoder, URL, console,
    setTimeout, clearTimeout, JSON, Math, Date, Object, Array, String, Number, Error, Promise, RegExp, parseInt, isNaN
  };
  vm.createContext(ctx);
  vm.runInContext(read('app/core/tools.js'), ctx, { filename: 'tools.js' });
  vm.runInContext(read('app/core/mcp.js'), ctx, { filename: 'mcp.js' });
  ctx.mem = mem;
  return ctx;
}

test('syntax, shell version, settings card and no local stdio bridge', () => {
  for (const f of ['app/core/mcp.js', 'app/gui/mcpset.js', 'app/core/tools.js', 'app/gui/approve.js', 'app/main.js', 'agent_sw.js'])
    execFileSync(process.execPath, ['--check', path.join(base, f)]);
  const html = read('agent.html'), sw = read('agent_sw.js'), mcp = read('app/core/mcp.js');
  assert.ok(html.indexOf('src="app/core/tools.js"') < html.indexOf('src="app/core/mcp.js"'));
  assert.ok(html.indexOf('src="app/gui/mcpset.js"') < html.indexOf('src="app/main.js"'));
  assert.match(html, /id="sc_mcp"/);
  assert.match(html, /id="mcpDlg"/);
  assert.match(html, /id="btnMcpRefresh"/);
  assert.match(sw, /VER = 'agent-ag45'/);
  assert.match(sw, /AG45 Legacy: VER = 'agent-ag44'/);
  assert.match(sw, /AG44 Legacy: VER = 'agent-ag42'/);
  assert.match(sw, /app\/core\/mcp\.js/);
  assert.match(sw, /app\/gui\/mcpset\.js/);
  assert.match(read('app/gui/mcpset.js'), /HR\.confirm\(/);
  const liveMcp = mcp.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
  assert.equal(/child_process|stdio|WebSocket|new Worker/.test(liveMcp), false);
  assert.match(read('agent_readme.md'), /## AG44 — Remote MCP servers/);
  assert.match(read('../../../hub/docs/README_technical_team2.txt'), /### 1\.99 AG44 Agent MCP/);
});

test('tool names are sanitized and tool text is capped', () => {
  const ctx = boot(async () => { throw new Error('no fetch'); });
  assert.equal(ctx.HR.mcp.toolName('Web MCP', 'read file'), 'web_mcp__read_file');
  assert.equal(ctx.HR.mcp.toolName('!!!', '???'), 'mcp__tool');
  const long = ctx.HR.mcp.toolName('Server ' + 'S'.repeat(80), 'T'.repeat(90));
  assert.ok(long.length <= 64, long);
  assert.match(long, /^[a-zA-Z0-9_-]+$/);
  assert.ok(long.indexOf('__') > 0);
  const big = ctx.HR.mcp.textOf('x'.repeat(9000));
  assert.equal(big.slice(0, 8000), 'x'.repeat(8000));
  assert.ok(big.indexOf('\n…[truncated]') === 8000);
  assert.equal(ctx.HR.mcp.textOf({ content: [{ type: 'text', text: 'nope' }], isError: true }), 'Error: nope');
  assert.equal(ctx.HR.mcp.textOf({ isError: true, content: [] }), 'Error');
  assert.equal(ctx.HR.mcp.textOf('not json {'), 'not json {');
});

test('initialize, paged tools/list, text and SSE tools/call, disabled server skipped', async () => {
  const calls = [];
  const pages = [
    { tools: [{ name: 'read file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }], nextCursor: 'p2' },
    { tools: [
      { name: 'list', description: 'List files', inputSchema: { type: 'object', properties: {} } },
      { name: 'read_file', description: 'Same letters', inputSchema: { type: 'object' } },
      { name: 'boom', description: 'Fails', inputSchema: { type: 'object' } }
    ] }
  ];
  function fetchImpl(url, opt) {
    const body = JSON.parse(opt.body);
    calls.push({ url: String(url), headers: Object.assign({}, opt.headers), body: body });
    if (String(url).indexOf('/off') >= 0) throw new Error('disabled server was called');
    if (opt.signal && opt.signal.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
    if (String(url).indexOf('/bad') >= 0) return Promise.resolve(reply(200, 'NOT JSON', { 'content-type': 'application/json' }));
    if (body.method === 'initialize') {
      assert.equal(body.params.protocolVersion, '2025-06-18');
      assert.equal(body.params.clientInfo.name, 'Agent');
      return Promise.resolve(reply(200, {
        jsonrpc: '2.0', id: body.id,
        result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'web-mcp', version: '1.1.1' } }
      }, { 'content-type': 'application/json', 'mcp-session-id': 'sess-1' }));
    }
    if (body.method === 'notifications/initialized') {
      assert.equal(body.id, undefined);
      return Promise.resolve(reply(202, ''));
    }
    if (body.method === 'tools/list') {
      const page = body.params && body.params.cursor === 'p2' ? pages[1] : pages[0];
      return Promise.resolve(reply(200, { jsonrpc: '2.0', id: body.id, result: page }, { 'content-type': 'application/json', 'mcp-session-id': 'sess-1' }));
    }
    if (body.method === 'tools/call' && body.params.name === 'read file') {
      return Promise.resolve(reply(200, {
        jsonrpc: '2.0', id: body.id,
        result: { content: [{ type: 'text', text: 'hello' }, { type: 'text', text: 'world' }], isError: false }
      }, { 'content-type': 'application/json' }));
    }
    if (body.method === 'tools/call' && body.params.name === 'list') {
      const result = { content: [{ type: 'text', text: 'from-sse' }, { type: 'image', mimeType: 'image/png' }, { type: 'resource', resource: { uri: 'file://a' } }], isError: false };
      const sse = 'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\n'
        + 'event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: body.id, result: result }) + '\n\n';
      return Promise.resolve(reply(200, sse, { 'content-type': 'text/event-stream' }));
    }
    if (body.method === 'tools/call' && body.params.name === 'boom') {
      return Promise.resolve(reply(200, { jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'nope' }], isError: true } }, { 'content-type': 'application/json' }));
    }
    return Promise.resolve(reply(500, { jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'nope' } }));
  }
  const ctx = boot(fetchImpl);
  ctx.localStorage.setItem('agent.mcp', JSON.stringify([
    { id: 'up', name: 'Web MCP', url: 'https://mcp.example/up', key: 'secret', on: true, always: false },
    { id: 'off', name: 'Off box', url: 'https://mcp.example/off', on: false },
    { id: 'bad', name: 'Bad', url: 'https://mcp.example/bad', on: true }
  ]));
  const rows = await ctx.HR.mcp.sync();
  const up = calls.filter(c => c.url.indexOf('/up') >= 0);
  assert.deepEqual(up.map(c => c.body.method), ['initialize', 'notifications/initialized', 'tools/list', 'tools/list']);
  assert.equal(up[0].headers.Accept, 'application/json, text/event-stream');
  assert.equal(up[0].headers.Authorization, 'Bearer secret');
  assert.equal(up[0].headers['Mcp-Session-Id'], undefined);
  assert.equal(up[1].headers['Mcp-Session-Id'], 'sess-1');
  assert.equal(up[2].headers['MCP-Protocol-Version'], '2025-06-18');
  assert.equal(up[2].body.params.cursor, undefined);
  assert.equal(up[3].body.params.cursor, 'p2');
  assert.equal(calls.some(c => c.url.indexOf('/off') >= 0), false);
  const off = rows.find(r => r.id === 'off');
  assert.equal(off.state, 'off');
  assert.equal(off.tools.length, 0);
  const bad = rows.find(r => r.id === 'bad');
  assert.equal(bad.state, 'err');
  assert.match(bad.reason, /Bad response/);
  const names = ctx.HR.tools.names().filter(n => n.indexOf('web_mcp__') === 0).sort();
  assert.deepEqual(names, ['web_mcp__boom', 'web_mcp__list', 'web_mcp__read_file', 'web_mcp__read_file_2']);
  const sch = ctx.HR.tools.schemas().find(s => s.function.name === 'web_mcp__read_file');
  assert.equal(sch.function.description.indexOf('Web MCP:'), 0);
  assert.equal(sch.function.parameters.properties.path.type, 'string');
  assert.equal(sch.function.description.indexOf('secret'), -1);
  const connected = rows.find(r => r.id === 'up');
  assert.equal(connected.state, 'ok');
  assert.equal(connected.tools.length, 4);

  const denied = await ctx.HR.tools.run('web_mcp__read_file', { path: 'a.txt' }, { approve: () => false });
  assert.equal(denied, 'User denied');
  assert.equal(calls.filter(c => c.body.method === 'tools/call').length, 0);

  const seen = [];
  const text = await ctx.HR.tools.run('web_mcp__read_file', { path: 'a.txt' }, {
    approve(info) { seen.push(info); return true; }
  });
  assert.equal(text, 'hello\nworld');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].kind, 'mcp');
  assert.equal(seen[0].server, 'Web MCP');
  assert.equal(seen[0].tool, 'read file');
  assert.deepEqual(seen[0].args, { path: 'a.txt' });
  const call = calls.filter(c => c.body.method === 'tools/call').pop();
  assert.equal(call.body.params.name, 'read file');
  assert.deepEqual(call.body.params.arguments, { path: 'a.txt' });
  assert.equal(call.headers['Mcp-Session-Id'], 'sess-1');

  ctx.HR.mcp.setAlways('up', true);
  let asked = 0;
  const sse = await ctx.HR.tools.run('web_mcp__list', {}, { approve() { asked++; return false; } });
  assert.equal(asked, 0);
  assert.match(sse, /from-sse/);
  assert.match(sse, /\[image image\/png\]/);
  assert.match(sse, /\[resource file:\/\/a\]/);
  const boom = await ctx.HR.tools.run('web_mcp__boom', {}, {});
  assert.equal(boom, 'Error: nope');

  ctx.HR.perms = { allowed: function () { return false; }, auto: function () { return false; } };
  assert.equal(ctx.HR.tools.schemas().some(s => s.function.name.indexOf('web_mcp__') === 0), false);
  await assert.rejects(() => ctx.HR.tools.run('web_mcp__list', {}, {}));
});

test('initialize falls back when the server refuses 2025-06-18, and a bad store does not throw', async () => {
  const vers = [];
  function fetchImpl(url, opt) {
    const body = JSON.parse(opt.body);
    if (body.method === 'initialize') {
      vers.push(body.params.protocolVersion);
      if (body.params.protocolVersion === '2025-06-18') {
        return Promise.resolve(reply(200, { jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Unsupported protocol version' } }, { 'content-type': 'application/json' }));
      }
      return Promise.resolve(reply(200, {
        jsonrpc: '2.0', id: body.id,
        result: { protocolVersion: body.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'old', version: '0' } }
      }, { 'content-type': 'application/json', 'mcp-session-id': 's2' }));
    }
    if (body.method === 'notifications/initialized') return Promise.resolve(reply(202, ''));
    if (body.method === 'tools/list') {
      assert.equal(opt.headers['Mcp-Session-Id'], 's2');
      assert.equal(opt.headers['MCP-Protocol-Version'], '2025-03-26');
      return Promise.resolve(reply(200, { jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'ping', description: 'p', inputSchema: { type: 'object' } }] } }, { 'content-type': 'application/json' }));
    }
    throw new Error('unexpected ' + body.method);
  }
  const ctx = boot(fetchImpl);
  ctx.HR.mcp.upsert({ id: 'old', name: 'Old', url: 'https://mcp.example/old', on: true });
  const rows = await ctx.HR.mcp.sync();
  assert.deepEqual(vers, ['2025-06-18', '2025-03-26']);
  assert.equal(rows[0].state, 'ok');
  assert.equal(ctx.HR.tools.schemas()[0].function.name, 'old__ping');

  const dead = boot(async () => { throw new Error('should not fetch'); }, { 'agent.mcp': '{' });
  const none = await dead.HR.mcp.sync();
  assert.deepEqual(none, []);
});
