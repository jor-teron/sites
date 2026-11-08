/* Agent — app/storage/move.js: move a file to trash/ or rename it (AG40). HR.move.
   Folder layout (siblings under the connected root): agent/ (Agent's internals), workspace/ (Agent's work and projects),
   user/ (files the user shares; changes only with approval), trash/ (removed files, kept until the user deletes them).
   ensureDirs() creates workspace/, user/ and trash/ when missing. getDirectoryHandle({create}) never replaces anything,
   and existing files are never rearranged. Agent has no permanent-delete tool.
   The browser has no safe "move file" for every handle, so a move is: check -> copy the bytes (a File/Blob, not text)
   -> read the copy back and compare every byte -> (trash) append a line to trash/trash.md -> check the source is unchanged
   -> remove the original. Any failure before the last step leaves the original untouched; only our own new copy is
   cleaned up. If removing the original fails, both copies exist and the result says so; it never claims a move.
   Not atomic: another program can change files between steps (each step re-checks size + lastModified).
   Files only (no folders). Never overwrites: a destination that exists is refused (rename) or given a unique name (trash).
   Protected: anything under agent/ and trash/ (sources and rename targets). Old agent/trash/ backups stay where they are. */
HR.move = (function () {
  var DIRS = ['workspace', 'user', 'trash'], LOG = 'trash/trash.md';
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clean(p) { return HR.fs.norm(p).join('/'); }
  function guard(p, what) {
    if (!p) throw new Error('A file path is needed');
    if (/^agent(\/|$)/i.test(p)) throw new Error(what + ': agent/ holds Agent\'s own files and is protected');
    if (/^trash(\/|$)/i.test(p)) throw new Error(what + ': trash/ is managed by Agent; the user empties it by hand');
    return p;
  }
  async function ensureDirs() {
    if (!HR.fs.ready()) return [];
    var made = [];
    for (var i = 0; i < DIRS.length; i++) { try { if (await HR.fs.mkdir(DIRS[i])) made.push(DIRS[i]); } catch (e) { /* a file has that name: leave it */ } }
    return made;
  }
  async function info(p) {   /* {size, mtime} of a file, null when absent; a folder throws 'files only' */
    var kind = await HR.fs.kind(p);
    if (kind === 'directory') throw new Error(p + ' is a folder; only single files can be moved or renamed');
    if (!kind) return null;
    var f = await HR.fs.file(p); return { size: f.size, mtime: f.lastModified };
  }
  function same(a, b) { return !!a && !!b && a.size === b.size && a.mtime === b.mtime; }
  async function equalBytes(a, b) {
    var x = new Uint8Array(await (await HR.fs.file(a)).arrayBuffer()), y = new Uint8Array(await (await HR.fs.file(b)).arrayBuffer());
    if (x.length !== y.length) return false;
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  async function trashPath(p) {
    var d = new Date(), day = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    var base = 'trash/' + day + '/' + p, t = base, i = 2;
    if (await HR.fs.kind(t)) { var dot = base.lastIndexOf('.'), slash = base.lastIndexOf('/'), stem = dot > slash + 1 ? base.slice(0, dot) : base, ext = dot > slash + 1 ? base.slice(dot) : '';
      var stamp = '~' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); t = stem + stamp + ext;
      while (await HR.fs.kind(t)) t = stem + stamp + '-' + i++ + ext; }
    return t;
  }
  function esc(s) { return String(s).replace(/[\r\n]+/g, ' ').replace(/`/g, "'").slice(0, 300); }
  /* Copy, verify, optional log, re-check, remove. Returns {ok, to, removed, note}. */
  async function relocate(from, to, seen, logLine) {
    var now = await info(from);
    if (!now) throw new Error(from + ' no longer exists; nothing was changed');
    if (seen && !same(seen, now)) throw new Error(from + ' changed after you approved; nothing was changed');
    if (await HR.fs.kind(to)) throw new Error(to + ' already exists; nothing was changed');
    try { await HR.fs.copy(from, to); if (!(await equalBytes(from, to))) throw new Error('the copy did not match the original'); }
    catch (e) { await drop(to); throw new Error('Could not copy ' + from + ' to ' + to + ' (' + (e && e.message || e) + '); the original is unchanged'); }
    if (logLine) {
      try { await HR.fs.append(LOG, logLine()); }
      catch (e2) { await drop(to); throw new Error('Could not write ' + LOG + ' (' + (e2 && e2.message || e2) + '); the original is unchanged'); }
    }
    var again = await info(from).catch(function () { return null; });
    if (!same(now, again)) return { ok: false, to: to, removed: false, note: from + ' changed while it was being copied, so it was left in place. The earlier copy is at ' + to + '.' };
    try { await HR.fs.remove(from); }
    catch (e3) { return { ok: false, to: to, removed: false, note: 'Copied to ' + to + ' but the original ' + from + ' could not be removed (' + (e3 && e3.message || e3) + '). Both copies exist.' }; }
    return { ok: true, to: to, removed: true };
  }
  async function drop(p) { try { if (await HR.fs.kind(p) === 'file') await HR.fs.remove(p); } catch (e) {} }   /* only our own new copy */
  /* seen: info() captured before approval; the move refuses if the file changed since. */
  async function toTrash(path, reason, seen) {
    var from = guard(clean(path), 'Cannot move to trash');
    await ensureDirs();
    var to = await trashPath(from), when = new Date().toISOString().slice(0, 19).replace('T', ' ');
    var r = await relocate(from, to, seen, function () {
      return '- ' + when + ' · `' + esc(from) + '` → `' + esc(to) + '` · ' + (esc(reason || '') || 'no reason given') + '\n';
    });
    if (!r.ok) { try { await HR.fs.append(LOG, '  - not removed: ' + esc(r.note) + '\n'); } catch (e) {} return r; }
    return r;
  }
  async function rename(path, next, seen) {
    var from = guard(clean(path), 'Cannot rename'), to = guard(clean(next), 'Cannot rename to that path');
    if (from === to) throw new Error('The new path is the same as the old one');
    return relocate(from, to, seen, null);
  }
  return { ensureDirs: ensureDirs, info: info, toTrash: toTrash, rename: rename, guard: guard, clean: clean, LOG: LOG, DIRS: DIRS };
})();
