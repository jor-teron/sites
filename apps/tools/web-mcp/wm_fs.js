/* Web MCP — wm_fs.js: File System Access folder handle, IndexedDB, permission, file ops. MCP2 */
(function (root) {
  'use strict';

  /* Config is loaded first as a script tag. */
  var C = root.WM_CONFIG;
  var P = root.WMPaths;

  /* True when this browser exposes showDirectoryPicker (Chrome / Edge desktop). */
  var supported = typeof root.showDirectoryPicker === 'function';
  /* Persisted or freshly picked root directory handle. */
  var rootHandle = null;
  /* 'unsupported' | 'none' | 'need' | 'ready' */
  var state = supported ? 'none' : 'unsupported';
  /* Listeners notified whenever the folder state changes. */
  var listeners = [];

  /**
   * Tell every listener the current state and folder name.
   */
  function emit() {
    var name = rootHandle ? rootHandle.name : '';
    listeners.forEach(function (fn) {
      try { fn(state, name); } catch (_) { /* listener bug */ }
    });
  }

  /**
   * Update the permission/folder state and notify listeners.
   */
  function setState(next) {
    state = next;
    emit();
  }

  /**
   * Run a function against the handle object store and close the database afterwards.
   */
  function idb(mode, fn) {
    return new Promise(function (ok, no) {
      if (!root.indexedDB) return no(new Error('IndexedDB is not available'));
      var req = root.indexedDB.open(C.IDB_NAME, C.IDB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(C.IDB_STORE)) {
          db.createObjectStore(C.IDB_STORE);
        }
      };
      req.onerror = function () { no(req.error || new Error('IndexedDB failed')); };
      req.onsuccess = function () {
        var db = req.result;
        var tx = db.transaction(C.IDB_STORE, mode);
        var storeReq = fn(tx.objectStore(C.IDB_STORE));
        tx.oncomplete = function () {
          db.close();
          ok(storeReq && 'result' in storeReq ? storeReq.result : undefined);
        };
        tx.onerror = function () {
          db.close();
          no(tx.error || new Error('IndexedDB error'));
        };
      };
    });
  }

  /**
   * Restore the saved folder handle (if any) and query its permission.
   * requestPermission is not called here — that needs a user gesture (the Allow button).
   */
  async function init() {
    if (!supported) {
      setState('unsupported');
      return state;
    }
    try {
      rootHandle = await idb('readonly', function (store) { return store.get(C.IDB_ROOT_KEY); });
    } catch (_) {
      rootHandle = null;
    }
    if (!rootHandle) {
      setState('none');
      return state;
    }
    try {
      var perm = await rootHandle.queryPermission({ mode: 'readwrite' });
      setState(perm === 'granted' ? 'ready' : 'need');
    } catch (_) {
      setState('need');
    }
    return state;
  }

  /**
   * Ask the user to pick a folder, persist the handle, and mark the folder ready.
   * Must be called from a click handler.
   */
  async function pick() {
    if (!supported) throw new Error(C.UNSUPPORTED_MESSAGE);
    var handle = await root.showDirectoryPicker({ id: C.PICKER_ID, mode: 'readwrite' });
    rootHandle = handle;
    await idb('readwrite', function (store) { return store.put(handle, C.IDB_ROOT_KEY); });
    setState('ready');
    return handle.name;
  }

  /**
   * Re-grant readwrite permission on the stored handle. Must run from a click.
   */
  async function allow() {
    if (!supported) throw new Error(C.UNSUPPORTED_MESSAGE);
    if (!rootHandle) return pick();
    var perm = await rootHandle.requestPermission({ mode: 'readwrite' });
    setState(perm === 'granted' ? 'ready' : 'need');
    return state;
  }

  /**
   * Subscribe to folder state changes. The listener receives (state, folderName).
   */
  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  /**
   * Current folder name, or an empty string when none is picked.
   */
  function folderName() {
    return rootHandle ? rootHandle.name : '';
  }

  /**
   * True only when we have a handle and permission is granted.
   */
  function isReady() {
    return state === 'ready' && !!rootHandle;
  }

  /**
   * Current state string for the UI.
   */
  function getState() {
    return state;
  }

  /**
   * Whether this browser can pick a folder at all.
   */
  function isSupported() {
    return supported;
  }

  /**
   * Walk directory parts starting from the picked folder. create makes missing dirs.
   */
  async function getDir(parts, create) {
    var dir = rootHandle;
    var i;
    for (i = 0; i < parts.length; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: !!create });
    }
    return dir;
  }

  /**
   * Look up a file handle from a resolved path. create makes the file (and optionally parents).
   */
  async function getFile(rel, create, createParents) {
    var split = P.splitPath(rel);
    if (split.isRoot) throw new Error('not a regular file');
    var dir = await getDir(split.dirs, !!createParents);
    return dir.getFileHandle(split.name, { create: !!create });
  }

  /**
   * Decode bytes as UTF-8, replacing invalid sequences, matching Linux v2.
   */
  function decodeUtf8(bytes) {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }

  /**
   * Read a file as text, with a byte cap or a line offset/limit window.
   */
  async function readFile(rel, opts) {
    opts = opts || {};
    var maxBytes = opts.maxBytes || C.MAX_READ_BYTES;
    var fileHandle = await getFile(rel, false, false);
    var file = await fileHandle.getFile();
    /* Line window: offset is 0-based, limit is a maximum line count. */
    if (opts.offset != null || opts.limit != null) {
      var start = parseInt(opts.offset == null ? 0 : opts.offset, 10);
      var maxLines = opts.limit == null ? null : parseInt(opts.limit, 10);
      if (!isFinite(start) || (maxLines != null && !isFinite(maxLines))) {
        throw new Error('offset and limit must be integers');
      }
      if (start < 0) start = 0;
      /* Load only the cap plus one byte so a huge file cannot fill memory. */
      var capBuf = await file.slice(0, maxBytes + 1).arrayBuffer();
      var capText = decodeUtf8(new Uint8Array(capBuf));
      var allLines = capText.split('\n');
      /* split() drops no trailing newline info for joining; restore except on the last chunk. */
      var i;
      for (i = 0; i < allLines.length - 1; i++) allLines[i] += '\n';
      var sliced = allLines.slice(start, maxLines == null ? undefined : start + maxLines);
      var truncated = (maxLines != null && allLines.length - start > maxLines) || file.size > maxBytes;
      var size = 0;
      var out = [];
      for (i = 0; i < sliced.length; i++) {
        var room = maxBytes - size;
        if (room <= 0) {
          truncated = true;
          break;
        }
        if (sliced[i].length > room) {
          out.push(sliced[i].slice(0, room));
          truncated = true;
          break;
        }
        out.push(sliced[i]);
        size += sliced[i].length;
      }
      return {
        path: rel.path,
        content: out.join(''),
        truncated: truncated,
        offset: start,
        limit: maxLines
      };
    }
    /* Whole-file read, capped at maxBytes. */
    var buf = await file.slice(0, maxBytes + 1).arrayBuffer();
    var data = new Uint8Array(buf);
    var over = data.length > maxBytes;
    return {
      path: rel.path,
      content: decodeUtf8(over ? data.subarray(0, maxBytes) : data),
      truncated: over || file.size > maxBytes
    };
  }

  /**
   * Write UTF-8 text to a file, optionally creating parent directories.
   */
  async function writeFile(rel, content, opts) {
    opts = opts || {};
    var split = P.splitPath(rel);
    if (split.isRoot) throw new Error('refusing to overwrite the picked folder');
    var createParents = !!opts.createParents;
    var dir;
    try {
      dir = await getDir(split.dirs, createParents);
    } catch (err) {
      if (!createParents) throw new Error('parent directory does not exist');
      throw err;
    }
    var fileHandle = await dir.getFileHandle(split.name, { create: true });
    var writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    var bytes = new TextEncoder().encode(content).length;
    return { path: rel.path, bytes: bytes };
  }

  /**
   * List a directory, optionally walking up to maxDepth (root listing is depth 1).
   */
  async function listDir(rel, opts) {
    opts = opts || {};
    var dir;
    try {
      dir = rel.isRoot ? rootHandle : await getDir(rel.parts, false);
    } catch (_) {
      throw new Error('path does not exist');
    }
    /* Confirm it is a directory (getDir would throw on a file, but the root is always a dir). */
    var entries = [];
    var truncated = false;

    /**
     * Append one entry (file, dir, or other) to the result list.
     */
    async function addEntry(handle, name, depth, parentPath) {
      var kind = handle.kind === 'directory' ? 'dir' : handle.kind === 'file' ? 'file' : 'other';
      var size = 0;
      if (kind === 'file') {
        try {
          var file = await handle.getFile();
          size = file.size;
        } catch (_) {
          size = 0;
        }
      }
      var full = parentPath === '.' ? name : parentPath + '/' + name;
      entries.push({ name: name, path: full, type: kind, size: size, depth: depth });
    }

    /**
     * Walk one directory, then (if recursive) its children, honouring the caps.
     */
    async function walk(current, parentPath, depth) {
      var kids = [];
      try {
        var it = current.values();
        var step;
        while (true) {
          step = await it.next();
          if (step.done) break;
          kids.push(step.value);
        }
      } catch (err) {
        throw new Error('cannot list directory: ' + (err && err.message ? err.message : err));
      }
      kids.sort(function (a, b) {
        var an = a.name || '';
        var bn = b.name || '';
        return an < bn ? -1 : an > bn ? 1 : 0;
      });
      var i;
      for (i = 0; i < kids.length; i++) {
        if (entries.length >= C.MAX_LIST_ENTRIES) {
          truncated = true;
          return;
        }
        var handle = kids[i];
        await addEntry(handle, handle.name, depth, parentPath);
        if (!opts.recursive || depth >= opts.maxDepth) continue;
        if (handle.kind === 'directory') {
          var childPath = parentPath === '.' ? handle.name : parentPath + '/' + handle.name;
          await walk(handle, childPath, depth + 1);
        }
      }
    }

    await walk(dir, rel.path, 1);
    return { path: rel.path, entries: entries, truncated: truncated };
  }

  /**
   * Delete a file or directory. Directories require recursive, same as Linux v2.
   */
  async function deletePath(rel, opts) {
    opts = opts || {};
    var split = P.splitPath(rel);
    if (split.isRoot) throw new Error('refusing to delete the picked folder');
    var parent = await getDir(split.dirs, false);
    await parent.removeEntry(split.name, { recursive: !!opts.recursive });
    return { path: rel.path, deleted: true };
  }

  /**
   * Copy a file handle into destDir under destName.
   */
  async function copyFile(srcHandle, destDir, destName) {
    var file = await srcHandle.getFile();
    var dest = await destDir.getFileHandle(destName, { create: true });
    var writable = await dest.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
  }

  /**
   * Recursively copy a directory handle into destParent under destName.
   */
  async function copyDir(srcDir, destParent, destName) {
    var destDir = await destParent.getDirectoryHandle(destName, { create: true });
    var it = srcDir.entries();
    var step;
    while (true) {
      step = await it.next();
      if (step.done) break;
      var name = step.value[0];
      var handle = step.value[1];
      if (handle.kind === 'file') await copyFile(handle, destDir, name);
      else await copyDir(handle, destDir, name);
    }
  }

  /**
   * Move or rename src onto dest. Prefers handle.move when the browser has it;
   * otherwise copies and then deletes the source.
   */
  async function movePath(src, dest) {
    var srcSplit = P.splitPath(src);
    var destSplit = P.splitPath(dest);
    var srcParent = await getDir(srcSplit.dirs, false);
    var destParent = await getDir(destSplit.dirs, true);
    var srcHandle;
    var kind;
    try {
      srcHandle = await srcParent.getFileHandle(srcSplit.name);
      kind = 'file';
    } catch (_) {
      try {
        srcHandle = await srcParent.getDirectoryHandle(srcSplit.name);
        kind = 'dir';
      } catch (err) {
        throw new Error('path does not exist');
      }
    }
    /* Prefer the native move() when this handle implements it (Chromium). */
    if (typeof srcHandle.move === 'function') {
      await srcHandle.move(destParent, destSplit.name);
      return { src: src.path, dest: dest.path };
    }
    /* Fallback: copy, then remove the source. */
    if (kind === 'file') await copyFile(srcHandle, destParent, destSplit.name);
    else await copyDir(srcHandle, destParent, destSplit.name);
    await srcParent.removeEntry(srcSplit.name, { recursive: kind === 'dir' });
    return { src: src.path, dest: dest.path };
  }

  /**
   * Resolve a directory handle for a relative path (the root handle when rel is the folder root).
   */
  async function dirFor(rel, create) {
    if (!rel || rel.isRoot) return rootHandle;
    return getDir(rel.parts, !!create);
  }

  /**
   * Walk the picked folder or a cwd subtree and collect files to stage into MEMFS.
   * Files over maxFileBytes, and anything past the file/byte caps, are skipped
   * and listed in skipped. Returns { dirs, files, skipped, bytes }.
   */
  async function walkStage(rel, caps) {
    caps = caps || {};
    /* Maximum number of files whose bytes will be staged. */
    var maxFiles = caps.maxFiles || 2000;
    /* Maximum total staged bytes. */
    var maxBytes = caps.maxBytes || (16 * 1024 * 1024);
    /* Per-file cap; larger files are skipped rather than stalling the walk. */
    var maxFileBytes = caps.maxFileBytes || (2 * 1024 * 1024);
    /* Directory relative paths under the walk root. */
    var dirs = [];
    /* Staged files: { path, data } with paths relative to the walk root. */
    var files = [];
    /* Files (or leftover entries) that were not staged, with a reason. */
    var skipped = [];
    /* Running total of staged bytes. */
    var bytes = 0;
    /* True once a cap has been hit; later files are skipped. */
    var capped = false;

    /**
     * Walk one directory handle. parentPath is '.' at the walk root.
     */
    async function walk(dir, parentPath) {
      var kids = [];
      var it = dir.values();
      var step;
      while (true) {
        step = await it.next();
        if (step.done) break;
        kids.push(step.value);
      }
      kids.sort(function (a, b) {
        var an = a.name || '';
        var bn = b.name || '';
        return an < bn ? -1 : an > bn ? 1 : 0;
      });
      var i;
      for (i = 0; i < kids.length; i++) {
        var handle = kids[i];
        var relPath = parentPath === '.' ? handle.name : parentPath + '/' + handle.name;
        if (handle.kind === 'directory') {
          dirs.push(relPath);
          await walk(handle, relPath);
          continue;
        }
        if (handle.kind !== 'file') {
          skipped.push({ path: relPath, reason: 'not a regular file', size: 0 });
          continue;
        }
        var file;
        try {
          file = await handle.getFile();
        } catch (err) {
          skipped.push({ path: relPath, reason: (err && err.message) || 'unreadable', size: 0 });
          continue;
        }
        if (file.size > maxFileBytes) {
          skipped.push({ path: relPath, reason: 'file larger than ' + maxFileBytes + ' bytes', size: file.size });
          continue;
        }
        if (capped || files.length >= maxFiles || bytes + file.size > maxBytes) {
          capped = true;
          skipped.push({ path: relPath, reason: 'staging cap reached', size: file.size });
          continue;
        }
        var buf = new Uint8Array(await file.arrayBuffer());
        files.push({ path: relPath, data: buf });
        bytes += buf.length;
      }
    }

    var start = await dirFor(rel, false);
    await walk(start, '.');
    return { dirs: dirs, files: files, skipped: skipped, bytes: bytes };
  }

  /**
   * Write raw bytes to a file, creating parent directories when asked.
   */
  async function writeBytes(rel, data, opts) {
    opts = opts || {};
    var split = P.splitPath(rel);
    if (split.isRoot) throw new Error('refusing to overwrite the picked folder');
    var dir = await getDir(split.dirs, opts.createParents !== false);
    var fileHandle = await dir.getFileHandle(split.name, { create: true });
    var writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
    return { path: rel.path, bytes: data ? data.length : 0 };
  }

  /**
   * Apply a MEMFS write-back diff under a walk root (the picked folder or cwd).
   * Returns { files, deleted, dirs } counts of successful operations.
   */
  async function applyDiff(rel, diff) {
    /* Counts reported back to run_command. */
    var wroteFiles = 0;
    var wroteDirs = 0;
    var deleted = 0;
    if (!diff) return { files: 0, deleted: 0, dirs: 0 };
    /* Resolve a path relative to the walk root back into a folder-relative WMPaths result. */
    function resolveUnder(path) {
      var prefix = rel && !rel.isRoot ? rel.path + '/' : '';
      return P.requirePath(prefix + path);
    }
    var i;
    for (i = 0; i < (diff.mkdirs || []).length; i++) {
      var dirRel = resolveUnder(diff.mkdirs[i]);
      await getDir(dirRel.parts, true);
      wroteDirs += 1;
    }
    for (i = 0; i < (diff.writes || []).length; i++) {
      var w = diff.writes[i];
      if (!w.data) continue;
      var fileRel = resolveUnder(w.path);
      await writeBytes(fileRel, w.data, { createParents: true });
      wroteFiles += 1;
    }
    for (i = 0; i < (diff.deletes || []).length; i++) {
      var delRel = resolveUnder(diff.deletes[i]);
      try {
        await deletePath(delRel, { recursive: false });
        deleted += 1;
      } catch (_) { /* already gone */ }
    }
    for (i = 0; i < (diff.rmdirs || []).length; i++) {
      var rmRel = resolveUnder(diff.rmdirs[i]);
      try {
        await deletePath(rmRel, { recursive: true });
        deleted += 1;
      } catch (_) { /* already gone or not empty after files were removed */ }
    }
    return { files: wroteFiles, deleted: deleted, dirs: wroteDirs };
  }

  /* Public filesystem API used by wm_tools, wm_cmd, and the UI. */
  var api = {
    init: init,
    pick: pick,
    allow: allow,
    onChange: onChange,
    folderName: folderName,
    isReady: isReady,
    getState: getState,
    isSupported: isSupported,
    readFile: readFile,
    writeFile: writeFile,
    writeBytes: writeBytes,
    listDir: listDir,
    deletePath: deletePath,
    movePath: movePath,
    walkStage: walkStage,
    applyDiff: applyDiff
  };
  root.WMFS = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
