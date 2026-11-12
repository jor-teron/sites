/*
 * File types (shared/fs/filetypes.js) — which app opens which file ("Open with"). Used by the
 * Files app (apps/system/files/: double click = default app, right-click "Open with ▸") and the
 * Viewer (apps/system/viewer/: which files of a folder it steps through). No libraries.
 *
 * Kinds by extension (then by MIME type): image, video, text, '' (other).
 * Apps (id → { name, icon, url, file }):
 *   viewer   apps/system/viewer/   images + videos; gets the file (FsRef hash, shared/fs/fs_ref.js)
 *   notely   apps/office/notely/  text; gets the file (sessionStorage 'notely-handoff', Files)
 *   (before DF25) draftly  apps/office/draftly/ .how (Hub Office Writer); gets the file (FsRef hash)
 *   writer   apps/office/writer/ .how (Hub Office Writer); gets the file (FsRef hash). DF25: old id draftly
 *            is an alias (app('draftly') = Writer, id 'writer'); never listed twice by apps()
 *   spreadsheet apps/office/spreadsheet/ .hos (Hub Office Spreadsheet); gets the file (FsRef hash)
 *   tables   apps/office/tables/ .hot (Hub Office Tables); gets the file (FsRef hash)
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
 *   app(id)                → that app or null (an old id in ALIAS gives the new app, e.g. draftly → writer)
 */
(function () {
  'use strict';
  const IMG = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    ico: 'image/x-icon', avif: 'image/avif', svg: 'image/svg+xml', heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff' };
  const VID = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime',
    mkv: 'video/x-matroska', avi: 'video/x-msvideo', '3gp': 'video/3gpp', wmv: 'video/x-ms-wmv', flv: 'video/x-flv' };
  const TEXT = /^(txt|md|markdown|json|csv|tsv|log|js|mjs|cjs|ts|css|html?|xml|yml|yaml|ini|cfg|conf|toml|py|sh|bat|c|h|cpp|java|rs|go|rb|php|sql|m3u|srt|vtt)$/;
  const APPS = {
    viewer: { name: 'Viewer', icon: '\uD83D\uDDBC\uFE0F', url: 'apps/system/viewer/', file: true },
    notely: { name: 'Notely', icon: '\uD83D\uDCDD', url: 'apps/office/notely/', file: true },
    /* HOW1: double-click a .how file opens Writer. Hub id stays draftly. */
    /* (before DF25) draftly: { name: 'Writer', icon: '\u270D\uFE0F', url: 'apps/office/draftly/', file: true }, */
    /* DF25: Writer moved to apps/office/writer/, Hub id writer (old id draftly: see ALIAS). */
    writer: { name: 'Writer', icon: '\u270D\uFE0F', url: 'apps/office/writer/', file: true },
    /* HOS1: double-click a .hos file opens Spreadsheet. Hub id stays spreadsheet. */
    spreadsheet: { name: 'Spreadsheet', icon: '\uD83D\uDCCA', url: 'apps/office/spreadsheet/', file: true },
    /* HOT1: double-click a .hot file opens Tables. Hub id stays tables. */
    tables: { name: 'Tables', icon: '\uD83D\uDDC2\uFE0F', url: 'apps/office/tables/', file: true },
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
  /* (before HOW1) extension had no app of its own; .how was "other" and downloaded. */
  /* (before HOS1) const BY_EXT = { how: ['draftly'] }; */
  /* (before HOT1) const BY_EXT = { how: ['draftly'], hos: ['spreadsheet'] }; */
  /* (before DF25) const BY_EXT = { how: ['draftly'], hos: ['spreadsheet'], hot: ['tables'] }; */
  const BY_EXT = { how: ['writer'], hos: ['spreadsheet'], hot: ['tables'] };
  /* DF25: old app ids → their new id, so a saved or passed-in old id still finds the app. */
  const ALIAS = { draftly: 'writer' };
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
  /* (before DF25) const app = (id) => (APPS[id] ? Object.assign({ id }, APPS[id]) : null); */
  const app = (id) => {
    const k = Object.prototype.hasOwnProperty.call(ALIAS, id) ? ALIAS[id] : id;
    return Object.prototype.hasOwnProperty.call(APPS, k) ? Object.assign({ id: k }, APPS[k]) : null;
  };
  /* (before HOW1) const apps = (name, type) => (BY_KIND[kind(name, type)] || []).map(app); */
  const apps = (name, type) => (BY_EXT[ext(name)] || BY_KIND[kind(name, type)] || []).map(app);
  window.FileTypes = { ext, kind, mime, apps, app };
})();
