/* Web MCP — wm_tools.js: file tools matching Linux MCP v2 names and schemas. MCP1 */
(function (root) {
  'use strict';

  /* Shared config and path helper, from the global or via require() in tests. */
  var C = root.WM_CONFIG || (typeof require === 'function' ? require('./wm_config.js') : {});
  var P = root.WMPaths || (typeof require === 'function' ? require('./wm_paths.js') : {});

  /**
   * Replace old_string with new_string in text. Errors if old_string is missing
   * or (unless replaceAll) appears more than once. Counts are non-overlapping,
   * matching Python str.count / str.replace used by Linux MCP v2.
   * Returns { text, replacements }.
   */
  function applyEdit(text, oldString, newString, replaceAll) {
    /* old_string must be a non-empty string, same rule as Linux v2. */
    if (typeof oldString !== 'string' || oldString === '') {
      throw new Error('old_string is required');
    }
    /* new_string may be empty (a deletion) but must still be a string. */
    if (typeof newString !== 'string') {
      throw new Error('new_string must be a string');
    }
    /* Source text is always a string by the time we get here. */
    var src = text == null ? '' : String(text);
    /* Non-overlapping occurrence count, like Python str.count. */
    var count = 0;
    var idx = 0;
    while (true) {
      var found = src.indexOf(oldString, idx);
      if (found < 0) break;
      count += 1;
      idx = found + oldString.length;
    }
    if (count === 0) {
      throw new Error('old_string not found');
    }
    if (count > 1 && !replaceAll) {
      throw new Error(
        'old_string is ambiguous (' + count + ' matches); set replace_all or use more context'
      );
    }
    /* replace_all uses split/join so the pattern is treated as literal text. */
    var updated = replaceAll
      ? src.split(oldString).join(newString)
      : src.replace(oldString, newString);
    return { text: updated, replacements: replaceAll ? count : 1 };
  }

  /**
   * Build the MCP tool list (file tools only; run_command arrives in MCP2).
   * Schemas match Linux MCP v2: old_string/new_string, src/dest, create_parents.
   */
  function toolDefs() {
    return [
      {
        name: 'read_file',
        description: 'Read a UTF-8 text file inside the picked folder (invalid bytes replaced). Capped at 1MB.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            offset: { type: 'integer', description: '0-based start line' },
            limit: { type: 'integer', description: 'Maximum number of lines' },
            max_bytes: { type: 'integer', description: 'Byte cap when not using lines' }
          },
          required: ['path']
        }
      },
      {
        name: 'write_file',
        description: 'Write a UTF-8 text file inside the picked folder. Parent directories are created by default.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
            create_parents: { type: 'boolean' }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'edit_file',
        description: 'Replace old_string with new_string. Errors if not found or ambiguous.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            old_string: { type: 'string' },
            new_string: { type: 'string' },
            replace_all: { type: 'boolean' }
          },
          required: ['path', 'old_string', 'new_string']
        }
      },
      {
        name: 'list_dir',
        description: 'List a directory inside the picked folder.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            recursive: { type: 'boolean' },
            max_depth: { type: 'integer', description: 'Directory depth cap (max 8)' }
          },
          required: ['path']
        }
      },
      {
        name: 'delete_path',
        description: 'Delete a file or directory (directories need recursive). Refuses to delete the picked folder itself.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            recursive: { type: 'boolean' }
          },
          required: ['path']
        }
      },
      {
        name: 'move_path',
        description: 'Rename or move a path inside the picked folder (copy+delete if the browser has no handle.move).',
        inputSchema: {
          type: 'object',
          properties: {
            src: { type: 'string' },
            dest: { type: 'string' }
          },
          required: ['src', 'dest']
        }
      }
    ];
  }

  /**
   * Pull a path-like value out of tool arguments for the live log.
   */
  function argPath(args) {
    if (!args || typeof args !== 'object') return '';
    return args.path || args.src || args.dest || '';
  }

  /**
   * Bind the six file tools to a filesystem object (real WMFS, or a fake in tests).
   * Each tool checks permission first and then containment via WMPaths.
   */
  function createTools(fs) {
    /* Shared "is the folder allowed?" gate used by every tool. */
    function requireReady() {
      if (!fs || typeof fs.isReady !== 'function' || !fs.isReady()) {
        throw new Error(C.PERMISSION_ERROR);
      }
    }

    /* read_file: {path, offset?, limit?, max_bytes?} */
    async function read_file(args) {
      requireReady();
      var rel = P.requirePath(args && args.path);
      var maxBytes = C.MAX_READ_BYTES;
      if (args && args.max_bytes != null) {
        var n = parseInt(args.max_bytes, 10);
        if (!isFinite(n)) throw new Error('max_bytes must be an integer');
        maxBytes = Math.max(1, Math.min(n, C.MAX_READ_BYTES));
      }
      return fs.readFile(rel, {
        offset: args && args.offset,
        limit: args && args.limit,
        maxBytes: maxBytes
      });
    }

    /* write_file: {path, content, create_parents?} — parents are created when the flag is omitted. */
    async function write_file(args) {
      requireReady();
      if (!args || typeof args.content !== 'string') {
        throw new Error('content must be a string');
      }
      var rel = P.requirePath(args.path);
      if (rel.isRoot) throw new Error('refusing to overwrite the picked folder');
      var createParents = args.create_parents === undefined ? true : !!args.create_parents;
      return fs.writeFile(rel, args.content, { createParents: createParents });
    }

    /* edit_file: {path, old_string, new_string, replace_all?}; also accepts old_text/new_text. */
    async function edit_file(args) {
      requireReady();
      var rel = P.requirePath(args && args.path);
      var oldString = args && (args.old_string != null ? args.old_string : args.old_text);
      var newString = args && (args.new_string != null ? args.new_string : args.new_text);
      var current = await fs.readFile(rel, { maxBytes: C.MAX_READ_BYTES });
      if (current.truncated) {
        throw new Error('file is larger than the edit cap (' + C.MAX_READ_BYTES + ' bytes)');
      }
      var edited = applyEdit(current.content, oldString, newString, !!(args && args.replace_all));
      await fs.writeFile(rel, edited.text, { createParents: false });
      return { path: rel.path, replacements: edited.replacements };
    }

    /* list_dir: {path, recursive?, max_depth?} */
    async function list_dir(args) {
      requireReady();
      var rel = P.requirePath(args && args.path);
      var recursive = !!(args && args.recursive);
      var maxDepth = recursive ? C.DEFAULT_RECURSIVE_DEPTH : 1;
      if (args && args.max_depth != null) {
        var depth = parseInt(args.max_depth, 10);
        if (!isFinite(depth)) throw new Error('max_depth must be an integer');
        maxDepth = depth;
      }
      maxDepth = Math.max(1, Math.min(maxDepth, C.MAX_WALK_DEPTH));
      return fs.listDir(rel, { recursive: recursive, maxDepth: maxDepth });
    }

    /* delete_path: {path, recursive?} — never deletes the picked folder root. */
    async function delete_path(args) {
      requireReady();
      var rel = P.requirePath(args && args.path);
      if (rel.isRoot) throw new Error('refusing to delete the picked folder');
      return fs.deletePath(rel, { recursive: !!(args && args.recursive) });
    }

    /* move_path: {src, dest} — also accepts path as src and dst as dest. */
    async function move_path(args) {
      requireReady();
      var srcRaw = args && (args.src != null ? args.src : args.path);
      var destRaw = args && (args.dest != null ? args.dest : args.dst);
      var src = P.requirePath(srcRaw);
      var dest = P.requirePath(destRaw);
      if (src.isRoot) throw new Error('refusing to move the picked folder');
      if (dest.isRoot) throw new Error('destination cannot be the picked folder itself');
      /* A path must not be moved onto one of its own descendants. */
      if (dest.path === src.path || dest.path.indexOf(src.path + '/') === 0) {
        throw new Error('cannot move a path onto itself');
      }
      return fs.movePath(src, dest);
    }

    return {
      read_file: read_file,
      write_file: write_file,
      edit_file: edit_file,
      list_dir: list_dir,
      delete_path: delete_path,
      move_path: move_path
    };
  }

  /* Public API, also exported for Node tests. */
  var api = {
    applyEdit: applyEdit,
    toolDefs: toolDefs,
    argPath: argPath,
    createTools: createTools
  };
  root.WMTools = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
