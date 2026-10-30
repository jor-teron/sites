// The small API object handed to every app's start(os).
import * as storage from './storage.js';
import * as registry from './registry.js';

export function createApi(log) {
  return Object.freeze({ storage, registry, log });
}
