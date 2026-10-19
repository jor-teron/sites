/*
================================================================================
File: m3u-cleaner-preview.js
Project: m3u-cleaner
Description: Tap-to-preview player for the Channel Cleaner.
Purpose: Plays one channel in a small fixed panel (bottom sheet on phones,
         corner on desktop) so it can be checked by eye, then marked Works or
         Dead. Native HLS when the browser has it, else hls.js from
         vendor/hls (window.Hls), plain <video src> for non-HLS URLs.
Author: Grok
Date: 2026-10-19 (R1)
================================================================================
*/

const panel = document.getElementById('preview');
const nameEl = document.getElementById('pv-name');
const msgEl = document.getElementById('pv-msg');
const video = document.getElementById('pv-video');
const closeBtn = document.getElementById('pv-close');
const prevBtn = document.getElementById('pv-prev');
const nextBtn = document.getElementById('pv-next');
const worksBtn = document.getElementById('pv-works');
const deadBtn = document.getElementById('pv-dead');

let hls = null;        // current hls.js instance
let current = null;    // channel being previewed
let handlers = {};     // { onMark(ch, status), onStep(ch, delta), onClose(ch) }

/** Stops playback and frees the hls.js instance. */
function stopPlayback() {
    if (hls) {
        hls.destroy();
        hls = null;
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
}

/**
 * Starts playing a URL in the preview video.
 * @param {string} url
 */
function play(url) {
    stopPlayback();
    msgEl.textContent = 'Loading…';
    const isHls = /m3u8/i.test(url);
    const Hls = window.Hls;
    if (isHls && !video.canPlayType('application/vnd.apple.mpegurl') && Hls && Hls.isSupported()) {
        hls = new Hls({ maxBufferLength: 10 });
        hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) msgEl.textContent = `Stream error: ${data.details || data.type}`;
        });
        hls.loadSource(url);
        hls.attachMedia(video);
    } else {
        video.src = url;
    }
    video.play().catch(() => {
        if (msgEl.textContent === 'Loading…') msgEl.textContent = 'Tap ▶ to play.';
    });
}

video.addEventListener('playing', () => { msgEl.textContent = ''; });
video.addEventListener('error', () => {
    if (!hls) msgEl.textContent = 'Cannot play this stream here.';
});

/**
 * Opens the panel for a channel.
 * @param {object} ch - channel {name, url, ...}
 */
export function openPreview(ch) {
    current = ch;
    nameEl.textContent = ch.name;
    panel.hidden = false;
    play(ch.url);
}

/** Closes the panel and stops the stream. */
export function closePreview() {
    if (panel.hidden) return;
    const ch = current;
    stopPlayback();
    panel.hidden = true;
    current = null;
    if (handlers.onClose) handlers.onClose(ch);
}

/** @returns {object|null} the channel being previewed */
export function previewChannel() {
    return current;
}

/**
 * Wires the panel buttons to app callbacks.
 * @param {object} h - { onMark, onStep, onClose }
 */
export function initPreview(h) {
    handlers = h;
    closeBtn.addEventListener('click', closePreview);
    worksBtn.addEventListener('click', () => current && handlers.onMark(current, 'ok'));
    deadBtn.addEventListener('click', () => current && handlers.onMark(current, 'fail'));
    prevBtn.addEventListener('click', () => current && handlers.onStep(current, -1));
    nextBtn.addEventListener('click', () => current && handlers.onStep(current, 1));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePreview();
    });
}
