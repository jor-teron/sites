/* Agent — app/storage/trash.js: backups for file writes + Undo (AG7). HR.trash.
   before(path) -> undo info {path, backup, created, at}: an existing file is copied byte-exact to
   agent/trash/YYYY_MM_DD/<path>~HHMMSS (-2, -3… if that name is taken) before write_file overwrites it; a new file
   gets backup '' (created: true). undo(u): the current file is backed up the same way first (so Undo itself can be
   undone from the trash), then the backup is copied back — or, for a file the write created, it is removed.
   Nothing is ever deleted from agent/trash/ by Agent. */
HR.trash = (function () {
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  async function spot(path) {
    var d = new Date(), base = 'agent/trash/' + d.getFullYear() + '_' + pad(d.getMonth() + 1) + '_' + pad(d.getDate()) + '/' + path + '~' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    var p = base, i = 2; while ((await HR.fs.stat(p)).exists) p = base + '-' + i++;
    return p;
  }
  async function keep(path) { if (!(await HR.fs.stat(path)).exists) return ''; var t = await spot(path); await HR.fs.copy(path, t); return t; }
  async function before(path) { var b = await keep(path); return { path: path, backup: b, created: !b, at: new Date().toISOString().slice(0, 19) }; }
  async function undo(u) {
    if (!u || u.done) throw new Error('Already undone');
    var now = await keep(u.path);
    if (u.backup) await HR.fs.copy(u.backup, u.path); else if (now) await HR.fs.remove(u.path);
    u.done = true; u.saved = now;
    return u.backup ? 'Restored ' + u.path + ' from ' + u.backup + (now ? ' (the replaced version is in ' + now + ')' : '')
      : 'Removed ' + u.path + ' (it was new; a copy is in ' + now + ')';
  }
  return { before: before, undo: undo };
})();
