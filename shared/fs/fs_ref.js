/*
 * File reference hand-off (shared/fs/fs_ref.js) — "this file on that drive" as a URL hash, so a
 * file picked in one app (Files) opens in another (Viewer) in its own Hub window, and a restored
 * window session (or a reload) opens the same file again. Works for every drive in
 * shared/fs/fs_drives.js: Local (OPFS), an added folder, Google Drive (shared/google/gdrive_fs.js).
 *
 * A ref is { drive, path, name }: drive id, folder path from the drive root ('A/B', '' = root),
 * file name. Hash: #drive=local&path=A%2FB&file=cat.png (Files' own #drive=&path= plus file=).
 *
 * API window.FsRef:
 *   hash(ref)          → 'drive=…&path=…&file=…' (no '#')
 *   parse(hash)        → ref or null (no drive / no file)
 *   resolve(ref)       → Promise<{ dir, file, driveName }> (dir/file = handles); throws an Error
 *                        with .code 'access' (folder needs "Allow access" / Drive sign-in),
 *                        'drive' (no such drive) or 'missing' (folder / file gone)
 *   openIn(appUrl, ref) open the app on that ref: inside the Hub its own window (an open one just
 *                        moves to the file, via hashchange), else a new tab
 */
(function () {
  'use strict';
  const err = (code, msg) => Object.assign(new Error(msg), { code });
  function hash(r) {
    const p = String(r.path || '').replace(/^\/+|\/+$/g, '');
    return 'drive=' + encodeURIComponent(r.drive) + (p ? '&path=' + encodeURIComponent(p) : '') + '&file=' + encodeURIComponent(r.name);
  }
  function parse(h) {
    const q = new URLSearchParams(String(h || '').replace(/^#/, ''));
    const drive = q.get('drive') || '', name = q.get('file') || '';
    return drive && name ? { drive, path: q.get('path') || '', name } : null;
  }
  async function resolve(r) {
    const D = window.FsDrives;
    if (!D) throw err('drive', 'Drives are not available here');
    if (r.drive === 'gdrive' && D.gdriveState && D.gdriveState() !== 'ok') throw err('access', 'Sign in to Google Drive in Files first');
    const root = await D.handle(r.drive);
    if (!root) throw err('drive', 'That drive is not here any more');
    if ((await D.access(r.drive)) !== 'granted') throw err('access', 'Open the folder in Files and click \u201cAllow access\u201d first');
    let dir = root;
    for (const part of String(r.path || '').split('/').filter(Boolean)) {
      try { dir = await dir.getDirectoryHandle(part); } catch (_) { throw err('missing', 'Folder \u201c' + part + '\u201d not found'); }
    }
    let file;
    try { file = await dir.getFileHandle(r.name); } catch (_) { throw err('missing', '\u201c' + r.name + '\u201d not found'); }
    const d = (await D.list()).find((x) => x.id === r.drive);
    return { dir, file, driveName: d ? d.name : root.name };
  }
  /** appUrl is root-relative ('apps/tools/viewer/'). */
  function openIn(appUrl, r) {
    const h = hash(r);
    let hub = null;
    try { hub = window.parent !== window && window.parent.__hubOpenApp ? window.parent : null; } catch (_) { hub = null; }
    if (hub && hub.__hubOpenApp(appUrl, { hash: h })) return;
    window.open((ROOT || '../../../') + appUrl + '#' + h, '_blank');
  }
  // the site root from this script's own URL (…/shared/fs/fs_ref.js → …/)
  const ROOT = (() => { try { return new URL('../../', document.currentScript.src).href; } catch (_) { return ''; } })();
  window.FsRef = { hash, parse, resolve, openIn };
})();
