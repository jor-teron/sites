/* Harness — app/core/tools.js: tool registry (HR2).
   HR.tools.register({name, description, parameters (JSON schema), where:'browser', available()?, run(args, ctx)}).
   ctx = {signal, approve(info) -> Promise<boolean>, step(text)}. run may return a string or any JSON value.
   schemas() -> Ollama `tools` array for the tools available right now (e.g. folder tools only when a folder is open). */
HR.tools = (function () {
  var reg = {};
  function register(t) { t.where = t.where || 'browser'; reg[t.name] = t; }
  function list() { return Object.keys(reg).map(function (k) { return reg[k]; }).filter(function (t) { return !t.available || t.available(); }); }
  function schemas() {
    return list().map(function (t) { return { type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters || { type: 'object', properties: {} } } }; });
  }
  function run(name, args, ctx) {
    var t = reg[name];
    if (!t || (t.available && !t.available())) return Promise.reject(new Error('Unknown or unavailable tool: ' + name));
    try { return Promise.resolve(t.run(args || {}, ctx || {})); } catch (e) { return Promise.reject(e); }
  }
  return { register: register, list: list, schemas: schemas, run: run };
})();
