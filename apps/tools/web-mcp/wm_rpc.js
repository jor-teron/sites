/* Web MCP — wm_rpc.js: MCP JSON-RPC dispatch (initialize, ping, tools/list, tools/call). MCP2 */
(function (root) {
  'use strict';

  /* Config and tool helpers, from the global or via require() in tests. */
  var C = root.WM_CONFIG || (typeof require === 'function' ? require('./wm_config.js') : {});
  var T = root.WMTools || (typeof require === 'function' ? require('./wm_tools.js') : {});

  /**
   * Build a JSON-RPC 2.0 success envelope.
   */
  function rpcResult(id, result) {
    return { jsonrpc: '2.0', id: id, result: result };
  }

  /**
   * Build a JSON-RPC 2.0 error envelope. data is optional.
   */
  function rpcError(id, code, message, data) {
    var err = { code: code, message: message };
    if (data !== undefined) err.data = data;
    return { jsonrpc: '2.0', id: id, error: err };
  }

  /**
   * Handle initialize: echo a supported protocolVersion, or the configured default.
   */
  function handleInitialize(params) {
    var requested = params && params.protocolVersion;
    var supported = C.PROTOCOL_VERSIONS || [];
    var version = supported.indexOf(requested) >= 0 ? requested : C.DEFAULT_PROTOCOL_VERSION;
    return {
      protocolVersion: version,
      capabilities: { tools: {} },
      serverInfo: { name: C.SERVER_NAME, version: C.SERVER_VERSION },
      instructions:
        'Browser MCP file tools and BusyBox run_command. Paths stay inside the folder picked in the Web MCP tab. ' +
        'run_command has no sh -c and no network. The tab must stay open. If you see a permission error, click Allow in Web MCP.'
    };
  }

  /**
   * Dispatch one JSON-RPC request. tools is the map from createTools (or a fake).
   * Returns a promise of { notification, reply, log }.
   * notification means the caller should not send a body (HTTP 202).
   * log, when present, describes a tools/call for the live UI log.
   */
  async function dispatch(msg, tools) {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
      return { notification: false, reply: rpcError(null, -32600, 'Invalid Request'), log: null };
    }
    if (msg.jsonrpc !== '2.0') {
      return { notification: false, reply: rpcError(msg.id, -32600, 'Invalid Request'), log: null };
    }
    var method = msg.method;
    if (!method || typeof method !== 'string') {
      return { notification: false, reply: rpcError(msg.id, -32600, 'Invalid Request'), log: null };
    }
    /* JSON-RPC notifications have no id and must not get a response body. */
    var isNotif = !Object.prototype.hasOwnProperty.call(msg, 'id');
    var reqId = isNotif ? null : msg.id;
    var params = msg.params == null ? {} : msg.params;

    try {
      if (method === 'initialize') {
        var init = handleInitialize(params);
        if (isNotif) return { notification: true, reply: null, log: null };
        return { notification: false, reply: rpcResult(reqId, init), log: null };
      }
      if (method === 'ping') {
        if (isNotif) return { notification: true, reply: null, log: null };
        return { notification: false, reply: rpcResult(reqId, {}), log: null };
      }
      if (method === 'notifications/initialized') {
        return { notification: true, reply: null, log: null };
      }
      if (method === 'tools/list') {
        if (isNotif) return { notification: true, reply: null, log: null };
        return { notification: false, reply: rpcResult(reqId, { tools: T.toolDefs() }), log: null };
      }
      if (method === 'tools/call') {
        var called = await handleToolsCall(params, tools);
        if (isNotif) return { notification: true, reply: null, log: called.log };
        return { notification: false, reply: rpcResult(reqId, called.result), log: called.log };
      }
      if (isNotif) return { notification: true, reply: null, log: null };
      return { notification: false, reply: rpcError(reqId, -32601, 'Method not found'), log: null };
    } catch (err) {
      if (isNotif) return { notification: true, reply: null, log: null };
      var message = err && err.message ? String(err.message) : 'Internal error';
      /* Value-like errors are invalid params; anything else is internal. */
      var code = /required|must be|invalid/i.test(message) ? -32602 : -32603;
      return { notification: false, reply: rpcError(reqId, code, message), log: null };
    }
  }

  /**
   * Run one tools/call and shape the MCP content result plus a log row.
   */
  async function handleToolsCall(params, tools) {
    if (!params || typeof params !== 'object') {
      throw new Error('params must be an object');
    }
    var name = params.name;
    var args = params.arguments == null ? {} : params.arguments;
    if (!name || typeof name !== 'string') {
      throw new Error('tool name is required');
    }
    if (typeof args !== 'object' || Array.isArray(args)) {
      throw new Error('arguments must be an object');
    }
    /* Started-at timestamp so the log can show duration in milliseconds. */
    var started = Date.now();
    var pathHint = T.argPath(args);
    var fn = tools && tools[name];
    if (!fn) {
      return {
        result: { content: [{ type: 'text', text: 'Unknown tool: ' + name }], isError: true },
        log: { name: name, path: pathHint, ok: false, ms: Date.now() - started, error: 'unknown tool' }
      };
    }
    try {
      var raw = await fn(args);
      var text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
      return {
        result: { content: [{ type: 'text', text: text }], isError: false },
        log: { name: name, path: pathHint, ok: true, ms: Date.now() - started, error: '' }
      };
    } catch (err) {
      var errText = err && err.message ? String(err.message) : String(err);
      return {
        result: { content: [{ type: 'text', text: 'Error: ' + errText }], isError: true },
        log: { name: name, path: pathHint, ok: false, ms: Date.now() - started, error: errText }
      };
    }
  }

  /* Public API, also exported for Node tests. */
  var api = {
    rpcResult: rpcResult,
    rpcError: rpcError,
    handleInitialize: handleInitialize,
    dispatch: dispatch
  };
  root.WMRpc = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
