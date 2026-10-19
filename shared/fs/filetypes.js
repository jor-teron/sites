/*
 * File types (shared/fs/filetypes.js) — which app opens which file ("Open with"). Used by the
 * Files app (apps/tools/files/: double click = default app, right-click "Open with ▸") and the
 * Viewer (apps/tools/viewer/: which files of a folder it steps through). No libraries.
 *
 * Kinds by extension (then by MIME type): image, video, text, '' (other).
 * Apps (id → { name, icon, url, file }):
 *   viewer   apps/tools/viewer/   images + videos; gets the file (FsRef hash, shared/fs/fs_ref.js)
 *   notely   apps/office/notely/  text; gets the file (sessionStorage 'notely-handoff', Files)
 *   textview Files' own text view (no url)
 *   photo-editor / photo-editor-v2 / paint   file: false = "open app" only — they have no way to
 *            take a file from outside yet, so Files only opens the app (pick the file in it)
 * Other files keep the old behaviour (Download), so there is no app for them here.
 *
 * API window.FileTypes:
 *   ext(name)              → 'png' (lower case, '' when none)
 *   kind(name, mime?)      → 'image' | 'video' | 'text' | ''
 *   mime(name)             → best-guess MIME for image / video names ('' else)
 *   apps(name, mime?)      → [{ id, name, icon, url, file }] default first ([] = no app)
 *   app(id)                → that app or null
 */
(function () {
  'use strict';
  const IMG = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    ico: 'image/x-icon', avif: 'image/avif', svg: 'image/svg+xml', heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff' };
  const VID = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime',
    mkv: 'video/x-matroska', avi: 'video/x-msvideo', '3gp': 'video/3gpp', wmv: 'video/x-ms-wmv', flv: 'video/x-flv' };
  const TEXT = /^(txt|md|markdown|json|csv|tsv|log|js|mjs|cjs|ts|css|html?|xml|yml|yaml|ini|cfg|conf|toml|py|sh|bat|c|h|cpp|java|rs|go|rb|php|sql|m3u|srt|vtt)$/;
  const APPS = {
    viewer: { name: 'Viewer', icon: '\uD83D\uDDBC\uFE0F', url: 'apps/tools/viewer/', file: true },
    notely: { name: 'Notely', icon: '\uD83D\uDCDD', url: 'apps/office/notely/', file: true },
    textview: { name: 'Text view', icon: '\uD83D\uDCC4', url: '', file: true },
    'photo-editor-v2': { name: 'Photo Editor v2', icon: '\uD83C\uDFA8', url: 'apps/media/photo-editor-v2/', file: false },
    'photo-editor': { name: 'Photo Editor', icon: '\uD83C\uDFA8', url: 'apps/media/photo-editor/', file: false },
    paint: { name: 'Paint', icon: '\uD83D\uDD8C\uFE0F', url: 'apps/media/paint/', file: false }
  };
  const BY_KIND = {
    image: ['viewer', 'photo-editor-v2', 'photo-editor', 'paint'],
    video: ['viewer'],
    text: ['notely', 'textview']
  };
  const ext = (name) => { const m = /\.([^./\\]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
  function kind(name, mime) {
    const e = ext(name);
    if (IMG[e]) return 'image';
    if (VID[e]) return 'video';
    if (TEXT.test(e)) return 'text';
    const t = String(mime || '');
    if (/^image\//.test(t)) return 'image';
    if (/^video\//.test(t)) return 'video';
    if (/^text\/|json|xml|javascript/.test(t)) return 'text';
    return '';
  }
  const mime = (name) => IMG[ext(name)] || VID[ext(name)] || '';
  const app = (id) => (APPS[id] ? Object.assign({ id }, APPS[id]) : null);
  const apps = (name, type) => (BY_KIND[kind(name, type)] || []).map(app);
  window.FileTypes = { ext, kind, mime, apps, app };
})();
