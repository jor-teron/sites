/* Web MCP MCP2 — command parser, write-back diff, and BusyBox-WASM in Node when it can run. */
'use strict';

var path = require('path');
var app = path.join(__dirname, '..');
var C = require(path.join(app, 'wm_config.js'));
var P = require(path.join(app, 'wm_paths.js'));
var Parse = require(path.join(app, 'wm_cmd_parse.js'));
var Diff = require(path.join(app, 'wm_cmd_diff.js'));
var Exec = require(path.join(app, 'wm_cmd_exec.js'));
var T = require(path.join(app, 'wm_tools.js'));
var R = require(path.join(app, 'wm_rpc.js'));

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    failed += 1;
    console.error('FAIL:', msg, 'got', JSON.stringify(actual), 'expected', JSON.stringify(expected));
  } else {
    console.log('ok:', msg);
  }
}

/* -------------------------------------------------------------------------- */
/* Parser                                                                     */
/* -------------------------------------------------------------------------- */

function parseOk(line, msg) {
  var p = Parse.parse(line);
  assert(p.ok, (msg || line) + ' should parse: ' + p.error);
  return p;
}

function parseFail(line, pattern, msg) {
  var p = Parse.parse(line);
  assert(!p.ok, (msg || line) + ' should be rejected');
  if (pattern) assert(pattern.test(p.error), (msg || line) + ' error: ' + p.error);
  return p;
}

assertEq(Parse.parse('').ok, false, 'empty command rejected');
assertEq(Parse.parse('').error, 'command is required', 'empty command message');

var echo = parseOk('echo hi', 'echo hi');
assertEq(echo.steps.length, 1, 'echo hi one step');
assertEq(echo.steps[0].commands.length, 1, 'echo hi one command');
assertEq(echo.steps[0].commands[0].argv.join(' '), 'echo hi', 'echo hi argv');
assertEq(echo.steps[0].commands[0].redir, null, 'echo hi no redirect');
assertEq(echo.steps[0].join, null, 'echo hi no join');

var quoted = parseOk('echo "hello world"', 'double quotes');
assertEq(quoted.steps[0].commands[0].argv[1], 'hello world', 'double quotes keep spaces');

var single = parseOk("echo 'hello world'", 'single quotes');
assertEq(single.steps[0].commands[0].argv[1], 'hello world', 'single quotes keep spaces');

var escaped = parseOk('echo hello\\ world', 'backslash escape');
assertEq(escaped.steps[0].commands[0].argv[1], 'hello world', 'backslash escape becomes a space');

var emptyq = parseOk('echo ""', 'empty double quotes');
assertEq(emptyq.steps[0].commands[0].argv[1], '', 'empty quoted word is kept');

var pipe = parseOk('echo hi | wc -l', 'pipe');
assertEq(pipe.steps.length, 1, 'pipe is one step');
assertEq(pipe.steps[0].commands.length, 2, 'pipe has two commands');
assertEq(pipe.steps[0].commands[0].argv.join(' '), 'echo hi', 'pipe left argv');
assertEq(pipe.steps[0].commands[1].argv.join(' '), 'wc -l', 'pipe right argv');

var andThen = parseOk('true && echo ok', '&&');
assertEq(andThen.steps.length, 2, '&& is two steps');
assertEq(andThen.steps[0].join, '&&', '&& join after first step');
assertEq(andThen.steps[1].commands[0].argv.join(' '), 'echo ok', '&& second argv');

var semi = parseOk('false; echo still', '; chain');
assertEq(semi.steps.length, 2, '; is two steps');
assertEq(semi.steps[0].join, ';', '; join after first step');

var redir = parseOk('echo hi > out.txt', 'redirect >');
assertEq(redir.steps[0].commands[0].redir.op, '>', 'redirect op');
assertEq(redir.steps[0].commands[0].redir.file, 'out.txt', 'redirect file');
assertEq(redir.steps[0].commands[0].argv.join(' '), 'echo hi', 'redirect argv excludes file');

var append = parseOk('echo hi >> out.txt', 'redirect >>');
assertEq(append.steps[0].commands[0].redir.op, '>>', 'append op');

var tight = parseOk('echo hi>out.txt', 'tight redirect');
assertEq(tight.steps[0].commands[0].redir.file, 'out.txt', 'tight redirect file');

var busy = parseOk('busybox echo hi', 'busybox multiplexer');
assertEq(busy.steps[0].commands[0].argv.join(' '), 'echo hi', 'busybox echo strips multiplexer');

parseFail('echo hi || echo no', /unsupported syntax: \|\|/, 'rejects ||');
parseFail('echo hi &', /unsupported syntax: &/, 'rejects background &');
parseFail('cat < in.txt', /unsupported syntax: </, 'rejects input redirect');
parseFail('echo $HOME', /unsupported syntax: \$/, 'rejects $ expansion');
parseFail('echo `whoami`', /unsupported syntax: backtick/, 'rejects backticks');
parseFail('echo $(pwd)', /unsupported syntax: \$/, 'rejects $()');
parseFail('echo hi # comment', /unsupported syntax: #/, 'rejects comments');
parseFail('echo "oops', /missing "/, 'rejects unclosed double quote');
parseFail("echo 'oops", /missing '/, 'rejects unclosed single quote');
parseFail('bash -c echo', /unknown applet: bash/, 'rejects unknown applet');
parseFail('echo hi |', /syntax error near '|'/, 'rejects trailing pipe');
parseFail('echo hi &&', /syntax error near '&&'/, 'rejects trailing &&');
parseFail('echo hi >', /file name missing/, 'rejects redirect without a file');
parseFail('echo a > b > c', /only one > or >>/, 'rejects two redirects');
parseFail('echo a > b | wc', /redirect > goes last/, 'rejects redirect in the middle of a pipe');
assert(Parse.parse('echo a | wc > out.txt').ok, 'redirect on last pipe stage parses');

/* -------------------------------------------------------------------------- */
/* Change-diff / write-back logic                                             */
/* -------------------------------------------------------------------------- */

var hello = Diff.fileEntry(new TextEncoder().encode('hello'));
var hello2 = Diff.fileEntry(new TextEncoder().encode('hello'));
assertEq(hello.hash, hello2.hash, 'same bytes share a hash');
assertEq(hello.size, 5, 'hello size is 5');

var before = {
  dirs: ['src'],
  files: {
    'readme.txt': Diff.fileEntry(new TextEncoder().encode('old\n')),
    'src/gone.txt': Diff.fileEntry(new TextEncoder().encode('bye\n')),
    'same.txt': Diff.fileEntry(new TextEncoder().encode('unchanged\n'))
  }
};
var after = {
  dirs: ['src', 'out'],
  files: {
    'readme.txt': Diff.fileEntry(new TextEncoder().encode('new\n')),
    'out/fresh.txt': Diff.fileEntry(new TextEncoder().encode('fresh\n')),
    'same.txt': Diff.fileEntry(new TextEncoder().encode('unchanged\n'))
  }
};
var diff = Diff.diffTrees(before, after);
assertEq(diff.mkdirs.join(','), 'out', 'diff mkdirs');
assertEq(diff.writes.map(function (w) { return w.path; }).sort().join(','), 'out/fresh.txt,readme.txt', 'diff writes');
assertEq(diff.deletes.sort().join(','), 'src/gone.txt', 'diff deletes');
assert(Diff.isEmptyDiff(Diff.diffTrees(before, before)), 'identical trees give an empty diff');
assert(!Diff.isEmptyDiff(diff), 'changed trees are not empty');

/* A failed command must not apply this diff — that decision lives in wm_cmd.js.
   The helper itself only reports the changes. */
var emptyAfter = { dirs: [], files: {} };
var wipe = Diff.diffTrees(before, emptyAfter);
assert(wipe.deletes.length >= 3, 'wiping the tree lists staged files as deletes');
assertEq(wipe.rmdirs.join(','), 'src', 'wiping the tree lists staged dirs');

/* -------------------------------------------------------------------------- */
/* tools/list advertises run_command                                          */
/* -------------------------------------------------------------------------- */

async function listTests() {
  var listed = await R.dispatch({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, {});
  var names = listed.reply.result.tools.map(function (t) { return t.name; });
  assert(names.indexOf('run_command') >= 0, 'tools/list includes run_command');
  var def = listed.reply.result.tools.filter(function (t) { return t.name === 'run_command'; })[0];
  assert(/no sh -c/.test(def.description), 'run_command description says no sh -c');
  assert(/no network/i.test(def.description), 'run_command description says no network');
  assert(/echo/.test(def.description) && /awk/.test(def.description), 'run_command description lists applets');
  assert(/\|/.test(def.description) && /&&/.test(def.description), 'run_command description lists supported syntax');
  assert(def.inputSchema.required.indexOf('command') >= 0, 'run_command requires command');
  assert(def.inputSchema.properties.cwd, 'run_command has cwd');
  assert(def.inputSchema.properties.timeout, 'run_command has timeout');
}

/* -------------------------------------------------------------------------- */
/* BusyBox-WASM in Node (skipped if the Emscripten build cannot run here)     */
/* -------------------------------------------------------------------------- */

async function tryBusyBox() {
  var factory;
  try {
    factory = require(path.join(app, 'vendor', 'busybox', 'busybox.js'));
  } catch (err) {
    console.log('skip: could not load busybox.js (' + (err && err.message) + ')');
    return;
  }
  try {
    var echoRun = await Exec.runPlan({
      BusyBoxModule: factory,
      dirs: [],
      files: [],
      steps: Parse.parse('echo hi').steps,
      memRoot: C.CMD_MEMFS_ROOT,
      maxOut: C.CMD_MAX_OUTPUT_BYTES
    });
    assertEq(echoRun.exit_code, 0, 'busybox echo hi exit 0');
    assertEq(Exec.decodeUtf8(echoRun.stdout).trim(), 'hi', 'busybox echo hi stdout');
    assertEq(echoRun.truncated, false, 'busybox echo hi not truncated');

    var staged = [
      { path: 'a.txt', data: new TextEncoder().encode('one\n') },
      { path: 'b.txt', data: new TextEncoder().encode('two\n') }
    ];
    var lsRun = await Exec.runPlan({
      BusyBoxModule: factory,
      dirs: [],
      files: staged,
      steps: Parse.parse('ls').steps,
      memRoot: C.CMD_MEMFS_ROOT,
      maxOut: C.CMD_MAX_OUTPUT_BYTES
    });
    assertEq(lsRun.exit_code, 0, 'busybox ls exit 0');
    var listing = Exec.decodeUtf8(lsRun.stdout);
    assert(/a\.txt/.test(listing) && /b\.txt/.test(listing), 'busybox ls lists staged files');

    var pipeRun = await Exec.runPlan({
      BusyBoxModule: factory,
      dirs: [],
      files: [],
      steps: Parse.parse('echo hi | wc -l').steps,
      memRoot: C.CMD_MEMFS_ROOT,
      maxOut: C.CMD_MAX_OUTPUT_BYTES
    });
    assertEq(pipeRun.exit_code, 0, 'busybox pipe exit 0');
    assertEq(Exec.decodeUtf8(pipeRun.stdout).trim(), '1', 'busybox echo hi | wc -l is 1');

    var redirRun = await Exec.runPlan({
      BusyBoxModule: factory,
      dirs: [],
      files: [],
      steps: Parse.parse('echo hi > out.txt').steps,
      memRoot: C.CMD_MEMFS_ROOT,
      maxOut: C.CMD_MAX_OUTPUT_BYTES
    });
    assertEq(redirRun.exit_code, 0, 'busybox redirect exit 0');
    assertEq(Exec.decodeUtf8(redirRun.stdout), '', 'busybox redirect has empty stdout');
    assert(redirRun.after.files['out.txt'], 'busybox redirect created out.txt');
    assertEq(Exec.decodeUtf8(redirRun.after.files['out.txt'].data).trim(), 'hi', 'busybox redirect wrote hi');

    var failRun = await Exec.runPlan({
      BusyBoxModule: factory,
      dirs: [],
      files: [],
      steps: Parse.parse('false').steps,
      memRoot: C.CMD_MEMFS_ROOT,
      maxOut: C.CMD_MAX_OUTPUT_BYTES
    });
    assertEq(failRun.exit_code, 1, 'busybox false exits 1');
  } catch (err) {
    console.log('skip: busybox.wasm did not run in Node (' + (err && err.stack ? err.stack : err) + ')');
  }
}

listTests()
  .then(tryBusyBox)
  .then(function () {
    if (failed) {
      console.error(failed + ' failed');
      process.exit(1);
    }
    console.log('All tests passed');
  })
  .catch(function (err) {
    console.error('ERROR:', err && err.stack ? err.stack : err);
    process.exit(1);
  });
