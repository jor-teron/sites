/* Web MCP — wm_cmd_parse.js: small command parser for run_command (no sh -c). MCP2 */
(function (root) {
  'use strict';

  /* Shared config, from the global or via require() in tests. */
  var C = root.WM_CONFIG || (typeof require === 'function' ? require('./wm_config.js') : {});

  /* Set of supported BusyBox applet names, built once from the config list. */
  var APPLET_SET = (function () {
    var set = Object.create(null);
    var list = C.CMD_APPLETS || [];
    var i;
    for (i = 0; i < list.length; i++) set[list[i]] = true;
    return set;
  })();

  /**
   * True when name is a built-in BusyBox applet (or the busybox multiplexer).
   */
  function isApplet(name) {
    return !!name && (name === 'busybox' || APPLET_SET[name] === true);
  }

  /**
   * Build a clear error for syntax the parser refuses to run.
   */
  function unsupported(what, hint) {
    return 'unsupported syntax: ' + what + ' (no sh -c' + (hint ? '; ' + hint : '') + ')';
  }

  /**
   * Tokenize a command string into words and operators.
   * Words may be quoted ('...' or "...") with backslash escapes.
   * Operators recognized: |  &&  ;  >  >>
   * Everything else that looks like shell syntax is rejected.
   * Returns { ok, error, tokens } where tokens are { kind: 'word', value } or { kind: 'op', value }.
   */
  function tokenize(str) {
    /* Accumulated tokens, in order. */
    var tokens = [];
    /* Current word being built. */
    var cur = '';
    /* True once the current word has at least one (possibly empty-quoted) character. */
    var has = false;
    /* Current quote: '' | "'" | '"'. */
    var q = '';
    /* Helper: flush the current word if one is in progress. */
    function flush() {
      if (has || cur) {
        tokens.push({ kind: 'word', value: cur });
        cur = '';
        has = false;
      }
    }
    var i;
    for (i = 0; i < str.length; i++) {
      var c = str[i];
      /* Inside quotes: most characters are literal. */
      if (q) {
        if (c === q) {
          /* Closing quote. An empty quoted string still counts as a word. */
          q = '';
          has = true;
        } else if (c === '\\' && q === '"' && i + 1 < str.length) {
          /* Double-quoted escapes for \, ", $, and `. Other \X stay as \X. */
          var n = str[i + 1];
          if (n === '\\' || n === '"' || n === '$' || n === '`') {
            cur += n;
            i += 1;
          } else {
            cur += c;
          }
        } else if (q === '"' && (c === '$' || c === '`')) {
          return { ok: false, error: unsupported(c === '`' ? 'backtick' : '$', 'no parameter expansion'), tokens: [] };
        } else {
          cur += c;
        }
        continue;
      }
      /* Start of a quoted string. */
      if (c === '"' || c === "'") {
        q = c;
        has = true;
        continue;
      }
      /* Unquoted backslash escapes the next character (except end of string). */
      if (c === '\\') {
        if (i + 1 >= str.length) {
          return { ok: false, error: 'unexpected end of line (dangling backslash)', tokens: [] };
        }
        cur += str[i + 1];
        has = true;
        i += 1;
        continue;
      }
      /* Operators and whitespace, only meaningful outside quotes. */
      if (c === '|') {
        if (str[i + 1] === '|') {
          return { ok: false, error: unsupported('||', 'only |, &&, ;, > and >> are supported'), tokens: [] };
        }
        flush();
        tokens.push({ kind: 'op', value: '|' });
        continue;
      }
      if (c === '&') {
        if (str[i + 1] === '&') {
          flush();
          tokens.push({ kind: 'op', value: '&&' });
          i += 1;
          continue;
        }
        return { ok: false, error: unsupported('&', 'no background jobs'), tokens: [] };
      }
      if (c === ';') {
        flush();
        tokens.push({ kind: 'op', value: ';' });
        continue;
      }
      if (c === '>') {
        flush();
        if (str[i + 1] === '>') {
          tokens.push({ kind: 'op', value: '>>' });
          i += 1;
        } else {
          tokens.push({ kind: 'op', value: '>' });
        }
        continue;
      }
      if (c === '<') {
        return { ok: false, error: unsupported('<', 'stdin comes from a pipe, not a file redirect'), tokens: [] };
      }
      if (c === '`' || c === '$' || c === '(' || c === ')') {
        var label = c === '`' ? 'backtick' : c;
        return { ok: false, error: unsupported(label, 'no expansion or subshells'), tokens: [] };
      }
      if (c === '#') {
        return { ok: false, error: unsupported('#', 'comments are not supported'), tokens: [] };
      }
      if (c === '\n' || c === '\r') {
        return { ok: false, error: unsupported('newline', 'use ; or && to chain commands'), tokens: [] };
      }
      if (/\s/.test(c)) {
        flush();
        continue;
      }
      cur += c;
    }
    if (q) {
      return { ok: false, error: 'unexpected end of line (missing ' + q + ')', tokens: [] };
    }
    flush();
    return { ok: true, error: '', tokens: tokens };
  }

  /**
   * Parse one command (argv plus an optional > or >>) from tokens starting at index i.
   * Stops before |, &&, ;, or the end. Returns { ok, error, command, next }.
   */
  function parseCommand(tokens, i) {
    /* Words belonging to this command, in order. */
    var argv = [];
    /* Redirect attached to this command, or null. */
    var redir = null;
    while (i < tokens.length) {
      var tok = tokens[i];
      if (tok.kind === 'op') {
        if (tok.value === '|' || tok.value === '&&' || tok.value === ';') break;
        if (tok.value === '>' || tok.value === '>>') {
          if (redir) {
            return { ok: false, error: 'only one > or >> per command', command: null, next: i };
          }
          var fileTok = tokens[i + 1];
          if (!fileTok || fileTok.kind !== 'word') {
            return { ok: false, error: "syntax error: file name missing after '" + tok.value + "'", command: null, next: i };
          }
          redir = { op: tok.value, file: fileTok.value };
          i += 2;
          continue;
        }
        return { ok: false, error: unsupported(tok.value), command: null, next: i };
      }
      argv.push(tok.value);
      i += 1;
    }
    if (!argv.length) {
      return { ok: false, error: 'empty command', command: null, next: i };
    }
    return { ok: true, error: '', command: { argv: argv, redir: redir }, next: i };
  }

  /**
   * Resolve argv[0] to a BusyBox applet. Accepts "echo", "busybox echo", and /bin/echo.
   * Returns { ok, error, argv } with argv[0] set to the applet name.
   */
  function resolveArgv(argv) {
    /* Copy so the caller's array is left alone. */
    var words = argv.slice();
    /* Leading word is the program name. */
    var name = words[0];
    if (name === 'busybox') {
      words = words.slice(1);
      if (!words.length) words = ['busybox', '--help'];
      else if (words[0].charAt(0) === '-') words = ['busybox'].concat(words);
      name = words[0];
    } else if (name.indexOf('/bin/') === 0) {
      words = [name.slice(5)].concat(words.slice(1));
      name = words[0];
    }
    if (!isApplet(name)) {
      return {
        ok: false,
        error: 'unknown applet: ' + name + ' (no sh -c; this is BusyBox, not a shell)',
        argv: null
      };
    }
    return { ok: true, error: '', argv: words };
  }

  /**
   * Parse a full command string into a list of pipeline steps joined by && or ;.
   * Returns { ok, error, steps } where each step is
   *   { commands: [{ argv, redir }], join: '&&' | ';' | null }.
   * join is the connector *after* the step (null on the last step).
   */
  function parse(str) {
    /* Missing or non-string input is rejected the same way as Linux v2. */
    if (typeof str !== 'string' || str === '') {
      return { ok: false, error: 'command is required', steps: [] };
    }
    /* Hard cap so a huge string cannot stall the parser. */
    var maxChars = C.CMD_MAX_COMMAND_CHARS || 8192;
    if (str.length > maxChars) {
      return { ok: false, error: 'command is too long', steps: [] };
    }
    var lexed = tokenize(str);
    if (!lexed.ok) return { ok: false, error: lexed.error, steps: [] };
    var tokens = lexed.tokens;
    if (!tokens.length) return { ok: false, error: 'empty command', steps: [] };

    /* Steps accumulated so far. */
    var steps = [];
    /* Commands of the pipeline currently being built. */
    var commands = [];
    var i = 0;
    while (i < tokens.length) {
      var parsed = parseCommand(tokens, i);
      if (!parsed.ok) return { ok: false, error: parsed.error, steps: [] };
      var resolved = resolveArgv(parsed.command.argv);
      if (!resolved.ok) return { ok: false, error: resolved.error, steps: [] };
      /* A redirect is only allowed on the last command of a pipeline (checked when we see |). */
      commands.push({ argv: resolved.argv, redir: parsed.command.redir });
      i = parsed.next;
      var op = (i < tokens.length && tokens[i].kind === 'op') ? tokens[i].value : null;
      if (op === '|') {
        var last = commands[commands.length - 1];
        if (last.redir) {
          return { ok: false, error: 'the redirect > goes last (no redirect in the middle of a pipe)', steps: [] };
        }
        i += 1;
        if (i >= tokens.length) {
          return { ok: false, error: "syntax error near '|'", steps: [] };
        }
        continue;
      }
      if (op === '&&' || op === ';') {
        i += 1;
        if (i >= tokens.length) {
          return { ok: false, error: "syntax error near '" + op + "'", steps: [] };
        }
        steps.push({ commands: commands, join: op });
        commands = [];
        continue;
      }
      if (op) {
        return { ok: false, error: unsupported(op), steps: [] };
      }
      /* End of the string: flush the last step. */
      steps.push({ commands: commands, join: null });
      commands = [];
    }
    if (commands.length) {
      return { ok: false, error: 'empty command', steps: [] };
    }
    return { ok: true, error: '', steps: steps };
  }

  /* Public API, also exported for Node tests. */
  var api = {
    isApplet: isApplet,
    tokenize: tokenize,
    parse: parse
  };
  root.WMCmdParse = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
