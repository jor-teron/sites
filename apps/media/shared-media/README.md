# shared-media (Media apps only)

`media_files.js` → `window.MediaFiles`, shared by Music Player (MP1) and planned for Video Player (VP1) and Gallery.
Plain script, no build step: `<script src="../shared-media/media_files.js"></script>`.

- `pickFolder(appId, {kinds, depth})`: `showDirectoryPicker` (the handle is stored in IndexedDB `shared-media-v1`/`handles` under appId),
  falling back to `<input webkitdirectory>`. `pickFiles({kinds})`, `savedFolder(appId)`, `reopen(appId, {ask})`, `forget(appId)`,
  `fromDrop(dataTransfer, opts)`, `fromList(fileList, opts)`.
- Entries: `{name, path, size, lastModified, kind, type, file}`; `kinds` = `audio` / `video` / `image`. `key(e)` = `path|size`, `sameFile(a, b)`.
- `positions(ns)` → `get(key)`, `set(key, pos, dur)`, `clear(key)`, `all()`: playback positions in localStorage `shared-media-pos-v1`,
  newest 300 per namespace.
