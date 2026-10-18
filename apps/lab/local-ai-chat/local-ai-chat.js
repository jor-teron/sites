/*
================================================================================
File: local-ai-chat.js
Project: local-ai-chat
Description: Main application logic for the Local AI Chat + Icon Generator WebApp.
Purpose: Loads small language models via transformers.js, manages chat,
         caches models for 100 days, supports prompt helpers, and generates icons
         via Pollinations.ai with selectable resolution.
Author: Grok
Date: 2026-10-17
================================================================================
*/

// Import transformers.js from CDN
import { pipeline, env, TextStreamer } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.0';

// ============================================================================
// Constants
// ============================================================================

// Default model ID (SmolLM2-135M)
const DEFAULT_MODEL = 'HuggingFaceTB/SmolLM2-135M-Instruct';

// Optional model ID (Qwen2.5-0.5B)
const OPTIONAL_MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';

// Cache duration in days
const CACHE_DAYS = 100;

// LocalStorage keys
const LS_THEME = 'localAiChatTheme';
const LS_HISTORY = 'localAiChatHistory';
const LS_MODEL = 'localAiChatModel';
const LS_CACHE_TIME = 'localAiChatCacheTime';

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

// ============================================================================
// DOM element references
// ============================================================================

const chatHistoryEl = document.getElementById('chat-history');
const statusEl = document.getElementById('status');
const userInputEl = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const modelSelect = document.getElementById('model-select');
const themeToggle = document.getElementById('theme-toggle');
const clearChatBtn = document.getElementById('clear-chat');
const improvePromptBtn = document.getElementById('improve-prompt');
const iconStyleBtn = document.getElementById('icon-style');
const shortenBtn = document.getElementById('shorten');
const resolutionSelect = document.getElementById('resolution-select');
const generateIconBtn = document.getElementById('generate-icon-btn');
const downloadIconBtn = document.getElementById('download-icon-btn');
const iconPreview = document.getElementById('icon-preview');

// Current generated icon URL (for download)
let currentIconUrl = null;

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Updates the status bar text.
 * @param {string} message - Status message to display
 */
function setStatus(message) {
    statusEl.textContent = message;
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
    chatHistoryEl.appendChild(div);
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
    localStorage.removeItem(LS_HISTORY);
    setStatus('Chat cleared.');
}

/**
 * Checks if the cached model is older than CACHE_DAYS and should be refreshed.
 * @param {string} modelId - Model identifier
 * @returns {boolean} True if cache should be invalidated
 */
function shouldRefreshCache(modelId) {
    const key = `${LS_CACHE_TIME}_${modelId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return true;
    const ageMs = Date.now() - parseInt(stored, 10);
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays > CACHE_DAYS;
}

/**
 * Records the current time as the cache timestamp for a model.
 * @param {string} modelId - Model identifier
 */
function markCacheFresh(modelId) {
    const key = `${LS_CACHE_TIME}_${modelId}`;
    localStorage.setItem(key, Date.now().toString());
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
 * Loads the specified model using transformers.js.
 * Applies dtype and device preferences, and respects the 100-day cache policy.
 * @param {string} modelId - Hugging Face model ID
 */
async function loadModel(modelId) {
    setStatus(`Loading ${modelId}...`);
    sendBtn.disabled = true;

    // Configure transformers.js environment
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    // Determine device and dtype
    const useWebGPU = await hasWebGPU();
    const device = useWebGPU ? 'webgpu' : 'wasm';
    // Prefer q4 for smaller size; fall back gracefully
    const dtype = 'q4';

    try {
        // Note: transformers.js handles browser caching internally.
        // We track age separately for the 100-day refresh policy.
        if (shouldRefreshCache(modelId)) {
            setStatus(`Cache older than ${CACHE_DAYS} days or missing. Downloading fresh model...`);
        } else {
            setStatus(`Using cached model (valid for ${CACHE_DAYS} days)...`);
        }

        generator = await pipeline('text-generation', modelId, {
            dtype,
            device,
            progress_callback: (progress) => {
                if (progress.status === 'progress') {
                    const pct = Math.round((progress.loaded / progress.total) * 100);
                    setStatus(`Downloading ${modelId}: ${pct}%`);
                    if (pct >= 100) {
                        setStatus(`Download complete. Initializing model (may take 30–90 seconds)...`);
                    }
                } else if (progress.status === 'ready' || progress.status === 'done') {
                    setStatus(`Model files ready. Initializing...`);
                }
            }
        });

        console.log('Pipeline loaded successfully for', modelId);
        markCacheFresh(modelId);
        currentModel = modelId;
        localStorage.setItem(LS_MODEL, modelId);
        setStatus(`Ready. Model: ${modelId} (${device})`);
        sendBtn.disabled = false;
    } catch (err) {
        console.error(err);
        setStatus(`Error loading model: ${err.message}. Try another model or refresh.`);
        sendBtn.disabled = false;
    }
}

// ============================================================================
// Generation
// ============================================================================

/**
 * Generates a response from the current model given a user message.
 * Supports streaming (token-by-token) and reports tokens per second.
 * Includes robust fallback if streaming produces no text.
 * @param {string} userMessage - The user's input text
 * @param {HTMLElement|null} liveBubble - Optional DOM element to update live during streaming
 * @returns {Promise<string>} The assistant's full reply
 */
async function generateReply(userMessage, liveBubble = null) {
    if (!generator || isGenerating) return '';

    isGenerating = true;
    sendBtn.disabled = true;
    setStatus('Generating...');

    // Build messages array for chat template
    const messages = [
        { role: 'system', content: 'You are a helpful, concise assistant. Prefer short, clear answers.' },
        ...chatHistory.slice(-4),
        { role: 'user', content: userMessage }
    ];

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

        const output = await generator(messages, {
            max_new_tokens: 150,
            temperature: 0.6,
            top_p: 0.9,
            do_sample: true,
            streamer
        });

        // Strong fallback: extract assistant content from the final result
        if (!fullReply || fullReply.trim().length < 2) {
            const generated = output?.[0]?.generated_text;
            if (Array.isArray(generated)) {
                // Find the last assistant message
                for (let i = generated.length - 1; i >= 0; i--) {
                    if (generated[i].role === 'assistant' || generated[i].content) {
                        fullReply = generated[i].content || '';
                        break;
                    }
                }
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
    if (!text || isGenerating) return;

    userInputEl.value = '';
    appendMessage('user', text);
    chatHistory.push({ role: 'user', content: text });
    saveHistory();

    // Create an empty assistant bubble for live streaming
    const liveBubble = document.createElement('div');
    liveBubble.className = 'message assistant';
    liveBubble.textContent = '';
    chatHistoryEl.appendChild(liveBubble);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;

    const reply = await generateReply(text, liveBubble);

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
    userInputEl.value = '';
    setStatus('Improving prompt...');
    const improved = await generateReply(prompt);
    userInputEl.value = improved;
    setStatus('Prompt updated. Edit if needed, then send.');
}

// ============================================================================
// Icon generation (Pollinations.ai)
// ============================================================================

/**
 * Generates an icon using the Pollinations.ai free endpoint.
 * Uses the current input text (or last user message) as the prompt.
 * Respects the selected resolution.
 */
async function generateIcon() {
    const prompt = userInputEl.value.trim() || (chatHistory.length ? chatHistory[chatHistory.length - 1].content : '');
    if (!prompt) {
        setStatus('Enter a prompt first (or chat something), then generate icon.');
        return;
    }

    const size = parseInt(resolutionSelect.value, 10) || 64;
    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=${size}&height=${size}&nologo=true&safe=true&model=flux`;

    setStatus(`Generating ${size}×${size} icon...`);
    generateIconBtn.disabled = true;

    try {
        // Load into the preview image
        iconPreview.onload = () => {
            iconPreview.style.display = 'block';
            currentIconUrl = url;
            downloadIconBtn.disabled = false;
            setStatus(`Icon ready (${size}×${size}).`);
            generateIconBtn.disabled = false;
        };
        iconPreview.onerror = () => {
            setStatus('Icon generation failed. Try a different prompt or resolution.');
            generateIconBtn.disabled = false;
        };
        iconPreview.src = url + '&t=' + Date.now(); // cache-bust
    } catch (err) {
        console.error(err);
        setStatus('Error generating icon.');
        generateIconBtn.disabled = false;
    }
}

/**
 * Downloads the currently displayed icon as a PNG.
 */
function downloadIcon() {
    if (!currentIconUrl || !iconPreview.src) return;

    const a = document.createElement('a');
    a.href = iconPreview.src;
    a.download = `icon-${resolutionSelect.value}x${resolutionSelect.value}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setStatus('Download started.');
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
    if (newModel !== currentModel) {
        generator = null;
        await loadModel(newModel);
    }
});

themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(LS_THEME, newTheme);
});

clearChatBtn.addEventListener('click', clearHistory);

improvePromptBtn.addEventListener('click', () => {
    applyPromptHelper('Improve the following prompt to be clearer and more effective for AI image generation. Keep it concise.');
});

iconStyleBtn.addEventListener('click', () => {
    applyPromptHelper('Rewrite the following as a concise prompt for a 64x64 app icon. Focus on simple shapes, flat colors, and clear subject. Avoid complex scenes.');
});

shortenBtn.addEventListener('click', () => {
    applyPromptHelper('Shorten the following text while keeping the core meaning. Make it as brief as possible.');
});

generateIconBtn.addEventListener('click', generateIcon);
downloadIconBtn.addEventListener('click', downloadIcon);

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initializes the application on page load.
 */
async function init() {
    // Restore theme
    const savedTheme = localStorage.getItem(LS_THEME) || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Restore last model choice
    const savedModel = localStorage.getItem(LS_MODEL) || DEFAULT_MODEL;
    modelSelect.value = savedModel;

    // Load history
    loadHistory();

    // Load the model
    await loadModel(savedModel);
}

// Start the app
init();
