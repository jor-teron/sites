/*
================================================================================
File: local-ai-chat.js
Project: local-ai-chat
Description: Main application logic for the Local AI Chat WebApp.
Purpose: Loads small language models (q4) via transformers.js, manages chat,
         unloads the old model on switch, keeps models in the browser cache
         (100-day refresh, Models… sheet to delete/re-download), and drives
         the ✨ helpers popover (prompt helpers + in-chat image generation).
Author: Grok
Date: 2026-10-19 (R2: 5-model list with RAM hints, unload on switch, cache fix,
                  Models sheet, T5 support, short context. R1: minimalist UI)
================================================================================
*/

// Import transformers.js from CDN
import { pipeline, env, TextStreamer } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.0';
// In-chat image generation (Pollinations.ai)
import { generateImageBubble } from './local-ai-chat-image.js';
// Model list + RAM hints, cache helpers, Models… sheet (R2)
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

// Current text generation pipeline instance
let generator = null;

// Current model ID being used
let currentModel = DEFAULT_MODEL;

// Chat history array of {role, content} objects
let chatHistory = [];

// Flag indicating if a generation is in progress
let isGenerating = false;

// Flag indicating if a model is loading
let isLoading = false;

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
    if (/^(Ready|Done|Chat cleared|Prompt updated|Download|Image ready|Deleted)/.test(message)) {
        noteTimer = setTimeout(() => setStatus(''), 2500);
    }
}

/**
 * Appends a message bubble to the chat history UI.
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - Message text
 */
function appendMessage(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.textContent = content;
    addBubble(div);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
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
 * Saves chat history to localStorage.
 */
function saveHistory() {
    localStorage.setItem(LS_HISTORY, JSON.stringify(chatHistory));
}

/**
 * Loads chat history from localStorage and renders it.
 */
function loadHistory() {
    const raw = localStorage.getItem(LS_HISTORY);
    if (raw) {
        try {
            chatHistory = JSON.parse(raw);
            chatHistory.forEach(msg => appendMessage(msg.role, msg.content));
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
 * Detects whether WebGPU is available.
 * @returns {Promise<boolean>}
 */
async function hasWebGPU() {
    if (!navigator.gpu) return false;
    try {
        const adapter = await navigator.gpu.requestAdapter();
        return !!adapter;
    } catch {
        return false;
    }
}

// ============================================================================
// Model loading
// ============================================================================

/**
 * Unloads the current model so two models never sit in RAM together.
 */
async function unloadModel() {
    const old = generator;
    generator = null;
    if (old && typeof old.dispose === 'function') {
        try { await old.dispose(); } catch (e) { console.warn('dispose failed', e); }
    }
}

/**
 * Loads the specified model using transformers.js (dtype q4).
 * Unloads the previous model first, applies the 100-day policy (only that
 * model, only when its timestamp is really older than 100 days), and says
 * "Loading from cache" vs "Downloading" based on what is actually in
 * Cache Storage 'transformers-cache'.
 * @param {string} modelId - Hugging Face model ID
 */
async function loadModel(modelId) {
    const model = getModel(modelId);
    isLoading = true;
    sendBtn.disabled = true;
    modelSelect.disabled = true;
    modelSelect.value = model.id;

    // Free RAM before loading the next model
    await unloadModel();

    // Configure transformers.js environment: remote Hub + browser cache on
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    env.useBrowserCache = true;

    // Determine device; dtype stays q4 (user's choice)
    const useWebGPU = await hasWebGPU();
    const device = useWebGPU ? 'webgpu' : 'wasm';
    const dtype = 'q4';

    try {
        const expired = await expireIfOld(model.id);
        const fromCache = await isCached(model);
        const verb = fromCache ? 'Loading from cache' : (expired ? 'Cache over 100 days old. Downloading' : 'Downloading');
        setStatus(`${verb}: ${model.label} (~${model.mb} MB)…`);

        const task = model.kind === 't5' ? 'text2text-generation' : 'text-generation';
        const options = {
            dtype,
            device,
            progress_callback: (p) => {
                // transformers.js also fires 'progress' while reading from
                // cache, so the wording follows the real cache check above.
                if (p.status === 'progress' && p.total && /\.onnx/.test(p.file || '')) {
                    const pct = Math.round((p.loaded / p.total) * 100);
                    setStatus(`${verb}: ${model.label} ${pct}%`);
                } else if (p.status === 'done' && /\.onnx/.test(p.file || '')) {
                    setStatus(`Starting ${model.label} (can take 30–90 s)…`);
                }
            }
        };
        if (model.externalData) options.use_external_data_format = true;

        generator = await pipeline(task, model.id, options);

        console.log('Pipeline loaded successfully for', model.id);
        markDownloaded(model.id);
        currentModel = model.id;
        localStorage.setItem(LS_MODEL, model.id);
        setStatus(`Ready. ${model.label} (${device}${fromCache ? ', from cache' : ''})`);
    } catch (err) {
        console.error(err);
        setStatus(`Error loading ${model.label}: ${err.message}. Try another model or refresh.`);
    }
    isLoading = false;
    sendBtn.disabled = false;
    modelSelect.disabled = false;
    modelSelect.value = generator ? currentModel : model.id;
}

// ============================================================================
// Generation
// ============================================================================

/**
 * Builds the model input. Chat models get the system prompt plus the last
 * CONTEXT_MESSAGES messages; T5 gets one plain prompt from the latest
 * message (optionally with a short slice of the last assistant reply).
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
        ...context.slice(-CONTEXT_MESSAGES),
        { role: 'user', content: userMessage }
    ];
}

/**
 * Generates a response from the current model given a user message.
 * Supports streaming (token-by-token) and reports tokens per second.
 * Includes robust fallback if streaming produces no text.
 * @param {string} userMessage - The user's input text
 * @param {HTMLElement|null} liveBubble - Optional DOM element to update live during streaming
 * @param {Array} context - Prior messages to send (default none)
 * @returns {Promise<string>} The assistant's full reply
 */
async function generateReply(userMessage, liveBubble = null, context = []) {
    if (!generator || isGenerating || isLoading) {
        if (!generator) setStatus('Model not loaded yet.');
        return '';
    }

    isGenerating = true;
    sendBtn.disabled = true;
    setStatus('Generating...');

    const isT5 = getModel(currentModel).kind === 't5';
    const input = buildInput(userMessage, context);

    let fullReply = '';
    let tokenCount = 0;
    const startTime = performance.now();

    try {
        const streamer = new TextStreamer(generator.tokenizer, {
            skip_prompt: true,
            skip_special_tokens: true,
            callback_function: (token) => {
                if (!token) return;
                fullReply += token;
                tokenCount++;
                if (liveBubble) {
                    liveBubble.textContent = fullReply;
                    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
                }
                if (tokenCount % 4 === 0) {
                    const elapsed = (performance.now() - startTime) / 1000;
                    const tps = elapsed > 0 ? (tokenCount / elapsed).toFixed(1) : '0';
                    setStatus(`Generating... ${tps} t/s`);
                }
            }
        });

        // T5 is best greedy; chat models sample lightly
        const genOpts = isT5
            ? { max_new_tokens: 150, do_sample: false, repetition_penalty: 1.2, streamer }
            : { max_new_tokens: 150, temperature: 0.6, top_p: 0.9, do_sample: true, streamer };
        const output = await generator(input, genOpts);

        // Strong fallback: extract assistant content from the final result
        if (!fullReply || fullReply.trim().length < 2) {
            const generated = output?.[0]?.generated_text;
            if (Array.isArray(generated)) {
                const last = generated[generated.length - 1];
                fullReply = last && last.role === 'assistant' ? (last.content || '') : '';
            } else if (typeof generated === 'string') {
                fullReply = generated;
            }
            fullReply = (fullReply || '').trim();
            if (liveBubble && fullReply) {
                liveBubble.textContent = fullReply;
            }
        }

        const elapsed = (performance.now() - startTime) / 1000;
        const finalTps = elapsed > 0 && tokenCount > 0 ? (tokenCount / elapsed).toFixed(1) : 'n/a';
        setStatus(`Done. ${tokenCount || '—'} tokens @ ${finalTps} t/s`);

        if (!fullReply) {
            fullReply = '(No response generated. Try a shorter message or switch model.)';
            if (liveBubble) liveBubble.textContent = fullReply;
        }

    } catch (err) {
        console.error('Generation error:', err);
        fullReply = `Error: ${err.message}`;
        if (liveBubble) liveBubble.textContent = fullReply;
        setStatus('Generation failed. See console for details.');
    }

    isGenerating = false;
    sendBtn.disabled = false;
    return fullReply.trim();
}

/**
 * Handles sending a user message: adds to history, generates reply with streaming, updates UI.
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

    const reply = await generateReply(text, liveBubble, context);

    // Finalize the bubble and history
    liveBubble.textContent = reply;
    chatHistory.push({ role: 'assistant', content: reply });
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
    if (!generator || isGenerating || isLoading) {
        setStatus('Wait for the model to be ready.');
        return;
    }
    userInputEl.value = '';
    setStatus('Improving prompt...');
    // Works for chat and T5 models: one plain prompt, no chat context
    const improved = await generateReply(prompt);
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

sendBtn.addEventListener('click', sendMessage);

userInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

modelSelect.addEventListener('change', async () => {
    const newModel = modelSelect.value;
    if (newModel === currentModel && generator) return;
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

    // Build the model list, restore last model choice (unknown ids -> default)
    fillModelSelect();
    const savedModel = getModel(localStorage.getItem(LS_MODEL) || DEFAULT_MODEL).id;
    modelSelect.value = savedModel;

    // Load history
    loadHistory();

    // Load the model
    await loadModel(savedModel);
}

// Start the app
init();
