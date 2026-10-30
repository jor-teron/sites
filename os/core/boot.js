// Boot loader: init storage, load packages, run autostart apps.
import * as storage from './storage.js';
import * as registry from './registry.js';
import { createApi } from './api.js';

const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');

function log(line) {
  logEl.textContent += line + '\n';
}

async function boot() {
  log('boot: start');
  log('storage: ' + (await storage.init()));

  const probe = '/.boot/probe.txt';
  const stamp = new Date().toISOString();
  await storage.writeFile(probe, stamp);
  if ((await storage.readFile(probe)) !== stamp) throw new Error('storage write/read mismatch');
  log('storage: write/read ok');

  const { loaded, failed } = await registry.loadPackages(log);
  log(`registry: ${loaded} package(s), ${failed} failed`);

  const os = createApi(log);
  globalThis.jorOS = os;
  for (const app of registry.list().filter(a => a.autostart)) {
    try {
      await registry.start(app.id, os);
    } catch (e) {
      log('app ' + app.id + ' failed: ' + e.message);
    }
  }

  statusEl.textContent = 'OS booted';
  log('boot: done');
}

boot().catch(err => {
  statusEl.textContent = 'OS boot failed';
  log('error: ' + err.message);
});
