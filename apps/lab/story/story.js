/*
  File: story.js
  Project: story
  Description: Main JavaScript for the Story webapp
  Handles: Model loading, streaming chat, persistence, t/s, history cleanup
  Lite uses local fallback. Mini and Pro load real models in background.
  New messages appear at top of chat.
  Author: Grok
  Date: 2026-10-17
*/

// Constants for model identifiers
const MODEL_MINI = "phmd/TinyStories-LSTM-5.5M";
const MODEL_PRO = "onnx-community/IllaryiaStories-1M-ONNX";

// Constants for storage
const DB_NAME = "story-db";
const HISTORY_STORE = "chat-history";
const HISTORY_DAYS = 30;

// Global state
let currentPipeline = null;
let currentModel = "lite";
let isGenerating = false;
let db = null;

// DOM elements
const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const statusEl = document.getElementById("status");

/**
 * Simple local fallback for Lite mode
 * @param {string} prompt
 * @returns {string}
 */
function generateLiteFallback(prompt) {
  const starters = [
    "Once upon a time, ",
    "In a small village, ",
    "There was a curious child named Lily who ",
    "One sunny day, "
  ];
  const endings = [
    " and they all lived happily ever after.",
    " The end.",
    " And that was the beginning of a great adventure.",
    " Lily smiled and continued on her way."
  ];
  const starter = starters[Math.floor(Math.random() * starters.length)];
  const ending = endings[Math.floor(Math.random() * endings.length)];
  return starter + prompt.trim() + ending;
}

/**
 * Initialize IndexedDB
 */
async function initDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(HISTORY_STORE)) {
        database.createObjectStore(HISTORY_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
  });
}

/**
 * Save message to IndexedDB
 * @param {string} role
 * @param {string} content
 */
function saveMessage(role, content) {
  if (!db) return;
  const tx = db.transaction(HISTORY_STORE, "readwrite");
  tx.objectStore(HISTORY_STORE).add({
    role,
    content,
    timestamp: Date.now()
  });
}

/**
 * Load and clean history
 */
async function loadHistory() {
  if (!db) return;
  const tx = db.transaction(HISTORY_STORE, "readonly");
  const request = tx.objectStore(HISTORY_STORE).getAll();
  request.onsuccess = () => {
    const cutoff = Date.now() - (HISTORY_DAYS * 24 * 60 * 60 * 1000);
    const valid = request.result.filter(m => m.timestamp > cutoff);
    // Clean old
    const txW = db.transaction(HISTORY_STORE, "readwrite");
    const store = txW.objectStore(HISTORY_STORE);
    request.result.forEach(m => {
      if (m.timestamp <= cutoff) store.delete(m.id);
    });
    // Show oldest first so newest ends at bottom
    valid.forEach(m => appendMessage(m.role, m.content, false));
  };
}

/**
 * Append message - new cards at top
 * @param {string} role
 * @param {string} content
 * @param {boolean} save
 */
function appendMessage(role, content, save = true) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = content;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  if (save) saveMessage(role, content);
}

/**
 * Set status text
 * @param {string} text
 */
function setStatus(text) {
  statusEl.textContent = text;
}

/**
 * Load model with Transformers.js
 * @param {string} modelId
 * @param {string} label
 */
async function loadModel(modelId, label) {
  setStatus(`Loading ${label}...`);
  try {
    const { pipeline } = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0");
    const pipe = await pipeline("text-generation", modelId, {
      progress_callback: (p) => {
        if (p.status === "progress") {
          setStatus(`Loading ${label}... ${Math.round(p.progress || 0)}%`);
        }
      }
    });
    setStatus(`${label} ready`);
    return pipe;
  } catch (e) {
    console.error(e);
    setStatus(`${label} failed`);
    return null;
  }
}

/**
 * Generate reply
 * @param {string} prompt
 */
async function generate(prompt) {
  if (isGenerating) return;
  isGenerating = true;
  sendBtn.disabled = true;

  appendMessage("user", prompt);

  const botDiv = document.createElement("div");
  botDiv.className = "message bot";
  botDiv.textContent = "…";
  chatEl.appendChild(botDiv);
  chatEl.scrollTop = chatEl.scrollHeight;

  if (currentModel === "lite" || !currentPipeline) {
    const text = generateLiteFallback(prompt);
    botDiv.textContent = text;
    saveMessage("bot", text);
  } else {
    const start = performance.now();
    let count = 0;
    let full = "";
    try {
      const output = await currentPipeline(prompt, {
        max_new_tokens: 500,
        temperature: 0.8,
        do_sample: true,
        callback_function: (toks) => {
          count++;
          if (Array.isArray(toks)) {
            full = toks.map(t => (t && t.token) ? t.token : String(t)).join("");
          } else {
            full = String(toks);
          }
          botDiv.textContent = full || "…";
          chatEl.scrollTop = chatEl.scrollHeight;
          const sec = (performance.now() - start) / 1000;
          if (sec > 0.5) {
            setStatus(currentModel + " · " + (count / sec).toFixed(1) + " t/s");
          }
        }
      });
      const finalText = full || (output && output[0] && output[0].generated_text) || botDiv.textContent;
      botDiv.textContent = finalText;
      saveMessage("bot", finalText);
    } catch (err) {
      console.error("Generation error:", err);
      botDiv.textContent = "Model error. Switch to Lite or try again.";
    }
  }

  isGenerating = false;
  sendBtn.disabled = false;
  setStatus(currentModel.charAt(0).toUpperCase() + currentModel.slice(1) + " ready");
}

/**
 * Handle send
 */
function handleSend() {
  const text = inputEl.value.trim();
  if (!text || isGenerating) return;
  inputEl.value = "";
  generate(text);
}

/**
 * Init app - Lite default only
 */
async function init() {
  await initDB();
  await loadHistory();

  setStatus("Lite ready (default)");
  currentModel = "lite";

  // Mini in background
  setTimeout(async () => {
    const pipe = await loadModel(MODEL_MINI, "Mini");
    if (pipe) {
      document.getElementById("btn-mini").disabled = false;
      window.miniPipeline = pipe;
      setStatus("Mini ready");
    }
  }, 2000);

  // Pro in background
  setTimeout(async () => {
    const pipe = await loadModel(MODEL_PRO, "Pro");
    if (pipe) {
      document.getElementById("btn-pro").disabled = false;
      window.proPipeline = pipe;
      setStatus("Pro ready");
    }
  }, 5000);

  sendBtn.addEventListener("click", handleSend);
  inputEl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleSend();
  });

  document.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      document.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentModel = btn.dataset.model;
      if (currentModel === "lite") {
        currentPipeline = null;
        setStatus("Lite ready");
      } else if (currentModel === "mini" && window.miniPipeline) {
        currentPipeline = window.miniPipeline;
        setStatus("Mini ready");
      } else if (currentModel === "pro" && window.proPipeline) {
        currentPipeline = window.proPipeline;
        setStatus("Pro ready");
      } else {
        setStatus("Model not loaded yet");
      }
    });
  });
}

init();
