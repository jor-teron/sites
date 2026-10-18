/*
================================================================================
File: m3u-cleaner.js
Project: m3u-cleaner
Description: Main logic for the M3U Playlist Cleaner WebApp.
Purpose: Parse M3U, test channels in selectable parallel queues with retries,
         mark failed (not playing) channels, auto-select them, and export cleaned list.
Author: Grok
Date: 2026-10-18
================================================================================
*/

// ============================================================================
// Constants
// ============================================================================

// LocalStorage key for last selected parallel queue count
const LS_QUEUE = 'm3uCleanerQueue';

// LocalStorage key for theme
const LS_THEME = 'm3uCleanerTheme';

// Number of retries per channel (at least 2 total attempts)
const MAX_RETRIES = 2;

// Timeout per attempt in milliseconds
const TIMEOUT_MS = 8000;

// ============================================================================
// Global state
// ============================================================================

// Array of channel objects: { name, group, url, status, selected, element }
let channels = [];

// Flag to stop testing
let stopRequested = false;

// ============================================================================
// DOM references
// ============================================================================

const fileInput = document.getElementById('file-input');
const urlInput = document.getElementById('url-input');
const loadBtn = document.getElementById('load-btn');
const queueSelect = document.getElementById('queue-select');
const testBtn = document.getElementById('test-btn');
const selectFailedBtn = document.getElementById('select-failed-btn');
const removeSelectedBtn = document.getElementById('remove-selected-btn');
const exportBtn = document.getElementById('export-btn');
const stopBtn = document.getElementById('stop-btn');
const statusEl = document.getElementById('status');
const channelBody = document.getElementById('channel-body');
const selectAll = document.getElementById('select-all');
const themeToggle = document.getElementById('theme-toggle');

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Updates the status message.
 * @param {string} msg - Status text
 */
function setStatus(msg) {
    statusEl.textContent = msg;
}

/**
 * Parses raw M3U text into channel objects.
 * @param {string} text - Raw M3U content
 * @returns {Array} Array of {name, group, url}
 */
function parseM3U(text) {
    const lines = text.split(/\r?\n/);
    const result = [];
    let current = null;

    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('#EXTINF')) {
            const nameMatch = line.match(/,(.+)$/);
            const groupMatch = line.match(/group-title="([^"]*)"/i);
            current = {
                name: nameMatch ? nameMatch[1].trim() : 'Unknown',
                group: groupMatch ? groupMatch[1] : '',
                url: ''
            };
        } else if (line && !line.startsWith('#') && current) {
            current.url = line;
            result.push(current);
            current = null;
        }
    }
    return result;
}

/**
 * Renders the channel table.
 */
function renderTable() {
    channelBody.innerHTML = '';
    channels.forEach((ch, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" class="ch-check" data-idx="${idx}" ${ch.selected ? 'checked' : ''}></td>
            <td>${ch.name}</td>
            <td>${ch.group}</td>
            <td class="status-${ch.status || 'pending'}">${ch.status || 'Untested'}</td>
        `;
        channelBody.appendChild(tr);
        ch.element = tr;
    });
    updateButtons();
}

/**
 * Enables/disables action buttons based on state.
 */
function updateButtons() {
    const hasChannels = channels.length > 0;
    testBtn.disabled = !hasChannels;
    selectFailedBtn.disabled = !hasChannels;
    removeSelectedBtn.disabled = !hasChannels;
    exportBtn.disabled = !hasChannels;
}

/**
 * Tests a single channel URL with retries.
 * Uses fetch with timeout. CORS may limit accuracy.
 * @param {string} url - Stream URL
 * @returns {Promise<boolean>} True if appears playable
 */
async function testChannel(url) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (stopRequested) return false;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
            const res = await fetch(url, {
                method: 'GET',
                mode: 'no-cors',
                signal: controller.signal
            });
            clearTimeout(timeout);
            // no-cors opaque response often means it reached the server
            return true;
        } catch (e) {
            // Continue to retry
        }
    }
    return false;
}

/**
 * Runs the parallel queue testing.
 * @param {number} queueCount - Number of parallel queues
 */
async function runTests(queueCount) {
    stopRequested = false;
    testBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus(`Testing with ${queueCount} parallel queues...`);

    const pending = [...channels];
    let completed = 0;
    const total = channels.length;

    /**
     * Worker that processes channels from the shared pending list.
     */
    async function worker() {
        while (pending.length > 0 && !stopRequested) {
            const ch = pending.shift();
            if (!ch) break;
            const ok = await testChannel(ch.url);
            ch.status = ok ? 'ok' : 'fail';
            if (!ok) ch.selected = true;
            completed++;
            // Update row
            if (ch.element) {
                const statusTd = ch.element.querySelector('td:last-child');
                if (statusTd) {
                    statusTd.textContent = ch.status;
                    statusTd.className = `status-${ch.status}`;
                }
                const check = ch.element.querySelector('.ch-check');
                if (check) check.checked = ch.selected;
            }
            setStatus(`Testing... ${completed}/${total}`);
        }
    }

    // Start workers
    const workers = [];
    for (let i = 0; i < queueCount; i++) {
        workers.push(worker());
    }
    await Promise.all(workers);

    stopBtn.disabled = true;
    testBtn.disabled = false;
    setStatus(stopRequested ? 'Stopped.' : `Done. ${channels.filter(c => c.status === 'fail').length} failed.`);
}

// ============================================================================
// Event handlers
// ============================================================================

loadBtn.addEventListener('click', async () => {
    let text = '';
    if (fileInput.files.length > 0) {
        text = await fileInput.files[0].text();
    } else if (urlInput.value.trim()) {
        try {
            const res = await fetch(urlInput.value.trim());
            text = await res.text();
        } catch (e) {
            setStatus('Failed to load URL.');
            return;
        }
    } else {
        setStatus('Select a file or enter a URL.');
        return;
    }
    channels = parseM3U(text).map(c => ({ ...c, status: '', selected: false }));
    renderTable();
    setStatus(`Loaded ${channels.length} channels.`);
});

testBtn.addEventListener('click', () => {
    const q = parseInt(queueSelect.value, 10);
    localStorage.setItem(LS_QUEUE, q);
    runTests(q);
});

stopBtn.addEventListener('click', () => {
    stopRequested = true;
    setStatus('Stopping...');
});

selectFailedBtn.addEventListener('click', () => {
    channels.forEach(ch => {
        if (ch.status === 'fail') ch.selected = true;
    });
    renderTable();
    setStatus('Failed channels selected.');
});

removeSelectedBtn.addEventListener('click', () => {
    channels = channels.filter(ch => !ch.selected);
    renderTable();
    setStatus(`Removed selected. ${channels.length} remaining.`);
});

exportBtn.addEventListener('click', () => {
    let m3u = '#EXTM3U\n';
    channels.forEach(ch => {
        m3u += `#EXTINF:-1 group-title="${ch.group}",${ch.name}\n${ch.url}\n`;
    });
    const blob = new Blob([m3u], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cleaned.m3u';
    a.click();
    setStatus('Exported cleaned M3U.');
});

selectAll.addEventListener('change', () => {
    const checked = selectAll.checked;
    channels.forEach(ch => ch.selected = checked);
    document.querySelectorAll('.ch-check').forEach(cb => cb.checked = checked);
});

themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(LS_THEME, newTheme);
});

// Remember queue selection
queueSelect.addEventListener('change', () => {
    localStorage.setItem(LS_QUEUE, queueSelect.value);
});

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initializes the app on load.
 */
function init() {
    // Restore theme (dark is default)
    const theme = localStorage.getItem(LS_THEME) || 'dark';
    document.documentElement.setAttribute('data-theme', theme);

    // Restore last queue count (100 is default)
    const savedQ = localStorage.getItem(LS_QUEUE);
    if (savedQ) queueSelect.value = savedQ;
}

init();
