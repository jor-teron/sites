/**
 * Live Subtitle for Assam — app.js
 * Version: 0.11
 * First release: 27 Sep 2026
 * Last edit: 27 Sep 2026
 * Credit: personal project (Karbi Anglong / Assam)
 *
 * Flow:
 *   index.html loads config.js then this file.
 *   startSession() opens the mic + Transcribe Live WebSocket.
 *   handleServerMessage() turns speech into caption rows (addCaptionBlock).
 *   translateLine() fills the Output box when Output is not Off.
 *
 * Does not name the cloud vendor in the UI.
 */

/* localStorage key name for the API key */
const STORAGE_KEY_NAME = "lsa_gemini_api_key_v01";

/* Live WebSocket endpoint (transcribe + optional translate) */
const WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

/* Speech model for Input captions */
const MODEL_NAME = "gemini-3.5-transcribe-live";

/* Output dropdown value → language name for the translate prompt */
const OUTPUT_LANG_NAME = {
  en: "English",
  hi: "Hindi",
  as: "Assamese",
};

/* Target sample rate required by live transcription */
const TARGET_SAMPLE_RATE = 16000;

/* PCM chunk size in samples (~100 ms at 16 kHz) */
const PCM_CHUNK_SAMPLES = 1600;

/* Values from config.js */
const CONFIG = Object.assign(
  {
    WORD_SPLIT: 25,
    SPLIT_SECONDS: 4,
    AUTO_START: true,
    TRANSCRIBE_MODEL: "gemini-3.5-transcribe-live",
    TRANSLATE_MODEL: "gemini-3.5-live-translate-preview",
    SPEAKER: false,
    VOCAB_URL: "vocab.csv",
    OUTPUT_ENGINE: "chat",
    MODELS: [
      { id: "gemini-3.1-flash-lite", provider: "google", rpm: 15, on: true },
      { id: "gemini-3.5-flash-lite", provider: "google", rpm: 15, on: true },
    ],
  },
  window.LSA_CONFIG || {}
);
if (!CONFIG.MODELS) {
  CONFIG.MODELS = [
    { id: "gemini-3.1-flash-lite", provider: "google", rpm: 15, on: true },
    { id: "gemini-3.5-flash-lite", provider: "google", rpm: 15, on: true },
  ];
}

/* Rolling timestamps of chat translate calls */
let modelHits = [];

/* Spoken text waiting for word or time split */
let pendingText = "";
let pendingSince = 0;

/* Bias phrases loaded from VOCAB_FILES */
let CUSTOM_VOCAB = [];

/* Pinned chat model id or "auto" */
let pinnedModel = "auto";

const RPD_STORE = "lsa_rpd_utc_v1";
/* Hour logs: lsa_hour_YYYY-MM-DD_HH (IST) */
const HOUR_PREFIX = "lsa_hour_";
let translateQueue = [];
let translateTimer = null;
let lastTeeSlot = "";

/* Input language: auto or BCP-47 */
let selectedLang = "auto";

/* Output target: off | en | hi | as */
let translateTarget = "off";

/* ABC romanize */
let abcOn = false;

/* Session flags */
let isRunning = false;
let socket = null;
let translateSocket = null;
let translateReady = false;
let mediaStream = null;
/* Always-on meter mic (not tied to Transcribe Start/Stop) */
let meterStream = null;
let meterCtx = null;
let meterAnalyser = null;
let meterRaf = 0;
let audioContext = null;
let processorNode = null;
let sourceNode = null;
let silentGain = null;
let pcmLeftover = new Int16Array(0);
let sessionReady = false;

/* DOM */
const apiKeyInput = document.getElementById("apiKey");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const clearKeyBtn = document.getElementById("clearKeyBtn");
const keyToggleBtn = document.getElementById("keyToggleBtn");
const keyPanel = document.getElementById("keyPanel");
const listenSelect = document.getElementById("listenSelect");
const abcSelect = document.getElementById("abcSelect");
const translateSelect = document.getElementById("translateSelect");
const toggleBtn = document.getElementById("toggleBtn");
const interimTextEl = document.getElementById("interimText");
const lineList = document.getElementById("lineList");
const statusEl = document.getElementById("status");
const liveNoteEl = document.getElementById("liveNote");
const ledEl = document.getElementById("led");
const copyBtn = document.getElementById("copyBtn");
const clearTextBtn = document.getElementById("clearTextBtn");
const captionBox = document.getElementById("captionBox");
const micFill = document.getElementById("micFill");
const rpdNote = document.getElementById("rpdNote");
const modelSelect = document.getElementById("modelSelect");
const logBtn = document.getElementById("logBtn");
const logPanel = document.getElementById("logPanel");
const logList = document.getElementById("logList");
const logView = document.getElementById("logView");
const logUsed = document.getElementById("logUsed");
const logDownloadAllBtn = document.getElementById("logDownloadAllBtn");

/**
 * Status + LED text.
 */
function setStatus(message, kind) {
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }
  if (kind === "bad" && liveNoteEl) {
    liveNoteEl.textContent = message;
    liveNoteEl.className = "";
  }
}

/**
 * Start/Stop button and LED.
 */
function setToggleUi(running) {
  isRunning = running;
  if (toggleBtn) {
    toggleBtn.textContent = running ? "Stop" : "Start";
    toggleBtn.className = running ? "danger" : "primary";
  }
  if (ledEl) ledEl.className = running ? "on" : "";
  /* Listening text removed — LED colour is the session flag */
}

/**
 * Newest lines stay at the top.
 */
function scrollCaptionsToTop() {
  if (captionBox) captionBox.scrollTop = 0;
}

/**
 * Grow a textarea to fit text.
 */
function fitTextarea(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

/**
 * True if Devanagari or Bengali/Assamese letters exist.
 */
function hasIndicScript(text) {
  return /[\u0900-\u097F\u0980-\u09FF]/.test(text);
}

/**
 * Local romanizer. No API.
 */
function romanizeIndic(text) {
  const INDEP = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo",
    "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऋ": "ri",
    "অ": "o", "আ": "a", "ই": "i", "ঈ": "ee", "উ": "u", "ঊ": "oo",
    "এ": "e", "ঐ": "oi", "ও": "o", "ঔ": "ou", "ঋ": "ri",
  };
  const MATRA = {
    "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo",
    "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri",
    "া": "a", "ি": "i", "ী": "ee", "ু": "u", "ূ": "oo",
    "ে": "e", "ৈ": "oi", "ো": "o", "ৌ": "ou", "ৃ": "ri",
  };
  const CONS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
    "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "व": "v",
    "श": "sh", "ष": "sh", "स": "s", "ह": "h",
    "ক": "k", "খ": "kh", "গ": "g", "ঘ": "gh", "ঙ": "ng",
    "চ": "ch", "ছ": "chh", "জ": "j", "ঝ": "jh", "ঞ": "ny",
    "ট": "t", "ঠ": "th", "ড": "d", "ঢ": "dh", "ণ": "n",
    "ত": "t", "থ": "th", "দ": "d", "ধ": "dh", "ন": "n",
    "প": "p", "ফ": "ph", "ব": "b", "ভ": "bh", "ম": "m",
    "য": "y", "র": "r", "ল": "l", "ৱ": "w", "ৰ": "r",
    "শ": "sh", "ষ": "sh", "স": "s", "হ": "h", "য়": "y",
  };
  const VIRAMA = /[्্]/;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (INDEP[ch]) {
      out += INDEP[ch];
      continue;
    }
    if (CONS[ch]) {
      out += CONS[ch];
      const next = text[i + 1] || "";
      if (VIRAMA.test(next)) {
        i += 1;
      } else if (MATRA[next]) {
        out += MATRA[next];
        i += 1;
      } else {
        out += "a";
      }
      continue;
    }
    if (ch === "ं" || ch === "ঁ" || ch === "ং") {
      out += "n";
      continue;
    }
    if (ch === "ः" || ch === "ঃ") {
      out += "h";
      continue;
    }
    if (ch === "।") {
      out += ".";
      continue;
    }
    if (MATRA[ch] || VIRAMA.test(ch)) continue;
    out += ch;
  }
  return out;
}

/**
 * Split on punctuation then word limit.
 */
function splitSentences(text) {
  const raw = String(text || "").split(/([.?!।])/);
  const rebuilt = [];
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i];
    if (!cur) continue;
    if (/^[.?!।]$/.test(cur) && rebuilt.length) rebuilt[rebuilt.length - 1] += cur;
    else rebuilt.push(cur);
  }
  const out = [];
  const limit = CONFIG.WORD_SPLIT || 25;
  for (let i = 0; i < rebuilt.length; i++) {
    const piece = rebuilt[i].trim();
    if (!piece) continue;
    const words = piece.split(/\s+/);
    if (words.length <= limit) out.push(piece);
    else {
      for (let w = 0; w < words.length; w += limit) {
        out.push(words.slice(w, w + limit).join(" "));
      }
    }
  }
  return out.length ? out : [String(text || "").trim()].filter(Boolean);
}

/**
 * First On model still under RPM this minute.
 */
function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Load RPD counts from localStorage. Resets if the UTC day changed.
 * Store shape: { day, counts: { modelId: number } }
 * Connects to: rpdCount, bumpRpd, writeRpd
 */
function readRpd() {
  let data = { day: utcDay(), counts: {} };
  try {
    const raw = localStorage.getItem(RPD_STORE);
    if (raw) data = JSON.parse(raw);
  } catch (err) {}
  if (data.day !== utcDay()) data = { day: utcDay(), counts: {} };
  return data;
}

/**
 * Persist RPD object to localStorage key RPD_STORE.
 * Connects to: bumpRpd
 */
function writeRpd(data) {
  localStorage.setItem(RPD_STORE, JSON.stringify(data));
}

/**
 * Today's call count for one model id.
 * Connects to: pickChatModel, renderRpd
 */
function rpdCount(id) {
  const data = readRpd();
  return data.counts[id] || 0;
}

/**
 * Add one to today's count for a model, then refresh the bar.
 * Called from translateLine() after a chat request is sent.
 */
function bumpRpd(id) {
  const data = readRpd();
  data.counts[id] = (data.counts[id] || 0) + 1;
  writeRpd(data);
  renderRpd();
}

/**
 * Draw "3.5 Lite 12/500 · 3.1 Lite 3/500" into #rpdNote.
 */
function renderRpd() {
  if (!rpdNote) return;
  const bits = CONFIG.MODELS.filter(function (m) {
    return m.on;
  }).map(function (m) {
    return (m.label || m.id) + " " + rpdCount(m.id) + "/" + (m.rpd || 500);
  });
  rpdNote.textContent = bits.join(" · ");
}

/**
 * Fill #modelSelect from CONFIG.MODELS that are On, plus Auto.
 * Connects to: onModelChange, boot block at bottom
 */
function fillModelSelect() {
  if (!modelSelect) return;
  modelSelect.innerHTML = "";
  const auto = document.createElement("option");
  auto.value = "auto";
  auto.textContent = "Auto";
  modelSelect.appendChild(auto);
  CONFIG.MODELS.forEach(function (m) {
    if (!m.on) return;
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label || m.id;
    modelSelect.appendChild(opt);
  });
  pinnedModel = CONFIG.PINNED_MODEL || "auto";
  modelSelect.value = pinnedModel;
}

/**
 * Model dropdown changed. Sets pinnedModel for pickChatModel().
 */
function onModelChange() {
  pinnedModel = modelSelect.value;
}

/**
 * RMS of a float PCM frame → #micFill width 0–100%.
 * Called from startSession() onaudioprocess.
 */
function setMicLevel(samples) {
  if (!micFill || !samples || !samples.length) return;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / samples.length);
  let pct = Math.min(100, Math.round(rms * 140));
  micFill.style.width = pct + "%";
}

/**
 * Mic loudness loop that stays on after Stop.
 * Does not open Transcribe Live. Connects to setMicLevel.
 */
async function startMeter() {
  if (meterAnalyser) return;
  try {
    if (!meterStream) {
      meterStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    }
    meterCtx = new AudioContext();
    const src = meterCtx.createMediaStreamSource(meterStream);
    meterAnalyser = meterCtx.createAnalyser();
    meterAnalyser.fftSize = 512;
    src.connect(meterAnalyser);
    const buf = new Uint8Array(meterAnalyser.fftSize);
    function tick() {
      if (!meterAnalyser) return;
      meterAnalyser.getByteTimeDomainData(buf);
      const floats = new Float32Array(buf.length);
      for (let i = 0; i < buf.length; i++) floats[i] = (buf[i] - 128) / 128;
      setMicLevel(floats);
      meterRaf = requestAnimationFrame(tick);
    }
    tick();
  } catch (err) {
    setStatus("Mic permission denied.", "bad");
  }
}

/**
 * Next On model under RPM (60s window in modelHits) and RPD (UTC day).
 * Honours pinnedModel when not "auto".
 * Connects to: translateLine
 */
function pickChatModel() {
  const now = Date.now();
  let list = CONFIG.MODELS.filter(function (m) {
    return m.on;
  });
  if (pinnedModel && pinnedModel !== "auto") {
    list = list.filter(function (m) {
      return m.id === pinnedModel;
    });
  }
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (rpdCount(m.id) >= (m.rpd || 500)) continue;
    let n = 0;
    for (let h = 0; h < modelHits.length; h++) {
      if (modelHits[h].id === m.id && now - modelHits[h].t < 60000) n++;
    }
    if (n < (m.rpm || 15)) return m;
  }
  return null;
}

/**
 * One caption block at the top.
 */
function addCaptionBlock(sourceText) {
  const wrap = document.createElement("div");
  wrap.className = "line";
  const orig = document.createElement("textarea");
  orig.className = "orig-line";
  orig.rows = 1;
  orig.value = sourceText || "";
  orig.addEventListener("input", function () {
    fitTextarea(orig);
  });
  wrap.appendChild(orig);
  if (abcOn && sourceText) {
    const abcBox = document.createElement("textarea");
    abcBox.className = "abc-line";
    abcBox.rows = 1;
    abcBox.value = hasIndicScript(sourceText)
      ? romanizeIndic(sourceText) || sourceText
      : sourceText;
    abcBox.addEventListener("input", function () {
      fitTextarea(abcBox);
    });
    wrap.appendChild(abcBox);
    fitTextarea(abcBox);
  }
  let outBox = null;
  if (translateTarget !== "off") {
    outBox = document.createElement("textarea");
    outBox.className = "out-line";
    outBox.rows = 1;
    outBox.value = "";
    outBox.addEventListener("input", function () {
      fitTextarea(outBox);
    });
    wrap.appendChild(outBox);
  }
  lineList.insertBefore(wrap, lineList.firstChild);
  fitTextarea(orig);
  scrollCaptionsToTop();
  return outBox;
}

/**
 * Push spoken text into blocks.
 */

/**
 * Current instant in Asia/Kolkata for stamps and hour keys.
 */
function istNow() {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = {};
  fmt.formatToParts(new Date()).forEach(function (x) {
    parts[x.type] = x.value;
  });
  return parts;
}

function hourKeyFromParts(p) {
  return HOUR_PREFIX + p.year + "-" + p.month + "-" + p.day + "_" + p.hour;
}

function stampFromParts(p) {
  return p.year + "-" + p.month + "-" + p.day + " " + p.hour + ":" + p.minute + ":" + p.second + " IST";
}

function listHourKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.indexOf(HOUR_PREFIX) === 0) keys.push(k);
  }
  keys.sort();
  keys.reverse();
  return keys;
}

function storageUsedBytes() {
  let n = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    n += k.length + (localStorage.getItem(k) || "").length;
  }
  return n;
}

/**
 * Append one caption (and optional translation) to this IST hour bucket.
 */
function appendHourLog(sourceText, transText) {
  const p = istNow();
  const key = hourKeyFromParts(p);
  let body = localStorage.getItem(key) || "";
  body += stampFromParts(p) + "\n" + sourceText;
  if (transText) body += "\n" + transText;
  body += "\n\n";
  try {
    localStorage.setItem(key, body);
  } catch (err) {
    setStatus("Log storage full. Download logs.", "bad");
  }
  renderLogList();
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(a.href);
  }, 500);
}

function renderLogList() {
  if (!logList) return;
  logList.innerHTML = "";
  if (logUsed) {
    const kb = Math.round(storageUsedBytes() / 1024);
    logUsed.textContent = "Storage ~" + kb + " KB / 5000 KB";
  }
  listHourKeys().forEach(function (key) {
    const label = key.replace(HOUR_PREFIX, "").replace("_", " ") + ":00";
    const row = document.createElement("div");
    row.className = "log-row";
    const name = document.createElement("span");
    name.textContent = label;
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.textContent = "View";
    viewBtn.onclick = function () {
      if (logView) logView.value = localStorage.getItem(key) || "";
    };
    const dlBtn = document.createElement("button");
    dlBtn.type = "button";
    dlBtn.textContent = "Download";
    dlBtn.onclick = function () {
      downloadText(key.replace(HOUR_PREFIX, "lsa-") + ".txt", localStorage.getItem(key) || "");
    };
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.onclick = function () {
      localStorage.removeItem(key);
      renderLogList();
      if (logView) logView.value = "";
    };
    row.appendChild(name);
    row.appendChild(viewBtn);
    row.appendChild(dlBtn);
    row.appendChild(delBtn);
    logList.appendChild(row);
  });
}

function toggleLogPanel() {
  if (!logPanel) return;
  logPanel.classList.toggle("open");
  if (logPanel.classList.contains("open")) renderLogList();
}

function downloadAllAndClear() {
  const keys = listHourKeys();
  if (!keys.length) {
    setStatus("No logs.", "bad");
    return;
  }
  if (!confirm("Download all hour logs as one txt, then delete them?")) return;
  let all = "";
  keys.slice().reverse().forEach(function (key) {
    all += "===== " + key.replace(HOUR_PREFIX, "") + " =====\n";
    all += localStorage.getItem(key) || "";
    all += "\n";
  });
  const p = istNow();
  downloadText("lsa-all-" + p.year + "-" + p.month + "-" + p.day + ".txt", all);
  keys.forEach(function (key) {
    localStorage.removeItem(key);
  });
  renderLogList();
  if (logView) logView.value = "";
}

/**
 * Clock slot id for 5-minute tee (HH:00 HH:05 ...).
 */
function teeSlotId() {
  const p = istNow();
  const m = String(Math.floor(Number(p.minute) / 5) * 5).padStart(2, "0");
  return p.year + "-" + p.month + "-" + p.day + "_" + p.hour + ":" + m;
}

function tickTee() {
  const slot = teeSlotId();
  if (slot === lastTeeSlot) return;
  lastTeeSlot = slot;
  renderLogList();
}

function queueTranslate(text, outBox) {
  if (translateTarget === "off" || !outBox || !text) return;
  translateQueue.push({ text: text, outBox: outBox });
  const wait = (CONFIG.TRANSLATE_SECONDS || 5) * 1000;
  if (!translateTimer) {
    translateTimer = setTimeout(flushTranslateQueue, wait);
  }
}

async function flushTranslateQueue() {
  translateTimer = null;
  const batch = translateQueue.splice(0);
  if (!batch.length) return;
  const joined = batch.map(function (b) { return b.text; }).join("\n");
  const last = batch[batch.length - 1];
  await translateLine(joined, last.outBox);
  if (last.outBox && last.outBox.value) {
    appendHourLog("(batch output)", last.outBox.value);
  }
}

function commitSpokenText(text) {
  const piece = (text || "").trim();
  if (!piece) return;
  const bits = splitSentences(piece);
  for (let i = bits.length - 1; i >= 0; i--) {
    const outBox = addCaptionBlock(bits[i]);
    queueTranslate(bits[i], outBox);
    appendHourLog(bits[i], "");
  }
  pendingText = "";
  pendingSince = 0;
}

/**
 * Copy visible text.
 */
async function copyCaptions() {
  const blocks = lineList.querySelectorAll(".line");
  const chunks = [];
  for (let i = 0; i < blocks.length; i++) {
    const areas = blocks[i].querySelectorAll("textarea");
    const bits = [];
    for (let j = 0; j < areas.length; j++) {
      const t = areas[j].value.trim();
      if (t) bits.push(t);
    }
    if (bits.length) chunks.push(bits.join("\n"));
  }
  const blob = chunks.join("\n\n");
  if (!blob) {
    setStatus("Nothing to copy.", "bad");
    return;
  }
  try {
    await navigator.clipboard.writeText(blob);
    if (liveNoteEl) liveNoteEl.textContent = "Copied";
  } catch (err) {
    setStatus("Copy failed.", "bad");
  }
}

/**
 * Clear lines only.
 */
function clearCaptionText() {
  lineList.innerHTML = "";
  interimTextEl.textContent = "";
  if (liveNoteEl && isRunning) {
    liveNoteEl.textContent = "Listening..";
    liveNoteEl.className = "on";
  }
}

/**
 * Put the saved API key into #apiKey. Uses STORAGE_KEY_NAME.
 */
function loadSavedKey() {
  const saved = localStorage.getItem(STORAGE_KEY_NAME);
  if (saved) apiKeyInput.value = saved;
}

/**
 * Save #apiKey to localStorage. Used by the Key panel Save button.
 */
function saveKey() {
  const value = apiKeyInput.value.trim();
  if (!value) {
    setStatus("Paste a key first.", "bad");
    return;
  }
  localStorage.setItem(STORAGE_KEY_NAME, value);
  setStatus("Key saved on this device.", "ok");
  keyPanel.classList.remove("open");
}

/**
 * Remove the saved API key from this browser.
 */
function clearKey() {
  localStorage.removeItem(STORAGE_KEY_NAME);
  apiKeyInput.value = "";
  setStatus("Key cleared.");
}

/**
 * Show or hide the Key row under the top bar.
 */
function toggleKeyPanel() {
  keyPanel.classList.toggle("open");
}

/**
 * Input language changed. Restarts the live session if one is running.
 */
function onListenChange() {
  selectedLang = listenSelect.value;
  if (isRunning) {
    stopSession().then(function () {
      startSession();
    });
  }
}

/**
 * ABC dropdown (hidden/parked). Sets abcOn for new caption rows only.
 */
function onAbcChange() {
  abcOn = abcSelect.value === "on";
}

/**
 * Output language changed. New rows use this; old rows stay as they are.
 */
function onTranslateChange() {
  translateTarget = translateSelect.value;
}

/**
 * ArrayBuffer → base64 string for Live JSON audio frames.
 * Connects to: sendPcmChunk
 */
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Float32 -1..1 samples → Int16 PCM.
 * Connects to: startSession onaudioprocess → enqueuePcm
 */
function floatToPcm16(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    let s = float32[i];
    if (s > 1) s = 1;
    if (s < -1) s = -1;
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Linear resample to 16 kHz for Transcribe Live.
 * Connects to: startSession onaudioprocess
 */
function resampleTo16k(input, fromRate) {
  if (fromRate === TARGET_SAMPLE_RATE) return input;
  const ratio = fromRate / TARGET_SAMPLE_RATE;
  const newLen = Math.floor(input.length / ratio);
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = src - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/**
 * Buffer PCM until PCM_CHUNK_SAMPLES, then sendPcmChunk.
 * Uses pcmLeftover for the remainder.
 */
function enqueuePcm(samples) {
  const merged = new Int16Array(pcmLeftover.length + samples.length);
  merged.set(pcmLeftover, 0);
  merged.set(samples, pcmLeftover.length);
  let offset = 0;
  while (offset + PCM_CHUNK_SAMPLES <= merged.length) {
    sendPcmChunk(merged.subarray(offset, offset + PCM_CHUNK_SAMPLES));
    offset += PCM_CHUNK_SAMPLES;
  }
  pcmLeftover = merged.slice(offset);
}

/**
 * One ~100 ms PCM frame on the Transcribe WebSocket.
 * Requires sessionReady (set after setupComplete or 800 ms fallback).
 */
function sendPcmChunk(pcmChunk) {
  if (!socket || socket.readyState !== WebSocket.OPEN || !sessionReady) return;
  const b64 = bufferToBase64(pcmChunk.buffer);
  socket.send(
    JSON.stringify({
      realtimeInput: {
        audio: { data: b64, mimeType: "audio/pcm;rate=16000" },
      },
    })
  );
}

/**
 * Tell the server the mic stream ended. Called from stopSession().
 */
function sendAudioStreamEnd() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
}

/**
 * Chat translate using the next model under its RPM.
 */
async function translateLine(sourceText, outBox) {
  if (translateTarget === "off" || !outBox || !sourceText) return;
  if (CONFIG.OUTPUT_ENGINE === "live") return;
  const googleKey =
    apiKeyInput.value.trim() || (CONFIG.KEYS && CONFIG.KEYS.google) || "";
  const model = pickChatModel();
  if (!model) {
    setStatus("All chat models at RPM cap. Wait.", "bad");
    return;
  }
  const langName = OUTPUT_LANG_NAME[translateTarget] || "English";
  const prompt =
    "Translate into " + langName + ". Return only the translation.\n\n" + sourceText;
  modelHits.push({ id: model.id, t: Date.now() });
  bumpRpd(model.id);
  try {
    if (model.provider !== "google") {
      setStatus("Turn that provider on and add KEYS in config.js", "bad");
      return;
    }
    if (!googleKey) return;
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        model.id +
        ":generateContent?key=" +
        encodeURIComponent(googleKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data = await res.json();
    const textOut =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;
    if (textOut) {
      outBox.value = textOut.trim();
      fitTextarea(outBox);
    } else if (data && data.error) {
      setStatus(data.error.message || "Translate failed", "bad");
    }
  } catch (err) {
    setStatus("Translate failed.", "bad");
  }
}

/**
 * Parse one Transcribe Live JSON object.
 * setupComplete → sessionReady
 * interim / final text → commitSpokenText when word or time split hits
 * Connects to: onSocketMessage
 */
function handleServerMessage(msg) {
  if (msg.setupComplete) {
    sessionReady = true;
    setStatus("Listening", "ok");
    return;
  }
  if (msg.error) {
    setStatus(msg.error.message || JSON.stringify(msg.error), "bad");
    return;
  }
  const content = msg.serverContent;
  if (!content) return;
  if (content.interimInputTranscription && content.interimInputTranscription.text) {
    const live = content.interimInputTranscription.text.trim();
    interimTextEl.textContent = live;
    pendingText = live;
    if (!pendingSince) pendingSince = Date.now();
    const words = live.split(/\s+/).filter(Boolean).length;
    const aged = Date.now() - pendingSince >= (CONFIG.SPLIT_SECONDS || 4) * 1000;
    if (words >= (CONFIG.WORD_SPLIT || 25) || aged) {
      commitSpokenText(live);
      interimTextEl.textContent = "";
    }
  }
  if (content.inputTranscription && content.inputTranscription.text) {
    commitSpokenText(content.inputTranscription.text.trim());
    interimTextEl.textContent = "";
  }
}

/**
 * WebSocket onmessage: Blob/text → JSON → handleServerMessage.
 */
async function onSocketMessage(event) {
  let raw = event.data;
  if (raw instanceof Blob) raw = await raw.text();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return;
  }
  handleServerMessage(parsed);
}

/**
 * Input socket always uses Transcribe Live — not Live Translate.
 */
function sendSetup() {
  socket.send(
    JSON.stringify({
      setup: {
        model: "models/" + (CONFIG.TRANSCRIBE_MODEL || MODEL_NAME),
        generationConfig: { responseModalities: ["TEXT"] },
        inputAudioTranscription: {
          languageCodes: selectedLang === "auto" ? [] : [selectedLang],
          customVocabulary: CUSTOM_VOCAB,
          mode: "SMART",
        },
      },
    })
  );
}

/**
 * Mic + AudioContext + Transcribe Live socket.
 * Connects to: sendSetup, onSocketMessage, setMicLevel, enqueuePcm
 */
async function startSession() {
  if (socket && socket.readyState === WebSocket.OPEN) return;
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    keyPanel.classList.add("open");
    setStatus("Add an API key first.", "bad");
    return;
  }
  sessionReady = false;
  pcmLeftover = new Int16Array(0);
  setToggleUi(true);
  setStatus("Connecting…");
  try {
    if (!meterStream) await startMeter();
    mediaStream = meterStream;
    if (!mediaStream) {
      setStatus("Mic permission denied.", "bad");
      setToggleUi(false);
      return;
    }
  } catch (err) {
    setStatus("Mic permission denied.", "bad");
    setToggleUi(false);
    return;
  }
  audioContext = new AudioContext();
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  processorNode = audioContext.createScriptProcessor(4096, 1, 1);
  silentGain = audioContext.createGain();
  silentGain.gain.value = 0;
  processorNode.onaudioprocess = function (ev) {
    const input = ev.inputBuffer.getChannelData(0);
    const resampled = resampleTo16k(input, audioContext.sampleRate);
    setMicLevel(resampled);
    enqueuePcm(floatToPcm16(resampled));
  };
  sourceNode.connect(processorNode);
  processorNode.connect(silentGain);
  silentGain.connect(audioContext.destination);
  socket = new WebSocket(WS_BASE + "?key=" + encodeURIComponent(apiKey));
  socket.onopen = function () {
    sendSetup();
    setTimeout(function () {
      sessionReady = true;
    }, 800);
    setStatus("Connected");
  };
  socket.onmessage = onSocketMessage;
  socket.onerror = function () {
    setStatus("Connection error.", "bad");
  };
  socket.onclose = function () {
    setStatus("Stopped");
    setToggleUi(false);
  };
}

/**
 * Tear down mic graph and Transcribe socket. Meter stops with the session.
 */
async function stopSession() {
  sendAudioStreamEnd();
  sessionReady = false;
  if (processorNode) {
    processorNode.disconnect();
    processorNode = null;
  }
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  if (silentGain) {
    silentGain.disconnect();
    silentGain = null;
  }
  if (audioContext) {
    await audioContext.close();
    audioContext = null;
  }
  /* Keep meterStream running so the bar still moves after Stop */
  mediaStream = null;
  if (socket) {
    try {
      socket.close();
    } catch (err) {
      /* ignore */
    }
    socket = null;
  }
  setToggleUi(false);
  setStatus("Stopped.");
}

/**
 * Start/Stop button. Toggles startSession / stopSession.
 */
function onToggleClick() {
  if (isRunning) stopSession();
  else startSession();
}

/**
 * Parse csv/text lines into CUSTOM_VOCAB (first column).
 * Connects to: loadVocabCsv
 */
function addVocabLines(text) {
  if (!text) return;
  text.split(/\r?\n/).forEach(function (line) {
    const w = line.split(",")[0].trim();
    if (!w || w.charAt(0) === "#") return;
    if (CUSTOM_VOCAB.indexOf(w) === -1) CUSTOM_VOCAB.push(w);
  });
}

/**
 * Fetch CONFIG.VOCAB_FILES and merge names into CUSTOM_VOCAB for sendSetup().
 */
function loadVocabCsv() {
  const files = CONFIG.VOCAB_FILES || (CONFIG.VOCAB_URL ? [CONFIG.VOCAB_URL] : []);
  files.forEach(function (file) {
    fetch(file)
      .then(function (res) {
        return res.ok ? res.text() : "";
      })
      .then(addVocabLines)
      .catch(function () {});
  });
}

saveKeyBtn.addEventListener("click", saveKey);
clearKeyBtn.addEventListener("click", clearKey);
keyToggleBtn.addEventListener("click", toggleKeyPanel);
listenSelect.addEventListener("change", onListenChange);
abcSelect.addEventListener("change", onAbcChange);
translateSelect.addEventListener("change", onTranslateChange);
if (modelSelect) modelSelect.addEventListener("change", onModelChange);
toggleBtn.addEventListener("click", onToggleClick);
copyBtn.addEventListener("click", copyCaptions);
clearTextBtn.addEventListener("click", clearCaptionText);
if (logBtn) logBtn.addEventListener("click", toggleLogPanel);
if (logDownloadAllBtn) logDownloadAllBtn.addEventListener("click", downloadAllAndClear);

loadSavedKey();
loadVocabCsv();
fillModelSelect();
renderRpd();
renderLogList();
setInterval(tickTee, 15000);
startMeter();
if (CONFIG.AUTO_START) startSession();
