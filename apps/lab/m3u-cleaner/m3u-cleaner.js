/*
================================================================================
File: m3u-cleaner.js
Project: m3u-cleaner
Description: Main logic for the M3U Playlist Cleaner (Channel Cleaner) WebApp.
Purpose: Load M3U (file or URL), test channels in parallel queues (honest
         ok / fail / unsure), tap a row to preview and mark Works/Dead,
         select/remove channels, export keeping every original attribute.
Author: Grok
Date: 2026-10-19 (R1)
================================================================================
*/

import { parseM3U, exportM3U } from './m3u-cleaner-parse.js';
import { testChannel } from './m3u-cleaner-test.js';
import { initPreview, openPreview, closePreview, previewChannel } from './m3u-cleaner-preview.js';

// ============================================================================
// Constants
// ============================================================================

// LocalStorage key for last selected parallel queue count
const LS_QUEUE = 'm3uCleanerQueue';

// LocalStorage key for theme
const LS_THEME = 'm3uCleanerTheme';

// Allowed parallel queue counts and the default
const QUEUE_OPTIONS = ['5', '10', '25', '50'];
const QUEUE_DEFAULT = '10';

// Status labels shown in the table
const STATUS_TEXT = { ok: 'ok', fail: 'fail', unsure: 'unsure', '': 'Untested' };

// ============================================================================
// Global state
// ============================================================================

// Channel objects: { name, group, url, lines, status, selected, element }
let channels = [];

// #EXTM3U header line of the loaded source (kept on export)
let header = '#EXTM3U';

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
// Rendering
// ============================================================================

/**
 * Updates the status message.
 * @param {string} msg - Status text
 */
function setStatus(msg) {
    statusEl.textContent = msg;
}

/**
 * Creates a table cell with plain text (never HTML).
 * @param {string} text
 * @param {string} [cls]
 */
function cell(text, cls) {
    const td = document.createElement('td');
    td.textContent = text;
    if (cls) td.className = cls;
    return td;
}

/**
 * Refreshes one row's status cell and checkbox from its channel.
 * @param {object} ch
 */
function updateRow(ch) {
    if (!ch.element) return;
    const statusTd = ch.element.lastChild;
    statusTd.textContent = STATUS_TEXT[ch.status || ''];
    statusTd.className = `status-${ch.status || 'pending'}`;
    ch.element.querySelector('.ch-check').checked = ch.selected;
}

/**
 * Renders the channel table (textContent only, so names cannot inject HTML).
 */
function renderTable() {
    channelBody.textContent = '';
    const frag = document.createDocumentFragment();
    const playing = previewChannel();
    channels.forEach((ch, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.idx = idx;
        if (ch === playing) tr.classList.add('previewing');
        const checkTd = document.createElement('td');
        checkTd.className = 'check-cell';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.className = 'ch-check';
        check.checked = ch.selected;
        check.setAttribute('aria-label', `Select ${ch.name}`);
        checkTd.appendChild(check);
        tr.append(checkTd, cell(ch.name, 'name-cell'), cell(ch.group), cell('', ''));
        ch.element = tr;
        frag.appendChild(tr);
        updateRow(ch);
    });
    channelBody.appendChild(frag);
    selectAll.checked = channels.length > 0 && channels.every(c => c.selected);
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

// ============================================================================
// Testing
// ============================================================================

/**
 * Runs the parallel queue testing. Resets earlier results and ticks first.
 * @param {number} queueCount - Number of parallel queues
 */
async function runTests(queueCount) {
    stopRequested = false;
    channels.forEach(ch => { ch.status = ''; ch.selected = false; });
    renderTable();
    testBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus(`Testing with ${queueCount} parallel queues...`);

    const pending = [...channels];
    let completed = 0;
    const total = channels.length;

    /** Worker that processes channels from the shared pending list. */
    async function worker() {
        while (pending.length > 0 && !stopRequested) {
            const ch = pending.shift();
            const result = await testChannel(ch.url, () => stopRequested);
            if (stopRequested) break;
            ch.status = result;
            ch.selected = result === 'fail'; // failed auto-ticked, unsure not
            completed++;
            updateRow(ch);
            setStatus(`Testing... ${completed}/${total}`);
        }
    }

    const workers = [];
    for (let i = 0; i < queueCount; i++) workers.push(worker());
    await Promise.all(workers);

    stopBtn.disabled = true;
    testBtn.disabled = false;
    const failed = channels.filter(c => c.status === 'fail').length;
    const unsure = channels.filter(c => c.status === 'unsure').length;
    setStatus(stopRequested
        ? 'Stopped.'
        : `Done. ${failed} failed, ${unsure} unsure (tap a row to check it by eye).`);
}

// ============================================================================
// Preview callbacks
// ============================================================================

/** Highlights the row being previewed. */
function markPreviewRow(ch) {
    channelBody.querySelectorAll('tr.previewing').forEach(tr => tr.classList.remove('previewing'));
    if (ch && ch.element) {
        ch.element.classList.add('previewing');
        ch.element.scrollIntoView({ block: 'nearest' });
    }
}

initPreview({
    // Works -> ok + unticked, Dead -> fail + ticked
    onMark(ch, status) {
        ch.status = status;
        ch.selected = status === 'fail';
        updateRow(ch);
        setStatus(`${ch.name}: marked ${status === 'ok' ? 'Works' : 'Dead'}.`);
    },
    onStep(ch, delta) {
        const idx = channels.indexOf(ch);
        const next = channels[idx + delta];
        if (next) {
            openPreview(next);
            markPreviewRow(next);
        }
    },
    onClose() {
        markPreviewRow(null);
    }
});

// ============================================================================
// Event handlers
// ============================================================================

// Picking a file clears the URL; typing a URL clears the file
fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) urlInput.value = '';
});
urlInput.addEventListener('input', () => {
    if (urlInput.value.trim()) fileInput.value = '';
});

loadBtn.addEventListener('click', async () => {
    let text = '';
    const url = urlInput.value.trim();
    if (url) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            text = await res.text();
        } catch (e) {
            setStatus(`Could not load the URL (${e.message || 'network error'}). The server may block ` +
                'cross-site loading (CORS). Download the file and open it with the file picker instead.');
            return;
        }
    } else if (fileInput.files.length > 0) {
        text = await fileInput.files[0].text();
    } else {
        setStatus('Select a file or enter a URL.');
        return;
    }
    closePreview();
    const parsed = parseM3U(text);
    header = parsed.header;
    channels = parsed.channels.map(c => ({ ...c, status: '', selected: false }));
    renderTable();
    setStatus(`Loaded ${channels.length} channels. Tap a row to preview it.`);
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
    const playing = previewChannel();
    if (playing && playing.selected) closePreview();
    channels = channels.filter(ch => !ch.selected);
    renderTable();
    setStatus(`Removed selected. ${channels.length} remaining.`);
});

exportBtn.addEventListener('click', () => {
    const blob = new Blob([exportM3U(header, channels)], { type: 'text/plain' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = 'cleaned.m3u';
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    setStatus('Exported cleaned M3U.');
});

// Row checkboxes (event delegation)
channelBody.addEventListener('change', (e) => {
    if (!e.target.classList.contains('ch-check')) return;
    const ch = channels[Number(e.target.closest('tr').dataset.idx)];
    if (ch) ch.selected = e.target.checked;
    selectAll.checked = channels.every(c => c.selected);
});

// Tapping a row (not its checkbox cell) opens the preview
channelBody.addEventListener('click', (e) => {
    if (e.target.closest('.check-cell')) return;
    const tr = e.target.closest('tr');
    if (!tr) return;
    const ch = channels[Number(tr.dataset.idx)];
    if (!ch) return;
    openPreview(ch);
    markPreviewRow(ch);
});

selectAll.addEventListener('change', () => {
    const checked = selectAll.checked;
    channels.forEach(ch => { ch.selected = checked; });
    channelBody.querySelectorAll('.ch-check').forEach(cb => { cb.checked = checked; });
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

    // Restore last queue count; old values (100..1000) migrate to the default
    let savedQ = localStorage.getItem(LS_QUEUE);
    if (!QUEUE_OPTIONS.includes(savedQ)) {
        savedQ = QUEUE_DEFAULT;
        localStorage.setItem(LS_QUEUE, savedQ);
    }
    queueSelect.value = savedQ;
}

init();
