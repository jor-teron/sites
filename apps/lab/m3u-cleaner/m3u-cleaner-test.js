/*
================================================================================
File: m3u-cleaner-test.js
Project: m3u-cleaner
Description: Stream tester for the Channel Cleaner.
Purpose: Honest reachability check. A normal (CORS) GET reads only the first
         chunk: #EXTM3U playlist or video content-type = 'ok', HTTP 4xx/5xx =
         'fail'. When the server blocks cross-site reads, a no-cors request
         can only prove the server answered, so that is 'unsure', never 'ok'.
Author: Grok
Date: 2026-10-19 (R1)
================================================================================
*/

// Total attempts per channel (1 try + 1 retry); only network errors/timeouts retry
export const ATTEMPTS = 2;

// Timeout per request in milliseconds
export const TIMEOUT_MS = 8000;

// Content types that mean "this is a media stream"
const MEDIA_TYPE = /video|audio|mpegts|mp2t|octet-stream/i;

/**
 * Runs fetch with its own timeout; always clears the timer and aborts after.
 * @param {string} url
 * @param {object} opts - fetch options
 * @param {(res: Response) => Promise<any>} use - reads what it needs from res
 */
async function timedFetch(url, opts, use) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, { ...opts, cache: 'no-store', signal: controller.signal });
        return await use(res);
    } finally {
        clearTimeout(timer);
        controller.abort(); // stop downloading the rest of the stream
    }
}

/**
 * Reads only the first chunk of a response body as text.
 * @param {Response} res
 * @returns {Promise<string>}
 */
async function firstChunk(res) {
    if (!res.body) return '';
    const reader = res.body.getReader();
    try {
        const { value } = await reader.read();
        return value ? new TextDecoder().decode(value.slice(0, 512)) : '';
    } finally {
        reader.cancel().catch(() => {});
    }
}

/**
 * One attempt. Returns 'ok' | 'fail' | 'unsure', or 'retry' on network error.
 * @param {string} url
 */
async function attempt(url) {
    try {
        return await timedFetch(url, { method: 'GET' }, async (res) => {
            if (!res.ok) return 'fail'; // HTTP 4xx/5xx
            const head = (await firstChunk(res)).replace(/^\uFEFF/, '').trimStart();
            if (head.startsWith('#EXTM3U')) return 'ok';
            const type = res.headers.get('content-type') || '';
            if (MEDIA_TYPE.test(type)) return 'ok';
            if (head.startsWith('<')) return 'fail'; // HTML error page with 200
            return 'unsure';
        });
    } catch (e) {
        if (e && e.name === 'AbortError') return 'retry'; // timeout
        // TypeError: CORS block or network error -> can we reach it at all?
        try {
            return await timedFetch(url, { method: 'GET', mode: 'no-cors' }, async () => 'unsure');
        } catch (e2) {
            return 'retry';
        }
    }
}

/**
 * Tests one stream URL.
 * @param {string} url
 * @param {() => boolean} stopped - returns true when the user pressed Stop
 * @returns {Promise<'ok'|'fail'|'unsure'>}
 */
export async function testChannel(url, stopped = () => false) {
    // An https page cannot fetch http:// URLs (mixed content), so we cannot tell
    if (location.protocol === 'https:' && /^http:\/\//i.test(url)) return 'unsure';
    for (let i = 0; i < ATTEMPTS; i++) {
        if (stopped()) break;
        const result = await attempt(url);
        if (result !== 'retry') return result;
    }
    return 'fail';
}
