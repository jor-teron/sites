/*
================================================================================
File: local-ai-chat.js
Project: local-ai-chat
Description: Main application logic for the Local AI Chat WebApp.
Purpose: UI, chat history and helpers. The model itself (transformers.js, q4)
         runs in local-ai-chat-worker.js, so replies stream live; switching
         models terminates the worker (frees all RAM) and starts a fresh one.
         Models stay in the browser cache (100-day refresh, Models… sheet to
         delete/re-download). ✨ popover: prompt helpers + in-chat images.
Author: Grok
Date: 2026-10-19 (R3: model in a Web Worker, live streaming + t/s, ■ stop,
                  per-answer tokens · t/s line, Gemma-3 removed.
                  R2: model list with RAM hints, cache fix, Models sheet, T5,
                  short context. R1: minimalist UI)
================================================================================
*/

// In-chat image generation (Pollinations.ai)
import { generateImageBubble } from './local-ai-chat-image.js';
// Model list + RAM hints, cache helpers, Models… sheet
import { MODELS, DEFAULT_MODEL, getModel, ramCue, optionLabel } from './local-ai-chat-models.js';
import { isCached, expireIfOld, markDownloaded } from './local-ai-chat-cache.js';
import { openModelsSheet } from './local-ai-chat-sheet.js';

// ============================================================================
// Constants
// ============================================================================

// How many earlier messages go to the model (keeps RAM and prompt small)
const CONTEXT_MESSAGES = 6;

// LocalStorage keys
const LS_THEME = 'localAiChatTheme';
const LS_HISTORY = 'localAiChatHistory';
const LS_MODEL = 'localAiChatModel';

// ============================================================================
// Global state variables
// ============================================================================

// Model worker (R3) and whether it has a model ready
let worker = null;
let modelReady = false;

// Current model ID being used
let currentModel = DEFAULT_MODEL;

// Chat history array of {role, content, meta?} objects (meta = {tokens, tps})
let chatHistory = [];

// Flag indicating if a generation is in progress
let isGenerating = false;

// Flag indicating if a model is loading
let isLoading = false;

// Handlers for the running worker job (set by loadModel / generateReply)
let job = null;

// ============================================================================
// DOM element references
// ============================================================================

const chatHistoryEl = document.getElementById('chat-history');
const userInputEl = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const modelSelect = document.getElementById('model-select');
const themeToggle = document.getElementById('theme-toggle');
const menuBtn = document.getElementById('menu-btn');
const menuEl = document.getElementById('menu');
const clearChatBtn = document.getElementById('clear-chat');
const modelsBtn = document.getElementById('models-btn');
const sparkBtn = document.getElementById('spark-btn');
const sparkPop = document.getElementById('spark-pop');
const improvePromptBtn = document.getElementById('improve-prompt');
const iconStyleBtn = document.getElementById('icon-style');
const shortenBtn = document.getElementById('shorten');
const resolutionSelect = document.getElementById('resolution-select');
const makeImageBtn = document.getElementById('make-image');

// Inline status note element (exists only while a status is shown)
let noteEl = null;
let noteTimer = null;

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Shows a faint inline system note at the bottom of the chat (R1: replaces
 * the old status bar). Messages starting with Ready/Done/Chat cleared/Prompt
 * updated/Download fade out automatically; an empty message removes the note.
 * @param {string} message - Status message to display ('' to hide)
 */
function setStatus(message) {
    clearTimeout(noteTimer);
    if (!message) {
        if (noteEl) noteEl.remove();
        noteEl = null;
        return;
    }
    if (!noteEl) {
        noteEl = document.createElement('div');
        noteEl.className = 'note';
    }
    noteEl.textContent = message;
    chatHistoryEl.appendChild(noteEl); // keep it last
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
    if (/^(Ready|Done|Stopped|Chat cleared|Prompt updated|Download|Image ready|Deleted)/.test(message)) {
        noteTimer = setTimeout(() => setStatus(''), 2500);
    }
}

/**
 * Appends a message bubble to the chat history UI.
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - Message text
 * @param {{tokens:number, tps:number}} [meta] - Optional tokens/t/s line
 * @returns {HTMLElement} The bubble
 */
function appendMessage(role, content, meta) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.textContent = content;
    if (meta) addMetaLine(div, meta);
    addBubble(div);
    return div;
}

/**
 * Adds the small muted '<tokens> tokens · <tps> t/s' line inside a bubble.
 * @param {HTMLElement} bubble - Assistant bubble
 * @param {{tokens:number, tps:number}} meta
 */
function addMetaLine(bubble, meta) {
    if (!meta || !meta.tokens) return;
    const small = document.createElement('small');
    small.className = 'msg-meta';
    small.textContent = `${meta.tokens} tokens · ${Number(meta.tps).toFixed(1)} t/s`;
    bubble.appendChild(small);
}

/**
 * Inserts a bubble element into the chat, keeping any status note last.
 * @param {HTMLElement} el - Bubble element
 */
function addBubble(el) {
    if (noteEl && noteEl.parentNode === chatHistoryEl) chatHistoryEl.insertBefore(el, noteEl);
    else chatHistoryEl.appendChild(el);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

/**
 * Lets the browser paint before heavy work starts (rAF + setTimeout 0).
 * @returns {Promise<void>}
 */
function nextPaint() {
    return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/**
 * Saves chat history to localStorage.
 */
function saveHistory() {
    localStorage.setItem(LS_HISTORY, JSON.stringify(chatHistory));
}

/**
 * Loads chat history from localStorage and renders it (entries without
 * meta, i.e. from R1/R2, render without the tokens/t/s line).
 */
function loadHistory() {
    const raw = localStorage.getItem(LS_HISTORY);
    if (raw) {
        try {
            chatHistory = JSON.parse(raw);
            chatHistory.forEach(msg => appendMessage(msg.role, msg.content, msg.meta));
        } catch (e) {
            console.warn('Failed to load history', e);
        }
    }
}

/**
 * Clears the chat history from UI and storage.
 */
function clearHistory() {
    chatHistory = [];
    chatHistoryEl.innerHTML = '';
    noteEl = null;
    localStorage.removeItem(LS_HISTORY);
    setStatus('Chat cleared.');
}

/**
 * Send button shows ■ (stop) while generating, ➤ otherwise.
 */
function updateSendBtn() {
    sendBtn.textContent = isGenerating ? '■' : '➤';
    sendBtn.setAttribute('aria-label', isGenerating ? 'Stop' : 'Send');
    sendBtn.disabled = isLoading;
}

// ============================================================================
// Model worker (R3)
// ============================================================================

/**
 * Terminates the old worker (frees all its WASM/WebGPU memory) and starts
 * a fresh one. R2's dispose() never shrank the WASM heap.
 */
function restartWorker() {
    if (worker) worker.terminate();
    modelReady = false;
    const w = new Worker(new URL('./local-ai-chat-worker.js', import.meta.url), { type: 'module' });
    worker = w;
    // Ignore anything still queued from an old (terminated) worker
    w.addEventListener('message', (e) => { if (w === worker) job?.onMessage(e.data || {}); });
    w.addEventListener('error', (e) => {
        e.preventDefault();
        if (w === worker) job?.onMessage({ type: 'error', stage: isLoading ? 'load' : 'generate', message: e.message || 'Worker failed to start (offline?)' });
    });
}

/**
 * Loads the specified model in a fresh worker (dtype q4).
 * Applies the 100-day policy (only that model, only when its timestamp is
 * really older than 100 days), and says "Loading from cache" vs
 * "Downloading" based on what is actually in Cache Storage.
 * @param {string} modelId - Hugging Face model ID
 */
async function loadModel(modelId) {
    const model = getModel(modelId);
    isLoading = true;
    updateSendBtn();
    modelSelect.disabled = true;
    modelSelect.value = model.id;

    // Fresh worker = old model's memory is gone before the next one loads
    restartWorker();

    try {
        const expired = await expireIfOld(model.id);
        const fromCache = await isCached(model);
        const verb = fromCache ? 'Loading from cache' : (expired ? 'Cache over 100 days old. Downloading' : 'Downloading');
        setStatus(`${verb}: ${model.label} (~${model.mb} MB)…`);

        const device = await new Promise((resolve, reject) => {
            job = {
                onMessage: (m) => {
                    if (m.type === 'progress') {
                        setStatus(`${verb}: ${model.label} ${Math.round((m.loaded / m.total) * 100)}%`);
                    } else if (m.type === 'starting') {
                        setStatus(`Starting ${model.label} (can take 30–90 s)…`);
                    } else if (m.type === 'loaded') {
                        resolve(m.device);
                    } else if (m.type === 'error') {
                        reject(new Error(m.message));
                    }
                }
            };
            worker.postMessage({
                type: 'load',
                model: { id: model.id, kind: model.kind, externalData: !!model.externalData }
            });
        });

        modelReady = true;
        markDownloaded(model.id);
        currentModel = model.id;
        localStorage.setItem(LS_MODEL, model.id);
        setStatus(`Ready. ${model.label} (${device}${fromCache ? ', from cache' : ''})`);
    } catch (err) {
        console.error(err);
        setStatus(`Error loading ${model.label}: ${err.message}. Try another model or refresh.`);
    }
    job = null;
    isLoading = false;
    updateSendBtn();
    modelSelect.disabled = false;
    modelSelect.value = modelReady ? currentModel : model.id;
}

// ============================================================================
// Generation
// ============================================================================

/**
 * Builds the model input. Chat models get the system prompt plus the last
 * CONTEXT_MESSAGES messages; T5 gets one plain prompt from the latest
 * message (optionally with a short slice of the last assistant reply).
 * Only role/content are sent (meta stays local).
 * @param {string} userMessage - Latest user text
 * @param {Array} context - Prior {role, content} messages to include
 * @returns {Array|string} Input for the pipeline
 */
function buildInput(userMessage, context) {
    if (getModel(currentModel).kind === 't5') {
        const lastAi = [...context].reverse().find(m => m.role === 'assistant');
        const prefix = lastAi ? `Previous answer: ${lastAi.content.slice(0, 200)}\n\n` : '';
        return `${prefix}${userMessage}`;
    }
    return [
        { role: 'system', content: 'You are a helpful, concise assistant. Prefer short, clear answers.' },
        ...context.slice(-CONTEXT_MESSAGES).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
    ];
}

/**
 * Generates a reply in the worker. Text streams into liveBubble (painted at
 * most once per animation frame); the note shows live t/s.
 * @param {string} userMessage - The user's input text
 * @param {HTMLElement|null} liveBubble - Optional bubble to update live
 * @param {Array} context - Prior messages to send (default none)
 * @returns {Promise<{text:string, meta:{tokens:number, tps:number}|null}>}
 */
async function generateReply(userMessage, liveBubble = null, context = []) {
    if (!modelReady || isGenerating || isLoading) {
        if (!modelReady) setStatus('Model not loaded yet.');
        return { text: '', meta: null };
    }

    isGenerating = true;
    updateSendBtn();
    setStatus('Generating…');

    const kind = getModel(currentModel).kind;
    const input = buildInput(userMessage, context);

    let shown = '';
    let frame = 0;
    let last = { tokens: 0, seconds: 0 };
    const paint = () => {
        frame = 0;
        if (liveBubble) {
            liveBubble.textContent = shown;
            chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
        }
    };

    const result = await new Promise((resolve) => {
        job = {
            onMessage: (m) => {
                if (m.type === 'token') {
                    shown += m.text;
                    last = m;
                    if (!frame) frame = requestAnimationFrame(paint);
                    if (m.seconds > 0.3) setStatus(`Generating… ${(m.tokens / m.seconds).toFixed(1)} t/s`);
                } else if (m.type === 'done') {
                    resolve(m);
                } else if (m.type === 'error') {
                    resolve({ error: m.message });
                }
            },
            // ■ fallback: on WASM the worker can't read 'stop' mid-reply,
            // so the page ends the job itself (worker gets terminated)
            forceStop: () => resolve({
                text: shown.trim(), tokens: last.tokens, seconds: last.seconds,
                tps: last.seconds > 0 ? last.tokens / last.seconds : 0, stopped: true, killed: true
            })
        };
        worker.postMessage({ type: 'generate', input, kind });
    });
    if (frame) cancelAnimationFrame(frame);
    job = null;

    let text;
    let meta = null;
    if (result.error) {
        console.error('Generation error:', result.error);
        text = `Error: ${result.error}`;
        setStatus('Generation failed. See console for details.');
    } else {
        text = result.text || '(No response generated. Try a shorter message or switch model.)';
        if (result.tokens) meta = { tokens: result.tokens, tps: Math.round(result.tps * 10) / 10 };
        const tps = meta ? meta.tps.toFixed(1) : 'n/a';
        setStatus(`${result.stopped ? 'Stopped' : 'Done'}. ${result.tokens || '—'} tokens @ ${tps} t/s`);
    }
    if (liveBubble) liveBubble.textContent = text;

    isGenerating = false;
    updateSendBtn();
    // Worker was terminated by ■: bring the model back (from cache)
    if (result.killed) loadModel(currentModel);
    return { text: text.trim(), meta };
}

/**
 * ■: ends the current reply early (keeps what was written). Asks the worker
 * first (works on WebGPU); if it is still busy after 400 ms (WASM keeps the
 * worker's thread busy, so it never sees the message), terminates the worker
 * and reloads the model from cache.
 */
function stopGenerating() {
    if (!isGenerating || !worker) return;
    const current = job;
    worker.postMessage({ type: 'stop' });
    setTimeout(() => {
        if (!isGenerating || job !== current || !current?.forceStop) return;
        worker.terminate();
        worker = null;
        modelReady = false;
        current.forceStop();
    }, 400);
}

/**
 * Handles sending a user message: shows it at once, then streams the reply.
 */
async function sendMessage() {
    const text = userInputEl.value.trim();
    if (!text || isGenerating || isLoading) return;

    // Context = messages before this one (R1 sent the new message twice)
    const context = chatHistory.slice(-CONTEXT_MESSAGES);

    userInputEl.value = '';
    appendMessage('user', text);
    chatHistory.push({ role: 'user', content: text });
    saveHistory();

    // Create an empty assistant bubble for live streaming
    const liveBubble = document.createElement('div');
    liveBubble.className = 'message assistant';
    liveBubble.textContent = '…';
    addBubble(liveBubble);

    // Paint the user's bubble before the job starts
    await nextPaint();

    const { text: reply, meta } = await generateReply(text, liveBubble, context);

    // Finalize the bubble and history
    liveBubble.textContent = reply;
    addMetaLine(liveBubble, meta);
    chatHistory.push(meta ? { role: 'assistant', content: reply, meta } : { role: 'assistant', content: reply });
    saveHistory();
}

// ============================================================================
// Prompt helpers
// ============================================================================

/**
 * Applies a prompt transformation using the model and replaces the input.
 * @param {string} instruction - Instruction for the model
 */
async function applyPromptHelper(instruction) {
    const current = userInputEl.value.trim();
    if (!current) {
        setStatus('Enter a prompt first, then use a helper.');
        return;
    }
    const prompt = `${instruction}\n\nOriginal: ${current}\n\nImproved:`;
    if (!modelReady || isGenerating || isLoading) {
        setStatus('Wait for the model to be ready.');
        return;
    }
    userInputEl.value = '';
    setStatus('Improving prompt...');
    // Works for chat and T5 models: one plain prompt, no chat context
    const { text: improved } = await generateReply(prompt);
    userInputEl.value = improved || current;
    setStatus('Prompt updated. Edit if needed, then send.');
}

// ============================================================================
// Popovers (✨ helpers and ⋯ menu)
// ============================================================================

/**
 * Closes both popovers.
 */
function closePops() {
    sparkPop.hidden = true;
    menuEl.hidden = true;
    sparkBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-expanded', 'false');
}

/**
 * Toggles one popover, closing the other.
 * @param {HTMLElement} pop - Popover element
 * @param {HTMLElement} btn - Its trigger button
 */
function togglePop(pop, btn) {
    const open = pop.hidden;
    closePops();
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
}

/**
 * Generates an image into the chat from the input (or last message).
 */
function makeImage() {
    const prompt = userInputEl.value.trim() || (chatHistory.length ? chatHistory[chatHistory.length - 1].content : '');
    if (!prompt) {
        setStatus('Type a prompt first, then Make image.');
        return;
    }
    const size = parseInt(resolutionSelect.value, 10) || 64;
    appendMessage('user', `🖼 ${prompt} (${size}×${size})`);
    userInputEl.value = '';
    generateImageBubble(prompt, size, addBubble, setStatus);
}

// While generating, the send button is ■ and stops the reply
sendBtn.addEventListener('click', () => (isGenerating ? stopGenerating() : sendMessage()));

userInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

modelSelect.addEventListener('change', async () => {
    const newModel = modelSelect.value;
    if (newModel === currentModel && modelReady) return;
    if (isGenerating || isLoading) {
        modelSelect.value = currentModel;
        setStatus('Busy. Try switching again in a moment.');
        return;
    }
    // Never block: heavy models only ask once
    if (ramCue(getModel(newModel)) === 'heavy' &&
        !confirm(`This model may crash on a ~${navigator.deviceMemory} GB device. Load anyway?`)) {
        modelSelect.value = currentModel;
        return;
    }
    await loadModel(newModel);
});

/**
 * Fills the model <select> from MODELS with RAM cues.
 */
function fillModelSelect() {
    modelSelect.textContent = '';
    for (const m of MODELS) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = optionLabel(m);
        opt.title = `~${m.mb} MB · ${m.hint}`;
        modelSelect.appendChild(opt);
    }
}

/**
 * Applies a theme and updates the ☾/☀ icon.
 * @param {string} theme - 'light' or 'dark'
 */
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeToggle.textContent = theme === 'dark' ? '☀' : '☾';
}

themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem(LS_THEME, newTheme);
});

menuBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePop(menuEl, menuBtn); });
sparkBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePop(sparkPop, sparkBtn); });
// Clicks inside popovers don't close them (so the resolution select works)
[menuEl, sparkPop].forEach(el => el.addEventListener('click', e => e.stopPropagation()));
document.addEventListener('click', closePops);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePops(); });

clearChatBtn.addEventListener('click', () => { closePops(); clearHistory(); });

modelsBtn.addEventListener('click', () => {
    closePops();
    openModelsSheet({
        isBusy: () => isGenerating || isLoading,
        onStatus: setStatus,
        onRedownload: (id) => loadModel(id)
    });
});

improvePromptBtn.addEventListener('click', () => {
    closePops();
    applyPromptHelper('Improve the following prompt to be clearer and more effective for AI image generation. Keep it concise.');
});

iconStyleBtn.addEventListener('click', () => {
    closePops();
    applyPromptHelper('Rewrite the following as a concise prompt for a 64x64 app icon. Focus on simple shapes, flat colors, and clear subject. Avoid complex scenes.');
});

shortenBtn.addEventListener('click', () => {
    closePops();
    applyPromptHelper('Shorten the following text while keeping the core meaning. Make it as brief as possible.');
});

makeImageBtn.addEventListener('click', () => { closePops(); makeImage(); });

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initializes the application on page load.
 */
async function init() {
    // Restore theme
    const savedTheme = localStorage.getItem(LS_THEME) || 'light';
    applyTheme(savedTheme);

    // Build the model list, restore last model choice (unknown or removed
    // ids, e.g. Gemma-3 from R2, fall back to the default and are re-saved)
    fillModelSelect();
    const savedModel = getModel(localStorage.getItem(LS_MODEL) || DEFAULT_MODEL).id;
    localStorage.setItem(LS_MODEL, savedModel);
    modelSelect.value = savedModel;

    // Load history
    loadHistory();

    // Load the model
    await loadModel(savedModel);
}

// Start the app
init();
