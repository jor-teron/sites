/*
================================================================================
File: local-ai-chat-sheet.js
Project: local-ai-chat
Description: "Models…" sheet for Local AI Chat.
Purpose: Lists every model with its cached size and per-model Delete and
         Re-download buttons. Opened from the ⋯ menu.
Author: Grok
Date: 2026-10-19 (R3: removed models (Gemma-3) shown only while still cached,
                  with Delete. R2: new file)
================================================================================
*/

import { MODELS, LEGACY_MODELS, ramCue } from './local-ai-chat-models.js';
import { cachedBytes, deleteModelCache, formatSize } from './local-ai-chat-cache.js';

const sheetEl = document.getElementById('models-sheet');
const listEl = document.getElementById('models-list');
const closeBtn = document.getElementById('models-close');

// Callbacks set by openModelsSheet()
let hooks = { onRedownload: null, onStatus: null, isBusy: () => false };

/**
 * Renders the model rows with fresh cache sizes.
 */
async function render() {
    listEl.textContent = '';
    for (const model of MODELS) {
        const row = document.createElement('div');
        row.className = 'model-row';

        const info = document.createElement('div');
        info.className = 'model-info';
        const name = document.createElement('strong');
        name.textContent = model.label;
        const meta = document.createElement('small');
        const cue = ramCue(model);
        meta.textContent = `~${model.mb} MB · ${model.hint}${cue ? ' · ' + (cue === 'heavy' ? 'heavy for this device' : cue) : ''}`;
        const size = document.createElement('small');
        size.className = 'model-size';
        size.textContent = 'checking…';
        info.append(name, meta, size);

        const del = document.createElement('button');
        del.className = 'chip';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
            if (hooks.isBusy()) return;
            await deleteModelCache(model.id);
            hooks.onStatus?.(`Deleted ${model.label} from cache.`);
            render();
        });

        const re = document.createElement('button');
        re.textContent = 'Re-download';
        re.addEventListener('click', async () => {
            if (hooks.isBusy()) return;
            closeModelsSheet();
            await deleteModelCache(model.id);
            hooks.onRedownload?.(model.id);
        });

        const btns = document.createElement('div');
        btns.className = 'model-btns';
        btns.append(del, re);
        row.append(info, btns);
        listEl.appendChild(row);

        cachedBytes(model.id).then(b => {
            size.textContent = formatSize(b);
            del.disabled = b === 0;
        }).catch(() => { size.textContent = 'cache unavailable'; });
    }
    renderLegacy();
}

/**
 * Adds a Delete row for each removed model that still has cached files.
 */
async function renderLegacy() {
    for (const model of LEGACY_MODELS) {
        let bytes = 0;
        try { bytes = await cachedBytes(model.id); } catch { /* cache unavailable */ }
        if (!bytes) continue;
        const row = document.createElement('div');
        row.className = 'model-row';
        const info = document.createElement('div');
        info.className = 'model-info';
        const name = document.createElement('strong');
        name.textContent = model.label;
        const size = document.createElement('small');
        size.className = 'model-size';
        size.textContent = `${formatSize(bytes)} left in cache`;
        info.append(name, size);
        const del = document.createElement('button');
        del.className = 'chip';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
            await deleteModelCache(model.id);
            hooks.onStatus?.(`Deleted ${model.label} from cache.`);
            row.remove();
        });
        const btns = document.createElement('div');
        btns.className = 'model-btns';
        btns.append(del);
        row.append(info, btns);
        listEl.appendChild(row);
    }
}

/**
 * Opens the Models sheet.
 * @param {{onRedownload:(id:string)=>void, onStatus:(msg:string)=>void, isBusy:()=>boolean}} h
 */
export function openModelsSheet(h) {
    hooks = { ...hooks, ...h };
    sheetEl.hidden = false;
    render();
}

/**
 * Closes the Models sheet.
 */
export function closeModelsSheet() {
    sheetEl.hidden = true;
}

closeBtn.addEventListener('click', closeModelsSheet);
// Tap on the dimmed backdrop closes it; taps inside the panel don't
sheetEl.addEventListener('click', e => { if (e.target === sheetEl) closeModelsSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModelsSheet(); });
