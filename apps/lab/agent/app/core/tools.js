/* Agent — app/core/tools.js: tool registry (HR2).
   HR.tools.register({name, description, parameters (JSON schema), where:'browser', available()?, run(args, ctx)}).
   ctx = {signal, approve(info) -> Promise<boolean>, step(text)}. run may return a string or any JSON value.
   schemas() -> Ollama `tools` array for the tools available right now (e.g. folder tools only when a folder is open).
   AG3: also filtered by HR.perms.allowed(name) (Settings → Permissions).
   AG44: forget(pred) drops tools the predicate accepts (remote MCP re-sync). names() is every registered name. */
HR.tools = (function () {
  var reg = {};
  function register(t) { t.where = t.where || 'browser'; reg[t.name] = t; }
  function ok(t) { return (!t.available || t.available()) && (!HR.perms || HR.perms.allowed(t.name)); }
  function list() { return Object.keys(reg).map(function (k) { return reg[k]; }).filter(ok); }
  function schemas() {
    return list().map(function (t) { return { type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters || { type: 'object', properties: {} } } }; });
  }
  function run(name, args, ctx) {
    var t = reg[name];
    if (!t || !ok(t)) return Promise.reject(new Error('Unknown or unavailable tool: ' + name));
    try { return Promise.resolve(t.run(args || {}, ctx || {})); } catch (e) { return Promise.reject(e); }
  }
  function names() { return Object.keys(reg); }
  /* pred(tool, name) -> true to drop. No predicate drops nothing (a bare forget must not clear built-ins). */
  function forget(pred) {
    if (typeof pred !== 'function') return;
    Object.keys(reg).forEach(function (k) { if (pred(reg[k], k)) delete reg[k]; });
  }
  return { register: register, list: list, schemas: schemas, run: run, names: names, forget: forget };
})();
