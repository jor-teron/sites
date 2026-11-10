/* RL1 installer tests use a fake curl and isolated folders, never the network. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync, spawn } = require('node:child_process');
const { request } = require('./helpers.cjs');
const ROOT = path.resolve(__dirname, '..');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl1-install-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'bin'), install = path.join(dir, 'user folder'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'curl'), `#!/usr/bin/env bash
set -euo pipefail
URL=''
DEST=''
while [ $# -gt 0 ]; do
  case "$1" in https://raw.githubusercontent.com/jor-teron/sites/main/hub/relay/*) URL="$1" ;; -o) shift; DEST="$1" ;; esac
  shift
done
[ -n "$URL" ] && [ -n "$DEST" ]
NAME="\${URL##*/}"
if [ "$NAME" = "\${RL1_FAIL_DOWNLOAD:-}" ]; then exit 22; fi
cp "$RL1_FIXTURE/$NAME" "$DEST"
`, { mode: 0o700 });
  const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH, HUB_RELAY_DIR: install,
    HUB_RELAY_INSTALL_ONLY: '1', RL1_FIXTURE: ROOT };
  // Prevent a developer's optional runtime overrides influencing the test.
  for (const name of Object.keys(env)) if (name.startsWith('HUB_RELAY_') && !['HUB_RELAY_DIR', 'HUB_RELAY_INSTALL_ONLY'].includes(name)) delete env[name];
  return { dir, install, env, run(extra = {}) {
    return spawnSync('bash', [path.join(ROOT, 'install.sh')], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 15000 });
  } };
}
test('Bash syntax and local --help do not download or start services', () => {
  for (const name of ['install.sh', 'start-relay.sh']) assert.equal(spawnSync('bash', ['-n', path.join(ROOT, name)]).status, 0);
  const help = spawnSync('bash', [path.join(ROOT, 'start-relay.sh'), '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /modules mcp,tcp,fetch/);
  assert.match(help.stdout, /No services or network routes/);
});
test('install stages downloads, preserves custom config/targets and backs up old runtime', t => {
  const f = fixture(t), first = f.run(); assert.equal(first.status, 0, first.stderr);
  assert.ok(fs.existsSync(path.join(f.install, 'hub-relay.js')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.install, 'relay.json'))).HOST, '127.0.0.1');
  const custom = '{"PORT":9876,"MODULES":[]}\n'; fs.writeFileSync(path.join(f.install, 'relay.json'), custom);
  fs.writeFileSync(path.join(f.install, 'tcp_allowlist.txt'), '127.0.0.1:22\n');
  fs.writeFileSync(path.join(f.install, 'hub-relay.js'), '// old runtime\n');
  const update = f.run(); assert.equal(update.status, 0, update.stderr);
  assert.equal(fs.readFileSync(path.join(f.install, 'relay.json'), 'utf8'), custom);
  assert.equal(fs.readFileSync(path.join(f.install, 'tcp_allowlist.txt'), 'utf8'), '127.0.0.1:22\n');
  const backups = fs.readdirSync(f.install).filter(name => name.startsWith('before-RL1.')); assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(f.install, backups[0], 'hub-relay.js'), 'utf8'), '// old runtime\n');
});
test('a failed download leaves the current runtime and user configuration untouched', t => {
  const f = fixture(t); fs.mkdirSync(f.install); fs.writeFileSync(path.join(f.install, 'hub-relay.js'), 'old runtime');
  fs.writeFileSync(path.join(f.install, 'relay.json'), '{"PORT":9876}');
  const failed = f.run({ RL1_FAIL_DOWNLOAD: 'mod_tcp.js' }); assert.notEqual(failed.status, 0);
  assert.equal(fs.readFileSync(path.join(f.install, 'hub-relay.js'), 'utf8'), 'old runtime');
  assert.equal(fs.readFileSync(path.join(f.install, 'relay.json'), 'utf8'), '{"PORT":9876}');
  assert.equal(fs.readdirSync(f.install).length, 2);
});
test('start script loads sibling config, accepts flags and exits cleanly on SIGTERM', async t => {
  const f = fixture(t); assert.equal(f.run().status, 0);
  fs.writeFileSync(path.join(f.install, 'relay.json'), JSON.stringify({ PORT: 0, MODULES: ['fetch'] }));
  const child = spawn('bash', [path.join(f.install, 'start-relay.sh'), '--modules', 'tcp'], { env: f.env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const banner = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('relay startup timeout')), 3000);
    child.stdout.on('data', chunk => {
      output += chunk;
      if (/Hub relay.*:(\d+)  modules: tcp/.test(output)) { clearTimeout(timer); resolve(output); }
    });
    child.on('error', reject);
    child.on('exit', code => { if (code) { clearTimeout(timer); reject(new Error('startup exit ' + code)); } });
  });
  const port = Number(banner.match(/Hub relay.*:(\d+)  modules: tcp/)[1]);
  assert.match((await request(port)).text, /modules: tcp/);
  const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  child.kill('SIGTERM'); assert.deepEqual(await exit, { code: 0, signal: null });
});
test('Windows installer and start script share the full runtime list (static check)', () => {
  const sh = fs.readFileSync(path.join(ROOT, 'install.sh'), 'utf8');
  const ps = fs.readFileSync(path.join(ROOT, 'install.ps1'), 'utf8');
  const files = sh.match(/FILES=\(([^)]+)\)/)[1].split(/\s+/);
  for (const file of files) assert.ok(ps.includes("'" + file + "'"), file);
  assert.ok(ps.includes('https://raw.githubusercontent.com/jor-teron/sites/main/hub/relay'));
  assert.ok(ps.includes('HUB_RELAY_INSTALL_ONLY')); assert.ok(ps.includes('before-RL1-'));
  assert.ok(!ps.includes('ExecutionPolicy')); assert.ok(!ps.includes('Start-Service'));
});
