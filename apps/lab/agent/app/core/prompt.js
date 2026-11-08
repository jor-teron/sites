/* Agent — app/core/prompt.js: system prompt (HR4; AG4 memory layout + live settings; AG29 text in prompts/).
   HR.prompt.system() runs on every model call. Wording lives in prompts/prompt_*.txt (shipped app assets).
   This file only chooses and assembles them.
   With a folder: the user's agent/prompts/system.md (created from prompt_system.txt on first use only; an existing
   file is never renamed or overwritten), then the live "Current settings" section, then HR.mem.block(chat id)
   under the memory-block header (~800 chars each, ~2000 total; left out when Memory is off).
   Without a folder: only the settings section when a tool is available, else no system prompt.
   Settings are rebuilt on every call from the cached template text plus live tool / permission state.
   Variant files use @@key lines (prompt_files, prompt_shell, prompt_memory). The other files are one literal.
   Load order for each asset: fetch (hosted and offline via the service worker), then the agent-files cache,
   then HR.promptFiles from prompts/prompt_fallback.js (generated from the same .txt files; file:// and failed loads).
   A missing safety section is never dropped and never replaced with an empty string. */
HR.prompt = (function () {
  var SYS = 'agent/prompts/system.md', making = null, mem = {}, fly = {};
  var CACHE = 'agent-files';
  /* AG29 Legacy: the default system.md string and the settings sentences used to be literals in this file.
     settings() pushed, in order, when tools were on and at least one tool was listed:
       header (prompt_settings.txt);
       files line (prompt_files.txt @@write_auto | @@write_ask | @@read_only | @@no_folder);
       shell line only if run_shell (prompt_shell.txt @@auto | @@ask);
       web line only if web_search (prompt_web.txt);
       memory line (prompt_memory.txt @@on if memory_read, else @@off).
     Those lines were joined with '\n'. system() returned that settings string alone when no folder was connected;
     otherwise [trimmed system.md, settings, prompt_memory.txt @@block + newline + HR.mem.block].filter(Boolean).join('\n\n').
     Tools off, or no tool listed, still returns '' for the settings section and does not invent a prompt. */

  function assetUrl(name) {
    var rel = 'prompts/' + name;
    try { if (location && location.href) return new URL(rel, location.href).href; } catch (e) {}
    return rel;
  }
  function embedded(name) {
    var bag = HR.promptFiles;
    if (!bag || typeof bag[name] !== 'string' || !String(bag[name]).trim()) return null;
    return bag[name];
  }
  function remember(name, text) { mem[name] = text; return text; }
  function nonempty(t) { return typeof t === 'string' && t.trim() ? t : null; }
  function fetchText(url) {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r || !r.ok || !r.text) return null;
      return Promise.resolve(r.text()).then(nonempty, function () { return null; });
    }, function () { return null; });
  }
  function matchCache(c, url) {
    try { return Promise.resolve(c.match(url, { ignoreSearch: true })); }
    catch (e) { return Promise.resolve(c.match(url)); }
  }
  function cacheText(url) {
    var box = typeof caches !== 'undefined' ? caches : null;
    if (!box || !box.open) return Promise.resolve(null);
    return box.open(CACHE).then(function (c) { return matchCache(c, url); }).then(function (res) {
      if (!res || res.ok === false || !res.text) return null;
      return Promise.resolve(res.text()).then(nonempty, function () { return null; });
    }, function () { return null; });
  }
  function assetError(name) {
    var err = new Error('Agent prompt asset missing: ' + name);
    err.promptAsset = true;
    return err;
  }
  function load(name) {
    if (Object.prototype.hasOwnProperty.call(mem, name)) return Promise.resolve(mem[name]);
    if (fly[name]) return fly[name];
    var url = assetUrl(name);
    fly[name] = fetchText(url).then(function (t) { return t || cacheText(url); }).then(function (t) {
      if (t) return t;
      var emb = embedded(name);
      if (emb) return emb;
      throw assetError(name);
    }).then(function (t) { delete fly[name]; return remember(name, t); }, function (e) { delete fly[name]; throw e; });
    return fly[name];
  }
  /* @@key sections, or the whole file when there is no @@ line. null when the requested piece is absent or blank. */
  function section(text, key) {
    var norm = String(text).replace(/\r\n/g, '\n'), lines = norm.split('\n'), map = null, cur = null, buf = [];
    function flush() {
      if (cur == null) return;
      var body = buf.join('\n');
      if (body.slice(-1) === '\n') body = body.slice(0, -1);
      map[cur] = body;
    }
    for (var i = 0; i < lines.length; i++) {
      var m = /^@@([A-Za-z0-9_]+)$/.exec(lines[i]);
      if (m) { if (!map) map = {}; flush(); cur = m[1]; buf = []; }
      else if (map) buf.push(lines[i]);
    }
    flush();
    if (key != null) return map && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
    if (map) return null;
    return norm.slice(-1) === '\n' ? norm.slice(0, -1) : norm;
  }
  function take(text, key) {
    var body = section(text, key);
    return body != null && String(body).trim() ? body : null;
  }
  async function part(name, key) {
    var text = await load(name), body = take(text, key), emb = embedded(name);
    if (body == null && emb != null && emb !== text) {
      body = take(emb, key);
      if (body != null) remember(name, emb);
    }
    if (body == null) {
      var err = new Error('Agent prompt section missing: ' + name + (key ? ' @@' + key : ''));
      err.promptAsset = true;
      throw err;
    }
    return body;
  }
  async function base() {
    var t; try { t = (await HR.fs.read(SYS)).text; } catch (e) { t = null; }
    if (t == null) {
      if (!making) making = load('prompt_system.txt').then(function (def) {
        if (!def || !String(def).trim()) throw assetError('prompt_system.txt');
        return Promise.resolve().then(function () { return HR.fs.write(SYS, def); }).then(function () {
          if (HR.chat && HR.chat.note) HR.chat.note('Created ' + SYS + ' — edit it to change the system prompt.');
          return def;
        }, function () { return def; });
      }).then(undefined, function (e) { making = null; throw e; });
      t = await making;
    }
    return t.trim();
  }
  async function settings() {
    if (HR.set.get('tools') === 'off') return '';
    var have = {}; HR.tools.list().forEach(function (t) { have[t.name] = 1; });
    if (!Object.keys(have).length) return '';
    var fileKey = HR.fs.ready() ? (have.write_file ? (HR.perms.auto('write') ? 'write_auto' : 'write_ask') : 'read_only') : 'no_folder';
    var L = [await part('prompt_settings.txt'), await part('prompt_files.txt', fileKey)];
    if (have.run_shell) L.push(await part('prompt_shell.txt', HR.perms.auto('shell') ? 'auto' : 'ask'));
    if (have.web_search) L.push(await part('prompt_web.txt'));
    L.push(await part('prompt_memory.txt', have.memory_read ? 'on' : 'off'));
    return L.join('\n');
  }
  async function system() {
    var st = await settings();
    if (!HR.fs.ready()) return st;
    var s = '', block = '';
    try { s = await base(); } catch (e) { if (e && e.promptAsset) throw e; s = ''; }
    var memText = '';
    try { memText = HR.perms.memory() ? await HR.mem.block(HR.chats && HR.chats.id()) : ''; } catch (e) { memText = ''; }
    if (memText) block = (await part('prompt_memory.txt', 'block')) + '\n' + memText;
    return [s, st, block].filter(Boolean).join('\n\n');
  }
  return { system: system, settings: settings, SYS: SYS };
})();
