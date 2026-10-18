/*
  File: story_db.js
  Project: AI Story
  Description: IndexedDB chat history (30-day retention). Every call fails
               soft: if IndexedDB is blocked/unavailable the app still works,
               just without history.
*/
const DB_NAME = "story-db";
const STORE = "chat-history";
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
let db = null;

/** Open the DB; resolves null on any error (never hangs). */
export function openDB() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        }
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

/** Save one message. */
export function saveMessage(role, content) {
  if (!db) return;
  try { db.transaction(STORE, "readwrite").objectStore(STORE).add({ role, content, timestamp: Date.now() }); } catch {}
}

/** Return messages newer than 30 days (oldest first) and delete older ones. */
export function loadHistory() {
  return new Promise((resolve) => {
    if (!db) return resolve([]);
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const cutoff = Date.now() - KEEP_MS;
        req.result.forEach((m) => { if (m.timestamp <= cutoff) store.delete(m.id); });
        resolve(req.result.filter((m) => m.timestamp > cutoff));
      };
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}

/** Delete all history. */
export function clearHistory() {
  if (!db) return;
  try { db.transaction(STORE, "readwrite").objectStore(STORE).clear(); } catch {}
}
