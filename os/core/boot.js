// Boot loader: init storage and registry, log steps to the page.
import * as storage from './storage.js';
import * as registry from './registry.js';

const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');

function log(line) {
  logEl.textContent += line + '\n';
}

async function boot() {
  log('boot: start');
  const backend = await storage.init();
  log('storage: ' + backend);

  const probe = '/.boot/probe.txt';
  const stamp = new Date().toISOString();
  await storage.writeFile(probe, stamp);
  const back = await storage.readFile(probe);
  if (back !== stamp) throw new Error('storage write/read mismatch');
  log('storage: write/read ok');

  const n = await registry.loadPackages();
  log('registry: ' + n + ' package(s)');

  statusEl.textContent = 'OS booted';
  log('boot: done');
  globalThis.jorOS = { storage, registry };
}

boot().catch(err => {
  statusEl.textContent = 'OS boot failed';
  log('error: ' + err.message);
});
