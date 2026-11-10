/* Web MCP — wm_cmd_diff.js: content-hash helpers and MEMFS write-back diff. MCP2 */
(function (root) {
  'use strict';

  /**
   * FNV-1a 32-bit hash of a byte array, returned with the length so a
   * size change always counts as a change even if the hash collided.
   */
  function hashBytes(bytes) {
    /* Treat missing data as an empty buffer. */
    var u8 = bytes || new Uint8Array(0);
    /* FNV offset basis. */
    var h = 2166136261 >>> 0;
    var i;
    for (i = 0; i < u8.length; i++) {
      h ^= u8[i];
      h = Math.imul(h, 16777619) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8) + ':' + u8.length;
  }

  /**
   * Record one staged or snapshot file as { size, hash, data? }.
   * data is kept for write-back of new or changed files.
   */
  function fileEntry(bytes) {
    var u8 = bytes || new Uint8Array(0);
    return { size: u8.length, hash: hashBytes(u8), data: u8 };
  }

  /**
   * Compare a before-tree and an after-tree under the staged root.
   * Each tree is { dirs: [relPath], files: { relPath: { size, hash, data? } } }.
   * Returns { mkdirs, writes, deletes, rmdirs }. The root itself is never deleted.
   */
  function diffTrees(before, after) {
    /* Normalize missing sides to empty trees. */
    var beforeDirs = (before && before.dirs) || [];
    var afterDirs = (after && after.dirs) || [];
    var beforeFiles = (before && before.files) || {};
    var afterFiles = (after && after.files) || {};

    /* Lookup sets for directory membership. */
    var beforeDirSet = Object.create(null);
    var afterDirSet = Object.create(null);
    var i;
    for (i = 0; i < beforeDirs.length; i++) beforeDirSet[beforeDirs[i]] = true;
    for (i = 0; i < afterDirs.length; i++) afterDirSet[afterDirs[i]] = true;

    /* New directories, shortest path first so parents are created first. */
    var mkdirs = [];
    for (i = 0; i < afterDirs.length; i++) {
      if (!beforeDirSet[afterDirs[i]]) mkdirs.push(afterDirs[i]);
    }
    mkdirs.sort(function (a, b) { return a.length - b.length; });

    /* New or changed files (content-hash / size). Need after.data to write them back. */
    var writes = [];
    Object.keys(afterFiles).forEach(function (path) {
      var next = afterFiles[path];
      var prev = beforeFiles[path];
      if (prev && prev.hash === next.hash && prev.size === next.size) return;
      writes.push({ path: path, data: next.data, size: next.size });
    });

    /* Files that were staged and are gone from MEMFS. */
    var deletes = [];
    Object.keys(beforeFiles).forEach(function (path) {
      if (!Object.prototype.hasOwnProperty.call(afterFiles, path)) {
        deletes.push(path);
      }
    });

    /* Directories that were staged and are gone; deepest first. Skip the implicit root. */
    var rmdirs = [];
    for (i = 0; i < beforeDirs.length; i++) {
      var d = beforeDirs[i];
      if (!d || d === '.' ) continue;
      if (!afterDirSet[d]) rmdirs.push(d);
    }
    rmdirs.sort(function (a, b) { return b.length - a.length; });

    return { mkdirs: mkdirs, writes: writes, deletes: deletes, rmdirs: rmdirs };
  }

  /**
   * True when a diff would write, create, or delete anything.
   */
  function isEmptyDiff(diff) {
    if (!diff) return true;
    return !diff.mkdirs.length && !diff.writes.length && !diff.deletes.length && !diff.rmdirs.length;
  }

  /* Public API, also exported for Node tests. */
  var api = {
    hashBytes: hashBytes,
    fileEntry: fileEntry,
    diffTrees: diffTrees,
    isEmptyDiff: isEmptyDiff
  };
  root.WMCmdDiff = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
