/* Harness — app/tools/files.js: folder tools (HR3), offered only while a folder is connected (HR.fs.ready()).
   list_dir(path), read_file(path) (capped ~20k chars), write_file(path, content) (Approve / Deny card; deny -> 'User denied'),
   search(query, path?) (file names + plain text, capped results). Paths are relative to the folder root. */
(function () {
  var READ_CAP = 20000, HITS = 40, FILES = 3000, BIG = 1024 * 1024;
  var BIN = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|7z|rar|mp[34]|m4a|wav|ogg|webm|mov|avi|woff2?|ttf|otf|exe|dll|so|bin|wasm|class|jar|pyc)$/i;
  var avail = function () { return HR.fs.ready(); };
  function P(desc) { return { type: 'string', description: desc }; }
  HR.tools.register({ name: 'list_dir', available: avail, description: 'List files and folders in the user\'s folder. Path is relative to the folder root ("" or "." for the root).',
    parameters: { type: 'object', properties: { path: P('Relative folder path, e.g. "" or "notes"') } },
    run: async function (a) {
      var l = await HR.fs.list(a.path || '');
      return l.length ? l.map(function (e) { return e.kind === 'directory' ? e.name + '/' : e.name; }).join('\n') : '(empty folder)';
    } });
  HR.tools.register({ name: 'read_file', available: avail, description: 'Read a text file from the user\'s folder (first ~20000 characters).',
    parameters: { type: 'object', properties: { path: P('Relative file path, e.g. "notes/todo.md"') }, required: ['path'] },
    run: async function (a) {
      var r = await HR.fs.read(a.path);
      return r.text.length > READ_CAP ? r.text.slice(0, READ_CAP) + '\n…[truncated: showing ' + READ_CAP + ' of ' + r.text.length + ' chars]' : r.text;
    } });
  HR.tools.register({ name: 'write_file', available: avail, description: 'Create or overwrite a text file in the user\'s folder. The user must approve each write.',
    parameters: { type: 'object', properties: { path: P('Relative file path'), content: P('Full new file content') }, required: ['path', 'content'] },
    run: async function (a, ctx) {
      var path = HR.fs.norm(a.path).join('/'), content = String(a.content == null ? '' : a.content);
      if (!path) throw new Error('A file path is needed');
      var old = await HR.fs.stat(path);
      var ok = ctx.approve ? await ctx.approve({ kind: 'write', path: path, size: new Blob([content]).size, exists: old.exists, oldSize: old.size, preview: content }) : false;
      if (!ok) return 'User denied';
      await HR.fs.write(path, content);
      return 'Wrote ' + path + ' (' + content.length + ' chars' + (old.exists ? ', replaced existing file' : ', new file') + ')';
    } });
  HR.tools.register({ name: 'search', available: avail, description: 'Search the user\'s folder: file names and plain text lines containing the query (case-insensitive). Capped results.',
    parameters: { type: 'object', properties: { query: P('Text to find'), path: P('Optional relative folder to search in') }, required: ['query'] },
    run: async function (a, ctx) {
      var q = String(a.query || '').toLowerCase(), hits = [], seen = 0;
      if (!q) throw new Error('Empty query');
      await HR.fs.walk(a.path || '', async function (rel, h) {
        if (ctx.signal && ctx.signal.aborted) return false;
        if (++seen > FILES) return false;
        if (rel.toLowerCase().indexOf(q) >= 0) hits.push(rel + '  (name)');
        if (!BIN.test(rel)) {
          var f = await h.getFile();
          if (f.size <= BIG) (await f.text()).split('\n').some(function (ln, i) {
            if (ln.toLowerCase().indexOf(q) >= 0) hits.push(rel + ':' + (i + 1) + ': ' + ln.trim().slice(0, 160));
            return hits.length >= HITS;
          });
        }
        return hits.length < HITS;
      });
      return hits.length ? hits.join('\n') + (hits.length >= HITS || seen > FILES ? '\n…[results capped]' : '') : 'No matches for "' + a.query + '"';
    } });
})();
