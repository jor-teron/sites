/*
================================================================================
File: local-ai-chat-cache.js
Project: local-ai-chat
Description: Model cache helpers for Local AI Chat.
Purpose: Reads and manages transformers.js's Cache Storage ('transformers-cache')
         per model: is it downloaded, how big, delete it, and the 100-day
         refresh timestamp.
Author: Grok
Date: 2026-10-19 (R2: new file; cache check + delete, fixed 100-day logic)
================================================================================
*/

// transformers.js stores every fetched file here, keyed by its full URL:
// https://huggingface.co/<model id>/resolve/main/<file>
const CACHE_NAME = 'transformers-cache';
const HF_HOST = 'https://huggingface.co/';
const CACHE_DAYS = 100;
const LS_CACHE_TIME = 'localAiChatCacheTime';

/**
 * Opens the transformers.js cache (null if Cache Storage is unavailable,
 * e.g. some private windows).
 * @returns {Promise<Cache|null>}
 */
async function openCache() {
    try {
        return typeof caches === 'undefined' ? null : await caches.open(CACHE_NAME);
    } catch {
        return null;
    }
}

/**
 * Cache entries (requests) that belong to one model.
 * @param {Cache} cache - Opened cache
 * @param {string} modelId - Model id
 * @returns {Promise<Request[]>}
 */
async function modelEntries(cache, modelId) {
    const prefix = `${HF_HOST}${modelId}/resolve/`;
    const keys = await cache.keys();
    return keys.filter(req => req.url.startsWith(prefix));
}

/**
 * True when all of the model's q4 ONNX files are already cached.
 * @param {object} model - Model definition (id, files)
 * @returns {Promise<boolean>}
 */
export async function isCached(model) {
    const cache = await openCache();
    if (!cache) return false;
    const urls = (await modelEntries(cache, model.id)).map(r => r.url);
    return model.files.every(f => urls.some(u => u.endsWith('/' + f)));
}

/**
 * Total cached bytes for a model (content-length, else blob size).
 * @param {string} modelId - Model id
 * @returns {Promise<number>} Bytes (0 = not downloaded)
 */
export async function cachedBytes(modelId) {
    const cache = await openCache();
    if (!cache) return 0;
    let total = 0;
    for (const req of await modelEntries(cache, modelId)) {
        const res = await cache.match(req);
        if (!res) continue;
        const len = parseInt(res.headers.get('content-length'), 10);
        total += Number.isFinite(len) ? len : (await res.blob()).size;
    }
    return total;
}

/**
 * Deletes a model's cached files and its timestamp.
 * @param {string} modelId - Model id
 * @returns {Promise<number>} Number of entries removed
 */
export async function deleteModelCache(modelId) {
    localStorage.removeItem(`${LS_CACHE_TIME}_${modelId}`);
    const cache = await openCache();
    if (!cache) return 0;
    const entries = await modelEntries(cache, modelId);
    await Promise.all(entries.map(req => cache.delete(req)));
    return entries.length;
}

/**
 * 100-day policy: only when a timestamp exists AND is older than CACHE_DAYS
 * are that model's entries deleted (so it downloads fresh). A missing
 * timestamp never triggers a delete (R1 treated "missing" as "expired").
 * @param {string} modelId - Model id
 * @returns {Promise<boolean>} True if the cache was expired and cleared
 */
export async function expireIfOld(modelId) {
    const stored = parseInt(localStorage.getItem(`${LS_CACHE_TIME}_${modelId}`), 10);
    if (!Number.isFinite(stored)) return false;
    const ageDays = (Date.now() - stored) / 86400000;
    if (ageDays <= CACHE_DAYS) return false;
    await deleteModelCache(modelId);
    return true;
}

/**
 * Records the download time for a model if none is stored yet (so the
 * 100 days count from the first download, not from every load).
 * @param {string} modelId - Model id
 */
export function markDownloaded(modelId) {
    const key = `${LS_CACHE_TIME}_${modelId}`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, Date.now().toString());
}

/**
 * Formats bytes as 'not downloaded' / '182 MB'.
 * @param {number} bytes - Size in bytes
 * @returns {string}
 */
export function formatSize(bytes) {
    return bytes > 0 ? `${Math.round(bytes / 1e6)} MB` : 'not downloaded';
}
