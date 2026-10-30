// The small API object handed to every app: start(os) / open(os).
import * as storage from './storage.js';
import * as registry from './registry.js';
import * as wm from './wm.js';

export function createApi(log) {
  return Object.freeze({ storage, registry, wm, ui: wm, log });
}
