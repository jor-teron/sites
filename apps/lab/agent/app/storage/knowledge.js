/* Agent — app/storage/knowledge.js: imported knowledge documents (AG33). HR.know.
   Imports are COPIES of .txt / .md files the user picks, stored under agent/knowledge/raw/ in the chosen folder. The
   user's original files are never opened again, changed or deleted. Names are made safe (letters, digits, . _ - and
   spaces; no paths) and never overwrite: a taken name becomes "name (2).md". Limits: ≤ 512 KB per file, ≤ 200 files.
   remove(name) deletes only Agent's copy. No index file: search reads the live files, so edits and deletions count at
   once. Folder needed (no folder -> list() is [] and import() throws a plain error). */
HR.know = (function () {
  var DIR = 'agent/knowledge/raw/', MAXB = 512 * 1024, MAXN = 200, EXT = /\.(txt|md)$/i;
  function safeName(n) {
    n = String(n || '').split(/[\\/]/).pop().replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^\.+/, '').replace(/\s+/g, ' ').trim().slice(0, 80);
    return EXT.test(n) ? n : '';
  }
  async function list() {
    if (!HR.fs.ready()) return [];
    var out = []; try { out = (await HR.fs.list(DIR)).filter(function (e) { return e.kind === 'file' && EXT.test(e.name); }); } catch (e) { return []; }
    return out.map(function (e) { return { name: e.name, path: DIR + e.name }; });
  }
  async function free(name, have) {
    if (have.indexOf(name) < 0) return name;
    var m = name.match(/^(.*?)(\.[^.]+)$/), i = 2;
    while (have.indexOf(m[1] + ' (' + i + ')' + m[2]) >= 0) i++;
    return m[1] + ' (' + i + ')' + m[2];
  }
  /* files: File-like {name, size, text()} -> {added:[names], skipped:[{name, why}]} */
  async function importFiles(files) {
    if (!HR.fs.ready()) throw new Error('Pick a folder first (Settings › Folder & Memory).');
    var have = (await list()).map(function (f) { return f.name; }), added = [], skipped = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i], n = safeName(f.name);
      if (!n) { skipped.push({ name: f.name, why: 'only .txt and .md' }); continue; }
      if (f.size > MAXB) { skipped.push({ name: f.name, why: 'over 512 KB' }); continue; }
      if (have.length >= MAXN) { skipped.push({ name: f.name, why: 'limit of ' + MAXN + ' documents' }); continue; }
      n = await free(n, have);
      await HR.fs.write(DIR + n, await f.text()); have.push(n); added.push(n);
    }
    return { added: added, skipped: skipped };
  }
  async function remove(name) {
    var n = safeName(name); if (!n || n !== name) throw new Error('Not a knowledge document: ' + name);
    await HR.fs.remove(DIR + n);
  }
  return { list: list, importFiles: importFiles, remove: remove, safeName: safeName, DIR: DIR, MAXB: MAXB, MAXN: MAXN };
})();
